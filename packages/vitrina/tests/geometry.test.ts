/*
 * §10 boundary cases covered in this file:
 *   - world smaller than viewport  → panBounds collapses to the centering pan
 *   - zoom at both extremes        → default steps 0.75/1.25 plus 0.1/10, and the
 *                                    degenerate zoom ≤ 0 guard (no NaN, ever)
 *   - negative pan                 → the NORMAL panning state (world wider than
 *                                    viewport puts pan in [viewW − worldW, 0])
 *   - viewport of zero size        → finite bounds, empty visibility window
 * (zero entities / one entity / count below entity count are instance-collection
 * concerns: generate.test.ts and reveal.test.ts.)
 */

import { describe, expect, it } from 'vitest';
import {
  centerPan,
  centreInside,
  clampPan,
  instanceVisible,
  outOfWorld,
  panBounds,
  screenToWorld,
  selectWorld,
  visibleWorldRect,
  worldToScreen,
} from '../src/plane/geometry';
import { DEFAULT_LAYOUT } from '../src/defaults';

const VIEW = { w: 1280, h: 800 };
const WORLD = { w: 4645, h: 3044 };
const ZOOMS = [0.1, 0.75, 1, 1.25, 10];

describe('worldToScreen / screenToWorld', () => {
  it('are exact inverses across pans and zooms (negative pan included)', () => {
    for (const pan of [0, 300, -1682.5, -4000]) {
      for (const zoom of ZOOMS) {
        for (const w of [0, 42.5, 2322.5, 4645]) {
          const s = worldToScreen(w, VIEW.w, pan, zoom);
          expect(screenToWorld(s, VIEW.w, pan, zoom)).toBeCloseTo(w, 8);
        }
      }
    }
  });

  it('is the identity at zoom 1, pan 0', () => {
    for (const w of [0, 640, 1280, 5000]) {
      expect(worldToScreen(w, VIEW.w, 0, 1)).toBe(w);
    }
  });

  it('the world point under the viewport centre is zoom-invariant (§6.1)', () => {
    // This is the property that makes the two-layer split work: changing zoom is a
    // single scale tween with no pan compensation.
    const pan = -1000;
    const underCentre = VIEW.w / 2 - pan;
    for (const zoom of ZOOMS) {
      expect(worldToScreen(underCentre, VIEW.w, pan, zoom)).toBe(VIEW.w / 2);
    }
  });
});

describe('centerPan', () => {
  it('centres the world at every zoom step (no pan compensation)', () => {
    const cp = centerPan(WORLD, VIEW);
    expect(cp).toEqual({ x: -1682.5, y: -1122 }); // negative pan is the normal state
    for (const zoom of ZOOMS) {
      expect(worldToScreen(WORLD.w / 2, VIEW.w, cp.x, zoom)).toBeCloseTo(VIEW.w / 2, 8);
      expect(worldToScreen(WORLD.h / 2, VIEW.h, cp.y, zoom)).toBeCloseTo(VIEW.h / 2, 8);
    }
  });

  it('is the midpoint of panBounds on both axes at any zoom', () => {
    const cp = centerPan(WORLD, VIEW);
    for (const zoom of ZOOMS) {
      const b = panBounds(WORLD, VIEW, zoom);
      expect((b.minX + b.maxX) / 2).toBeCloseTo(cp.x, 8);
      expect((b.minY + b.maxY) / 2).toBeCloseTo(cp.y, 8);
    }
  });
});

describe('panBounds', () => {
  it('at zoom 1 pan runs from viewW − worldW (negative) up to 0', () => {
    expect(panBounds(WORLD, VIEW, 1)).toEqual({
      minX: 1280 - 4645,
      maxX: 0,
      minY: 800 - 3044,
      maxY: 0,
    });
  });

  it('world edges sit flush against the viewport at both bounds', () => {
    for (const zoom of [0.75, 1, 1.25]) {
      const b = panBounds(WORLD, VIEW, zoom);
      expect(worldToScreen(0, VIEW.w, b.maxX, zoom)).toBeCloseTo(0, 8);
      expect(worldToScreen(WORLD.w, VIEW.w, b.minX, zoom)).toBeCloseTo(VIEW.w, 8);
      expect(worldToScreen(0, VIEW.h, b.maxY, zoom)).toBeCloseTo(0, 8);
      expect(worldToScreen(WORLD.h, VIEW.h, b.minY, zoom)).toBeCloseTo(VIEW.h, 8);
    }
  });

  it('zooming in widens the range, zooming out narrows it', () => {
    // range = worldLen − viewLen/zoom, per axis
    const span = (z: number) => {
      const b = panBounds(WORLD, VIEW, z);
      return b.maxX - b.minX;
    };
    expect(span(1.25)).toBeGreaterThan(span(1));
    expect(span(1)).toBeGreaterThan(span(0.75));
  });

  it('world smaller than viewport → both axes collapse to the centering pan', () => {
    const small = { w: 600, h: 400 };
    const cp = centerPan(small, VIEW);
    const b = panBounds(small, VIEW, 1);
    expect(b).toEqual({ minX: cp.x, maxX: cp.x, minY: cp.y, maxY: cp.y });
  });

  it('a world zoomed out until it fits collapses the same way', () => {
    // 4645 × 0.2 = 929 < 1280 and 3044 × 0.2 ≈ 609 < 800
    const cp = centerPan(WORLD, VIEW);
    const b = panBounds(WORLD, VIEW, 0.2);
    expect(b).toEqual({ minX: cp.x, maxX: cp.x, minY: cp.y, maxY: cp.y });
  });

  it('axes are independent: wide-but-short world collapses only y', () => {
    const flat = { w: 4645, h: 400 };
    const cp = centerPan(flat, VIEW);
    const b = panBounds(flat, VIEW, 1);
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minY).toBe(cp.y);
    expect(b.maxY).toBe(cp.y);
  });

  it('viewport of zero size stays finite (no NaN, no Infinity)', () => {
    const b = panBounds(WORLD, { w: 0, h: 0 }, 1);
    for (const v of [b.minX, b.maxX, b.minY, b.maxY]) expect(Number.isFinite(v)).toBe(true);
    expect(b.minX).toBeLessThanOrEqual(b.maxX);
    expect(b.minY).toBeLessThanOrEqual(b.maxY);
  });

  it('zoom ≤ 0 is degenerate: collapsed to centre, never NaN', () => {
    const cp = centerPan(WORLD, VIEW);
    for (const zoom of [0, -1]) {
      const b = panBounds(WORLD, VIEW, zoom);
      expect(b).toEqual({ minX: cp.x, maxX: cp.x, minY: cp.y, maxY: cp.y });
    }
  });
});

describe('clampPan', () => {
  const b = { minX: -3365, maxX: 0, minY: -2244, maxY: 0 };

  it('leaves an in-bounds pan untouched', () => {
    expect(clampPan({ x: -100, y: -50 }, b)).toEqual({ x: -100, y: -50 });
  });

  it('clamps each side and axis independently', () => {
    expect(clampPan({ x: 50, y: -9999 }, b)).toEqual({ x: 0, y: -2244 });
    expect(clampPan({ x: -9999, y: 50 }, b)).toEqual({ x: -3365, y: 0 });
  });

  it('collapsed bounds force the exact centering value', () => {
    const collapsed = { minX: 340, maxX: 340, minY: 200, maxY: 200 };
    expect(clampPan({ x: -500, y: 900 }, collapsed)).toEqual({ x: 340, y: 200 });
  });
});

describe('visibleWorldRect', () => {
  it('zoom 1, pan 0 → the viewport itself in world units', () => {
    expect(visibleWorldRect(VIEW, { x: 0, y: 0 }, 1)).toEqual({
      left: 0,
      right: 1280,
      top: 0,
      bottom: 800,
    });
  });

  it('negative pan shifts the window deeper into the world', () => {
    const r = visibleWorldRect(VIEW, { x: -1682.5, y: -722 }, 1);
    expect(r.left).toBeCloseTo(1682.5, 8);
    expect(r.right).toBeCloseTo(1682.5 + 1280, 8);
    expect(r.top).toBeCloseTo(722, 8);
  });

  it('window size scales inversely with zoom, at both extremes', () => {
    for (const zoom of ZOOMS) {
      const r = visibleWorldRect(VIEW, { x: 0, y: 0 }, zoom);
      expect(r.right - r.left).toBeCloseTo(VIEW.w / zoom, 8);
      expect(r.bottom - r.top).toBeCloseTo(VIEW.h / zoom, 8);
    }
  });

  it('inset shrinks each edge by view·inset/zoom in world units', () => {
    for (const zoom of [0.75, 1, 1.25]) {
      const full = visibleWorldRect(VIEW, { x: -500, y: -300 }, zoom);
      const inset = visibleWorldRect(VIEW, { x: -500, y: -300 }, zoom, 0.12);
      expect(inset.left - full.left).toBeCloseTo((VIEW.w * 0.12) / zoom, 8);
      expect(full.right - inset.right).toBeCloseTo((VIEW.w * 0.12) / zoom, 8);
      expect(inset.top - full.top).toBeCloseTo((VIEW.h * 0.12) / zoom, 8);
      expect(full.bottom - inset.bottom).toBeCloseTo((VIEW.h * 0.12) / zoom, 8);
    }
  });

  it('zero viewport or zoom ≤ 0 → the empty window', () => {
    const empty = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(visibleWorldRect({ w: 0, h: 0 }, { x: 0, y: 0 }, 1)).toEqual(empty);
    expect(visibleWorldRect(VIEW, { x: 0, y: 0 }, 0)).toEqual(empty);
    expect(visibleWorldRect(VIEW, { x: 0, y: 0 }, -2)).toEqual(empty);
  });
});

describe('instanceVisible (tab-order question)', () => {
  const win = { left: 100, top: 100, right: 500, bottom: 400 };

  it('inside and partially overlapping are visible', () => {
    expect(instanceVisible({ x: 200, y: 200, size: 100 }, win)).toBe(true);
    expect(instanceVisible({ x: 50, y: 150, size: 100 }, win)).toBe(true); // straddles left
    expect(instanceVisible({ x: 450, y: 350, size: 200 }, win)).toBe(true); // straddles corner
  });

  it('exactly touching an edge is NOT visible (zero visible pixels, strict)', () => {
    expect(instanceVisible({ x: 0, y: 200, size: 100 }, win)).toBe(false); // right edge at 100
    expect(instanceVisible({ x: 500, y: 200, size: 100 }, win)).toBe(false); // starts at right
    expect(instanceVisible({ x: 200, y: 400, size: 100 }, win)).toBe(false); // starts at bottom
  });

  it('fully outside is not visible; the empty window shows nothing', () => {
    expect(instanceVisible({ x: 900, y: 900, size: 50 }, win)).toBe(false);
    expect(instanceVisible({ x: 10, y: 10, size: 50 }, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
  });
});

describe('centreInside (reveal question)', () => {
  const win = { left: 100, top: 100, right: 500, bottom: 400 };

  it('centre inside → true; centre on the boundary → true (inclusive)', () => {
    expect(centreInside({ x: 250, y: 200, size: 100 }, win)).toBe(true);
    expect(centreInside({ x: 50, y: 200, size: 100 }, win)).toBe(true); // centre exactly 100
  });

  it('rect overlapping but centre outside → false (born whole, §6.5)', () => {
    const r = { x: 20, y: 200, size: 100 }; // centre 70 < 100, rect reaches 120
    expect(instanceVisible(r, win)).toBe(true);
    expect(centreInside(r, win)).toBe(false);
  });
});

describe('selectWorld', () => {
  it('below the breakpoint → compact world and size factor', () => {
    expect(selectWorld(DEFAULT_LAYOUT, 639)).toEqual({
      world: DEFAULT_LAYOUT.compactWorld,
      sizeFactor: DEFAULT_LAYOUT.compactSizeFactor,
      compact: true,
    });
  });

  it('at or above the breakpoint → regular world, factor 1', () => {
    for (const w of [640, 641, 1920]) {
      expect(selectWorld(DEFAULT_LAYOUT, w)).toEqual({
        world: DEFAULT_LAYOUT.world,
        sizeFactor: 1,
        compact: false,
      });
    }
  });

  it('EXPLICIT instances take the regular world at every width — compactWorld is ignored', () => {
    for (const w of [0, 1, 320, 639, 640, 1920]) {
      expect(selectWorld(DEFAULT_LAYOUT, w, true)).toEqual({
        world: DEFAULT_LAYOUT.world,
        sizeFactor: 1,
        compact: false,
      });
    }
  });
});

describe('outOfWorld', () => {
  const WORLD_S = { w: 1000, h: 800 };
  const at = (id: string, x: number, y: number, size = 100) => ({ id, x, y, size });

  it('a box fully inside is in; touching either edge exactly is still in', () => {
    expect(outOfWorld([at('a', 0, 0), at('b', 900, 700), at('c', 450, 350)], WORLD_S)).toEqual([]);
  });

  it('reports every kind of overshoot, in input order', () => {
    const list = [
      at('right', 901, 0), //  x + size past the world's width
      at('inside', 10, 10),
      at('bottom', 0, 701),
      at('negative', -1, 0),
      at('above', 0, -0.5),
    ];
    expect(outOfWorld(list, WORLD_S)).toEqual(['right', 'bottom', 'negative', 'above']);
  });

  it('is empty for an empty list and for a zero world with zero-sized instances', () => {
    expect(outOfWorld([], WORLD_S)).toEqual([]);
    expect(outOfWorld([at('z', 0, 0, 0)], { w: 0, h: 0 })).toEqual([]);
  });
});
