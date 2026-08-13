import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { styleById, type EnsembleStyle } from "@/lib/styles";
import type { StyleId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error: "missing_token",
        message:
          "Add REPLICATE_API_TOKEN to .env.local to use MusicGen. Local synthesis will be used instead.",
      },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const styleId = (form.get("style") as StyleId) || "chamber";
    const style: EnsembleStyle = styleById(styleId);

    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "missing_audio", message: "Hum audio is required." },
        { status: 400 },
      );
    }

    const replicate = new Replicate({ auth: token });
    const bytes = Buffer.from(await audio.arrayBuffer());
    const mime = audio.type || "audio/wav";
    const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

    const output = await replicate.run("meta/musicgen", {
      input: {
        model_version: "stereo-melody-large",
        prompt: style.prompt,
        input_audio: dataUri,
        duration: 12,
        continuation: false,
        temperature: 1,
        top_k: 250,
        top_p: 0,
        classifier_free_guidance: 3,
        output_format: "mp3",
      },
    });

    const url = await normalizeOutputUrl(output);
    if (!url) {
      return NextResponse.json(
        { error: "no_output", message: "MusicGen returned no audio." },
        { status: 502 },
      );
    }

    // Proxy audio so the client gets a same-origin blob-friendly URL
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: "fetch_failed", message: "Could not download generated audio." },
        { status: 502 },
      );
    }
    const audioBytes = await audioRes.arrayBuffer();
    const contentType = audioRes.headers.get("content-type") || "audio/mpeg";

    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-VivAIdi-Source": "musicgen",
        "X-VivAIdi-Style": style.id,
      },
    });
  } catch (err) {
    console.error("[generate]", err);
    return NextResponse.json(
      {
        error: "generate_failed",
        message: err instanceof Error ? err.message : "Generation failed",
      },
      { status: 500 },
    );
  }
}

async function normalizeOutputUrl(output: unknown): Promise<string | null> {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "function") {
      return String(await (o.url as () => Promise<string> | string)());
    }
    if (typeof o.href === "string") return o.href;
  }
  return null;
}
