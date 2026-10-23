# Changelog

## 0.1.0

- Added an interactive design reference with macOS, Windows, Omarchy, iPhone and Android mockups, plus open iPhone Fold, Android fold and Surface Duo frames with the library and note side by side.
- Added shared sample-note editing, search, notebook filters, favourites and desktop focus mode.
- Replaced the body textarea with a CodeMirror Markdown editor that formats headings, lists, task boxes, emphasis, links and code in place and shows syntax only on the caret line.
- Flattened the desktop layout: one surface across all panes, a shared toolbar row, tonal selection, word count in the editor toolbar. macOS traffic lights sit in the sidebar toolbar; Windows has a title bar with caption buttons.
- Gave iPhone and Android their own navigation, list and toolbar layouts instead of the desktop cards.
- Added an OS theme picker to the Omarchy mockup: Tokyo Night and Flexoki Light recolour the frame, app and branch graph for the session.
- Refined Omarchy text hierarchy: ordinary text uses the palette foreground, headings use its brighter foreground, and metadata uses a quieter mixed colour.
- Redrew the wren tail as an exclamation mark that holds its gaps at 16px, and raised small reference text to 12px at weight 500.
- Added semantic light/dark tokens, self-hosted typography and reusable React controls.
- Added geometric wren SVGs with transparent cutouts, filled variants and two app icons.
- Added component validation, simulated loading, empty-state and document-state examples.
- Added independent note branches, ancestry graphs, fork-point comparisons, renaming, archive/restore and protected deletion to desktop and mobile previews and the component showcase.
- Kept the current editor mounted during branch inspection so returning to the same draft preserves undo history.
- Added clickable light-and-dark mockup thumbnails and a complete platform gallery to the README.
- Kept storage, authentication, native shells and sync outside this design-system release.
