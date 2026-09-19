import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";

export const runtime = "nodejs";

interface VoiceRequestBody {
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VoiceRequestBody;
    if (!body?.text || typeof body.text !== "string") {
      return NextResponse.json({ error: "Missing 'text' string in request body." }, { status: 400 });
    }

    const audio = await synthesizeSpeech(body.text);
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/voice]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
