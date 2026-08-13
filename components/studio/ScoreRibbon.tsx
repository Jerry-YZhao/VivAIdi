"use client";

import { motion } from "framer-motion";
import type { NoteEvent } from "@/lib/types";

export type TracePoint = { t: number; midi: number };

export function ScoreRibbon({
  notes,
  liveNote,
  recording,
  trace = [],
}: {
  notes: NoteEvent[];
  liveNote: string | null;
  recording: boolean;
  trace?: TracePoint[];
}) {
  const pitches = [
    ...notes.map((n) => n.pitchMidi),
    ...trace.map((p) => p.midi),
  ];
  const maxPitch = pitches.length ? Math.max(...pitches) + 2 : 74;
  const minPitch = pitches.length ? Math.min(...pitches) - 2 : 58;
  const span = Math.max(12, maxPitch - minPitch);

  const traceStart = trace.length ? trace[0].t : 0;
  const traceEnd = trace.length ? trace[trace.length - 1].t : 0;
  const end = recording
    ? Math.max(4, traceEnd - traceStart)
    : Math.max(
        1,
        ...notes.map((n) => n.startTimeSeconds + n.durationSeconds),
      );

  const y = (midi: number) => ((maxPitch - midi) / span) * 100;

  const tracePath = trace
    .map((p, i) => {
      const x = ((p.t - traceStart) / end) * 100;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y(p.midi).toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="relative w-full px-2 py-8">
      {/* Staff lines */}
      {[20, 35, 50, 65, 80].map((top) => (
        <div
          key={top}
          className="absolute inset-x-2 h-px bg-ivory/[0.06]"
          style={{ top: `${top}%` }}
        />
      ))}

      <div className="relative h-28">
        {recording && trace.length > 1 && (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path
              d={tracePath}
              fill="none"
              stroke="rgba(201, 169, 98, 0.7)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {!recording &&
          notes.map((n, i) => {
            const left = (n.startTimeSeconds / end) * 100;
            const width = Math.max(0.6, (n.durationSeconds / end) * 100);
            return (
              <motion.div
                key={`${n.startTimeSeconds}-${n.pitchMidi}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                className="absolute h-1.5 rounded-full bg-brass/80"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  top: `${y(n.pitchMidi)}%`,
                }}
              />
            );
          })}

        {recording && (
          <motion.div
            className="absolute top-1/2 right-0 h-2 w-2 -translate-y-1/2 rounded-full bg-brass"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-ivory/[0.06] pt-4">
        <p className="hall-signage text-xs">
          {recording
            ? "Listening…"
            : notes.length
              ? `${notes.length} tones heard`
              : "Your melody"}
        </p>
        {liveNote && (
          <p className="font-display text-2xl font-semibold text-brass tabular-nums">
            {liveNote}
          </p>
        )}
      </div>
    </div>
  );
}
