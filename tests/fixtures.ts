import type { NoteEvent } from "../lib/types";

type Step = [pitch: number, beats: number];

/** Build a hum at a given tempo from scale-step/length pairs. */
function hum(steps: Step[], qpm: number, amplitude = 0.7): NoteEvent[] {
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

/** C major, stepwise, four square bars. */
const stepwise = hum(
  [
    [60, 1],
    [62, 1],
    [64, 1],
    [65, 1],
    [67, 2],
    [65, 1],
    [64, 1],
  ],
  96,
);

/** Wide leaps in G major, to stress register handling. */
const leaping = hum(
  [
    [67, 1],
    [74, 1],
    [71, 0.5],
    [79, 0.5],
    [74, 1],
    [67, 2],
    [71, 2],
  ],
  108,
);

/** A minor with a raised leading tone in the melody. */
const minorTheme = hum(
  [
    [69, 1],
    [71, 1],
    [72, 1],
    [74, 1],
    [76, 2],
    [72, 1],
    [68, 1],
    [69, 2],
  ],
  84,
);

/** Long slow notes: sparse material the arranger has to expand. */
const sparse = hum(
  [
    [65, 2],
    [69, 2],
    [67, 4],
  ],
  72,
);

/** Fast, busy humming with sixteenth-ish onsets. */
const busy = hum(
  [
    [72, 0.5],
    [74, 0.5],
    [76, 0.5],
    [74, 0.5],
    [72, 0.5],
    [71, 0.5],
    [72, 1],
    [76, 0.5],
    [74, 0.5],
    [72, 1],
  ],
  120,
);

/** A single held note — the degenerate case. */
const single: NoteEvent[] = [
  { pitchMidi: 64, startTimeSeconds: 0.2, durationSeconds: 1.4, amplitude: 0.6 },
];

export const THEMES: Record<string, NoteEvent[]> = {
  stepwise,
  leaping,
  minor: minorTheme,
  sparse,
  busy,
  single,
  silent: [],
};
