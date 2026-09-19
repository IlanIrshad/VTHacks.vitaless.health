import { NextRequest, NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/mongodb";
import { verifyPassword, signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection<UserDoc>("users");
    const user = await users.findOne({ email });

    // Same message whether the email doesn't exist or the password is wrong,
    // so a login attempt can't be used to enumerate registered emails.
    const invalid = () => NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

    if (!user) return invalid();
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return invalid();

    const token = signSessionToken(user._id!.toString());
    const res = NextResponse.json({
      user: { id: user._id!.toString(), email: user.email, name: user.name, preferences: user.preferences ?? {} },
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
    console.error("[/api/auth/login]", message);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
