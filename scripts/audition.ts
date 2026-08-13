/**
 * Print a text score for every ensemble so arrangements can be inspected
 * without a browser. Run with `npm run audition`.
 */
import { composeArrangement } from "../lib/composer";
import { buildFormSlots } from "../lib/music/form";
import { planHarmony } from "../lib/music/harmony";
import { draftLead } from "../lib/music/lead";
import { analyzeTheme } from "../lib/music/theme";
import { ENSEMBLES } from "../lib/styles";
import { THEMES } from "../tests/fixtures";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const name = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

for (const [themeName, notes] of Object.entries(THEMES)) {
  const analysis = analyzeTheme(notes);
  const slots = buildFormSlots();
  const chords = planHarmony(analysis.tonicPc, analysis.mode, slots, draftLead(analysis));
  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `theme: ${themeName}  key: ${NAMES[analysis.tonicPc]} ${analysis.mode}  qpm: ${analysis.qpm}`,
  );
  console.log(
    `harmony: ${chords.map((c) => `${c.slot.bar + 1}:${c.label}`).join(" ")}`,
  );

  for (const style of ENSEMBLES) {
    const arrangement = composeArrangement(notes, style.id);
    const total = arrangement.parts.reduce((s, p) => s + p.notes.length, 0);
    console.log(`\n  ${style.label}  (${total} notes, ${arrangement.durationSeconds.toFixed(1)}s)`);
    for (const part of arrangement.parts) {
      const pitches = part.notes.map((n) => n.pitchMidi);
      const low = pitches.length ? Math.min(...pitches) : 0;
      const high = pitches.length ? Math.max(...pitches) : 0;
      const sounding = part.notes.reduce((s, n) => s + n.durationSeconds, 0);
      const busy = ((sounding / arrangement.durationSeconds) * 100).toFixed(0);
      console.log(
        `    ${part.label.padEnd(16)} ${String(part.notes.length).padStart(4)} notes  ` +
          `${name(low)}-${name(high)}`.padEnd(10) +
          `  active ${busy}%  group ${part.groupId}`,
      );
    }
  }
}
