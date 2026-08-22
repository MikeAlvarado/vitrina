/*
 * §10 boundary cases covered in this file:
 *   - zero entities              → empty instance list through framePass
 *   - one entity                 → single-instance reveal/focus lifecycle
 *   - world smaller than viewport → whole world inside the inset frame at once
 *   - zoom at both extremes      → far out reveals everything, far in only the centre
 *   - negative pan               → distant instances entering as the window shifts
 *   - viewport of zero size      → nothing focusable, nothing entering
 * (count below entity count is a generator concern: generate.test.ts.)
 */

import { describe, expect, it } from 'vitest';
import { framePass, staggerDelays } from '../src/plane/reveal';
import { centerPan } from '../src/plane/geometry';
import { generateInstances } from '../src/layout/generate';
import { createRng } from '../src/layout/rng';
import { resolveLayout, REVEAL_GAP_MS, REVEAL_INSET } from '../src/defaults';
import type { VitrinaInstance } from '../src/types';

const VIEW = { w: 1280, h: 800 };
const NO_PAN = { x: 0, y: 0 };
const NONE: ReadonlySet<string> = new Set();

/** Instance helper: placed by centre, 100 px unless stated. */
const at = (id: string, cx: number, cy: number, size = 100): VitrinaInstance => ({
  id,
  entityId: id,
  x: cx - size / 2,
  y: cy - size / 2,
  size,
});

describe('framePass — boundaries', () => {
  it('zero instances → nothing focusable, nothing entering', () => {
    expect(framePass([], VIEW, NO_PAN, 1, REVEAL_INSET, NONE)).toEqual({
      focusable: [],
      entering: [],
    });
  });

  it('viewport of zero size → nothing, regardless of instances', () => {
    const instances = [at('a', 640, 400)];
    expect(framePass(instances, { w: 0, h: 0 }, NO_PAN, 1, REVEAL_INSET, NONE)).toEqual({
      focusable: [],
      entering: [],
    });
    expect(framePass(instances, { w: 0, h: 0 }, NO_PAN, 1, REVEAL_INSET, new Set(['a']))).toEqual({
      focusable: [],
      entering: [],
    });
  });

  it('zoom ≤ 0 → nothing, no NaN', () => {
    const instances = [at('a', 640, 400)];
    for (const zoom of [0, -1]) {
      expect(framePass(instances, VIEW, NO_PAN, zoom, REVEAL_INSET, NONE)).toEqual({
        focusable: [],
        entering: [],
      });
    }
  });
});

describe('framePass — one instance lifecycle (one entity)', () => {
  const inst = [at('solo', 640, 400)];

  it('unrevealed and in frame: entering, but NOT focusable (opacity-0 rule §6.4)', () => {
    const pass = framePass(inst, VIEW, NO_PAN, 1, REVEAL_INSET, NONE);
    expect(pass.entering).toEqual(['solo']);
    expect(pass.focusable).toEqual([]);
  });

  it('once revealed: focusable, and never entering again (reveal is permanent)', () => {
    const pass = framePass(inst, VIEW, NO_PAN, 1, REVEAL_INSET, new Set(['solo']));
    expect(pass.focusable).toEqual(['solo']);
    expect(pass.entering).toEqual([]);
  });

  it('revealed but off-frame: not focusable (tab order excludes the invisible)', () => {
    const far = [at('far', 5000, 400)];
    const pass = framePass(far, VIEW, NO_PAN, 1, REVEAL_INSET, new Set(['far']));
    expect(pass.focusable).toEqual([]);
    expect(pass.entering).toEqual([]);
  });
});

describe('framePass — the two windows differ', () => {
  it('rect visible but centre outside the inset frame: focusable if revealed, not entering if not', () => {
    // Inset frame at zoom 1, pan 0: x ∈ [153.6, 1126.4]. Centre at 100 is outside
    // it, but the rect (25..175) overlaps the outer frame.
    const edge = at('edge', 100, 400, 150);
    expect(framePass([edge], VIEW, NO_PAN, 1, REVEAL_INSET, NONE).entering).toEqual([]);
    const revealed = framePass([edge], VIEW, NO_PAN, 1, REVEAL_INSET, new Set(['edge']));
    expect(revealed.focusable).toEqual(['edge']);
  });

  it('the same centre enters once pan moves it past the inset margin', () => {
    const edge = at('edge', 100, 400, 150);
    // Pan +100 → centre paints at 200 > 153.6.
    const pass = framePass([edge], VIEW, { x: 100, y: 0 }, 1, REVEAL_INSET, NONE);
    expect(pass.entering).toEqual(['edge']);
  });
});

describe('framePass — movement and zoom', () => {
  it('negative pan brings distant instances into frame', () => {
    const instances = [at('near', 640, 400), at('deep', 2000, 400)];
    const before = framePass(instances, VIEW, NO_PAN, 1, REVEAL_INSET, NONE);
    expect(before.entering).toEqual(['near']);
    const after = framePass(instances, VIEW, { x: -1360, y: 0 }, 1, REVEAL_INSET, NONE);
    expect(after.entering).toEqual(['deep']);
  });

  it('zoom extremes: far out reveals everything at once, far in only the centre', () => {
    const spread = [at('a', 640, 400), at('b', 1200, 400), at('c', 4000, 400)];
    const zoomedIn = framePass(spread, VIEW, NO_PAN, 10, REVEAL_INSET, NONE);
    expect(zoomedIn.entering).toEqual(['a']);
    const zoomedOut = framePass(spread, VIEW, NO_PAN, 0.1, REVEAL_INSET, NONE);
    expect(zoomedOut.entering).toEqual(['a', 'b', 'c']);
  });

  it('entering preserves input order', () => {
    const instances = [at('third', 700, 400), at('first', 500, 400), at('second', 600, 400)];
    const pass = framePass(instances, VIEW, NO_PAN, 0.5, REVEAL_INSET, NONE);
    expect(pass.entering).toEqual(['third', 'first', 'second']);
  });

  it('world smaller than viewport: every instance enters in a single pass', () => {
    const world = { w: 600, h: 400 };
    const instances = [at('a', 100, 100), at('b', 300, 200), at('c', 550, 380)];
    const pass = framePass(instances, VIEW, centerPan(world, VIEW), 1, REVEAL_INSET, NONE);
    expect(pass.entering).toEqual(['a', 'b', 'c']);
  });
});

describe('framePass — against generated instances', () => {
  it('centre-of-world pass reveals a subset, which then becomes focusable', () => {
    const layout = resolveLayout({ seed: 'reveal-bridge' });
    const entities = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}` }));
    const instances = generateInstances(entities, layout);
    const pan = centerPan(layout.world, VIEW);

    const first = framePass(instances, VIEW, pan, 1, REVEAL_INSET, NONE);
    expect(first.focusable).toEqual([]); // nothing revealed yet
    expect(first.entering.length).toBeGreaterThan(0);
    expect(first.entering.length).toBeLessThan(instances.length);
    const ids = new Set(instances.map((i) => i.id));
    for (const id of first.entering) expect(ids.has(id)).toBe(true);

    const revealed = new Set(first.entering);
    const second = framePass(instances, VIEW, pan, 1, REVEAL_INSET, revealed);
    expect(second.entering).toEqual([]); // permanence
    expect(second.focusable.length).toBeGreaterThanOrEqual(first.entering.length);
    for (const id of first.entering) expect(second.focusable).toContain(id);
  });
});

describe('staggerDelays', () => {
  it('deterministic for the same seed', () => {
    expect(staggerDelays(20, createRng('s'), REVEAL_GAP_MS)).toEqual(
      staggerDelays(20, createRng('s'), REVEAL_GAP_MS),
    );
  });

  it('first pop is immediate, gaps stay within [30, 80), strictly increasing', () => {
    const delays = staggerDelays(50, createRng('gaps'), REVEAL_GAP_MS);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) {
      const gap = delays[i]! - delays[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(REVEAL_GAP_MS[0]);
      expect(gap).toBeLessThan(REVEAL_GAP_MS[1]);
    }
  });

  it('zero and one are trivial', () => {
    expect(staggerDelays(0, createRng('s'), REVEAL_GAP_MS)).toEqual([]);
    expect(staggerDelays(1, createRng('s'), REVEAL_GAP_MS)).toEqual([0]);
  });
});
