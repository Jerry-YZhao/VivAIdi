import type { NoteEvent } from "./types";

/** Basic Pitch model geometry (constants.py). */
const FPS = 86;
const FRAME_SECONDS = 1 / FPS;
const WINDOW_FRAMES = FPS * 2;
const WINDOW_DRIFT = 0.0103;
const MIDI_OFFSET = 21;
const BINS_PER_SEMITONE = 3;

const HUM_LOW = 43;
const HUM_HIGH = 88;

export type PitchFrame = {
  t: number;
  midi: number;
  conf: number;
  onset: number;
};

export type PitchTrack = {
  frames: PitchFrame[];
  onThreshold: number;
  offThreshold: number;
};

export type Sensitivity = "smooth" | "balanced" | "detailed";

type Preset = {
  changeSemitones: number;
  holdMs: number;
  minMs: number;
  onsetPeak: number;
  gapMs: number;
};

const PRESETS: Record<Sensitivity, Preset> = {
  smooth: { changeSemitones: 1.05, holdMs: 90, minMs: 140, onsetPeak: 0.68, gapMs: 110 },
  balanced: { changeSemitones: 0.8, holdMs: 65, minMs: 95, onsetPeak: 0.5, gapMs: 80 },
  detailed: { changeSemitones: 0.6, holdMs: 40, minMs: 60, onsetPeak: 0.36, gapMs: 50 },
};

function frameTime(index: number) {
  return index * FRAME_SECONDS - WINDOW_DRIFT * Math.floor(index / WINDOW_FRAMES);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function foldOctave(midi: number, ref: number) {
  if (ref <= 0 || midi <= 0) return midi;
  let p = midi;
  while (p - ref > 6) p -= 12;
  while (ref - p > 6) p += 12;
  return p;
}

/** Sub-semitone pitch from the contour bins around the active semitone. */
function refinePitch(contour: number[] | undefined, semitone: number) {
  const midi = MIDI_OFFSET + semitone;
  if (!contour) return midi;
  const center = semitone * BINS_PER_SEMITONE;
  let weight = 0;
  let acc = 0;
  for (let b = center - 2; b <= center + 2; b++) {
    if (b < 0 || b >= contour.length) continue;
    const w = contour[b];
    if (w <= 0) continue;
    weight += w;
    acc += w * b;
  }
  if (weight <= 0) return midi;
  const refined = MIDI_OFFSET + acc / weight / BINS_PER_SEMITONE;
  return Math.abs(refined - midi) > 0.6 ? midi : refined;
}

/**
 * Collapse the model's polyphonic activations into a single pitch curve.
 * Humming is one voice, so the loudest bin per frame is the melody.
 */
export function buildPitchTrack(
  frames: number[][],
  onsets: number[][],
  contours: number[][],
): PitchTrack {
  const raw: PitchFrame[] = [];
  const confs: number[] = [];
  let refPitch = 0;

  for (let i = 0; i < frames.length; i++) {
    const row = frames[i];
    let bestIdx = -1;
    let best = 0;
    const lo = Math.max(0, HUM_LOW - MIDI_OFFSET);
    const hi = Math.min(row.length - 1, HUM_HIGH - MIDI_OFFSET);
    for (let s = lo; s <= hi; s++) {
      if (row[s] > best) {
        best = row[s];
        bestIdx = s;
      }
    }
    const conf = bestIdx < 0 ? 0 : best;
    confs.push(conf);
    let midi = bestIdx < 0 ? 0 : refinePitch(contours[i], bestIdx);
    if (midi > 0 && refPitch > 0) midi = foldOctave(midi, refPitch);
    if (conf > 0.18 && midi > 0) {
      refPitch = refPitch > 0 ? refPitch * 0.85 + midi * 0.15 : midi;
    }
    raw.push({
      t: frameTime(i),
      midi,
      conf,
      onset: bestIdx < 0 ? 0 : (onsets[i]?.[bestIdx] ?? 0),
    });
  }

  const sorted = [...confs].sort((a, b) => a - b);
  const floor = percentile(sorted, 0.4);
  const peak = percentile(sorted, 0.95);
  const onThreshold = Math.min(0.42, Math.max(0.07, floor + (peak - floor) * 0.2));
  const offThreshold = Math.max(0.035, onThreshold * 0.5);

  return { frames: smoothCurve(raw), onThreshold, offThreshold };
}

/** Median then EMA so vibrato and octave hops don't chop a held note. */
function smoothCurve(frames: PitchFrame[]): PitchFrame[] {
  const med = frames.map((f) => ({ ...f }));
  for (let i = 0; i < frames.length; i++) {
    const pitches: number[] = [];
    const confs: number[] = [];
    for (let j = i - 3; j <= i + 3; j++) {
      const f = frames[j];
      if (!f) continue;
      confs.push(f.conf);
      if (f.midi > 0) pitches.push(f.midi);
    }
    if (pitches.length >= 3) {
      pitches.sort((a, b) => a - b);
      med[i].midi = pitches[Math.floor(pitches.length / 2)];
    }
    if (confs.length) {
      confs.sort((a, b) => a - b);
      med[i].conf = confs[Math.floor(confs.length / 2)];
    }
  }

  const out = med.map((f) => ({ ...f }));
  let ema = 0;
  for (let i = 0; i < med.length; i++) {
    if (med[i].midi <= 0) continue;
    ema = ema > 0 ? ema * 0.72 + med[i].midi * 0.28 : med[i].midi;
    out[i].midi = ema;
  }
  return out;
}

function weightedMedian(values: { v: number; w: number }[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return sorted[sorted.length - 1].v;
}

type Segment = { frames: PitchFrame[] };

function closeSegment(seg: Segment, minFrames: number): NoteEvent | null {
  const voiced = seg.frames.filter((f) => f.midi > 0);
  if (voiced.length < minFrames) return null;
  const midi = weightedMedian(voiced.map((f) => ({ v: f.midi, w: f.conf })));
  const start = voiced[0].t;
  const end = voiced[voiced.length - 1].t + FRAME_SECONDS;
  const meanConf = voiced.reduce((s, f) => s + f.conf, 0) / voiced.length;
  return {
    pitchMidi: Math.round(midi),
    startTimeSeconds: start,
    durationSeconds: Math.max(FRAME_SECONDS * 2, end - start),
    amplitude: Math.min(1, Math.max(0.18, meanConf * 1.5)),
  };
}

/**
 * Walk the pitch curve and cut a new note only where the singer meant one:
 * a held pitch change, a fresh onset on the same pitch, or a breath.
 */
export function segmentTrack(track: PitchTrack, sensitivity: Sensitivity): NoteEvent[] {
  const preset = PRESETS[sensitivity];
  const holdFrames = Math.max(2, Math.round(preset.holdMs / 1000 / FRAME_SECONDS));
  const minFrames = Math.max(2, Math.round(preset.minMs / 1000 / FRAME_SECONDS));
  const gapFrames = Math.max(2, Math.round(preset.gapMs / 1000 / FRAME_SECONDS));

  const notes: NoteEvent[] = [];
  let seg: Segment | null = null;
  let segPitch = 0;
  let unvoicedRun = 0;
  let pending: PitchFrame[] = [];
  let framesSinceOnset = 0;

  const flush = (carry: PitchFrame[]) => {
    if (seg) {
      const note = closeSegment(seg, minFrames);
      if (note) notes.push(note);
    }
    seg = carry.length ? { frames: [...carry] } : null;
    segPitch = carry.length ? carry[carry.length - 1].midi : 0;
    pending = [];
    framesSinceOnset = 0;
  };

  for (const f of track.frames) {
    const voiced = seg
      ? f.conf >= track.offThreshold
      : f.conf >= track.onThreshold;

    if (!voiced || f.midi <= 0) {
      unvoicedRun++;
      if (seg && unvoicedRun >= gapFrames) flush([]);
      continue;
    }
    unvoicedRun = 0;

    if (!seg) {
      seg = { frames: [f] };
      segPitch = f.midi;
      framesSinceOnset = 0;
      continue;
    }

    framesSinceOnset++;

    if (Math.abs(f.midi - segPitch) >= preset.changeSemitones) {
      pending.push(f);
      if (pending.length >= holdFrames) {
        flush(pending);
      }
      continue;
    }

    pending = [];
    const reattack =
      f.onset >= preset.onsetPeak && framesSinceOnset >= minFrames;
    if (reattack) {
      flush([f]);
      continue;
    }

    seg.frames.push(f);
    const voicedCount = seg.frames.length;
    segPitch = segPitch + (f.midi - segPitch) / Math.min(16, voicedCount);
  }

  flush([]);
  return notes;
}

export const SENSITIVITY_LABELS: { id: Sensitivity; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];
