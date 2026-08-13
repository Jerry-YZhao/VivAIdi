import type { SectionId } from "./types";

const BANDS: {
  id: SectionId;
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
}[] = [
  { id: "bass", type: "lowpass", frequency: 180, Q: 0.7 },
  { id: "body", type: "bandpass", frequency: 450, Q: 0.8 },
  { id: "harmony", type: "bandpass", frequency: 1400, Q: 0.9 },
  { id: "lead", type: "highpass", frequency: 2800, Q: 0.7 },
];

export type BandMixer = {
  ctx: AudioContext;
  source: AudioBufferSourceNode | null;
  master: GainNode;
  gains: Record<SectionId, GainNode>;
  play: (buffer: AudioBuffer, loop?: boolean) => void;
  stop: () => void;
  setLayers: (layers: Record<SectionId, boolean>) => void;
  setDynamics: (value: number) => void;
  dispose: () => void;
};

export function createBandMixer(): BandMixer {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  const gains = {} as Record<SectionId, GainNode>;
  const filters: BiquadFilterNode[] = [];

  for (const band of BANDS) {
    const filter = ctx.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    if (band.Q) filter.Q.value = band.Q;

    const gain = ctx.createGain();
    gain.gain.value = 1;
    filter.connect(gain);
    gain.connect(master);
    gains[band.id] = gain;
    filters.push(filter);
  }

  let source: AudioBufferSourceNode | null = null;

  const mixer: BandMixer = {
    ctx,
    get source() {
      return source;
    },
    master,
    gains,
    play(buffer, loop = true) {
      mixer.stop();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      for (const filter of filters) {
        source.connect(filter);
      }
      source.start(0);
      if (ctx.state === "suspended") void ctx.resume();
    },
    stop() {
      try {
        source?.stop();
      } catch {
        /* already stopped */
      }
      source?.disconnect();
      source = null;
    },
    setLayers(layers) {
      const now = ctx.currentTime;
      (Object.keys(layers) as SectionId[]).forEach((id) => {
        gains[id].gain.cancelScheduledValues(now);
        gains[id].gain.setTargetAtTime(layers[id] ? 1 : 0.0001, now, 0.05);
      });
    },
    setDynamics(value) {
      const v = Math.min(1, Math.max(0.05, value));
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(v, now, 0.08);
    },
    dispose() {
      mixer.stop();
      void ctx.close();
    },
  };

  return mixer;
}
