// Deterministic pseudo-random in [0, 1) — stable across server/client
// render so decorative positions never shift on hydration.
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
