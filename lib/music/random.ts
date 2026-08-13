/** Deterministic PRNG so the same hum always produces the same score. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let state = (Math.floor(seed) || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** Seed derived from the melody itself, so identical input replays identically. */
export function seedFromNotes(
  notes: { pitchMidi: number; startTimeSeconds: number; durationSeconds: number }[],
): number {
  let hash = 2166136261;
  for (const n of notes) {
    const parts = [
      n.pitchMidi,
      Math.round(n.startTimeSeconds * 1000),
      Math.round(n.durationSeconds * 1000),
    ];
    for (const value of parts) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0) || 1;
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
