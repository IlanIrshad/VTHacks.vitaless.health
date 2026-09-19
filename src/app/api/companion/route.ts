import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCompanionReply, type BiometricSnapshot, type CompanionTurn } from "@/lib/gemini";
import { getDb, type ConversationDoc } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface CompanionRequestBody {
  message: string;
  history?: CompanionTurn[];
  biometrics?: BiometricSnapshot;
}

/** Best-effort append to the user's persisted chat history — a Mongo outage should never break the companion. */
async function persistTurn(userId: string, userText: string, companionText: string) {
  try {
    const db = await getDb();
    const now = new Date();
    await db.collection<ConversationDoc>("conversations").updateOne(
      { userId: new ObjectId(userId) },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", text: userText, timestamp: now },
              { role: "companion", text: companionText, timestamp: now },
            ],
          },
        },
        $setOnInsert: { userId: new ObjectId(userId), createdAt: now },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("[/api/companion] chat history not persisted:", (err as Error).message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompanionRequestBody;

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "Missing 'message' string in request body." }, { status: 400 });
    }

    const reply = await getCompanionReply(body.message, body.history ?? [], body.biometrics);

    const userId = getUserIdFromRequest(req);
    if (userId) persistTurn(userId, body.message, reply);

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/companion]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
