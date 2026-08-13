import type { ArrangementPart } from "../arrangement";
import { buildFormSlots, PHRASES, TOTAL_BEATS, type PhraseRole, type Slot } from "../music/form";
import { planHarmony, type Chord } from "../music/harmony";
import { draftLead, finalizeLead, structuralSoprano } from "../music/lead";
import { makeRng, seedFromNotes, type Rng } from "../music/random";
import { analyzeTheme, type GridNote, type ThemeAnalysis } from "../music/theme";
import { keyLabel, pc, scalePcs } from "../music/theory";
import { solveVoicing, type VoiceRange } from "../music/voicing";
import type { EnsembleStyle, PartSpec } from "../styles";
import { partSpec } from "../styles";
import type { NoteEvent } from "../types";

export type ArrangeContext = {
  style: EnsembleStyle;
  analysis: ThemeAnalysis;
  slots: Slot[];
  chords: Chord[];
  /** The developed melody, in the register the singer hummed. */
  lead: GridNote[];
  /** Pitch classes of the key, for passing tones and approach notes. */
  scale: number[];
  sopranoPcs: (number | null)[];
  spb: number;
  totalBeats: number;
  keyLabel: string;
  rng: Rng;
};

export function buildContext(
  hummed: NoteEvent[],
  style: EnsembleStyle,
): ArrangeContext {
  const analysis = analyzeTheme(hummed);
  const slots = buildFormSlots();
  const draft = draftLead(analysis);
  const chords = planHarmony(analysis.tonicPc, analysis.mode, slots, draft);
  const lead = finalizeLead(draft, chords, analysis.tonicPc, analysis.mode);
  return {
    style,
    analysis,
    slots,
    chords,
    lead,
    scale: scalePcs(analysis.tonicPc, analysis.mode),
    sopranoPcs: structuralSoprano(chords, lead, slots).map((p) =>
      p === null ? null : pc(p),
    ),
    spb: 60 / analysis.qpm,
    totalBeats: TOTAL_BEATS,
    keyLabel: keyLabel(analysis.tonicPc, analysis.mode),
    rng: makeRng(seedFromNotes(hummed)),
  };
}

/** Solve the four-part skeleton in the register this ensemble actually plays. */
export function chorale(
  ctx: ArrangeContext,
  ranges: VoiceRange[],
  spacing: "close" | "open" = "close",
): number[][] {
  return solveVoicing(ctx.chords, {
    ranges,
    sopranoPcs: ctx.sopranoPcs,
    spacing,
    tonicPc: ctx.analysis.tonicPc,
  });
}

/** Slots and their voicings restricted to a span of bars, kept in step. */
export function slotSpan(
  ctx: ArrangeContext,
  voiced: number[][],
  firstBar: number,
  lastBar: number,
): { slots: Slot[]; voiced: number[][] } {
  const indices = ctx.slots
    .map((_, i) => i)
    .filter((i) => ctx.slots[i].bar >= firstBar && ctx.slots[i].bar <= lastBar);
  return {
    slots: indices.map((i) => ctx.slots[i]),
    voiced: indices.map((i) => voiced[i]),
  };
}

export function phraseBars(role: PhraseRole): [number, number] {
  const phrase = PHRASES.find((p) => p.role === role);
  return phrase ? [phrase.firstBar, phrase.lastBar] : [0, 3];
}

/**
 * Assemble a written part from its declared spec plus the notes it plays.
 * Anything that strayed outside the player's range is folded by octaves rather
 * than clamped, so the harmony survives even if the register does not.
 */
export function makePart(
  style: EnsembleStyle,
  id: string,
  notes: NoteEvent[],
): ArrangementPart {
  const spec: PartSpec = partSpec(style, id);
  const [low, high] = spec.range;
  const inRange = notes
    .map((note) => {
      let pitch = note.pitchMidi;
      while (pitch < low) pitch += 12;
      while (pitch > high) pitch -= 12;
      return { ...note, pitchMidi: Math.min(high, Math.max(low, pitch)) };
    })
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  return { ...spec, notes: inRange };
}
