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
 * The love theme from the Butterfly Lovers' violin concerto — 梁祝 —
 * G-pentatonic, starting on E as the yu-mode reciting tone.
 */
const liangzhu = theme(
  [
    [64, 1.5],
    [62, 0.5],
    [64, 1],
    [67, 1],
    [69, 1.5],
    [67, 0.5],
    [64, 1],
    [62, 1],
    [64, 2],
    [62, 1],
    [59, 1],
    [62, 4],
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
    blurb: "The Butterfly Lovers' love theme",
    notes: liangzhu,
  },
];
