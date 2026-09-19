import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, type ConversationDoc } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

/** Returns the signed-in user's persisted Gemini chat history, oldest first. Anonymous users get an empty array. */
export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ messages: [] });

  try {
    const db = await getDb();
    const convo = await db
      .collection<ConversationDoc>("conversations")
      .findOne({ userId: new ObjectId(userId) });
    return NextResponse.json({ messages: convo?.messages ?? [] });
  } catch (err) {
    console.warn("[/api/conversation] lookup failed:", (err as Error).message);
    return NextResponse.json({ messages: [] });
  }
}
