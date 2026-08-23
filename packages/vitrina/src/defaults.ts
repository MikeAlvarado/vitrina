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

/*
 * Motion timing — library tuning, not §7 measurements. The wheel chase is short
 * on purpose: a UI-scale duration (~320 ms) reads as lag when it has to follow a
 * high-frequency trackpad gesture.
 */
export const WHEEL_CHASE_SECONDS = 0.16;
export const WHEEL_CHASE_EASE = 'power3.out';
/** One discrete zoom step, and the pan re-clamp that rides along with it. */
export const ZOOM_TWEEN_SECONDS = 0.32;
export const ZOOM_TWEEN_EASE = 'power2.out';
/**
 * One reveal pop (scale REVEAL_SCALE → 1) and the intro's (INTRO_SCALE → 1, a
 * touch slower: it is the first thing seen). Library tuning — the gaps between
 * pops (REVEAL_GAP_MS) are the measured part.
 */
export const REVEAL_POP_SECONDS = 0.45;
export const INTRO_POP_SECONDS = 0.7;
export const REVEAL_POP_EASE = 'back.out(1.4)';

/*
 * Grid view. Cell and gap measured on palmer-dinnerware.com (240 px cells on a
 * ~320 px step). Themes override them through `--vitrina-grid-cell` and
 * `--vitrina-grid-gap` on `[data-vitrina-root]` — including under media queries,
 * which inline styles cannot express.
 */
export const GRID_CELL = 240;
export const GRID_GAP = 80;
/** The Flip of every object between plane and grid. Library tuning. */
export const VIEW_FLIP_SECONDS = 0.7;
export const VIEW_FLIP_EASE = 'power3.inOut';

/*
 * Detail flight: one object, plane ↔ panel. Library tuning. The slot the object
 * lands in and the panel's width are custom properties (`--vitrina-detail-object`,
 * `--vitrina-panel-width`) for the same reason as the grid's: a theme retunes
 * them under media queries, which inline styles cannot.
 */
export const DETAIL_FLIGHT_SECONDS = 0.6;
export const DETAIL_FLIGHT_EASE = 'power3.inOut';
export const DETAIL_PANEL_EASE = 'power3.inOut';
export const DETAIL_OBJECT_SIZE = 240;
/**
 * The panel's own entrance/exit (a clip-path wipe, `base.css`) and its
 * between-objects height tween. Mirror of the motion custom property, read from
 * it at runtime and used only as the fallback when the stylesheet is absent
 * (SSR, jsdom). The CSS variable is the source of truth.
 */
export const DETAIL_PANEL_SECONDS = 0.45;
/*
 * The two durations the choreography reads at runtime, so the panel wipe (CSS)
 * and the object flights (GSAP) stay glued to the same numbers. A theme, or
 * devtools, retunes them here — `--vitrina-dur-flight` at 2s makes the whole
 * sequence deliberate in slow motion.
 */
export const DETAIL_FLIGHT_DURATION_VAR = '--vitrina-dur-flight';
export const DETAIL_PANEL_DURATION_VAR = '--vitrina-dur-panel';

/*
 * Content lines. The library cannot animate `renderDetail`'s markup — it does
 * not know its structure — so the consumer marks the blocks to choreograph with
 * `data-vitrina-line` (none marked → no content animation). Each line enters on
 * opacity plus a short rise, starts at multiples of the stagger step. The
 * entrance step paces the reading in order; the exit has nothing to read — its
 * only job is avoiding a flat blink — so its step is tighter, under its own
 * variable. Steps are CSS custom properties (a theme retunes them); the
 * constants are the SSR/jsdom fallbacks. Each line's own duration and the
 * mirrored eases ride on the panel's (`--vitrina-dur-panel`).
 */
export const DETAIL_LINE_SHIFT = 12;
export const DETAIL_LINE_EASE = 'power3.out';
export const DETAIL_LINE_EXIT_EASE = 'power3.in';
export const DETAIL_LINE_STAGGER_SECONDS = 0.07;
export const DETAIL_LINE_STAGGER_EXIT_SECONDS = 0.04;
export const DETAIL_LINE_STAGGER_VAR = '--vitrina-stagger-line';
export const DETAIL_LINE_STAGGER_EXIT_VAR = '--vitrina-stagger-line-exit';
