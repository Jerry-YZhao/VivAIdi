import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeArrangement } from "../lib/composer";
import type { Arrangement, ArrangementPart } from "../lib/arrangement";
import { EXAMPLES } from "../lib/examples";
import { BARS, BEATS_PER_BAR } from "../lib/music/form";
import { ENSEMBLES, styleById } from "../lib/styles";
import type { StyleId } from "../lib/types";
import { THEMES } from "./fixtures";

const THEME_NAMES = Object.keys(THEMES) as (keyof typeof THEMES)[];
const STYLE_IDS = ENSEMBLES.map((e) => e.id);

const EXPECTED_INSTRUMENTS: Record<StyleId, string[]> = {
  orchestra: [
    "violin",
    "viola",
    "cello",
    "contrabass",
    "flute",
    "oboe",
    "clarinet",
    "bassoon",
    "french_horn",
    "trumpet",
    "timpani",
  ],
  chamber: ["violin", "violin", "viola", "cello"],
  windQuintet: ["flute", "oboe", "clarinet", "french_horn", "bassoon"],
  choir: ["choir_aahs", "choir_aahs", "choir_aahs", "choir_aahs"],
};

/** Longest stretch of continuous sound, in beats. */
function longestRun(part: ArrangementPart, spb: number): number {
  const sorted = [...part.notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  let longest = 0;
  let runStart = 0;
  let runEnd = 0;
  for (const note of sorted) {
    const start = note.startTimeSeconds;
    const end = start + note.durationSeconds;
    if (start > runEnd + 0.12) {
      longest = Math.max(longest, runEnd - runStart);
      runStart = start;
    }
    runEnd = Math.max(runEnd, end);
  }
  longest = Math.max(longest, runEnd - runStart);
  return longest / spb;
}

/** Merged sounding intervals, in beats. */
function soundingSpans(part: ArrangementPart, spb: number): [number, number][] {
  const spans = part.notes
    .map((n): [number, number] => [
      n.startTimeSeconds / spb,
      (n.startTimeSeconds + n.durationSeconds) / spb,
    ])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1e-9) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** Total silence in the part, in beats. */
function restBeats(part: ArrangementPart, arrangement: Arrangement, spb: number): number {
  const sounding = soundingSpans(part, spb).reduce((s, [a, b]) => s + (b - a), 0);
  return arrangement.durationSeconds / spb - sounding;
}

/** True when the part does not play straight through a phrase joint. */
function breathesAt(part: ArrangementPart, spb: number, beat: number): boolean {
  return !soundingSpans(part, spb).some(
    ([from, to]) => from < beat - 0.25 && to > beat + 0.25,
  );
}

function every(fn: (arrangement: Arrangement, styleId: StyleId, theme: string) => void) {
  for (const styleId of STYLE_IDS) {
    for (const theme of THEME_NAMES) {
      fn(composeArrangement(THEMES[theme], styleId), styleId, String(theme));
    }
  }
}

describe("ensembles", () => {
  it("offers exactly the four Classical presets", () => {
    assert.deepEqual(STYLE_IDS, ["orchestra", "chamber", "windQuintet", "choir"]);
    for (const ensemble of ENSEMBLES) {
      assert.ok(ensemble.groups.length >= 4 && ensemble.groups.length <= 5);
      assert.equal(
        ensemble.groups.filter((g) => g.cue === 0).length,
        1,
        `${ensemble.id} needs exactly one group sounding from the downbeat`,
      );
      const cues = ensemble.groups.map((g) => g.cue).sort((a, b) => a - b);
      assert.deepEqual(
        cues,
        cues.map((_, i) => i),
        `${ensemble.id} cue order must be contiguous`,
      );
      for (const part of ensemble.parts) {
        assert.ok(
          ensemble.groups.some((g) => g.id === part.groupId),
          `${part.id} points at a group that does not exist`,
        );
        assert.ok(part.range[1] - part.range[0] >= 12, `${part.id} range is too narrow`);
      }
    }
  });

  for (const styleId of STYLE_IDS) {
    it(`scores ${styleId} with its real instrumentation`, () => {
      const arrangement = composeArrangement(THEMES.stepwise, styleId);
      assert.deepEqual(
        arrangement.parts.map((p) => p.instrument),
        EXPECTED_INSTRUMENTS[styleId],
      );
    });
  }

  it("keeps percussion out of the chamber ensembles", () => {
    every((arrangement, styleId) => {
      const hasTimpani = arrangement.parts.some((p) => p.instrument === "timpani");
      assert.equal(
        hasTimpani,
        styleId === "orchestra",
        `${styleId} timpani presence is wrong`,
      );
    });
  });

  it("gives every declared player something to play", () => {
    every((arrangement, styleId, theme) => {
      const style = styleById(styleId);
      assert.equal(
        arrangement.parts.length,
        style.parts.length,
        `${styleId}/${theme} dropped a part`,
      );
      for (const part of arrangement.parts) {
        assert.ok(part.notes.length > 4, `${styleId}/${theme} ${part.id} is nearly silent`);
      }
      assert.equal(arrangement.groups.length, style.groups.length);
    });
  });

  it("stays inside every player's range", () => {
    every((arrangement, styleId, theme) => {
      for (const part of arrangement.parts) {
        for (const note of part.notes) {
          assert.ok(
            note.pitchMidi >= part.range[0] && note.pitchMidi <= part.range[1],
            `${styleId}/${theme} ${part.id} plays ${note.pitchMidi} outside ` +
              `${part.range[0]}-${part.range[1]}`,
          );
          assert.ok(note.durationSeconds > 0, "notes must have length");
          assert.ok(note.amplitude > 0 && note.amplitude <= 1, "amplitude out of bounds");
        }
      }
    });
  });

  it("fits the loop exactly and never bleeds past it", () => {
    every((arrangement, styleId, theme) => {
      const expected = (BARS * BEATS_PER_BAR * 60) / arrangement.qpm;
      assert.ok(
        Math.abs(arrangement.durationSeconds - expected) < 1e-6,
        `${styleId}/${theme} loop length is ${arrangement.durationSeconds}`,
      );
      for (const part of arrangement.parts) {
        for (const note of part.notes) {
          assert.ok(
            note.startTimeSeconds + note.durationSeconds <= arrangement.durationSeconds + 1e-6,
            `${styleId}/${theme} ${part.id} overruns the loop`,
          );
        }
      }
    });
  });

  it("lets winds and voices breathe", () => {
    const winds = ["flute", "oboe", "clarinet", "bassoon", "horn", "horns"];
    const voices = ["soprano", "alto", "tenor", "bass"];
    every((arrangement, styleId, theme) => {
      if (styleId !== "windQuintet" && styleId !== "choir" && styleId !== "orchestra") {
        return;
      }
      const spb = 60 / arrangement.qpm;
      for (const part of arrangement.parts) {
        const isWind = winds.includes(part.id);
        const isVoice = styleId === "choir" && voices.includes(part.id);
        if (!isWind && !isVoice) continue;
        assert.ok(
          longestRun(part, spb) <= 12,
          `${styleId}/${theme} ${part.id} plays ${longestRun(part, spb).toFixed(1)} ` +
            `beats without a break`,
        );
        assert.ok(
          restBeats(part, arrangement, spb) >= 3,
          `${styleId}/${theme} ${part.id} rests only ` +
            `${restBeats(part, arrangement, spb).toFixed(1)} beats`,
        );
        for (const bar of [4, 8, 12]) {
          assert.ok(
            breathesAt(part, spb, bar * BEATS_PER_BAR),
            `${styleId}/${theme} ${part.id} plays straight through bar ${bar + 1}`,
          );
        }
      }
    });
  });

  it("never has the whole woodwind quintet playing all the time", () => {
    for (const theme of THEME_NAMES) {
      const arrangement = composeArrangement(THEMES[theme], "windQuintet");
      const spb = 60 / arrangement.qpm;
      // At least one player must be silent for a whole bar in each phrase.
      for (const phraseStart of [0, 4, 8, 12]) {
        const from = phraseStart * BEATS_PER_BAR * spb;
        const to = (phraseStart + 4) * BEATS_PER_BAR * spb;
        const resting = arrangement.parts.filter((part) => {
          const within = part.notes.filter(
            (n) => n.startTimeSeconds < to && n.startTimeSeconds + n.durationSeconds > from,
          );
          const sounding = within.reduce((s, n) => s + n.durationSeconds, 0);
          return sounding < (to - from) * 0.72;
        });
        assert.ok(
          resting.length >= 1,
          `${String(theme)} bars ${phraseStart + 1}-${phraseStart + 4} are relentless tutti`,
        );
      }
    }
  });

  it("never asks one player for two notes at once", () => {
    // Orchestral parts stand for whole sections, which may divide; a quartet
    // player, a wind player and a choral voice may not.
    const soloEnsembles: StyleId[] = ["chamber", "windQuintet", "choir"];
    every((arrangement, styleId, theme) => {
      if (!soloEnsembles.includes(styleId)) return;
      const spb = 60 / arrangement.qpm;
      for (const part of arrangement.parts) {
        const sorted = [...part.notes].sort(
          (a, b) => a.startTimeSeconds - b.startTimeSeconds,
        );
        for (let i = 1; i < sorted.length; i++) {
          const previousEnd =
            sorted[i - 1].startTimeSeconds + sorted[i - 1].durationSeconds;
          assert.ok(
            sorted[i].startTimeSeconds >= previousEnd - 1e-6,
            `${styleId}/${theme} ${part.id} overlaps itself at beat ` +
              `${(sorted[i].startTimeSeconds / spb).toFixed(2)}`,
          );
        }
      }
    });
  });

  it("keeps rhythmic life in every part", () => {
    every((arrangement, styleId, theme) => {
      for (const part of arrangement.parts) {
        const onsets = new Set(part.notes.map((n) => n.startTimeSeconds.toFixed(3)));
        assert.ok(
          onsets.size >= 5,
          `${styleId}/${theme} ${part.id} has only ${onsets.size} distinct attacks`,
        );
      }
    });
  });

  it("is deterministic for the same hum and ensemble", () => {
    for (const styleId of STYLE_IDS) {
      const a = composeArrangement(THEMES.leaping, styleId);
      const b = composeArrangement(THEMES.leaping, styleId);
      assert.deepEqual(b, a, `${styleId} is not reproducible`);
    }
  });

  it("routes alternate colours only where a sample set exists for them", () => {
    every((arrangement, styleId, theme) => {
      for (const part of arrangement.parts) {
        const coloured = part.notes.filter((n) => n.articulation);
        if (coloured.length) {
          assert.ok(
            part.altInstrument,
            `${styleId}/${theme} ${part.id} asks for ${coloured[0].articulation} ` +
              `without an alternate sample set`,
          );
        }
      }
    });
  });

  it("states the hummed theme intact somewhere in the opening two bars", () => {
    for (const styleId of STYLE_IDS) {
      const arrangement = composeArrangement(THEMES.stepwise, styleId);
      const spb = 60 / arrangement.qpm;
      const themePcs = new Set(THEMES.stepwise.map((n) => n.pitchMidi % 12));

      // Whichever player carries the theme, the statement must be recognisable.
      const statements = arrangement.parts
        .map((part) => part.notes.filter((n) => n.startTimeSeconds < 8 * spb))
        .filter((notes) => notes.length >= 4)
        .map((notes) => ({
          notes,
          fidelity:
            notes.filter((n) => themePcs.has(n.pitchMidi % 12)).length / notes.length,
        }))
        .sort((a, b) => b.fidelity - a.fidelity);

      assert.ok(statements.length > 0, `${styleId} states nothing in bars 1-2`);
      assert.ok(
        statements[0].fidelity >= 0.85,
        `${styleId} altered the opening statement too much ` +
          `(best fidelity ${statements[0].fidelity.toFixed(2)})`,
      );
    }
  });

  it("scores every known concert theme", () => {
    for (const example of EXAMPLES) {
      const arrangement = composeArrangement(example.notes, "orchestra");
      assert.ok(
        arrangement.parts.length > 0,
        `${example.id} produced an empty score`,
      );
      assert.equal(arrangement.bars, 16);
    }
  });
});
