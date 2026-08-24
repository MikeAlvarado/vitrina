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
 * Motion timing — library tuning, not §7 measurements. From step 7 every value
 * with a CSS token (`--vitrina-dur-*`, `--vitrina-ease-*`, the staggers) lives
 * in base.css and is read ONCE at mount (`motion.ts`); the constants here are
 * ONLY the fallbacks for when the stylesheet cannot answer (SSR, jsdom, a mount
 * racing the stylesheet) — and the values with no token, which stay TS-only.
 *
 * The wheel chase (`--vitrina-dur-micro` / `--vitrina-ease-micro`) is short on
 * purpose: a UI-scale duration (~320 ms) reads as lag when it has to follow a
 * high-frequency trackpad gesture.
 */
export const WHEEL_CHASE_SECONDS = 0.16;
export const WHEEL_CHASE_EASE = 'power3.out';
/** One discrete zoom step, and the pan re-clamp that rides along with it (`--vitrina-dur-ui`). */
export const ZOOM_TWEEN_SECONDS = 0.32;
/** No token: the zoom's curve is part of the mechanic's feel, not a theme knob. */
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
 * Grid view. Cell and gap (240 px cells on a ~320 px step, measured on
 * palmer-dinnerware.com) are `--vitrina-grid-cell` / `--vitrina-grid-gap` in
 * base.css — a theme retunes them under media queries, which inline styles
 * cannot express. The Flip between the views keeps a TS duration (no token) and
 * takes its ease from `--vitrina-ease-flight`.
 */
export const VIEW_FLIP_SECONDS = 0.7;

/*
 * Detail flight: one object, plane ↔ panel. Library tuning; fallbacks for
 * `--vitrina-dur-flight` / `--vitrina-ease-flight`. The slot the object lands in
 * and the panel's width are `--vitrina-detail-object` / `--vitrina-panel-width`
 * in base.css.
 */
export const DETAIL_FLIGHT_SECONDS = 0.6;
export const DETAIL_FLIGHT_EASE = 'power3.inOut';
/** No token: the height tween's curve rides the panel's feel, not a theme knob. */
export const DETAIL_PANEL_EASE = 'power3.inOut';
/**
 * The panel's own entrance/exit (the clip-path wipe in `base.css`) and its
 * between-objects height tween: the fallback for `--vitrina-dur-panel`. The CSS
 * variable is the source of truth — the wipe (CSS) and the object choreography
 * (GSAP, via the tokens read at mount) stay glued to the same number.
 */
export const DETAIL_PANEL_SECONDS = 0.45;

/*
 * Content lines. The library cannot animate `renderDetail`'s markup — it does
 * not know its structure — so the consumer marks the blocks to choreograph with
 * `data-vitrina-line` (none marked → no content animation). Each line enters on
 * opacity plus a short rise, starts at multiples of the stagger step. The
 * entrance step paces the reading in order; the exit has nothing to read — its
 * only job is avoiding a flat blink — so its step is tighter, under its own
 * variable. Steps are CSS custom properties (`--vitrina-stagger-line`,
 * `--vitrina-stagger-line-exit`; a theme retunes them); the constants are the
 * SSR/jsdom fallbacks. Each line's own duration and the mirrored eases ride on
 * the panel's (`--vitrina-dur-panel`).
 */
export const DETAIL_LINE_SHIFT = 12;
export const DETAIL_LINE_EASE = 'power3.out';
export const DETAIL_LINE_EXIT_EASE = 'power3.in';
export const DETAIL_LINE_STAGGER_SECONDS = 0.07;
export const DETAIL_LINE_STAGGER_EXIT_SECONDS = 0.04;
