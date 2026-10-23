/**
 * NoteWren wren mark. Geometry matches public/brand/notewren-*.svg exactly.
 * Holes (eye, and wing on the negative variant) are cut with fill-rule="evenodd",
 * so they show whatever sits behind the logo. Fill inherits currentColor.
 */
const TAIL = 'M 12.7 20.9 L 27.5 12.6 Q 31.5 10.4 33.5 14.4 L 57.1 61.9 Q 59.1 66 55.2 68.2 L 45.6 73.5 Q 41.7 75.7 39.3 71.9 L 11.2 26.9 Q 8.8 23.1 12.7 20.9 Z';
const DOT = 'M 49.6 92.7 A 13 13 0 1 0 75.6 92.7 A 13 13 0 1 0 49.6 92.7 Z';
const BODY = 'M 37 150 C 52 134 77 112 105 92 C 124 78 140 66 155 64 C 168 61 179 65 187 71 L 209 72 L 191 85 C 187 105 178 125 166 143 C 150 163 126 174 103 175 C 81 176 58 168 37 150 Z';
const FOOT = 'M 103 172 L 124 172 L 128 182 L 110 182 Z';
const WING_HOLE = 'M 71 149 C 96 126 122 112 151 102 C 145 126 131 145 110 153 C 96 158 82 156 71 149 Z';
const EYE_HOLE = 'M 166.3 77 A 3.7 3.7 0 1 0 173.7 77 A 3.7 3.7 0 1 0 166.3 77 Z';

const VIEWBOX_WIDTH = 230;
const VIEWBOX_HEIGHT = 210;

export type LogoVariant = 'negative' | 'filled';

export interface LogoProps {
  /** Rendered height in pixels; width keeps the 230:210 ratio. */
  size?: number;
  /** 'negative' cuts the wing out of the body; 'filled' keeps it solid. */
  variant?: 'negative' | 'filled';
  className?: string;
}

export function Logo({ size = 32, variant = 'negative', className }: LogoProps) {
  const body = variant === 'negative' ? `${BODY} ${EYE_HOLE} ${WING_HOLE}` : `${BODY} ${EYE_HOLE}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={Math.round((size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT * 100) / 100}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={FOOT} />
      <path d={TAIL} />
      <path d={DOT} />
      <path d={body} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export default Logo;
