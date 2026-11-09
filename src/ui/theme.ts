import { FillGradient } from "pixi.js";
export const COLORS = {
  background: 0x0d0824,
  backgroundGlow: 0x251458,
  text: 0xfff8dd,
  heading: 0xfff8dd,
  body: 0xd8d0f0,
  muted: 0xaaa0c8,
  subtle: 0x71688f,
  primary: 0xff3b1f,
  primaryPressed: 0xd92f1a,
  secondary: 0x00e5ff,
  accent: 0x8b5cf6,
  highlight: 0xffd800,
  scoreGreen: 0x58f06f,
  scoreOrange: 0xff9f1c,
  accentHover: 0x00e5ff,
  accentDark: 0x150904,
  red: 0xff3b1f,
  project: 0xfff8dd,
  action: 0xd8d0f0,
  error: 0xff6b54,
  errorMuted: 0xd7a8a0,
  panel: 0x17103a,
  panelStrong: 0x251458,
  panelBorder: 0x574582,
} as const;

export const BACKGROUND_GLOWS = {
  primary: createRadialGlow(255, 59, 31, 0.16),
  secondary: createRadialGlow(0, 229, 255, 0.12),
  accent: createRadialGlow(139, 92, 246, 0.12),
} as const;

function createRadialGlow(red: number, green: number, blue: number, alpha: number): FillGradient {
  return new FillGradient({
    type: "radial",
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `rgba(${red}, ${green}, ${blue}, ${alpha})` },
      { offset: 1, color: `rgba(${red}, ${green}, ${blue}, 0)` },
    ],
  });
}

export const FONTS = {
  sans: "\"Space Grotesk Variable\", Arial, sans-serif",
  display: "\"Space Grotesk Variable\", \"Arial Black\", Arial, sans-serif",
  mono: "SFMono-Regular, Consolas, monospace",
} as const;
