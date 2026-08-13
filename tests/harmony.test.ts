import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFormSlots, BARS, BEATS_PER_BAR } from "../lib/music/form";
import { planHarmony } from "../lib/music/harmony";
import { draftLead } from "../lib/music/lead";
import { analyzeTheme } from "../lib/music/theme";
import { chordFunction, pc } from "../lib/music/theory";
import { THEMES } from "./fixtures";

function planFor(name: keyof typeof THEMES) {
  const analysis = analyzeTheme(THEMES[name]);
  const slots = buildFormSlots();
  return {
    analysis,
    slots,
    chords: planHarmony(analysis.tonicPc, analysis.mode, slots, draftLead(analysis)),
  };
}

describe("form", () => {
  it("lays out sixteen bars of four beats", () => {
    const slots = buildFormSlots();
    assert.equal(slots[0].startBeat, 0);
    const last = slots[slots.length - 1];
    assert.equal(last.startBeat + last.durBeats, BARS * BEATS_PER_BAR);
  });

  it("accelerates the harmonic rhythm towards each cadence", () => {
    const slots = buildFormSlots();
    const perBar = (bar: number) => slots.filter((s) => s.bar === bar).length;
    assert.equal(perBar(0), 1, "presentation holds one chord per bar");
    assert.equal(perBar(5), 2, "continuation moves twice per bar");
    assert.equal(perBar(14), 2, "the cadence itself moves twice");
  });

  it("places a half cadence at bar 8 and an authentic cadence at bar 16", () => {
    const slots = buildFormSlots();
    const half = slots.find((s) => s.cadence === "HC");
    const authentic = slots.find((s) => s.cadence === "PAC");
    assert.equal(half?.bar, 7);
    assert.equal(authentic?.bar, 15);
  });
});

describe("harmony planner", () => {
  for (const name of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    it(`writes a valid progression for the ${String(name)} theme`, () => {
      const { chords, analysis } = planFor(name);
      assert.equal(chords.length, buildFormSlots().length);

      // Both cadences must be structurally correct.
      const half = chords.find((c) => c.slot.cadence === "HC");
      const authentic = chords.find((c) => c.slot.cadence === "PAC");
      assert.equal(half?.degree, 4, "half cadence lands on V");
      assert.equal(half?.inversion, 0, "half cadence is in root position");
      assert.equal(authentic?.degree, 0, "final chord is the tonic");
      assert.equal(authentic?.inversion, 0, "final tonic is in root position");
      assert.equal(authentic?.seventh, false, "the goal chord is a plain triad");

      // The dominant must actually precede the final tonic.
      const beforeFinal = chords[chords.length - 2];
      assert.equal(beforeFinal.fn, "D", "the cadence is prepared by a dominant");
      assert.equal(beforeFinal.degree, 4);
      assert.equal(beforeFinal.seventh, true);

      // No retrogression from dominant to predominant.
      for (let i = 1; i < chords.length; i++) {
        const from = chords[i - 1];
        const to = chords[i];
        assert.ok(
          !(from.fn === "D" && to.fn === "S"),
          `dominant retrogresses to a predominant at slot ${i} (${from.label} -> ${to.label})`,
        );
      }

      // Every chord belongs to the detected key.
      for (const chord of chords) {
        assert.equal(chord.fn, chordFunction(analysis.mode, chord.degree));
        assert.ok(chord.pcs.includes(chord.bassPc), "the bass is a chord member");
        assert.equal(pc(chord.rootPc), chord.pcs[0]);
      }
    });
  }

  it("does not simply oscillate between two chords", () => {
    for (const name of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
      const { chords } = planFor(name);
      const distinct = new Set(chords.map((c) => c.label));
      assert.ok(
        distinct.size >= 6,
        `${String(name)} only used ${distinct.size} distinct chords: ${[...distinct].join(" ")}`,
      );
      let alternations = 0;
      for (let i = 2; i < chords.length; i++) {
        if (
          chords[i].label === chords[i - 2].label &&
          chords[i].label !== chords[i - 1].label
        ) {
          alternations++;
        }
      }
      assert.ok(
        alternations <= 6,
        `${String(name)} oscillates ${alternations} times`,
      );
    }
  });

  it("keeps sevenths for cadences rather than sprinkling them everywhere", () => {
    for (const name of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
      const { chords } = planFor(name);
      const sevenths = chords.filter((c) => c.seventh).length;
      assert.ok(
        sevenths <= chords.length / 3,
        `${String(name)} used ${sevenths} seventh chords out of ${chords.length}`,
      );
    }
  });
});
