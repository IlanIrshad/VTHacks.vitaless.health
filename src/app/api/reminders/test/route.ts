import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, type UserDoc } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { sendCheckInReminder } from "@/lib/email";

export const runtime = "nodejs";

/** Signed-in user sends themselves one real reminder email right now — for verifying the feature works, and for the demo. */
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const db = await getDb();
    const user = await db.collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) });
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    await sendCheckInReminder({ to: user.email, name: user.name, goals: user.preferences?.goals });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/reminders/test]", message);
    return NextResponse.json({ error: "Couldn't send that email right now." }, { status: 500 });
  }
}
