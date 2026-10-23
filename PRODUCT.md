# NoteWren

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React and TypeScript interface for a planned Tauri 2 app with a Rust core. This project currently delivers the design system and interactive platform mockups, not a native application.

## Users

The owner wants one Markdown notes library available on macOS and Omarchy, with iPhone and Android clients later.

## Product Purpose

An open-source Markdown notes app with offline access and a self-hosted document sync server.

## Capabilities and Constraints

The current deliverable is a reusable design system, genuine SVG assets and macOS, Omarchy and mobile mockups. Mockup notes are illustrative. Native storage, authentication and synchronisation are not implemented here. Future sync must preserve both versions of conflicting edits. Never share a live SQLite database file between devices.

Start local storage with standard SQLite through `rusqlite`. One Rust core owns note operations, SQL and migrations for the app, CLI and MCP. Store revisions and branch ancestry explicitly; keep synchronisation separate from the storage engine. Once the SQLite implementation works, evaluate the Turso Rust engine against a copy of the same library, checking content, branches, search, offline conflicts and recovery. Preserve the original library. This is an evaluation plan, not an assumption of drop-in compatibility.

Planned agent access uses a CLI and MCP interface over the same Rust core and local library as the graphical app. It must support offline note search, reading, creation and editing without a sync server. The intended executable ships with the desktop install and separately for headless use; MCP registration is opt-in. Neither interface is implemented yet.

One-click deployment of the optional sync server is planned. Evaluate Vercel or Netlify for the API with Neon as Postgres storage, alongside a Docker option for a VPS or home server. These are deployment candidates, not selected infrastructure. Setup must provision storage, configure authentication and return a server URL without exposing secrets in URLs. Publish deploy buttons only after the complete backend deployment has been exercised. The selected sync protocol must fit the host's connection, execution and payload limits.

### Branching

Branching lets a writer explore another version of a note while keeping the original available. A Git-like graph shows where each branch started. The interaction separates the branch being inspected from the current writing branch. Continuing on another branch is an explicit choice.

The current mockup covers branches of individual sample notes in memory. A new branch copies its parent's title and Markdown body, then keeps its own edits. Comparison uses the immutable title and body captured at the fork point, so later edits to the parent do not change that baseline. Branches can be named, inspected, renamed and archived or deleted where the controls allow. This scope is branching only. Merging is excluded.

The planned native product extends branching to a note or a whole notebook. Notebook-wide branches need transactions that keep the notebook's notes and branch state consistent; those transactions are future work. The per-note mockup does not implement them.

Agent work is planned to run in a separate, named branch through the CLI or MCP interface. An agent must not overwrite the user's current writing branch. The user can inspect its changes and choose to continue writing there. The mockup's Agent label identifies sample authorship; it does not run an agent. Persistent branch storage, notebook-wide transactions and agent execution are not implemented.

## Brand Commitments

Use NoteWren as the working product name and the supplied geometric wren SVG geometry. The upright exclamation-mark tail, wing cutout, bold sans-serif wordmark, cream-and-black icon and terracotta accent are approved. Filled and negative-space symbols belong to the same family. Green and blue are secondary identity colours. Transparent cutouts must work on every background.

## Evidence on Hand

The owner supplied two SVG variants and three visual reference boards. The boards show identity and interface concepts, not functioning software. Their references to extra file formats do not expand the agreed Markdown scope. Name and trademark clearance remain open.

## Product Principles

- Writing remains the main task.
- Files remain portable.
- Offline work must be preserved.
- Platform presentation may adapt while documents and terminology stay consistent.
