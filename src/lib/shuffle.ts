/**
 * Kriptografik rastgelelikle Fisher–Yates karıştırma.
 * Orijinal diziyi bozmaz; her çağrıda gerçekten farklı bir sıra üretir.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  const rand = (max: number) => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Havuzdan rastgele n eleman seçer. */
export function pickRandom<T>(input: readonly T[], n: number): T[] {
  return shuffle(input).slice(0, n);
}
