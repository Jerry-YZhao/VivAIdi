const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type HandLandmarker = any;

let instance: HandLandmarker | null = null;
let pending: Promise<HandLandmarker> | null = null;

async function createLandmarker(): Promise<HandLandmarker> {
  const { HandLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const options = {
    runningMode: "VIDEO" as const,
    numHands: 1,
  };

  try {
    return await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    });
  } catch {
    // GPU delegate is unavailable on some browsers and devices.
    return HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  }
}

/**
 * The WASM runtime and model are several megabytes and cost a long main-thread
 * pause to compile. Loading them once and keeping them means stepping onto the
 * podium does not stall playback.
 */
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (instance) return Promise.resolve(instance);
  if (!pending) {
    pending = createLandmarker()
      .then((lm) => {
        instance = lm;
        return lm;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/**
 * Drop a closed or broken landmarker so the next call loads a fresh one.
 * Call this after MediaPipe throws Aborted(), not on every component unmount.
 */
export function resetHandLandmarker() {
  if (instance?.close) {
    try {
      instance.close();
    } catch {
      /* already closed */
    }
  }
  instance = null;
  pending = null;
}

/** Start fetching while the singer is still humming. */
export function prewarmHandTracker() {
  void getHandLandmarker().catch(() => {});
}
