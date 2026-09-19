// Password hashing + session tokens for optional user accounts.
//
// Sign-in is deliberately optional everywhere it's checked: every route
// that reads a session falls back to anonymous/demo-user behavior when
// there isn't one, matching every other integration in this app (missing
// key/session -> graceful fallback, never a hard failure). Requires
// SESSION_SECRET in the environment (any long random string — see
// .env.example for how to generate one).

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "vitaless_session";
const SESSION_TTL = "30d";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to .env.local (see .env.example).");
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, getSecret(), { expiresIn: SESSION_TTL });
}

/** Returns the logged-in user's id, or null if there's no session, it's expired, or SESSION_SECRET isn't configured. */
export function getUserIdFromRequest(req: NextRequest): string | null {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = jwt.verify(token, getSecret()) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
