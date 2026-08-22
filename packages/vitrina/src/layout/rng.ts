/*
 * Seeded PRNG — the only source of randomness in the library. PURE: no React, no
 * GSAP, no DOM.
 *
 * `Math.random()` anywhere in this package is a bug: the consumer prerenders, the
 * server generates one plane, the client generates another on hydrate, and the result
 * is a hydration mismatch. Everything random flows from one seed so the same inputs
 * always produce the same plane.
 *
 * xmur3 hashes the string seed into 32-bit state; mulberry32 generates from it. Both
 * use only `Math.imul`, xor, and shifts — bit-exact across JS engines.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a generator of floats in [0, 1), fully determined by the seed. */
export function createRng(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}
