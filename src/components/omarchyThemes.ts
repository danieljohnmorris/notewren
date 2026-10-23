import type { CSSProperties } from 'react';

/**
 * Omarchy palettes, copied from `themes/<name>/colors.toml` in the Omarchy
 * repository. On a real Omarchy install the app would read the active theme
 * from `~/.local/state/omarchy/current/theme/colors.toml` (see
 * `docs/theming.md` there) and apply the same mapping as `omarchyThemeStyle`.
 */
export type OmarchyPalette = {
  mode: 'dark' | 'light';
  accent: string;
  selection: string;
  muted: string;
  background: string;
  dark_background: string;
  darker_background: string;
  lighter_background: string;
  foreground: string;
  dark_foreground: string;
  light_foreground: string;
  bright_foreground: string;
  red: string;
  yellow: string;
  green: string;
};

export type OmarchyTheme = { id: string; name: string; colors: OmarchyPalette };

export const OMARCHY_THEMES: OmarchyTheme[] = [
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    colors: {
      mode: 'dark',
      accent: '#7aa2f7',
      selection: '#292e42',
      muted: '#414868',
      background: '#1a1b26',
      dark_background: '#13141c',
      darker_background: '#0e0e14',
      lighter_background: '#24283b',
      foreground: '#a9b1d6',
      dark_foreground: '#565f89',
      light_foreground: '#b4bee6',
      bright_foreground: '#c0caf5',
      red: '#f7768e',
      yellow: '#e0af68',
      green: '#9ece6a',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    colors: {
      mode: 'dark',
      accent: '#89b4fa',
      selection: '#45475a',
      muted: '#585b70',
      background: '#1e1e2e',
      dark_background: '#161622',
      darker_background: '#101019',
      lighter_background: '#313244',
      foreground: '#cdd6f4',
      dark_foreground: '#6c7086',
      light_foreground: '#bac2de',
      bright_foreground: '#cdd6f4',
      red: '#f38ba8',
      yellow: '#f9e2af',
      green: '#a6e3a1',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    colors: {
      mode: 'dark',
      accent: '#7daea3',
      selection: '#504945',
      muted: '#665c54',
      background: '#282828',
      dark_background: '#1e1e1e',
      darker_background: '#161616',
      lighter_background: '#3c3836',
      foreground: '#d4be98',
      dark_foreground: '#7c6f64',
      light_foreground: '#bdae93',
      bright_foreground: '#d4be98',
      red: '#ea6962',
      yellow: '#d8a657',
      green: '#a9b665',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: {
      mode: 'dark',
      accent: '#81a1c1',
      selection: '#434c5e',
      muted: '#4c566a',
      background: '#2e3440',
      dark_background: '#222730',
      darker_background: '#191c23',
      lighter_background: '#3b4252',
      foreground: '#d8dee9',
      dark_foreground: '#667080',
      light_foreground: '#adb5c4',
      bright_foreground: '#d8dee9',
      red: '#bf616a',
      yellow: '#ebcb8b',
      green: '#a3be8c',
    },
  },
  {
    id: 'osaka-jade',
    name: 'Osaka Jade',
    colors: {
      mode: 'dark',
      accent: '#509475',
      selection: '#32473B',
      muted: '#53685B',
      background: '#111c18',
      dark_background: '#0c1512',
      darker_background: '#090f0d',
      lighter_background: '#23372B',
      foreground: '#C1C497',
      dark_foreground: '#81B8A8',
      light_foreground: '#D6D5BC',
      bright_foreground: '#F7E8B2',
      red: '#FF5345',
      yellow: '#E5C736',
      green: '#549e6a',
    },
  },
  {
    id: 'matte-black',
    name: 'Matte Black',
    colors: {
      mode: 'dark',
      accent: '#e68e0d',
      selection: '#2a2a2a',
      muted: '#333333',
      background: '#121212',
      dark_background: '#0d0d0d',
      darker_background: '#090909',
      lighter_background: '#1e1e1e',
      foreground: '#bebebe',
      dark_foreground: '#555555',
      light_foreground: '#8a8a8d',
      bright_foreground: '#bebebe',
      red: '#D35F5F',
      yellow: '#b91c1c',
      green: '#FFC107',
    },
  },
  {
    id: 'flexoki-light',
    name: 'Flexoki Light',
    colors: {
      mode: 'light',
      accent: '#205EA6',
      selection: '#CECDC3',
      muted: '#B7B5AC',
      background: '#FFFCF0',
      dark_background: '#f2efe4',
      darker_background: '#e5e2d8',
      lighter_background: '#E6E4D9',
      foreground: '#100F0F',
      dark_foreground: '#878580',
      light_foreground: '#403E3C',
      bright_foreground: '#100F0F',
      red: '#D14D41',
      yellow: '#D0A215',
      green: '#879A39',
    },
  },
];

const mix = (a: string, b: string, aShare: number) => `color-mix(in oklab, ${a} ${aShare}%, ${b})`;

/**
 * Maps a `colors.toml` palette onto NoteWren's tokens. Omarchy's `muted` is
 * its divider colour, so it becomes the border; secondary text uses the next
 * readable step down from `bright_foreground`.
 */
export function omarchyThemeStyle(p: OmarchyPalette): CSSProperties {
  const dark = p.mode === 'dark';
  const secondary = p.foreground === p.bright_foreground ? p.light_foreground : p.foreground;
  const onAccent = dark ? p.darker_background : p.background;
  return {
    colorScheme: p.mode,
    '--bg': p.background,
    '--surface': p.background,
    '--surface-raised': p.lighter_background,
    '--surface-sunken': p.dark_background,
    '--fg': p.bright_foreground,
    '--muted': secondary,
    '--border': p.muted,
    '--accent': p.accent,
    '--accent-hover': mix(p.accent, dark ? '#ffffff' : '#000000', 82),
    '--accent-soft': mix(p.background, p.accent, 82),
    '--on-accent': onAccent,
    '--success': p.green,
    '--success-soft': mix(p.background, p.green, 84),
    '--warning': p.yellow,
    '--warning-soft': mix(p.background, p.yellow, 84),
    '--error': p.red,
    '--error-soft': mix(p.background, p.red, 84),
    '--focus': p.accent,
    '--selection': p.selection,
    '--shadow-window': dark ? '0 16px 48px -20px #0009, 0 3px 8px -4px #0008' : '0 16px 48px -20px #30271938, 0 3px 8px -4px #30271920',
    '--nwm-frame-bg': p.darker_background,
    '--nwm-frame-fg': p.foreground,
    '--nwm-frame-muted': p.dark_foreground,
    '--nwm-frame-accent': p.accent,
    '--nwm-frame-on-accent': onAccent,
  } as CSSProperties;
}
