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
 * its divider colour, so it becomes the border; secondary text blends the
 * readable foreground towards the background, while headings stay brighter.
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
    '--fg': p.foreground,
    '--fg-heading': p.bright_foreground,
    '--muted': mix(secondary, p.background, 85),
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
