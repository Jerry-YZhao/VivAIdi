import type { ArrangementPart } from "../arrangement";
import { BEATS_PER_BAR } from "../music/form";
import {
  addPassingTones,
  breathe,
  brokenChord,
  followRhythm,
  inBars,
  offbeatLine,
  pulseLine,
  tieRepeats,
  toEvents,
  voiceLine,
  walkingBass,
} from "../music/figuration";
import { diatonicShift, fitLineToRange } from "../music/lead";
import type { GridNote } from "../music/theme";
import type { VoiceRange } from "../music/voicing";
import { chorale, makePart, slotSpan, type ArrangeContext } from "./context";

const BASSOON: VoiceRange = { min: 38, max: 67 };
const HORN: VoiceRange = { min: 48, max: 70 };
const CLARINET: VoiceRange = { min: 55, max: 80 };
const TOP_WIND: VoiceRange = { min: 62, max: 84 };

const BREATH_POINTS = [4, 8, 12].map((bar) => bar * BEATS_PER_BAR);

/** A parallel third below, kept diatonic — the standard wind doubling. */
function thirdBelow(notes: GridNote[], ctx: ArrangeContext): GridNote[] {
  return notes.map((n) => ({
    ...n,
    pitch: diatonicShift(n.pitch, -2, ctx.analysis.tonicPc, ctx.analysis.mode),
    amp: n.amp * 0.9,
  }));
}

/**
 * Five soloists. The theme is handed around, at least one player is always
 * resting, the horn only bridges the harmony, and every line breathes.
 */
export function arrangeQuintet(ctx: ArrangeContext): ArrangementPart[] {
  const voiced = chorale(ctx, [BASSOON, HORN, CLARINET, TOP_WIND], "open");
  const bassLine = voiceLine(ctx.slots, voiced, 0);
  const hornLine = voiceLine(ctx.slots, voiced, 1);
  const clarinetLine = voiceLine(ctx.slots, voiced, 2);
  const topLine = voiceLine(ctx.slots, voiced, 3);

  const lead = fitLineToRange(ctx.lead, TOP_WIND.min, TOP_WIND.max);

  const flute: GridNote[] = [];
  const oboe: GridNote[] = [];
  const clarinet: GridNote[] = [];
  const horn: GridNote[] = [];
  const bassoon: GridNote[] = [];

  // Presentation: oboe states the idea, flute answers it. The horn waits.
  oboe.push(...inBars(lead, 0, 1));
  flute.push(...inBars(lead, 2, 3));
  clarinet.push(...offbeatLine(inBars(clarinetLine, 0, 3), 0.5, 0.62));
  bassoon.push(...pulseLine(inBars(bassLine, 0, 3), 2, 0.9, 0.5));

  // Continuation: two-beat fragments passed flute - clarinet - oboe - flute.
  const handoff: { target: GridNote[]; range: VoiceRange }[] = [
    { target: flute, range: TOP_WIND },
    { target: clarinet, range: CLARINET },
    { target: oboe, range: TOP_WIND },
    { target: flute, range: TOP_WIND },
  ];
  handoff.forEach(({ target, range }, i) => {
    const from = 4 * BEATS_PER_BAR + i * 2;
    const fragment = lead.filter(
      (n) => n.startBeat >= from - 1e-6 && n.startBeat < from + 2 - 1e-6,
    );
    target.push(...fitLineToRange(fragment, range.min, range.max));
  });
  // The liquidating descent belongs to the clarinet while the others breathe.
  clarinet.push(...fitLineToRange(inBars(lead, 6, 7), CLARINET.min, CLARINET.max));
  horn.push(...tieRepeats(inBars(hornLine, 4, 7)));
  bassoon.push(...walkingBass(inBars(bassLine, 4, 7), ctx.scale, 1));

  // Return: the bassoon sings the theme as a tenor soloist; the oboe rests.
  bassoon.push(...fitLineToRange(inBars(ctx.lead, 8, 9), 48, 67));
  flute.push(
    ...addPassingTones(tieRepeats(inBars(topLine, 8, 9)), ctx.scale).map((n) => ({
      ...n,
      amp: n.amp * 0.8,
    })),
  );
  const inner = slotSpan(ctx, voiced, 8, 9);
  clarinet.push(...brokenChord(inner.slots, inner.voiced, [2, 3], 0.5, [0, 1, 0, 1], 0.5));
  horn.push(...tieRepeats(inBars(hornLine, 8, 9)));

  // Climax: flute and oboe carry the theme in thirds.
  const climaxTune = inBars(lead, 10, 11);
  flute.push(...climaxTune);
  oboe.push(...fitLineToRange(thirdBelow(climaxTune, ctx), 58, 84));
  const climax = slotSpan(ctx, voiced, 10, 11);
  clarinet.push(...brokenChord(climax.slots, climax.voiced, [2, 1], 0.5, [0, 1, 0, 1], 0.6));
  horn.push(...pulseLine(inBars(hornLine, 10, 11), 2, 0.85, 0.85));
  bassoon.push(...walkingBass(inBars(bassLine, 10, 11), ctx.scale, 1));

  // Cadence: full quintet, contrasting articulations, unified on the last chord.
  const cadenceTune = inBars(lead, 12, 15);
  flute.push(...cadenceTune);
  oboe.push(...fitLineToRange(thirdBelow(inBars(lead, 12, 14), ctx), 58, 84));
  const strokes = pulseLine(inBars(clarinetLine, 12, 14), 1, 1, 0.7);
  clarinet.push(...followRhythm(strokes, clarinetLine, 0.72));
  horn.push(...pulseLine(inBars(hornLine, 12, 14), 2, 0.9, 0.9));
  bassoon.push(...pulseLine(inBars(bassLine, 12, 14), 1, 0.95, 0.72));
  for (const [part, line] of [
    [oboe, topLine],
    [clarinet, clarinetLine],
    [horn, hornLine],
    [bassoon, bassLine],
  ] as [GridNote[], GridNote[]][]) {
    part.push(...inBars(line, 15, 15));
  }

  const air = (notes: GridNote[], maxRun: number, rest: number) =>
    breathe(notes, maxRun, rest, BREATH_POINTS);

  return [
    makePart(
      ctx.style,
      "flute",
      toEvents(air(flute, 6, 0.5), ctx.spb, { gate: 0.9, attack: 0.045, release: 0.16 }),
    ),
    makePart(
      ctx.style,
      "oboe",
      toEvents(air(oboe, 6, 0.5), ctx.spb, { gate: 0.88, attack: 0.04, release: 0.14 }),
    ),
    makePart(
      ctx.style,
      "clarinet",
      toEvents(air(clarinet, 6, 0.5), ctx.spb, {
        gate: 0.84,
        attack: 0.04,
        release: 0.14,
      }),
    ),
    makePart(
      ctx.style,
      "horn",
      toEvents(air(horn, 8, 1), ctx.spb, { gate: 0.95, attack: 0.09, release: 0.3 }),
    ),
    makePart(
      ctx.style,
      "bassoon",
      toEvents(air(bassoon, 8, 0.5), ctx.spb, {
        gate: 0.82,
        attack: 0.05,
        release: 0.16,
      }),
    ),
  ];
}
