import type { ArrangementPart } from "../arrangement";
import { BEATS_PER_BAR } from "../music/form";
import type { Chord } from "../music/harmony";
import { tonicDominantPcs } from "../music/harmony";
import {
  addPassingTones,
  breathe,
  brokenChord,
  foldLine,
  followRhythm,
  inBars,
  offbeatLine,
  pulseLine,
  tieRepeats,
  toEvents,
  transposeOctaves,
  voiceLine,
  walkingBass,
} from "../music/figuration";
import { fitLineToRange } from "../music/lead";
import type { GridNote } from "../music/theme";
import { nearestPc } from "../music/theory";
import type { VoiceRange } from "../music/voicing";
import { chorale, makePart, slotSpan, type ArrangeContext } from "./context";

const CELLO: VoiceRange = { min: 36, max: 64 };
const VIOLA: VoiceRange = { min: 48, max: 74 };
const INNER: VoiceRange = { min: 55, max: 79 };
const VIOLIN: VoiceRange = { min: 62, max: 88 };

/** The section's full compass, kept wider than the voicing window so a
 *  wide-ranging theme keeps its peak instead of being clamped flat. */
const VIOLIN_SOLO: VoiceRange = { min: 55, max: 91 };

const WIND_BREATH = [4, 8, 12].map((bar) => bar * BEATS_PER_BAR);

/** A measured roll, swelling from one dynamic to another. */
function roll(
  pitch: number,
  startBeat: number,
  beats: number,
  from: number,
  to: number,
  subdiv = 0.25,
): GridNote[] {
  const out: GridNote[] = [];
  const count = Math.round(beats / subdiv);
  for (let i = 0; i < count; i++) {
    out.push({
      pitch,
      startBeat: startBeat + i * subdiv,
      durBeats: subdiv,
      amp: from + ((to - from) * i) / Math.max(1, count - 1),
    });
  }
  return out;
}

/**
 * Timpani are tuned to the tonic and the dominant only, and speak at cadences
 * and the climax rather than marking every bar.
 */
function timpani(ctx: ArrangeContext): GridNote[] {
  const [tonicPc, dominantPc] = tonicDominantPcs(
    ctx.analysis.tonicPc,
    ctx.analysis.mode,
  );
  const tonic = nearestPc(45, [tonicPc], 36, 53);
  const dominant = nearestPc(43, [dominantPc], 36, 53);
  const bar = (n: number) => n * BEATS_PER_BAR;
  const strike = (pitch: number, beat: number, dur: number, amp: number): GridNote => ({
    pitch,
    startBeat: beat,
    durBeats: dur,
    amp,
  });

  return [
    // Half cadence.
    strike(dominant, bar(7), 1, 0.6),
    strike(dominant, bar(7) + 2, 1, 0.5),
    // A quiet roll under the wind statement of the theme.
    ...roll(tonic, bar(8), 8, 0.18, 0.34),
    // The climax.
    strike(tonic, bar(10), 1, 0.7),
    strike(dominant, bar(10) + 2, 1, 0.6),
    strike(tonic, bar(11), 1, 0.74),
    strike(dominant, bar(11) + 2, 1, 0.62),
    // Cadential drive.
    strike(tonic, bar(13), 1, 0.62),
    strike(dominant, bar(13) + 2, 1, 0.58),
    ...roll(dominant, bar(14), 4, 0.4, 0.9),
    strike(tonic, bar(15), 1.5, 0.95),
    strike(tonic, bar(15) + 2, 2, 0.7),
  ];
}

/**
 * Classical-period forces: strings carry continuity, winds trade short solos,
 * horns bridge the inner harmony, trumpets mark arrivals, timpani punctuate.
 * Families enter and leave by phrase instead of playing continuously.
 */
export function arrangeOrchestra(ctx: ArrangeContext): ArrangementPart[] {
  const voiced = chorale(ctx, [CELLO, VIOLA, INNER, VIOLIN]);
  const bassLine = voiceLine(ctx.slots, voiced, 0);
  const tenorLine = voiceLine(ctx.slots, voiced, 1);
  const innerLine = voiceLine(ctx.slots, voiced, 2);
  const lead = fitLineToRange(ctx.lead, VIOLIN_SOLO.min, VIOLIN_SOLO.max);

  const violins: GridNote[] = [];
  const violinsTremolo: GridNote[] = [];
  const violas: GridNote[] = [];
  const cellos: GridNote[] = [];
  const basses: GridNote[] = [];
  const flute: GridNote[] = [];
  const oboe: GridNote[] = [];
  const clarinet: GridNote[] = [];
  const bassoon: GridNote[] = [];
  const horns: GridNote[] = [];
  const trumpets: GridNote[] = [];

  // Presentation: strings only, so the winds still have something to reveal.
  violins.push(...inBars(lead, 0, 3));
  violas.push(...offbeatLine(inBars(tenorLine, 0, 3), 0.5, 0.6));
  cellos.push(...pulseLine(inBars(bassLine, 0, 3), 2, 0.9, 0.5));
  basses.push(
    ...bassOctave(pulseLine(inBars(bassLine, 0, 3), 4, 0.85, 0.42)),
  );

  // Continuation: an oboe counterline, then flute and horns towards the cadence.
  violins.push(...inBars(lead, 4, 7));
  const middle = slotSpan(ctx, voiced, 4, 7);
  violas.push(...brokenChord(middle.slots, middle.voiced, [1, 2], 0.5, [0, 1, 0, 1], 0.6));
  cellos.push(...walkingBass(inBars(bassLine, 4, 7), ctx.scale, 1));
  basses.push(...bassOctave(pulseLine(inBars(bassLine, 4, 7), 2, 0.8, 0.5)));
  oboe.push(
    ...addPassingTones(tieRepeats(inBars(innerLine, 4, 5)), ctx.scale).map((n) => ({
      ...n,
      amp: n.amp * 0.85,
    })),
  );
  flute.push(...fitLineToRange(inBars(lead, 6, 7), 74, 91));
  clarinet.push(...tieRepeats(inBars(innerLine, 6, 7)));
  bassoon.push(...pulseLine(inBars(bassLine, 6, 7), 2, 0.8, 0.9));
  horns.push(...foldLine(tieRepeats(inBars(tenorLine, 6, 7)), 50, 70));

  // Return: the theme is re-scored for winds over tremolo strings.
  flute.push(...inBars(lead, 8, 9));
  oboe.push(...fitLineToRange(inBars(lead, 8, 9), 58, 84));
  violinsTremolo.push(...tieRepeats(inBars(innerLine, 8, 9)));
  violas.push(...tieRepeats(inBars(tenorLine, 8, 9)));
  cellos.push(...pulseLine(inBars(bassLine, 8, 9), 2, 0.85, 0.9));
  basses.push(...bassOctave(tieRepeats(inBars(bassLine, 8, 9))));
  horns.push(...foldLine(tieRepeats(inBars(tenorLine, 8, 9)), 50, 70));
  clarinet.push(...tieRepeats(inBars(innerLine, 8, 9)));

  // Climax: strings take the theme back and the brass arrives.
  violins.push(...inBars(lead, 10, 11));
  const climax = slotSpan(ctx, voiced, 10, 11);
  violas.push(...brokenChord(climax.slots, climax.voiced, [1, 2], 0.5, [0, 1, 1, 0], 0.72));
  cellos.push(...walkingBass(inBars(bassLine, 10, 11), ctx.scale, 1));
  basses.push(...bassOctave(pulseLine(inBars(bassLine, 10, 11), 2, 0.9, 0.6)));
  flute.push(...fitLineToRange(inBars(lead, 10, 11), 74, 91));
  oboe.push(...fitLineToRange(inBars(lead, 10, 11), 58, 84));
  clarinet.push(...tieRepeats(inBars(innerLine, 10, 11)));
  bassoon.push(...pulseLine(inBars(bassLine, 10, 11), 1, 0.85, 0.8));
  horns.push(...pulseLine(foldLine(inBars(tenorLine, 10, 11), 50, 70), 2, 0.9, 0.9));
  trumpets.push(...arrivals(ctx.chords, 10, 11));

  // Cadential tutti.
  violins.push(...inBars(lead, 12, 15));
  const strokes = pulseLine(inBars(tenorLine, 12, 14), 1, 1, 0.86);
  violas.push(...followRhythm(strokes, tenorLine, 0.8));
  cellos.push(...followRhythm(strokes, bassLine, 0.92));
  basses.push(...bassOctave(pulseLine(inBars(bassLine, 12, 14), 2, 0.95, 0.7)));
  flute.push(...fitLineToRange(inBars(lead, 14, 15), 74, 91));
  oboe.push(...followRhythm(strokes, innerLine, 0.7));
  clarinet.push(...followRhythm(strokes, innerLine, 0.66));
  bassoon.push(...followRhythm(strokes, bassLine, 0.78));
  horns.push(...pulseLine(foldLine(inBars(tenorLine, 12, 14), 50, 70), 2, 0.92, 0.92));
  trumpets.push(...arrivals(ctx.chords, 12, 15));

  // Everyone sustains the final tonic.
  violas.push(...inBars(tenorLine, 15, 15));
  cellos.push(...inBars(bassLine, 15, 15));
  basses.push(...bassOctave(inBars(bassLine, 15, 15)));
  oboe.push(...inBars(innerLine, 15, 15));
  clarinet.push(...inBars(innerLine, 15, 15));
  bassoon.push(...inBars(bassLine, 15, 15));
  horns.push(...foldLine(inBars(tenorLine, 15, 15), 50, 70));

  const spb = ctx.spb;
  const wind = (notes: GridNote[], gate: number) =>
    toEvents(breathe(notes, 6, 0.5, WIND_BREATH), spb, {
      gate,
      attack: 0.05,
      release: 0.18,
    });

  return [
    makePart(ctx.style, "violins", [
      ...toEvents(violins, spb, { gate: 0.94 }),
      ...toEvents(violinsTremolo, spb, { articulation: "tremolo", gate: 0.98 }),
    ]),
    makePart(ctx.style, "violas", toEvents(violas, spb, { gate: 0.9 })),
    makePart(ctx.style, "cellos", toEvents(cellos, spb, { gate: 0.92 })),
    makePart(ctx.style, "basses", toEvents(basses, spb, { gate: 0.88 })),
    makePart(ctx.style, "flute", wind(flute, 0.9)),
    makePart(ctx.style, "oboe", wind(oboe, 0.9)),
    makePart(ctx.style, "clarinet", wind(clarinet, 0.92)),
    makePart(ctx.style, "bassoon", wind(bassoon, 0.86)),
    makePart(
      ctx.style,
      "horns",
      toEvents(breathe(horns, 8, 1, WIND_BREATH), spb, {
        gate: 0.95,
        attack: 0.09,
        release: 0.32,
      }),
    ),
    makePart(
      ctx.style,
      "trumpets",
      toEvents(trumpets, spb, { gate: 0.9, attack: 0.05, release: 0.2 }),
    ),
    makePart(ctx.style, "timpani", toEvents(timpani(ctx), spb, { gate: 1 })),
  ];
}

/**
 * Basses sound below the cellos but stay in their clearest register, so the
 * line is folded rather than transposed blindly into the bottom fifth.
 */
function bassOctave(notes: GridNote[]): GridNote[] {
  return foldLine(transposeOctaves(notes, -1), 33, 50);
}

/** Trumpets double the root of the harmony at structural arrivals only. */
function arrivals(chords: Chord[], firstBar: number, lastBar: number): GridNote[] {
  const out: GridNote[] = [];
  for (const chord of chords) {
    const { bar, startBeat, durBeats, dyn } = chord.slot;
    if (bar < firstBar || bar > lastBar) continue;
    if (startBeat % BEATS_PER_BAR !== 0 && !chord.slot.cadence) continue;
    out.push({
      pitch: nearestPc(67, [chord.rootPc], 57, 79),
      startBeat,
      durBeats: chord.slot.cadence === "PAC" ? durBeats : Math.min(2, durBeats),
      amp: dyn * 0.8,
    });
  }
  return out;
}
