import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFormSlots } from "../lib/music/form";
import { planHarmony } from "../lib/music/harmony";
import { draftLead, finalizeLead, structuralSoprano } from "../lib/music/lead";
import { analyzeTheme } from "../lib/music/theme";
import { leadingTonePc, pc } from "../lib/music/theory";
import { hasParallelPerfects, solveVoicing } from "../lib/music/voicing";
import { THEMES } from "./fixtures";

const SATB = [
  { min: 40, max: 62 },
  { min: 48, max: 69 },
  { min: 55, max: 74 },
  { min: 60, max: 79 },
];

function voice(name: keyof typeof THEMES) {
  const analysis = analyzeTheme(THEMES[name]);
  const slots = buildFormSlots();
  const draft = draftLead(analysis);
  const chords = planHarmony(analysis.tonicPc, analysis.mode, slots, draft);
  const lead = finalizeLead(draft, chords, analysis.tonicPc, analysis.mode);
  const sopranoPcs = structuralSoprano(chords, lead, slots).map((p) =>
    p === null ? null : pc(p),
  );
  return {
    analysis,
    chords,
    voiced: solveVoicing(chords, {
      ranges: SATB,
      sopranoPcs,
      tonicPc: analysis.tonicPc,
    }),
  };
}

const NAMES = Object.keys(THEMES) as (keyof typeof THEMES)[];

describe("voice leading", () => {
  for (const name of NAMES) {
    it(`writes singable SATB for the ${String(name)} theme`, () => {
      const { chords, voiced, analysis } = voice(name);
      assert.equal(voiced.length, chords.length);

      voiced.forEach((chordVoices, i) => {
        assert.equal(chordVoices.length, 4);

        // Ranges.
        chordVoices.forEach((pitch, v) => {
          assert.ok(
            pitch >= SATB[v].min && pitch <= SATB[v].max,
            `voice ${v} out of range at slot ${i}: ${pitch}`,
          );
        });

        // Ordered lowest to highest, no crossing.
        for (let v = 1; v < chordVoices.length; v++) {
          assert.ok(
            chordVoices[v] > chordVoices[v - 1],
            `voices cross at slot ${i}: ${chordVoices.join(",")}`,
          );
        }

        // Upper voices stay within an octave of each other.
        for (let v = 1; v < chordVoices.length - 1; v++) {
          assert.ok(
            chordVoices[v + 1] - chordVoices[v] <= 12,
            `upper voices exceed an octave at slot ${i}: ${chordVoices.join(",")}`,
          );
        }

        // Every sounding pitch is a member of the chord.
        for (const pitch of chordVoices) {
          assert.ok(
            chords[i].pcs.includes(pc(pitch)),
            `non-chord tone in the skeleton at slot ${i}: ${pitch} in ${chords[i].label}`,
          );
        }

        // The bass carries the notated inversion.
        assert.equal(
          pc(chordVoices[0]),
          chords[i].bassPc,
          `wrong bass at slot ${i} of ${chords[i].label}`,
        );

        // The leading tone is never doubled.
        const lt = leadingTonePc(analysis.tonicPc);
        if (chords[i].fn === "D") {
          const count = chordVoices.filter((p) => pc(p) === lt).length;
          assert.ok(count <= 1, `doubled leading tone at slot ${i}`);
        }
      });
    });

    it(`avoids parallel fifths and octaves for the ${String(name)} theme`, () => {
      const { voiced } = voice(name);
      for (let i = 1; i < voiced.length; i++) {
        assert.ok(
          !hasParallelPerfects(voiced[i - 1], voiced[i]),
          `parallel perfect interval between slots ${i - 1} and ${i}: ` +
            `${voiced[i - 1].join(",")} -> ${voiced[i].join(",")}`,
        );
      }
    });

    it(`resolves the cadential dominant for the ${String(name)} theme`, () => {
      const { chords, voiced, analysis } = voice(name);
      const last = chords.length - 1;
      const lt = leadingTonePc(analysis.tonicPc);
      const dominant = voiced[last - 1];
      const tonic = voiced[last];

      const ltVoice = dominant.findIndex((p) => pc(p) === lt);
      if (ltVoice >= 0) {
        const rises = tonic[ltVoice] === dominant[ltVoice] + 1;
        // An inner voice may instead drop a third to the fifth so the final
        // tonic triad is complete — the "frustrated" leading tone.
        const inner = ltVoice > 0 && ltVoice < dominant.length - 1;
        const fallsToFifth =
          inner &&
          dominant[ltVoice] - tonic[ltVoice] === 4 &&
          pc(tonic[ltVoice]) === pc(analysis.tonicPc + 7);
        assert.ok(
          rises || fallsToFifth,
          `unresolved leading tone in voice ${ltVoice}: ` +
            `${dominant[ltVoice]} -> ${tonic[ltVoice]}`,
        );
      }

      const seventhPc = chords[last - 1].pcs[chords[last - 1].pcs.length - 1];
      const seventhVoice = dominant.findIndex((p) => pc(p) === seventhPc);
      if (seventhVoice >= 0) {
        const step = dominant[seventhVoice] - tonic[seventhVoice];
        assert.ok(
          step === 1 || step === 2,
          `the chordal seventh must fall by step, moved ${-step}`,
        );
      }

      // A perfect authentic cadence needs the tonic in the bass.
      assert.equal(pc(tonic[0]), pc(analysis.tonicPc));
    });
  }

  it("keeps the skeleton under the melody's structural pitch classes", () => {
    for (const name of NAMES) {
      const { chords, voiced } = voice(name);
      voiced.forEach((chordVoices, i) => {
        assert.ok(chords[i].pcs.includes(pc(chordVoices[3])));
      });
    }
  });
});
