import { describe, expect, it } from 'vitest';
import { createRng } from '../src/layout/rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('vitrina');
    const b = createRng('vitrina');
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('vitrina');
    const b = createRng('anirtiv');
    const first = [a(), a(), a(), a()];
    const second = [b(), b(), b(), b()];
    expect(first).not.toEqual(second);
  });

  it('stays within [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform (sanity, not statistics)', () => {
    const rng = createRng('uniform');
    const buckets = [0, 0, 0, 0];
    const n = 40_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 4)]!++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 4 - n * 0.02);
      expect(count).toBeLessThan(n / 4 + n * 0.02);
    }
  });

  it('locks the algorithm: known seed, known first values', () => {
    // If this fails, the PRNG changed — which silently reshuffles every consumer's
    // plane. That is a breaking change, not a refactor.
    const rng = createRng('vitrina');
    const observed = [rng(), rng(), rng()];
    expect(observed).toMatchInlineSnapshot(`
      [
        0.49215413350611925,
        0.5613903638441116,
        0.5834017149172723,
      ]
    `);
  });
});
