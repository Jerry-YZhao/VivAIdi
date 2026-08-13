export type Phase = "compose" | "conduct";

export type StyleId = "orchestra" | "chamber" | "windQuintet" | "choir";

/** Bowing/attack colour a part can switch to mid-performance. */
export type Articulation = "normal" | "pizz" | "tremolo";

export type NoteEvent = {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
  articulation?: Articulation;
  /** Envelope overrides in seconds — voices and winds need softer edges than mallets. */
  attack?: number;
  release?: number;
};

/** Conduct groups are declared per ensemble, so layer keys are ensemble-specific. */
export type LayerState = Record<string, boolean>;
