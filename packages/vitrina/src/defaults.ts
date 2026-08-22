import type { VitrinaLayout } from './types';

/**
 * Defaults are measured values, not invented ones:
 * - world 4645×3044, count 114, columns 14: measured on palmer-dinnerware.com,
 *   the interaction reference.
 * - compactWorld 2200×3000, compactSizeFactor 0.62: carried over from the Mediterra
 *   implementation's mobile tuning.
 */
export const DEFAULT_LAYOUT: Required<VitrinaLayout> = {
  world: { w: 4645, h: 3044 },
  compactWorld: { w: 2200, h: 3000 },
  compactBreakpoint: 640,
  count: 114,
  columns: 14,
  baseSize: 190,
  sizeJitter: 0.15,
  minSeparation: 2,
  seed: 'vitrina',
  compactSizeFactor: 0.62,
};

/** Fills every omitted (or explicitly `undefined`) field with the measured default. */
export function resolveLayout(layout?: VitrinaLayout): Required<VitrinaLayout> {
  const given: Partial<VitrinaLayout> = {};
  for (const [key, value] of Object.entries(layout ?? {})) {
    if (value !== undefined) (given as Record<string, unknown>)[key] = value;
  }
  return { ...DEFAULT_LAYOUT, ...given };
}

export const DEFAULT_ZOOM_STEPS = [0.75, 1, 1.25];
export const DEFAULT_ZOOM_INDEX = 1;

/*
 * Interaction/motion constants, consumed from step 3 of the build on.
 * Sources: measured on palmer-dinnerware.com unless noted.
 */
export const EDGE_RESISTANCE = 0.8;
/** Tuned after a real "trackpad pans too slowly" report. */
export const WHEEL_SPEED = 1.6;
/** Below this many px of movement, a pointer gesture is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 5;
export const INTRO_SCALE = 0.5;
export const REVEAL_SCALE = 0.6;
/** Gap between reveal pops, ms — randomised (seeded) per pop; a fixed step reads as a wave. */
export const REVEAL_GAP_MS: readonly [number, number] = [30, 80];
/** Reveal triggers on the viewport inset by this fraction, tested against object centres. */
export const REVEAL_INSET = 0.12;
