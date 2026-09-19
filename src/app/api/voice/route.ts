import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { getUserIdFromRequest } from "@/lib/auth";
import { getDb, type UserDoc } from "@/lib/mongodb";

export const runtime = "nodejs";

interface VoiceRequestBody {
  text: string;
}

/** A signed-in user's chosen voice, or undefined to fall back to the env-default narrator voice. Best-effort — a Mongo outage should never break narration. */
async function preferredVoiceId(req: NextRequest): Promise<string | undefined> {
  const userId = getUserIdFromRequest(req);
  if (!userId) return undefined;
  try {
    const db = await getDb();
    const user = await db.collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) });
    return user?.preferences?.preferredVoiceId || undefined;
  } catch (err) {
    console.warn("[/api/voice] couldn't load preferred voice:", (err as Error).message);
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VoiceRequestBody;
    if (!body?.text || typeof body.text !== "string") {
      return NextResponse.json({ error: "Missing 'text' string in request body." }, { status: 400 });
    }

    const voiceId = await preferredVoiceId(req);
    const audio = await synthesizeSpeech(body.text, voiceId);
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
