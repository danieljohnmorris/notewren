import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Menu } from '@tauri-apps/api/menu';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { ArrowLeft, GitBranch, History, Moon, Pencil, Plus, RefreshCw, Search, Settings2, Sun } from 'lucide-react';
import { bridge, type Branch, type Note, type Revision, type Settings, type SyncStatus } from './bridge';
import { MarkdownEditor } from '../../../src/components/MarkdownEditor';
import { BranchGraph, type NoteBranch } from './components/BranchGraph';
import { Logo } from './components/Logo';

type Panel = 'branches' | 'history' | 'settings' | null;
const sameContent = (a: Note, b: Note) => a.title === b.title && a.body === b.body;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [graph, setGraph] = useState<NoteBranch[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [inspected, setInspected] = useState<Revision | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const contextMenu = useRef<Menu | null>(null);
  useEffect(() => () => { void contextMenu.current?.close(); }, []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState('Opening library…');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [ready, setReady] = useState(false);
  const draft = useRef<Note | null>(null);
  const saved = useRef<Note | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);
  const syncJob = useRef<Promise<void> | null>(null);
  const locked = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const selections = useRef<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const editorButton = useRef<HTMLButtonElement>(null);
  const actions = useRef({ flush, exit, newNote });
  actions.current = { flush, exit, newNote };

  function showError(cause: unknown) { setError(errorText(cause)); }
  async function install(note: Note) {
    await bridge.setSelection(note.id, note.branch_id);
    selections.current[note.id] = note.branch_id;
    draft.current = note;
    saved.current = note;
    setActive(note);
    setNotes((list) => list.map((item) => item.id === note.id ? note : item));
    setEditorKey((key) => key + 1);
    setSaveState('Saved on this Mac');
    setRemoteChanged(false);
    setHistorical(false);
    setInspected(null);
  }
  async function preferredNotes() {
    const list = await bridge.listNotes();
    return Promise.all(list.map(async (note) => {
      const branchId = selections.current[note.id];
      if (!branchId || branchId === note.branch_id) return note;
      const available = await bridge.branches(note.id);
      if (!available.some((branch) => branch.id === branchId && !branch.archived)) {
        setNotice('A previously selected branch is no longer active. Its stored revisions have been retained.');
        return note;
      }
      return bridge.getNote(note.id, branchId);
    }));
  }
  async function refreshList() { setNotes(await preferredNotes()); }
  async function refreshBranches(note: Note) {
    const list = await bridge.branches(note.id);
    const histories = await Promise.all(list.map((branch) => bridge.history(note.id, branch.id)));
    const all = new Map(histories.flat().map((revision) => [revision.id, revision]));
    const graphBranches = list.map((branch, index): NoteBranch => {
      const head = all.get(branch.head_revision_id);
      const origin = histories[index].find((revision) => revision.branch_id === branch.id &&
        !revision.parents.some((parent) => all.get(parent)?.branch_id === branch.id));
      const parent = origin?.parents.map((id) => all.get(id)).find((revision) => revision && revision.branch_id !== branch.id);
      const baseline = parent ?? origin ?? head;
      if (!head || !baseline) throw new Error(`Missing revision history for ${branch.name}. Your editor has not changed.`);
      return { id: branch.id, name: branch.name, parentId: parent?.branch_id ?? null, title: head.title,
        body: head.body, baseTitle: baseline.title, baseBody: baseline.body, archived: branch.archived };
    });
    if (draft.current?.id !== note.id) return;
    setBranches(list);
    setGraph(graphBranches);
    const currentIndex = list.findIndex((branch) => branch.id === draft.current?.branch_id);
    const history = currentIndex < 0 ? [] : histories[currentIndex];
    setRevisions(history);
    setInspected(history[0] ?? null);
  }

  async function flush(): Promise<void> {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (syncJob.current) await syncJob.current;
    if (pendingSave.current) return pendingSave.current;
    const work = async () => {
      while (draft.current && saved.current && !sameContent(draft.current, saved.current)) {
        const writing = draft.current;
        setSaveState('Saving…');
        let result: Note;
        try { result = await bridge.saveNote(writing); }
        catch (cause) { setSaveState('Not saved. Your draft is still open.'); showError(cause); throw cause; }
        saved.current = result;
        // The editor may have received more typing while SQLite was saving.
        const current = draft.current!;
        draft.current = { ...result, title: current.title, body: current.body };
        setActive(draft.current);
        if (result.branch_id !== writing.branch_id) {
          setHistorical(false);
          setNotice('Your changes were saved on a new branch. The newer draft is unchanged.');
          selections.current[result.id] = result.branch_id;
          await bridge.setSelection(result.id, result.branch_id);
          await refreshBranches(result);
        }
        setNotes((list) => {
          const existing = list.findIndex((note) => note.id === result.id);
          return existing < 0 ? [...list, result] : list.map((note, index) => index === existing ? result : note);
        });
      }
      setSaveState('Saved on this Mac');
      setSyncStatus(await bridge.syncStatus());
    };
    pendingSave.current = work();
    try { await pendingSave.current; }
    finally { pendingSave.current = null; }
  }

  function change(field: 'title' | 'body', value: string) {
    if (!draft.current) return;
    draft.current = { ...draft.current, [field]: value };
    setActive(draft.current);
    setSaveState('Unsaved changes');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush().catch(showError); }, 450);
  }

  async function exclusive(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try { await flush(); await action(); }
    finally { locked.current = false; setBusy(false); }
  }
  async function openNote(note: Note) {
    if (note.id === draft.current?.id && note.branch_id === draft.current.branch_id) { closePanel(); return; }
    await exclusive(async () => {
      const latest = await bridge.getNote(note.id, note.branch_id);
      await install(latest);
      setPanel(null);
      await refreshBranches(latest);
    });
  }
  async function newNote() {
    if (!ready) return;
    await exclusive(async () => {
      const note = await bridge.createNote();
      await install(note);
      setQuery('');
      setPanel(null);
      await refreshList();
      await refreshBranches(note);
    });
  }
  async function openPanel(next: Panel, create = false) {
    await exclusive(async () => {
      if (draft.current && next !== 'settings') await refreshBranches(draft.current);
      setCreatingBranch(create);
      setPanel(next);
    });
  }
  async function showNoteMenu(note: Note, x: number, y: number) {
    if (!isTauri() || busy || syncing) return;
    const open = async (next: Panel, create = false) => {
      await openNote(note);
      if (next) await openPanel(next, create);
    };
    await contextMenu.current?.close();
    const menu = await Menu.new({ items: [
      { id: 'open', text: 'Open', action: () => act(() => open(null)) },
      { id: 'branch', text: 'New branch…', action: () => act(() => open('branches', true)) },
      { id: 'branches', text: 'Branches', action: () => act(() => open('branches')) },
      { id: 'history', text: 'History', action: () => act(() => open('history')) },
    ] });
    contextMenu.current = menu;
    await menu.popup(new LogicalPosition(x, y));
  }
  function closePanel() { setPanel(null); requestAnimationFrame(() => editorButton.current?.focus()); }

  async function sync() {
    if (syncJob.current || locked.current) return;
    setError('');
    setSyncing(true);
    try {
      await flush();
      const before = saved.current;
      const work = async () => {
        const report = await bridge.sync();
        setSyncStatus(report.status);
        if (before && draft.current?.id === before.id) {
          // A conflict keeps the incoming local draft on a separate branch.
          const candidates = report.conflicts.filter((branch) => branch.note_id === before.id);
          for (const branch of candidates) {
            const preserved = await bridge.getNote(before.id, branch.id);
            if (sameContent(preserved, before)) {
              saved.current = preserved;
              draft.current = { ...preserved, title: draft.current.title, body: draft.current.body };
              setActive(draft.current);
              selections.current[preserved.id] = preserved.branch_id;
              await bridge.setSelection(preserved.id, preserved.branch_id);
              setNotice(`Your draft is preserved in ${branch.name}. Other changes are available in Branches.`);
              break;
            }
          }
          const current = draft.current;
          const latest = await bridge.getNote(current.id, current.branch_id);
          if (saved.current && sameContent(latest, saved.current)) {
            saved.current = latest;
            draft.current = { ...latest, title: draft.current.title, body: draft.current.body };
            setActive(draft.current);
          } else {
            setRemoteChanged(true);
          }
          await refreshBranches(draft.current);
        }
        await refreshList();
        if (report.conflicts.length) setNotice(`${report.conflicts.length} conflict branch${report.conflicts.length === 1 ? '' : 'es'} preserved. Open Branches to compare the drafts.`);
      };
      syncJob.current = work();
      try { await syncJob.current; }
      finally { syncJob.current = null; }
      await flush();
      setSyncStatus(await bridge.syncStatus());
    } catch (cause) { showError(cause); }
    finally { setSyncing(false); }
  }

  async function exit() {
    await exclusive(async () => { await bridge.finishExit(); });
  }
  async function recoverDraft() {
    if (locked.current || syncJob.current || !draft.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      if (pendingSave.current) {
        try { await pendingSave.current; }
        catch (cause) { setNotice(`The previous save failed: ${errorText(cause)}. Saving a separate recovery branch.`); }
      }
      const current = draft.current;
      const branch = await bridge.createBranch(current.id, current.revision_id, `Recovered draft ${crypto.randomUUID().slice(0, 8)}`);
      const base = await bridge.getNote(current.id, branch.id);
      saved.current = base;
      draft.current = { ...base, title: current.title, body: current.body };
      setActive(draft.current);
      await flush();
      await bridge.setSelection(current.id, branch.id);
      selections.current[current.id] = branch.id;
      await refreshBranches(draft.current);
      setHistorical(false);
      setRemoteChanged(false);
      setNotice('Your open draft has been saved on a separate recovery branch.');
    } finally { locked.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (!isTauri()) {
      setError('Open NoteWren with the native app command. This browser page cannot access your local library.');
      setSaveState('Native app required');
      return;
    }
    let disposed = false;
    const unlisten: (() => void)[] = [];
    async function boot() {
      try {
        const config = await bridge.settings();
        selections.current = config.selected_branches;
        const list = await preferredNotes();
        if (disposed) return;
        setSettings(config);
        document.documentElement.dataset.theme = config.dark ? 'dark' : 'light';
        setNotes(list);
        setSyncStatus(await bridge.syncStatus());
        const selected = list.find((note) => note.id === config.selected_note) ?? list[0];
        if (selected) { await install(selected); await refreshBranches(selected); }
        else setSaveState('Local library ready');
        setReady(true);
      } catch (cause) { setSaveState('Library unavailable'); showError(cause); }
    }
    void boot();
    const register = (promise: Promise<() => void>) => { void promise.then((off) => disposed ? off() : unlisten.push(off)).catch(showError); };
    register(getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void actions.current.exit().catch(showError);
    }));
    register(listen('save-before-exit', () => { void actions.current.exit().catch(showError); }));
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void actions.current.flush().catch(showError); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); void actions.current.newNote().catch(showError); }
    };
    window.addEventListener('keydown', onKey);
    return () => { disposed = true; unlisten.forEach((off) => off()); window.removeEventListener('keydown', onKey); clearTimeout(timer.current); };
  }, []);

  const filtered = notes.filter((note) => `${note.title}\n${note.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const uniqueNotes = [...new Map(filtered.map((note) => [note.id, note])).values()];
  const writingBranch = branches.find((branch) => branch.id === active?.branch_id);
  const act = (action: () => Promise<void>) => { void action().catch(showError); };

  return <div className="desktop-shell">
    <aside className="library-pane" aria-label="Local notes library">
      <header className="library-heading" data-tauri-drag-region><h1 data-tauri-drag-region>All notes</h1><button className="icon-button" disabled={!ready || busy || syncing} onClick={() => act(newNote)} title="New note (⌘N)" aria-label="New note"><Plus size={18} /></button></header>
      <label className="search-field"><Search size={16} aria-hidden="true" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your notes" aria-label="Search notes" type="search" /></label>
      <nav className="notes-list" aria-label="Notes">
        {uniqueNotes.map((note) => <button className={`note-row${note.id === active?.id ? ' selected' : ''}`} key={note.id} disabled={busy || syncing} aria-current={note.id === active?.id ? 'page' : undefined} onClick={() => act(() => openNote(note))}
          onContextMenu={(event) => { event.preventDefault(); act(() => showNoteMenu(note, event.clientX, event.clientY)); }}
          onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); act(() => showNoteMenu(note, rect.left + 20, rect.bottom)); } }}>
          <strong>{note.title || 'Untitled note'}</strong><span>{note.body.replace(/[#*_`]/g, '').slice(0, 140) || 'An empty page'}</span>
        </button>)}
        {ready && !uniqueNotes.length && <div className="list-empty"><p>{query ? 'No matching notes.' : 'Your library is empty.'}</p><button onClick={() => query ? setQuery('') : act(newNote)}>{query ? 'Clear search' : 'Write your first note'}</button></div>}
      </nav>
      <footer className="library-footer"><p>{syncing ? 'Syncing…' : syncStatus?.configured ? `${syncStatus.pending} pending operations` : 'Local library · Sync off'}</p><div className="footer-actions">
        <button disabled={!ready || busy || syncing} onClick={() => act(() => openPanel('settings'))}><Settings2 size={16} aria-hidden="true" /> Settings</button>
        <button className="icon-button" aria-label={settings?.dark ? 'Use light theme' : 'Use dark theme'} disabled={!settings || busy} onClick={() => act(async () => {
          if (!settings) return;
          const next = await bridge.saveSettings({ ...settings, dark: !settings.dark }, null);
          setSettings(next); document.documentElement.dataset.theme = next.dark ? 'dark' : 'light';
        })}>{settings?.dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      </div></footer>
    </aside>
    <main className="workspace" aria-label="Note editor">
      <header className="editor-toolbar" data-tauri-drag-region><div className="toolbar-group" role="group" aria-label="Note views">
        <button ref={editorButton} disabled={!active || busy || syncing} aria-pressed={panel === null} onClick={closePanel}><Pencil size={16} aria-hidden="true" /> Editor</button>
        <button disabled={!active || busy || syncing} aria-pressed={panel === 'branches'} onClick={() => act(() => openPanel('branches'))}><GitBranch size={16} aria-hidden="true" /> Branches</button>
        <button disabled={!active || busy || syncing} aria-pressed={panel === 'history'} onClick={() => act(() => openPanel('history'))}><History size={16} aria-hidden="true" /> History</button>
      </div><span className="writing-branch" title={`Writing: ${writingBranch?.name ?? 'Main'}`}>Writing: {writingBranch?.name ?? 'Main'}</span><button disabled={!active || busy || syncing} onClick={() => act(() => openPanel('branches', true))}><Plus size={15} aria-hidden="true" /> New branch</button><button disabled={!ready || !syncStatus?.configured || busy || syncing} onClick={() => void sync()}><RefreshCw size={15} aria-hidden="true" />{syncing ? 'Syncing…' : 'Sync now'}</button></header>
      {error && <div className="error-message" role="alert"><p>{error}</p><p>Your open draft has not been discarded.</p><button onClick={() => act(flush)} disabled={!active || busy || syncing}>Retry save</button>{active && <button onClick={() => act(recoverDraft)} disabled={busy || syncing}>Save as recovery branch</button>}<button onClick={() => setError('')}>Dismiss</button></div>}
      {notice && <div className="notice" role="status"><p>{notice}</p><button onClick={() => setNotice('')}>Dismiss</button></div>}
      {remoteChanged && <div className="notice"><p>Sync has a different version. Your writing buffer is unchanged. Editing it keeps your draft on a branch.</p><button disabled={busy || syncing} onClick={() => act(() => exclusive(async () => {
        if (!draft.current) return;
        const latest = await bridge.getNote(draft.current.id, draft.current.branch_id);
        await install(latest); await refreshBranches(latest);
      }))}>Load synced version</button></div>}
      <div className="editor-content" hidden={panel !== null} inert={busy}>
        {active ? <article className="writing-page">
          {historical && <p className="history-warning">Editing an older revision. The first content change creates a new branch.</p>}
          <input className="note-title" aria-label="Note title" placeholder="Untitled note" value={active.title} onChange={(event) => change('title', event.target.value)} />
          <MarkdownEditor key={editorKey} initialValue={active.body} onChange={(body) => change('body', body)} label="Markdown note body" placeholder="Start writing…" className="note-body" />
        </article> : <div className="empty-editor"><Logo size={68} /><h2>A little room to think</h2><p>{ready ? 'Create a note. It will be stored in your local library.' : 'Opening your local SQLite library.'}</p><button className="primary" disabled={!ready || busy} onClick={() => act(newNote)}>Write a note</button></div>}
      </div>
      {active && panel === null && <footer className="writing-footer" aria-label="Document status"><span role="status">{saveState}</span><span>{active.body.trim() ? active.body.trim().split(/\s+/).length : 0} words</span></footer>}
      {panel === 'branches' && active && <BranchGraph key={String(creatingBranch)} branches={graph} activeId={active.branch_id} initialCreate={creatingBranch} onClose={closePanel}
        onSwitch={async (id) => { await openNote(await bridge.getNote(active.id, id)); }}
        onCreate={async (parentId, name) => { await exclusive(async () => {
          const source = await bridge.getNote(active.id, parentId);
          const branch = await bridge.createBranch(active.id, source.revision_id, name);
          const note = await bridge.getNote(active.id, branch.id); await install(note); setPanel(null); await refreshBranches(note); await refreshList();
        }); }}
        onRename={async (id, name) => { await bridge.renameBranch(id, name); await refreshBranches(draft.current!); }}
        onArchive={async (id) => { const branch = branches.find((item) => item.id === id)!; await bridge.archiveBranch(id, !branch.archived, active.branch_id); await refreshBranches(draft.current!); }}
        onDelete={async (id) => { await bridge.deleteBranch(id, active.branch_id); await refreshBranches(draft.current!); }} />}
      {panel === 'history' && <section className="history-panel"><button onClick={closePanel}><ArrowLeft size={16} aria-hidden="true" /> Return to editor</button><h2>Revision history</h2><p>Inspection leaves your writing branch and undo history unchanged.</p>
        <div className="history-layout"><ol className="revision-list">{revisions.map((revision) => <li key={revision.id}><button aria-pressed={inspected?.id === revision.id} onClick={() => setInspected(revision)}><strong>{revision.created_at == null ? 'Time unavailable' : new Date(revision.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong><span>{revision.kind}{revision.id === active?.revision_id ? ' · Writing' : ''}</span></button></li>)}</ol>
          {inspected ? <article className="revision-preview"><h3>{inspected.title || 'Untitled note'}</h3><p className="revision-meta">{inspected.parents.length === 2 ? 'Merge with two parents' : 'Revision'} · {inspected.id.slice(0, 8)}</p><pre>{inspected.body || 'Empty body'}</pre><p className="revision-meta">{inspected.parents.length ? `Parents: ${inspected.parents.map((id) => id.slice(0, 8)).join(', ')}` : 'Original snapshot'}</p><button className="primary" disabled={busy} onClick={() => act(() => exclusive(async () => {
            if (!draft.current) return;
            const note = { id: inspected.note_id, branch_id: draft.current.branch_id, revision_id: inspected.id, title: inspected.title, body: inspected.body };
            const older = note.revision_id !== saved.current?.revision_id;
            await install(note); setHistorical(older); setPanel(null);
          }))}>Edit this revision</button><p>Choosing a revision creates nothing. Changing its content saves a new branch if newer work exists.</p></article> : <p className="history-placeholder">Select a revision to read it.</p>}
        </div></section>}
      {panel === 'settings' && settings && <SyncSettings settings={settings} status={syncStatus} busy={syncing} onClose={closePanel} onSave={async (next, token) => { const result = await bridge.saveSettings(next, token); setSettings(result); setSyncStatus(await bridge.syncStatus()); document.documentElement.dataset.theme = result.dark ? 'dark' : 'light'; }} onSync={sync} />}
    </main>
  </div>;
}

function SyncSettings({ settings, status, busy, onClose, onSave, onSync }: { settings: Settings; status: SyncStatus | null; busy: boolean; onClose: () => void; onSave: (settings: Settings, token: string | null) => Promise<void>; onSync: () => Promise<void> }) {
  const [url, setUrl] = useState(settings.server_url);
  const [libraryId, setLibraryId] = useState(settings.library_id ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSavedMessage('');
    try { await onSave({ ...settings, server_url: url, library_id: libraryId || null }, token || null); setToken(''); setSavedMessage('Settings saved on this Mac.'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  return <section className="settings-panel"><button onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /> Back to note</button><h2>Your library</h2><p>Notes stay on this Mac. Connect your own sync server when you want to use another device.</p><p className="database-path"><strong>Local database</strong><code>{settings.database_path}</code></p>
    <form onSubmit={(event) => void submit(event)}><fieldset disabled={saving || busy}><legend>Self-hosted sync</legend><label>Server URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://127.0.0.1:8787" /></label><label>Library ID<input value={libraryId} onChange={(event) => setLibraryId(event.target.value)} placeholder="Library UUID issued by your server" autoComplete="off" /></label><label>Library token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={settings.has_token ? 'Saved token (leave blank to keep)' : 'Token issued by your server'} autoComplete="off" spellCheck={false} /></label><p className="field-hint">The token is stored in a private settings file on this Mac. Use HTTPS except when testing on localhost. Clear the server URL to turn sync off.</p><button className="primary" type="submit">{saving ? 'Saving…' : 'Save sync settings'}</button></fieldset></form>
    {error && <p className="error-message" role="alert">{error}</p>}{savedMessage && <p role="status">{savedMessage}</p>}
    <section className="sync-detail"><h3>Sync status</h3><p>{busy ? 'Syncing…' : status?.configured ? `${status.pending} pending operations` : 'Sync is off'}</p>{status?.last_sync && <p>Last completed sync: {new Date(status.last_sync * 1000).toLocaleString()}</p>}{status?.error && <p className="error-message" role="alert">{status.error}</p>}<button disabled={!status?.configured || saving || busy} onClick={() => void onSync()}>Sync now</button></section>
  </section>;
}
