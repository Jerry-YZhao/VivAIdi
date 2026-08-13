import type { ConductGroupSpec, PartSpec } from "./styles";
import type { NoteEvent, StyleId } from "./types";

/** A single player's written part, already routed and balanced. */
export type ArrangementPart = PartSpec & {
  notes: NoteEvent[];
};

export type Arrangement = {
  style: StyleId;
  label: string;
  keyLabel: string;
  qpm: number;
  bars: number;
  beatsPerBar: number;
  durationSeconds: number;
  reverbSeconds: number;
  wetMix: number;
  groups: ConductGroupSpec[];
  parts: ArrangementPart[];
};

export function partsDuration(arrangement: Arrangement): number {
  return arrangement.durationSeconds;
}

export function arrangementNoteCount(arrangement: Arrangement): number {
  return arrangement.parts.reduce((sum, part) => sum + part.notes.length, 0);
}

export function partById(
  arrangement: Arrangement,
  id: string,
): ArrangementPart | undefined {
  return arrangement.parts.find((p) => p.id === id);
}

export function partsOfGroup(
  arrangement: Arrangement,
  groupId: string,
): ArrangementPart[] {
  return arrangement.parts.filter((p) => p.groupId === groupId);
}
