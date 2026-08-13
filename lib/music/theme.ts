import type { NoteEvent } from "../types";
import { MAJOR_SCALE, MINOR_SCALE, pc, type Mode } from "./theory";

/** A note measured in beats rather than seconds, so it can be re-timed freely. */
export type GridNote = {
  pitch: number;
  startBeat: number;
  durBeats: number;
  amp: number;
};

export type ThemeAnalysis = {
  tonicPc: number;
  mode: Mode;
  qpm: number;
  /** The whole hum, quantized to the beat grid. */
  notes: GridNote[];
  /** Two bars of material used as the basic idea of the sentence. */
  basicIdea: GridNote[];
  /**
   * Four bars of the hum, ready to open the piece. A four-bar tune is quoted
   * whole; anything shorter repeats to fill the phrase.
   */
  themePhrase: GridNote[];
  /** Median pitch of the hum, used to place the melody in a sensible octave. */
  centerPitch: number;
  /** Onsets per beat — busy hums get lighter accompaniments. */
  density: number;
  invented: boolean;
};

const BEATS_PER_BAR = 4;
const IDEA_BEATS = BEATS_PER_BAR * 2;
const PHRASE_BEATS = BEATS_PER_BAR * 4;

/** Krumhansl-Schmuckler key profiles. */
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/**
 * Collapse the transcription into one clean monophonic line. Separate onsets of
 * the same pitch are kept apart: the segmenter only emits them where it heard a
 * new attack, and repeated notes carry much of a melody's identity.
 */
function monophonic(notes: NoteEvent[]): NoteEvent[] {
  const sorted = [...notes]
    .filter((n) => n.durationSeconds > 0.06 && n.amplitude > 0.05)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  const out: NoteEvent[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...n });
      continue;
    }
    const lastEnd = last.startTimeSeconds + last.durationSeconds;
    if (n.startTimeSeconds < lastEnd) {
      last.durationSeconds = Math.max(
        0.06,
        n.startTimeSeconds - last.startTimeSeconds,
      );
    }
    out.push({ ...n });
  }
  return out;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Infer the pulse from inter-onset intervals, then fold it into a walking
 * tempo. A hum of eighth notes and a hum of half notes both land near 100.
 */
export function estimateQpm(notes: NoteEvent[]): number {
  const iois: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i].startTimeSeconds - notes[i - 1].startTimeSeconds;
    if (gap >= 0.12 && gap <= 2.4) iois.push(gap);
  }
  if (!iois.length) return 96;
  let beat = median(iois);
  while (beat < 60 / 138) beat *= 2;
  while (beat > 60 / 66) beat /= 2;
  const qpm = 60 / beat;
  return Math.min(138, Math.max(66, Math.round(qpm / 2) * 2));
}

export function detectKey(notes: NoteEvent[]): { tonicPc: number; mode: Mode } {
  const hist = new Array(12).fill(0);
  for (const n of notes) {
    hist[pc(n.pitchMidi)] += n.durationSeconds * (0.4 + n.amplitude);
  }
  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 0) return { tonicPc: 0, mode: "major" };

  let best = { tonicPc: 0, mode: "major" as Mode };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as Mode[]) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      let score = 0;
      for (let i = 0; i < 12; i++) score += hist[pc(tonic + i)] * profile[i];
      // Sparse hums carry little modal information; lean major when it is a tie.
      if (mode === "major") score *= 1.02;
      if (score > bestScore) {
        bestScore = score;
        best = { tonicPc: tonic, mode };
      }
    }
  }
  return best;
}

/** Snap onsets and durations to a half-beat grid without reordering the line. */
function quantize(notes: NoteEvent[], qpm: number): GridNote[] {
  const spb = 60 / qpm;
  const grid = 0.5;
  const snap = (v: number) => Math.round(v / grid) * grid;

  const t0 = notes.length ? notes[0].startTimeSeconds : 0;
  const raw: GridNote[] = [];
  for (const n of notes) {
    const startBeat = Math.max(0, snap((n.startTimeSeconds - t0) / spb));
    const durBeats = Math.max(grid, snap(n.durationSeconds / spb));
    raw.push({
      pitch: Math.round(n.pitchMidi),
      startBeat,
      durBeats,
      amp: Math.min(1, Math.max(0.25, n.amplitude)),
    });
  }

  const out: GridNote[] = [];
  for (const n of raw) {
    const last = out[out.length - 1];
    if (last && last.startBeat === n.startBeat) {
      // Two onsets collapsed onto one grid slot: keep the longer note.
      if (n.durBeats > last.durBeats) out[out.length - 1] = n;
      continue;
    }
    if (last) {
      // Distinct onsets stay distinct. Merging touching notes of the same pitch
      // turned every repeated note into one long one, which is most of what
      // makes a well-known tune recognisable ("twinkle twinkle" became one C).
      const room = n.startBeat - last.startBeat;
      if (last.durBeats > room) last.durBeats = room;
    }
    out.push(n);
  }
  return out.filter((n) => n.durBeats >= grid);
}

/** Repeat a short gesture until it fills the requested span. */
function tileTo(notes: GridNote[], beats: number): GridNote[] {
  if (!notes.length) return [];
  const span = Math.max(
    1,
    Math.ceil(Math.max(...notes.map((n) => n.startBeat + n.durBeats))),
  );
  const out: GridNote[] = [];
  for (let offset = 0; offset < beats; offset += span) {
    for (const n of notes) {
      const startBeat = offset + n.startBeat;
      if (startBeat >= beats) continue;
      out.push({
        ...n,
        startBeat,
        durBeats: Math.min(n.durBeats, beats - startBeat),
      });
    }
  }
  return out;
}

function clipTo(notes: GridNote[], beats: number): GridNote[] {
  return notes
    .filter((n) => n.startBeat < beats - 1e-6)
    .map((n) => ({ ...n, durBeats: Math.min(n.durBeats, beats - n.startBeat) }));
}

function makeBasicIdea(notes: GridNote[]): GridNote[] {
  const within = clipTo(notes, IDEA_BEATS);
  if (!within.length) return [];
  const span = Math.max(...within.map((n) => n.startBeat + n.durBeats));
  if (span >= IDEA_BEATS - 1.5) return within;
  return tileTo(within, IDEA_BEATS);
}

/**
 * The opening four bars, quoting as much of the hum as it actually provides.
 * Repeating a short idea to fill the phrase is what the Classical presentation
 * does anyway, so both cases land on idiomatic material.
 */
function makeThemePhrase(notes: GridNote[]): GridNote[] {
  const within = clipTo(notes, PHRASE_BEATS);
  if (!within.length) return [];
  const span = Math.max(...within.map((n) => n.startBeat + n.durBeats));
  // Repeat on a whole-bar period so tiling never fights the metre.
  const period = Math.min(
    PHRASE_BEATS,
    Math.max(BEATS_PER_BAR, Math.ceil((span - 0.5) / BEATS_PER_BAR) * BEATS_PER_BAR),
  );
  if (period >= PHRASE_BEATS) return within;
  const out: GridNote[] = [];
  for (let offset = 0; offset < PHRASE_BEATS; offset += period) {
    for (const n of within) {
      const startBeat = offset + n.startBeat;
      if (startBeat >= PHRASE_BEATS - 1e-6) continue;
      out.push({
        ...n,
        startBeat,
        durBeats: Math.min(n.durBeats, PHRASE_BEATS - startBeat),
      });
    }
  }
  return out;
}

/** A plain diatonic gesture used when the microphone heard nothing usable. */
function inventedIdea(tonicPc: number, mode: Mode, center: number): GridNote[] {
  const steps = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const base = center - pc(center - tonicPc);
  const degrees = [0, 1, 2, 4, 2, 1, 0, 0];
  const durs = [1, 1, 1, 1, 1, 1, 1.5, 0.5];
  const out: GridNote[] = [];
  let beat = 0;
  degrees.forEach((deg, i) => {
    out.push({
      pitch: base + steps[deg % steps.length] + 12 * Math.floor(deg / steps.length),
      startBeat: beat,
      durBeats: durs[i],
      amp: 0.7,
    });
    beat += durs[i];
  });
  return out;
}

export function analyzeTheme(hummed: NoteEvent[]): ThemeAnalysis {
  const mono = monophonic(hummed);
  const usable = mono.length >= 2;
  const qpm = estimateQpm(mono);
  const key = usable ? detectKey(mono) : { tonicPc: 0, mode: "major" as Mode };
  const notes = usable ? quantize(mono, qpm) : [];
  const centerPitch = notes.length
    ? Math.round(median(notes.map((n) => n.pitch)))
    : 67;

  const sung = notes.length
    ? notes
    : inventedIdea(key.tonicPc, key.mode, centerPitch);
  const idea = makeBasicIdea(sung);
  const themePhrase = makeThemePhrase(sung);

  const span = idea.length
    ? Math.max(...idea.map((n) => n.startBeat + n.durBeats))
    : IDEA_BEATS;

  return {
    tonicPc: key.tonicPc,
    mode: key.mode,
    qpm,
    notes,
    basicIdea: idea,
    themePhrase,
    centerPitch,
    density: idea.length / Math.max(1, span),
    invented: !notes.length,
  };
}
