import { buildPitchTrack, type PitchTrack } from "./pitch-track";

const MODEL_URL = "/basic-pitch/model.json";
const MODEL_RATE = 22050;

/** Run the model and keep its raw frames — segmentation happens downstream. */
export async function analyzeHum(
  audioBuffer: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<PitchTrack> {
  const { BasicPitch } = await import("@spotify/basic-pitch");

  const mono = await resampleMono(audioBuffer, MODEL_RATE);
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  const basicPitch = new BasicPitch(MODEL_URL);
  await basicPitch.evaluateModel(
    mono,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p) => onProgress?.(p),
  );

  return buildPitchTrack(frames, onsets, contours);
}

async function resampleMono(
  buffer: AudioBuffer,
  targetRate: number,
): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * targetRate),
    targetRate,
  );
  const src = offline.createBufferSource();
  const monoBuffer = offline.createBuffer(1, buffer.length, buffer.sampleRate);
  const mixed = monoBuffer.getChannelData(0);
  const channels = buffer.numberOfChannels;
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) sum += buffer.getChannelData(ch)[i];
    mixed[i] = sum / channels;
  }
  src.buffer = monoBuffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  const ab = await blob.arrayBuffer();
  try {
    return await ctx.decodeAudioData(ab.slice(0));
  } finally {
    await ctx.close();
  }
}
