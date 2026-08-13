"use client";

import { useEffect, useRef } from "react";
import {
  centroid,
  convexHull,
  fingertipPoints,
  handExtension,
  readConductGesture,
  type Landmark,
} from "@/lib/gestures";
import type { ConductGesture } from "@/lib/gestures";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

export function PodiumCamera({
  onGesture,
}: {
  onGesture: (g: ConductGesture) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const lastSig = useRef("");
  const smoothExt = useRef(0);
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let landmarker: any = null;

    async function setup() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { HandLandmarker, FilesetResolver } = vision;
        const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
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

        const loop = () => {
          if (cancelled || !videoRef.current || !landmarker) return;
          const videoEl = videoRef.current;
          if (videoEl.readyState >= 2) {
            const result = landmarker.detectForVideo(
              videoEl,
              performance.now(),
            );
            const image = result.landmarks?.[0] as Landmark[] | undefined;
            const world =
              (result.worldLandmarks?.[0] as Landmark[] | undefined) ?? image;
            const now = performance.now();
            const ext = world ? handExtension(world) : 0;
            smoothExt.current = smoothExt.current * 0.4 + ext * 0.6;
            draw(image, smoothExt.current, now);

            if (world && image) {
              const g = readConductGesture(image, world, smoothExt.current);
              const sig = `${g.cut}-${g.swell}-${g.layers.harmony}-${g.layers.body}-${g.layers.bass}-${Math.round(g.pan * 8)}-${Math.round(g.dynamics * 10)}`;
              if (sig !== lastSig.current) {
                lastSig.current = sig;
                onGestureRef.current(g);
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        console.error(err);
        onGestureRef.current({
          layers: { lead: true, harmony: false, body: false, bass: false },
          dynamics: 0.7,
          pan: 0.5,
          cut: false,
          swell: false,
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
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
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
      landmarker?.close?.();
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
