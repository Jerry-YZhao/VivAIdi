import { midiToSoundfontNames } from "./music/theory";
import type { NoteEvent } from "./types";

/**
 * Samples we bother to decode. Wider than a written bassoon so a hummed leap
 * is not crushed into the same pitch, but tight enough that the first listen
 * does not decode the whole piano.
 */
const SAMPLE_LOW = 36;
const SAMPLE_HIGH = 84;
/** Comfortable tenor — around G3 — so a hummed C5 still sounds like a reed. */
const REGISTER_CENTRE = 55;

type Voice = { stop: (when?: number) => void };

type SoundfontInstrument = {
  play: (
    note: number | string,
    time?: number,
    options?: { duration?: number; gain?: number; attack?: number; release?: number },
  ) => Voice | undefined;
  buffers?: Record<string, unknown>;
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

function sampleKeys() {
  const names: string[] = [];
  for (let midi = SAMPLE_LOW; midi <= SAMPLE_HIGH; midi++) {
    names.push(...midiToSoundfontNames(midi));
  }
  return names;
}

function loadBassoon(ctx: AudioContext): Promise<SoundfontInstrument> {
  if (bassoon) return bassoon;
  bassoon = (async () => {
    const mod = await import("soundfont-player");
    const Soundfont = ((mod as { default?: SoundfontModule }).default ??
      mod) as SoundfontModule;
    const common = {
      destination: ctx.destination,
      soundfont: "FluidR3_GM" as const,
      format: "mp3" as const,
    };
    const trimmed = await Soundfont.instrument(ctx, "bassoon", {
      ...common,
      notes: sampleKeys(),
    });
    const buffers = trimmed.buffers;
    if (buffers) {
      const available = new Set(Object.keys(buffers).map(Number));
      let covered = true;
      for (let midi = SAMPLE_LOW; midi <= SAMPLE_HIGH; midi++) {
        if (!available.has(midi)) {
          covered = false;
          break;
        }
      }
      if (covered) return trimmed;
    }
    // Wrong key spellings used to load only the white notes and skip the rest.
    return Soundfont.instrument(ctx, "bassoon", common);
  })();
  return bassoon;
}

/**
 * Move the whole line into a reed-friendly register without changing its
 * shape. Clamping each pitch independently used to flatten leaps (G5 and A4
 * both became A4) so Hear theme skipped notes that were still on the staff.
 */
export function placeInRegister(notes: NoteEvent[]): NoteEvent[] {
  if (!notes.length) return notes;
  const pitches = notes.map((n) => n.pitchMidi);
  const lo = Math.min(...pitches);
  const hi = Math.max(...pitches);
  const mean = pitches.reduce((sum, p) => sum + p, 0) / pitches.length;
  let shift = 0;
  while (mean + shift > REGISTER_CENTRE + 6 && hi + shift - 12 >= SAMPLE_LOW) {
    shift -= 12;
  }
  while (mean + shift < REGISTER_CENTRE - 7 && lo + shift + 12 <= SAMPLE_HIGH) {
    shift += 12;
  }
  return notes.map((note) => ({ ...note, pitchMidi: note.pitchMidi + shift }));
}

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Always-available voice so a missing sample cannot swallow a written note. */
function playOscillator(
  ctx: AudioContext,
  midi: number,
  when: number,
  duration: number,
  gain: number,
): Voice {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.value = midiToHz(midi);
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.7;
  amp.gain.value = 0;
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(ctx.destination);

  const start = Math.max(when, ctx.currentTime);
  const attack = 0.02;
  const release = Math.min(0.12, duration * 0.35);
  const peak = Math.min(0.22, Math.max(0.04, gain * 0.28));
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(peak, start + attack);
  amp.gain.setValueAtTime(peak, start + duration);
  amp.gain.linearRampToValueAtTime(0, start + duration + release);
  osc.start(start);
  osc.stop(start + duration + release + 0.02);

  return {
    stop(at?: number) {
      const t = at ?? ctx.currentTime;
      try {
        amp.gain.cancelScheduledValues(t);
        amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), t);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        osc.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    },
  };
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
  const sounding = placeInRegister(notes);
  const voices: Voice[] = [];
  let timer = 0;
  let cancelled = false;

  const finish = (cut: boolean) => {
    window.clearTimeout(timer);
    if (cut) {
      const now = ctx.currentTime;
      for (const voice of voices) {
        try {
          voice.stop(now);
        } catch {
          /* already ended */
        }
      }
    }
    voices.length = 0;
    onEnd?.();
  };

  void (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const instrument = await loadBassoon(ctx);
      if (cancelled) return;
      const start = ctx.currentTime + 0.08;
      let last = start;
      for (const note of sounding) {
        const when = start + note.startTimeSeconds * rate;
        const duration = Math.max(0.09, note.durationSeconds * rate);
        const gain = Math.min(1, Math.max(0.18, note.amplitude) * 0.85);
        const midi = Math.round(note.pitchMidi);
        const sampled =
          midi >= SAMPLE_LOW && midi <= SAMPLE_HIGH
            ? instrument.play(midi, when, {
                duration,
                gain,
                attack: 0.02,
                release: 0.12,
              })
            : undefined;
        voices.push(sampled ?? playOscillator(ctx, midi, when, duration, gain));
        last = Math.max(last, when + duration);
      }
      const wait = Math.max(50, (last - ctx.currentTime + 0.25) * 1000);
      timer = window.setTimeout(() => finish(false), wait);
    } catch (err) {
      console.error(err);
      if (!cancelled) finish(false);
    }
  })();

  return () => {
    cancelled = true;
    finish(true);
  };
}
