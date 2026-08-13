import type { Arrangement, ArrangementPart } from "./arrangement";
import { ARRANGERS } from "./arrangers";
import { buildContext, type ArrangeContext } from "./arrangers/context";
import { BARS, BEATS_PER_BAR } from "./music/form";
import { groupsOf, styleById } from "./styles";
import type { NoteEvent, StyleId } from "./types";

export type { Arrangement, ArrangementPart } from "./arrangement";
export { partsDuration } from "./arrangement";

/** Keep every part inside the loop so nothing bleeds across the repeat. */
function clampToLoop(parts: ArrangementPart[], loopSeconds: number): ArrangementPart[] {
  return parts.map((part) => ({
    ...part,
    notes: part.notes
      .filter((note) => note.startTimeSeconds < loopSeconds - 0.02)
      .map((note) => ({
        ...note,
        durationSeconds: Math.max(
          0.07,
          Math.min(note.durationSeconds, loopSeconds - note.startTimeSeconds),
        ),
      })),
  }));
}

/**
 * Analyse the hum, plan a Classical sentence around it, then hand the shared
 * skeleton to the selected ensemble's arranger.
 */
export function composeArrangement(
  hummed: NoteEvent[],
  styleId: StyleId,
): Arrangement {
  const style = styleById(styleId);
  const ctx: ArrangeContext = buildContext(hummed, style);
  const loopSeconds = BARS * BEATS_PER_BAR * ctx.spb;
  const parts = clampToLoop(ARRANGERS[style.id](ctx), loopSeconds).filter(
    (part) => part.notes.length > 0,
  );

  return {
    style: style.id,
    label: style.label,
    keyLabel: ctx.keyLabel,
    qpm: ctx.analysis.qpm,
    bars: BARS,
    beatsPerBar: BEATS_PER_BAR,
    durationSeconds: loopSeconds,
    reverbSeconds: style.reverbSeconds,
    wetMix: style.wetMix,
    groups: groupsOf(style).filter((group) =>
      parts.some((part) => part.groupId === group.id),
    ),
    parts,
  };
}