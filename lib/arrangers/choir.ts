import type { ArrangementPart } from "../arrangement";
import { BEATS_PER_BAR } from "../music/form";
import {
  addPassingTones,
  addSuspensions,
  breathe,
  echoLine,
  followRhythm,
  inBars,
  pulseLine,
  tieRepeats,
  toEvents,
  voiceLine,
} from "../music/figuration";
import { fitLineToRange } from "../music/lead";
import type { GridNote } from "../music/theme";
import type { VoiceRange } from "../music/voicing";
import { chorale, makePart, type ArrangeContext } from "./context";

const BASS: VoiceRange = { min: 40, max: 62 };
const TENOR: VoiceRange = { min: 48, max: 69 };
const ALTO: VoiceRange = { min: 55, max: 74 };
const SOPRANO: VoiceRange = { min: 60, max: 79 };

/**
 * A lift after every two-bar idea, plus the phrase joints. Sustaining a
 * wordless vowel for four bars is beyond any real singer.
 */
const BREATH_POINTS = [2, 4, 6, 8, 10, 12, 14].map((bar) => bar * BEATS_PER_BAR);

const VOICE_ATTACK = 0.14;
const VOICE_RELEASE = 0.42;

/**
 * Wordless SATB. The hum stays in the soprano, the lower voices move stepwise
 * with suspensions and passing tones for life, and the cadence is homorhythmic.
 */
export function arrangeChoir(ctx: ArrangeContext): ArrangementPart[] {
  const voiced = chorale(ctx, [BASS, TENOR, ALTO, SOPRANO]);
  const bassLine = voiceLine(ctx.slots, voiced, 0);
  const tenorLine = addSuspensions(
    voiceLine(ctx.slots, voiced, 1),
    ctx.chords,
    ctx.slots,
  );
  const altoLine = addSuspensions(
    voiceLine(ctx.slots, voiced, 2),
    ctx.chords,
    ctx.slots,
    3,
  );

  const soprano = fitLineToRange(ctx.lead, SOPRANO.min, SOPRANO.max);
  const alto: GridNote[] = [];
  const tenor: GridNote[] = [];
  const bass: GridNote[] = [];

  // Presentation and return: sustained harmony under the tune.
  for (const [from, to] of [
    [0, 3],
    [8, 11],
  ] as [number, number][]) {
    alto.push(...addPassingTones(tieRepeats(inBars(altoLine, from, to)), ctx.scale));
    tenor.push(...tieRepeats(inBars(tenorLine, from, to)));
    const moving = from === 8;
    bass.push(
      ...(moving
        ? addPassingTones(pulseLine(inBars(bassLine, from, to), 2, 0.95), ctx.scale)
        : tieRepeats(inBars(bassLine, from, to))),
    );
  }

  // Continuation: the tenor answers the soprano's fragment two beats later.
  const fragment = inBars(soprano, 4, 5);
  tenor.push(
    ...inBars(echoLine(fragment, 2, ctx.chords, [TENOR.min, TENOR.max], 0.72), 4, 6),
  );
  tenor.push(...tieRepeats(inBars(tenorLine, 7, 7)));
  alto.push(...addPassingTones(tieRepeats(inBars(altoLine, 4, 7)), ctx.scale));
  bass.push(...tieRepeats(inBars(bassLine, 4, 7)));

  // Cadential: all four voices in rhythmic unison, a chord per beat.
  const strokes = pulseLine(inBars(altoLine, 12, 14), 1, 1, 0.96);
  alto.push(...followRhythm(strokes, altoLine, 0.9));
  tenor.push(...followRhythm(strokes, tenorLine, 0.9));
  bass.push(...followRhythm(strokes, bassLine, 0.95));
  alto.push(...inBars(altoLine, 15, 15));
  tenor.push(...inBars(tenorLine, 15, 15));
  bass.push(...inBars(bassLine, 15, 15));

  const voice = (notes: GridNote[], maxRun: number) =>
    toEvents(breathe(notes, maxRun, 0.75, BREATH_POINTS), ctx.spb, {
      gate: 0.97,
      attack: VOICE_ATTACK,
      release: VOICE_RELEASE,
    });

  return [
    makePart(ctx.style, "soprano", voice(soprano, 8)),
    makePart(ctx.style, "alto", voice(alto, 8)),
    makePart(ctx.style, "tenor", voice(tenor, 8)),
    makePart(ctx.style, "bass", voice(bass, 8)),
  ];
}
