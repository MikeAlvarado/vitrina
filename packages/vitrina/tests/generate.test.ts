import { describe, expect, it } from 'vitest';
import { generateInstances, generatePlacedInstances } from '../src/layout/generate';
import type { PlacedInstance } from '../src/layout/generate';
import { DEFAULT_LAYOUT, resolveLayout } from '../src/defaults';
import type { VitrinaEntity, VitrinaLayout } from '../src/types';

const entityList = (n: number): VitrinaEntity[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

const layoutWith = (overrides: VitrinaLayout = {}): Required<VitrinaLayout> =>
  resolveLayout(overrides);

const useCounts = (instances: { entityId: string }[]): Map<string, number> => {
  const uses = new Map<string, number>();
  for (const i of instances) uses.set(i.entityId, (uses.get(i.entityId) ?? 0) + 1);
  return uses;
};

/** Pairs of same-entity instances within `sep` grid cells (Chebyshev). */
const separationViolations = (placed: PlacedInstance[], sep: number): number => {
  let violations = 0;
  const byEntity = new Map<string, PlacedInstance[]>();
  for (const p of placed) {
    const list = byEntity.get(p.entityId) ?? [];
    list.push(p);
    byEntity.set(p.entityId, list);
  }
  for (const list of byEntity.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.max(
          Math.abs(list[i]!.col - list[j]!.col),
          Math.abs(list[i]!.row - list[j]!.row),
        );
        if (d <= sep) violations++;
      }
    }
  }
  return violations;
};

describe('generateInstances — determinism', () => {
  it('same seed, same inputs → byte-identical output, 100 runs', () => {
    const reference = JSON.stringify(
      generateInstances(entityList(15), layoutWith({ seed: 'determinism' })),
    );
    for (let run = 0; run < 100; run++) {
      // Fresh arrays every run: determinism must come from the inputs' values,
      // not from object identity or hidden mutation.
      const again = JSON.stringify(
        generateInstances(entityList(15), layoutWith({ seed: 'determinism' })),
      );
      expect(again).toBe(reference);
    }
  });

  it('different seed → different output', () => {
    const a = JSON.stringify(generateInstances(entityList(15), layoutWith({ seed: 'a' })));
    const b = JSON.stringify(generateInstances(entityList(15), layoutWith({ seed: 'b' })));
    expect(a).not.toBe(b);
  });
});

describe('generateInstances — structure', () => {
  const entities = entityList(15);
  const layout = layoutWith();
  const instances = generateInstances(entities, layout);

  it('fills to the requested count with the default layout', () => {
    expect(instances).toHaveLength(DEFAULT_LAYOUT.count);
  });

  it("every instance's entityId exists in entities", () => {
    const ids = new Set(entities.map((e) => e.id));
    for (const i of instances) expect(ids.has(i.entityId)).toBe(true);
  });

  it('instance ids are unique and follow `${entityId}-${n}`', () => {
    expect(new Set(instances.map((i) => i.id)).size).toBe(instances.length);
    for (const i of instances) expect(i.id).toMatch(new RegExp(`^${i.entityId}-\\d+$`));
  });

  it('usage is balanced: max(uses) - min(uses) <= 1', () => {
    for (const n of [3, 15, 40]) {
      const uses = useCounts(generateInstances(entityList(n), layout));
      expect(uses.size).toBe(Math.min(n, DEFAULT_LAYOUT.count));
      const counts = [...uses.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('no instance falls outside the world bounds', () => {
    for (const i of instances) {
      expect(i.x).toBeGreaterThanOrEqual(0);
      expect(i.y).toBeGreaterThanOrEqual(0);
      expect(i.x + i.size).toBeLessThanOrEqual(layout.world.w);
      expect(i.y + i.size).toBeLessThanOrEqual(layout.world.h);
    }
  });

  it('sizes stay within baseSize ± sizeJitter', () => {
    const lo = DEFAULT_LAYOUT.baseSize * (1 - DEFAULT_LAYOUT.sizeJitter) - 0.01;
    const hi = DEFAULT_LAYOUT.baseSize * (1 + DEFAULT_LAYOUT.sizeJitter) + 0.01;
    for (const i of instances) {
      expect(i.size).toBeGreaterThanOrEqual(lo);
      expect(i.size).toBeLessThanOrEqual(hi);
    }
  });

  it('an explicit entity size overrides baseSize', () => {
    const mixed: VitrinaEntity[] = [{ id: 'big', size: 400 }, ...entityList(11)];
    const result = generateInstances(mixed, layout);
    const bigs = result.filter((i) => i.entityId === 'big');
    expect(bigs.length).toBeGreaterThan(0);
    for (const i of bigs) {
      expect(i.size).toBeGreaterThanOrEqual(400 * 0.85 - 0.01);
      expect(i.size).toBeLessThanOrEqual(400 * 1.15 + 0.01);
    }
  });
});

describe('generateInstances — separation', () => {
  it('honours minSeparation when the constraint is satisfiable', () => {
    // From ~15 entities up the constraint is satisfiable on the default grid;
    // assert across entity counts and seeds so this is a property, not a fluke.
    for (const n of [15, 24, 40]) {
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        const placed = generatePlacedInstances(entityList(n), layoutWith({ seed }));
        expect(separationViolations(placed, DEFAULT_LAYOUT.minSeparation)).toBe(0);
      }
    }
  });

  it('relaxes rather than throws when the constraint is unsatisfiable', () => {
    // 3 entities × 114 instances: unsatisfiable by construction. The plane must
    // still render, fully placed and balanced.
    const placed = generatePlacedInstances(entityList(3), layoutWith({ seed: 'relax' }));
    expect(placed).toHaveLength(DEFAULT_LAYOUT.count);
    const counts = [...useCounts(placed).values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // Prove the relaxation path actually ran, i.e. this case genuinely violates.
    expect(separationViolations(placed, DEFAULT_LAYOUT.minSeparation)).toBeGreaterThan(0);
  });

  it('even when relaxing, never places the same entity in adjacent cells (8 entities)', () => {
    // 8 entities × 114 instances is the documented wallpaper floor: ~14 copies each,
    // which is AT the packing bound for the full radius — so relaxation must run.
    // Adjacent duplicates are what reads as a bug, and must never survive it.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const placed = generatePlacedInstances(entityList(8), layoutWith({ seed }));
      expect(separationViolations(placed, 1)).toBe(0);
    }
  });
});

describe('generateInstances — boundaries', () => {
  it('zero entities → empty, no throw', () => {
    expect(generateInstances([], layoutWith())).toEqual([]);
  });

  it('count <= 0 or degenerate world → empty, no throw', () => {
    expect(generateInstances(entityList(5), layoutWith({ count: 0 }))).toEqual([]);
    expect(generateInstances(entityList(5), layoutWith({ count: -3 }))).toEqual([]);
    expect(generateInstances(entityList(5), layoutWith({ world: { w: 0, h: 0 } }))).toEqual([]);
  });

  it('count smaller than entities.length uses a subset, does not duplicate', () => {
    const result = generateInstances(entityList(15), layoutWith({ count: 5 }));
    expect(result).toHaveLength(5);
    expect(new Set(result.map((i) => i.entityId)).size).toBe(5);
  });

  it('one entity fills the whole plane without throwing', () => {
    const result = generateInstances(entityList(1), layoutWith());
    expect(result).toHaveLength(DEFAULT_LAYOUT.count);
    for (const i of result) expect(i.entityId).toBe('e0');
  });

  it('a world smaller than the objects clamps sizes and stays in bounds', () => {
    const layout = layoutWith({ world: { w: 100, h: 100 }, count: 10 });
    const result = generateInstances(entityList(4), layout);
    for (const i of result) {
      expect(i.size).toBeLessThanOrEqual(100);
      expect(i.x).toBeGreaterThanOrEqual(0);
      expect(i.y).toBeGreaterThanOrEqual(0);
      expect(i.x + i.size).toBeLessThanOrEqual(100);
      expect(i.y + i.size).toBeLessThanOrEqual(100);
    }
  });

  it('count above cell capacity caps at capacity instead of overlapping cells', () => {
    // 4 columns on a 400×400 world → step 100 → 4×4 = 16 cells.
    const layout = layoutWith({
      world: { w: 400, h: 400 },
      columns: 4,
      count: 999,
      baseSize: 40,
    });
    const placed = generatePlacedInstances(entityList(4), layout);
    expect(placed).toHaveLength(16);
    const cellKeys = new Set(placed.map((p) => `${p.col},${p.row}`));
    expect(cellKeys.size).toBe(16);
  });

  it('duplicate entity ids are rejected loudly', () => {
    expect(() =>
      generateInstances([{ id: 'dup' }, { id: 'dup' }], layoutWith()),
    ).toThrow(TypeError);
  });
});

describe('resolveLayout', () => {
  it('fills every field from the defaults', () => {
    expect(resolveLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it('explicit undefined does not clobber a default', () => {
    expect(resolveLayout({ count: undefined, seed: 'x' })).toEqual({
      ...DEFAULT_LAYOUT,
      seed: 'x',
    });
  });
});
