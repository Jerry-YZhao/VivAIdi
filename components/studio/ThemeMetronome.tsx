"use client";

import {
  A_TEMPO_INDEX,
  markedQpm,
  stepTempoIndex,
  TEMPO_MARKS,
  tempoMarkAt,
} from "@/lib/music/tempo";

export function ThemeMetronome({
  originalQpm,
  index,
  onIndex,
}: {
  originalQpm: number;
  index: number;
  onIndex: (index: number) => void;
}) {
  const qpm = markedQpm(originalQpm, index);
  const mark = tempoMarkAt(index);
  const beat = 60 / Math.max(48, qpm);
  const atStart = index <= 0;
  const atEnd = index >= TEMPO_MARKS.length - 1;

  return (
    <div
      className="flex select-none flex-col items-center gap-2"
      role="group"
      aria-label="Tempo"
    >
      <div className="flex h-7 items-start justify-center">
        <span
          key={qpm}
          className="mt-0.5 h-6 w-px origin-top bg-brass/70"
          style={{
            animation: `viva-metro ${beat}s ease-in-out infinite alternate`,
          }}
        />
      </div>
      <div className="flex items-center gap-6">
        <TempoArrow
          label="Slower"
          disabled={atStart}
          onClick={() => onIndex(stepTempoIndex(index, -1))}
        >
          ‹
        </TempoArrow>
        <p
          className={`hall-signage min-w-[7rem] text-center text-xs ${
            index === A_TEMPO_INDEX ? "text-brass" : ""
          }`}
        >
          {mark.label}
        </p>
        <TempoArrow
          label="Faster"
          disabled={atEnd}
          onClick={() => onIndex(stepTempoIndex(index, 1))}
        >
          ›
        </TempoArrow>
      </div>
      <p className="font-display text-sm font-medium tabular-nums text-ivory-muted/70">
        {qpm}
      </p>
      <style>{`
        @keyframes viva-metro {
          from { transform: rotate(-16deg); }
          to { transform: rotate(16deg); }
        }
      `}</style>
    </div>
  );
}

function TempoArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="font-display text-3xl leading-none text-brass transition hover:text-[#f0b968] disabled:text-brass/20"
    >
      {children}
    </button>
  );
}
