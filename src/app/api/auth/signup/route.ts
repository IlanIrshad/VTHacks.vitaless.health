import { NextRequest, NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/mongodb";
import { hashPassword, signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection<UserDoc>("users");
    await users.createIndex({ email: 1 }, { unique: true });

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const doc: UserDoc = { email, passwordHash, name, createdAt: new Date(), preferences: {} };
    const result = await users.insertOne(doc);

    const token = signSessionToken(result.insertedId.toString());
    const res = NextResponse.json({
      user: { id: result.insertedId.toString(), email, name, preferences: {} },
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/auth/signup]", message);
    return NextResponse.json({ error: "Sign-up failed. Please try again." }, { status: 500 });
  }
}
