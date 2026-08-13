import type { Arrangement } from "./arrangement";
import { midiToName } from "./music/theory";
import { styleById, type EnsembleStyle, type PartSpec } from "./styles";
import type { LayerState, StyleId } from "./types";

type Voice = { stop: (when?: number) => void } | undefined;

type PlayOptions = {
  duration?: number;
  gain?: number;
  attack?: number;
  release?: number;
};

type SoundfontInstrument = {
  play: (note: number | string, time?: number, options?: PlayOptions) => Voice;
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

export type OrchestraPlayer = {
  ctx: AudioContext;
  loadedStyle: () => StyleId | null;
  isPlaying: () => boolean;
  load: (style: StyleId, onStatus?: (msg: string) => void) => Promise<void>;
  warmup: () => Promise<void>;
  play: (arrangement: Arrangement, loop?: boolean) => Promise<void>;
  stop: () => void;
  setLayers: (layers: LayerState) => void;
  setDynamics: (value: number) => void;
  /** Hand position, 0 left to 1 right, biases which families sit forward. */
  setFocus: (handX: number) => void;
  setCut: (cut: boolean) => void;
  dispose: () => void;
};

const SILENT = 0.0001;

function makeHallImpulse(ctx: AudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 2.2) * Math.exp(-t * 2.6);
      data[i] = (Math.random() * 2 - 1) * decay * (ch === 0 ? 1 : 0.92);
    }
  }
  return buffer;
}

/** Only decode the notes a player can actually reach. */
function rangeNoteNames(range: [number, number]): string[] {
  const names: string[] = [];
  for (let midi = Math.max(21, range[0] - 2); midi <= Math.min(108, range[1] + 2); midi++) {
    names.push(midiToName(midi));
  }
  return names;
}

/** Sample keys are remapped to MIDI numbers once loaded. */
function coversRange(instrument: SoundfontInstrument, range: [number, number]): boolean {
  const buffers = instrument.buffers;
  if (!buffers) return false;
  const available = new Set(Object.keys(buffers).map(Number));
  for (let midi = range[0]; midi <= range[1]; midi++) {
    if (!available.has(midi)) return false;
  }
  return true;
}

type GroupBus = { layer: GainNode; send: GainNode; focus: GainNode; pan: number };
type PartBus = { input: GainNode; panner: StereoPannerNode };

function createOrchestraPlayer(): OrchestraPlayer {
  const ctx = new AudioContext();

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -17;
  compressor.knee.value = 14;
  compressor.ratio.value = 2.2;
  compressor.attack.value = 0.014;
  compressor.release.value = 0.24;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.72;
  master.connect(compressor);

  const convolver = ctx.createConvolver();
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.4;
  convolver.connect(wetGain);
  wetGain.connect(compressor);

  const groups = new Map<string, GroupBus>();
  const partBuses = new Map<string, PartBus>();
  const instruments = new Map<string, { main: SoundfontInstrument; alt?: SoundfontInstrument }>();
  const active: NonNullable<Voice>[] = [];

  let loadedStyle: StyleId | null = null;
  let loadTask: Promise<void> | null = null;
  let loopTimer = 0;
  let playing = false;
  let cut = false;
  let layers: LayerState = {};

  function teardownGraph() {
    for (const bus of groups.values()) {
      bus.layer.disconnect();
      bus.send.disconnect();
      bus.focus.disconnect();
    }
    for (const bus of partBuses.values()) {
      bus.input.disconnect();
      bus.panner.disconnect();
    }
    groups.clear();
    partBuses.clear();
    instruments.clear();
  }

  function buildGraph(style: EnsembleStyle) {
    teardownGraph();
    convolver.buffer = makeHallImpulse(ctx, style.reverbSeconds);
    wetGain.gain.value = style.wetMix;

    for (const group of style.groups) {
      const members = style.parts.filter((p) => p.groupId === group.id);
      const seatPan = members.length
        ? members.reduce((s, p) => s + p.pan, 0) / members.length
        : 0;
      const layer = ctx.createGain();
      layer.gain.value = group.cue === 0 ? 1 : SILENT;
      const send = ctx.createGain();
      send.gain.value = layer.gain.value;
      const focus = ctx.createGain();
      focus.gain.value = 1;
      layer.connect(focus);
      focus.connect(master);
      send.connect(convolver);
      groups.set(group.id, { layer, send, focus, pan: seatPan });
    }

    for (const part of style.parts) {
      const group = groups.get(part.groupId);
      if (!group) continue;
      const input = ctx.createGain();
      input.gain.value = part.gain;
      const panner = ctx.createStereoPanner();
      panner.pan.value = part.pan;
      let tail: AudioNode = input;
      if (part.tone) {
        const filter = ctx.createBiquadFilter();
        filter.type = part.tone.type;
        filter.frequency.value = part.tone.frequency;
        filter.gain.value = part.tone.gain;
        input.connect(filter);
        tail = filter;
      }
      tail.connect(panner);
      panner.connect(group.layer);
      const wet = ctx.createGain();
      wet.gain.value = part.wet;
      panner.connect(wet);
      wet.connect(group.send);
      partBuses.set(part.id, { input, panner });
    }

    layers = Object.fromEntries(style.groups.map((g) => [g.id, g.cue === 0]));
  }

  function applyLayers(now = ctx.currentTime, tau = 0.18) {
    for (const [id, bus] of groups) {
      const target = cut ? SILENT : layers[id] ? 1 : SILENT;
      for (const node of [bus.layer, bus.send]) {
        node.gain.cancelScheduledValues(now);
        node.gain.setTargetAtTime(target, now, tau);
      }
    }
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

  function allLoaded(style: EnsembleStyle | null) {
    if (!style) return false;
    return style.parts.every((part) => instruments.has(part.id));
  }

  async function ensureRunning() {
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") {
      throw new Error("Audio is blocked until you interact with the page.");
    }
  }

  async function loadSampleSet(
    Soundfont: SoundfontModule,
    name: string,
    spec: PartSpec,
    destination: AudioNode,
  ): Promise<SoundfontInstrument> {
    const common = {
      destination,
      soundfont: "FluidR3_GM",
      format: "mp3",
    };
    const trimmed = await Soundfont.instrument(ctx, name, {
      ...common,
      notes: rangeNoteNames(spec.range),
    });
    if (coversRange(trimmed, spec.range)) return trimmed;
    // Unexpected sample naming: fall back to the full set rather than go silent.
    return Soundfont.instrument(ctx, name, common);
  }

  function schedule(arrangement: Arrangement, when: number) {
    for (const part of arrangement.parts) {
      const set = instruments.get(part.id);
      if (!set) continue;
      for (const note of part.notes) {
        const player = note.articulation && set.alt ? set.alt : set.main;
        const options: PlayOptions = {
          duration: Math.max(0.08, note.durationSeconds),
          gain: Math.min(1, Math.max(0.05, note.amplitude)),
        };
        if (note.attack !== undefined) options.attack = note.attack;
        if (note.release !== undefined) options.release = note.release;
        const voice = player.play(note.pitchMidi, when + note.startTimeSeconds, options);
        if (voice) active.push(voice);
      }
    }
  }

  const player: OrchestraPlayer = {
    ctx,
    loadedStyle: () =>
      loadedStyle && allLoaded(styleById(loadedStyle)) ? loadedStyle : null,
    isPlaying: () => playing,
    async load(styleId, onStatus) {
      const style = styleById(styleId);
      if (loadedStyle === styleId && allLoaded(style)) return;
      if (loadTask) {
        await loadTask;
        if (loadedStyle === styleId && allLoaded(style)) return;
      }
      loadTask = (async () => {
        clearVoices();
        playing = false;
        buildGraph(style);
        const mod = await import("soundfont-player");
        const Soundfont = ((mod as { default?: SoundfontModule }).default ??
          mod) as SoundfontModule;

        let ready = 0;
        const announce = (label: string) => {
          ready++;
          onStatus?.(`${label} ready (${ready}/${style.parts.length})`);
        };
        onStatus?.(`Seating ${style.parts.length} players\u2026`);

        const loaded = await Promise.all(
          style.parts.map(async (part) => {
            const bus = partBuses.get(part.id);
            if (!bus) return null;
            const main = await loadSampleSet(
              Soundfont,
              part.instrument,
              part,
              bus.input,
            );
            const alt = part.altInstrument
              ? await loadSampleSet(Soundfont, part.altInstrument, part, bus.input)
              : undefined;
            announce(part.label);
            return { id: part.id, main, alt };
          }),
        );
        for (const entry of loaded) {
          if (entry) instruments.set(entry.id, { main: entry.main, alt: entry.alt });
        }
        loadedStyle = styleId;
      })();
      try {
        await loadTask;
      } finally {
        loadTask = null;
      }
    },
    async warmup() {
      await ensureRunning();
      const style = loadedStyle ? styleById(loadedStyle) : null;
      if (!allLoaded(style) || !style) return;
      const now = ctx.currentTime;
      for (const part of style.parts) {
        const set = instruments.get(part.id);
        if (!set) continue;
        const pitch = Math.round((part.range[0] + part.range[1]) / 2);
        try {
          set.main.play(pitch, now, { duration: 0.05, gain: SILENT })?.stop(now + 0.08);
          set.alt?.play(pitch, now, { duration: 0.05, gain: SILENT })?.stop(now + 0.08);
        } catch {
          /* some sample sets reject the first prime */
        }
      }
      await new Promise((r) => window.setTimeout(r, 120));
    },
    async play(arrangement, loop = true) {
      clearVoices();
      await ensureRunning();
      const style = styleById(arrangement.style);
      if (loadedStyle !== arrangement.style || !allLoaded(style)) {
        throw new Error("Instruments are not ready yet.");
      }
      applyLayers(ctx.currentTime, 0.05);
      const dur = arrangement.durationSeconds;
      schedule(arrangement, ctx.currentTime + 0.3);
      playing = true;
      if (loop) {
        const tick = () => {
          if (ctx.state !== "running") return;
          schedule(arrangement, ctx.currentTime + 0.12);
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
      layers = { ...layers, ...next };
      applyLayers(ctx.currentTime, 0.2);
    },
    setDynamics(value) {
      const v = Math.min(1, Math.max(0.08, value));
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(cut ? SILENT : v * 0.9, now, 0.1);
    },
    setFocus(handX) {
      // Leaning towards a side brings that side of the stage forward instead of
      // sliding the whole ensemble's stereo image.
      const bias = (Math.min(1, Math.max(0, handX)) - 0.5) * 2;
      const now = ctx.currentTime;
      for (const bus of groups.values()) {
        const emphasis = Math.min(1.5, Math.max(0.6, 1 + bias * bus.pan * 0.55));
        bus.focus.gain.cancelScheduledValues(now);
        bus.focus.gain.setTargetAtTime(emphasis, now, 0.14);
      }
    },
    setCut(next) {
      cut = next;
      applyLayers(ctx.currentTime, next ? 0.04 : 0.16);
    },
    dispose() {
      clearVoices();
      teardownGraph();
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
