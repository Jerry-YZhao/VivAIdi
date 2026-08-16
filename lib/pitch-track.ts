import type { NoteEvent } from "./types";

/* ------------------------------------------------------------------------ */
/* Basic Pitch model geometry (mirrors the model's constants.py)             */
/* ------------------------------------------------------------------------ */

const FPS = 86;
const FRAME_SECONDS = 1 / FPS;
const WINDOW_FRAMES = FPS * 2;
const WINDOW_DRIFT = 0.0103;
const MIDI_OFFSET = 21;
const BINS_PER_SEMITONE = 3;

/**
 * Hummable range. C2 covers a low male chest voice — the previous floor of G2
 * silently pushed those notes an octave up. C6 is above any comfortable hum,
 * and keeping the range tight also keeps the decoder cheap.
 */
export const HUM_LOW = 36;
export const HUM_HIGH = 84;

export type FrameState = "unvoiced" | "stable" | "transition";

export type PitchFrame = {
  t: number;
  /** Fractional MIDI from the contour head. 0 when the decoder chose silence. */
  midi: number;
  conf: number;
  onset: number;
  state: FrameState;
};

export type PitchTrack = {
  frames: PitchFrame[];
  onThreshold: number;
  offThreshold: number;
};

export type Sensitivity = "smooth" | "balanced" | "detailed";

/* ------------------------------------------------------------------------ */
/* Tuning                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Path costs for the monophonic decoder, in log-probability units (nats), so
 * they trade directly against the model's own confidence. A cost of 4.5 is
 * worth roughly one frame of "the model is certain it is this pitch".
 */
const DECODER = {
  /** Scales model evidence against the transition costs below. */
  emissionWeight: 1,
  /** Keeps log() finite so one dead frame cannot veto a state forever. */
  probFloor: 1e-4,
  /** Flat toll for changing pitch at all — this is what buys held notes. */
  changeBase: 2,
  /** Extra toll per semitone moved. */
  changePerSemitone: 0.5,
  /**
   * Ceiling on the per-semitone toll. Without it, wide but real leaps become
   * unreachable; with it, an octave costs changeBase + changeCap = 9, which a
   * three-frame harmonic glitch can never repay but a sustained leap can.
   */
  changeCap: 7,
  /** Tolls for starting and ending a voiced run. */
  voiceOnCost: 1.5,
  voiceOffCost: 1.5,
  /** Positive values make silence stickier. */
  silenceBias: 0,
};

/** Adaptive voiced/unvoiced thresholds derived from the take's own dynamics. */
const VOICING = {
  floorPercentile: 0.4,
  peakPercentile: 0.95,
  /** How far up the floor→peak span "clearly sounding" sits. */
  onFraction: 0.2,
  onMin: 0.07,
  onMax: 0.42,
  /** Hysteresis: staying voiced needs only half the confidence of starting. */
  offRatio: 0.5,
  offMin: 0.035,
};

/** Median window for the fractional contour. Long enough to erase a wobble. */
const MEDIAN_WINDOW_MS = 70;
/** Shorter window for confidence — it gates voicing, so keep its edges sharp. */
const CONF_MEDIAN_WINDOW_MS = 35;

/**
 * Frame-to-frame pitch movement above which a frame is a transition rather
 * than part of a note. 0.06 semitones/frame is ~5 semitones/second: slower than
 * any deliberate slide, faster than the drift of a held note.
 */
const TRANSITION_SEMITONES_PER_FRAME = 0.06;

/** Transition frames still vote on a note's pitch, but only faintly. */
const TRANSITION_WEIGHT = 0.15;

/** Frames of history behind the write head used as the current note's pitch. */
const RUNNING_WINDOW_FRAMES = 43;

/**
 * A candidate that drifts back inside this fraction of the change threshold is
 * abandoned. The gap between the two keeps vibrato from arming a split.
 */
const CANDIDATE_RELEASE = 0.6;
/** Share of the confirmation window that must be stable, not gliding. */
const CANDIDATE_STABLE_RATIO = 0.6;
/** Candidate confidence required, relative to the voicing-on threshold. */
const CANDIDATE_CONF_RATIO = 0.9;

/** Re-articulation of an already-sounding pitch. */
const REATTACK = {
  /** Onset must beat its neighbours this far out to count as a peak. */
  peakRadius: 2,
  /** Minimum time between two accepted attacks. */
  refractoryMs: 160,
  /** Window before the onset searched for a confidence dip. */
  dipWindowMs: 70,
  /**
   * CREPE-Notes-style boundary score: onset height x relative confidence dip.
   * Demanding both means a jittery onset head alone cannot split a held note.
   */
  minScore: 0.1,
};

/** Two segments this close in pitch are the same note for merging purposes. */
const SAME_PITCH_SEMITONES = 0.35;
/** Simplification is iterative; this bounds the work and guarantees a fixpoint. */
const SIMPLIFY_PASSES = 4;

type Preset = {
  /** Semitones a candidate must sit away from the current note. */
  changeSemitones: number;
  /** How long a candidate must hold before it becomes its own note. */
  confirmMs: number;
  /** Max spread (median absolute deviation) inside the confirmation window. */
  stableSpreadSemitones: number;
  /** Max drift between the halves of the window — this is what rejects slides. */
  maxDriftSemitones: number;
  /** Notes shorter than this are discarded. */
  minMs: number;
  /** Unvoiced runs longer than this end a note. */
  gapMs: number;
  /** Onset height needed to re-articulate the same pitch. */
  onsetPeak: number;
  /** Same-pitch notes separated by less than this are welded back together. */
  mergeGapMs: number;
  /** Interior notes shorter than this are absorbed by identical neighbours. */
  absorbMs: number;
};

const PRESETS: Record<Sensitivity, Preset> = {
  smooth: {
    changeSemitones: 0.85,
    confirmMs: 110,
    stableSpreadSemitones: 0.3,
    maxDriftSemitones: 0.18,
    minMs: 130,
    gapMs: 90,
    onsetPeak: 0.72,
    mergeGapMs: 150,
    absorbMs: 110,
  },
  balanced: {
    changeSemitones: 0.7,
    confirmMs: 80,
    stableSpreadSemitones: 0.25,
    maxDriftSemitones: 0.15,
    minMs: 95,
    gapMs: 70,
    onsetPeak: 0.58,
    mergeGapMs: 120,
    absorbMs: 80,
  },
  detailed: {
    changeSemitones: 0.6,
    confirmMs: 60,
    stableSpreadSemitones: 0.22,
    maxDriftSemitones: 0.13,
    minMs: 65,
    gapMs: 55,
    onsetPeak: 0.45,
    mergeGapMs: 90,
    absorbMs: 55,
  },
};

/* ------------------------------------------------------------------------ */
/* Small numeric helpers                                                      */
/* ------------------------------------------------------------------------ */

function frameTime(index: number) {
  return index * FRAME_SECONDS - WINDOW_DRIFT * Math.floor(index / WINDOW_FRAMES);
}

function msToFrames(ms: number) {
  return Math.max(1, Math.round(ms / 1000 / FRAME_SECONDS));
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median absolute deviation — spread that a single outlier cannot inflate. */
function medianAbsDeviation(values: number[], center: number) {
  if (!values.length) return 0;
  return median(values.map((v) => Math.abs(v - center)));
}

function weightedMedian(values: { v: number; w: number }[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return median(sorted.map((x) => x.v));
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return sorted[sorted.length - 1].v;
}

function meanConf(frames: PitchFrame[]) {
  if (!frames.length) return 0;
  return frames.reduce((s, f) => s + f.conf, 0) / frames.length;
}

/* ------------------------------------------------------------------------ */
/* 1. Monophonic sequence decoding                                            */
/* ------------------------------------------------------------------------ */

/**
 * Viterbi over {silence} ∪ [HUM_LOW..HUM_HIGH] using the frame head as
 * emission evidence.
 *
 * Per-frame argmax treats every 11.6 ms slice as an independent decision, so a
 * momentarily loud harmonic or a wobble across a semitone boundary invents a
 * note. Scoring whole paths makes a spurious pitch pay to leave the held note
 * and pay again to come back — unaffordable for a glitch, trivial for a real
 * sustained leap. Returns a semitone index per frame, or -1 for silence.
 */
function decodePath(frames: number[][], lo: number, hi: number): Int16Array {
  const length = frames.length;
  const pitches = hi - lo + 1;
  const states = pitches + 1; // state 0 is silence
  const path = new Int16Array(length).fill(-1);
  if (!length || pitches <= 0) return path;

  // Cost of moving d semitones: linear, then capped. Monotonic in d, so an
  // octave is always dearer than a fifth, but never forbidden.
  const stepCost = new Float64Array(pitches);
  for (let d = 1; d < pitches; d++) {
    stepCost[d] =
      DECODER.changeBase +
      Math.min(DECODER.changeCap, DECODER.changePerSemitone * d);
  }

  const back = new Int16Array(length * states);
  const emit = new Float64Array(states);
  let prev = new Float64Array(states);
  let next = new Float64Array(states);

  for (let t = 0; t < length; t++) {
    const row = frames[t];
    let strongest = 0;
    for (let k = 0; k < pitches; k++) {
      const p = row[lo + k] ?? 0;
      if (p > strongest) strongest = p;
      emit[k + 1] =
        DECODER.emissionWeight * Math.log(Math.max(DECODER.probFloor, p));
    }
    // Nothing sounding is the complement of the best pitch evidence.
    emit[0] =
      DECODER.emissionWeight *
        Math.log(Math.max(DECODER.probFloor, 1 - strongest)) +
      DECODER.silenceBias;

    if (t === 0) {
      prev[0] = emit[0];
      for (let k = 1; k < states; k++) prev[k] = emit[k] - DECODER.voiceOnCost;
      continue;
    }

    let bestSilence = prev[0];
    let bestSilenceFrom = 0;
    for (let i = 1; i < states; i++) {
      const v = prev[i] - DECODER.voiceOffCost;
      if (v > bestSilence) {
        bestSilence = v;
        bestSilenceFrom = i;
      }
    }
    next[0] = bestSilence + emit[0];
    back[t * states] = bestSilenceFrom;

    for (let k = 0; k < pitches; k++) {
      const j = k + 1;
      let best = prev[j]; // holding the same pitch is free
      let from = j;
      const enter = prev[0] - DECODER.voiceOnCost;
      if (enter > best) {
        best = enter;
        from = 0;
      }
      for (let i = 0; i < pitches; i++) {
        if (i === k) continue;
        const v = prev[i + 1] - stepCost[Math.abs(i - k)];
        if (v > best) {
          best = v;
          from = i + 1;
        }
      }
      next[j] = best + emit[j];
      back[t * states + j] = from;
    }

    const swap = prev;
    prev = next;
    next = swap;
  }

  let state = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < states; i++) {
    if (prev[i] > bestScore) {
      bestScore = prev[i];
      state = i;
    }
  }
  for (let t = length - 1; t >= 0; t--) {
    path[t] = state === 0 ? -1 : lo + (state - 1);
    if (t > 0) state = back[t * states + state];
  }
  return path;
}

/* ------------------------------------------------------------------------ */
/* 2. Fractional pitch from the contour head                                  */
/* ------------------------------------------------------------------------ */

/** Contour centroids further than this from the decoded semitone are clamped. */
const MAX_CONTOUR_OFFSET = 0.6;

/**
 * Sub-semitone pitch, read from the contour bins around the decoded semitone.
 * Quantisation is deliberately deferred: vibrato, intonation drift and slides
 * are only separable from real note changes while the pitch is still
 * fractional.
 */
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
    acc += w * (b - center);
  }
  if (weight <= 0) return midi;
  const offset = acc / weight / BINS_PER_SEMITONE;
  return (
    midi + Math.max(-MAX_CONTOUR_OFFSET, Math.min(MAX_CONTOUR_OFFSET, offset))
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Track construction                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Turn the model's three heads into one fractional pitch curve with per-frame
 * voicing already resolved. Segmentation happens downstream.
 */
export function buildPitchTrack(
  frames: number[][],
  onsets: number[][],
  contours: number[][],
): PitchTrack {
  const width = frames[0]?.length ?? 0;
  const lo = Math.max(0, HUM_LOW - MIDI_OFFSET);
  const hi = Math.min(width - 1, HUM_HIGH - MIDI_OFFSET);
  const path = decodePath(frames, lo, hi);

  const raw: PitchFrame[] = [];
  const strengths: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const row = frames[i];
    let strongest = 0;
    for (let s = lo; s <= hi; s++) {
      if (row[s] > strongest) strongest = row[s];
    }
    strengths.push(strongest);

    const semi = path[i];
    raw.push({
      t: frameTime(i),
      midi: semi < 0 ? 0 : refinePitch(contours[i], semi),
      // Silent frames keep the raw evidence so the thresholds below see the
      // true noise floor rather than a column of zeros.
      conf: semi < 0 ? strongest : row[semi],
      onset: semi < 0 ? 0 : (onsets[i]?.[semi] ?? 0),
      state: "unvoiced",
    });
  }

  const sorted = [...strengths].sort((a, b) => a - b);
  const floor = percentile(sorted, VOICING.floorPercentile);
  const peak = percentile(sorted, VOICING.peakPercentile);
  const onThreshold = Math.min(
    VOICING.onMax,
    Math.max(VOICING.onMin, floor + (peak - floor) * VOICING.onFraction),
  );
  const offThreshold = Math.max(VOICING.offMin, onThreshold * VOICING.offRatio);

  const smoothed = smoothCurve(raw, offThreshold);
  classifyFrames(smoothed, onThreshold, offThreshold);
  return { frames: smoothed, onThreshold, offThreshold };
}

/**
 * Confidence-weighted median filter.
 *
 * A plain median counted every frame with a pitch, so a low-confidence frame
 * carried the same vote as a clean one. Weighting by confidence above the
 * voicing floor lets uncertain frames drift with the note instead of steering
 * it. There is deliberately no EMA afterwards: it smeared genuine note
 * transitions across ~50 ms and blunted exactly the boundaries segmentation
 * needs to see.
 */
function smoothCurve(frames: PitchFrame[], confFloor: number): PitchFrame[] {
  const pitchRadius = Math.max(1, Math.round(MEDIAN_WINDOW_MS / 2 / 1000 / FRAME_SECONDS));
  const confRadius = Math.max(1, Math.round(CONF_MEDIAN_WINDOW_MS / 2 / 1000 / FRAME_SECONDS));
  const out = frames.map((f) => ({ ...f }));

  for (let i = 0; i < frames.length; i++) {
    const picks: { v: number; w: number }[] = [];
    for (let j = i - pitchRadius; j <= i + pitchRadius; j++) {
      const f = frames[j];
      if (!f || f.midi <= 0) continue;
      const w = f.conf - confFloor;
      if (w <= 0) continue;
      picks.push({ v: f.midi, w });
    }
    if (picks.length >= 2) out[i].midi = weightedMedian(picks);

    const confs: number[] = [];
    for (let j = i - confRadius; j <= i + confRadius; j++) {
      const f = frames[j];
      if (f) confs.push(f.conf);
    }
    if (confs.length) out[i].conf = median(confs);
  }
  return out;
}

/**
 * Label every frame unvoiced / stable / transition.
 *
 * Voicing uses hysteresis so a note hovering near one threshold cannot chatter
 * on and off. The stable/transition split uses local pitch velocity: a frame in
 * the middle of a slide should never be allowed to define a note's identity,
 * however confident the model is about it.
 */
function classifyFrames(
  frames: PitchFrame[],
  onThreshold: number,
  offThreshold: number,
) {
  let voiced = false;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.midi <= 0) {
      voiced = false;
      f.state = "unvoiced";
      continue;
    }
    voiced = voiced ? f.conf >= offThreshold : f.conf >= onThreshold;
    if (!voiced) {
      f.state = "unvoiced";
      continue;
    }

    const prev = i > 0 ? frames[i - 1] : undefined;
    const next = i + 1 < frames.length ? frames[i + 1] : undefined;
    const hasPrev = !!prev && prev.midi > 0;
    const hasNext = !!next && next.midi > 0;
    let velocity = 0;
    if (hasPrev && hasNext) velocity = Math.abs(next.midi - prev.midi) / 2;
    else if (hasPrev) velocity = Math.abs(f.midi - prev.midi);
    else if (hasNext) velocity = Math.abs(next.midi - f.midi);

    f.state =
      velocity >= TRANSITION_SEMITONES_PER_FRAME ? "transition" : "stable";
  }
}

/* ------------------------------------------------------------------------ */
/* 4. Segmentation                                                            */
/* ------------------------------------------------------------------------ */

type Candidate = {
  frames: PitchFrame[];
  start: number;
  end: number;
  /** True when this segment began at a detected re-articulation. */
  reattack: boolean;
};

function makeCandidate(frames: PitchFrame[], reattack: boolean): Candidate {
  return {
    frames,
    start: frames[0].t,
    end: frames[frames.length - 1].t + FRAME_SECONDS,
    reattack,
  };
}

function mergeCandidates(...parts: Candidate[]): Candidate {
  return {
    frames: parts.flatMap((p) => p.frames),
    start: parts[0].start,
    end: parts[parts.length - 1].end,
    reattack: parts[0].reattack,
  };
}

/**
 * Robust pitch for a finished segment. Transition frames are kept but heavily
 * down-weighted, so the note lands on the pitch it settled at rather than
 * somewhere along the slide that reached it. A weighted median rather than a
 * mean, because one stray octave frame would drag a mean by six semitones.
 */
function robustPitch(frames: PitchFrame[]): number {
  const picks = frames
    .filter((f) => f.midi > 0)
    .map((f) => ({
      v: f.midi,
      w:
        Math.max(1e-3, f.conf) *
        (f.state === "stable" ? 1 : TRANSITION_WEIGHT),
    }));
  return weightedMedian(picks);
}

/** Pitch of the note being written, from its recent stable history. */
function runningPitch(frames: PitchFrame[], end: number): number {
  const stable: { v: number; w: number }[] = [];
  const any: { v: number; w: number }[] = [];
  for (let i = end - 1; i >= 0 && any.length < RUNNING_WINDOW_FRAMES; i--) {
    const f = frames[i];
    if (f.midi <= 0) continue;
    any.push({ v: f.midi, w: Math.max(1e-3, f.conf) });
    if (f.state === "stable") stable.push({ v: f.midi, w: Math.max(1e-3, f.conf) });
  }
  return weightedMedian(stable.length ? stable : any);
}

/**
 * Does the trailing part of a candidate look like a new note yet?
 *
 * Simply being far from the current pitch is not enough: every frame of a
 * C4→E4 slide is "far from C4" while passing through C#4 and D4. The candidate
 * has to have stopped moving as well, which is what the spread and drift tests
 * measure — drift across the window is the one that rejects slow slides, where
 * frame-to-frame velocity alone looks like deep vibrato.
 */
function confirmsNewNote(
  frames: PitchFrame[],
  candStart: number,
  reference: number,
  preset: Preset,
  onThreshold: number,
): boolean {
  const confirmFrames = msToFrames(preset.confirmMs);
  if (frames.length - candStart < confirmFrames) return false;

  const win = frames.slice(frames.length - confirmFrames);
  const pitches = win.map((f) => f.midi);
  const center = median(pitches);
  if (Math.abs(center - reference) < preset.changeSemitones) return false;
  if (medianAbsDeviation(pitches, center) > preset.stableSpreadSemitones) {
    return false;
  }

  const half = Math.floor(win.length / 2);
  const drift = Math.abs(
    median(pitches.slice(win.length - half)) - median(pitches.slice(0, half)),
  );
  if (drift > preset.maxDriftSemitones) return false;

  const stable = win.filter((f) => f.state === "stable").length;
  if (stable < win.length * CANDIDATE_STABLE_RATIO) return false;

  return meanConf(win) >= onThreshold * CANDIDATE_CONF_RATIO;
}

/**
 * A repeated note at the same pitch can only come from an attack, and a single
 * loud onset frame is not one. Require a genuine local peak, a refractory
 * period, and supporting evidence that the note actually let go first.
 */
function isReattack(
  all: PitchFrame[],
  index: number,
  current: PitchFrame[],
  preset: Preset,
): boolean {
  const f = all[index];
  if (f.onset < preset.onsetPeak) return false;

  for (let d = 1; d <= REATTACK.peakRadius; d++) {
    const before = all[index - d];
    const after = all[index + d];
    if (before && before.onset > f.onset) return false;
    if (after && after.onset >= f.onset) return false;
  }

  const held = f.t - current[0].t;
  const refractory = Math.max(preset.minMs, REATTACK.refractoryMs) / 1000;
  if (held < refractory) return false;

  const mean = meanConf(current);
  if (mean <= 0) return false;
  let dip = mean;
  const window = msToFrames(REATTACK.dipWindowMs);
  for (let k = Math.max(0, index - window); k <= index; k++) {
    dip = Math.min(dip, all[k].conf);
  }
  const depth = Math.max(0, 1 - dip / mean);
  return f.onset * depth >= REATTACK.minScore;
}

/**
 * Walk the pitch curve and cut a note only where the singer meant one: a pitch
 * that moved and then settled, a genuine re-articulation, or a breath.
 */
export function segmentTrack(
  track: PitchTrack,
  sensitivity: Sensitivity,
): NoteEvent[] {
  const preset = PRESETS[sensitivity];
  const gapFrames = msToFrames(preset.gapMs);
  const all = track.frames;

  const segments: Candidate[] = [];
  let current: PitchFrame[] | null = null;
  let currentReattack = false;
  let candStart = -1;
  let unvoicedRun = 0;

  const close = () => {
    if (current && current.length) {
      segments.push(makeCandidate(current, currentReattack));
    }
    current = null;
    candStart = -1;
    currentReattack = false;
  };

  for (let i = 0; i < all.length; i++) {
    const f = all[i];

    if (f.state === "unvoiced") {
      unvoicedRun++;
      if (current && unvoicedRun >= gapFrames) close();
      continue;
    }
    unvoicedRun = 0;

    if (!current) {
      current = [f];
      candStart = -1;
      currentReattack = false;
      continue;
    }

    const seg: PitchFrame[] = current;
    const reference = runningPitch(
      seg,
      candStart < 0 ? seg.length : candStart,
    );
    const distance = Math.abs(f.midi - reference);

    if (candStart < 0 && distance >= preset.changeSemitones) {
      candStart = seg.length;
    }
    seg.push(f);

    if (candStart >= 0) {
      if (distance < preset.changeSemitones * CANDIDATE_RELEASE) {
        // The pitch came home — vibrato, a scoop or a glitch, not a new note.
        candStart = -1;
      } else if (
        confirmsNewNote(seg, candStart, reference, preset, track.onThreshold)
      ) {
        const tail = seg.splice(candStart);
        segments.push(makeCandidate(seg, currentReattack));
        current = tail;
        currentReattack = false;
        candStart = -1;
      }
      continue;
    }

    if (isReattack(all, i, seg, preset)) {
      seg.pop();
      if (seg.length) segments.push(makeCandidate(seg, currentReattack));
      current = [f];
      currentReattack = true;
    }
  }
  close();

  return simplify(segments, preset, track.offThreshold).map(toNote);
}

/* ------------------------------------------------------------------------ */
/* 5. Post-segmentation simplification                                        */
/* ------------------------------------------------------------------------ */

/**
 * Candidate notes are cheap to produce and expensive to read, so bias hard
 * towards fewer of them: absorb blips between identical neighbours, weld
 * same-pitch notes split by a hiccup, and drop what is left over that is too
 * short or too quiet to have been meant.
 */
function simplify(
  list: Candidate[],
  preset: Preset,
  offThreshold: number,
): Candidate[] {
  let out = list;
  for (let pass = 0; pass < SIMPLIFY_PASSES && out.length; pass++) {
    const before = out.length;
    out = absorbShortInteriors(out, preset);
    out = mergeSamePitch(out, preset);
    out = dropWeak(out, preset, offThreshold);
    if (out.length === before) break;
  }
  return out;
}

/** C4 400 ms / C#4 40 ms / C4 350 ms is one 790 ms C4. */
function absorbShortInteriors(list: Candidate[], preset: Preset): Candidate[] {
  const absorb = preset.absorbMs / 1000;
  const mergeGap = preset.mergeGapMs / 1000;
  const out: Candidate[] = [];

  for (let i = 0; i < list.length; i++) {
    const mid = list[i];
    const left = out.length ? out[out.length - 1] : null;
    const right = list[i + 1];
    if (
      left &&
      right &&
      !mid.reattack &&
      !right.reattack &&
      mid.end - mid.start < absorb &&
      mid.start - left.end <= mergeGap &&
      right.start - mid.end <= mergeGap &&
      Math.round(robustPitch(left.frames)) ===
        Math.round(robustPitch(right.frames))
    ) {
      out[out.length - 1] = mergeCandidates(left, mid, right);
      i++; // the right neighbour has been consumed
      continue;
    }
    out.push(mid);
  }
  return out;
}

function mergeSamePitch(list: Candidate[], preset: Preset): Candidate[] {
  const mergeGap = preset.mergeGapMs / 1000;
  const out: Candidate[] = [];

  for (const c of list) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && !c.reattack && c.start - prev.end <= mergeGap) {
      const a = robustPitch(prev.frames);
      const b = robustPitch(c.frames);
      if (
        Math.round(a) === Math.round(b) ||
        Math.abs(a - b) <= SAME_PITCH_SEMITONES
      ) {
        out[out.length - 1] = mergeCandidates(prev, c);
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

function dropWeak(
  list: Candidate[],
  preset: Preset,
  offThreshold: number,
): Candidate[] {
  const minSeconds = preset.minMs / 1000;
  return list.filter(
    (c) => c.end - c.start >= minSeconds && meanConf(c.frames) >= offThreshold,
  );
}

function toNote(c: Candidate): NoteEvent {
  const conf = meanConf(c.frames);
  const pitch = Math.round(robustPitch(c.frames));
  return {
    pitchMidi: Math.min(HUM_HIGH, Math.max(HUM_LOW, pitch)),
    startTimeSeconds: c.start,
    durationSeconds: Math.max(FRAME_SECONDS * 2, c.end - c.start),
    amplitude: Math.min(1, Math.max(0.18, conf * 1.5)),
  };
}
