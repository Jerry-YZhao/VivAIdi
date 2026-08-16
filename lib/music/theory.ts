/** Diatonic pitch material and triad/seventh spelling for major and minor keys. */

export type Mode = "major" | "minor";

/** Tonal function: tonic, subdominant (predominant), dominant. */
export type Fn = "T" | "S" | "D";

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** Natural minor for melodic material; chords raise the 7th where practice requires. */
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** Chord roots above the tonic. Minor's vii is built on the raised 7th. */
const MAJOR_ROOTS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_ROOTS = [0, 2, 3, 5, 7, 8, 11];

const MAJOR_TRIADS = [
  [0, 4, 7],
  [0, 3, 7],
  [0, 3, 7],
  [0, 4, 7],
  [0, 4, 7],
  [0, 3, 7],
  [0, 3, 6],
];

const MINOR_TRIADS = [
  [0, 3, 7],
  [0, 3, 6],
  [0, 4, 7],
  [0, 3, 7],
  [0, 4, 7],
  [0, 4, 7],
  [0, 3, 6],
];

const DEGREE_FN: Fn[] = ["T", "S", "T", "S", "D", "T", "D"];

const MAJOR_NAMES = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
const MINOR_NAMES = ["i", "ii", "III", "iv", "V", "VI", "vii"];

export function pc(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function scaleSteps(mode: Mode): number[] {
  return mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
}

export function scalePcs(tonicPc: number, mode: Mode): number[] {
  return scaleSteps(mode).map((s) => pc(tonicPc + s));
}

export function degreeRootPc(tonicPc: number, mode: Mode, degree: number): number {
  const roots = mode === "major" ? MAJOR_ROOTS : MINOR_ROOTS;
  return pc(tonicPc + roots[degree]);
}

/** Leading tone: always a semitone below the tonic, raised in minor. */
export function leadingTonePc(tonicPc: number): number {
  return pc(tonicPc - 1);
}

export function chordFunction(_mode: Mode, degree: number): Fn {
  return DEGREE_FN[degree];
}

/** Sevenths are only idiomatic on the dominant, the leading-tone chord and ii. */
export function allowsSeventh(degree: number): boolean {
  return degree === 4 || degree === 6 || degree === 1;
}

function seventhInterval(mode: Mode, degree: number): number {
  if (degree === 4) return 10;
  if (degree === 6) return mode === "minor" ? 9 : 10;
  return 10;
}

/** Absolute pitch classes of a chord, root first. */
export function chordPcs(
  tonicPc: number,
  mode: Mode,
  degree: number,
  seventh: boolean,
): number[] {
  const root = degreeRootPc(tonicPc, mode, degree);
  const triads = mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
  const out = triads[degree].map((i) => pc(root + i));
  if (seventh && allowsSeventh(degree)) {
    out.push(pc(root + seventhInterval(mode, degree)));
  }
  return out;
}

export function chordLabel(
  mode: Mode,
  degree: number,
  seventh: boolean,
  inversion: number,
): string {
  const triads = mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
  const diminished = triads[degree][2] === 6;
  const name = (mode === "major" ? MAJOR_NAMES : MINOR_NAMES)[degree];
  let label = name + (diminished ? "\u00b0" : "");
  if (seventh && allowsSeventh(degree)) {
    label += inversion === 0 ? "7" : inversion === 1 ? "65" : "43";
  } else if (inversion === 1) label += "6";
  else if (inversion === 2) label += "64";
  return label;
}

export function keyLabel(tonicPc: number, mode: Mode): string {
  const names = ["C", "C\u266f", "D", "E\u266d", "E", "F", "F\u266f", "G", "A\u266d", "A", "B\u266d", "B"];
  return `${names[pc(tonicPc)]} ${mode}`;
}

/** Shift a pitch by octaves until it sits inside the range. */
export function fold(pitch: number, min: number, max: number): number {
  let p = Math.round(pitch);
  while (p < min) p += 12;
  while (p > max) p -= 12;
  // A range narrower than an octave can leave p below min; clamp as a last resort.
  return Math.min(max, Math.max(min, p));
}

/** Nearest pitch with one of the given pitch classes, preferring minimal motion. */
export function nearestPc(
  pitch: number,
  classes: number[],
  min: number,
  max: number,
): number {
  let best = fold(pitch, min, max);
  let bestCost = Infinity;
  for (const cls of classes) {
    for (let octave = -2; octave <= 2; octave++) {
      const candidate = pitch - pc(pitch) + cls + octave * 12;
      if (candidate < min || candidate > max) continue;
      const cost = Math.abs(candidate - pitch);
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
  }
  return Math.round(best);
}

export function inPcSet(pitch: number, classes: number[]): boolean {
  return classes.includes(pc(pitch));
}

/** All pitches with the given pitch class inside a range, lowest first. */
export function pitchesInRange(cls: number, min: number, max: number): number[] {
  const out: number[] = [];
  let p = min + pc(cls - min);
  for (; p <= max; p += 12) out.push(p);
  return out;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Gleitz midi-js SoundFonts (FluidR3, MusyngKite) spell accidentals as flats. */
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function octaveOf(midi: number) {
  return Math.floor(midi / 12) - 1;
}

/**
 * Canonical FluidR3 / Gleitz sample key for a MIDI number (C4 = 60, Db4 = 61).
 * Asking for C#4 loads nothing — those JSON files do not contain sharp names —
 * and the player then skips the note in silence.
 */
export function midiToName(midi: number): string {
  return `${FLAT_NAMES[pc(midi)]}${octaveOf(midi)}`;
}

/** Both spellings, so a notes= filter matches whichever key the file used. */
export function midiToSoundfontNames(midi: number): string[] {
  const oct = octaveOf(midi);
  const i = pc(midi);
  const names = [`${FLAT_NAMES[i]}${oct}`];
  if (SHARP_NAMES[i] !== FLAT_NAMES[i]) names.push(`${SHARP_NAMES[i]}${oct}`);
  return names;
}
