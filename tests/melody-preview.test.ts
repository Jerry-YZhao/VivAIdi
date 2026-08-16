import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { midiToName, midiToSoundfontNames } from "../lib/music/theory";
import { placeInRegister } from "../lib/melody-preview";
import type { NoteEvent } from "../lib/types";

function note(pitchMidi: number, start = 0, duration = 0.4): NoteEvent {
  return { pitchMidi, startTimeSeconds: start, durationSeconds: duration, amplitude: 0.7 };
}

describe("soundfont sample keys", () => {
  it("uses the flat names Gleitz FluidR3 files actually contain", () => {
    assert.equal(midiToName(60), "C4");
    assert.equal(midiToName(61), "Db4");
    assert.equal(midiToName(70), "Bb4");
    assert.equal(midiToName(46), "Bb2");
  });

  it("lists both spellings so a notes filter cannot skip accidentals", () => {
    assert.deepEqual(midiToSoundfontNames(60), ["C4"]);
    assert.deepEqual(midiToSoundfontNames(61), ["Db4", "C#4"]);
    assert.deepEqual(midiToSoundfontNames(70), ["Bb4", "A#4"]);
  });
});

describe("theme preview register", () => {
  it("keeps every written pitch distinct", () => {
    const theme = [
      note(60, 0),
      note(67, 0.5),
      note(72, 1),
      note(79, 1.5),
    ];
    const sounding = placeInRegister(theme);
    const original = new Set(theme.map((n) => n.pitchMidi));
    const shifted = new Set(sounding.map((n) => n.pitchMidi));
    assert.equal(shifted.size, original.size);
  });

  it("preserves an octave leap instead of clamping it to the top of the range", () => {
    // Liang Zhu bars 7–8: D4 then D5. A hard [36, 69] clamp used to flatten this.
    const theme = [note(62, 0), note(74, 0.5), note(79, 0.75)];
    const [low, high, peak] = placeInRegister(theme);
    assert.equal(high.pitchMidi - low.pitchMidi, 12);
    assert.equal(peak.pitchMidi - low.pitchMidi, 17);
  });
});
