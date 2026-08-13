import type { LayerState } from "./types";

export type Landmark = { x: number; y: number; z: number };

export type ConductGesture = {
  layers: LayerState;
  dynamics: number;
  pan: number;
  cut: boolean;
  swell: boolean;
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

/** Mirrored selfie: visual left (strings) is high landmark x. 0 = left, 1 = right. */
export function panFromHand(landmarks: Landmark[]): number {
  const wrist = landmarks[WRIST] ?? centroid(landmarks);
  return clamp01(1 - wrist.x);
}

export function layersFromExtension(extension: number): LayerState {
  return {
    lead: true,
    harmony: extension >= 0.2,
    body: extension >= 0.45,
    bass: extension >= 0.7,
  };
}

export function sectionCountFromExtension(extension: number): number {
  const layers = layersFromExtension(extension);
  return [layers.lead, layers.harmony, layers.body, layers.bass].filter(Boolean)
    .length;
}

export function readConductGesture(
  image: Landmark[],
  world: Landmark[],
  extension: number,
): ConductGesture {
  const fist = isFist(world);
  const layers = fist
    ? { lead: false, harmony: false, body: false, bass: false }
    : layersFromExtension(extension);
  const pan = panFromHand(image);
  const dynamics = fist ? 0.08 : dynamicsFromHand(image);

  let hint = "Lead — spread to add the ensemble";
  if (fist) hint = "Cut — fist mutes the orchestra";
  else {
    const n = sectionCountFromExtension(extension);
    if (n === 2) hint = "Lead + Harmony";
    else if (n === 3) hint = "Lead + Harmony + Body";
    else if (n >= 4) hint = "Tutti — full ensemble";
    hint += " · raise hand for volume";
  }
  if (!fist && pan < 0.35) hint += " · strings left";
  else if (!fist && pan > 0.65) hint += " · brass right";

  return { layers, dynamics, pan, cut: fist, swell: false, hint };
}
