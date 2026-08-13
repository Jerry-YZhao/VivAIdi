import { BEATS_PER_BAR, isDownbeat, TOTAL_BEATS, type Slot } from "./form";
import { chordAtBeat, type Chord } from "./harmony";
import type { GridNote, ThemeAnalysis } from "./theme";
import { nearestPc, pc, scaleSteps, type Mode } from "./theory";

/** Move a pitch by scale steps, staying diatonic. */
export function diatonicShift(
  pitch: number,
  steps: number,
  tonicPc: number,
  mode: Mode,
): number {
  if (steps === 0) return pitch;
  const scale = scaleSteps(mode);
  const rel = pc(pitch - tonicPc);
  let index = scale.indexOf(rel);
  if (index < 0) {
    index = 0;
    let bestGap = 99;
    for (let i = 0; i < scale.length; i++) {
      const gap = Math.abs(scale[i] - rel);
      if (gap < bestGap) {
        bestGap = gap;
        index = i;
      }
    }
  }
  const base = pitch - rel;
  const target = index + steps;
  const octave = Math.floor(target / scale.length);
  const wrapped = ((target % scale.length) + scale.length) % scale.length;
  return base + scale[wrapped] + octave * 12;
}

export function scaleDegreePitch(
  degreeIndex: number,
  nearPitch: number,
  tonicPc: number,
  mode: Mode,
): number {
  const scale = scaleSteps(mode);
  const wrapped = ((degreeIndex % scale.length) + scale.length) % scale.length;
  return nearestPc(nearPitch, [pc(tonicPc + scale[wrapped])], nearPitch - 6, nearPitch + 6);
}

function shiftNotes(
  notes: GridNote[],
  offsetBeats: number,
  steps: number,
  tonicPc: number,
  mode: Mode,
): GridNote[] {
  return notes.map((n) => ({
    ...n,
    startBeat: n.startBeat + offsetBeats,
    pitch: diatonicShift(n.pitch, steps, tonicPc, mode),
  }));
}

/** The head of the basic idea, used for fragmentation in continuations. */
function head(idea: GridNote[], beats: number): GridNote[] {
  const cut = idea
    .filter((n) => n.startBeat < beats)
    .map((n) => ({ ...n, durBeats: Math.min(n.durBeats, beats - n.startBeat) }));
  if (cut.length) return cut;
  return [{ pitch: idea[0]?.pitch ?? 67, startBeat: 0, durBeats: beats, amp: 0.7 }];
}

function trimTo(notes: GridNote[], limitBeat: number): GridNote[] {
  return notes
    .filter((n) => n.startBeat < limitBeat - 1e-6)
    .map((n) => ({ ...n, durBeats: Math.min(n.durBeats, limitBeat - n.startBeat) }))
    .filter((n) => n.durBeats > 0.24);
}

/** Keep the line inside a comfortable two-octave window around the hum. */
function constrainRegister(notes: GridNote[], center: number): GridNote[] {
  const low = center - 10;
  const high = center + 14;
  return notes.map((n) => {
    let pitch = n.pitch;
    while (pitch < low) pitch += 12;
    while (pitch > high) pitch -= 12;
    return { ...n, pitch };
  });
}

/**
 * Grow the two-bar basic idea into a 16-bar sentence: presentation, fragmented
 * continuation towards the half cadence, return, and a 3-2-1 cadential close.
 */
export function draftLead(analysis: ThemeAnalysis): GridNote[] {
  const { basicIdea: idea, tonicPc, mode, centerPitch } = analysis;
  const bar = (n: number) => n * BEATS_PER_BAR;
  if (!idea.length) return [];

  const out: GridNote[] = [];

  // Presentation: statement then repetition.
  out.push(...shiftNotes(idea, bar(0), 0, tonicPc, mode));
  out.push(...shiftNotes(idea, bar(2), 0, tonicPc, mode));

  // Continuation: two-beat fragment in an ascending arch.
  const frag = head(idea, 2);
  [0, 1, 2, 1].forEach((steps, i) => {
    out.push(...shiftNotes(frag, bar(4) + i * 2, steps, tonicPc, mode));
  });

  // Liquidation: a stepwise descent that lands on the dominant for the half cadence.
  const descentTop = diatonicShift(frag[0].pitch, 3, tonicPc, mode);
  for (let i = 0; i < 4; i++) {
    out.push({
      pitch: diatonicShift(descentTop, -i, tonicPc, mode),
      startBeat: bar(6) + i,
      durBeats: 1,
      amp: 0.7,
    });
  }
  out.push({
    pitch: scaleDegreePitch(4, descentTop, tonicPc, mode),
    startBeat: bar(7),
    durBeats: 3,
    amp: 0.72,
  });

  // Return: the idea again, then lifted a third to reach the climax.
  out.push(...shiftNotes(idea, bar(8), 0, tonicPc, mode));
  out.push(...trimTo(shiftNotes(idea, bar(10), 2, tonicPc, mode), bar(12)));

  // Cadential approach: the fragment falls out of the climax.
  [2, 1, 0, -1].forEach((steps, i) => {
    out.push(...shiftNotes(frag, bar(12) + i * 2, steps, tonicPc, mode));
  });

  // 3 - 2 - 1 over the cadential six-four, V7 and the final tonic.
  const near = centerPitch + 4;
  out.push({
    pitch: scaleDegreePitch(2, near, tonicPc, mode),
    startBeat: bar(14),
    durBeats: 2,
    amp: 0.85,
  });
  out.push({
    pitch: scaleDegreePitch(1, near, tonicPc, mode),
    startBeat: bar(14) + 2,
    durBeats: 2,
    amp: 0.88,
  });
  out.push({
    pitch: scaleDegreePitch(0, near, tonicPc, mode),
    startBeat: bar(15),
    durBeats: 4,
    amp: 0.94,
  });

  const sorted = trimTo(out, TOTAL_BEATS).sort((a, b) => a.startBeat - b.startBeat);
  return constrainRegister(dedupe(sorted), centerPitch);
}

function dedupe(notes: GridNote[]): GridNote[] {
  const out: GridNote[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...n });
      continue;
    }
    if (Math.abs(last.startBeat - n.startBeat) < 1e-6) {
      if (n.durBeats > last.durBeats) out[out.length - 1] = { ...n };
      continue;
    }
    const room = n.startBeat - last.startBeat;
    if (last.durBeats > room) last.durBeats = room;
    out.push({ ...n });
  }
  return out;
}

/** Bars where the hum should stay literally intact. */
const VERBATIM_BARS = new Set([0, 1, 8, 9]);

/**
 * Reconcile the drafted line with the chosen harmony. Structural notes take
 * chord tones; passing notes only have to stay in the key. The opening
 * statement is protected so the singer still recognises their tune.
 */
export function finalizeLead(
  draft: GridNote[],
  chords: Chord[],
  tonicPc: number,
  mode: Mode,
): GridNote[] {
  const scale = scaleSteps(mode).map((s) => pc(tonicPc + s));
  return draft.map((note) => {
    const chord = chordAtBeat(chords, note.startBeat);
    const bar = Math.floor(note.startBeat / BEATS_PER_BAR);
    const structural = isDownbeat(note.startBeat) || note.durBeats >= 2;
    const window = VERBATIM_BARS.has(bar) ? 2 : 4;

    let pitch = note.pitch;
    if (structural) {
      const target = nearestPc(pitch, chord.pcs, pitch - window, pitch + window);
      if (Math.abs(target - pitch) <= window) pitch = target;
      else pitch = nearestPc(pitch, scale, pitch - 2, pitch + 2);
    } else if (!scale.includes(pc(pitch))) {
      pitch = nearestPc(pitch, scale, pitch - 2, pitch + 2);
    }

    return {
      ...note,
      pitch,
      amp: Math.min(1, note.amp * 0.7 + chord.dyn * 0.45),
    };
  });
}

/**
 * The melody pitch that the voice-leading solver should treat as the top voice
 * of each chord, snapped to a chord tone where the melody is passing through.
 */
export function structuralSoprano(
  chords: Chord[],
  lead: GridNote[],
  slots: Slot[],
): (number | null)[] {
  return slots.map((slot, i) => {
    const inSlot = lead.filter(
      (n) =>
        n.startBeat >= slot.startBeat - 1e-6 &&
        n.startBeat < slot.startBeat + slot.durBeats - 1e-6,
    );
    if (!inSlot.length) return null;
    const first = inSlot[0];
    const chord = chords[i];
    return nearestPc(first.pitch, chord.pcs, first.pitch - 4, first.pitch + 4);
  });
}

/** Shift a whole line by octaves so it sits inside an instrument's range. */
export function fitLineToRange(
  notes: GridNote[],
  min: number,
  max: number,
): GridNote[] {
  if (!notes.length) return notes;
  let best = 0;
  let bestCost = Infinity;
  for (let octave = -3; octave <= 3; octave++) {
    let cost = 0;
    for (const n of notes) {
      const p = n.pitch + octave * 12;
      if (p < min) cost += (min - p) * 2;
      else if (p > max) cost += (p - max) * 2;
      // Prefer the middle of the range.
      cost += Math.abs(p - (min + max) / 2) * 0.05;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = octave;
    }
  }
  return notes.map((n) => ({
    ...n,
    pitch: Math.min(max, Math.max(min, n.pitch + best * 12)),
  }));
}
