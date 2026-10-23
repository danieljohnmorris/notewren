import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BatteryMedium,
  ChevronLeft,
  CloudOff,
  Compass,
  FileText,
  GitBranch,
  Maximize2,
  Minimize2,
  Notebook,
  Plus,
  Search,
  Signal,
  Star,
  Wifi,
  X,
} from 'lucide-react';
import { ArrowLeft, BatteryFull, ChevronRight, Files, Minus, SignalHigh, Square, SquarePen } from 'lucide-react';
import { Logo } from './Logo';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { OMARCHY_THEMES, omarchyThemeStyle } from './omarchyThemes';
import { BranchGraph, type NoteBranch } from './BranchGraph';
import './mockups.css';

export type Platform = 'mac' | 'windows' | 'omarchy' | 'mobile';

type NotebookId = 'personal' | 'field';

type View = { kind: 'all' } | { kind: 'favourites' } | { kind: 'notebook'; id: NotebookId };

interface Note {
  id: string;
  title: string;
  body: string;
  notebook: NotebookId;
  favourite: boolean;
  updated: string;
  /** True once the note has been changed or created in this preview. */
  edited: boolean;
  branches?: NoteBranch[];
  activeBranchId?: string;
}

const NOTEBOOKS: ReadonlyArray<{ id: NotebookId; name: string }> = [
  { id: 'personal', name: 'Personal' },
  { id: 'field', name: 'Field notes' },
];

const NOTEBOOK_ICONS = { personal: Notebook, field: Compass } as const;

const SAMPLE_NOTES: ReadonlyArray<Note> = [
  {
    id: 'room-to-think',
    title: 'A little room to think',
    notebook: 'personal',
    favourite: true,
    updated: 'Today, 08:12',
    edited: false,
    body: `Some mornings the most useful thing I can do is leave a page open and see what turns up.

## Ground rules
- Write first, tidy later.
- One idea per paragraph.
- If it still matters next week, give it a heading.

The aim is *a little room*, nothing more. Most of these notes will stay rough, and that is fine.`,
  },
  {
    id: 'coastal-path',
    title: 'Along the coastal path',
    notebook: 'field',
    favourite: true,
    updated: 'Yesterday',
    edited: false,
    body: `Started at the harbour just after seven. Low tide, grey light and a lot of gulls.

## Things I noticed
- Sea thrift still flowering on the cliff edge.
- A wren singing from the gorse, far louder than its size suggests.
- The stile past the lookout has been replaced.

Turned back at the second bay. Next time, bring a flask and leave earlier.`,
  },
  {
    id: 'slower-week',
    title: 'Notes for a slower week',
    notebook: 'personal',
    favourite: false,
    updated: 'Tuesday',
    edited: false,
    body: `A short list for the days when the calendar is quieter.

- [ ] Walk without headphones.
- [ ] Cook something that takes all afternoon.
- [ ] Write a proper letter.
- [x] Clear the desk.

Rest counts as progress. I keep having to write that down.`,
  },
  {
    id: 'reading-list',
    title: 'Reading list',
    notebook: 'personal',
    favourite: false,
    updated: 'Last week',
    edited: false,
    body: `## Now
- *The Living Mountain* by Nan Shepherd

## Next
- *Pilgrim at Tinker Creek* by Annie Dillard
- *The Peregrine* by J. A. Baker

Read slowly. Keep a pencil nearby and copy out the lines worth keeping.`,
  },
  {
    id: 'project-ideas',
    title: 'Project ideas',
    notebook: 'field',
    favourite: false,
    updated: 'Last week',
    edited: false,
    body: `Small things worth making when there is time.

1. A field journal template with weather, tide and route.
2. A printed map of favourite walks, one page each.
3. Birdsong notes sorted by season.

Start with the template. It is the one I would use every week.`,
  },
];

const FOOTNOTE = 'Interactive mockup · Sample notes · No server connected';
const UNTITLED = 'Untitled note';

function notebookName(id: NotebookId): string {
  return NOTEBOOKS.find((n) => n.id === id)?.name ?? '';
}

function viewLabel(view: View): string {
  if (view.kind === 'all') return 'All notes';
  if (view.kind === 'favourites') return 'Favourites';
  return notebookName(view.id);
}

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'notebook' || (b.kind === 'notebook' && a.id === b.id);
}

function inView(note: Note, view: View): boolean {
  if (view.kind === 'favourites') return note.favourite;
  if (view.kind === 'notebook') return note.notebook === view.id;
  return true;
}

/** Plain-text preview of a Markdown body for list rows. */
function snippet(body: string): string {
  return body
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s*)?/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ */
/* Shared state                                                        */
/* ------------------------------------------------------------------ */

interface NotesState {
  /** Notes in the current view that match the search. */
  visible: Note[];
  counts: Record<'all' | 'favourites' | NotebookId, number>;
  selected: Note;
  view: View;
  query: string;
  /** Draft whose title should take focus once its editor mounts. */
  focusTitleId: string | null;
  setView: (view: View) => void;
  setQuery: (query: string) => void;
  select: (id: string) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => void;
  toggleFavourite: (id: string) => void;
  createNote: () => void;
  clearTitleFocus: () => void;
  graphOpen: boolean;
  setGraphOpen: (open: boolean) => void;
  switchBranch: (id: string) => void;
  createBranch: (parentId: string, name: string) => void;
  renameBranch: (id: string, name: string) => void;
  archiveBranch: (id: string) => void;
  deleteBranch: (id: string) => void;
}

/** Sample alternatives share a captured starting point, never a mutable parent. */
function initialBranches(note: Note): NoteBranch[] {
  const original: NoteBranch = {
    id: 'original', name: 'Original', parentId: null,
    title: note.title, body: note.body, baseTitle: note.title, baseBody: note.body,
    author: 'You', archived: false,
  };
  if (note.id !== 'room-to-think') return [original];
  const shorter: NoteBranch = {
    ...original, id: 'shorter', name: 'A shorter opening', parentId: original.id,
    body: `Leave a page open. See what turns up.

## Ground rules
- Write first, tidy later.
- One idea per paragraph.
- Give the useful thoughts room to grow.

Most of these notes will stay rough, and that is fine.`,
  };
  return [
    original, shorter,
    { ...shorter, id: 'letter', name: 'As a letter', parentId: shorter.id,
      baseTitle: shorter.title, baseBody: shorter.body,
      body: `Dear friend,\n\nI have been leaving a page open each morning. Nothing ambitious. A line about the weather, or something I want to remember.\n\nIt helps to have somewhere a thought can wait.\n\nPerhaps you would like to try it too.` },
    { ...original, id: 'agent', name: 'A different structure', parentId: original.id, author: 'Agent',
      body: `## A place to begin\n\nSome mornings I leave a page open and see what turns up.\n\n## A little practice\n\nWrite first, tidy later. Keep one idea in each paragraph. Return next week and give the thoughts that stayed a heading.\n\n## Permission to stop\n\nMost notes will stay rough. That is fine. The page has already done its job.` },
  ];
}

function useNotesState(): NotesState {
  const [notes, setNotes] = useState<Note[]>(() => SAMPLE_NOTES.map((n) => ({
    ...n, branches: initialBranches(n), activeBranchId: 'original',
  })));
  const [selectedId, setSelectedId] = useState<string>(SAMPLE_NOTES[0].id);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const draftCounter = useRef(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter(
      (n) => inView(n, view) && (!q || `${n.title}\n${n.body}`.toLowerCase().includes(q)),
    );
  }, [notes, view, query]);

  const counts = useMemo(
    () => ({
      all: notes.length,
      favourites: notes.filter((n) => n.favourite).length,
      personal: notes.filter((n) => n.notebook === 'personal').length,
      field: notes.filter((n) => n.notebook === 'field').length,
    }),
    [notes],
  );

  const selected = notes.find((n) => n.id === selectedId) ?? notes[0];

  const updateNote = useCallback((id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? {
        ...n, ...patch, edited: true, updated: 'Just now',
        branches: n.branches?.map(b => b.id === n.activeBranchId ? { ...b, ...patch } : b),
      } : n)),
    );
  }, []);

  const toggleFavourite = useCallback((id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, favourite: !n.favourite } : n)));
  }, []);

  const createNote = useCallback(() => {
    draftCounter.current += 1;
    const id = `draft-${draftCounter.current}`;
    const notebook: NotebookId = view.kind === 'notebook' ? view.id : 'personal';
    setNotes((prev) => [
      { id, title: '', body: '', notebook, favourite: false, updated: 'Just now', edited: true,
        activeBranchId: 'original',
        branches: initialBranches({ id, title: '', body: '', notebook, favourite: false, updated: 'Just now', edited: true }) },
      ...prev,
    ]);
    setSelectedId(id);
    setGraphOpen(false);
    // A blank draft would be hidden by a favourites filter or a search, so show it.
    if (view.kind === 'favourites') setView({ kind: 'all' });
    setQuery('');
    setFocusTitleId(id);
  }, [view]);

  const clearTitleFocus = useCallback(() => setFocusTitleId(null), []);

  const switchBranch = (id: string) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== selectedId) return n;
      const branch = n.branches?.find(b => b.id === id && !b.archived);
      return branch ? { ...n, title: branch.title, body: branch.body, activeBranchId: id } : n;
    }));
    setGraphOpen(false);
  };
  const createBranch = (parentId: string, name: string) => {
    const id = crypto.randomUUID();
    setNotes(prev => prev.map(n => {
      if (n.id !== selectedId) return n;
      const parent = n.branches?.find(b => b.id === parentId);
      if (!parent || !name.trim() || name.trim().length > 48 ||
        n.branches?.some(b => b.name.toLowerCase() === name.trim().toLowerCase())) return n;
      const branch: NoteBranch = {
        id, name: name.trim(), parentId, title: parent.title, body: parent.body,
        baseTitle: parent.title, baseBody: parent.body, author: 'You', archived: false,
      };
      return { ...n, title: branch.title, body: branch.body, edited: true, updated: 'Just now',
        activeBranchId: id, branches: [...(n.branches ?? []), branch] };
    }));
    setGraphOpen(false);
  };
  const renameBranch = (id: string, name: string) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== selectedId || !name.trim() || name.trim().length > 48 ||
        n.branches?.some(b => b.id !== id && b.name.toLowerCase() === name.trim().toLowerCase())) return n;
      return { ...n, branches: n.branches?.map(b => b.id === id ? { ...b, name: name.trim() } : b) };
    }));
  };
  const archiveBranch = (id: string) => {
    setNotes(prev => prev.map(n => n.id !== selectedId || id === n.activeBranchId ? n : {
      ...n, branches: n.branches?.map(b => b.id === id && b.parentId ? { ...b, archived: !b.archived } : b),
    }));
  };
  const deleteBranch = (id: string) => {
    setNotes(prev => prev.map(n => n.id !== selectedId || id === n.activeBranchId ||
      n.branches?.some(b => b.parentId === id || (b.id === id && b.parentId === null)) ? n : {
        ...n, branches: n.branches?.filter(b => b.id !== id),
      }));
  };

  return {
    visible,
    counts,
    selected,
    view,
    query,
    focusTitleId,
    setView,
    setQuery,
    select: (id) => { setSelectedId(id); setGraphOpen(false); },
    updateNote,
    toggleFavourite,
    createNote,
    clearTitleFocus,
    graphOpen, setGraphOpen, switchBranch, createBranch, renameBranch, archiveBranch, deleteBranch,
  };
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="nwm-wordmark">
      <Logo size={size} className="nwm-wordmark-logo" />
      <span className="nwm-wordmark-text">NoteWren</span>
    </span>
  );
}

function PreviewPill() {
  return <span className="nwm-preview-pill">Stored in this preview only</span>;
}

function BranchToggle({ s }: { s: NotesState }) {
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(s.graphOpen);
  useEffect(() => {
    if (wasOpen.current && !s.graphOpen) ref.current?.focus({ preventScroll: true });
    wasOpen.current = s.graphOpen;
  }, [s.graphOpen]);
  const branch = s.selected.branches?.find(b => b.id === s.selected.activeBranchId);
  return (
    <button ref={ref} type="button" className="nwm-branch-toggle"
      aria-label={`Branches, writing ${branch?.name ?? 'Original'}`}
      aria-expanded={s.graphOpen} onClick={() => s.setGraphOpen(!s.graphOpen)}>
      <GitBranch size={16} aria-hidden="true" />
      <span>{branch?.name ?? 'Original'}</span>
    </button>
  );
}

function NoteBranchGraph({ s }: { s: NotesState }) {
  return <BranchGraph key={s.selected.id} branches={s.selected.branches ?? []}
    activeId={s.selected.activeBranchId ?? 'original'}
    onSwitch={s.switchBranch} onCreate={s.createBranch} onRename={s.renameBranch}
    onArchive={s.archiveBranch} onDelete={s.deleteBranch}
    onClose={() => s.setGraphOpen(false)} />;
}

function SearchField({
  inputRef,
  query,
  onQuery,
  shortcut,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (q: string) => void;
  shortcut?: ReactNode;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query) {
      e.stopPropagation();
      onQuery('');
    }
  };
  return (
    <label className="nwm-search">
      <Search size={15} strokeWidth={1.9} aria-hidden="true" className="nwm-search-icon" />
      <span className="nwm-visually-hidden">Search notes</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search notes"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {query ? (
        <button type="button" className="nwm-search-clear" onClick={() => onQuery('')} aria-label="Clear search">
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : (
        shortcut
      )}
    </label>
  );
}

function EmptyList({ s }: { s: NotesState }) {
  if (s.query.trim()) {
    return (
      <div className="nwm-empty" role="status">
        <Search size={22} strokeWidth={1.6} aria-hidden="true" />
        <p className="nwm-empty-title">No notes match “{s.query.trim()}”</p>
        <p className="nwm-empty-body">Try a different word, or search all notes.</p>
        <div className="nwm-empty-actions">
          <button type="button" className="nwm-text-button" onClick={() => s.setQuery('')}>
            Clear search
          </button>
          {s.view.kind !== 'all' && (
            <button type="button" className="nwm-text-button" onClick={() => s.setView({ kind: 'all' })}>
              Search all notes
            </button>
          )}
        </div>
      </div>
    );
  }
  if (s.view.kind === 'favourites') {
    return (
      <div className="nwm-empty" role="status">
        <Star size={22} strokeWidth={1.6} aria-hidden="true" />
        <p className="nwm-empty-title">No favourites yet</p>
        <p className="nwm-empty-body">Star a note to keep it here.</p>
      </div>
    );
  }
  return (
    <div className="nwm-empty" role="status">
      <FileText size={22} strokeWidth={1.6} aria-hidden="true" />
      <p className="nwm-empty-title">This notebook is empty</p>
      <button type="button" className="nwm-text-button" onClick={s.createNote}>
        Write a note
      </button>
    </div>
  );
}

function NoteRow({
  note,
  active,
  onOpen,
}: {
  note: Note;
  active: boolean;
  onOpen: () => void;
}) {
  const text = snippet(note.body);
  return (
    <li>
      <button
        type="button"
        className="nwm-note"
        aria-current={active ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="nwm-note-head">
          <span className={note.title ? 'nwm-note-title' : 'nwm-note-title is-untitled'}>
            {note.title || UNTITLED}
          </span>
          {note.favourite && (
            <>
              <Star size={13} strokeWidth={2} fill="currentColor" className="nwm-note-star" aria-hidden="true" />
              <span className="nwm-visually-hidden">Favourite</span>
            </>
          )}
        </span>
        <span className="nwm-note-snippet">{text || 'No text yet'}</span>
        <span className="nwm-note-meta">
          <span>{note.updated}</span>
          <span aria-hidden="true">·</span>
          <span>{notebookName(note.notebook)}</span>
        </span>
      </button>
    </li>
  );
}

/** Title and Markdown body inputs, styled as a writing page. */
function NoteFields({
  note,
  s,
  variant,
}: {
  note: Note;
  s: NotesState;
  variant: 'desktop' | 'mobile';
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<MarkdownEditorHandle>(null);

  const shouldFocus = s.focusTitleId === note.id;
  const { clearTitleFocus } = s;
  useEffect(() => {
    if (!shouldFocus) return;
    titleRef.current?.focus({ preventScroll: true });
    clearTitleFocus();
  }, [shouldFocus, clearTitleFocus]);

  const onTitleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bodyRef.current?.focusStart();
    }
  };

  return (
    <div className={`nwm-fields nwm-fields--${variant}`}>
      <input
        ref={titleRef}
        className="nwm-title-input"
        value={note.title}
        placeholder={UNTITLED}
        aria-label="Note title"
        onChange={(e) => s.updateNote(note.id, { title: e.target.value })}
        onKeyDown={onTitleKeyDown}
      />
      <p className="nwm-fields-meta">
        <span>{notebookName(note.notebook)}</span>
        <span aria-hidden="true">·</span>
        <span>{note.updated === 'Just now' ? 'Edited just now' : note.updated}</span>
      </p>
      <MarkdownEditor
        ref={bodyRef}
        className="nwm-body-input"
        initialValue={note.body}
        placeholder="Start writing in Markdown"
        label="Note body, Markdown"
        onChange={(body) => s.updateNote(note.id, { body })}
      />
    </div>
  );
}

function Footnote() {
  return <p className="nwm-footnote">{FOOTNOTE}</p>;
}

/* ------------------------------------------------------------------ */
/* Desktop (macOS and Omarchy)                                         */
/* ------------------------------------------------------------------ */

function DesktopMockup({ platform }: { platform: 'mac' | 'windows' | 'omarchy' }) {
  const s = useNotesState();
  const [focusMode, setFocusMode] = useState(false);
  const [pane, setPane] = useState<'list' | 'editor'>('list');
  const searchRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const [osTheme, setOsTheme] = useState('tokyo-night');
  const isMac = platform === 'mac';
  const isWindows = platform === 'windows';
  const osPalette = OMARCHY_THEMES.find(t => t.id === osTheme) ?? OMARCHY_THEMES[0];

  // Only the selected platform is mounted, so one listener exists at a time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFocusMode(false);
        setPane('list');
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && focusMode) setFocusMode(false);
  };

  // In narrow frames the list and editor alternate, so the control that was
  // clicked may now be hidden. Move focus into the pane that has just opened:
  // the title when a note opens, the selected row on the way back.
  const prevPane = useRef(pane);
  useLayoutEffect(() => {
    if (prevPane.current === pane) return;
    prevPane.current = pane;
    const root = appRef.current;
    const active = document.activeElement as HTMLElement | null;
    if (!root || (active && root.contains(active) && active.offsetParent !== null)) return;
    const target = pane === 'editor'
      ? root.querySelector<HTMLElement>('.nwm-title-input')
      : root.querySelector<HTMLElement>('.nwm-note[aria-current="true"]');
    target?.focus({ preventScroll: true });
  }, [pane]);

  const openNote = (id: string) => {
    s.select(id);
    setPane('editor');
  };

  const createNote = () => {
    s.createNote();
    setPane('editor');
  };

  const chooseView = (view: View) => {
    s.setView(view);
    setPane('list');
  };

  const note = s.selected;
  const shortcut = (
    <kbd className="nwm-kbd" aria-label={isMac ? 'Command K' : 'Control K'}>
      {isMac ? '⌘K' : 'Ctrl K'}
    </kbd>
  );

  const navItems: Array<{ view: View; label: string; count: number; icon: ReactNode }> = [
    { view: { kind: 'all' }, label: 'All notes', count: s.counts.all, icon: <FileText size={16} strokeWidth={1.8} aria-hidden="true" /> },
    { view: { kind: 'favourites' }, label: 'Favourites', count: s.counts.favourites, icon: <Star size={16} strokeWidth={1.8} aria-hidden="true" /> },
  ];

  const app = (
    <div
      ref={appRef}
      className="nwm-app"
      data-pane={pane}
      data-focus={focusMode ? 'true' : undefined}
      onKeyDown={onRootKeyDown}
    >
      <aside className="nwm-sidebar" aria-label="Library">
        <div className="nwm-toolbar">
          {isMac && (
            <span className="nwm-traffic" aria-hidden="true">
              <span className="nwm-traffic-dot nwm-traffic-dot--close" />
              <span className="nwm-traffic-dot nwm-traffic-dot--min" />
              <span className="nwm-traffic-dot nwm-traffic-dot--max" />
            </span>
          )}
          <span className="nwm-toolbar-spacer" />
          <Wordmark size={18} />
          <span className="nwm-toolbar-spacer" />
        </div>
        <nav className="nwm-nav" aria-label="Library views">
          {navItems.map((item) => (
            <NavButton
              key={item.label}
              label={item.label}
              count={item.count}
              icon={item.icon}
              active={sameView(s.view, item.view)}
              onClick={() => chooseView(item.view)}
            />
          ))}
          <p className="nwm-nav-heading">Notebooks</p>
          {NOTEBOOKS.map((nb) => {
            const Icon = NOTEBOOK_ICONS[nb.id];
            const view: View = { kind: 'notebook', id: nb.id };
            return (
              <NavButton
                key={nb.id}
                label={nb.name}
                count={s.counts[nb.id]}
                icon={<Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
                active={sameView(s.view, view)}
                onClick={() => chooseView(view)}
              />
            );
          })}
        </nav>
        <p className="nwm-sidebar-status" title="Sync not connected">
          <CloudOff size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="nwm-nav-label">Sync not connected</span>
        </p>
      </aside>

      <section className="nwm-list" aria-label={viewLabel(s.view)}>
        <header className="nwm-list-header">
          <div className="nwm-toolbar">
            <h3 className="nwm-list-title">
              {viewLabel(s.view)}
              <span className="nwm-visually-hidden" aria-live="polite">
                {', '}
                {s.query.trim() ? plural(s.visible.length, 'result') : plural(s.visible.length, 'note')}
              </span>
            </h3>
            <button type="button" className="nwm-icon-button" onClick={createNote} aria-label="New note" title="New note">
              <SquarePen size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
          <SearchField inputRef={searchRef} query={s.query} onQuery={s.setQuery} shortcut={shortcut} />
        </header>
        {s.visible.length ? (
          <ul className="nwm-note-list" role="list">
            {s.visible.map((n) => (
              <NoteRow key={n.id} note={n} active={n.id === note.id} onOpen={() => openNote(n.id)} />
            ))}
          </ul>
        ) : (
          <EmptyList s={s} />
        )}
      </section>

      <section className="nwm-editor" aria-label="Editor">
        <header className="nwm-toolbar">
          <button type="button" className="nwm-back" onClick={() => { setFocusMode(false); setPane('list'); }}>
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
            Notes
          </button>
          <span className="nwm-toolbar-spacer">
            <BranchToggle s={s} />
          </span>
          <button
            type="button"
            className="nwm-icon-button"
            aria-pressed={note.favourite}
            aria-label="Favourite"
            title={note.favourite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => s.toggleFavourite(note.id)}
          >
            <Star size={16} strokeWidth={1.9} fill={note.favourite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nwm-icon-button"
            aria-pressed={focusMode}
            aria-label="Focus mode"
            title={focusMode ? 'Leave focus mode (Esc)' : 'Focus mode'}
            onClick={() => setFocusMode((f) => !f)}
          >
            {focusMode ? (
              <Minimize2 size={16} strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} strokeWidth={1.9} aria-hidden="true" />
            )}
          </button>
        </header>
        <div className="nwm-page-scroll">
          {s.graphOpen && <NoteBranchGraph s={s} />}
          <article className="nwm-page" hidden={s.graphOpen} inert={s.graphOpen}>
            <NoteFields key={`${note.id}:${note.activeBranchId}`} note={note} s={s} variant="desktop" />
            <p className="nwm-draft-status">{plural(note.body.split(/\s+/).filter(Boolean).length, 'word')}{note.edited && ' · Stored in this preview only'}</p>
          </article>
        </div>
      </section>
    </div>
  );

  return (
    <div className={`nwm-desktop nwm-desktop--${platform}`}>
      {isMac ? (
        <div className="nwm-mac" role="group" aria-label="NoteWren on macOS, mockup">
          {app}
        </div>
      ) : isWindows ? (
        <div className="nwm-windows" role="group" aria-label="NoteWren on Windows, mockup">
          <div className="nwm-win-titlebar" aria-hidden="true">
            <span className="nwm-win-title">
              <Logo size={14} />
              NoteWren
            </span>
            <span className="nwm-win-captions">
              <span className="nwm-win-caption"><Minus size={14} strokeWidth={1.25} /></span>
              <span className="nwm-win-caption"><Square size={11} strokeWidth={1.25} /></span>
              <span className="nwm-win-caption nwm-win-caption--close"><X size={14} strokeWidth={1.25} /></span>
            </span>
          </div>
          {app}
        </div>
      ) : (
        <>
          <div className="nwm-os-themes" role="group" aria-label="Omarchy theme">
            <span className="nwm-os-themes-label">OS theme</span>
            {OMARCHY_THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                className="nwm-os-theme"
                aria-pressed={osTheme === t.id}
                onClick={() => setOsTheme(t.id)}
              >
                <span className="nwm-os-theme-swatch" aria-hidden="true">
                  <span style={{ background: t.colors.background }} />
                  <span style={{ background: t.colors.accent }} />
                  <span style={{ background: t.colors.lighter_background }} />
                  <span style={{ background: t.colors.bright_foreground }} />
                </span>
                {t.name}
              </button>
            ))}
          </div>
          <div
            className="nwm-omarchy"
            role="group"
            aria-label={`NoteWren on Omarchy, mockup, ${osPalette.name} theme`}
            style={omarchyThemeStyle(osPalette.colors)}
          >
            <div className="nwm-waybar" aria-hidden="true">
              <span className="nwm-waybar-workspaces">
                <span className="is-active">1</span>
                <span>2</span>
                <span>3</span>
              </span>
              <span className="nwm-waybar-title">NoteWren</span>
              <span className="nwm-waybar-status">
                <span className="nwm-waybar-example">example</span>
                <span className="nwm-waybar-item">
                  <BatteryMedium size={14} strokeWidth={1.8} />
                  82%
                </span>
                <span className="nwm-waybar-item">09:41</span>
              </span>
            </div>
            <div className="nwm-omarchy-client">{app}</div>
          </div>
        </>
      )}
      <Footnote />
    </div>
  );
}

function NavButton({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="nwm-nav-item"
      aria-current={active ? 'true' : undefined}
      aria-label={`${label}, ${plural(count, 'note')}`}
      title={label}
      onClick={onClick}
    >
      <span className="nwm-nav-icon">{icon}</span>
      <span className="nwm-nav-label">{label}</span>
      <span className="nwm-nav-count" aria-hidden="true">{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile                                                              */
/* ------------------------------------------------------------------ */

const TWO_PHONE_MIN_WIDTH = 700;

/** Operating system of a mobile device; it picks the controls and system font. */
type Device = 'ios' | 'android';

/** Physical form: a phone, a book-style fold with one inner screen, or the Surface Duo's two screens. */
type Form = 'phone' | 'fold' | 'duo';

type DeviceId = 'iphone' | 'android' | 'iphone-fold' | 'android-fold' | 'duo';

interface DeviceSpec {
  id: DeviceId;
  os: Device;
  form: Form;
  /** Segmented control label. */
  label: string;
  /** Used in the accessible name: "NoteWren on <name>, mockup". */
  name: string;
  /** Open-device frame size in CSS px. Phones are sized in CSS. */
  width?: number;
  height?: number;
}

/* Open folds are drawn at roughly the same scale as the phones (about 84% of
   device size). Fold sizes approximate a 7.6 to 7.8 inch near-square inner
   screen; the Duo is two 4:3 screens either side of a hinge. */
const DEVICES: ReadonlyArray<DeviceSpec> = [
  { id: 'iphone', os: 'ios', form: 'phone', label: 'iPhone', name: 'an iPhone' },
  { id: 'android', os: 'android', form: 'phone', label: 'Android', name: 'an Android phone' },
  { id: 'iphone-fold', os: 'ios', form: 'fold', label: 'iPhone Fold', name: 'an iPhone Fold, open', width: 600, height: 470 },
  { id: 'android-fold', os: 'android', form: 'fold', label: 'Android fold', name: 'an Android fold, open', width: 580, height: 490 },
  { id: 'duo', os: 'android', form: 'duo', label: 'Surface Duo', name: 'a Surface Duo, spanned', width: 600, height: 410 },
];

/** Where a screen sits in a phone's navigation stack. */
type SlotPos = 'current' | 'behind' | 'buried' | 'ahead';

interface StackSlot {
  key: string;
  pos: SlotPos;
  node: ReactNode;
}

function MobileMockup() {
  const s = useNotesState();
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [deviceId, setDeviceId] = useState<DeviceId>('iphone');
  const [level, setLevel] = useState<'collections' | 'list'>('collections');
  const [noteOpen, setNoteOpen] = useState(false);
  const spec = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const device = spec.os;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Phones show two side by side when there is room; open folds always have
  // the library and the note on screen together.
  const wide = spec.form !== 'phone' || width >= TWO_PHONE_MIN_WIDTH;

  const showCollection = (view: View) => {
    s.setView(view);
    s.setQuery('');
    setLevel('list');
  };
  const showCollections = () => {
    s.setQuery('');
    setLevel('collections');
  };
  // Searching from the library looks through every note, as the Notes apps do.
  const searchAll = (query: string) => {
    if (s.view.kind !== 'all') s.setView({ kind: 'all' });
    s.setQuery(query);
  };
  const open = (id: string) => {
    s.select(id);
    setNoteOpen(true);
  };
  const create = () => {
    s.createNote();
    setLevel('list');
    setNoteOpen(true);
  };

  const library = (
    <MobileLibrary
      device={device}
      s={s}
      onShow={showCollection}
      onSearch={searchAll}
      onOpen={open}
      onCreate={create}
      showSelection={wide}
    />
  );
  const list = (
    <MobileNoteList device={device} s={s} onBack={showCollections} onOpen={open} onCreate={create} showSelection={wide} />
  );
  const editor = (
    <MobileNote
      device={device}
      s={s}
      back={wide ? undefined : { label: level === 'list' ? viewLabel(s.view) : 'Library', onClick: () => setNoteOpen(false) }}
      onCreate={create}
    />
  );

  const covered = !wide && noteOpen;
  const librarySlots: StackSlot[] = [
    {
      key: 'collections',
      pos: level === 'collections' ? (covered ? 'behind' : 'current') : covered ? 'buried' : 'behind',
      node: library,
    },
    { key: 'list', pos: level === 'list' ? (covered ? 'behind' : 'current') : 'ahead', node: list },
  ];
  const name = spec.name;

  let stage: ReactNode;
  if (spec.form !== 'phone') {
    stage = (
      <div className="nwm-phones">
        <FoldDevice spec={spec} containerWidth={width} label={`NoteWren on ${name}, mockup`}>
          <MobileStack slots={librarySlots} />
          {editor}
        </FoldDevice>
      </div>
    );
  } else if (wide) {
    stage = (
      <div className="nwm-phones">
        <figure className="nwm-phone-figure">
          <Phone device={device} label={`NoteWren on ${name}, library, mockup`}>
            <MobileStack slots={librarySlots} />
          </Phone>
          <figcaption>Library</figcaption>
        </figure>
        <figure className="nwm-phone-figure">
          <Phone device={device} label={`NoteWren on ${name}, open note, mockup`}>
            {editor}
          </Phone>
          <figcaption>Open note</figcaption>
        </figure>
      </div>
    );
  } else {
    stage = (
      <div className="nwm-phones">
        <Phone device={device} label={`NoteWren on ${name}, mockup`}>
          <MobileStack slots={[...librarySlots, { key: 'note', pos: noteOpen ? 'current' : 'ahead', node: editor }]} />
        </Phone>
      </div>
    );
  }

  return (
    <div className="nwm-mobile" ref={rootRef} data-device={device} data-form={spec.form}>
      <div className="nwm-device-controls">
        <div className="segmented" role="group" aria-label="Mobile device">
          {DEVICES.map((d) => (
            <button key={d.id} type="button" aria-pressed={d.id === spec.id} onClick={() => setDeviceId(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {stage}
      <Footnote />
    </div>
  );
}

/**
 * Screens of one phone, layered as a navigation stack. Only the current screen
 * is interactive; the rest are inert and slide or fade out of the way.
 */
function MobileStack({ slots }: { slots: ReadonlyArray<StackSlot> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const current = slots.find((slot) => slot.pos === 'current')?.key;
  const shown = useRef(current);
  const lastPos = useRef<Record<string, SlotPos>>({});

  useEffect(() => {
    lastPos.current = Object.fromEntries(slots.map((slot) => [slot.key, slot.pos]));
  });

  // The old screen turns inert, which drops focus. Going forward, focus the new
  // screen's heading; going back, return to the row that was opened. A screen
  // that already took focus (a new note's title) keeps it.
  useEffect(() => {
    const previous = shown.current;
    if (previous === current) return;
    shown.current = current;
    const root = rootRef.current;
    const screen = root?.querySelector<HTMLElement>(`[data-slot='${current}']`);
    const active = document.activeElement;
    if (!root || !screen || screen.contains(active)) return;
    if (active && active !== document.body && !root.contains(active)) return;
    const order = slots.map((slot) => slot.key);
    const wentBack =
      previous !== undefined && current !== undefined && order.indexOf(current) < order.indexOf(previous);
    const target =
      (wentBack ? screen.querySelector<HTMLElement>('[data-return-focus]') : null) ??
      screen.querySelector<HTMLElement>('[data-screen-focus]');
    target?.focus({ preventScroll: true });
  }, [current, slots]);

  return (
    <div className="nwm-mstack" ref={rootRef}>
      {slots.map((slot) => {
        const was = lastPos.current[slot.key];
        // A screen moving between two hidden positions jumps there unseen,
        // so it does not sweep across the screen that is sliding in.
        const jump = was !== undefined && was !== slot.pos && was !== 'current' && slot.pos !== 'current';
        return (
          <div
            key={slot.key}
            className="nwm-mslot"
            data-slot={slot.key}
            data-pos={slot.pos}
            data-jump={jump ? '' : undefined}
            inert={slot.pos !== 'current'}
          >
            {slot.node}
          </div>
        );
      })}
    </div>
  );
}

function StatusBar({ device, camera = true }: { device: Device; camera?: boolean }) {
  return (
    <div className="nwm-phone-status" aria-hidden="true">
      <span>9:41</span>
      {camera ? <span className="nwm-phone-camera" /> : <span />}
      <span className="nwm-phone-indicators">
        {device === 'ios' ? (
          <>
            <Signal size={14} strokeWidth={2.2} />
            <Wifi size={14} strokeWidth={2.2} />
            <BatteryMedium size={18} strokeWidth={1.8} />
          </>
        ) : (
          <>
            <Wifi size={13} strokeWidth={2.4} />
            <SignalHigh size={13} strokeWidth={2.4} />
            <BatteryFull size={15} strokeWidth={2} />
          </>
        )}
      </span>
    </div>
  );
}

function Phone({ device, label, children }: { device: Device; label: string; children: ReactNode }) {
  return (
    <div className="nwm-phone" role="group" aria-label={label}>
      <div className="nwm-phone-screen">
        <StatusBar device={device} />
        <div className="nwm-phone-content">{children}</div>
        <span className="nwm-phone-home" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * An open folding device with the library on the left and the note on the
 * right. Book folds have one screen with a crease down the middle and a single
 * status bar across it; the Duo's two screens each carry their own. The frame
 * has a fixed size and zooms down when the container is narrower.
 */
function FoldDevice({
  spec,
  containerWidth,
  label,
  children,
}: {
  spec: DeviceSpec;
  containerWidth: number;
  label: string;
  children: [ReactNode, ReactNode];
}) {
  const duo = spec.form === 'duo';
  const width = spec.width ?? 600;
  const height = spec.height ?? 450;
  const zoom = containerWidth ? Math.min(1, containerWidth / width) : 1;
  const home = <span className="nwm-phone-home" aria-hidden="true" />;
  return (
    <div className="nwm-fold" role="group" aria-label={label} style={{ width, height, zoom }}>
      <div className="nwm-fold-screen">
        {!duo && <StatusBar device={spec.os} camera={false} />}
        <div className="nwm-fold-pane nwm-fold-pane--library">
          {duo && <StatusBar device={spec.os} camera={false} />}
          {children[0]}
          {duo && home}
        </div>
        <span className="nwm-fold-hinge" aria-hidden="true" />
        <div className="nwm-fold-pane nwm-fold-pane--note">
          {duo && <StatusBar device={spec.os} camera={false} />}
          {children[1]}
          {duo && home}
        </div>
        {!duo && <span className="nwm-fold-camera" aria-hidden="true" />}
        {!duo && home}
      </div>
    </div>
  );
}

/** iOS navigation bar or Android top app bar. */
function MobileTopBar({
  device,
  back,
  focusBack = false,
  title,
  trailing,
}: {
  device: Device;
  back?: { label: string; onClick: () => void };
  /** Make the back button the screen's landing point for focus. */
  focusBack?: boolean;
  /** Android names the screen in the bar; iOS uses a large title below it. */
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="nwm-mtopbar">
      {back ? (
        <button
          type="button"
          className="nwm-mback"
          onClick={back.onClick}
          aria-label={`Back to ${back.label}`}
          data-screen-focus={focusBack ? '' : undefined}
        >
          {device === 'ios' ? (
            <>
              <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
              <span className="nwm-mback-label">{back.label}</span>
            </>
          ) : (
            <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      ) : (
        <span className="nwm-mtopbar-start" />
      )}
      {title}
      <span className="nwm-mtopbar-end">{trailing}</span>
    </header>
  );
}

/** iOS puts New note in the toolbar; Android floats it, or docks it in the bottom app bar. */
function ComposeButton({ device, docked = false, onCreate }: { device: Device; docked?: boolean; onCreate: () => void }) {
  if (device === 'ios') {
    return (
      <button type="button" className="nwm-mtool nwm-mtool--compose" onClick={onCreate} aria-label="New note" title="New note">
        <SquarePen size={22} strokeWidth={1.9} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={docked ? 'nwm-mfab nwm-mfab--docked' : 'nwm-mfab'}
      onClick={onCreate}
      aria-label="New note"
      title="New note"
    >
      <Plus size={24} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function IosToolbar({ status, onCreate }: { status: ReactNode; onCreate: () => void }) {
  return (
    <div className="nwm-mtoolbar">
      <span />
      <span className="nwm-mtoolbar-status" aria-live="polite">
        {status}
      </span>
      <ComposeButton device="ios" onCreate={onCreate} />
    </div>
  );
}

function CollectionRow({
  device,
  label,
  count,
  icon,
  active,
  onClick,
}: {
  device: Device;
  label: string;
  count: number;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="nwm-mrow"
        aria-current={active ? 'true' : undefined}
        aria-label={`${label}, ${plural(count, 'note')}`}
        data-return-focus={active ? '' : undefined}
        onClick={onClick}
      >
        <span className="nwm-mrow-icon">{icon}</span>
        <span className="nwm-mrow-label">{label}</span>
        <span className="nwm-mrow-count" aria-hidden="true">
          {count}
        </span>
        {device === 'ios' && <ChevronRight size={16} strokeWidth={2.2} className="nwm-mrow-chevron" aria-hidden="true" />}
      </button>
    </li>
  );
}

function MobileNoteRow({
  note,
  active,
  returnFocus,
  showNotebook,
  onOpen,
}: {
  note: Note;
  active: boolean;
  returnFocus: boolean;
  showNotebook: boolean;
  onOpen: () => void;
}) {
  const text = snippet(note.body);
  const NotebookIcon = NOTEBOOK_ICONS[note.notebook];
  return (
    <li>
      <button
        type="button"
        className="nwm-mnote"
        aria-current={active ? 'true' : undefined}
        data-return-focus={returnFocus ? '' : undefined}
        onClick={onOpen}
      >
        <span className={note.title ? 'nwm-mnote-title' : 'nwm-mnote-title is-untitled'}>{note.title || UNTITLED}</span>
        {note.favourite && (
          <span className="nwm-mnote-star">
            <Star size={13} strokeWidth={2} fill="currentColor" aria-hidden="true" />
            <span className="nwm-visually-hidden">Favourite</span>
          </span>
        )}
        <span className="nwm-mnote-time">{note.updated}</span>
        <span className="nwm-mnote-snippet">{text || 'No text yet'}</span>
        {showNotebook && (
          <span className="nwm-mnote-notebook">
            <NotebookIcon size={12} strokeWidth={2} aria-hidden="true" />
            {notebookName(note.notebook)}
          </span>
        )}
      </button>
    </li>
  );
}

function MobileNotes({
  s,
  onOpen,
  showSelection,
}: {
  s: NotesState;
  onOpen: (id: string) => void;
  showSelection: boolean;
}) {
  if (!s.visible.length) return <EmptyList s={s} />;
  return (
    <ul className="nwm-mnotes" role="list">
      {s.visible.map((n) => (
        <MobileNoteRow
          key={n.id}
          note={n}
          active={showSelection && n.id === s.selected.id}
          returnFocus={n.id === s.selected.id}
          showNotebook={s.view.kind !== 'notebook'}
          onOpen={() => onOpen(n.id)}
        />
      ))}
    </ul>
  );
}

/** Library home: collections and notebooks, with search across every note. */
function MobileLibrary({
  device,
  s,
  onShow,
  onSearch,
  onOpen,
  onCreate,
  showSelection,
}: {
  device: Device;
  s: NotesState;
  onShow: (view: View) => void;
  onSearch: (query: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  showSelection: boolean;
}) {
  const ios = device === 'ios';
  const searching = s.query.trim() !== '';
  const status = searching ? plural(s.visible.length, 'result') : '';
  const iconSize = ios ? 19 : 20;
  const row = (view: View, label: string, count: number, icon: ReactNode) => (
    <CollectionRow
      key={label}
      device={device}
      label={label}
      count={count}
      icon={icon}
      active={sameView(s.view, view)}
      onClick={() => onShow(view)}
    />
  );

  return (
    <div className="nwm-mscreen">
      <header className="nwm-mappbar">
        <h3 className="nwm-mappbar-title" tabIndex={-1} data-screen-focus="">
          <span className="nwm-mappicon" aria-hidden="true">
            <Logo size={14} />
          </span>
          NoteWren
        </h3>
      </header>
      <div className="nwm-mscroll">
        <div className="nwm-msearch">
          <SearchField query={s.query} onQuery={onSearch} />
        </div>
        {!ios && (
          <p className="nwm-mstatus" aria-live="polite">
            {status}
          </p>
        )}
        {searching ? (
          <MobileNotes s={s} onOpen={onOpen} showSelection={showSelection} />
        ) : (
          <>
            <ul className="nwm-mrows" role="list" aria-label="Library">
              {row({ kind: 'all' }, 'All notes', s.counts.all, <Files size={iconSize} strokeWidth={1.8} aria-hidden="true" />)}
              {row(
                { kind: 'favourites' },
                'Favourites',
                s.counts.favourites,
                <Star size={iconSize} strokeWidth={1.8} aria-hidden="true" />,
              )}
            </ul>
            <h4 className="nwm-msection">Notebooks</h4>
            <ul className="nwm-mrows" role="list" aria-label="Notebooks">
              {NOTEBOOKS.map((nb) => {
                const Icon = NOTEBOOK_ICONS[nb.id];
                return row(
                  { kind: 'notebook', id: nb.id },
                  nb.name,
                  s.counts[nb.id],
                  <Icon size={iconSize} strokeWidth={1.8} aria-hidden="true" />,
                );
              })}
            </ul>
          </>
        )}
      </div>
      {ios ? <IosToolbar status={status} onCreate={onCreate} /> : <ComposeButton device={device} onCreate={onCreate} />}
    </div>
  );
}

/** The notes in one collection, reached from the library. */
function MobileNoteList({
  device,
  s,
  onBack,
  onOpen,
  onCreate,
  showSelection,
}: {
  device: Device;
  s: NotesState;
  onBack: () => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  showSelection: boolean;
}) {
  const ios = device === 'ios';
  const status = s.query.trim() ? plural(s.visible.length, 'result') : plural(s.visible.length, 'note');
  const title = (
    <h3 className={ios ? 'nwm-mlargetitle' : 'nwm-mtopbar-title'} tabIndex={-1} data-screen-focus="">
      {viewLabel(s.view)}
    </h3>
  );

  return (
    <div className="nwm-mscreen">
      <MobileTopBar device={device} back={{ label: 'Library', onClick: onBack }} title={ios ? undefined : title} />
      <div className="nwm-mscroll">
        {ios && title}
        <div className="nwm-msearch">
          <SearchField query={s.query} onQuery={s.setQuery} />
        </div>
        {!ios && (
          <p className="nwm-mstatus" aria-live="polite">
            {status}
          </p>
        )}
        <MobileNotes s={s} onOpen={onOpen} showSelection={showSelection} />
      </div>
      {ios ? <IosToolbar status={status} onCreate={onCreate} /> : <ComposeButton device={device} onCreate={onCreate} />}
    </div>
  );
}

function MobileNote({
  device,
  s,
  back,
  onCreate,
}: {
  device: Device;
  s: NotesState;
  /** Omitted when both phones are visible, since the library is already on screen. */
  back?: { label: string; onClick: () => void };
  onCreate: () => void;
}) {
  const note = s.selected;
  const ios = device === 'ios';
  const favourite = (
    <button
      type="button"
      className="nwm-mtool"
      aria-pressed={note.favourite}
      aria-label="Favourite"
      title={note.favourite ? 'Remove from favourites' : 'Add to favourites'}
      onClick={() => s.toggleFavourite(note.id)}
    >
      <Star size={ios ? 21 : 22} strokeWidth={1.9} fill={note.favourite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
  const status = note.edited ? <PreviewPill /> : <span className="nwm-mformat">Markdown</span>;

  return (
    <div className="nwm-mscreen nwm-mscreen--note">
      <div hidden={s.graphOpen} inert={s.graphOpen}><MobileTopBar device={device} back={back} focusBack trailing={<><BranchToggle s={s} />{favourite}</>} /></div>
      <div className={`nwm-mscroll ${s.graphOpen ? 'nwm-mscroll--branches' : 'nwm-mscroll--note'}`}>
        {s.graphOpen && <NoteBranchGraph s={s} />}
        <div hidden={s.graphOpen} inert={s.graphOpen}>
          <NoteFields key={`${note.id}:${note.activeBranchId}`} note={note} s={s} variant="mobile" />
        </div>
      </div>
      {!s.graphOpen && (ios ? (
        <IosToolbar status={status} onCreate={onCreate} />
      ) : (
        <div className="nwm-mbottombar">
          <span className="nwm-mtoolbar-status">{status}</span>
          <ComposeButton device={device} docked onCreate={onCreate} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export function PlatformMockups({ platform }: { platform: Platform }) {
  if (platform === 'mobile') return <MobileMockup />;
  // Keyed so switching between desktop platforms starts from the same sample notes.
  return <DesktopMockup key={platform} platform={platform} />;
}

export default PlatformMockups;
