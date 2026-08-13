import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultLayers,
  readConductGesture,
  restedGesture,
  silentLayers,
  type Landmark,
} from "../lib/gestures";
import type { ConductGroupSpec } from "../lib/styles";

const GROUPS: ConductGroupSpec[] = [
  { id: "soprano", label: "Soprano", short: "S", cue: 0 },
  { id: "alto", label: "Alto", short: "A", cue: 1 },
  { id: "tenor", label: "Tenor", short: "T", cue: 2 },
  { id: "bass", label: "Bass", short: "B", cue: 3 },
];

/** A neutral open hand at the centre of frame. */
function hand(): Landmark[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: 0.5,
    y: 0.5 + i * 0.001,
    z: 0,
  }));
}

describe("conducting gestures", () => {
  it("cuts only when told the fist was held", () => {
    const cutting = readConductGesture(hand(), hand(), 0.9, GROUPS, true);
    assert.equal(cutting.cut, true);
    assert.deepEqual(cutting.layers, silentLayers(GROUPS));

    const open = readConductGesture(hand(), hand(), 0.9, GROUPS, false);
    assert.equal(open.cut, false);
    assert.ok(
      GROUPS.every((g) => open.layers[g.id]),
      "a fully open hand should cue every group",
    );
  });

  it("releases the ensemble when the hands leave the frame", () => {
    const cutting = readConductGesture(hand(), hand(), 0.9, GROUPS, true);
    const resting = restedGesture(GROUPS, cutting.layers);

    // The bug this guards: a fist followed by hands out of shot used to leave
    // the hall silent with no way back.
    assert.equal(resting.cut, false);
    assert.ok(resting.dynamics > 0.2, "resting must not be inaudible");
    assert.ok(
      GROUPS.some((g) => resting.layers[g.id]),
      "something must still be sounding after a rest",
    );
  });

  it("keeps whatever was playing when the hands rest", () => {
    const playing = readConductGesture(hand(), hand(), 0.5, GROUPS, false);
    const resting = restedGesture(GROUPS, playing.layers);
    assert.deepEqual(resting.layers, playing.layers);
  });

  it("falls back to the opening cue if nothing was sounding", () => {
    const resting = restedGesture(GROUPS, silentLayers(GROUPS));
    assert.deepEqual(resting.layers, defaultLayers(GROUPS));
  });
});
