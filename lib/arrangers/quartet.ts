import type { ArrangementPart } from "../arrangement";
import {
  brokenChord,
  echoLine,
  foldLine,
  followRhythm,
  inBars,
  offbeatLine,
  pulseLine,
  tieRepeats,
  toEvents,
  voiceLine,
  walkingBass,
  addPassingTones,
} from "../music/figuration";
import { fitLineToRange } from "../music/lead";
import type { GridNote } from "../music/theme";
import type { VoiceRange } from "../music/voicing";
import { chorale, makePart, slotSpan, type ArrangeContext } from "./context";

const CELLO: VoiceRange = { min: 36, max: 67 };
const VIOLA: VoiceRange = { min: 48, max: 76 };
const VIOLIN2: VoiceRange = { min: 55, max: 81 };
const VIOLIN1: VoiceRange = { min: 62, max: 88 };

/**
 * Four independent players rather than a melody with padding. Roles rotate:
 * the cello takes the theme at the return, the upper voices answer each other
 * in the continuation, and only the cadence is homorhythmic.
 */
export function arrangeQuartet(ctx: ArrangeContext): ArrangementPart[] {
  const voiced = chorale(ctx, [CELLO, VIOLA, VIOLIN2, VIOLIN1]);
  const bass = voiceLine(ctx.slots, voiced, 0);
  const tenor = voiceLine(ctx.slots, voiced, 1);
  const alto = voiceLine(ctx.slots, voiced, 2);
  const soprano = voiceLine(ctx.slots, voiced, 3);
  const lead = fitLineToRange(ctx.lead, VIOLIN1.min, VIOLIN1.max);

  const violin1: GridNote[] = [];
  const violin2: GridNote[] = [];
  const viola: GridNote[] = [];
  const cello: GridNote[] = [];
  const violin2Pizz: GridNote[] = [];
  const violaPizz: GridNote[] = [];

  // Presentation: melody over a lifted accompaniment, cello on the beat.
  violin1.push(...inBars(lead, 0, 3));
  violin2.push(...offbeatLine(inBars(alto, 0, 3), 0.5, 0.6));
  viola.push(...offbeatLine(inBars(tenor, 0, 3), 0.5, 0.58));
  cello.push(...pulseLine(inBars(bass, 0, 3), 2, 0.95, 0.46));

  // Continuation: Violin II answers the fragment, viola runs broken chords.
  violin1.push(...inBars(lead, 4, 7));
  const fragment = inBars(lead, 4, 5);
  violin2.push(
    ...inBars(echoLine(fragment, 2, ctx.chords, [VIOLIN2.min, VIOLIN2.max], 0.6), 4, 5),
  );
  violin2.push(...offbeatLine(inBars(alto, 6, 7), 0.5, 0.66));
  const middle = slotSpan(ctx, voiced, 4, 7);
  viola.push(...brokenChord(middle.slots, middle.voiced, [1, 2], 0.5, [0, 1, 0, 1], 0.6));
  cello.push(...walkingBass(inBars(bass, 4, 7), ctx.scale, 1));

  // Return, first half: the cello sings the theme, upper strings play pizzicato.
  const celloTheme = fitLineToRange(inBars(ctx.lead, 8, 9), 45, 67);
  cello.push(...celloTheme);
  violin1.push(
    ...foldLine(addPassingTones(tieRepeats(inBars(soprano, 8, 9)), ctx.scale), 74, 88),
  );
  violin2Pizz.push(...pulseLine(inBars(alto, 8, 9), 1, 0.58, 0.3));
  violaPizz.push(...pulseLine(foldLine(inBars(bass, 8, 9), 50, 67), 1, 0.64, 0.3));

  // Return, second half: everyone back in, driving to the climax.
  violin1.push(...inBars(lead, 10, 11));
  violin2.push(...offbeatLine(inBars(alto, 10, 11), 0.5, 0.72));
  const climax = slotSpan(ctx, voiced, 10, 11);
  viola.push(...brokenChord(climax.slots, climax.voiced, [1, 2], 0.5, [0, 1, 1, 0], 0.7));
  cello.push(...walkingBass(inBars(bass, 10, 11), ctx.scale, 1));

  // Cadential: homorhythmic quarters into a sustained final chord.
  violin1.push(...inBars(lead, 12, 15));
  const strokes = pulseLine(inBars(alto, 12, 14), 1, 1, 0.88);
  violin2.push(...followRhythm(strokes, alto, 0.74));
  viola.push(...followRhythm(strokes, tenor, 0.72));
  cello.push(...followRhythm(strokes, bass, 0.88));
  violin2.push(...inBars(alto, 15, 15));
  viola.push(...inBars(tenor, 15, 15));
  cello.push(...inBars(bass, 15, 15));

  const spb = ctx.spb;
  return [
    makePart(ctx.style, "violin1", toEvents(violin1, spb, { gate: 0.95 })),
    makePart(ctx.style, "violin2", [
      ...toEvents(violin2, spb, { gate: 0.9 }),
      ...toEvents(violin2Pizz, spb, { articulation: "pizz", gate: 0.7 }),
    ]),
    makePart(ctx.style, "viola", [
      ...toEvents(viola, spb, { gate: 0.9 }),
      ...toEvents(violaPizz, spb, { articulation: "pizz", gate: 0.7 }),
    ]),
    makePart(ctx.style, "cello", toEvents(cello, spb, { gate: 0.92 })),
  ];
}
