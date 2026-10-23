---
name: NoteWren
description: Design system and interactive platform mockups for an open-source Markdown notes app.
colors:
  cream: "#f9f2e6"
  ink: "#171717"
  terracotta: "#d96545"
  moss: "#657a64"
  blue: "#4f6d85"
  bg: "#f9f6f0"
  surface: "#fffcf7"
  surface-raised: "#ffffff"
  surface-sunken: "#f0ece4"
  fg: "#242522"
  muted: "#62645b"
  border: "#dedbd3"
  accent: "#a64028"
  accent-hover: "#8c3420"
  accent-soft: "#f8e8df"
  on-accent: "#ffffff"
  success: "#456343"
  success-soft: "#e9efe5"
  warning: "#80530e"
  warning-soft: "#f8edcf"
  error: "#a33435"
  error-soft: "#fbe8e5"
  focus: "#985039"
  selection: "#edd0ba"
  bg-dark: "#20231f"
  surface-dark: "#282c26"
  surface-raised-dark: "#30352d"
  surface-sunken-dark: "#1b1e1a"
  fg-dark: "#f3f0e7"
  muted-dark: "#b6b9ad"
  border-dark: "#484f42"
  accent-dark: "#f0a084"
  accent-hover-dark: "#ffc0a8"
  accent-soft-dark: "#493229"
  on-accent-dark: "#2c1c16"
  success-dark: "#b2cba2"
  success-soft-dark: "#2d3a27"
  warning-dark: "#e5c27e"
  warning-soft-dark: "#413721"
  error-dark: "#f5aba4"
  error-soft-dark: "#4a2d29"
  focus-dark: "#f0a084"
  selection-dark: "#73503d"
typography:
  display:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "clamp(27px, 3.1vw, 42px)"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-1.55px"
  headline:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "21px"
    fontWeight: 700
    letterSpacing: "-0.6px"
  title:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.4
  overline:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 750
    letterSpacing: "0.08em"
  wordmark:
    fontFamily: "'Manrope Variable', sans-serif"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.045em"
  prose-title:
    fontFamily: "'Source Serif 4 Variable', Georgia, serif"
    fontSize: "2rem"
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  prose-body:
    fontFamily: "'Source Serif 4 Variable', Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.7
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.75rem"
rounded:
  sm: "0.375rem"
  md: "0.625rem"
  lg: "1rem"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 17px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 17px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 17px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-sunken}"
  button-danger:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 17px"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.surface-sunken}"
  badge-neutral:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
    rounded: "5px"
    padding: "5px 9px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
  field-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "11px 13px"
    height: "44px"
  switch:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "20px"
    width: "44px"
    height: "28px"
  switch-on:
    backgroundColor: "{colors.accent}"
  reference-nav-link:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "7px"
    padding: "9px 12px"
    height: "44px"
  reference-nav-link-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  segmented-option:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "8px 15px"
    height: "38px"
  segmented-option-pressed:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    size: "2rem"
  icon-button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  note-row:
    rounded: "{rounded.md}"
    padding: "0.625rem 0.75rem"
  note-row-selected:
    backgroundColor: "{colors.accent-soft}"
  search-field:
    rounded: "{rounded.sm}"
    padding: "0 0.4rem 0 0.625rem"
    height: "2.125rem"
  chip-filter:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem"
    height: "1.875rem"
  chip-filter-pressed:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
  new-note-pill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.375rem"
  preview-pill:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.55rem"
  toast:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    rounded: "9px"
    padding: "12px 12px 12px 18px"
---

# Design System: NoteWren

## Overview

**Creative North Star: "A little room to think"**

NoteWren is a writing tool first, and the system is arranged so the words on the page stay central. Every control, label and heading is set in Manrope, a bold geometric sans. The note itself, its title and its body, is set in Source Serif 4. That split is the main expressive device: the interface speaks in one voice and the writing in another. Surfaces are warm paper neutrals separated by hairlines and small tonal steps. Colour is held back for actions, selection and status.

The identity sits alongside the interface. The supplied geometric wren, with its upright exclamation-mark tail and wing cutout, is drawn in ink on cream with terracotta as the identity accent, and moss and slate blue as secondary tiles. The wing and eye are true transparent holes in a compound path, so the bird works on any background. All shipped brand assets are SVG.

Density follows the platform. The reference site keeps its buttons, fields and section links at a 44px minimum height. The desktop mockups are deliberately compact, close to native macOS and tiled Linux sizing, so their icon buttons, search field and sidebar rows are smaller than 44px. This repository is a React 19 and TypeScript reference of tokens, components and mockups for a planned Tauri 2 app with a Rust core. Mockup notes are sample content held in memory for the session only: edits, new notes, theme and selection reset on reload. Storage, authentication and sync belong to the future native app and do not exist here.

**Key Characteristics:**
- Two typefaces with fixed jobs: Manrope for the interface, Source Serif 4 for the writing.
- Warm off-white light theme and warm green-grey dark theme, swapped by role variables.
- A deeper clay action colour, separate from the identity terracotta.
- Flat chrome built from hairlines and tonal surfaces; one shadow token for floating frames.
- Small radii on controls, pills for chips and mobile actions.
- Status always shown with words as well as colour.
- A wren mark with real negative space, inheriting `currentColor`.

## Colors

Warm paper neutrals, one clay action colour, and a fixed set of identity colours that do not change with the theme.

### Primary

- **Clay action** (#a64028 light, #f0a084 dark): primary buttons, the mobile new-note pill, accent icon buttons, the current nav icon, text buttons and back links, the text caret, the switch's on state and the search field's focus border. The light theme pairs it with white text (#ffffff); the dark theme pairs warm peach with dark text (#2c1c16).
- **Clay hover** (#8c3420 light, #ffc0a8 dark): hover fill for anything that rests on the clay action colour.
- **Clay wash** (#f8e8df light, #493229 dark): the selected note row, the current reference nav link, the current mockup sidebar item, the search focus halo and the spacing specimen bars.

### Secondary

- **Terracotta** (#d96545): the identity accent. Used on the terracotta app icon and logo tile, the terracotta SVG variants, and, by default, the Omarchy active workspace and active window border. It is not the light-theme button colour; the reference states that the deeper clay keeps white button text readable.
- **Moss** (#657a64): secondary identity colour. Appears as a logo tile and as the status dot in the reference sidebar.
- **Slate blue** (#4f6d85): secondary identity colour, used as a logo tile.

### Tertiary

Status roles, each with a strong text colour and a soft fill for badges.

- **Success** (#456343 on #e9efe5; dark #b2cba2 on #2d3a27): up to date, created in preview.
- **Warning** (#80530e on #f8edcf; dark #e5c27e on #413721): pending changes, and the "Stored in this preview only" pill in the mockups.
- **Error** (#a33435 on #fbe8e5; dark #f5aba4 on #4a2d29): conflict, field validation errors, the danger button.

### Neutral

- **Cream** (#f9f2e6): the identity ground. App icon, identity hero, the small logo tile in the sidebar, asset previews and the browser `theme-color`. Fixed in both themes.
- **Ink** (#171717): the bird and wordmark on cream, and the ink logo tile.
- **Canvas** (#f9f6f0 light, #20231f dark): page background.
- **Surface** (#fffcf7 light, #282c26 dark): the site header, empty-state panel.
- **Raised** (#ffffff light, #30352d dark): inputs, secondary buttons, the pressed segment, the note list pane, mobile note cards.
- **Sunken** (#f0ece4 light, #1b1e1a dark): hover fills, segmented control track, neutral badges, mobile search field.
- **Text** (#242522 light, #f3f0e7 dark): body and headings.
- **Muted** (#62645b light, #b6b9ad dark): secondary text, captions, inactive icons and labels.
- **Border** (#dedbd3 light, #484f42 dark): every hairline, field stroke and divider.
- **Focus** (#985039 light, #f0a084 dark): the focus outline.
- **Selection** (#edd0ba light, #73503d dark): text selection.

The mockups derive a few tints from these roles with `color-mix(in oklab, …)` rather than adding colours: the sidebar is canvas mixed 78% with sunken, the editor is surface mixed 86% with clay wash, hairlines are border at 70%, hover is text at 5%, and the active row border is clay action at 45%. Device chrome (phone bezel #1b1916, macOS traffic lights) is local to the mockup frames and is not part of the interface palette. The Omarchy frame reads five `--nwm-frame-*` variables set on `.nwm-desktop--omarchy`: background #1c1d1f, text #d9d5cc, muted #8e8b84, accent identity terracotta, and text on accent #1c1d1f.

**The Two Terracottas Rule.** Identity terracotta (#d96545) belongs to the mark, app tiles and the default Omarchy frame. Interactive elements use the clay action role, never the identity hex.

**The Theme Swap Rule.** Components reference role variables (`--accent`, `--surface`, `--fg`), never theme hexes. Setting `data-theme="dark"` on the root element swaps the roles; identity colours stay fixed. The theme is chosen by the header toggle and is not read from the operating system preference.

**The OS Theme Rule.** On Omarchy, the app follows the desktop theme. The preview's OS theme picker offers Tokyo Night (the default) and Flexoki Light, copied from Omarchy's `themes/<name>/colors.toml` files. `omarchyThemeStyle` maps each palette onto the semantic roles and `--nwm-frame-*` variables, recolouring the frame, editor and branch graph together. Omarchy's divider colour becomes `--border`; its accent becomes `--accent` and `--focus`. The page's light/dark toggle does not change the selected OS palette. This is a session-only simulation; a native build would read the active desktop theme.

**The Words Not Colour Rule.** Every status carries a text label. Colour only reinforces it.

## Typography

**Display Font:** Manrope Variable (with sans-serif fallback)
**Body Font:** Source Serif 4 Variable (with Georgia, serif) for writing; Manrope for interface body text
**Label/Mono Font:** ui-monospace, SFMono-Regular, Consolas, monospace for code and the Omarchy bar

**Character:** Manrope is wide, bold and geometric, which suits the wren's construction and carries the wordmark. Source Serif 4 is a calm reading face, reserved for what the person writes. Both are self-hosted through the `@fontsource-variable` packages, with OFL licences in `public/licences/`.

### Hierarchy

- **Display** (750, clamp(27px, 3.1vw, 42px), 1.2, -1.55px): page headings on the reference site. 29px at 600px and below.
- **Headline** (700, 21px, -0.6px): section headings within a page.
- **Title** (800, 1.0625rem, -0.015em): mockup list headings and the mockup wordmark.
- **Body** (400, 14px, 1.6): interface default. Descriptive paragraphs are held to 65ch.
- **Label** (650, 12px, 1.4): buttons, field labels, segmented options, reference nav links. Mockup sidebar items use 600 at 0.84375rem.
- **Overline** (750, 0.6875rem, 0.08em, uppercase): the notebook heading in the mockup sidebar.
- **Wordmark** (800, -0.045em): "NoteWren" in the identity hero, clamp(32px, 5.2vw, 72px). The header brand uses 800 at 23px with -1px tracking.
- **Prose title** (620, 2rem, 1.2, -0.015em): note titles on the writing page. Steps down to 1.75rem, 1.5rem and 1.5625rem on narrower frames and phones.
- **Prose body** (400, 1.0625rem, 1.7): note bodies. 1rem with 1.65 line height on phones.
- **Code** (0.75rem): `code` and `kbd`, and the Omarchy status bar. The mockup shortcut hint (`⌘K`, `Ctrl K`) is set in Manrope 700 at 0.6875rem.

The `--text-*` scale (0.75rem, 0.875rem, 1rem, 1.25rem, 1.75rem, and clamp(2rem, 3.5vw, 3.25rem) for display) is declared in `src/tokens.css`. The mockups use it for small text; most sizes on the reference site are literal pixel values.

**The Two Voices Rule.** Manrope runs the interface. Source Serif 4 appears only for the writing: note titles and bodies on the page, and the prose specimen.

**The Tight Headings Rule.** Manrope tightens as it grows: -1.55px at display, -0.6px at headline, -0.045em on the wordmark. Body and label text keep normal tracking. Uppercase is limited to small overlines.

## Layout

The spacing scale has a 4px base with eight steps: 4, 8, 12, 16, 24, 32, 48 and 64px (`--space-1` to `--space-8`). The mockups use the scale and rem values; the reference site shell uses literal pixel values tuned against the layout.

**Reference site.** A sticky 88px header sits over a two-column grid: a 220px section index and a fluid main column, capped at 1700px wide. Main padding is 46px, widening to 60px inline at 1600px and above. Sections are divided by a top border with 42px above and 30px inside.

**Mockup desktop window.** A three-pane grid inside a 640px tall frame: 224px sidebar, 300px note list, fluid editor. All three panes share one surface colour, divided by hairlines, with a 3.25rem toolbar row running across them at the same height. The writing page is centred with a 42.5rem maximum width and 2.75rem 3rem 4rem padding. Focus mode hides the sidebar and list and widens the page to 46rem. The desktop frame is a CSS container (`nwm-desktop`), so it responds to its own width rather than the viewport.

**Mockup phones.** Each phone is 330px wide (shrinking to fit) and 620px tall. When the mockup area is at least 700px wide, two phones show the library and the open note side by side. Below that, one phone shows the library and the note slides over it.

**Mockup folds.** Open folding devices are drawn at a fixed size and zoom down to fit the container: iPhone Fold 600 by 470px, Android fold 580 by 490px, Surface Duo 600 by 410px. The library sits in the left pane and the open note in the right. Book folds have one screen with a crease down the middle; the Duo has two screens either side of a 14px hinge, each with its own status bar and home indicator.

### Breakpoints

Viewport media queries on the reference site:

- **1600px and above:** main column inline padding grows to 60px.
- **1190px and below:** index narrows to 190px, main padding 34px 28px, the "Interactive mockups" stamp hides, asset downloads drop to two columns.
- **900px and below:** header 76px; the index becomes a horizontal row of links under the header; type scale specimen to three columns.
- **600px and below:** header 68px, the theme button becomes a 42px icon button, index links stack icon over label, page heading 29px, and multi-column grids collapse (palette and state lists to two columns, specimens, components and rules to one).

Container queries on the desktop mockup frame (`nwm-desktop`):

- **900px and below:** the sidebar collapses to a 60px icon rail; the list is 272px.
- **600px and below:** frame height 600px; a 52px rail plus one pane, list or editor, with a back button to switch.
- **440px and below:** the Omarchy bar hides its window title.

The two-phone layout uses a 700px threshold measured with `ResizeObserver` in `PlatformMockups.tsx`, not a CSS query.

**The Page Measure Rule.** The writing page never exceeds 42.5rem, or 46rem in focus mode.

## Elevation & Depth

The system is flat. Depth inside the interface comes from tonal surfaces (sunken, canvas, surface, raised) and 1px hairlines. There is one shadow token, `--shadow-window`, for frames that float above the page: the macOS window, the Omarchy frame, the phones and the toast. The dark theme deepens it.

A few small effects support state rather than elevation: the pressed segment gets a faint 2px drop, the focused desktop search field gets a 3px clay wash halo, the sliding phone note casts a soft left edge shadow, and the phone bottom bar blurs the content behind it (10px) over raised surface at 92%.

**The One Shadow Rule.** Only floating frames get `--shadow-window`. Everything inside them sits on borders and tonal surfaces.

## Shapes

Corners are small and consistent. Controls use 6px (`--radius-sm`): buttons, fields, icon buttons, the search field and segmented options. Panels and note rows use 10px (`--radius-md`). `--radius-lg` (16px) is declared and shown as the window specimen; the built macOS window uses 12px and the Omarchy frame 10px. Chips, the preview pill, the OS theme options and the mobile new-note button are full pills (999px). Mobile note cards use 14px. The Omarchy active window has a 2px border in the frame accent with 2px corners, matching a tiling window manager.

Device frames follow their platforms: the iPhone frame is 48px outside and 39px on the screen; the Android frame is 30px and 22px with a punch-hole camera. Logo tiles round at 22% of their width, matching the app icon (56 on a 256 grid).

The wren is built from four paths: foot, tail, tail dot, and a body that carries the eye hole and, on the negative variant, the wing hole using `fill-rule="evenodd"`. Its proportions are fixed at 230 by 210.

**The Real Cutout Rule.** Wing and eye are holes in a compound path. Never paint a cream or white shape over the bird to fake them.

## Components

All components inherit the theme through role variables. Interactive elements show a 2px solid focus outline in the focus colour, offset 4px on the reference site and 2px inside the mockups. A skip link leads to the main content. Under `prefers-reduced-motion: reduce`, the duration tokens drop to 0ms and animations and transitions are switched off.

Target sizes vary by intent. Reference site buttons, fields and section links have a 44px minimum height, and the switch's hit area extends to 46px tall. The theme button is 40px (42px on small screens), segmented options 38px, and the toast dismiss button 36px. Mockup desktop controls are compact (32px icon buttons, a 34px search field) and mobile filter chips are 30px. The system has not been audited against WCAG, so do not describe it as compliant.

### Buttons

Confident and plain: bold short labels, an optional leading icon, no shadow.

- **Shape:** gently rounded (6px).
- **Primary:** clay action fill with on-accent text, 10px 17px padding, 44px minimum height, 12px label at 650.
- **Hover / Focus:** fill and border colour change over 140ms; primary darkens to clay hover. Focus uses the global outline.
- **Secondary:** raised surface, text colour, border stroke; hover to sunken.
- **Ghost:** transparent with muted text; hover to sunken.
- **Danger:** error-soft fill, error text and error border; hover to sunken.
- **Disabled / Loading:** disabled drops to 50% opacity with a not-allowed cursor. `loading` disables the button, sets `aria-busy` and swaps the icon for a spinning 16px loader at full opacity.
- **API:** `Button` in `src/components/ui.tsx` takes `variant` (`primary`, `secondary`, `ghost`, `danger`; default `primary`), `loading` and `icon`, plus native button props. It defaults to `type="button"`; pass `type="submit"` for forms.

Mockup-only buttons follow the same colours: 32px icon buttons (muted, hover to text at 5%, pressed state in clay), the clay accent icon button for new notes, clay text buttons with underline on hover, and the clay back link.

### Badges and chips

- **Badge:** sunken fill, muted text, 5px corners, 5px 9px padding, 10px at 650. Tones: `neutral`, `success`, `warning`, `error`. Used for the document states Offline, Pending changes, Conflict and Up to date. API: `Badge` with `tone`.
- **Filter chip (mobile):** raised pill with border, 30px tall, 0.78125rem at 700 with a muted count. Pressed chips invert to text-colour fill with canvas text.
- **Notebook chip:** small outlined pill with muted text, 0.6875rem at 700.
- **Preview pill:** warning-soft pill reading "Stored in this preview only", shown on any mockup note that has been edited or created.

### Inputs / Fields

- **Style:** raised surface, 1px border stroke, 6px corners, 11px 13px padding, 44px minimum height, 13px text. Label 12px at 650 above, hint 11px muted below. The caret is clay.
- **Focus:** the global focus outline.
- **Error:** the border turns error colour and the error message replaces the hint in error colour. `aria-invalid` and `aria-describedby` are set by the component.
- **API:** `Field` takes `label`, `hint`, `error` and native input props.
- **Search (mockups):** a 34px desktop field with a muted search icon, sunken-tinted fill and a clear button. On focus the border turns clay with a 3px clay wash halo. On phones it is 38px, borderless, 12px corners on sunken fill. The desktop shortcut is ⌘K on macOS and Ctrl K on Omarchy.
- **Writing page:** title and body fields have no border or background, only the clay caret, so the page reads as paper.

### Switch

- **Style:** 44px by 28px track with pill corners, sunken fill and border. The 20px thumb is muted.
- **On:** track turns clay action; the thumb moves 15px over 140ms with ease-out, turns on-accent and shows a 12px check.
- **API:** `Switch` takes `label`, `checked`, `onChange` and `description`, and renders a `role="switch"` button with the description linked by `aria-describedby`.

### Navigation

- **Reference index:** 12px links at 600 in muted text with a 17px icon, 7px corners, 44px minimum height. Hover goes to text colour on sunken. The current section uses clay wash with clay text and a trailing chevron. Below 900px it becomes a horizontal row; below 600px each link stacks icon over a 9px label.
- **Segmented control:** sunken track with a border and 10px corners, 4px inset. Options are 38px tall, 12px at 650, muted. The pressed option is raised with a border and text colour. Used for the platform switch, the device switch and the logo variant.
- **Mockup sidebar:** rows with a 20px icon column, label and tabular count. The current row has a clay wash fill and a clay border at 45%, with a clay icon. Collapses to a 40px icon rail in narrow frames.
- **Mobile bottom bar:** blurred raised surface with a hairline top. The library bar holds a note count and the clay new-note pill (38px, 999px corners).

### Note list rows

The core repeated element of the mockups.

- **Shape:** 10px corners, 0.625rem 0.75rem padding, transparent border.
- **Content:** title at 750 and 0.875rem (truncated), a two-line muted snippet, then meta in 0.71875rem at 600. Favourites carry a clay star. Untitled notes show "Untitled note" in muted 600.
- **States:** hover is text at 5%. The selected row is clay wash with a clay border at 45%.
- **Mobile:** each row becomes a raised card with a hairline border and 14px corners.

### Branch graph

`BranchGraph` in `src/components/BranchGraph.tsx` shows a note's branch ancestry as a Git-like graph. It supports branching only, with no merge control or converging paths. `BranchGraphExample` supplies the interactive specimen in the Components showcase, including an editable title and body.

- **Entry:** the editor toolbar shows a branch icon and the current writing branch's name. Word count sits below the desktop editor body. The phone toolbar pairs the branch control with the favourite action.
- **Placement:** opening the graph replaces the writing content inside the desktop editor pane. On a phone it uses the full note pane; on a fold it stays in the editor half. Keep the graph and details scrollable within that pane, including narrow editor widths. The graph is not a floating modal.
- **Writing and inspecting:** the Writing label identifies the branch receiving edits. Selecting a graph row changes only the branch marked Inspecting and its details. Continue writing switches the writing branch and returns to its editor. Back to note closes the graph without switching. Closing or switching returns focus to the branch control.
- **Create:** New branch forks the inspected branch's current title and Markdown body and makes the new branch the writing branch. Names are trimmed, accept 1–48 characters and must be distinct within that note without regard to case. Rename changes the branch name without changing its content or ancestry.
- **Archive:** Archive keeps the branch in the graph for inspection. Restore makes it available for writing or branching again. The original and current writing branches cannot be archived.
- **Delete:** Delete branch is available only for a non-original, non-writing branch with no children. Inline Delete permanently and Cancel controls make removal an explicit choice. A branch with descendants must remain to preserve their ancestry.
- **Comparison:** Compare with defaults to Fork point, or Original snapshot for the root. Each branch keeps immutable `baseTitle` and `baseBody` values from creation alongside its editable `title` and `body`. Later edits to the parent never move that baseline. Choosing another branch compares against its current content instead.
- **Authorship:** You and Agent labels identify the sample author. Agent branches do not invoke a model or agent service.
- **Theme:** graph lines, selected rows, labels, fields and comparison states inherit the existing semantic roles, including `--border`, `--fg`, `--muted`, `--accent`, `--surface`, `--success` and `--error`. The header's light/dark setting and Omarchy's OS palette apply through the same variables. Do not assign fixed colours to individual branches. Status and comparison meaning must remain legible in words.
- **Type and space:** compact app typography uses 18px for the graph heading, 15px for the inspected heading and comparison prose, 13px for rows and controls, 12px for hints, 11px for ancestry metadata and 16px for draft titles. Desktop graph gutters are 24px; mobile gutters are 16px. These sizes extend the reference site's larger type ramp for the editor panes.

Each sample note owns an independent branch tree. The note list and search use its current writing branch. Only the first sample note starts with a multi-branch example; the others start with their original branch. Branch edits and controls operate in memory and reset with the mockup. Notebook-wide branching, persistence and agent execution remain planned product work.

**API:** `BranchGraph` receives `branches`, `activeId`, `onSwitch`, `onCreate`, `onRename`, `onArchive`, `onDelete` and `onClose`. `NoteBranch` carries `id`, `name`, `parentId`, `title`, `body`, `baseTitle`, `baseBody`, `author` (`You` or `Agent`) and `archived`. The owner stores editable content and immutable fork snapshots. Inspection stays local to the graph; `onSwitch` is reserved for Continue writing. `onArchive` toggles the archived state, and `onCreate` makes the new branch active.

### Toast

Text-colour fill with canvas text, 9px corners, `--shadow-window`, centred 24px from the bottom. Arrives over 220ms with ease-out by sliding up 8px. Dismisses after 4.5 seconds or with its 36px close button. Messages in the preview say plainly when nothing was sent.

### Empty state

A surface panel with a border and 12px corners, centred: the wren in clay at 62px, a 22px heading, a muted line, and one primary action. Mockup empty lists offer a text-button action to create a note or clear the search.

### Platform mockups

`PlatformMockups` takes `platform` (`mac`, `windows`, `omarchy`, `mobile`). The three desktop frames share one app layout; only the chrome differs.

- **macOS:** 12px window with a hairline border. Traffic lights sit inside the sidebar toolbar, as in a full-height sidebar window; there is no separate title bar. Search shows `⌘K`.
- **Windows:** 8px window with a 2rem title bar carrying the app icon and name on the left and minimise, maximise and close caption buttons on the right (46px wide, close turns red on hover). The title bar mixes the surface with a little of the page background for a Mica-style tint; the toolbar row drops to 2.75rem. Type falls back through Segoe UI Variable. Search shows `Ctrl K`.
- **Omarchy:** a frame in the `--nwm-frame-*` colours (graphite by default) with a monospace top bar (workspaces, title, sample status items marked "example") and a client window bordered in the frame accent. Above it, the OS theme picker: pill buttons with a four-colour swatch and the theme name, pressed state shown by a text-coloured border.
- **Desktop toolbar:** the sidebar toolbar holds the wordmark; the list toolbar holds the view title and a new-note button; the editor toolbar holds the current branch control on the left and favourite and focus-mode buttons on the right. Word count sits below the editor body. Selection in the sidebar and note list is a tonal row (`--nwm-selected`, 9% of the text colour) with no border.
- **Phones:** iPhone and Android frames, switched by a segmented control, with status bar and home indicator. iOS uses a large title, a bottom toolbar and a system-font navigation bar; Android uses a top app bar, a floating compose button and Roboto. They adapt the frame around the shared web interface; they are not native iOS or Android builds.
- **Folds:** iPhone Fold, Android fold and Surface Duo join the segmented control. The library pane drops its compose control because the note pane carries it, and the Android library pane loses the bottom padding reserved for the floating button. Narrow fold panes set the note title at 1.3125rem.
- **Editor:** the body is a CodeMirror Markdown editor. Headings, bullets, numbered lists, task boxes, emphasis, links and code format in place; the Markdown syntax shows only on the line that holds the caret.
- **Behaviour:** search, notebook filters, favourites, new notes and editing all work against in-memory sample notes. In narrow frames the list and editor alternate: opening a note moves keyboard focus into the title, and going back returns it to the selected note row. On phones the note slides over the library over 330ms. Focus mode on desktop exits with Escape. Switching platform, leaving the mockups section or reloading restarts from the sample notes. A footnote under each mockup reads "Interactive mockup · Sample notes · No server connected".

### Logo

The signature component. `Logo` in `src/components/Logo.tsx` takes `size` (rendered height in pixels, default 32; width keeps the 230:210 ratio), `variant` (`negative` with the wing cut out, the default, or `filled`) and `className`. It fills with `currentColor` and is hidden from assistive technology, so the surrounding text supplies the name. Standalone SVGs in `public/brand/` cover black, white, terracotta and `currentColor` versions of both variants, plus cream and terracotta app icons.

Use the filled mark below 32px and keep the symbol at least 16px high. Leave clear space of at least one fifth of the mark's height on each side. Pair it with the Manrope wordmark at 800.

## Do's and Don'ts

### Do:

- **Do** use the clay action role (`--accent`, #a64028 light, #f0a084 dark) for every interactive accent, and keep identity terracotta (#d96545) for the mark, app tiles and the default Omarchy frame.
- **Do** keep `.nwm-omarchy` and the waybar on the `--nwm-frame-*` variables so OS palettes can recolour them.
- **Do** set note titles and bodies in Source Serif 4 and everything else in Manrope.
- **Do** reference role variables so `data-theme="dark"` swaps colours without component changes.
- **Do** pair every status colour with a text label, as the Offline, Pending changes, Conflict and Up to date badges do.
- **Do** keep one primary button per task, with a verb-led label.
- **Do** separate regions with 1px hairlines and tonal surfaces, and reserve `--shadow-window` for floating frames.
- **Do** keep the writing page within 42.5rem (46rem in focus mode).
- **Do** use 140ms for control feedback and 220ms for view changes, with `--ease-out`, and honour reduced motion.
- **Do** label anything in the mockups that could be mistaken for a working feature, such as the preview pill, the footnote and the "example" status items.

### Don't:

- **Don't** put white text on identity terracotta for interface buttons; use the clay action colour.
- **Don't** fake the wren's wing or eye with a painted cream or white shape; they are transparent holes.
- **Don't** stretch, rotate, recolour in gradients or redraw the bird, and don't set it on detailed backgrounds.
- **Don't** use Source Serif 4 for controls, labels or navigation.
- **Don't** describe every control as having a 44px target or the system as WCAG compliant; desktop mockup controls are intentionally compact.
- **Don't** imply that mockup content is stored or synced; it lives for the session only.
- **Don't** animate the writing page while someone types.
