import { styleById } from "./styles";
import { partsDuration, type ArrangementParts } from "./composer";
import type { LayerState, SectionId, StyleId } from "./types";
import { SECTIONS } from "./types";

type SoundfontInstrument = {
  play: (
    note: number | string,
    time?: number,
    options?: { duration?: number; gain?: number },
  ) => { stop: (when?: number) => void };
};

type SoundfontModule = {
  instrument: (
    ctx: AudioContext,
    name: string,
    options?: {
      destination?: AudioNode;
      soundfont?: string;
      format?: string;
    },
  ) => Promise<SoundfontInstrument>;
};

const BASE_PAN: Record<SectionId, number> = {
  lead: -0.52,
  harmony: -0.28,
  body: 0.48,
  bass: 0,
};

export type OrchestraPlayer = {
  ctx: AudioContext;
  loadedStyle: () => StyleId | null;
  isPlaying: () => boolean;
  load: (style: StyleId, onStatus?: (msg: string) => void) => Promise<void>;
  warmup: () => Promise<void>;
  play: (parts: ArrangementParts, loop?: boolean) => Promise<void>;
  stop: () => void;
  setLayers: (layers: LayerState) => void;
  setDynamics: (value: number) => void;
  setPan: (handX: number) => void;
  setCut: (cut: boolean) => void;
  dispose: () => void;
};

function makeHallImpulse(ctx: AudioContext, seconds = 1.8) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 2.4) * Math.exp(-t * 3.2);
      data[i] = (Math.random() * 2 - 1) * decay * (ch === 0 ? 1 : 0.92);
    }
  }
  return buffer;
}

const WET: Record<SectionId, number> = {
  lead: 0.28,
  harmony: 0.34,
  body: 0.3,
  bass: 0.12,
};

function createOrchestraPlayer(): OrchestraPlayer {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.78;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 2.4;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.22;

  const convolver = ctx.createConvolver();
  convolver.buffer = makeHallImpulse(ctx);
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.42;
  convolver.connect(wetGain);
  wetGain.connect(compressor);
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const gains = {} as Record<SectionId, GainNode>;
  const pans = {} as Record<SectionId, StereoPannerNode>;
  const instruments = {} as Partial<Record<SectionId, SoundfontInstrument>>;
  const active: { stop: (when?: number) => void }[] = [];
  let loopTimer = 0;
  let loadedStyle: StyleId | null = null;
  let loadTask: Promise<void> | null = null;
  let playing = false;
  let cut = false;
  let layers: LayerState = {
    lead: true,
    harmony: false,
    body: false,
    bass: false,
  };

  for (const section of SECTIONS) {
    const g = ctx.createGain();
    g.gain.value = section.id === "lead" ? 1 : 0.0001;
    const p = ctx.createStereoPanner();
    p.pan.value = BASE_PAN[section.id];
    const send = ctx.createGain();
    send.gain.value = WET[section.id];
    g.connect(p);
    p.connect(master);
    p.connect(send);
    send.connect(convolver);
    gains[section.id] = g;
    pans[section.id] = p;
  }

  function applyLayers(now = ctx.currentTime, tau = 0.18) {
    (Object.keys(layers) as SectionId[]).forEach((id) => {
      const target = cut ? 0.0001 : layers[id] ? 1 : 0.0001;
      gains[id].gain.cancelScheduledValues(now);
      gains[id].gain.setTargetAtTime(target, now, tau);
    });
  }

  function clearVoices() {
    window.clearTimeout(loopTimer);
    loopTimer = 0;
    while (active.length) {
      try {
        active.pop()?.stop(0);
      } catch {
        /* already stopped */
      }
    }
  }

  function allLoaded() {
    return SECTIONS.every((s) => instruments[s.id]);
  }

  async function ensureRunning() {
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") {
      throw new Error("Audio is blocked until you interact with the page.");
    }
  }

  function schedule(parts: ArrangementParts, when: number) {
    if (!allLoaded()) return;
    for (const section of SECTIONS) {
      const inst = instruments[section.id];
      if (!inst) continue;
      for (const note of parts[section.id]) {
        const node = inst.play(note.pitchMidi, when + note.startTimeSeconds, {
          duration: Math.max(0.08, note.durationSeconds),
          gain: Math.min(1, Math.max(0.15, note.amplitude)),
        });
        active.push(node);
      }
    }
  }

  const player: OrchestraPlayer = {
    ctx,
    loadedStyle: () => (allLoaded() ? loadedStyle : null),
    isPlaying: () => playing,
    async load(style, onStatus) {
      if (loadedStyle === style && allLoaded()) {
        return;
      }
      if (loadTask) {
        await loadTask;
        if (loadedStyle === style && allLoaded()) return;
      }
      loadTask = (async () => {
        const names = styleById(style).instruments;
        const mod = await import("soundfont-player");
        const Soundfont = ((mod as { default?: SoundfontModule }).default ??
          mod) as SoundfontModule;
        onStatus?.("Tuning the ensemble…");
        const loaded = await Promise.all(
          SECTIONS.map(async (section) => {
            const inst = await Soundfont.instrument(ctx, names[section.id], {
              destination: gains[section.id],
              soundfont: "FluidR3_GM",
              format: "mp3",
            });
            return [section.id, inst] as const;
          }),
        );
        for (const [id, inst] of loaded) instruments[id] = inst;
        loadedStyle = style;
      })();
      try {
        await loadTask;
      } finally {
        loadTask = null;
      }
    },
    async warmup() {
      await ensureRunning();
      if (!allLoaded()) return;
      const now = ctx.currentTime;
      for (const section of SECTIONS) {
        const inst = instruments[section.id];
        if (!inst) continue;
        try {
          const node = inst.play(60, now, { duration: 0.08, gain: 0.0001 });
          node.stop(now + 0.1);
        } catch {
          /* some fonts reject out-of-range primes */
        }
      }
      await new Promise((r) => window.setTimeout(r, 120));
    },
    async play(parts, loop = true) {
      clearVoices();
      await ensureRunning();
      if (!allLoaded()) {
        throw new Error("Instruments are not ready yet.");
      }
      applyLayers(ctx.currentTime, 0.05);
      const start = ctx.currentTime + 0.25;
      const dur = partsDuration(parts);
      schedule(parts, start);
      playing = true;
      if (loop) {
        const tick = () => {
          if (ctx.state !== "running") return;
          const next = ctx.currentTime + 0.12;
          schedule(parts, next);
          loopTimer = window.setTimeout(tick, dur * 1000);
        };
        loopTimer = window.setTimeout(tick, dur * 1000);
      }
    },
    stop() {
      clearVoices();
      playing = false;
    },
    setLayers(next) {
      layers = next;
      applyLayers(ctx.currentTime, 0.2);
    },
    setDynamics(value) {
      const v = Math.min(1, Math.max(0.08, value));
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(cut ? 0.0001 : v, now, 0.1);
    },
    setPan(handX) {
      const bias = (Math.min(1, Math.max(0, handX)) - 0.5) * 2;
      const now = ctx.currentTime;
      (Object.keys(BASE_PAN) as SectionId[]).forEach((id) => {
        const extra = id === "bass" ? 0.12 : 0.22;
        const pan = Math.min(1, Math.max(-1, BASE_PAN[id] + bias * extra));
        pans[id].pan.cancelScheduledValues(now);
        pans[id].pan.setTargetAtTime(pan, now, 0.12);
      });
    },
    setCut(next) {
      cut = next;
      applyLayers(ctx.currentTime, next ? 0.04 : 0.16);
    },
    dispose() {
      clearVoices();
      loadedStyle = null;
      void ctx.close();
    },
  };

  return player;
}

let shared: OrchestraPlayer | null = null;

export function getOrchestraPlayer(): OrchestraPlayer {
  if (!shared || shared.ctx.state === "closed") {
    shared = createOrchestraPlayer();
  }
  return shared;
}

export function disposeOrchestraPlayer() {
  shared?.dispose();
  shared = null;
}
