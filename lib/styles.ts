import type { StyleId } from "./types";

/**
 * A group the conductor can cue. `cue` 0 sounds from the downbeat; the rest
 * enter in order as the hand opens, so every ensemble has its own 4-5 layers.
 */
export type ConductGroupSpec = {
  id: string;
  label: string;
  short: string;
  cue: number;
};

export type PartTone = {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
};

export type PartSpec = {
  id: string;
  groupId: string;
  label: string;
  /** FluidR3_GM instrument name. */
  instrument: string;
  /** Second sample set for pizzicato or tremolo colour on the same bus. */
  altInstrument?: string;
  /** Written range this player is asked to stay inside. */
  range: [number, number];
  /** Static balance within the ensemble. */
  gain: number;
  /** Seating position, -1 left to 1 right. */
  pan: number;
  /** Reverb send. */
  wet: number;
  tone?: PartTone;
};

export type EnsembleStyle = {
  id: StyleId;
  label: string;
  blurb: string;
  /** Room size for the convolution tail. */
  reverbSeconds: number;
  wetMix: number;
  groups: ConductGroupSpec[];
  parts: PartSpec[];
};

const QUARTET: EnsembleStyle = {
  id: "chamber",
  label: "String Quartet",
  blurb: "Two violins, viola, cello — four conversing voices",
  reverbSeconds: 1.5,
  wetMix: 0.32,
  groups: [
    { id: "violin1", label: "Violin I", short: "Vln I", cue: 0 },
    { id: "violin2", label: "Violin II", short: "Vln II", cue: 1 },
    { id: "viola", label: "Viola", short: "Vla", cue: 2 },
    { id: "cello", label: "Cello", short: "Vc", cue: 3 },
  ],
  parts: [
    {
      id: "violin1",
      groupId: "violin1",
      label: "Violin I",
      instrument: "violin",
      range: [55, 91],
      gain: 1,
      pan: -0.55,
      wet: 0.3,
    },
    {
      id: "violin2",
      groupId: "violin2",
      label: "Violin II",
      instrument: "violin",
      altInstrument: "pizzicato_strings",
      range: [55, 84],
      gain: 0.78,
      pan: -0.24,
      wet: 0.3,
    },
    {
      id: "viola",
      groupId: "viola",
      label: "Viola",
      instrument: "viola",
      altInstrument: "pizzicato_strings",
      range: [48, 79],
      gain: 0.82,
      pan: 0.28,
      wet: 0.3,
    },
    {
      id: "cello",
      groupId: "cello",
      label: "Cello",
      instrument: "cello",
      range: [36, 76],
      gain: 0.9,
      pan: 0.52,
      wet: 0.26,
    },
  ],
};

const WIND_QUINTET: EnsembleStyle = {
  id: "windQuintet",
  label: "Woodwind Quintet",
  blurb: "Flute, oboe, clarinet, horn, bassoon — five distinct colours",
  reverbSeconds: 1.6,
  wetMix: 0.3,
  groups: [
    { id: "flute", label: "Flute", short: "Fl", cue: 0 },
    { id: "oboe", label: "Oboe", short: "Ob", cue: 1 },
    { id: "clarinet", label: "Clarinet", short: "Cl", cue: 2 },
    { id: "bassoon", label: "Bassoon", short: "Bsn", cue: 3 },
    { id: "horn", label: "Horn", short: "Hn", cue: 4 },
  ],
  parts: [
    {
      id: "flute",
      groupId: "flute",
      label: "Flute",
      instrument: "flute",
      range: [60, 91],
      gain: 0.86,
      pan: -0.45,
      wet: 0.3,
    },
    {
      id: "oboe",
      groupId: "oboe",
      label: "Oboe",
      instrument: "oboe",
      range: [58, 84],
      gain: 0.74,
      pan: -0.16,
      wet: 0.28,
    },
    {
      id: "clarinet",
      groupId: "clarinet",
      label: "Clarinet in B\u266d",
      instrument: "clarinet",
      range: [50, 84],
      gain: 0.8,
      pan: 0.2,
      wet: 0.28,
    },
    {
      id: "bassoon",
      groupId: "bassoon",
      label: "Bassoon",
      instrument: "bassoon",
      range: [36, 69],
      gain: 0.84,
      pan: 0.44,
      wet: 0.24,
    },
    {
      id: "horn",
      groupId: "horn",
      label: "Horn in F",
      instrument: "french_horn",
      range: [46, 72],
      // Held back so the horn bridges the harmony instead of covering the reeds.
      gain: 0.55,
      pan: 0.04,
      wet: 0.4,
    },
  ],
};

const CHOIR: EnsembleStyle = {
  id: "choir",
  label: "Wordless Choir",
  blurb: "Four-part SATB on an open ‘ah’ — no words, only voices",
  reverbSeconds: 2.8,
  wetMix: 0.5,
  groups: [
    { id: "soprano", label: "Soprano", short: "S", cue: 0 },
    { id: "alto", label: "Alto", short: "A", cue: 1 },
    { id: "tenor", label: "Tenor", short: "T", cue: 2 },
    { id: "bass", label: "Bass", short: "B", cue: 3 },
  ],
  parts: [
    {
      id: "soprano",
      groupId: "soprano",
      label: "Soprano",
      instrument: "choir_aahs",
      range: [60, 79],
      gain: 0.95,
      pan: -0.42,
      wet: 0.52,
      // The General MIDI choir is bright and sibilant; soften the top.
      tone: { type: "highshelf", frequency: 3800, gain: -5 },
    },
    {
      id: "alto",
      groupId: "alto",
      label: "Alto",
      instrument: "choir_aahs",
      range: [55, 74],
      gain: 0.82,
      pan: -0.16,
      wet: 0.52,
      tone: { type: "highshelf", frequency: 3600, gain: -4 },
    },
    {
      id: "tenor",
      groupId: "tenor",
      label: "Tenor",
      instrument: "choir_aahs",
      range: [48, 69],
      gain: 0.84,
      pan: 0.18,
      wet: 0.5,
      tone: { type: "highshelf", frequency: 3400, gain: -3 },
    },
    {
      id: "bass",
      groupId: "bass",
      label: "Bass",
      instrument: "choir_aahs",
      range: [40, 62],
      gain: 0.9,
      pan: 0.44,
      wet: 0.46,
      tone: { type: "lowshelf", frequency: 220, gain: 3 },
    },
  ],
};

const ORCHESTRA: EnsembleStyle = {
  id: "orchestra",
  label: "Classical Orchestra",
  blurb: "Strings, paired winds, horns, trumpets and timpani",
  reverbSeconds: 2.4,
  wetMix: 0.44,
  groups: [
    { id: "strings", label: "Strings", short: "Str", cue: 0 },
    { id: "woodwinds", label: "Woodwinds", short: "Ww", cue: 1 },
    { id: "brass", label: "Horns & Trumpets", short: "Br", cue: 2 },
    { id: "timpani", label: "Timpani", short: "Timp", cue: 3 },
  ],
  parts: [
    {
      id: "violins",
      groupId: "strings",
      label: "Violins",
      instrument: "violin",
      altInstrument: "tremolo_strings",
      range: [55, 91],
      gain: 1,
      pan: -0.52,
      wet: 0.34,
    },
    {
      id: "violas",
      groupId: "strings",
      label: "Violas",
      instrument: "viola",
      range: [48, 79],
      gain: 0.7,
      pan: -0.12,
      wet: 0.34,
    },
    {
      id: "cellos",
      groupId: "strings",
      label: "Cellos",
      instrument: "cello",
      range: [36, 76],
      gain: 0.8,
      pan: 0.34,
      wet: 0.32,
    },
    {
      id: "basses",
      groupId: "strings",
      label: "Basses",
      instrument: "contrabass",
      // Kept above the muddiest fifth of the instrument.
      range: [33, 55],
      gain: 0.72,
      pan: 0.5,
      wet: 0.26,
    },
    {
      id: "flute",
      groupId: "woodwinds",
      label: "Flutes",
      instrument: "flute",
      range: [62, 91],
      gain: 0.66,
      pan: -0.3,
      wet: 0.4,
    },
    {
      id: "oboe",
      groupId: "woodwinds",
      label: "Oboes",
      instrument: "oboe",
      range: [58, 84],
      gain: 0.58,
      pan: -0.1,
      wet: 0.4,
    },
    {
      id: "clarinet",
      groupId: "woodwinds",
      label: "Clarinets",
      instrument: "clarinet",
      range: [50, 82],
      gain: 0.6,
      pan: 0.12,
      wet: 0.4,
    },
    {
      id: "bassoon",
      groupId: "woodwinds",
      label: "Bassoons",
      instrument: "bassoon",
      range: [36, 69],
      gain: 0.62,
      pan: 0.3,
      wet: 0.38,
    },
    {
      id: "horns",
      groupId: "brass",
      label: "Horns",
      instrument: "french_horn",
      range: [46, 72],
      gain: 0.56,
      pan: -0.06,
      wet: 0.46,
    },
    {
      id: "trumpets",
      groupId: "brass",
      label: "Trumpets",
      instrument: "trumpet",
      range: [55, 82],
      gain: 0.44,
      pan: 0.2,
      wet: 0.42,
    },
    {
      id: "timpani",
      groupId: "timpani",
      label: "Timpani",
      instrument: "timpani",
      range: [36, 55],
      gain: 0.68,
      pan: 0.02,
      wet: 0.44,
    },
  ],
};

export const ENSEMBLES: EnsembleStyle[] = [ORCHESTRA, QUARTET, WIND_QUINTET, CHOIR];

export function styleById(id: StyleId): EnsembleStyle {
  return ENSEMBLES.find((s) => s.id === id) ?? ENSEMBLES[0];
}

export function partSpec(style: EnsembleStyle, id: string): PartSpec {
  const spec = style.parts.find((p) => p.id === id);
  if (!spec) throw new Error(`Unknown part "${id}" in ${style.id}`);
  return spec;
}

export function groupsOf(style: EnsembleStyle): ConductGroupSpec[] {
  return [...style.groups].sort((a, b) => a.cue - b.cue);
}
