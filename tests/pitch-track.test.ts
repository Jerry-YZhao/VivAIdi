import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPitchTrack } from "../lib/pitch-track";
import { interpretTrack } from "../lib/melody";
import type { NoteEvent } from "../lib/types";

/**
 * Behavioural tests for humming transcription.
 *
 * Each case synthesises the three Basic Pitch output heads from a fractional
 * MIDI script, so the tests describe what a singer did rather than how the
 * decoder is built. They assert on the notes a musician would write down.
 */

const FPS = 86;
const N_SEMITONES = 88;
const N_CONTOUR_BINS = 264;
const MIDI_OFFSET = 21;
const BINS_PER_SEMITONE = 3;
/** Model heads never output a clean zero; this stands in for the noise floor. */
const NOISE = 0.01;
const DEFAULT_CONF = 0.9;

type Spec = { midi: number | null; conf?: number; onset?: number };

function frameCount(ms: number) {
  return Math.max(1, Math.round((ms / 1000) * FPS));
}

function hold(midi: number | null, ms: number, conf = DEFAULT_CONF): Spec[] {
  return Array.from({ length: frameCount(ms) }, () => ({ midi, conf }));
}

function silence(ms: number): Spec[] {
  return hold(null, ms);
}

function vibrato(
  midi: number,
  ms: number,
  depthSemitones: number,
  rateHz: number,
): Spec[] {
  const n = frameCount(ms);
  return Array.from({ length: n }, (_, i) => ({
    midi: midi + depthSemitones * Math.sin((2 * Math.PI * rateHz * i) / FPS),
    conf: DEFAULT_CONF,
  }));
}

function glide(from: number, to: number, ms: number): Spec[] {
  const n = frameCount(ms);
  return Array.from({ length: n }, (_, i) => ({
    midi: from + ((to - from) * i) / Math.max(1, n - 1),
    conf: DEFAULT_CONF,
  }));
}

/** Frame / onset / contour heads for one scripted take. */
function synth(spec: Spec[]) {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  for (const s of spec) {
    const row = new Array<number>(N_SEMITONES).fill(NOISE);
    const onsetRow = new Array<number>(N_SEMITONES).fill(0);
    const contourRow = new Array<number>(N_CONTOUR_BINS).fill(NOISE);

    if (s.midi !== null) {
      const conf = s.conf ?? DEFAULT_CONF;
      const semi = Math.round(s.midi) - MIDI_OFFSET;
      row[semi] = conf;
      // The model always leaks a little into adjacent semitones.
      if (semi > 0) row[semi - 1] = conf * 0.12;
      if (semi < N_SEMITONES - 1) row[semi + 1] = conf * 0.12;
      onsetRow[semi] = s.onset ?? 0;

      const peak = (s.midi - MIDI_OFFSET) * BINS_PER_SEMITONE;
      for (let b = Math.floor(peak) - 4; b <= Math.ceil(peak) + 4; b++) {
        if (b < 0 || b >= N_CONTOUR_BINS) continue;
        const d = b - peak;
        contourRow[b] = Math.max(contourRow[b], conf * Math.exp(-(d * d) / 2));
      }
    }

    frames.push(row);
    onsets.push(onsetRow);
    contours.push(contourRow);
  }
  return { frames, onsets, contours };
}

/** Runs the real pipeline, padded with silence like a genuine recording. */
function transcribe(spec: Spec[]): NoteEvent[] {
  const padded = [...silence(250), ...spec, ...silence(250)];
  const { frames, onsets, contours } = synth(padded);
  return interpretTrack(buildPitchTrack(frames, onsets, contours), "balanced")
    .notes;
}

function pitches(notes: NoteEvent[]) {
  return notes.map((n) => n.pitchMidi);
}

const C4 = 60;
const CS4 = 61;
const E4 = 64;
const G4 = 67;
const C5 = 72;
const E2 = 40;

describe("humming transcription", () => {
  it("keeps a note with vibrato as one note", () => {
    const notes = transcribe(vibrato(C4, 900, 0.3, 5.5));
    assert.deepEqual(pitches(notes), [C4]);
  });

  it("keeps a real fifth as two notes in the right octave", () => {
    // The old decoder folded any interval wider than six semitones back
    // towards the running pitch, turning this into C4 then G3.
    const notes = transcribe([...hold(C4, 450), ...hold(G4, 450)]);
    assert.deepEqual(pitches(notes), [C4, G4]);
  });

  it("ignores a pitch glitch shorter than a note", () => {
    const notes = transcribe([
      ...hold(C4, 350),
      ...hold(CS4, 25),
      ...hold(C4, 350),
    ]);
    assert.deepEqual(pitches(notes), [C4]);
  });

  it("ignores a brief octave error", () => {
    const notes = transcribe([
      ...hold(C4, 350),
      ...hold(C5, 30),
      ...hold(C4, 350),
    ]);
    assert.deepEqual(pitches(notes), [C4]);
  });

  it("reads a slide as its endpoints, not every semitone crossed", () => {
    const notes = transcribe([
      ...hold(C4, 320),
      ...glide(C4, E4, 250),
      ...hold(E4, 420),
    ]);
    assert.deepEqual(pitches(notes), [C4, E4]);
  });

  it("survives a brief dropout without splitting", () => {
    const notes = transcribe([
      ...hold(C4, 350),
      ...silence(30),
      ...hold(C4, 350),
    ]);
    assert.deepEqual(pitches(notes), [C4]);
  });

  it("splits a repeated note across a real breath", () => {
    const notes = transcribe([
      ...hold(C4, 400),
      ...silence(200),
      ...hold(C4, 400),
    ]);
    assert.deepEqual(pitches(notes), [C4, C4]);
  });

  it("splits a repeated note on an attack backed by a confidence dip", () => {
    const attack: Spec[] = [{ midi: C4, conf: DEFAULT_CONF, onset: 0.9 }];
    const notes = transcribe([
      ...hold(C4, 400),
      ...hold(C4, 45, 0.3),
      ...attack,
      ...hold(C4, 400),
    ]);
    assert.deepEqual(pitches(notes), [C4, C4]);
  });

  it("does not split on a lone noisy onset frame", () => {
    const noisyOnset: Spec[] = [{ midi: C4, conf: DEFAULT_CONF, onset: 0.95 }];
    const notes = transcribe([
      ...hold(C4, 400),
      ...noisyOnset,
      ...hold(C4, 400),
    ]);
    assert.deepEqual(pitches(notes), [C4]);
  });

  it("transcribes a low hum in its own octave", () => {
    const notes = transcribe(hold(E2, 700));
    assert.deepEqual(pitches(notes), [E2]);
  });

  it("absorbs a blip wedged between two halves of the same note", () => {
    const notes = transcribe([
      ...hold(C4, 400),
      ...hold(CS4, 40),
      ...hold(C4, 350),
    ]);
    assert.deepEqual(pitches(notes), [C4]);
    assert.ok(
      notes[0].durationSeconds > 0.7,
      "the absorbed blip stays inside the note's duration",
    );
  });

  it("follows a short melodic phrase", () => {
    const notes = transcribe([
      ...hold(C4, 300),
      ...hold(E4, 300),
      ...hold(G4, 300),
      ...hold(E4, 300),
    ]);
    assert.deepEqual(pitches(notes), [C4, E4, G4, E4]);
    for (const n of notes) {
      assert.ok(n.durationSeconds > 0.15, "notes keep a musical length");
    }
  });

  it("returns nothing for silence", () => {
    assert.deepEqual(transcribe(silence(600)), []);
  });
});
