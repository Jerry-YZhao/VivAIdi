import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    musicgen: Boolean(process.env.REPLICATE_API_TOKEN),
  });
}
