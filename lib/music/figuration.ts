import type { Articulation, NoteEvent } from "../types";
import { BEATS_PER_BAR, type Slot } from "./form";
import type { Chord } from "./harmony";
import type { GridNote } from "./theme";
import { nearestPc, pc } from "./theory";

export type EventOptions = {
  gain?: number;
  articulation?: Articulation;
  attack?: number;
  release?: number;
  /** Fraction of the written length actually sounded. */
  gate?: number;
  range?: [number, number];
};

export function toEvents(
  notes: GridNote[],
  spb: number,
  options: EventOptions = {},
): NoteEvent[] {
  const gain = options.gain ?? 1;
  const gate = options.gate ?? 1;
  return notes
    .filter((n) => n.durBeats > 0.05)
    .map((n) => {
      let pitch = Math.round(n.pitch);
      if (options.range) {
        pitch = Math.min(options.range[1], Math.max(options.range[0], pitch));
      }
      const event: NoteEvent = {
        pitchMidi: pitch,
        startTimeSeconds: n.startBeat * spb,
        durationSeconds: Math.max(0.07, n.durBeats * spb * gate),
        amplitude: Math.min(1, Math.max(0.06, n.amp * gain)),
      };
      if (options.articulation && options.articulation !== "normal") {
        event.articulation = options.articulation;
      }
      if (options.attack !== undefined) event.attack = options.attack;
      if (options.release !== undefined) event.release = options.release;
      return event;
    });
}

/** One held note per slot for a single voice of the chorale skeleton. */
export function voiceLine(
  slots: Slot[],
  voiced: number[][],
  voiceIndex: number,
): GridNote[] {
  return slots.map((slot, i) => ({
    pitch: voiced[i][voiceIndex],
    startBeat: slot.startBeat,
    durBeats: slot.durBeats,
    amp: slot.dyn,
  }));
}

/** Merge repeated pitches so a held harmony is not re-attacked every slot. */
export function tieRepeats(notes: GridNote[]): GridNote[] {
  const out: GridNote[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (
      last &&
      last.pitch === n.pitch &&
      Math.abs(last.startBeat + last.durBeats - n.startBeat) < 1e-6
    ) {
      last.durBeats += n.durBeats;
      last.amp = Math.max(last.amp, n.amp);
      continue;
    }
    out.push({ ...n });
  }
  return out;
}

/** Repeated strokes inside each slot: the pulse that drives a Classical texture. */
export function pulseLine(
  line: GridNote[],
  subdiv: number,
  ampScale = 1,
  gate = 1,
): GridNote[] {
  const out: GridNote[] = [];
  for (const n of line) {
    const count = Math.max(1, Math.round(n.durBeats / subdiv));
    for (let i = 0; i < count; i++) {
      out.push({
        pitch: n.pitch,
        startBeat: n.startBeat + i * subdiv,
        durBeats: subdiv * gate,
        // A lightly detached repeat, stronger on the beat.
        amp: n.amp * ampScale * (i % 2 === 0 ? 1 : 0.82),
      });
    }
  }
  return out;
}

/** Notes only on the weak half of each beat — the classic accompanying lift. */
export function offbeatLine(
  line: GridNote[],
  subdiv = 0.5,
  ampScale = 0.85,
): GridNote[] {
  const out: GridNote[] = [];
  for (const n of line) {
    const count = Math.max(1, Math.round(n.durBeats / (subdiv * 2)));
    for (let i = 0; i < count; i++) {
      out.push({
        pitch: n.pitch,
        startBeat: n.startBeat + i * subdiv * 2 + subdiv,
        durBeats: subdiv,
        amp: n.amp * ampScale,
      });
    }
  }
  return out;
}

/**
 * Break a chord into a running figure. `order` indexes the supplied voices, so
 * [0,2,1,2] gives the Alberti shape.
 */
export function brokenChord(
  slots: Slot[],
  voiced: number[][],
  voices: number[],
  subdiv: number,
  order: number[],
  ampScale = 0.8,
): GridNote[] {
  const out: GridNote[] = [];
  slots.forEach((slot, i) => {
    const pitches = voices.map((v) => voiced[i][v]);
    const count = Math.max(1, Math.round(slot.durBeats / subdiv));
    for (let step = 0; step < count; step++) {
      const pick = order[step % order.length];
      out.push({
        pitch: pitches[pick % pitches.length],
        startBeat: slot.startBeat + step * subdiv,
        durBeats: subdiv,
        amp: slot.dyn * ampScale * (step % 2 === 0 ? 1 : 0.88),
      });
    }
  });
  return out;
}

/**
 * Fill a third between consecutive structural notes with the scale tone in
 * between, on the weak part of the beat.
 */
export function addPassingTones(
  line: GridNote[],
  scale: number[],
  maxInsertBeats = 1,
): GridNote[] {
  const out: GridNote[] = [];
  for (let i = 0; i < line.length; i++) {
    const note = line[i];
    const next = line[i + 1];
    out.push({ ...note });
    if (!next) continue;
    const gap = next.pitch - note.pitch;
    if (Math.abs(gap) !== 3 && Math.abs(gap) !== 4) continue;
    if (note.durBeats < 1 || note.durBeats > maxInsertBeats * 4) continue;
    const middle = note.pitch + Math.sign(gap) * 2;
    const passing = nearestPc(middle, scale, middle - 1, middle + 1);
    if (passing === note.pitch || passing === next.pitch) continue;
    const insertLength = Math.min(0.5, note.durBeats / 2);
    const target = out[out.length - 1];
    target.durBeats = Math.max(0.25, note.durBeats - insertLength);
    out.push({
      pitch: passing,
      startBeat: note.startBeat + target.durBeats,
      durBeats: insertLength,
      amp: note.amp * 0.8,
    });
  }
  return out;
}

/**
 * Hold a voice over the chord change and let it fall by step: the suspension
 * that gives inner parts their rhythmic life.
 */
export function addSuspensions(
  line: GridNote[],
  chords: Chord[],
  slots: Slot[],
  everyNth = 2,
): GridNote[] {
  const out: GridNote[] = [];
  let eligible = 0;
  for (let i = 0; i < line.length; i++) {
    const current = line[i];
    const previous = line[i - 1];
    const slot = slots[i];
    const chord = chords[i];
    const suspendable =
      i > 0 &&
      i < line.length - 1 &&
      slot &&
      chord &&
      !slot.cadence &&
      slot.durBeats >= 2 &&
      (current.pitch - previous.pitch === -1 || current.pitch - previous.pitch === -2) &&
      !chord.pcs.includes(pc(previous.pitch));

    if (!suspendable) {
      out.push({ ...current });
      continue;
    }
    eligible++;
    if (eligible % everyNth !== 0) {
      out.push({ ...current });
      continue;
    }
    const hold = Math.min(1, slot.durBeats / 2);
    out.push({
      pitch: previous.pitch,
      startBeat: current.startBeat,
      durBeats: hold,
      amp: current.amp,
    });
    out.push({
      pitch: current.pitch,
      startBeat: current.startBeat + hold,
      durBeats: Math.max(0.25, current.durBeats - hold),
      amp: current.amp * 0.95,
    });
  }
  return out;
}

/**
 * One note at a time. A single wind player or singer cannot overlap themselves,
 * and overlaps would also hide the gaps that `breathe` inserts.
 */
export function single(notes: GridNote[]): GridNote[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || b.durBeats - a.durBeats);
  const out: GridNote[] = [];
  for (const note of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...note });
      continue;
    }
    if (note.startBeat - last.startBeat < 0.05) {
      if (note.durBeats > last.durBeats) out[out.length - 1] = { ...note };
      continue;
    }
    const room = note.startBeat - last.startBeat;
    if (last.durBeats > room) last.durBeats = room;
    out.push({ ...note });
  }
  return out;
}

/**
 * Guarantee air in the part: no unbroken run longer than `maxRun` beats, and a
 * real gap at every phrase boundary. Winds and voices need to breathe.
 */
export function breathe(
  notes: GridNote[],
  maxRun: number,
  restBeats: number,
  boundaries: number[] = [],
): GridNote[] {
  const sorted = single(notes);
  const out: GridNote[] = [];
  let runStart = sorted.length ? sorted[0].startBeat : 0;

  for (let i = 0; i < sorted.length; i++) {
    const note = { ...sorted[i] };
    const end = note.startBeat + note.durBeats;
    let lifted = false;

    const lift = (at: number) => {
      const target = at - restBeats - note.startBeat;
      note.durBeats = Math.max(0.25, Math.min(note.durBeats, target));
      lifted = true;
    };

    // A phrase joint this note reaches or runs through.
    const joint = boundaries.find((b) => b > note.startBeat + 1e-6 && b <= end + 1e-6);
    if (joint !== undefined) lift(joint);

    // A run that has gone on longer than a single breath.
    if (end >= runStart + maxRun - 1e-6) lift(runStart + maxRun);

    out.push(note);
    const next = sorted[i + 1];
    if (!next) break;
    const gap = next.startBeat - (note.startBeat + note.durBeats);
    if (lifted || gap > 0.24) runStart = next.startBeat;
  }
  return out;
}

export function articulate(notes: GridNote[], gate: number): GridNote[] {
  return notes.map((n) => ({ ...n, durBeats: Math.max(0.2, n.durBeats * gate) }));
}

export function scaleAmp(notes: GridNote[], factor: number): GridNote[] {
  return notes.map((n) => ({ ...n, amp: Math.min(1, n.amp * factor) }));
}

export function transposeOctaves(notes: GridNote[], octaves: number): GridNote[] {
  return notes.map((n) => ({ ...n, pitch: n.pitch + octaves * 12 }));
}

export function barRange(firstBar: number, lastBar: number): [number, number] {
  return [firstBar * BEATS_PER_BAR, (lastBar + 1) * BEATS_PER_BAR];
}

export function inBars(
  notes: GridNote[],
  firstBar: number,
  lastBar: number,
): GridNote[] {
  const [from, to] = barRange(firstBar, lastBar);
  return notes
    .filter((n) => n.startBeat >= from - 1e-6 && n.startBeat < to - 1e-6)
    .map((n) => ({ ...n, durBeats: Math.min(n.durBeats, to - n.startBeat) }));
}

export function withoutBars(
  notes: GridNote[],
  firstBar: number,
  lastBar: number,
): GridNote[] {
  const [from, to] = barRange(firstBar, lastBar);
  return notes.filter((n) => n.startBeat < from - 1e-6 || n.startBeat >= to - 1e-6);
}

export function shiftBeats(notes: GridNote[], beats: number): GridNote[] {
  return notes.map((n) => ({ ...n, startBeat: n.startBeat + beats }));
}

export function pitchAtBeat(line: GridNote[], beat: number): number | null {
  let found: number | null = null;
  for (const n of line) {
    if (n.startBeat <= beat + 1e-6) found = n.pitch;
    else break;
  }
  return found;
}

/** Re-voice one line onto another's rhythm — the basis of homorhythmic writing. */
export function followRhythm(
  rhythm: GridNote[],
  line: GridNote[],
  ampScale = 1,
): GridNote[] {
  const out: GridNote[] = [];
  for (const beat of rhythm) {
    const pitch = pitchAtBeat(line, beat.startBeat);
    if (pitch === null) continue;
    out.push({
      pitch,
      startBeat: beat.startBeat,
      durBeats: beat.durBeats,
      amp: beat.amp * ampScale,
    });
  }
  return tieRepeats(out);
}

/**
 * Quarter-note bass that steps between structural notes instead of repeating
 * them, filling thirds with scale tones and leaps with the intervening chord tone.
 */
export function walkingBass(
  line: GridNote[],
  scale: number[],
  subdiv = 1,
): GridNote[] {
  const out: GridNote[] = [];
  for (let i = 0; i < line.length; i++) {
    const current = line[i];
    const next = line[i + 1];
    const count = Math.max(1, Math.round(current.durBeats / subdiv));
    for (let step = 0; step < count; step++) {
      const last = step === count - 1;
      let pitch = current.pitch;
      if (last && next && count > 1) {
        // Approach the next root by step where the gap allows it.
        const direction = Math.sign(next.pitch - current.pitch) || 1;
        const approach = next.pitch - direction * 2;
        if (Math.abs(approach - current.pitch) <= 5) {
          pitch = nearestPc(approach, scale, approach - 1, approach + 1);
        }
      }
      out.push({
        pitch,
        startBeat: current.startBeat + step * subdiv,
        durBeats: subdiv * 0.86,
        amp: current.amp * (step === 0 ? 1 : 0.88),
      });
    }
  }
  return out;
}

/**
 * Answer a phrase a few beats later, snapping each echoed note to the harmony
 * it now lands on so the imitation stays consonant.
 */
export function echoLine(
  source: GridNote[],
  delayBeats: number,
  chords: Chord[],
  range: [number, number],
  ampScale = 0.7,
): GridNote[] {
  const chordAt = (beat: number): Chord => {
    let found = chords[0];
    for (const chord of chords) {
      if (beat >= chord.slot.startBeat - 1e-6) found = chord;
      else break;
    }
    return found;
  };
  return source.map((n) => {
    const startBeat = n.startBeat + delayBeats;
    const chord = chordAt(startBeat);
    const folded = foldLine([{ ...n }], range[0], range[1])[0].pitch;
    return {
      pitch: nearestPc(folded, chord.pcs, range[0], range[1]),
      startBeat,
      durBeats: n.durBeats,
      amp: n.amp * ampScale,
    };
  });
}

/** Clamp a line into an instrument's range by octave, note by note. */
export function foldLine(notes: GridNote[], min: number, max: number): GridNote[] {
  return notes.map((n) => {
    let pitch = n.pitch;
    while (pitch < min) pitch += 12;
    while (pitch > max) pitch -= 12;
    return { ...n, pitch: Math.min(max, Math.max(min, pitch)) };
  });
}
