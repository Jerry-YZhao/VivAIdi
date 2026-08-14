/**
 * A handful of Italian markings, all taken as a ratio of the tempo we heard.
 * The singer's own pulse sits in the middle as a tempo.
 */
export const TEMPO_MARKS = [
  { id: "largo", label: "Largo", ratio: 0.62 },
  { id: "adagio", label: "Adagio", ratio: 0.8 },
  { id: "aTempo", label: "Your tempo", ratio: 1 },
  { id: "allegro", label: "Allegro", ratio: 1.22 },
  { id: "presto", label: "Presto", ratio: 1.5 },
] as const;

export type TempoMarkId = (typeof TEMPO_MARKS)[number]["id"];

export const A_TEMPO_INDEX = TEMPO_MARKS.findIndex((m) => m.id === "aTempo");

export function tempoMarkAt(index: number) {
  const clamped = Math.min(TEMPO_MARKS.length - 1, Math.max(0, index));
  return TEMPO_MARKS[clamped];
}

export function stepTempoIndex(index: number, delta: number): number {
  return Math.min(
    TEMPO_MARKS.length - 1,
    Math.max(0, index + delta),
  );
}

/** Quarter-notes per minute for a mark, folded into a singable walking range. */
export function markedQpm(originalQpm: number, index: number): number {
  const qpm = originalQpm * tempoMarkAt(index).ratio;
  return Math.min(176, Math.max(48, Math.round(qpm)));
}
