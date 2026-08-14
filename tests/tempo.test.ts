import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTheme } from "../lib/music/theme";
import {
  A_TEMPO_INDEX,
  markedQpm,
  stepTempoIndex,
  TEMPO_MARKS,
} from "../lib/music/tempo";
import { EXAMPLES } from "../lib/examples";

describe("tempo marks", () => {
  it("keeps a tempo as the heard pulse", () => {
    assert.equal(TEMPO_MARKS[A_TEMPO_INDEX].ratio, 1);
    assert.equal(markedQpm(96, A_TEMPO_INDEX), 96);
  });

  it("only offers a few Italian markings around that pulse", () => {
    assert.equal(TEMPO_MARKS.length, 5);
    assert.ok(markedQpm(96, 0) < 96, "largo is slower");
    assert.ok(markedQpm(96, TEMPO_MARKS.length - 1) > 96, "presto is faster");
  });

  it("stops at the ends rather than wrapping", () => {
    assert.equal(stepTempoIndex(0, -1), 0);
    assert.equal(stepTempoIndex(TEMPO_MARKS.length - 1, 1), TEMPO_MARKS.length - 1);
  });

  it("keeps the sung rhythm when only the playback tempo changes", () => {
    const twinkle = EXAMPLES.find((e) => e.id === "twinkle")!;
    const heard = analyzeTheme(twinkle.notes);
    const slow = analyzeTheme(twinkle.notes, {
      gridQpm: heard.qpm,
      qpm: markedQpm(heard.qpm, 0),
    });
    assert.deepEqual(
      slow.notes.map((n) => [n.startBeat, n.durBeats, n.pitch]),
      heard.notes.map((n) => [n.startBeat, n.durBeats, n.pitch]),
    );
    assert.ok(slow.qpm < heard.qpm);
  });
});
