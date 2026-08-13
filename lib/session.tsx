"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ArrangementParts } from "./composer";
import { disposeOrchestraPlayer } from "./orchestra-player";
import type { PitchTrack, Sensitivity } from "./pitch-track";
import {
  defaultLayers,
  type LayerState,
  type NoteEvent,
  type Phase,
  type StyleId,
} from "./types";

export type GenerationSource = "ensemble";

type StudioState = {
  phase: Phase;
  humBlob: Blob | null;
  track: PitchTrack | null;
  sensitivity: Sensitivity;
  notes: NoteEvent[];
  liveNote: string | null;
  style: StyleId;
  generatedUrl: string | null;
  generatedBuffer: AudioBuffer | null;
  parts: ArrangementParts | null;
  layers: LayerState;
  dynamics: number;
  status: string | null;
  generating: boolean;
  source: GenerationSource | null;
};

type StudioApi = StudioState & {
  setPhase: (p: Phase) => void;
  setHum: (blob: Blob | null) => void;
  setTrack: (track: PitchTrack | null) => void;
  setSensitivity: (s: Sensitivity) => void;
  setNotes: (notes: NoteEvent[]) => void;
  setLiveNote: (note: string | null) => void;
  setStyle: (style: StyleId) => void;
  setArrangement: (input: {
    source: GenerationSource;
    url?: string | null;
    buffer?: AudioBuffer | null;
    parts?: ArrangementParts | null;
  }) => void;
  setLayers: (layers: LayerState) => void;
  setDynamics: (v: number) => void;
  setStatus: (s: string | null) => void;
  setGenerating: (v: boolean) => void;
  resetPiece: () => void;
};

const StudioContext = createContext<StudioApi | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("compose");
  const [humBlob, setHum] = useState<Blob | null>(null);
  const [track, setTrack] = useState<PitchTrack | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("balanced");
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [style, setStyle] = useState<StyleId>("chamber");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(
    null,
  );
  const [parts, setParts] = useState<ArrangementParts | null>(null);
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [dynamics, setDynamics] = useState(0.62);
  const [status, setStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [source, setSource] = useState<GenerationSource | null>(null);

  const setArrangement = useCallback(
    (input: {
      source: GenerationSource;
      url?: string | null;
      buffer?: AudioBuffer | null;
      parts?: ArrangementParts | null;
    }) => {
      setGeneratedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return input.url ?? null;
      });
      setGeneratedBuffer(input.buffer ?? null);
      setParts(input.parts ?? null);
      setSource(input.source);
    },
    [],
  );

  const resetPiece = useCallback(() => {
    setPhase("compose");
    setHum(null);
    setTrack(null);
    setNotes([]);
    setLiveNote(null);
    setArrangement({ source: "ensemble", url: null, buffer: null, parts: null });
    setSource(null);
    setLayers(defaultLayers());
    setDynamics(0.62);
    setStatus(null);
    setGenerating(false);
    disposeOrchestraPlayer();
  }, [setArrangement]);

  const value = useMemo<StudioApi>(
    () => ({
      phase,
      humBlob,
      track,
      sensitivity,
      notes,
      liveNote,
      style,
      generatedUrl,
      generatedBuffer,
      parts,
      layers,
      dynamics,
      status,
      generating,
      source,
      setPhase,
      setHum,
      setTrack,
      setSensitivity,
      setNotes,
      setLiveNote,
      setStyle,
      setArrangement,
      setLayers,
      setDynamics,
      setStatus,
      setGenerating,
      resetPiece,
    }),
    [
      phase,
      humBlob,
      track,
      sensitivity,
      notes,
      liveNote,
      style,
      generatedUrl,
      generatedBuffer,
      parts,
      layers,
      dynamics,
      status,
      generating,
      source,
      setArrangement,
      resetPiece,
    ],
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}
