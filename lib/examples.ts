import type { NoteEvent } from "./types";

export type ExampleId = "twinkle" | "ode" | "liangzhu";

export type ExampleTheme = {
  id: ExampleId;
  label: string;
  blurb: string;
  notes: NoteEvent[];
};

type Step = [pitch: number, beats: number];

function theme(steps: Step[], qpm: number, amplitude = 0.7): NoteEvent[] {
  const spb = 60 / qpm;
  let t = 0;
  return steps.map(([pitchMidi, beats]) => {
    const note: NoteEvent = {
      pitchMidi,
      startTimeSeconds: t,
      durationSeconds: beats * spb * 0.92,
      amplitude,
    };
    t += beats * spb;
    return note;
  });
}

/** Ah vous dirai-je, Maman — the little star, in C. */
const twinkle = theme(
  [
    [60, 1],
    [60, 1],
    [67, 1],
    [67, 1],
    [69, 1],
    [69, 1],
    [67, 2],
    [65, 1],
    [65, 1],
    [64, 1],
    [64, 1],
    [62, 1],
    [62, 1],
    [60, 2],
  ],
  96,
);

/** The hymn from Beethoven's Ninth, hummed in C. */
const ode = theme(
  [
    [64, 1],
    [64, 1],
    [65, 1],
    [67, 1],
    [67, 1],
    [65, 1],
    [64, 1],
    [62, 1],
    [60, 1],
    [60, 1],
    [62, 1],
    [64, 1],
    [64, 1.5],
    [62, 0.5],
    [62, 2],
  ],
  108,
);

/**
 * 梁祝 — bars 7-8 of the love theme, where the line finally soars. Read from
 * the numbered score in G (1 = G, 4/4): a right-hand dot adds half the value,
 * one underline halves it, two underlines halve it again, and dots above a
 * numeral lift it by an octave each.
 *
 *   | 3  5· 6  1· 2  6 1 5 | 5· 1̈  6 5 3 5  2 — |
 */
const liangzhu = theme(
  [
    // Bar 7, low register: B D E G A, then back down to D.
    [59, 1],
    [62, 0.75],
    [64, 0.25],
    [67, 0.75],
    [69, 0.25],
    [64, 0.25],
    [67, 0.25],
    [62, 0.5],
    // Bar 8 leaps the octave — D5 up to G5, then the descent to a held A.
    [74, 0.75],
    [79, 0.25],
    [76, 0.25],
    [74, 0.25],
    [71, 0.25],
    [74, 0.25],
    [69, 2],
  ],
  66,
);

export const EXAMPLES: ExampleTheme[] = [
  {
    id: "twinkle",
    label: "Twinkle, Twinkle",
    blurb: "The little star — a first lesson in C",
    notes: twinkle,
  },
  {
    id: "ode",
    label: "Ode to Joy",
    blurb: "Beethoven's hymn, from the Ninth",
    notes: ode,
  },
  {
    id: "liangzhu",
    label: "Liang Zhu",
    blurb: "The Butterfly Lovers' theme, where it soars",
    notes: liangzhu,
  },
];
