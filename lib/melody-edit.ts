import type { NoteEvent } from "./types";

export const MIN_NOTE_SECONDS = 0.08;
export const MIN_PITCH = 36;
export const MAX_PITCH = 96;

function clone(notes: NoteEvent[]): NoteEvent[] {
  return notes.map((n) => ({ ...n }));
}

/** Snap a sung pitch to a neighbouring chromatic step. */
export function setPitch(
  notes: NoteEvent[],
  index: number,
  pitchMidi: number,
): NoteEvent[] {
  if (!notes[index]) return notes;
  const pitch = Math.min(
    MAX_PITCH,
    Math.max(MIN_PITCH, Math.round(pitchMidi)),
  );
  const next = clone(notes);
  next[index] = { ...next[index], pitchMidi: pitch };
  return next;
}

/**
 * Move the left edge. The right edge stays put; the start cannot pass the
 * previous note's end (or zero).
 */
export function resizeLeft(
  notes: NoteEvent[],
  index: number,
  newStart: number,
): NoteEvent[] {
  const note = notes[index];
  if (!note) return notes;
  const end = note.startTimeSeconds + note.durationSeconds;
  const prev = notes[index - 1];
  const earliest = prev
    ? prev.startTimeSeconds + prev.durationSeconds
    : 0;
  const start = Math.min(
    end - MIN_NOTE_SECONDS,
    Math.max(earliest, newStart),
  );
  const next = clone(notes);
  next[index] = {
    ...note,
    startTimeSeconds: start,
    durationSeconds: end - start,
  };
  return next;
}

/**
 * Move the right edge. Later notes ride with it — growing pushes them back,
 * shrinking draws them in — so gaps after the edit stay as they were, the way
 * a ripple trim works on a timeline.
 */
export function resizeRight(
  notes: NoteEvent[],
  index: number,
  newEnd: number,
): NoteEvent[] {
  const note = notes[index];
  if (!note) return notes;
  const oldEnd = note.startTimeSeconds + note.durationSeconds;
  const end = Math.max(note.startTimeSeconds + MIN_NOTE_SECONDS, newEnd);
  const delta = end - oldEnd;
  if (delta === 0) return notes;
  return notes.map((n, i) => {
    if (i === index) {
      return { ...n, durationSeconds: end - n.startTimeSeconds };
    }
    if (i > index) {
      return { ...n, startTimeSeconds: n.startTimeSeconds + delta };
    }
    return n;
  });
}
