# NoteWren

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React and TypeScript design reference plus a Tauri 2 macOS app backed by a Rust core. The native app and local sync server are implemented for local development; the web reference remains illustrative.
## Users

The owner wants one Markdown notes library available on macOS and Omarchy, with iPhone and Android clients later.

## Product Purpose

A free, open-source, local-first Markdown notes app with note branching and optional self-hosted sync. Users can customise the MIT-licensed code, own their data and run their own sync server. The intended experience is one notes library across devices, with a local database on each device for offline writing.

## Capabilities and Constraints

The current deliverable includes a reusable design system, genuine SVG assets, macOS mockups and a native macOS app with SQLite-backed local storage and branching. The local sync server supports authenticated self-hosted development. Mockup notes remain illustrative. Future sync must preserve both versions of conflicting edits. Never share a live SQLite database file between devices.

The Rust core owns note operations, SQL and migrations for the app, CLI and MCP. Store revisions and branch ancestry explicitly; keep synchronisation separate from the storage engine. Turso evaluation remains future work.

Planned agent access uses a CLI and MCP interface over the same Rust core and local library as the graphical app. It must support offline note search, reading, creation and editing without a sync server. The intended executable ships with the desktop install and separately for headless use; MCP registration is opt-in. Neither interface is implemented yet.

One-click deployment of the optional sync server is planned. Evaluate Vercel or Netlify for the API with Neon as Postgres storage, alongside a Docker option for a VPS or home server. These are deployment candidates, not selected infrastructure. Setup must provision storage, configure authentication and return a server URL without exposing secrets in URLs. Publish deploy buttons only after the complete backend deployment has been exercised. The selected sync protocol must fit the host's connection, execution and payload limits.

### Branching

Branching lets a writer explore another version of a note while keeping the original available. A Git-like graph shows where each branch started. The interaction separates the branch being inspected from the current writing branch. Continuing on another branch is an explicit choice.

The web reference covers branches of individual sample notes in memory. The native app persists notes, revisions and per-note branches in SQLite. A new branch copies its parent's title and Markdown body, then keeps its own edits. Comparison uses the immutable fork snapshot. Branches can be named, inspected, renamed, archived, restored and deleted where the controls allow.

The native app currently exposes Editor, Branches and History views. Inspecting a branch or revision does not change the current writing branch. Continuing on an inspected branch requires an explicit switch. Notebook-wide branches need transactions covering notebook membership and remain future work.

Agent work is planned to run in a separate, named branch through the CLI or MCP interface. The mockup's Agent label identifies sample authorship; it does not run an agent. CLI/MCP access and agent execution are not implemented yet.

The [automatic branching and sync plan](docs/automatic-branching.md) specifies first-edit forks from older revisions, isolated agent edits and conflict recovery. Concurrent edits to the same branch should use deterministic three-way text merging when clean, retaining both input revisions. Conflicts preserve complete drafts on separate branches. Deliberate branches remain separate; a manual branch-merging interface is outside the current scope.

## Brand Commitments

Use NoteWren as the working product name and the supplied geometric wren SVG geometry. The upright exclamation-mark tail, wing cutout, bold sans-serif wordmark, cream-and-black icon and terracotta accent are approved. Filled and negative-space symbols belong to the same family. Green and blue are secondary identity colours. Transparent cutouts must work on every background.

## Evidence on Hand

The owner supplied two SVG variants and three visual reference boards. The boards show identity and interface concepts, not functioning software. Their references to extra file formats do not expand the agreed Markdown scope. Name and trademark clearance remain open.

## Product Principles

- Writing remains the main task.
- Files remain portable.
- Offline work must be preserved.
- Platform presentation may adapt while documents and terminology stay consistent.
