import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContext } from "../lib/arrangers/context";
import { EXAMPLES } from "../lib/examples";
import { BEATS_PER_BAR } from "../lib/music/form";
import { analyzeTheme } from "../lib/music/theme";
import { styleById } from "../lib/styles";
import type { NoteEvent } from "../lib/types";
import { THEMES } from "./fixtures";

const PRESENTATION_BEATS = BEATS_PER_BAR * 4;

/** Every hum we can quote from, keyed by name. */
const SUNG: Record<string, NoteEvent[]> = {
  ...Object.fromEntries(EXAMPLES.map((e) => [e.label, e.notes])),
  ...Object.fromEntries(
    Object.entries(THEMES).filter(([, notes]) => notes.length > 1),
  ),
};

describe("theme fidelity", () => {
  it("keeps repeated notes rather than tying them together", () => {
    // "Twinkle twinkle" is two Cs. Merging them cost the tune its identity.
    const twinkle = EXAMPLES.find((e) => e.id === "twinkle")!;
    const analysis = analyzeTheme(twinkle.notes);
    assert.equal(
      analysis.notes.length,
      twinkle.notes.length,
      "no sung note should be swallowed",
    );
    const opening = analysis.notes.slice(0, 4).map((n) => n.pitch);
    assert.deepEqual(opening, [60, 60, 67, 67], "C C G G, not one long C");
  });

  it("opens every arrangement with the melody exactly as sung", () => {
    for (const [name, notes] of Object.entries(SUNG)) {
      const analysis = analyzeTheme(notes);
      const ctx = buildContext(notes, styleById("chamber"));
      const quoted = analysis.notes.filter(
        (n) => n.startBeat < PRESENTATION_BEATS - 1e-6,
      );
      assert.ok(quoted.length > 0, `${name} produced nothing to quote`);

      for (const note of quoted) {
        const match = ctx.lead.find(
          (n) => Math.abs(n.startBeat - note.startBeat) < 1e-6,
        );
        assert.ok(
          match,
          `${name} dropped the note sung at beat ${note.startBeat}`,
        );
        assert.equal(
          match.pitch,
          note.pitch,
          `${name} altered the note at beat ${note.startBeat}`,
        );
      }
    }
  });

  it("fills the whole four-bar presentation", () => {
    for (const [name, notes] of Object.entries(SUNG)) {
      const { themePhrase } = analyzeTheme(notes);
      const span = Math.max(
        ...themePhrase.map((n) => n.startBeat + n.durBeats),
      );
      assert.ok(
        span >= PRESENTATION_BEATS - BEATS_PER_BAR,
        `${name} only fills ${span} of ${PRESENTATION_BEATS} beats`,
      );
    }
  });

  it("still states the theme when the microphone heard nothing", () => {
    const ctx = buildContext([], styleById("chamber"));
    assert.ok(ctx.lead.length > 0, "an invented theme should still be scored");
  });
});
