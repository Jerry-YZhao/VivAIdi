import type { NoteEvent, StyleId } from "./types";

/** Local fallback arrangement when Replicate is unavailable. */
export async function synthesizeArrangement(
  notes: NoteEvent[],
  style: StyleId,
  durationSec = 16,
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const length = Math.floor(durationSec * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  const seed = notes.length
    ? notes
    : [
        {
          pitchMidi: 60,
          startTimeSeconds: 0,
          durationSeconds: 0.5,
          amplitude: 0.7,
        },
        {
          pitchMidi: 64,
          startTimeSeconds: 0.5,
          durationSeconds: 0.5,
          amplitude: 0.7,
        },
        {
          pitchMidi: 67,
          startTimeSeconds: 1,
          durationSeconds: 1,
          amplitude: 0.8,
        },
      ];

  const loopSpan = Math.max(
    4,
    seed[seed.length - 1].startTimeSeconds +
      seed[seed.length - 1].durationSeconds,
  );

  const wave =
    style === "jazz" ? "triangle" : style === "cinematic" ? "sawtooth" : "sine";

  for (let rep = 0; rep < Math.ceil(durationSec / loopSpan); rep++) {
    const offset = rep * loopSpan;
    for (const note of seed) {
      scheduleVoice(ctx, note, offset, 0, 0.22, wave);
      scheduleVoice(ctx, note, offset, -5, 0.12, wave);
      scheduleVoice(ctx, note, offset, -12, 0.18, "sine");
      scheduleVoice(ctx, note, offset, -19, 0.14, "sine");
    }
  }

  // soft pad
  const pad = ctx.createOscillator();
  const padGain = ctx.createGain();
  pad.type = "sine";
  pad.frequency.value = midiToFreq(seed[0].pitchMidi - 12);
  padGain.gain.setValueAtTime(0.0001, 0);
  padGain.gain.exponentialRampToValueAtTime(0.06, 1.5);
  padGain.gain.exponentialRampToValueAtTime(0.0001, durationSec - 0.2);
  pad.connect(padGain);
  padGain.connect(ctx.destination);
  pad.start(0);
  pad.stop(durationSec);

  return ctx.startRendering();
}

function scheduleVoice(
  ctx: OfflineAudioContext,
  note: NoteEvent,
  offset: number,
  semitones: number,
  gainAmt: number,
  type: OscillatorType,
) {
  const start = offset + note.startTimeSeconds;
  const dur = Math.max(0.08, note.durationSeconds);
  if (start >= ctx.length / ctx.sampleRate) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = midiToFreq(note.pitchMidi + semitones);
  const peak = gainAmt * Math.min(1, note.amplitude + 0.3);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export async function audioBufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, buffer.length * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
