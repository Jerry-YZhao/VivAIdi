"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStudio } from "@/lib/session";
import { autoCorrelate, noteFromPitch, noteLabel } from "@/lib/pitch";
import { analyzeHum, blobToAudioBuffer } from "@/lib/basic-pitch";
import { interpretTrack } from "@/lib/melody";
import { type PitchTrack } from "@/lib/pitch-track";
import { playMelody } from "@/lib/melody-preview";
import { composeArrangement } from "@/lib/composer";
import { EXAMPLES, type ExampleId } from "@/lib/examples";
import { defaultLayers } from "@/lib/gestures";
import { prewarmHandTracker } from "@/lib/hand-tracker";
import { estimateQpm } from "@/lib/music/theme";
import {
  A_TEMPO_INDEX,
  markedQpm,
} from "@/lib/music/tempo";
import { getOrchestraPlayer } from "@/lib/orchestra-player";
import { ENSEMBLES } from "@/lib/styles";
import { ProgrammeCaption } from "./Auditorium";
import { ScoreRibbon, type TracePoint } from "./ScoreRibbon";
import { ThemeMetronome } from "./ThemeMetronome";

const MAX_TRACE = 400;

/**
 * Voice processing is tuned for speech: gating chews the tails off held notes
 * and gain riding flattens the dynamics the transcriber reads as phrasing.
 * Browsers that reject these constraints fall back to their defaults.
 */
const HUM_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: HUM_AUDIO });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

export function PhaseCompose() {
  const {
    setHum,
    setTrack,
    setNotes,
    setLiveNote,
    setPhase,
    setStatus,
    setArrangement,
    setLayers,
    style,
    setStyle,
    notes,
    liveNote,
    humBlob,
    generating,
    setGenerating,
  } = useStudio();

  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [trace, setTrace] = useState<TracePoint[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [exampleId, setExampleId] = useState<ExampleId | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [originalQpm, setOriginalQpm] = useState(96);
  const [tempoIndex, setTempoIndex] = useState(A_TEMPO_INDEX);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
  }, []);

  useEffect(
    () => () => {
      stopTracks();
      stopPreviewRef.current?.();
    },
    [stopTracks],
  );

  const applyTrack = useCallback(
    (pitchTrack: PitchTrack) => {
      const melody = interpretTrack(pitchTrack, "balanced");
      setNotes(melody.notes);
      setSelectedIndex(null);
      setOriginalQpm(estimateQpm(melody.notes));
      setTempoIndex(A_TEMPO_INDEX);
      setStatus(
        melody.notes.length
          ? `${melody.notes.length} tones captured`
          : "Sing a little louder — we could not hear a clear pitch.",
      );
    },
    [setNotes, setStatus],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setStatus(null);
    setTrace([]);
    setExampleId(null);
    setSelectedIndex(null);
    try {
      const stream = await openMicrophone();
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const t0 = audioCtx.currentTime;
      const recent: number[] = [];
      let ema = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const hz = autoCorrelate(buf, audioCtx.sampleRate);
        if (hz > 0) {
          const raw = noteFromPitch(hz);
          recent.push(raw);
          if (recent.length > 7) recent.shift();
          const sorted = [...recent].sort((a, b) => a - b);
          ema = ema > 0 ? ema * 0.7 + sorted[Math.floor(sorted.length / 2)] * 0.3 : raw;
          const midi = Math.round(ema);
          const { name, octave } = noteLabel(midi);
          setLiveNote(`${name}${octave}`);
          setTrace((prev) => {
            const next = [...prev, { t: audioCtx.currentTime - t0, midi: ema }];
            return next.length > MAX_TRACE ? next.slice(-MAX_TRACE) : next;
          });
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.start(100);
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError("The hall needs your microphone to hear you sing.");
    }
  }, [setLiveNote, setStatus]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRef.current;
    if (!recorder) return;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    stopTracks();
    setRecording(false);
    setLiveNote(null);

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || "audio/webm",
    });
    setHum(blob);
    setAnalyzing(true);
    setStatus("Listening to your melody…");

    try {
      const buffer = await blobToAudioBuffer(blob);
      const pitchTrack = await analyzeHum(buffer, (p) => {
        setStatus(`Listening… ${Math.round(p * 100)}%`);
      });
      setTrack(pitchTrack);
      applyTrack(pitchTrack);
    } catch {
      setTrack(null);
      setNotes([]);
      setError("We could not hear that clearly. Please sing again.");
      setStatus(null);
    } finally {
      setAnalyzing(false);
    }
  }, [applyTrack, setHum, setLiveNote, setNotes, setStatus, setTrack, stopTracks]);

  const chooseExample = (id: ExampleId) => {
    const example = EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    stopPreviewRef.current?.();
    stopPreviewRef.current = null;
    setPreviewing(false);
    setError(null);
    setExampleId(id);
    setHum(null);
    setTrack(null);
    setNotes(example.notes);
    setSelectedIndex(null);
    setOriginalQpm(estimateQpm(example.notes));
    setTempoIndex(A_TEMPO_INDEX);
    setLiveNote(null);
    setTrace([]);
    setStatus(null);
  };

  const togglePreview = () => {
    if (previewing) {
      stopPreviewRef.current?.();
      stopPreviewRef.current = null;
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    const chosen = markedQpm(originalQpm, tempoIndex);
    stopPreviewRef.current = playMelody(
      notes,
      () => {
        stopPreviewRef.current = null;
        setPreviewing(false);
      },
      { rate: originalQpm / chosen },
    );
  };

  const takePodium = async () => {
    stopPreviewRef.current?.();
    setPreviewing(false);
    setError(null);
    setGenerating(true);
    try {
      setStatus("The musicians are studying your theme…");
      const arrangement = composeArrangement(notes, style, {
        gridQpm: originalQpm,
        qpm: markedQpm(originalQpm, tempoIndex),
      });
      setArrangement(arrangement);

      const orchestra = getOrchestraPlayer();
      await orchestra.load(style, setStatus);
      setStatus("The hall falls silent…");
      await orchestra.warmup();
      const opening = defaultLayers(arrangement.groups);
      setLayers(opening);
      orchestra.setLayers(opening);
      orchestra.setDynamics(0.62);
      await orchestra.play(arrangement, true);

      setStatus(null);
      setPhase("conduct");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "The ensemble could not begin.");
      setStatus(null);
    } finally {
      setGenerating(false);
    }
  };

  // Seat the players and fetch the hand model while the theme is still being
  // settled, so taking the podium never competes with playback.
  useEffect(() => {
    if (!notes.length || recording || analyzing) return;
    void getOrchestraPlayer().load(style).catch(() => {});
    prewarmHandTracker();
  }, [analyzing, notes.length, recording, style]);

  const hasTheme = notes.length > 0;
  const busy = analyzing || generating;

  return (
    <div className="flex flex-col items-center pt-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-10 text-center"
      >
        <h2 className="font-display text-4xl font-semibold tracking-tight text-ivory md:text-5xl">
          {recording
            ? "Listening"
            : exampleId
              ? "A known theme"
              : hasTheme
                ? "Your theme"
                : "Before you begin"}
        </h2>
        {!recording && !hasTheme && (
          <p className="hall-signage mt-3 text-xs">
            Hum a melody — the orchestra will learn it
          </p>
        )}
      </motion.div>

      <ScoreRibbon
        notes={notes}
        liveNote={liveNote}
        recording={recording}
        trace={trace}
        editable={hasTheme && !recording && !analyzing}
        selectedIndex={selectedIndex}
        onSelect={(index) => {
          setSelectedIndex(index);
          if (index === null || !notes[index]) {
            setLiveNote(null);
            return;
          }
          const { name, octave } = noteLabel(notes[index].pitchMidi);
          setLiveNote(`${name}${octave}`);
        }}
        onChange={(next) => {
          stopPreviewRef.current?.();
          stopPreviewRef.current = null;
          setPreviewing(false);
          setNotes(next);
          const current = selectedIndex !== null ? next[selectedIndex] : null;
          if (current) {
            const { name, octave } = noteLabel(current.pitchMidi);
            setLiveNote(`${name}${octave}`);
          }
        }}
        preview={
          hasTheme && !recording && !analyzing
            ? { playing: previewing, onToggle: togglePreview }
            : undefined
        }
      />

      {hasTheme && !recording && !analyzing && (
        <ThemeMetronome
          originalQpm={originalQpm}
          index={tempoIndex}
          onIndex={(next) => {
            stopPreviewRef.current?.();
            stopPreviewRef.current = null;
            setPreviewing(false);
            setTempoIndex(next);
          }}
        />
      )}

      <div className="mt-10 flex flex-col items-center gap-6">
        {!recording ? (
          <button
            type="button"
            disabled={busy}
            onClick={startRecording}
            className="group relative flex h-20 w-20 items-center justify-center rounded-full border border-brass/30 transition hover:border-brass/60 disabled:opacity-40"
          >
            <span className="absolute inset-2 rounded-full bg-brass/10 transition group-hover:bg-brass/20" />
            <span className="font-display text-sm font-medium text-brass">
              {busy ? "…" : humBlob ? "Again" : "Sing"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="relative flex h-20 w-20 items-center justify-center rounded-full border border-brass/50"
          >
            <motion.span
              className="absolute inset-0 rounded-full border border-brass/30"
              animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="font-display text-xs font-medium text-brass">{elapsed}s</span>
          </button>
        )}

        {error && (
          <p className="text-center text-sm text-ivory-muted">{error}</p>
        )}
      </div>

      {!recording && !analyzing && (
        <div className="mt-14 w-full text-center">
          <p className="hall-signage mb-4 text-xs">
            {hasTheme ? "Known theme" : "Or a known theme"}
          </p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                disabled={busy}
                onClick={() => chooseExample(example.id)}
                className={`font-display text-lg font-medium transition disabled:opacity-40 ${
                  exampleId === example.id
                    ? "text-brass"
                    : "text-ivory-muted/50 hover:text-ivory-muted"
                }`}
              >
                {example.label}
              </button>
            ))}
          </div>
          {exampleId && (
            <p className="hall-signage mt-4 text-xs normal-case text-ivory-muted/60">
              {EXAMPLES.find((example) => example.id === exampleId)?.blurb}
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {hasTheme && !recording && !analyzing && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-14 w-full space-y-10"
          >
            <div className="text-center">
              <p className="hall-signage mb-4 text-xs">Ensemble</p>
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
                {ENSEMBLES.map((ens) => (
                  <button
                    key={ens.id}
                    type="button"
                    onClick={() => setStyle(ens.id)}
                    className={`font-display text-lg font-medium transition ${
                      style === ens.id
                        ? "text-brass"
                        : "text-ivory-muted/50 hover:text-ivory-muted"
                    }`}
                  >
                    {ens.label}
                  </button>
                ))}
              </div>
              <p className="hall-signage mt-4 text-xs normal-case text-ivory-muted/60">
                {ENSEMBLES.find((ens) => ens.id === style)?.blurb}
              </p>
            </div>

            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => void takePodium()}
                disabled={generating}
                className="border border-brass/50 px-12 py-3 font-display text-lg font-semibold text-brass transition hover:border-brass hover:bg-brass/5 disabled:opacity-40"
              >
                {generating ? "Preparing the ensemble…" : "Take the podium"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
          <div className="text-center">
            <motion.div
              className="mx-auto mb-6 h-px w-24 bg-brass/40"
              animate={{ scaleX: [0.5, 1, 0.5], opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <ProgrammeCaption>Taking the stage</ProgrammeCaption>
          </div>
        </div>
      )}
    </div>
  );
}
