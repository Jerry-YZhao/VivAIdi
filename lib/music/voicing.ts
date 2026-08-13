import type { Chord } from "./harmony";
import { leadingTonePc, pc, pitchesInRange } from "./theory";

export type VoiceRange = { min: number; max: number };

export type VoicingOptions = {
  /** Lowest voice first. Four voices give SATB behaviour. */
  ranges: VoiceRange[];
  /** Pitch class the top voice must take, per chord, to agree with the melody. */
  sopranoPcs?: (number | null)[];
  /** Largest interval allowed between adjacent voices, lowest pair first. */
  maxGaps?: number[];
  /** Winds and horns speak more clearly with gaps of a fourth or more. */
  spacing?: "close" | "open";
  tonicPc: number;
};

const DEFAULT_UPPER_GAP = 12;
const DEFAULT_BASS_GAP = 19;

/**
 * Which pitch classes the voices share out. Triads double a note (root first,
 * never the leading tone), and a seventh chord may drop its fifth.
 */
function pcMultisets(chord: Chord, voices: number, tonicPc: number): number[][] {
  const pcs = chord.pcs;
  const lt = leadingTonePc(tonicPc);
  const out: number[][] = [];

  if (pcs.length >= voices) {
    if (pcs.length === 4) {
      // Drop the fifth before the seventh, which carries the chord's identity.
      out.push([pcs[0], pcs[1], pcs[2], pcs[3]].slice(0, voices));
      out.push([pcs[0], pcs[1], pcs[3], pcs[2]].slice(0, voices));
      if (voices === 4) out.push([pcs[0], pcs[0], pcs[1], pcs[3]]);
    } else {
      out.push(pcs.slice(0, voices));
    }
    const legal = out.filter((set) => set.includes(chord.bassPc));
    return legal.length ? legal : [pcs.slice(0, voices)];
  }

  // Prefer doubling the root, then the fifth; never the leading tone.
  const order = [pcs[0], pcs[2], pcs[1]].filter((p) => p !== undefined && p !== lt);
  const options = order.length ? order : [pcs[0]];
  const missing = voices - pcs.length;
  for (let start = 0; start < options.length; start++) {
    const set = [...pcs];
    for (let i = 0; i < missing; i++) set.push(options[(start + i) % options.length]);
    out.push(set);
  }
  return out;
}

function removeOnce(list: number[], value: number): number[] {
  const index = list.indexOf(value);
  if (index < 0) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

function staticCost(
  voicing: number[],
  chord: Chord,
  options: VoicingOptions,
): number {
  let cost = 0;
  const top = voicing[voicing.length - 1];
  const range = options.ranges[options.ranges.length - 1];
  cost += Math.abs(top - (range.min + range.max) / 2) * 0.02;

  for (let i = 1; i < voicing.length - 1; i++) {
    const gap = voicing[i + 1] - voicing[i];
    if (options.spacing === "open" && gap < 4) cost += 0.6;
    if (gap > 10) cost += 0.25;
  }
  // Wide bass-to-tenor gaps ring cleanly; narrow ones sound muddy.
  const bassGap = voicing[1] - voicing[0];
  if (bassGap < 5) cost += 0.4;

  const third = chord.pcs[1];
  const doubledThird = voicing.filter((p) => pc(p) === third).length > 1;
  if (doubledThird) cost += 0.5;

  return cost;
}

const ENUMERATION_LIMIT = 4000;

function enumerateVoicings(chord: Chord, options: VoicingOptions): number[][] {
  const voices = options.ranges.length;
  const maxGaps =
    options.maxGaps ??
    [DEFAULT_BASS_GAP, ...new Array(voices - 2).fill(DEFAULT_UPPER_GAP)];
  const out: number[][] = [];

  const walk = (voice: number, acc: number[], remaining: number[]) => {
    if (out.length >= ENUMERATION_LIMIT) return;
    if (voice === voices) {
      out.push([...acc]);
      return;
    }
    const range = options.ranges[voice];
    const prev = acc[acc.length - 1];
    const low = Math.max(range.min, prev + 1);
    const high = Math.min(range.max, prev + maxGaps[voice - 1]);
    const tried = new Set<number>();
    for (const candidatePc of remaining) {
      if (tried.has(candidatePc)) continue;
      tried.add(candidatePc);
      for (const pitch of pitchesInRange(candidatePc, low, high)) {
        walk(voice + 1, [...acc, pitch], removeOnce(remaining, candidatePc));
      }
    }
  };

  const bassRange = options.ranges[0];
  for (const set of pcMultisets(chord, voices, options.tonicPc)) {
    if (!set.includes(chord.bassPc)) continue;
    for (const bass of pitchesInRange(chord.bassPc, bassRange.min, bassRange.max)) {
      walk(1, [bass], removeOnce(set, chord.bassPc));
    }
  }

  return out;
}

function parallelPerfect(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const before = (a[j] - a[i]) % 12;
      const after = (b[j] - b[i]) % 12;
      if (before !== after) continue;
      if (before !== 0 && before !== 7) continue;
      const moveI = b[i] - a[i];
      const moveJ = b[j] - a[j];
      if (moveI === 0 || moveJ === 0) continue;
      if (Math.sign(moveI) === Math.sign(moveJ)) return true;
    }
  }
  return false;
}

function transitionCost(
  a: number[],
  b: number[],
  chordA: Chord,
  chordB: Chord,
  options: VoicingOptions,
  hard: boolean,
): number {
  if (parallelPerfect(a, b)) {
    if (hard) return Infinity;
    return 8;
  }

  let cost = 0;
  for (let i = 0; i < a.length; i++) {
    const motion = Math.abs(b[i] - a[i]);
    const weight = i === 0 ? 0.5 : i === a.length - 1 ? 0.7 : 1;
    cost += motion * 0.35 * weight;
    if (i > 0 && i < a.length - 1 && motion > 7) cost += 1.2;
    // The augmented second between the minor sixth and raised seventh is unsingable.
    if (motion === 3 && i > 0) {
      const rose = b[i] > a[i];
      const toLeadingTone = pc(b[i]) === leadingTonePc(options.tonicPc);
      if (rose && toLeadingTone) cost += 1.4;
    }
  }

  // Voice overlap: a voice must not move past where its neighbour just was.
  for (let i = 0; i < a.length - 1; i++) {
    if (b[i] > a[i + 1]) cost += 1.4;
    if (b[i + 1] < a[i]) cost += 1.4;
  }

  const lt = leadingTonePc(options.tonicPc);
  if (chordA.fn === "D" && chordB.fn === "T") {
    for (let i = 0; i < a.length; i++) {
      if (pc(a[i]) !== lt) continue;
      const resolved = b[i] === a[i] + 1;
      if (!resolved) cost += i === a.length - 1 || i === 0 ? 2.2 : 0.9;
    }
  }

  if (chordA.seventh) {
    const seventhPc = chordA.pcs[chordA.pcs.length - 1];
    for (let i = 0; i < a.length; i++) {
      if (pc(a[i]) !== seventhPc) continue;
      const step = a[i] - b[i];
      if (step !== 1 && step !== 2) cost += 1.6;
    }
  }

  // Reward contrary motion between the outer voices.
  const bassMove = b[0] - a[0];
  const topMove = b[b.length - 1] - a[a.length - 1];
  if (bassMove !== 0 && topMove !== 0) {
    if (Math.sign(bassMove) !== Math.sign(topMove)) cost -= 0.35;
    else {
      const arrival = (b[b.length - 1] - b[0]) % 12;
      const leapt = Math.abs(topMove) > 2;
      if ((arrival === 0 || arrival === 7) && leapt) cost += 0.8;
    }
  }

  return cost;
}

const MAX_CANDIDATES = 48;

/** Pick the top voice's octave when the melody sits outside the voicing range. */
function filterBySoprano(
  candidates: number[][],
  sopranoPc: number | null,
): number[][] {
  if (sopranoPc === null) return candidates;
  const matching = candidates.filter(
    (c) => pc(c[c.length - 1]) === pc(sopranoPc),
  );
  return matching.length ? matching : candidates;
}

/**
 * Viterbi search for the smoothest legal realisation of the chord plan.
 * Parallel fifths and octaves are forbidden outright; everything else is a
 * weighted preference so a solution always exists.
 */
export function solveVoicing(chords: Chord[], options: VoicingOptions): number[][] {
  const lattice = chords.map((chord, i) => {
    const all = enumerateVoicings(chord, options);
    const filtered = filterBySoprano(all, options.sopranoPcs?.[i] ?? null);
    const scored = filtered
      .map((voicing) => ({ voicing, cost: staticCost(voicing, chord, options) }))
      .sort((x, y) => x.cost - y.cost)
      .slice(0, MAX_CANDIDATES);
    if (scored.length) return scored;
    // Degenerate ranges: stack the chord from the bass upward.
    const fallback = options.ranges.map((range, v) =>
      pitchesInRange(chord.pcs[v % chord.pcs.length], range.min, range.max)[0] ??
      range.min,
    );
    return [{ voicing: fallback, cost: 0 }];
  });

  const search = (hard: boolean): number[][] | null => {
    const best = lattice.map((c) => c.map(() => Infinity));
    const from = lattice.map((c) => c.map(() => -1));
    for (let j = 0; j < lattice[0].length; j++) best[0][j] = lattice[0][j].cost;

    for (let i = 1; i < lattice.length; i++) {
      for (let j = 0; j < lattice[i].length; j++) {
        for (let k = 0; k < lattice[i - 1].length; k++) {
          if (!Number.isFinite(best[i - 1][k])) continue;
          const step = transitionCost(
            lattice[i - 1][k].voicing,
            lattice[i][j].voicing,
            chords[i - 1],
            chords[i],
            options,
            hard,
          );
          if (!Number.isFinite(step)) continue;
          const total = best[i - 1][k] + step + lattice[i][j].cost;
          if (total < best[i][j]) {
            best[i][j] = total;
            from[i][j] = k;
          }
        }
      }
    }

    const last = lattice.length - 1;
    let bestIdx = -1;
    for (let j = 0; j < lattice[last].length; j++) {
      if (!Number.isFinite(best[last][j])) continue;
      if (bestIdx < 0 || best[last][j] < best[last][bestIdx]) bestIdx = j;
    }
    if (bestIdx < 0) return null;

    const path = new Array(lattice.length).fill(0);
    path[last] = bestIdx;
    for (let i = last; i > 0; i--) {
      const prev = from[i][path[i]];
      if (prev < 0) return null;
      path[i - 1] = prev;
    }
    return path.map((j, i) => lattice[i][j].voicing);
  };

  return search(true) ?? search(false) ?? lattice.map((c) => c[0].voicing);
}

/** Check used by tests and by the arrangers' safety net. */
export function hasParallelPerfects(a: number[], b: number[]): boolean {
  return parallelPerfect(a, b);
}
