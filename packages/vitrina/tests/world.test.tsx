// @vitest-environment jsdom
/*
 * Which world is in use, and the one promise it has to keep: NOTHING the plane
 * renders is out of reach. Pan is clamped so the world always covers the
 * viewport, so an object outside the world box can never be brought into view —
 * no gesture, at any zoom, on any device. That is not a rendering bug with a
 * visible symptom; the plane simply comes up missing objects.
 *
 * The trap this file pins: `instances` skips generation, but `compactWorld`
 * used to keep swapping the world under those absolute coordinates below 640px.
 * Every instance beyond the compact width was then stranded outside the pan
 * bounds — permanently, on phones. Explicit instances now dictate the world at
 * every width (`selectWorld`), and anything still outside it is reported in
 * development instead of accepted in silence.
 *
 * The reachability check is analytic and uses the library's own predicates: the
 * union of the visible window over the whole pan range, tested with
 * `instanceVisible` — the same function the frame pass uses for the tab order.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VitrinaInstance } from '../src';
import { DEFAULT_LAYOUT, generateInstances } from '../src';
import { DEFAULT_ZOOM_STEPS } from '../src/defaults';
import {
  instanceVisible,
  panBounds,
  selectWorld,
  visibleWorldRect,
} from '../src/plane/geometry';
import type { Rect, Size } from '../src/plane/geometry';
import { entities, mountStrict, requirePan, resizeSync, stubDom } from './harness';
import type { DomStubs } from './harness';

let stubs: DomStubs;

beforeEach(() => {
  stubs = stubDom();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Viewports from a small phone to a wide desktop, straddling the 640px breakpoint. */
const VIEWPORTS: Size[] = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 639, h: 900 },
  { w: 640, h: 900 },
  { w: 1200, h: 800 },
  { w: 1920, h: 1080 },
];
const ZOOMS = DEFAULT_ZOOM_STEPS;
/** The bounds algebra round-trips through a division by zoom: 4645 comes back as
    4645 ± a few ulps. Coverage is a geometric claim, not a bit-exact one. */
const EPS = 1e-6;

/**
 * Every world point the visitor can bring into view at this zoom: the visible
 * window at the extreme pans, unioned. The window slides continuously between
 * them, so the union is that one rectangle.
 */
function reachableRect(world: Size, viewport: Size, zoom: number): Rect {
  const b = panBounds(world, viewport, zoom);
  // Max pan pushes the world right → the window sits at its leftmost.
  const leftmost = visibleWorldRect(viewport, { x: b.maxX, y: b.maxY }, zoom);
  const rightmost = visibleWorldRect(viewport, { x: b.minX, y: b.minY }, zoom);
  return {
    left: leftmost.left,
    top: leftmost.top,
    right: rightmost.right,
    bottom: rightmost.bottom,
  };
}

/** Instances spread across the FULL default world — half of them past the compact width. */
const spread: VitrinaInstance[] = entities.flatMap((entity, i) =>
  [0, 1, 2].map((n) => ({
    id: `${entity.id}-${n}`,
    entityId: entity.id,
    // Columns walk the whole 4645px width: with the compact world (2200) in
    // force, everything from roughly the halfway column on is unreachable.
    x: 30 + ((i * 3 + n) % 15) * 300,
    y: 40 + Math.floor((i * 3 + n) / 15) * 280,
    size: 190,
  })),
);

describe('the world in use', () => {
  it('explicit instances keep the regular world at every viewport; generated ones still go compact', () => {
    for (const viewport of VIEWPORTS) {
      expect(selectWorld(DEFAULT_LAYOUT, viewport.w, true).world).toEqual(DEFAULT_LAYOUT.world);
    }
    expect(selectWorld(DEFAULT_LAYOUT, 320, false).world).toEqual(DEFAULT_LAYOUT.compactWorld);
  });

  it('the reachable region always covers the whole world box — which is what makes the world box the test', () => {
    for (const explicit of [true, false]) {
      for (const viewport of VIEWPORTS) {
        const { world } = selectWorld(DEFAULT_LAYOUT, viewport.w, explicit);
        for (const zoom of ZOOMS) {
          const r = reachableRect(world, viewport, zoom);
          expect(r.left).toBeLessThanOrEqual(EPS);
          expect(r.top).toBeLessThanOrEqual(EPS);
          expect(r.right).toBeGreaterThanOrEqual(world.w - EPS);
          expect(r.bottom).toBeGreaterThanOrEqual(world.h - EPS);
        }
      }
    }
  });
});

describe('no instance is ever outside the pan bounds', () => {
  it('explicit instances: reachable at every viewport and every zoom step', () => {
    for (const viewport of VIEWPORTS) {
      const { world } = selectWorld(DEFAULT_LAYOUT, viewport.w, true);
      for (const zoom of ZOOMS) {
        const frame = reachableRect(world, viewport, zoom);
        const stranded = spread.filter((inst) => !instanceVisible(inst, frame));
        expect({ viewport: viewport.w, zoom, stranded: stranded.map((i) => i.id) }).toEqual({
          viewport: viewport.w,
          zoom,
          stranded: [],
        });
      }
    }
  });

  it('generated instances: reachable at every viewport and every zoom step, compact world included', () => {
    for (const viewport of VIEWPORTS) {
      const { world, compact } = selectWorld(DEFAULT_LAYOUT, viewport.w);
      // The plane regenerates INTO the world in use — that is what keeps the
      // compact world honest where the explicit list could not be.
      const placed = generateInstances(
        entities,
        compact
          ? {
              ...DEFAULT_LAYOUT,
              world,
              baseSize: DEFAULT_LAYOUT.baseSize * DEFAULT_LAYOUT.compactSizeFactor,
            }
          : DEFAULT_LAYOUT,
      );
      for (const zoom of ZOOMS) {
        const frame = reachableRect(world, viewport, zoom);
        expect(placed.filter((inst) => !instanceVisible(inst, frame))).toEqual([]);
      }
    }
  });

  it('the same list under the OLD behaviour would have stranded most of it — the bug this pins', () => {
    const viewport = { w: 390, h: 844 };
    const compactWorld = DEFAULT_LAYOUT.compactWorld;
    const frame = reachableRect(compactWorld, viewport, 1);
    const stranded = spread.filter((inst) => !instanceVisible(inst, frame));
    expect(stranded.length).toBeGreaterThan(spread.length / 3);
  });
});

describe('the plane mounts in the world its instances were placed in', () => {
  it('explicit instances at a phone width: the pan layer is the regular world, and every object is inside it', async () => {
    stubs.view = { width: 390, height: 844 };
    const { host, root } = await mountStrict({ props: { instances: spread } });
    const pan = requirePan(host);
    expect(pan.style.width).toBe(`${DEFAULT_LAYOUT.world.w}px`);
    expect(pan.style.height).toBe(`${DEFAULT_LAYOUT.world.h}px`);

    // Every object rendered: nothing is dropped for sitting past the compact width.
    const objects = Array.from(host.querySelectorAll<HTMLElement>('[data-vitrina-object]'));
    expect(objects).toHaveLength(spread.length);
    const far = objects.filter((el) => parseFloat(el.style.left) > DEFAULT_LAYOUT.compactWorld.w);
    expect(far.length).toBeGreaterThan(0);

    // …and it survives a resize across the breakpoint, in both directions.
    for (const [w, h] of [
      [1200, 800],
      [320, 568],
    ] as const) {
      resizeSync(stubs, w, h);
      expect(requirePan(host).style.width).toBe(`${DEFAULT_LAYOUT.world.w}px`);
    }

    await act(async () => root.unmount());
  });

  it('GENERATED instances at the same width still get the compact world', async () => {
    stubs.view = { width: 390, height: 844 };
    const { host, root } = await mountStrict();
    expect(requirePan(host).style.width).toBe(`${DEFAULT_LAYOUT.compactWorld.w}px`);
    await act(async () => root.unmount());
  });
});

describe('the development warning', () => {
  it('names the instances that fall outside the world, once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outside: VitrinaInstance[] = [
      { id: 'e0-0', entityId: 'e0', x: 100, y: 100, size: 190 },
      { id: 'e1-0', entityId: 'e1', x: DEFAULT_LAYOUT.world.w - 10, y: 100, size: 190 },
      { id: 'e2-0', entityId: 'e2', x: 100, y: DEFAULT_LAYOUT.world.h + 400, size: 190 },
    ];
    const { root } = await mountStrict({ props: { instances: outside } });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('[vitrina]');
    expect(message).toContain('2 of 3 instances');
    expect(message).toContain('e1-0');
    expect(message).toContain('e2-0');
    expect(message).not.toContain('e0-0');
    await act(async () => root.unmount());
  });

  it('stays silent when every instance is inside the world', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubs.view = { width: 390, height: 844 };
    const { root } = await mountStrict({ props: { instances: spread } });
    expect(warn).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
