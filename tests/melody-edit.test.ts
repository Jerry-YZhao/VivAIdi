import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_NOTE_SECONDS,
  resizeLeft,
  resizeRight,
  setPitch,
} from "../lib/melody-edit";
import type { NoteEvent } from "../lib/types";

function note(
  pitch: number,
  start: number,
  dur: number,
): NoteEvent {
  return {
    pitchMidi: pitch,
    startTimeSeconds: start,
    durationSeconds: dur,
    amplitude: 0.7,
  };
}

describe("melody editing", () => {
  const line = [note(60, 0, 0.5), note(64, 0.5, 0.5), note(67, 1.2, 0.4)];

  it("nudges a pitch by semitones and stays in range", () => {
    assert.equal(setPitch(line, 1, 65)[1].pitchMidi, 65);
    assert.equal(setPitch(line, 1, 20)[1].pitchMidi, 36);
    assert.equal(setPitch(line, 1, 200)[1].pitchMidi, 96);
  });

  it("extends the left edge only as far as the previous note", () => {
    const stretched = resizeLeft(line, 1, 0);
    assert.ok(stretched[1].startTimeSeconds >= 0.5);
    assert.equal(
      stretched[1].startTimeSeconds + stretched[1].durationSeconds,
      1,
    );

    const grown = resizeLeft([note(60, 1, 0.5)], 0, -2);
    assert.equal(grown[0].startTimeSeconds, 0);
    assert.ok(grown[0].durationSeconds > 0.5);
  });

  it("will not shrink a note past the minimum duration", () => {
    const squeezed = resizeLeft(line, 1, 0.99);
    assert.ok(squeezed[1].durationSeconds >= MIN_NOTE_SECONDS - 1e-9);
  });

  it("ripples later notes with the right edge, out and back", () => {
    const grown = resizeRight(line, 0, 0.9);
    assert.ok(grown[0].durationSeconds > 0.5);
    const shift = grown[0].durationSeconds - 0.5;
    assert.ok(Math.abs(grown[1].startTimeSeconds - (0.5 + shift)) < 1e-9);
    assert.ok(Math.abs(grown[2].startTimeSeconds - (1.2 + shift)) < 1e-9);
    const gap =
      grown[2].startTimeSeconds -
      (grown[1].startTimeSeconds + grown[1].durationSeconds);
    assert.ok(Math.abs(gap - 0.2) < 1e-9, "spacing after the edited note holds");

    const restored = resizeRight(grown, 0, 0.5);
    assert.ok(Math.abs(restored[0].durationSeconds - 0.5) < 1e-9);
    assert.ok(Math.abs(restored[1].startTimeSeconds - 0.5) < 1e-9);
    assert.ok(Math.abs(restored[2].startTimeSeconds - 1.2) < 1e-9);
  });
});
