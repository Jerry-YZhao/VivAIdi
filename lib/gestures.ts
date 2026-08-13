import type { ConductGroupSpec } from "./styles";
import type { LayerState } from "./types";

export type Landmark = { x: number; y: number; z: number };

export type ConductGesture = {
  layers: LayerState;
  dynamics: number;
  /** Where the hand sits across the stage, 0 left to 1 right. */
  focus: number;
  cut: boolean;
  hint: string;
};

const TIP_IDS = [4, 8, 12, 16, 20];
const INDEX_TIP = 8;
const PINKY_TIP = 20;
const INDEX_MCP = 5;
const PINKY_MCP = 17;
const WRIST = 0;

const FINGERS: { mcp: number; pip: number; dip: number; tip: number }[] = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 },
];

export function fingertipPoints(landmarks: Landmark[]): Landmark[] {
  return TIP_IDS.map((id) => landmarks[id]).filter(Boolean);
}

function dist3(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function handExtension(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 0;
  const knuckle = dist3(landmarks[INDEX_MCP], landmarks[PINKY_MCP]);
  if (knuckle < 1e-6) return 0;
  const tipSpan = dist3(landmarks[INDEX_TIP], landmarks[PINKY_TIP]);
  return clamp01((tipSpan / knuckle - 0.75) / 1.05);
}

function fingerOpenness(landmarks: Landmark[]): number[] {
  return FINGERS.map(({ mcp, pip, dip, tip }) => {
    const chain =
      dist3(landmarks[mcp], landmarks[pip]) +
      dist3(landmarks[pip], landmarks[dip]) +
      dist3(landmarks[dip], landmarks[tip]);
    if (chain < 1e-6) return 0;
    return dist3(landmarks[mcp], landmarks[tip]) / chain;
  });
}

export function isFist(landmarks: Landmark[]): boolean {
  const open = fingerOpenness(landmarks);
  return open.filter((v) => v < 0.62).length >= 3;
}

export function convexHull(points: Landmark[]): Landmark[] {
  const pts = points
    .map((p) => ({ x: p.x, y: p.y, z: p.z }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;

  const cross = (o: Landmark, a: Landmark, b: Landmark) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Landmark[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Landmark[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function centroid(points: Landmark[]): Landmark {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
    z: points.reduce((s, p) => s + p.z, 0) / n,
  };
}

export function dynamicsFromHand(landmarks: Landmark[]): number {
  const ys = landmarks.map((l) => l.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  return Math.min(1, Math.max(0.12, 1 - mid));
}

/** Mirrored selfie view: visual left is a high landmark x. 0 = left, 1 = right. */
export function focusFromHand(landmarks: Landmark[]): number {
  const wrist = landmarks[WRIST] ?? centroid(landmarks);
  return clamp01(1 - wrist.x);
}

function cuedGroups(groups: ConductGroupSpec[]): ConductGroupSpec[] {
  return groups.filter((g) => g.cue > 0).sort((a, b) => a.cue - b.cue);
}

/** Threshold at which each cued group joins as the hand opens. */
export function cueThreshold(index: number, count: number): number {
  if (count <= 1) return 0.4;
  return 0.16 + (index * 0.62) / (count - 1);
}

export function layersFromExtension(
  groups: ConductGroupSpec[],
  extension: number,
): LayerState {
  const layers: LayerState = {};
  for (const group of groups) layers[group.id] = group.cue === 0;
  const cued = cuedGroups(groups);
  cued.forEach((group, i) => {
    layers[group.id] = extension >= cueThreshold(i, cued.length);
  });
  return layers;
}

export function silentLayers(groups: ConductGroupSpec[]): LayerState {
  return Object.fromEntries(groups.map((g) => [g.id, false]));
}

export function defaultLayers(groups: ConductGroupSpec[]): LayerState {
  return Object.fromEntries(groups.map((g) => [g.id, g.cue === 0]));
}

function describe(groups: ConductGroupSpec[], layers: LayerState): string {
  const active = groups.filter((g) => layers[g.id]);
  if (!active.length) return "Silent";
  if (active.length === groups.length) return "Tutti \u2014 full ensemble";
  return active.map((g) => g.label).join(" + ");
}

export function readConductGesture(
  image: Landmark[],
  world: Landmark[],
  extension: number,
  groups: ConductGroupSpec[],
): ConductGesture {
  const fist = isFist(world);
  const layers = fist ? silentLayers(groups) : layersFromExtension(groups, extension);
  const focus = focusFromHand(image);
  const dynamics = fist ? 0.08 : dynamicsFromHand(image);

  let hint: string;
  if (fist) {
    hint = "Cut \u2014 fist silences the ensemble";
  } else {
    hint = `${describe(groups, layers)} \u00b7 raise your hand for volume`;
    if (focus < 0.35) hint += " \u00b7 left of the stage forward";
    else if (focus > 0.65) hint += " \u00b7 right of the stage forward";
  }

  return { layers, dynamics, focus, cut: fist, hint };
}

/** Stable signature used to throttle gesture updates. */
export function gestureSignature(g: ConductGesture): string {
  const on = Object.keys(g.layers)
    .sort()
    .map((id) => (g.layers[id] ? "1" : "0"))
    .join("");
  return `${g.cut}-${on}-${Math.round(g.focus * 8)}-${Math.round(g.dynamics * 10)}`;
}
