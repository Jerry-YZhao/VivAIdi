import type { SectionId, StyleId } from "./types";

export type EnsembleStyle = {
  id: StyleId;
  label: string;
  blurb: string;
  prompt: string;
  instruments: Record<SectionId, string>;
};

export const ENSEMBLES: EnsembleStyle[] = [
  {
    id: "chamber",
    label: "Chamber",
    blurb: "Intimate strings & woodwinds",
    prompt:
      "intimate chamber ensemble arrangement of this hummed melody, expressive strings, soft woodwinds, warm acoustic space, no drums",
    instruments: {
      lead: "violin",
      harmony: "viola",
      body: "cello",
      bass: "contrabass",
    },
  },
  {
    id: "orchestra",
    label: "Orchestra",
    blurb: "Full symphonic color",
    prompt:
      "full classical orchestra arrangement of this hummed melody, lush strings, brass swells, woodwinds, timpani accents, concert hall reverb",
    instruments: {
      lead: "flute",
      harmony: "violin",
      body: "french_horn",
      bass: "contrabass",
    },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    blurb: "Film-score drama",
    prompt:
      "cinematic film score arrangement of this hummed melody, emotional strings, subtle brass, modern hybrid orchestra, wide stereo, no vocals",
    instruments: {
      lead: "violin",
      harmony: "french_horn",
      body: "choir_aahs",
      bass: "contrabass",
    },
  },
  {
    id: "jazz",
    label: "Jazz",
    blurb: "Small combo swing",
    prompt:
      "jazz ensemble arrangement of this hummed melody, piano, upright bass, brushed drums, soft saxophone, warm club ambience",
    instruments: {
      lead: "tenor_sax",
      harmony: "electric_piano_1",
      body: "acoustic_guitar_nylon",
      bass: "acoustic_bass",
    },
  },
];

export function styleById(id: StyleId): EnsembleStyle {
  return ENSEMBLES.find((s) => s.id === id) ?? ENSEMBLES[0];
}
