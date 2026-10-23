# Automatic branching and sync

Status: local Rust storage, per-note branching and self-hosted HTTP reconciliation are implemented for development. The web reference keeps sample notes in memory. Notebook-wide branching, CLI/MCP access and hosted deployment remain planned.

## Goal

Keep everyday writing on the current branch. Preserve alternatives when the writer asks for them or concurrent edits cannot be combined safely. One library is available across devices, with a local database on each device and optional self-hosted sync.

## Behaviour

| Action | Planned result |
|---|---|
| Type, autosave, reopen a note or change devices | Continue the current branch; save revisions without creating branches |
| Inspect a branch or old revision | Read only; leave the writing branch unchanged |
| Edit an older revision | Create a branch on the first content change, retaining the newer draft |
| Explicitly create a branch | Copy the selected revision into an independent draft |
| Agent edits through CLI or MCP | Write to a named agent branch; leave the user's writing branch unchanged |
| Only one device changed a branch | Apply its changes on other devices |
| Concurrent identical edits | Keep one resulting draft and preserve revision ancestry |
| Concurrent edits to the same branch combine cleanly | Three-way merge against their common ancestor |
| Concurrent edits conflict | Preserve both drafts on separate branches for comparison |
| Edits belong to deliberately separate branches | Keep those branches separate |

Automatic sync merging does not add a manual branch-merging feature. Writers can compare deliberate branches, copy passages and explicitly choose where to continue writing.

## Merge and preservation rules

Use a deterministic text merge, never an AI rewrite. Merge title and Markdown body against their common revision. Different changes to the same title conflict. Start conservatively with line-based body merging: overlapping incompatible edits conflict. If either field conflicts, preserve complete title/body pairs as separate drafts rather than publishing a partially merged note. Missing ancestry also requires preservation rather than guessing.

Retain both input revisions and the common ancestor. A successful merge produces a revision with both parents, labelled as a sync merge in history. Restoring an input revision must be possible without deleting subsequent history. A clean textual merge does not guarantee that the combined prose makes sense.

The sync server serialises accepted branch-head updates using an expected revision. On a stale update, merge against the accepted head or preserve the incoming draft as a conflict branch. Stable operation IDs make retries idempotent, including conflict-branch creation. Devices eventually agree on branch IDs, heads and ancestry regardless of delivery order. The accepted head remains on the existing branch when a conflict is preserved; the incoming draft receives the conflict branch. Device clocks must not decide which content survives.

Never replace an actively edited buffer silently. Commit pending local edits before integrating incoming changes, then re-evaluate against that saved revision. If those edits become a conflict branch, keep the editor on the preserved local draft and explain the new branch label. Persist content, branch changes and outgoing sync operations atomically. A failed write must leave the previous durable state intact and show an unsaved/error state.

## Implementation status

The Rust storage core, per-note branching and self-hosted HTTP reconciliation are implemented for local development. The Tauri app uses the same core for durable notes, revision history, branches, settings and sync. The web reference remains an in-memory illustration. Notebook-wide branching, CLI/MCP access and hosted deployment remain planned.

The implementation uses immutable revisions with Unix epoch millisecond timestamps. Revisions written before timestamps existed retain `null` timestamps when read. History inspection is read-only; switching the writing branch is explicit.

The server's automated tests cover authentication, pull, push, idempotent receipts and two-client convergence. A local two-client smoke must still exercise two independent SQLite libraries through the HTTP API before this feature is described as production-ready.

Notebook-wide branching remains planned separately. It needs transactions covering notebook membership and its notes. This plan specifies per-note text reconciliation, not notebook membership conflicts, attachments, collaborative cursors or a manual merge interface. Deletion versus editing must preserve edited content for recovery; deletion must never silently discard concurrent work.

## Acceptance checks

The implementer owns automated storage and reconciliation checks and a running two-client smoke demonstration. Dan reviews the resulting writing and conflict flows.

- Ordinary edits and reopening preserve the branch ID; revision history grows without extra branches.
- Viewing history creates no branch. The first edit forks exactly once and leaves the newer draft unchanged.
- Agent edits do not change the user's branch head or active writing selection.
- One-sided changes and identical concurrent changes converge without conflict branches.
- Independent body edits merge with both edits retained; the merge revision references both inputs and can be reversed through history.
- Incompatible title or body edits preserve both complete drafts without conflict markers in the writing buffer.
- Deliberate branches remain separate even when their changes could merge cleanly.
- Repeated requests, reconnects and reordered delivery produce no duplicate conflict branches or lost revisions.
- Incoming sync during typing preserves pending text and keeps the writer on their draft.
- Simulated failure during persistence leaves either the complete old state or the complete new state, never a partial branch.
- Concurrent deletion and editing retain the edited draft for recovery.
- Two disconnected clients reconnect and converge on the same content, branch IDs and ancestry.

Before implementation, select and evaluate the text-merge library against these cases. Escalate to Dan if the chosen sync protocol cannot preserve ancestry, idempotency or active drafts. Do not weaken these requirements silently.
