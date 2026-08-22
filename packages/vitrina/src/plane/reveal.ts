/*
 * The visibility/reveal pass. PURE: no React, no GSAP, no DOM.
 *
 * One analytic pass per frame of movement (§6.4), answering two questions at once:
 *
 * - Tab order: which instances may be focusable. Off-frame objects must not be —
 *   tabbing to something invisible is not navigation, and the browser's native
 *   scroll-into-view would set a real `scrollLeft` on the `overflow: hidden`
 *   viewport, outside GSAP's transform. Unrevealed objects are excluded too: they
 *   sit at opacity 0 and a focus ring would hover over empty plane.
 * - Reveal: which unrevealed instances' CENTRES newly entered the inset frame —
 *   these get popped, once, staggered.
 *
 * This pass lives outside any reduced-motion branch: focus is not decoration.
 */

import type { VitrinaInstance } from '../types';
import {
  centreInside,
  instanceVisible,
  visibleWorldRect,
  type Pan,
  type Size,
} from './geometry';

export interface FramePass {
  /** Ids of revealed instances with any part inside the viewport — the tab-order set. */
  focusable: string[];
  /**
   * Ids of unrevealed instances whose centre is inside the inset frame — pop these
   * now. In input order; never contains an already-revealed id.
   */
  entering: string[];
}

/**
 * Callers typically union `entering` into their revealed set immediately; those
 * ids then join `focusable` on the next pass (their pop makes them visible).
 */
export function framePass(
  instances: readonly VitrinaInstance[],
  viewport: Size,
  pan: Pan,
  zoom: number,
  inset: number,
  revealed: ReadonlySet<string>,
): FramePass {
  if (viewport.w <= 0 || viewport.h <= 0 || zoom <= 0 || instances.length === 0) {
    return { focusable: [], entering: [] };
  }
  const frame = visibleWorldRect(viewport, pan, zoom, 0);
  const insetFrame = inset > 0 ? visibleWorldRect(viewport, pan, zoom, inset) : frame;

  const focusable: string[] = [];
  const entering: string[] = [];
  for (const inst of instances) {
    if (revealed.has(inst.id)) {
      if (instanceVisible(inst, frame)) focusable.push(inst.id);
    } else if (centreInside(inst, insetFrame)) {
      entering.push(inst.id);
    }
  }
  return { focusable, entering };
}

/**
 * Cumulative delays for one batch of reveal pops: the first fires immediately,
 * then each gap is seeded-random within [gap[0], gap[1]) ms — a fixed step reads
 * as a mechanical wave when 25 objects enter at once (§6.5). Deterministic given
 * the rng.
 */
export function staggerDelays(
  count: number,
  rng: () => number,
  gap: readonly [number, number],
): number[] {
  const [lo, hi] = gap;
  const delays: number[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    delays.push(t);
    t += lo + rng() * (hi - lo);
  }
  return delays;
}
