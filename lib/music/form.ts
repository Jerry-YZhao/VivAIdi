import type { Fn } from "./theory";

/**
 * A 16-bar Classical sentence:
 *   bars 1-4   presentation  - basic idea plus varied repetition over tonic
 *   bars 5-8   continuation  - fragmentation, faster harmonic rhythm, half cadence
 *   bars 9-12  return        - restatement rising to the climax
 *   bars 13-16 cadential     - predominant, cadential 6/4, V7, perfect authentic cadence
 */
export type PhraseRole = "presentation" | "continuation" | "return" | "cadential";

export type Cadence = "HC" | "PAC";

export type Slot = {
  index: number;
  bar: number;
  startBeat: number;
  durBeats: number;
  role: PhraseRole;
  /** Constrains the planner where syntax is not negotiable. */
  fn?: Fn;
  degree?: number;
  inversion?: number;
  seventh?: boolean;
  cadence?: Cadence;
  /** Planned loudness of the moment, 0..1. */
  dyn: number;
};

export const BARS = 16;
export const BEATS_PER_BAR = 4;
export const TOTAL_BEATS = BARS * BEATS_PER_BAR;

export const PHRASES: { role: PhraseRole; firstBar: number; lastBar: number }[] = [
  { role: "presentation", firstBar: 0, lastBar: 3 },
  { role: "continuation", firstBar: 4, lastBar: 7 },
  { role: "return", firstBar: 8, lastBar: 11 },
  { role: "cadential", firstBar: 12, lastBar: 15 },
];

export function roleOfBar(bar: number): PhraseRole {
  const phrase = PHRASES.find((p) => bar >= p.firstBar && bar <= p.lastBar);
  return phrase ? phrase.role : "cadential";
}

/** Dynamic arc: settle in, build through the continuation, peak at the return. */
const BAR_DYN = [
  0.44, 0.47, 0.5, 0.54, 0.58, 0.62, 0.67, 0.6, 0.72, 0.75, 0.8, 0.84, 0.7, 0.78,
  0.87, 0.92,
];

type SlotSeed = Omit<Slot, "index" | "role" | "dyn" | "startBeat"> & {
  startBeat?: number;
};

/**
 * Harmonic rhythm accelerates towards each cadence, which is the main engine of
 * Classical momentum. Only the structural chords are forced.
 */
function seeds(): SlotSeed[] {
  const bar = (n: number) => n * BEATS_PER_BAR;
  return [
    // Presentation: the basic idea over a prolonged tonic, then a varied
    // repetition free to move twice a bar. A quoted four-bar tune usually needs
    // a predominant in its second half, and forcing the tonic there fought the
    // melody instead of supporting it.
    { bar: 0, startBeat: bar(0), durBeats: 4, degree: 0, inversion: 0 },
    { bar: 1, startBeat: bar(1), durBeats: 2 },
    { bar: 1, startBeat: bar(1) + 2, durBeats: 2 },
    { bar: 2, startBeat: bar(2), durBeats: 2 },
    { bar: 2, startBeat: bar(2) + 2, durBeats: 2 },
    { bar: 3, startBeat: bar(3), durBeats: 2 },
    { bar: 3, startBeat: bar(3) + 2, durBeats: 2 },

    // Continuation: two chords per bar, closing with a half cadence.
    { bar: 4, startBeat: bar(4), durBeats: 2 },
    { bar: 4, startBeat: bar(4) + 2, durBeats: 2 },
    { bar: 5, startBeat: bar(5), durBeats: 2 },
    { bar: 5, startBeat: bar(5) + 2, durBeats: 2 },
    { bar: 6, startBeat: bar(6), durBeats: 2 },
    { bar: 6, startBeat: bar(6) + 2, durBeats: 2, fn: "S" },
    { bar: 7, startBeat: bar(7), durBeats: 4, degree: 4, inversion: 0, cadence: "HC" },

    // Return: theme restated, harmony opening out again.
    { bar: 8, startBeat: bar(8), durBeats: 4, degree: 0, inversion: 0 },
    { bar: 9, startBeat: bar(9), durBeats: 2 },
    { bar: 9, startBeat: bar(9) + 2, durBeats: 2 },
    { bar: 10, startBeat: bar(10), durBeats: 2 },
    { bar: 10, startBeat: bar(10) + 2, durBeats: 2 },
    { bar: 11, startBeat: bar(11), durBeats: 4 },

    // Cadential: T - S - cadential 6/4 - V7 - I.
    { bar: 12, startBeat: bar(12), durBeats: 4, degree: 0, inversion: 0 },
    { bar: 13, startBeat: bar(13), durBeats: 2, fn: "S" },
    { bar: 13, startBeat: bar(13) + 2, durBeats: 2, fn: "S" },
    { bar: 14, startBeat: bar(14), durBeats: 2, degree: 0, inversion: 2 },
    { bar: 14, startBeat: bar(14) + 2, durBeats: 2, degree: 4, inversion: 0, seventh: true },
    { bar: 15, startBeat: bar(15), durBeats: 4, degree: 0, inversion: 0, cadence: "PAC" },
  ];
}

export function buildFormSlots(): Slot[] {
  return seeds().map((seed, index) => ({
    ...seed,
    index,
    startBeat: seed.startBeat ?? seed.bar * BEATS_PER_BAR,
    role: roleOfBar(seed.bar),
    dyn: BAR_DYN[seed.bar],
  }));
}

export function slotAtBeat(slots: Slot[], beat: number): Slot {
  let found = slots[0];
  for (const slot of slots) {
    if (beat >= slot.startBeat - 1e-6) found = slot;
    else break;
  }
  return found;
}

export function isStrongBeat(beat: number): boolean {
  const inBar = ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  return Math.abs(inBar) < 1e-6 || Math.abs(inBar - 2) < 1e-6;
}

export function isDownbeat(beat: number): boolean {
  const inBar = ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  return Math.abs(inBar) < 1e-6;
}
