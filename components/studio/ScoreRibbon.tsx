"use client";

import { useRef, useState, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { resizeLeft, resizeRight, setPitch } from "@/lib/melody-edit";
import type { NoteEvent } from "@/lib/types";

export type TracePoint = { t: number; midi: number };

const HANDLE_PX = 8;

type Drag =
  | {
      kind: "pitch";
      index: number;
      originY: number;
      originPitch: number;
      span: number;
    }
  | {
      kind: "left" | "right";
      index: number;
      originX: number;
      originStart: number;
      originEnd: number;
      viewEnd: number;
    };

export function ScoreRibbon({
  notes,
  liveNote,
  recording,
  trace = [],
  editable = false,
  selectedIndex = null,
  onSelect,
  onChange,
  preview,
}: {
  notes: NoteEvent[];
  liveNote: string | null;
  recording: boolean;
  trace?: TracePoint[];
  editable?: boolean;
  selectedIndex?: number | null;
  onSelect?: (index: number | null) => void;
  onChange?: (notes: NoteEvent[]) => void;
  preview?: { playing: boolean; onToggle: () => void };
}) {
  const staffRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [cursor, setCursor] = useState("default");

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

  const hitIndex = (clientX: number, clientY: number): number | null => {
    const staff = staffRef.current;
    if (!staff || !notes.length) return null;
    const rect = staff.getBoundingClientRect();
    const x = clientX - rect.left;
    const yPx = clientY - rect.top;
    let best = -1;
    let bestDist = 18;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const left = (n.startTimeSeconds / end) * rect.width;
      const width = Math.max(6, (n.durationSeconds / end) * rect.width);
      if (x < left - 4 || x > left + width + 4) continue;
      const midY = (y(n.pitchMidi) / 100) * rect.height;
      const dist = Math.abs(yPx - midY);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  };

  const handleKind = (
    index: number,
    clientX: number,
  ): Drag["kind"] => {
    const staff = staffRef.current;
    if (!staff) return "pitch";
    const rect = staff.getBoundingClientRect();
    const n = notes[index];
    const left = (n.startTimeSeconds / end) * rect.width;
    const width = Math.max(6, (n.durationSeconds / end) * rect.width);
    const local = clientX - rect.left - left;
    const handle = Math.min(HANDLE_PX, width * 0.35);
    if (local <= handle) return "left";
    if (local >= width - handle) return "right";
    return "pitch";
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || recording) return;
    const index = hitIndex(event.clientX, event.clientY);
    if (index === null) {
      onSelect?.(null);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect?.(index);
    const kind = handleKind(index, event.clientX);
    const n = notes[index];
    if (kind === "pitch") {
      dragRef.current = {
        kind: "pitch",
        index,
        originY: event.clientY,
        originPitch: n.pitchMidi,
        span,
      };
    } else {
      dragRef.current = {
        kind,
        index,
        originX: event.clientX,
        originStart: n.startTimeSeconds,
        originEnd: n.startTimeSeconds + n.durationSeconds,
        viewEnd: end,
      };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const staff = staffRef.current;
    if (!drag || !staff || !onChange) {
      if (!editable || recording || drag) return;
      const index = hitIndex(event.clientX, event.clientY);
      if (index === null) {
        setCursor("default");
        return;
      }
      const kind = handleKind(index, event.clientX);
      setCursor(kind === "pitch" ? "ns-resize" : "ew-resize");
      return;
    }
    const rect = staff.getBoundingClientRect();
    if (drag.kind === "pitch") {
      const pxPerSemitone = rect.height / drag.span;
      const delta = (drag.originY - event.clientY) / pxPerSemitone;
      onChange(setPitch(notesRef.current, drag.index, drag.originPitch + delta));
      return;
    }
    const dt = ((event.clientX - drag.originX) / rect.width) * drag.viewEnd;
    if (drag.kind === "left") {
      onChange(resizeLeft(notesRef.current, drag.index, drag.originStart + dt));
    } else {
      onChange(resizeRight(notesRef.current, drag.index, drag.originEnd + dt));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  return (
    <div className="relative w-full px-2 py-8">
      {[20, 35, 50, 65, 80].map((top) => (
        <div
          key={top}
          className="absolute inset-x-2 h-px bg-ivory/[0.06]"
          style={{ top: `${top}%` }}
        />
      ))}

      <div
        ref={staffRef}
        className={`relative h-28 ${editable && !recording ? "touch-none select-none" : ""}`}
        style={{ cursor: editable && !recording ? cursor : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
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
            const selected = selectedIndex === i;
            const style = {
              left: `${left}%`,
              width: `${width}%`,
              top: `${y(n.pitchMidi)}%`,
              boxShadow: selected ? "0 0 18px rgba(232,165,72,0.35)" : "none",
            };
            const handles = editable && selected && (
              <>
                <span className="pointer-events-none absolute top-1/2 left-0 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass shadow-[0_0_10px_rgba(232,165,72,0.55)]" />
                <span className="pointer-events-none absolute top-1/2 right-0 h-3.5 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-brass shadow-[0_0_10px_rgba(232,165,72,0.55)]" />
              </>
            );
            if (editable) {
              return (
                <div
                  key={i}
                  className={`absolute rounded-full ${
                    selected ? "h-2 bg-brass" : "h-1.5 bg-brass/80"
                  }`}
                  style={{ ...style, opacity: selected ? 1 : 0.85 }}
                >
                  {handles}
                </div>
              );
            }
            return (
              <motion.div
                key={`${n.startTimeSeconds}-${n.pitchMidi}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                className="absolute h-1.5 rounded-full bg-brass/80"
                style={style}
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

      <div className="mt-4 flex items-end justify-between border-t border-ivory/[0.06] pt-4">
        <p className="hall-signage text-xs">
          {recording
            ? "Listening…"
            : notes.length
              ? editable
                ? `${notes.length} tones · drag to correct`
                : `${notes.length} tones heard`
              : "Your melody"}
        </p>
        <div className="flex items-center gap-4">
          {liveNote && (
            <p className="font-display text-2xl font-semibold text-brass tabular-nums">
              {liveNote}
            </p>
          )}
          {preview && (
            <button
              type="button"
              onClick={preview.onToggle}
              className={`flex items-center gap-2 border px-4 py-2 font-display text-sm font-semibold transition ${
                preview.playing
                  ? "border-brass bg-brass/20 text-brass shadow-[0_0_24px_rgba(232,165,72,0.28)]"
                  : "border-brass/55 bg-brass/10 text-brass hover:border-brass hover:bg-brass/15"
              }`}
            >
              <span
                className={`text-[10px] leading-none ${
                  preview.playing ? "opacity-90" : ""
                }`}
                aria-hidden
              >
                {preview.playing ? "■" : "▶"}
              </span>
              {preview.playing ? "Silence" : "Hear theme"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
