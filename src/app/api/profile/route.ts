import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, type UserDoc, type UserPreferences } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const db = await getDb();
    const user = await db.collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) });
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    return NextResponse.json({ preferences: user.preferences ?? {} });
  } catch (err) {
    console.error("[/api/profile]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't load preferences." }, { status: 500 });
  }
}

const ALLOWED_KEYS: (keyof UserPreferences)[] = [
  "timezone",
  "goals",
  "preferredVoiceId",
  "preferredRoutineId",
  "notifyCheckIns",
];

export async function PUT(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Partial<UserPreferences> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body) updates[key] = body[key];
    }

    const db = await getDb();
    const prefixed = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`preferences.${k}`, v]));
    await db.collection<UserDoc>("users").updateOne({ _id: new ObjectId(userId) }, { $set: prefixed });

    const user = await db.collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) });
    return NextResponse.json({ preferences: user?.preferences ?? {} });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/profile]", message);
    return NextResponse.json({ error: "Couldn't save preferences." }, { status: 500 });
  }
}
