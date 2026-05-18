/**
 * Small deterministic PRNG for generated render textures.
 *
 * Render effects such as noise and texture must be stable across preview,
 * export, and page reloads. Math.random() makes those pixels impossible to
 * regression-test and can produce a different PNG for the same design.
 */
export function createDeterministicRandom(seedInput: string | number): () => number {
  let seed = typeof seedInput === "number" ? seedInput >>> 0 : hashString(seedInput);
  if (seed === 0) seed = 0x6d2b79f5;

  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
