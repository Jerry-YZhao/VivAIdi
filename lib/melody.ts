import { segmentTrack, type PitchTrack, type Sensitivity } from "./pitch-track";
import type { NoteEvent } from "./types";

export type Melody = {
  notes: NoteEvent[];
};

/** Keep the singer's timing. Tempo can drift, so we never snap to a grid. */
function keepTiming(notes: NoteEvent[]): NoteEvent[] {
  if (!notes.length) return [];
  const t0 = notes[0].startTimeSeconds;
  const shifted = notes.map((n) => ({
    ...n,
    startTimeSeconds: Math.max(0, n.startTimeSeconds - t0),
  }));

  for (let i = 0; i < shifted.length - 1; i++) {
    const room = shifted[i + 1].startTimeSeconds - shifted[i].startTimeSeconds;
    if (room <= 0.02) {
      shifted[i + 1] = {
        ...shifted[i + 1],
        startTimeSeconds: shifted[i].startTimeSeconds + 0.04,
      };
      continue;
    }
    if (shifted[i].durationSeconds > room) {
      shifted[i] = { ...shifted[i], durationSeconds: room };
    }
  }
  return shifted;
}

export function interpretTrack(
  track: PitchTrack,
  sensitivity: Sensitivity,
): Melody {
  return { notes: keepTiming(segmentTrack(track, sensitivity)) };
}
