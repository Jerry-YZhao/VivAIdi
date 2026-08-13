"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AuditoriumFrame } from "./studio/Auditorium";

export function Hero() {
  return (
    <AuditoriumFrame className="flex min-h-[100dvh] flex-col">
      <nav className="relative z-10 flex items-center justify-between px-8 py-8 md:px-14">
        <span className="font-display text-lg font-semibold tracking-tight text-ivory">
          VivAIdi
        </span>
      </nav>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 pb-32 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="hall-signage mb-8 text-xs"
        >
          Hall Now Open
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="font-display text-[clamp(3rem,12vw,7rem)] leading-[0.95] font-semibold tracking-tight text-ivory"
        >
          Take the
          <br />
          <span className="text-brass">podium</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-8 max-w-md text-lg text-ivory-muted"
        >
          Hum a melody. An orchestra learns it. Conduct the performance with
          your hands.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-14"
        >
          <Link
            href="/studio"
            className="group inline-flex items-center gap-3 bg-brass px-9 py-3.5 font-display text-sm font-semibold text-ink transition hover:bg-[#f0b968]"
          >
            Enter the hall
            <span className="transition group-hover:translate-x-1">→</span>
          </Link>
        </motion.div>
      </div>
    </AuditoriumFrame>
  );
}
