import type { SpaghettiSettings } from "./settings";

export interface BowlBounds {
  centerX: number;
  rimY: number;
  halfWidth: number;
  depth: number;
}

export function calculateBowlBounds(
  width: number,
  height: number,
  settings: SpaghettiSettings["bowl"],
): BowlBounds {
  const widthRatio = width <= 700 ? settings.compactWidthRatio : settings.wideWidthRatio;
  return {
    centerX: width / 2,
    rimY: height * settings.rimYRatio,
    halfWidth: Math.min(width * widthRatio, settings.maximumHalfWidth),
    depth: Math.min(height * settings.depthRatio, settings.maximumDepth),
  };
}
