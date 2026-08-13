"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Arrangement } from "./arrangement";
import { defaultLayers } from "./gestures";
import { disposeOrchestraPlayer } from "./orchestra-player";
import type { PitchTrack, Sensitivity } from "./pitch-track";
import { styleById } from "./styles";
import type { LayerState, NoteEvent, Phase, StyleId } from "./types";

type StudioState = {
  phase: Phase;
  humBlob: Blob | null;
  track: PitchTrack | null;
  sensitivity: Sensitivity;
  notes: NoteEvent[];
  liveNote: string | null;
  style: StyleId;
  arrangement: Arrangement | null;
  layers: LayerState;
  dynamics: number;
  status: string | null;
  generating: boolean;
};

type StudioApi = StudioState & {
  setPhase: (p: Phase) => void;
  setHum: (blob: Blob | null) => void;
  setTrack: (track: PitchTrack | null) => void;
  setSensitivity: (s: Sensitivity) => void;
  setNotes: (notes: NoteEvent[]) => void;
  setLiveNote: (note: string | null) => void;
  setStyle: (style: StyleId) => void;
  setArrangement: (arrangement: Arrangement | null) => void;
  setLayers: (layers: LayerState) => void;
  setDynamics: (v: number) => void;
  setStatus: (s: string | null) => void;
  setGenerating: (v: boolean) => void;
  resetPiece: () => void;
};

const StudioContext = createContext<StudioApi | null>(null);

const INITIAL_STYLE: StyleId = "orchestra";

export function StudioProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("compose");
  const [humBlob, setHum] = useState<Blob | null>(null);
  const [track, setTrack] = useState<PitchTrack | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("balanced");
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [style, setStyleId] = useState<StyleId>(INITIAL_STYLE);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [layers, setLayers] = useState<LayerState>(() =>
    defaultLayers(styleById(INITIAL_STYLE).groups),
  );
  const [dynamics, setDynamics] = useState(0.62);
  const [status, setStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Each ensemble has its own conduct groups, so the mixer resets with the style.
  const setStyle = useCallback((next: StyleId) => {
    setStyleId(next);
    setLayers(defaultLayers(styleById(next).groups));
  }, []);

  const resetPiece = useCallback(() => {
    setPhase("compose");
    setHum(null);
    setTrack(null);
    setNotes([]);
    setLiveNote(null);
    setArrangement(null);
    setLayers(defaultLayers(styleById(INITIAL_STYLE).groups));
    setStyleId(INITIAL_STYLE);
    setDynamics(0.62);
    setStatus(null);
    setGenerating(false);
    disposeOrchestraPlayer();
  }, []);

  const value = useMemo<StudioApi>(
    () => ({
      phase,
      humBlob,
      track,
      sensitivity,
      notes,
      liveNote,
      style,
      arrangement,
      layers,
      dynamics,
      status,
      generating,
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
      arrangement,
      layers,
      dynamics,
      status,
      generating,
      setStyle,
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
