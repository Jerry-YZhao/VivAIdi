import type { NoteEvent, SectionId, StyleId } from "./types";

export type ArrangementParts = Record<SectionId, NoteEvent[]>;

const BARS = 16;
const BEATS_PER_BAR = 4;
/** Ensemble pulse only — the hummed theme keeps its own timing. */
const ARRANGEMENT_QPM = 90;

type Clock = { beat: number; bar: number };

function makeClock(): Clock {
  const beat = 60 / ARRANGEMENT_QPM;
  return { beat, bar: beat * BEATS_PER_BAR };
}

const MAJOR_PROFILE = [6.4, 2.2, 3.5, 2.3, 4.4, 4.1, 2.5, 5.2, 2.4, 3.7, 2.3, 2.9];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Scale degrees of the root: I V vi IV | I V vi IV | ii V I IV | I IV V I */
const PROGRESSION = [0, 4, 5, 3, 0, 4, 5, 3, 1, 4, 0, 3, 0, 3, 4, 0];

type Quality = "major" | "minor" | "diminished";

type Chord = {
  bar: number;
  degree: number;
  root: number;
  quality: Quality;
  tones: [number, number, number];
  dyn: number;
};

function clampPitch(pitch: number, min: number, max: number) {
  let p = Math.round(pitch);
  while (p < min) p += 12;
  while (p > max) p -= 12;
  return p;
}

function pc(n: number) {
  return ((n % 12) + 12) % 12;
}

function qualityForDegree(degree: number): Quality {
  if (degree === 1 || degree === 2 || degree === 5) return "minor";
  if (degree === 6) return "diminished";
  return "major";
}

function triad(root: number, quality: Quality): [number, number, number] {
  const third = quality === "minor" || quality === "diminished" ? 3 : 4;
  const fifth = quality === "diminished" ? 6 : 7;
  return [pc(root), pc(root + third), pc(root + fifth)];
}

function detectTonic(notes: NoteEvent[]): number {
  const hist = new Array(12).fill(0);
  for (const n of notes) {
    hist[pc(n.pitchMidi)] += n.durationSeconds * (0.4 + n.amplitude);
  }
  let best = 0;
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    let score = 0;
    for (let i = 0; i < 12; i++) score += hist[(tonic + i) % 12] * MAJOR_PROFILE[i];
    if (score > bestScore) {
      bestScore = score;
      best = tonic;
    }
  }
  return best;
}

function harmonicPlan(tonic: number): Chord[] {
  return PROGRESSION.map((degree, bar) => {
    const quality = qualityForDegree(degree);
    const root = pc(tonic + SCALE[degree]);
    let dyn = 0.55;
    if (bar < 4) dyn = 0.48;
    else if (bar < 8) dyn = 0.62;
    else if (bar < 12) dyn = 0.78;
    else if (bar < 14) dyn = 0.52;
    else dyn = 0.88;
    return { bar, degree, root, quality, tones: triad(root, quality), dyn };
  });
}

function cleanTheme(notes: NoteEvent[]): NoteEvent[] {
  const sorted = [...notes]
    .filter((n) => n.durationSeconds > 0.05 && n.amplitude > 0.04)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  const mono: NoteEvent[] = [];
  for (const n of sorted) {
    const pitch = clampPitch(n.pitchMidi, 48, 84);
    const last = mono[mono.length - 1];
    if (!last) {
      mono.push({ ...n, pitchMidi: pitch });
      continue;
    }
    const lastEnd = last.startTimeSeconds + last.durationSeconds;
    const gap = n.startTimeSeconds - lastEnd;
    if (pitch === last.pitchMidi && gap < 0.06) {
      last.durationSeconds = n.startTimeSeconds + n.durationSeconds - last.startTimeSeconds;
      last.amplitude = Math.max(last.amplitude, n.amplitude);
      continue;
    }
    if (n.startTimeSeconds < lastEnd - 0.02) {
      last.durationSeconds = Math.max(0.05, n.startTimeSeconds - last.startTimeSeconds - 0.01);
    }
    mono.push({ ...n, pitchMidi: pitch });
  }
  return mono;
}

function shiftTheme(notes: NoteEvent[]): NoteEvent[] {
  if (!notes.length) return notes;
  const t0 = notes[0].startTimeSeconds;
  return notes.map((n) => ({
    ...n,
    startTimeSeconds: Math.max(0, n.startTimeSeconds - t0),
  }));
}

function fallbackPhrase(tonic: number, clk: Clock): NoteEvent[] {
  const degrees = [0, 2, 4, 5, 4, 2, 0, 4];
  return degrees.map((d, i) => ({
    pitchMidi: 60 + tonic + SCALE[d],
    startTimeSeconds: i * clk.beat,
    durationSeconds: clk.beat * 0.85,
    amplitude: 0.7,
  }));
}

/** Repeat a short motif to fill bars instead of stretching it out of shape. */
function fitPhrase(notes: NoteEvent[], bars: number, clk: Clock): NoteEvent[] {
  if (!notes.length) return [];
  const span = Math.max(
    clk.beat,
    ...notes.map((n) => n.startTimeSeconds + n.durationSeconds),
  );
  const target = bars * clk.bar;
  if (span >= target * 0.7) {
    const scale = target / span;
    return notes
      .map((n) => ({
        ...n,
        startTimeSeconds: n.startTimeSeconds * scale,
        durationSeconds: Math.max(clk.beat / 2, n.durationSeconds * scale * 0.9),
      }))
      .filter((n) => n.startTimeSeconds < target - 0.04);
  }
  const out: NoteEvent[] = [];
  let offset = 0;
  while (offset < target - clk.beat / 2) {
    for (const n of notes) {
      const start = offset + n.startTimeSeconds;
      if (start >= target - 0.04) break;
      out.push({
        ...n,
        startTimeSeconds: start,
        durationSeconds: Math.min(n.durationSeconds, target - start - 0.02),
      });
    }
    offset += Math.max(clk.bar, Math.ceil(span / clk.bar) * clk.bar);
  }
  return out;
}

function nearestPitchClass(pitch: number, classes: number[], min: number, max: number) {
  const p = pc(pitch);
  let best = classes[0];
  let dist = 99;
  for (const c of classes) {
    const d = Math.min((c - p + 12) % 12, (p - c + 12) % 12);
    if (d < dist) {
      dist = d;
      best = c;
    }
  }
  let out = pitch - p + best;
  if (out - pitch > 6) out -= 12;
  if (pitch - out > 6) out += 12;
  return clampPitch(out, min, max);
}

function inScale(pitch: number, tonic: number) {
  return SCALE.includes(pc(pitch - tonic));
}

function snapToScale(pitch: number, tonic: number, min: number, max: number) {
  if (inScale(pitch, tonic)) return clampPitch(pitch, min, max);
  return nearestPitchClass(
    pitch,
    SCALE.map((d) => pc(tonic + d)),
    min,
    max,
  );
}

function chordAt(t: number, plan: Chord[], clk: Clock): Chord {
  const bar = Math.min(BARS - 1, Math.max(0, Math.floor(t / clk.bar)));
  return plan[bar];
}

function isStrongBeat(t: number, clk: Clock) {
  const beat = Math.round((t % clk.bar) / clk.beat);
  return beat === 0 || beat === 2;
}

function shapeLead(
  phrase: NoteEvent[],
  plan: Chord[],
  tonic: number,
  offset: number,
  mode: "theme" | "develop" | "contrast" | "return",
  clk: Clock,
): NoteEvent[] {
  return phrase.map((n, i) => {
    const t = n.startTimeSeconds + offset;
    const chord = chordAt(t, plan, clk);
    let pitch = n.pitchMidi;
    if (mode === "develop") pitch += i % 5 === 4 ? 2 : 0;
    if (mode === "contrast") pitch += 5;
    pitch = snapToScale(pitch, tonic, 60, 86);
    if (isStrongBeat(n.startTimeSeconds, clk) || n.durationSeconds >= clk.beat) {
      pitch = nearestPitchClass(pitch, chord.tones, 60, 86);
    }
    return {
      ...n,
      pitchMidi: pitch,
      startTimeSeconds: t,
      amplitude: Math.min(1, n.amplitude * (0.75 + chord.dyn * 0.4)),
    };
  });
}

function buildLead(
  theme: NoteEvent[],
  plan: Chord[],
  tonic: number,
  clk: Clock,
): NoteEvent[] {
  const a = fitPhrase(theme, 4, clk);
  const lastBar = 15 * clk.bar;
  const cadence: NoteEvent[] = [
    {
      pitchMidi: nearestPitchClass(72 + tonic, plan[14].tones, 67, 81),
      startTimeSeconds: lastBar,
      durationSeconds: clk.beat * 1.5,
      amplitude: 0.86,
    },
    {
      pitchMidi: clampPitch(72 + tonic, 64, 76),
      startTimeSeconds: lastBar + clk.beat * 2,
      durationSeconds: clk.beat * 2,
      amplitude: 0.96,
    },
  ];
  return [
    ...shapeLead(a, plan, tonic, 0, "theme", clk),
    ...shapeLead(a, plan, tonic, 4 * clk.bar, "develop", clk),
    ...shapeLead(a, plan, tonic, 8 * clk.bar, "contrast", clk),
    ...shapeLead(a, plan, tonic, 12 * clk.bar, "return", clk).filter(
      (n) => n.startTimeSeconds < lastBar - 0.05,
    ),
    ...cadence,
  ];
}

function voicing(tones: number[], prev: number[] | null, min: number, max: number): number[] {
  const candidates: number[][] = [];
  for (let inv = 0; inv < 3; inv++) {
    const ordered = [tones[inv], tones[(inv + 1) % 3], tones[(inv + 2) % 3]];
    const chord = ordered
      .map((c) => clampPitch(60 + c, min, max))
      .sort((a, b) => a - b);
    if (chord[1] <= chord[0]) chord[1] += 12;
    if (chord[2] <= chord[1]) chord[2] += 12;
    candidates.push(chord.map((p) => clampPitch(p, min, max)));
  }
  if (!prev) return candidates[0];
  let best = candidates[0];
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = c.reduce((s, p, i) => s + Math.abs(p - (prev[i] ?? p)), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

function buildHarmony(plan: Chord[], clk: Clock): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let prev: number[] | null = null;
  for (const chord of plan) {
    const v = voicing(chord.tones, prev, 55, 76);
    prev = v;
    const t = chord.bar * clk.bar;
    const hold = chord.bar >= 14 ? clk.bar * 0.98 : clk.bar * 0.92;
    notes.push({
      pitchMidi: v[1],
      startTimeSeconds: t,
      durationSeconds: hold,
      amplitude: 0.34 * chord.dyn + 0.18,
    });
    notes.push({
      pitchMidi: v[2],
      startTimeSeconds: t + 0.02,
      durationSeconds: hold * 0.98,
      amplitude: 0.3 * chord.dyn + 0.16,
    });
  }
  return notes;
}

function buildBody(plan: Chord[], style: StyleId, clk: Clock): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let prevThird = 60;
  for (const chord of plan) {
    const t = chord.bar * clk.bar;
    const third = nearestPitchClass(prevThird, [chord.tones[1]], 50, 69);
    const seventhPc = pc(
      chord.root + (chord.quality === "major" && chord.degree !== 4 ? 11 : 10),
    );
    const seventh = nearestPitchClass(third + 5, [seventhPc], 52, 71);
    prevThird = third;
    const amp = 0.28 * chord.dyn + 0.18;
    if (style === "jazz") {
      for (let b = 0; b < 4; b++) {
        notes.push({
          pitchMidi: b % 2 === 0 ? third : seventh,
          startTimeSeconds: t + b * clk.beat,
          durationSeconds: clk.beat * 0.62,
          amplitude: amp,
        });
      }
    } else {
      notes.push({
        pitchMidi: third,
        startTimeSeconds: t,
        durationSeconds: clk.bar * 0.94,
        amplitude: amp + (chord.bar >= 8 && chord.bar < 12 ? 0.08 : 0),
      });
      notes.push({
        pitchMidi: seventh,
        startTimeSeconds: t + clk.beat * 2,
        durationSeconds: clk.bar * 0.44,
        amplitude: amp * 0.85,
      });
    }
  }
  return notes;
}

function buildBass(plan: Chord[], style: StyleId, clk: Clock): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (let i = 0; i < plan.length; i++) {
    const chord = plan[i];
    const next = plan[Math.min(plan.length - 1, i + 1)];
    const root = clampPitch(36 + chord.root, 36, 50);
    const fifth = clampPitch(root + 7, 36, 54);
    const approach = clampPitch(36 + next.root - 1, 36, 51);
    const t = chord.bar * clk.bar;
    const amp = 0.5 + chord.dyn * 0.22;
    if (style === "jazz") {
      const walk = [
        root,
        nearestPitchClass(root + 2, chord.tones, 36, 52),
        fifth,
        i === plan.length - 1 ? root : approach,
      ];
      walk.forEach((p, b) => {
        notes.push({
          pitchMidi: p,
          startTimeSeconds: t + b * clk.beat,
          durationSeconds: clk.beat * 0.9,
          amplitude: amp,
        });
      });
    } else {
      notes.push({
        pitchMidi: root,
        startTimeSeconds: t,
        durationSeconds: clk.beat * 1.85,
        amplitude: amp,
      });
      notes.push({
        pitchMidi: chord.bar === 15 ? root : fifth,
        startTimeSeconds: t + clk.beat * 2,
        durationSeconds: clk.beat * (chord.bar === 14 ? 1.4 : 1.85),
        amplitude: amp * 0.92,
      });
      if (chord.bar === 14) {
        notes.push({
          pitchMidi: approach,
          startTimeSeconds: t + clk.beat * 3.5,
          durationSeconds: clk.beat * 0.45,
          amplitude: amp,
        });
      }
    }
  }
  return notes;
}

export function composeArrangement(
  hummed: NoteEvent[],
  style: StyleId,
): ArrangementParts {
  const clk = makeClock();
  const cleaned = shiftTheme(cleanTheme(hummed));
  const tonic = detectTonic(cleaned.length ? cleaned : fallbackPhrase(0, clk));
  const theme = cleaned.length ? cleaned : fallbackPhrase(tonic, clk);
  const plan = harmonicPlan(tonic);
  return {
    lead: buildLead(theme, plan, tonic, clk),
    harmony: buildHarmony(plan, clk),
    body: buildBody(plan, style, clk),
    bass: buildBass(plan, style, clk),
  };
}

export function generateArrangement(
  notes: NoteEvent[],
  style: StyleId,
  onStatus?: (msg: string) => void,
): ArrangementParts {
  onStatus?.("Scoring a 16-bar arrangement around your theme…");
  return composeArrangement(notes, style);
}

export function partsDuration(parts: ArrangementParts): number {
  let max = 1;
  for (const notes of Object.values(parts)) {
    for (const n of notes) {
      max = Math.max(max, n.startTimeSeconds + n.durationSeconds);
    }
  }
  return max;
}
