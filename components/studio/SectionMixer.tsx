"use client";

import type { ConductGroupSpec } from "@/lib/styles";
import type { LayerState } from "@/lib/types";

export function SectionMixer({
  groups,
  layers,
  onToggle,
}: {
  groups: ConductGroupSpec[];
  layers: LayerState;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex items-end justify-center gap-3 md:gap-5">
      {groups.map((group) => {
        const on = Boolean(layers[group.id]);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onToggle(group.id)}
            className="group flex flex-col items-center gap-2"
            aria-label={group.label}
            aria-pressed={on}
            title={group.label}
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
              {group.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}
