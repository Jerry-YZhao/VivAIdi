export type Phase = "compose" | "conduct";

export type StyleId = "chamber" | "orchestra" | "cinematic" | "jazz";

export type NoteEvent = {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
};

export type SectionId = "lead" | "harmony" | "body" | "bass";

export const SECTIONS: { id: SectionId; label: string; fingers: number }[] = [
  { id: "lead", label: "Lead", fingers: 1 },
  { id: "harmony", label: "Harmony", fingers: 2 },
  { id: "body", label: "Body", fingers: 3 },
  { id: "bass", label: "Bass", fingers: 4 },
];

export type LayerState = Record<SectionId, boolean>;

export const defaultLayers = (): LayerState => ({
  lead: true,
  harmony: false,
  body: false,
  bass: false,
});
