"use client";

import { SECTIONS, type LayerState, type SectionId } from "@/lib/types";

const LABELS: Record<SectionId, string> = {
  lead: "I",
  harmony: "II",
  body: "III",
  bass: "IV",
};

export function SectionMixer({
  layers,
  onToggle,
}: {
  layers: LayerState;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <div className="flex items-end justify-center gap-3 md:gap-5">
      {SECTIONS.map((section) => {
        const on = layers[section.id];
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onToggle(section.id)}
            className="group flex flex-col items-center gap-2"
            aria-label={section.label}
          >
            <div
              className="w-8 transition-all duration-500 md:w-10"
              style={{
                height: on ? "3.5rem" : "1rem",
                background: on
                  ? "linear-gradient(180deg, rgba(232,165,72,0.55) 0%, rgba(232,165,72,0.12) 100%)"
                  : "rgba(255,255,255,0.04)",
                boxShadow: on ? "0 0 24px rgba(232,165,72,0.2)" : "none",
              }}
            />
            <span
              className={`font-display text-xs font-medium transition ${
                on ? "text-brass" : "text-ivory-muted/40"
              }`}
            >
              {LABELS[section.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
