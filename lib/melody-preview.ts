import { midiToName } from "./music/theory";
import type { NoteEvent } from "./types";

/** Written bassoon range used by the quintet and orchestra. */
const BASSOON_RANGE: [number, number] = [36, 69];
/** Comfortable singing register — around G3 — so a hummed C5 still sounds like a bassoon. */
const BASSOON_CENTRE = 55;

type Voice = { stop: (when?: number) => void } | undefined;

type SoundfontInstrument = {
  play: (
    note: number | string,
    time?: number,
    options?: { duration?: number; gain?: number; attack?: number; release?: number },
  ) => Voice;
};

type SoundfontModule = {
  instrument: (
    ctx: AudioContext,
    name: string,
    options?: {
      destination?: AudioNode;
      soundfont?: string;
      format?: string;
      notes?: string[];
    },
  ) => Promise<SoundfontInstrument>;
};

let previewCtx: AudioContext | null = null;
let bassoon: Promise<SoundfontInstrument> | null = null;

function getContext(): AudioContext {
  if (!previewCtx || previewCtx.state === "closed") {
    previewCtx = new AudioContext();
    bassoon = null;
  }
  return previewCtx;
}

function loadBassoon(ctx: AudioContext): Promise<SoundfontInstrument> {
  if (bassoon) return bassoon;
  bassoon = (async () => {
    const mod = await import("soundfont-player");
    const Soundfont = ((mod as { default?: SoundfontModule }).default ??
      mod) as SoundfontModule;
    const notes: string[] = [];
    for (let midi = BASSOON_RANGE[0] - 2; midi <= BASSOON_RANGE[1] + 2; midi++) {
      notes.push(midiToName(midi));
    }
    return Soundfont.instrument(ctx, "bassoon", {
      destination: ctx.destination,
      soundfont: "FluidR3_GM",
      format: "mp3",
      notes,
    });
  })();
  return bassoon;
}

/** Move the whole hum into the bassoon's tenor register, preserving contour. */
function intoBassoon(notes: NoteEvent[]): NoteEvent[] {
  if (!notes.length) return notes;
  const mean =
    notes.reduce((sum, note) => sum + note.pitchMidi, 0) / notes.length;
  let shift = 0;
  while (mean + shift > BASSOON_CENTRE + 6) shift -= 12;
  while (mean + shift < BASSOON_CENTRE - 7) shift += 12;
  return notes.map((note) => ({
    ...note,
    pitchMidi: Math.min(
      BASSOON_RANGE[1],
      Math.max(BASSOON_RANGE[0], note.pitchMidi + shift),
    ),
  }));
}

/** Play the transcribed melody back so the singer can confirm it. */
export function playMelody(
  notes: NoteEvent[],
  onEnd?: () => void,
  options?: { rate?: number },
): () => void {
  if (!notes.length) return () => {};

  const rate = options?.rate && options.rate > 0 ? options.rate : 1;
  const ctx = getContext();
  const sounding = intoBassoon(notes);
  const voices: NonNullable<Voice>[] = [];
  let timer = 0;
  let cancelled = false;

  const finish = () => {
    window.clearTimeout(timer);
    for (const voice of voices) voice.stop(ctx.currentTime);
    voices.length = 0;
    onEnd?.();
  };

  void (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const instrument = await loadBassoon(ctx);
      if (cancelled) return;
      const start = ctx.currentTime + 0.06;
      let last = start;
      for (const note of sounding) {
        const when = start + note.startTimeSeconds * rate;
        const duration = Math.max(0.12, note.durationSeconds * rate);
        const voice = instrument.play(note.pitchMidi, when, {
          duration,
          gain: Math.min(1, Math.max(0.12, note.amplitude) * 0.85),
          attack: 0.08,
          release: 0.28,
        });
        if (voice) voices.push(voice);
        last = Math.max(last, when + duration);
      }
      timer = window.setTimeout(finish, (last - ctx.currentTime + 0.35) * 1000);
    } catch (err) {
      console.error(err);
      if (!cancelled) finish();
    }
  })();

  return () => {
    cancelled = true;
    finish();
  };
}
