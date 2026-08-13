"use client";

import { useEffect, useRef } from "react";
import {
  centroid,
  convexHull,
  defaultLayers,
  fingertipPoints,
  gestureSignature,
  handExtension,
  isFist,
  readConductGesture,
  restedGesture,
  type Landmark,
} from "@/lib/gestures";
import type { ConductGesture } from "@/lib/gestures";
import {
  getHandLandmarker,
  resetHandLandmarker,
} from "@/lib/hand-tracker";
import type { ConductGroupSpec } from "@/lib/styles";

/** A cut has to be meant — a single misread frame should not stop the music. */
const FIST_FRAMES = 2;
/** How long the hands may be out of shot before the ensemble is let off a cut. */
const REST_AFTER_MS = 700;
/**
 * Conducting is a slow gesture, so inference runs well below display rate. This
 * leaves the main thread free for audio scheduling, which is what actually has
 * a deadline.
 */
const DETECT_INTERVAL_MS = 55;
/** The overlay is a decorative wash scaled up by CSS; it needs no more than this. */
const OVERLAY_WIDTH = 960;

export function PodiumCamera({
  groups,
  onGesture,
}: {
  groups: ConductGroupSpec[];
  onGesture: (g: ConductGesture) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const lastSig = useRef("");
  const smoothExt = useRef(0);
  const fistFrames = useRef(0);
  const lastSeen = useRef(0);
  const rested = useRef(true);
  const lastLayers = useRef(defaultLayers(groups));
  const onGestureRef = useRef(onGesture);
  const groupsRef = useRef(groups);

  // The detection loop runs outside React, so it reads the latest values here.
  useEffect(() => {
    onGestureRef.current = onGesture;
    groupsRef.current = groups;
  }, [groups, onGesture]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let landmarker: any = null;
    let detectInFlight = false;
    let lastVideoTimestamp = 0;
    let recovering = false;

    async function ensureLandmarker() {
      if (cancelled) return null;
      landmarker = await getHandLandmarker();
      return landmarker;
    }

    async function setup() {
      try {
        landmarker = await ensureLandmarker();
        if (!landmarker || cancelled) return;

        stream = await navigator.mediaDevices.getUserMedia({
          // ideal, not exact — many cameras reject a hard 640×480 constraint.
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        let lastDetect = 0;

        const loop = () => {
          if (cancelled || !videoRef.current) return;
          const videoEl = videoRef.current;
          const elapsed = performance.now() - lastDetect;
          if (
            landmarker &&
            videoEl.readyState >= 2 &&
            elapsed >= DETECT_INTERVAL_MS &&
            !detectInFlight
          ) {
            lastDetect = performance.now();
            detectInFlight = true;
            try {
              const timestamp = Math.max(lastVideoTimestamp + 1, performance.now());
              lastVideoTimestamp = timestamp;
              const result = landmarker.detectForVideo(videoEl, timestamp);
              const image = result.landmarks?.[0] as Landmark[] | undefined;
              const world =
                (result.worldLandmarks?.[0] as Landmark[] | undefined) ?? image;
              const now = performance.now();
              const ext = world ? handExtension(world) : 0;
              smoothExt.current = smoothExt.current * 0.4 + ext * 0.6;
              draw(image, smoothExt.current, now);

              if (world && image) {
                lastSeen.current = now;
                rested.current = false;
                fistFrames.current = isFist(world) ? fistFrames.current + 1 : 0;
                const g = readConductGesture(
                  image,
                  world,
                  smoothExt.current,
                  groupsRef.current,
                  fistFrames.current >= FIST_FRAMES,
                );
                if (!g.cut) lastLayers.current = g.layers;
                const sig = gestureSignature(g);
                if (sig !== lastSig.current) {
                  lastSig.current = sig;
                  onGestureRef.current(g);
                }
              } else if (
                !rested.current &&
                lastSeen.current > 0 &&
                now - lastSeen.current > REST_AFTER_MS
              ) {
                // Hands out of shot: never leave the ensemble stuck under a cut.
                rested.current = true;
                fistFrames.current = 0;
                const g = restedGesture(groupsRef.current, lastLayers.current);
                lastSig.current = gestureSignature(g);
                onGestureRef.current(g);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (message.includes("Aborted") && !recovering) {
                // A closed singleton was the usual cause — reload once and keep going.
                recovering = true;
                resetHandLandmarker();
                landmarker = null;
                lastVideoTimestamp = 0;
                void ensureLandmarker()
                  .then((lm) => {
                    recovering = false;
                    if (!cancelled) landmarker = lm;
                  })
                  .catch((reloadErr) => {
                    recovering = false;
                    console.error(reloadErr);
                  });
              } else if (!message.includes("Aborted")) {
                console.error(err);
              }
            } finally {
              detectInFlight = false;
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        console.error(err);
        onGestureRef.current({
          layers: defaultLayers(groupsRef.current),
          dynamics: 0.7,
          focus: 0.5,
          cut: false,
          hint: "Camera unavailable — use the section pads",
        });
      }
    }

    function draw(
      hand: Landmark[] | undefined,
      extension: number,
      now: number,
    ) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      // Resizing a canvas clears and reallocates it, so only do so when the
      // camera's aspect actually changes.
      const height = Math.round(
        OVERLAY_WIDTH / (video.videoWidth / video.videoHeight || 4 / 3),
      );
      if (canvas.width !== OVERLAY_WIDTH || canvas.height !== height) {
        canvas.width = OVERLAY_WIDTH;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!hand) return;
      drawPrism(ctx, hand, canvas.width, canvas.height, now, extension);
    }

    void setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      // The landmarker is a session-wide singleton — closing it here left the
      // cached instance in an Aborted state on the next mount.
    };
  }, []);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-50"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full scale-x-[-1]"
      />
    </div>
  );
}

function drawPrism(
  ctx: CanvasRenderingContext2D,
  hand: Landmark[],
  w: number,
  h: number,
  now: number,
  extension: number,
) {
  const tips = fingertipPoints(hand);
  if (tips.length < 3) return;

  const hull = convexHull(tips);
  const toPx = (p: Landmark) => ({ x: p.x * w, y: p.y * h });
  const poly = hull.map(toPx);
  const tipsPx = tips.map(toPx);
  const c = toPx(centroid(tips));
  const pulse = 0.55 + 0.45 * Math.sin(now / 420);
  const energy = Math.min(1, Math.max(0.15, (extension - 0.35) / 0.6));

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  pathPoly(ctx, poly);
  ctx.closePath();
  ctx.shadowColor = `rgba(232, 165, 72, ${0.25 + energy * 0.35})`;
  ctx.shadowBlur = 28 + energy * 24;
  ctx.fillStyle = `rgba(232, 165, 72, ${0.04 + energy * 0.06})`;
  ctx.fill();
  ctx.shadowBlur = 0;

  const grad = ctx.createRadialGradient(c.x, c.y, 8, c.x, c.y, 160 + energy * 60);
  grad.addColorStop(0, `rgba(242, 240, 236, ${0.14 + pulse * 0.06})`);
  grad.addColorStop(0.45, `rgba(232, 165, 72, ${0.1 + energy * 0.08})`);
  grad.addColorStop(1, "rgba(232, 165, 72, 0.03)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  pathPoly(ctx, poly);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(242, 240, 236, ${0.22 + energy * 0.2})`;
  ctx.lineWidth = 1;
  for (const p of poly) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  const inner = poly.map((p) => ({
    x: c.x + (p.x - c.x) * 0.42,
    y: c.y + (p.y - c.y) * 0.42,
  }));
  ctx.beginPath();
  pathPoly(ctx, inner);
  ctx.closePath();
  ctx.strokeStyle = `rgba(232, 165, 72, ${0.35 + pulse * 0.2})`;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  ctx.beginPath();
  pathPoly(ctx, poly);
  ctx.closePath();
  ctx.strokeStyle = `rgba(242, 240, 236, ${0.55 + energy * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (const p of tipsPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(242, 240, 236, 0.95)";
    ctx.shadowColor = "rgba(232, 165, 72, 0.7)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9 + pulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(232, 165, 72, ${0.2 + energy * 0.15})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function pathPoly(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
) {
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}
