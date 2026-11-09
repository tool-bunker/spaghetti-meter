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
  const shortHeightScale = Math.max(
    settings.minimumShortHeightScale,
    Math.min(1, height / settings.shortHeightReference),
  );
  const unconstrainedHalfWidth = Math.min(
    width * widthRatio,
    settings.maximumHalfWidth * shortHeightScale,
  ) * settings.scale;
  const depth = Math.min(
    height * settings.depthRatio * settings.scale,
    settings.maximumDepth * settings.scale,
    unconstrainedHalfWidth * 2 / settings.artworkWidthToHeightRatio,
  );
  const halfWidth = Math.min(
    unconstrainedHalfWidth,
    depth * settings.artworkWidthToHeightRatio / 2,
  );
  return {
    centerX: width / 2,
    rimY: height * settings.rimYRatio,
    halfWidth,
    depth,
  };
}
