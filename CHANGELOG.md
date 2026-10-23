# Changelog

## 0.1.0

- Added an interactive design reference with macOS, Windows, Omarchy, iPhone and Android mockups, plus open iPhone Fold, Android fold and Surface Duo frames with the library and note side by side.
- Added shared sample-note editing, search, notebook filters, favourites and desktop focus mode.
- Replaced the body textarea with a CodeMirror Markdown editor that formats headings, lists, task boxes, emphasis, links and code in place and shows syntax only on the caret line.
- Flattened the desktop layout: one surface across all panes, a shared toolbar row, tonal selection, word count in the editor toolbar. macOS traffic lights sit in the sidebar toolbar; Windows has a title bar with caption buttons.
- Gave iPhone and Android their own navigation, list and toolbar layouts instead of the desktop cards.
- Added an OS theme picker to the Omarchy mockup: seven palettes copied from Omarchy `colors.toml` files recolour the frame and the app inside it for the session.
- Redrew the wren tail as an exclamation mark that holds its gaps at 16px, and raised small reference text to 12px at weight 500.
- Added semantic light/dark tokens, self-hosted typography and reusable React controls.
- Added geometric wren SVGs with transparent cutouts, filled variants and two app icons.
- Added component validation, simulated loading, empty-state and document-state examples.
- Kept storage, authentication, native shells and sync outside this design-system release.
