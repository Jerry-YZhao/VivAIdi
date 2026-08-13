"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/session";
import type { ConductGesture } from "@/lib/gestures";
import {
  getOrchestraPlayer,
  type OrchestraPlayer,
} from "@/lib/orchestra-player";
import { styleById } from "@/lib/styles";
import { Stage, ProgrammeCaption } from "./Auditorium";
import { PodiumCamera } from "./PodiumCamera";
import { SectionMixer } from "./SectionMixer";

export function PhaseConduct() {
  const {
    parts,
    layers,
    setLayers,
    dynamics,
    setDynamics,
    setPhase,
    setStatus,
    style,
  } = useStudio();

  const orchestraRef = useRef<OrchestraPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [gestureHint, setGestureHint] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    orchestraRef.current = getOrchestraPlayer();
  }, []);

  useEffect(() => {
    orchestraRef.current?.setLayers(layers);
  }, [layers]);

  useEffect(() => {
    orchestraRef.current?.setDynamics(dynamics);
  }, [dynamics]);

  useEffect(() => {
    if (!parts) return;
    const orchestra = getOrchestraPlayer();
    orchestraRef.current = orchestra;
    let cancelled = false;

    const start = async () => {
      if (orchestra.loadedStyle() !== style) {
        setReady(false);
        setStatus("Tuning instruments…");
        await orchestra.load(style, setStatus);
        await orchestra.warmup();
      }
      if (cancelled) return;
      orchestra.setLayers(layers);
      orchestra.setDynamics(dynamics);
      if (!orchestra.isPlaying()) {
        await orchestra.play(parts, true);
      }
      if (cancelled) return;
      setPlaying(true);
      setReady(true);
      setStatus(null);
    };

    void start().catch((err) => {
      console.error(err);
      if (!cancelled) {
        setReady(false);
        setStatus("The performance could not begin.");
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, style]);

  const onGesture = useCallback(
    (g: ConductGesture) => {
      if (!ready) return;
      const orchestra = orchestraRef.current;
      setLayers(g.layers);
      setDynamics(g.dynamics);
      setGestureHint(g.hint);
      orchestra?.setPan(g.pan);
      orchestra?.setCut(g.cut);
    },
    [ready, setDynamics, setLayers],
  );

  const togglePlay = async () => {
    const orchestra = orchestraRef.current;
    if (!orchestra || !parts || !ready) return;
    if (playing) {
      orchestra.stop();
      setPlaying(false);
    } else {
      await orchestra.play(parts, true);
      setPlaying(true);
    }
  };

  if (!parts) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <button
          type="button"
          onClick={() => setPhase("compose")}
          className="font-display text-lg font-medium text-brass/80 hover:text-brass"
        >
          Return to compose a theme
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
        <MotionPulse />
        <ProgrammeCaption>Ensemble in position</ProgrammeCaption>
      </div>
    );
  }

  const ensemble = styleById(style).label;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stage — full viewport performance */}
      <Stage className="relative min-h-0 flex-1">
        <PodiumCamera onGesture={onGesture} />

        {/* Floating programme card — top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-ink/70 to-transparent px-6 py-5 text-center">
          <p className="hall-signage text-xs opacity-70">Now performing</p>
          <p className="font-display text-xl font-semibold text-brass md:text-2xl">
            {ensemble}
          </p>
        </div>

        {/* Gesture whisper — bottom center */}
        {gestureHint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 text-center">
            <p className="hall-signage text-xs text-ivory/60">{gestureHint}</p>
          </div>
        )}

        {/* Orchestra section lights — bottom */}
        <div className="stage-controls absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/90 via-ink/50 to-transparent px-6 pb-5 pt-16">
          <SectionMixer
            layers={layers}
            onToggle={(id) => setLayers({ ...layers, [id]: !layers[id] })}
          />

          <div className="mt-5 flex items-center justify-center gap-8">
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="text-xs tracking-[0.25em] text-ivory-muted uppercase transition hover:text-ivory"
            >
              {playing ? "Rest" : "Resume"}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-[10px] tracking-widest text-ivory-muted/50 uppercase">
                Forte
              </span>
              <div className="h-1 w-24 overflow-hidden bg-ivory/10">
                <div
                  className="h-full bg-brass/70 transition-all duration-300"
                  style={{ width: `${dynamics * 100}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="text-xs tracking-[0.25em] text-ivory-muted/50 uppercase transition hover:text-ivory-muted"
            >
              ?
            </button>

            <button
              type="button"
              onClick={() => {
                orchestraRef.current?.stop();
                setPhase("compose");
              }}
              className="text-xs tracking-[0.25em] text-ivory-muted/50 uppercase transition hover:text-ivory-muted"
            >
              Exit
            </button>
          </div>
        </div>
      </Stage>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-8 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div className="max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl font-semibold text-brass">
              Conducting
            </p>
            <div className="hall-signage mt-6 space-y-3 text-xs leading-relaxed normal-case">
              <p>Spread your fingers to bring in sections</p>
              <p>Raise your hand for louder dynamics</p>
              <p>Move left for strings, right for brass</p>
              <p>Fist to cut the ensemble</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-8 text-xs tracking-widest text-brass uppercase"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MotionPulse() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1 w-1 rounded-full bg-brass/50"
          style={{
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
