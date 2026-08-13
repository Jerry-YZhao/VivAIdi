import type { NoteEvent } from "./types";

/** Play the transcribed melody back so the singer can confirm it. */
export function playMelody(notes: NoteEvent[], onEnd?: () => void): () => void {
  if (!notes.length) return () => {};
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.4;
  master.connect(ctx.destination);

  const start = ctx.currentTime + 0.06;
  let last = start;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (note.pitchMidi - 69) / 12);
    const t = start + note.startTimeSeconds;
    const end = t + Math.max(0.08, note.durationSeconds);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.08, note.amplitude) * 0.6, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(end + 0.03);
    last = Math.max(last, end);
  }

  const timer = window.setTimeout(
    () => {
      onEnd?.();
      void ctx.close();
    },
    (last - ctx.currentTime + 0.15) * 1000,
  );

  return () => {
    window.clearTimeout(timer);
    onEnd?.();
    void ctx.close();
  };
}
