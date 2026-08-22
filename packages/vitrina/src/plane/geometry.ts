/*
 * Coordinate math for the two-layer plane. PURE: no React, no GSAP, no DOM.
 *
 * The transform model (§6.1 of the build brief): the zoom layer is exactly
 * viewport-sized with `transform-origin: center` and only scales; the pan layer
 * inside it is exactly world-sized and only translates. Pan is expressed in world
 * units. A world point `w` therefore paints on screen at
 *
 *     screen = (w + pan − view/2) · zoom + view/2
 *
 * Everything here — centering, bounds, clamping, visibility — derives from that one
 * formula analytically. Zero `getBoundingClientRect()` per frame.
 */

import type { VitrinaLayout } from '../types';

export interface Size {
  w: number;
  h: number;
}

export interface Pan {
  x: number;
  y: number;
}

/** World-space rectangle; empty when left === right (or top === bottom). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The x/y/size subset of an instance that geometry cares about. */
export interface PlacedRect {
  x: number;
  y: number;
  size: number;
}

/** One axis of the §6.1 formula: world coordinate → screen coordinate. */
export const worldToScreen = (w: number, view: number, pan: number, zoom: number): number =>
  (w + pan - view / 2) * zoom + view / 2;

/** Inverse of `worldToScreen`. Requires zoom > 0. */
export const screenToWorld = (s: number, view: number, pan: number, zoom: number): number =>
  (s - view / 2) / zoom + view / 2 - pan;

/**
 * The pan that centres the world in the viewport. Because the zoom layer's origin
 * is the viewport centre, this same pan centres the world at ANY scale — zoom needs
 * no pan compensation. It is also always the midpoint of `panBounds`.
 */
export const centerPan = (world: Size, viewport: Size): Pan => ({
  x: viewport.w / 2 - world.w / 2,
  y: viewport.h / 2 - world.h / 2,
});

/**
 * Pan range that keeps the world covering the viewport (no empty edge showing) at
 * the given zoom. Derived by solving `worldToScreen(0) ≤ 0` and
 * `worldToScreen(worldLen) ≥ viewLen` for pan. When the scaled world is too small
 * to cover an axis, that axis collapses to the centering pan — the world sits
 * centred and cannot be dragged along it. Zoom ≤ 0 is degenerate: fully collapsed.
 */
export function panBounds(world: Size, viewport: Size, zoom: number): PanBounds {
  const center = centerPan(world, viewport);
  if (zoom <= 0) {
    return { minX: center.x, maxX: center.x, minY: center.y, maxY: center.y };
  }
  const axis = (worldLen: number, viewLen: number, centered: number): [number, number] => {
    const max = (viewLen / 2) * (1 - 1 / zoom);
    const min = viewLen / 2 + viewLen / (2 * zoom) - worldLen;
    return min > max ? [centered, centered] : [min, max];
  };
  const [minX, maxX] = axis(world.w, viewport.w, center.x);
  const [minY, maxY] = axis(world.h, viewport.h, center.y);
  return { minX, maxX, minY, maxY };
}

export const clampPan = (pan: Pan, b: PanBounds): Pan => ({
  x: Math.min(b.maxX, Math.max(b.minX, pan.x)),
  y: Math.min(b.maxY, Math.max(b.minY, pan.y)),
});

/**
 * The world-space window visible through the viewport, optionally inset by a
 * fraction of the viewport per edge (the reveal frame, §6.4/§6.5). Comparing
 * instances against this window in world units is what makes visibility one cheap
 * analytic pass. Returns the empty rect for a degenerate viewport or zoom ≤ 0.
 */
export function visibleWorldRect(viewport: Size, pan: Pan, zoom: number, inset = 0): Rect {
  if (viewport.w <= 0 || viewport.h <= 0 || zoom <= 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  return {
    left: screenToWorld(viewport.w * inset, viewport.w, pan.x, zoom),
    right: screenToWorld(viewport.w * (1 - inset), viewport.w, pan.x, zoom),
    top: screenToWorld(viewport.h * inset, viewport.h, pan.y, zoom),
    bottom: screenToWorld(viewport.h * (1 - inset), viewport.h, pan.y, zoom),
  };
}

/**
 * Tab-order question: does any part of the instance show inside the window?
 * Strict comparisons — an object with zero visible pixels is not focusable.
 */
export const instanceVisible = (r: PlacedRect, window: Rect): boolean =>
  r.x < window.right &&
  r.x + r.size > window.left &&
  r.y < window.bottom &&
  r.y + r.size > window.top;

/**
 * Reveal question: is the instance's CENTRE inside the (inset) window? The centre,
 * not the edge — the object must be born whole and inside frame, not blink at the
 * edge exactly where the eye is looking (§6.5). Boundary is inclusive.
 */
export const centreInside = (r: PlacedRect, window: Rect): boolean => {
  const cx = r.x + r.size / 2;
  const cy = r.y + r.size / 2;
  return cx >= window.left && cx <= window.right && cy >= window.top && cy <= window.bottom;
};

/**
 * World sizing (§2.2): compact world below the breakpoint, regular world at or
 * above it. `sizeFactor` scales object size and grid step together on compact.
 */
export function selectWorld(
  layout: Required<VitrinaLayout>,
  viewportW: number,
): { world: Size; sizeFactor: number } {
  return viewportW < layout.compactBreakpoint
    ? { world: layout.compactWorld, sizeFactor: layout.compactSizeFactor }
    : { world: layout.world, sizeFactor: 1 };
}
