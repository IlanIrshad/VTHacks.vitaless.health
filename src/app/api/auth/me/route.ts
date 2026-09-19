import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, type UserDoc } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ user: null });

  try {
    const db = await getDb();
    const user = await db.collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) });
    if (!user) return NextResponse.json({ user: null });
    return NextResponse.json({
      user: { id: user._id!.toString(), email: user.email, name: user.name, preferences: user.preferences ?? {} },
    });
  } catch (err) {
    // MongoDB unreachable — treat as logged out rather than erroring the whole app.
    console.warn("[/api/auth/me] lookup failed:", (err as Error).message);
    return NextResponse.json({ user: null });
  }
}
