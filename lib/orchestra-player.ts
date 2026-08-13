import type { Arrangement } from "./arrangement";
import { midiToName } from "./music/theory";
import { styleById, type EnsembleStyle, type PartSpec } from "./styles";
import type { LayerState, NoteEvent, StyleId } from "./types";

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

/**
 * The conduct phase runs a hand-landmark model alongside playback, which stalls
 * the main thread in bursts. Audio is therefore scheduled well ahead of the
 * clock and topped up often, so a late timer costs nothing audible.
 */
const LOOKAHEAD_SECONDS = 2.5;
const WATCHDOG_MS = 200;
/**
 * Scheduling a whole 16-bar pass at once meant building several hundred voices
 * in one synchronous burst, which dropped camera frames every loop. Work is
 * capped per tick instead; the look-ahead leaves ample slack to catch up.
 */
const NOTES_PER_TICK = 64;

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
type Sounding = { voice: NonNullable<Voice>; endsAt: number };
/** The whole piece flattened and sorted once, so playback never re-derives it. */
type TimelineNote = { partId: string; note: NoteEvent };

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
  const active: Sounding[] = [];

  let loadedStyle: StyleId | null = null;
  let loadTask: Promise<void> | null = null;
  let watchdog = 0;
  let playing = false;
  let cut = false;
  let layers: LayerState = {};
  /** Remembered so releasing a cut can restore the level on its own. */
  let dynamics = 0.62;
  let current: Arrangement | null = null;
  let looping = false;
  let timeline: TimelineNote[] = [];
  let cursor = 0;
  /** Start of the pass being scheduled, in AudioContext time. */
  let passStart = 0;

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

  function applyDynamics(tau = 0.1) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(cut ? SILENT : dynamics * 0.9, now, tau);
  }

  function clearVoices() {
    window.clearInterval(watchdog);
    watchdog = 0;
    looping = false;
    current = null;
    timeline = [];
    cursor = 0;
    while (active.length) {
      try {
        active.pop()?.voice.stop(0);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Drop finished voices so a long performance does not accumulate them. */
  function prune(now: number) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endsAt < now) active.splice(i, 1);
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

  /** Flatten the score once, in playing order. */
  function buildTimeline(arrangement: Arrangement): TimelineNote[] {
    const flat: TimelineNote[] = [];
    for (const part of arrangement.parts) {
      if (!instruments.has(part.id)) continue;
      for (const note of part.notes) flat.push({ partId: part.id, note });
    }
    return flat.sort((a, b) => a.note.startTimeSeconds - b.note.startTimeSeconds);
  }

  function playNote(item: TimelineNote, at: number) {
    const set = instruments.get(item.partId);
    if (!set) return;
    const { note } = item;
    const player = note.articulation && set.alt ? set.alt : set.main;
    const duration = Math.max(0.08, note.durationSeconds);
    const options: PlayOptions = {
      duration,
      gain: Math.min(1, Math.max(0.05, note.amplitude)),
    };
    if (note.attack !== undefined) options.attack = note.attack;
    if (note.release !== undefined) options.release = note.release;
    const voice = player.play(note.pitchMidi, at, options);
    // The extra second covers the sample's own release tail.
    if (voice) active.push({ voice, endsAt: at + duration + 1 });
  }

  /**
   * Top up the schedule from the audio clock. Note times are absolute multiples
   * of the piece length, so repeats never drift and the loop seam stays in time
   * however busy the main thread is.
   */
  function pump() {
    if (!playing || !current || !timeline.length) return;
    // The browser can suspend the context under us; recover instead of dying.
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => {});
      return;
    }
    const now = ctx.currentTime;
    prune(now);
    const dur = current.durationSeconds;

    if (cursor >= timeline.length) {
      if (!looping) {
        playing = false;
        window.clearInterval(watchdog);
        watchdog = 0;
        return;
      }
      passStart += dur;
      cursor = 0;
    }

    // Only a stall longer than the look-ahead can leave us behind. Pick the
    // music up from a fresh downbeat rather than firing every missed note.
    if (passStart + timeline[cursor].note.startTimeSeconds < now - 0.25) {
      passStart = now + 0.05;
      cursor = 0;
    }

    const horizon = now + LOOKAHEAD_SECONDS;
    for (let i = 0; i < NOTES_PER_TICK; i++) {
      if (cursor >= timeline.length) {
        if (!looping) break;
        passStart += dur;
        cursor = 0;
      }
      const item = timeline[cursor];
      const at = passStart + item.note.startTimeSeconds;
      if (at > horizon) break;
      playNote(item, at);
      cursor++;
    }
  }

  function startWatchdog() {
    window.clearInterval(watchdog);
    watchdog = window.setInterval(pump, WATCHDOG_MS);
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
      current = arrangement;
      timeline = buildTimeline(arrangement);
      cursor = 0;
      passStart = ctx.currentTime + 0.35;
      looping = loop;
      playing = true;
      pump();
      startWatchdog();
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
      dynamics = Math.min(1, Math.max(0.08, value));
      applyDynamics();
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
      // Restoring the level here means a released cut always sounds again, even
      // if no dynamic gesture follows it.
      applyDynamics(next ? 0.04 : 0.16);
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
