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

Planned agent access uses a CLI and MCP interface over the same Rust core and local library as the graphical app. It must support offline note search, reading, creation and editing without a sync server. The intended executable ships with the desktop install and separately for headless use; MCP registration is opt-in. Neither interface is implemented yet.

## Brand Commitments

Use NoteWren as the working product name and the supplied geometric wren SVG geometry. The upright exclamation-mark tail, wing cutout, bold sans-serif wordmark, cream-and-black icon and terracotta accent are approved. Filled and negative-space symbols belong to the same family. Green and blue are secondary identity colours. Transparent cutouts must work on every background.

## Evidence on Hand

The owner supplied two SVG variants and three visual reference boards. The boards show identity and interface concepts, not functioning software. Their references to extra file formats do not expand the agreed Markdown scope. Name and trademark clearance remain open.

## Product Principles

- Writing remains the main task.
- Files remain portable.
- Offline work must be preserved.
- Platform presentation may adapt while documents and terminology stay consistent.
