import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import './BranchGraph.css';

export interface NoteBranch {
  id: string;
  name: string;
  parentId: string | null;
  title: string;
  body: string;
  baseTitle: string;
  baseBody: string;
  archived: boolean;
}

export interface BranchGraphProps {
  branches: readonly NoteBranch[];
  activeId: string;
  initialCreate?: boolean;
  onSwitch: (id: string) => Promise<void>;
  onCreate: (parentId: string, name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

type BranchRow = { branch: NoteBranch; depth: number; parentIndex: number | null };
type NameForm = { kind: 'create' | 'rename'; branchId: string; name: string; error: string };

function branchRows(branches: readonly NoteBranch[]): BranchRow[] {
  const children = new Map<string, NoteBranch[]>();
  const ids = new Set(branches.map((branch) => branch.id));
  for (const branch of branches) {
    if (branch.parentId !== null) {
      const siblings = children.get(branch.parentId) ?? [];
      siblings.push(branch);
      children.set(branch.parentId, siblings);
    }
  }
  const rows: BranchRow[] = [];
  const visited = new Set<string>();
  function visit(branch: NoteBranch, depth: number, parentIndex: number | null) {
    if (visited.has(branch.id)) return;
    visited.add(branch.id);
    const index = rows.length;
    rows.push({ branch, depth, parentIndex });
    for (const child of children.get(branch.id) ?? []) visit(child, depth + 1, index);
  }
  for (const branch of branches) {
    if (branch.parentId === null || !ids.has(branch.parentId)) visit(branch, 0, null);
  }
  return rows;
}

function nameError(name: string, branches: readonly NoteBranch[], exceptId?: string) {
  if (!name.trim()) return 'Enter a branch name.';
  if (name.trim().length > 48) return 'Use 48 characters or fewer.';
  if (branches.some((branch) => branch.id !== exceptId && branch.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    return 'That name is already in use, including archived branches. Choose another.';
  }
  return '';
}

export function BranchGraph({ branches, activeId, initialCreate = false, onSwitch, onCreate, onRename, onArchive, onDelete, onClose }: BranchGraphProps) {
  const id = useId();
  const [inspectedId, setInspectedId] = useState(activeId);
  const [comparisonId, setComparisonId] = useState('');
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [form, setForm] = useState<NameForm | null>(() => initialCreate ? { kind: 'create', branchId: activeId, name: '', error: '' } : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rows = useMemo(() => branchRows(branches), [branches]);
  const inspected = branches.find((branch) => branch.id === inspectedId)
    ?? branches.find((branch) => branch.id === activeId) ?? branches[0];
  const comparison = branches.find((branch) => branch.id === comparisonId && branch.id !== inspected?.id);
  const railWidth = Math.max(22, ...rows.map((row) => row.depth * 20 + 22));
  const formKind = form?.kind;
  const formBranchId = form?.branchId;

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { if (formKind) inputRef.current?.focus(); }, [formKind, formBranchId]);
  useEffect(() => { if (confirmDelete) cancelDeleteRef.current?.focus(); }, [confirmDelete]);

  function cancelForm() {
    const trigger = form?.kind === 'create' ? createRef : renameRef;
    setForm(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function submitName(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const source = branches.find((branch) => branch.id === form.branchId);
    if (!source) return;
    const error = nameError(form.name, branches, form.kind === 'rename' ? source.id : undefined);
    if (error) {
      setForm({ ...form, error });
      inputRef.current?.focus();
      return;
    }
    void perform(async () => {
      if (form.kind === 'create') {
        if (source.archived) return;
        await onCreate(source.id, form.name.trim());
        setForm(null);
      } else {
        await onRename(source.id, form.name.trim());
        setAnnouncement(`Branch renamed to ${form.name.trim()}.`);
        cancelForm();
      }
    });
  }

  function inspect(branchId: string) {
    setInspectedId(branchId);
    setComparisonId('');
    setComparisonOpen(false);
    setManagementOpen(false);
    setForm(null);
    setConfirmDelete(false);
    setAnnouncement('');
  }

  const isOriginal = inspected?.parentId === null;
  const isWriting = inspected?.id === activeId;
  const hasChildren = branches.some((branch) => branch.parentId === inspected?.id);
  const deleteReason = isOriginal ? 'The original branch is kept.'
    : isWriting ? 'Switch your writing branch before deleting this one.'
      : hasChildren ? 'This branch has descendants. Delete its leaf branches first.'
        : !inspected?.archived ? 'Archive this branch before deleting it.' : '';
  const archiveReason = isOriginal ? 'The original branch stays available.'
    : isWriting ? 'Switch your writing branch before archiving this one.' : '';
  const parent = branches.find((branch) => branch.id === inspected?.parentId);
  const referenceTitle = comparison?.title ?? inspected?.baseTitle ?? '';
  const referenceBody = comparison?.body ?? inspected?.baseBody ?? '';
  const titleDiffers = inspected?.title !== referenceTitle;
  const bodyDiffers = inspected?.body !== referenceBody;
  const referenceLabel = comparison?.name ?? (isOriginal ? 'Original snapshot' : 'Fork point');

  return <section className="nw-branch-graph" aria-labelledby={`${id}-heading`}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (form) cancelForm();
      else if (confirmDelete) {
        setConfirmDelete(false);
        requestAnimationFrame(() => deleteRef.current?.focus());
      } else onClose();
    }}>
    <fieldset className="branch-controls" disabled={busy} aria-busy={busy}>
    <header className="nw-branch-header">
      <h2 ref={headingRef} tabIndex={-1} id={`${id}-heading`}>Branches</h2>
      <p>{branches.length === 1 ? 'One draft so far. Create a branch to try another version without changing this one.' : 'Choose a branch to compare drafts or switch where you write.'}</p>
    </header>
    <p className="nw-branch-status" role="status">{announcement}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {!inspected ? <p className="nw-branch-empty">There are no branches in this note yet.</p> : <>
      <div className="nw-branch-command">
        <div className="nw-branch-actions">
          {!isWriting && <button className="nw-branch-button" type="button" disabled={inspected.archived}
            aria-describedby={inspected.archived ? `${id}-archived` : undefined} onClick={() => void perform(() => onSwitch(inspected.id))}>
            <Pencil size={14} aria-hidden="true" /> Switch to this branch
          </button>}
          <button ref={createRef} className="nw-branch-button nw-branch-button--primary" type="button" disabled={inspected.archived}
            aria-describedby={inspected.archived ? `${id}-archived` : undefined}
            onClick={() => { setConfirmDelete(false); setForm({ kind: 'create', branchId: inspected.id, name: '', error: '' }); }}>
            <Plus size={15} aria-hidden="true" /> New branch
          </button>
        </div>
        {!isWriting && <p className="nw-branch-hint">Selected: {inspected.name}. Your current draft is unchanged.</p>}
      </div>
      <ol className="nw-branch-tree" aria-label="Branch ancestry" style={{ '--branch-rail-width': `${Math.min(104, railWidth)}px` } as CSSProperties}>
        {rows.map((row, index) => {
          const { branch, depth } = row;
          const paths = new Set<string>();
          for (let childIndex = 0; childIndex < rows.length; childIndex++) {
            const child = rows[childIndex];
            if (child.parentIndex === null || index < child.parentIndex || index > childIndex) continue;
            const parentX = rows[child.parentIndex].depth * 20 + 10;
            const childX = child.depth * 20 + 10;
            if (index === child.parentIndex) paths.add(`M${parentX} 50 V100`);
            else if (index === childIndex) paths.add(`M${parentX} 0 V50 H${childX}`);
            else paths.add(`M${parentX} 0 V100`);
          }
          const selected = inspected.id === branch.id;
          const branchParent = branches.find((candidate) => candidate.id === branch.parentId);
          return <li className={`nw-branch-row${selected ? ' is-inspected' : ''}`} key={branch.id}>
            <div className={`nw-branch-rail${branch.id === activeId ? ' is-writing' : ''}`} aria-hidden="true">
              <svg viewBox={`0 0 ${railWidth} 100`} preserveAspectRatio="none">
                {[...paths].map((path) => <path key={path} d={path} vectorEffect="non-scaling-stroke" />)}
              </svg>
              <span className="nw-branch-dot" style={{ left: `${(depth * 20 + 10) / railWidth * 100}%` }} />
            </div>
            <button ref={(element) => { if (element) rowRefs.current.set(branch.id, element); else rowRefs.current.delete(branch.id); }}
              type="button" className="nw-branch-node" aria-pressed={selected} onClick={() => inspect(branch.id)}>
              <span className="nw-branch-node-heading"><strong>{branch.name}</strong>
                {branch.id === activeId && <span className="nw-branch-writing"><Pencil size={11} aria-hidden="true" /> Current draft</span>}
              </span>
              {branch.parentId !== null && <span className="nw-branch-meta">From {branchParent?.name ?? 'unavailable parent'}</span>}
              {branch.archived && <span className="nw-branch-node-state">Archived</span>}
            </button>
          </li>;
        })}
      </ol>
      <div className="nw-branch-detail">
        <div className="nw-branch-actions">
          <button className="nw-branch-button" type="button" aria-expanded={comparisonOpen} aria-controls={`${id}-comparison`}
            onClick={() => setComparisonOpen(!comparisonOpen)}>Compare drafts</button>
          <button className="nw-branch-button nw-branch-button--quiet" type="button" aria-expanded={managementOpen} aria-controls={`${id}-management`}
            onClick={() => { setManagementOpen(!managementOpen); setConfirmDelete(false); if (form?.kind === 'rename') setForm(null); }}>Manage branch</button>
          {managementOpen && <button ref={renameRef} className="nw-branch-button nw-branch-button--quiet" type="button"
            onClick={() => { setConfirmDelete(false); setForm({ kind: 'rename', branchId: inspected.id, name: inspected.name, error: '' }); }}>Rename</button>}
        </div>
        {inspected.archived && <p className="nw-branch-hint" id={`${id}-archived`}>Restore this branch to write in it or create a branch from it.</p>}
        {form && form.branchId === inspected.id && <form className="nw-branch-form" onSubmit={submitName}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelForm(); } }}>
          <label htmlFor={`${id}-name`}>{form.kind === 'create' ? `New branch from ${inspected.name}` : 'Rename branch'}</label>
          <input ref={inputRef} id={`${id}-name`} value={form.name} autoComplete="off" maxLength={48}
            aria-invalid={!!form.error} aria-describedby={`${id}-name-hint`}
            onChange={(event) => setForm({ ...form, name: event.target.value, error: '' })} />
          <p id={`${id}-name-hint`} className="nw-branch-hint" role={form.error ? 'alert' : undefined}>
            {form.error || (form.kind === 'create' ? 'A unique name, up to 48 characters. Copies this draft and starts writing in the new branch.' : 'A unique name, up to 48 characters.')}
          </p>
          <div className="nw-branch-actions">
            <button className="nw-branch-button nw-branch-button--primary" type="submit">{form.kind === 'create' ? 'Create branch' : 'Save name'}</button>
            <button className="nw-branch-button" type="button" onClick={cancelForm}>Cancel</button>
          </div>
        </form>}
        <section id={`${id}-comparison`} hidden={!comparisonOpen} className="nw-branch-comparison" aria-label={`Compare ${inspected.name}`}>
          <label className="nw-branch-compare-label" htmlFor={`${id}-compare`}>Compare with</label>
          <select id={`${id}-compare`} value={comparison?.id ?? ''} onChange={(event) => setComparisonId(event.target.value)}>
            <option value="">{isOriginal ? 'Original snapshot' : 'Fork point'}</option>
            {branches.filter((branch) => branch.id !== inspected.id).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.archived ? ' (archived)' : ''}</option>)}
          </select>
          <p className="nw-branch-hint">{comparison ? 'Compared with the other branch’s current draft.' : isOriginal ? 'Compared with the original draft before editing.' : `The draft copied from ${parent?.name ?? 'the parent branch'} when this branch was created. Later parent edits do not change it.`}</p>
          <p className="nw-branch-diff-summary" role="status">{!titleDiffers && !bodyDiffers ? 'Identical title and body.' : `${titleDiffers ? 'Title differs.' : 'Title unchanged.'} ${bodyDiffers ? 'Body differs.' : 'Body unchanged.'}`}</p>
          <div className="nw-branch-compare-columns">
            <article className="nw-branch-draft" aria-label={`Reference: ${referenceLabel}`}>
              <h5>{referenceLabel}</h5>
              <p className="nw-branch-draft-title">{referenceTitle || <em>Untitled</em>}</p>
              <div className="nw-branch-draft-body">{referenceBody || <em>Empty body</em>}</div>
            </article>
            <article className="nw-branch-draft" aria-label={`Selected branch: ${inspected.name}`}>
              <h5>{inspected.name}</h5>
              <p className="nw-branch-draft-title">{inspected.title || <em>Untitled</em>}</p>
              <div className="nw-branch-draft-body">{inspected.body || <em>Empty body</em>}</div>
            </article>
          </div>
        </section>
        <section id={`${id}-management`} hidden={!managementOpen} className="nw-branch-manage" aria-label={`Manage ${inspected.name}`}>
          <div>
            <button className="nw-branch-button" type="button" disabled={!inspected.archived && !!archiveReason}
              aria-describedby={!inspected.archived && archiveReason ? `${id}-archive-reason` : undefined}
              onClick={() => void perform(async () => { if (form?.kind === 'create') setForm(null); await onArchive(inspected.id); setAnnouncement(`${inspected.name} ${inspected.archived ? 'restored' : 'archived'}.`); })}>
              {inspected.archived ? 'Restore' : 'Archive'}
            </button>
            <p className="nw-branch-hint" id={`${id}-archive-reason`}>{!inspected.archived && archiveReason ? archiveReason : 'Archived branches keep their draft and ancestry.'}</p>
          </div>
          <div>
            <button ref={deleteRef} className="nw-branch-button nw-branch-button--quiet" type="button" disabled={!!deleteReason}
              aria-describedby={`${id}-delete-reason`} onClick={() => { setForm(null); setConfirmDelete(true); }}>Delete branch</button>
            <p className="nw-branch-hint" id={`${id}-delete-reason`}>{deleteReason || 'Only this leaf branch is removed. Its parent is unchanged.'}</p>
          </div>
          {confirmDelete && !deleteReason && <div className="nw-branch-delete-confirm" role="group" aria-labelledby={`${id}-delete-title`}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setConfirmDelete(false); requestAnimationFrame(() => deleteRef.current?.focus()); } }}>
            <p id={`${id}-delete-title`}>Delete {inspected.name}? It will be removed from the branch list. Stored revisions remain available for recovery.</p>
            <div className="nw-branch-actions">
              <button className="nw-branch-button" type="button" onClick={() => void perform(async () => {
                const nextId = parent?.id ?? activeId;
                await onDelete(inspected.id);
                inspect(nextId);
                setAnnouncement(`${inspected.name} deleted.`);
                requestAnimationFrame(() => rowRefs.current.get(nextId)?.focus());
              })}>Delete branch</button>
              <button ref={cancelDeleteRef} className="nw-branch-button" type="button" onClick={() => { setConfirmDelete(false); requestAnimationFrame(() => deleteRef.current?.focus()); }}>Cancel</button>
            </div>
          </div>}
        </section>
      </div>
    </>}
    </fieldset>
  </section>;
}

