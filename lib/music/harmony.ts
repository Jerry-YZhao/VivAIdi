import type { Slot } from "./form";
import { isDownbeat } from "./form";
import type { GridNote } from "./theme";
import {
  allowsSeventh,
  chordFunction,
  chordLabel,
  chordPcs,
  degreeRootPc,
  pc,
  type Fn,
  type Mode,
} from "./theory";

export type Chord = {
  slot: Slot;
  degree: number;
  seventh: boolean;
  inversion: number;
  /** Absolute pitch classes, root first. */
  pcs: number[];
  rootPc: number;
  bassPc: number;
  fn: Fn;
  label: string;
  dyn: number;
};

type Candidate = Omit<Chord, "slot" | "dyn">;

function makeCandidate(
  tonicPc: number,
  mode: Mode,
  degree: number,
  seventh: boolean,
  inversion: number,
): Candidate {
  const pcs = chordPcs(tonicPc, mode, degree, seventh);
  return {
    degree,
    seventh: seventh && allowsSeventh(degree),
    inversion,
    pcs,
    rootPc: pcs[0],
    bassPc: pcs[inversion % pcs.length],
    fn: chordFunction(mode, degree),
    label: chordLabel(mode, degree, seventh, inversion),
  };
}

function candidatesFor(slot: Slot, tonicPc: number, mode: Mode): Candidate[] {
  const out: Candidate[] = [];
  for (let degree = 0; degree < 7; degree++) {
    if (slot.degree !== undefined && degree !== slot.degree) continue;
    if (slot.fn && chordFunction(mode, degree) !== slot.fn) continue;
    for (const seventh of [false, true]) {
      if (seventh && !allowsSeventh(degree)) continue;
      if (slot.seventh !== undefined && seventh !== slot.seventh) continue;
      for (let inversion = 0; inversion <= 2; inversion++) {
        if (slot.inversion !== undefined && inversion !== slot.inversion) continue;
        // Six-four chords are structural, never incidental.
        if (inversion === 2 && slot.inversion === undefined) continue;
        // A root-position leading-tone chord is unstable; keep it in inversion.
        if (degree === 6 && inversion === 0) continue;
        out.push(makeCandidate(tonicPc, mode, degree, seventh, inversion));
      }
    }
  }
  return out.length
    ? out
    : [makeCandidate(tonicPc, mode, slot.degree ?? 0, false, slot.inversion ?? 0)];
}

function semitoneDistance(a: number, b: number): number {
  const d = Math.abs(pc(a) - pc(b));
  return Math.min(d, 12 - d);
}

/** How well the melody sitting over this slot agrees with the chord. */
function melodyFit(candidate: Candidate, slot: Slot, melody: GridNote[]): number {
  let score = 0;
  let weighted = 0;
  for (const note of melody) {
    const start = Math.max(note.startBeat, slot.startBeat);
    const end = Math.min(note.startBeat + note.durBeats, slot.startBeat + slot.durBeats);
    const overlap = end - start;
    if (overlap <= 0) continue;
    const accent = isDownbeat(note.startBeat) ? 2 : 1;
    const weight = overlap * accent;
    weighted += weight;
    const distance = Math.min(...candidate.pcs.map((p) => semitoneDistance(note.pitch, p)));
    if (distance === 0) score += 1.3 * weight;
    else if (distance <= 2) score += 0.15 * weight;
    else score -= 1.5 * weight;
    // A dissonant melody note on a downbeat is the worst case.
    if (distance > 2 && isDownbeat(note.startBeat)) score -= 0.8 * weight;
  }
  return weighted > 0 ? score / weighted : 0;
}

function staticScore(candidate: Candidate, slot: Slot, mode: Mode): number {
  let score = 0;
  // The mediant is rare in Classical practice.
  if (candidate.degree === 2) score -= 0.5;
  // vi and III work as tonic substitutes but should not dominate.
  if (candidate.degree === 5) score -= 0.12;

  if (isDownbeat(slot.startBeat)) {
    if (candidate.inversion !== 0 && !slot.inversion) score -= 0.22;
  } else if (candidate.inversion === 1) score += 0.12;

  if (slot.cadence && candidate.inversion !== 0) score -= 1.5;
  if (slot.cadence === "PAC" && candidate.degree !== 0) score -= 2;

  // Sevenths belong to cadences. Used everywhere they make the harmony sag.
  if (candidate.seventh && slot.seventh === undefined) score -= 0.3;
  if (candidate.seventh && slot.cadence === "PAC") score -= 2;

  if (mode === "minor" && candidate.degree === 4 && !candidate.seventh) score += 0.1;

  // Thematic function shapes which chords belong where.
  switch (slot.role) {
    case "presentation":
      // Tonic prolongation: the tonic and its dominant, little else.
      if (candidate.degree !== 0 && candidate.degree !== 4) score -= 0.45;
      break;
    case "continuation":
      // Momentum comes from predominants, not from sitting on the tonic.
      if (candidate.degree === 0 && slot.degree === undefined) score -= 0.3;
      if (candidate.fn === "S") score += 0.25;
      break;
    case "return":
      if (candidate.degree === 2) score -= 0.3;
      break;
    case "cadential":
      if (candidate.fn === "S") score += 0.15;
      break;
  }
  return score;
}

const FN_FLOW: Record<Fn, Record<Fn, number>> = {
  T: { T: 0, S: 0.5, D: 0.3 },
  S: { T: -0.55, S: 0.12, D: 0.7 },
  D: { T: 0.45, S: -2.2, D: 0.05 },
};

function transitionScore(
  a: Candidate,
  b: Candidate,
  slotA: Slot,
  slotB: Slot,
): number {
  let score = FN_FLOW[a.fn][b.fn];

  // A dominant resolving onto a structural downbeat is the real arrival.
  if (a.fn === "D" && b.fn === "T" && (slotB.cadence || isDownbeat(slotB.startBeat))) {
    score += 0.35;
  }

  if (a.degree === b.degree) {
    // Repeating a chord is prolongation when the bass moves, inertia when it does not.
    score += a.inversion === b.inversion ? -0.9 : -0.15;
    if (slotB.bar !== slotA.bar) score -= 0.5;
  }

  const bassStep = semitoneDistance(a.bassPc, b.bassPc);
  if (bassStep === 0) score -= 0.1;
  else if (bassStep <= 2) score += 0.25;
  else if (bassStep === 6) score -= 0.9;
  else if (bassStep === 5 || bassStep === 7) score += 0.12;

  // Descending-fifth root motion is the strongest Classical progression.
  const rootFall = pc(a.rootPc - b.rootPc);
  if (rootFall === 7) score += 0.3;

  // A chordal seventh must be able to fall by step into the next chord.
  if (a.seventh) {
    const seventhPc = a.pcs[a.pcs.length - 1];
    const resolves = b.pcs.some((p) => pc(seventhPc - 1) === p || pc(seventhPc - 2) === p);
    if (!resolves) score -= 1.4;
  }

  // The leading-tone chord wants the tonic.
  if (a.degree === 6 && b.degree !== 0) score -= 0.9;

  return score;
}

/**
 * Penalise oscillation. Without this the planner discovers that alternating
 * tonic and dominant scores well everywhere and never writes a progression.
 */
function contextScore(a: Candidate, b: Candidate, c: Candidate): number {
  let score = 0;
  if (a.degree === c.degree && b.degree !== c.degree) {
    score -= a.inversion === c.inversion ? 1.1 : 0.6;
  }
  if (a.degree !== b.degree && b.degree !== c.degree && a.degree !== c.degree) {
    score += 0.18;
  }
  return score;
}

/**
 * Choose the chord for every slot with a second-order Viterbi search over
 * functional syntax, melody agreement, bass motion and harmonic variety. The
 * extra order of context is what keeps the progression from oscillating.
 */
export function planHarmony(
  tonicPc: number,
  mode: Mode,
  slots: Slot[],
  melody: GridNote[],
): Chord[] {
  const lattice = slots.map((slot) => candidatesFor(slot, tonicPc, mode));
  const emission = lattice.map((cands, i) =>
    cands.map(
      (c) => melodyFit(c, slots[i], melody) * 1.6 + staticScore(c, slots[i], mode),
    ),
  );

  const n = lattice.length;
  if (n === 1) {
    const only = emission[0].indexOf(Math.max(...emission[0]));
    return [{ ...lattice[0][only], slot: slots[0], dyn: slots[0].dyn }];
  }

  // best[i][p][c]: best score ending with candidate p at i-1 and c at i.
  const best: number[][][] = [];
  const from: number[][][] = [];
  for (let i = 0; i < n; i++) {
    const prevCount = i === 0 ? 1 : lattice[i - 1].length;
    best.push(
      Array.from({ length: prevCount }, () => new Array(lattice[i].length).fill(-Infinity)),
    );
    from.push(
      Array.from({ length: prevCount }, () => new Array(lattice[i].length).fill(-1)),
    );
  }

  for (let p = 0; p < lattice[0].length; p++) {
    for (let c = 0; c < lattice[1].length; c++) {
      best[1][p][c] =
        emission[0][p] +
        transitionScore(lattice[0][p], lattice[1][c], slots[0], slots[1]) +
        emission[1][c];
    }
  }

  for (let i = 2; i < n; i++) {
    for (let p = 0; p < lattice[i - 1].length; p++) {
      for (let c = 0; c < lattice[i].length; c++) {
        const step =
          transitionScore(lattice[i - 1][p], lattice[i][c], slots[i - 1], slots[i]) +
          emission[i][c];
        for (let pp = 0; pp < lattice[i - 2].length; pp++) {
          const prior = best[i - 1][pp][p];
          if (prior === -Infinity) continue;
          const total =
            prior +
            step +
            contextScore(lattice[i - 2][pp], lattice[i - 1][p], lattice[i][c]);
          if (total > best[i][p][c]) {
            best[i][p][c] = total;
            from[i][p][c] = pp;
          }
        }
      }
    }
  }

  const last = n - 1;
  let bestP = 0;
  let bestC = 0;
  for (let p = 0; p < best[last].length; p++) {
    for (let c = 0; c < best[last][p].length; c++) {
      if (best[last][p][c] > best[last][bestP][bestC]) {
        bestP = p;
        bestC = c;
      }
    }
  }

  const path = new Array(n).fill(0);
  path[last] = bestC;
  path[last - 1] = bestP;
  for (let i = last; i >= 2; i--) {
    const pp = from[i][path[i - 1]][path[i]];
    path[i - 2] = pp < 0 ? 0 : pp;
  }

  return slots.map((slot, i) => ({
    ...lattice[i][path[i]],
    slot,
    dyn: slot.dyn,
  }));
}

export function chordAtBeat(chords: Chord[], beat: number): Chord {
  let found = chords[0];
  for (const chord of chords) {
    if (beat >= chord.slot.startBeat - 1e-6) found = chord;
    else break;
  }
  return found;
}

/** Timpani only ever needs the tonic and the dominant. */
export function tonicDominantPcs(tonicPc: number, mode: Mode): [number, number] {
  return [degreeRootPc(tonicPc, mode, 0), degreeRootPc(tonicPc, mode, 4)];
}
