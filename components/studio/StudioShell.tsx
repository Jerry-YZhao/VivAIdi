"use client";

import Link from "next/link";
import { useStudio } from "@/lib/session";
import { AuditoriumFrame, ProgrammeCaption } from "./Auditorium";
import { PhaseCompose } from "./PhaseCompose";
import { PhaseConduct } from "./PhaseConduct";

export function StudioShell() {
  const { phase, resetPiece, status } = useStudio();
  const conducting = phase === "conduct";

  return (
    <AuditoriumFrame
      className={conducting ? "flex h-[100dvh] flex-col overflow-hidden" : ""}
    >
      <header
        className={`relative z-20 flex shrink-0 items-center justify-between px-8 md:px-14 ${
          conducting ? "py-4 opacity-60" : "py-8"
        }`}
      >
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-ivory transition hover:text-brass"
        >
          VivAIdi
        </Link>
        {!conducting && (
          <button
            type="button"
            onClick={resetPiece}
            className="hall-signage text-xs transition hover:text-ivory"
          >
            New session
          </button>
        )}
      </header>

      <main
        className={`relative z-10 flex flex-1 flex-col ${
          conducting
            ? "min-h-0 overflow-hidden px-4 pb-4 md:px-8"
            : "mx-auto w-full max-w-2xl px-8 pb-20 md:px-14"
        }`}
      >
        {status && !conducting && <ProgrammeCaption>{status}</ProgrammeCaption>}
        {phase === "compose" && <PhaseCompose />}
        {phase === "conduct" && <PhaseConduct />}
      </main>
    </AuditoriumFrame>
  );
}
