import { NextRequest, NextResponse } from "next/server";
import { getRecentHistory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "demo-user";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 100);

  try {
    const rows = await getRecentHistory(userId, limit);
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/sessions]", message);
    // Non-fatal — history is a nice-to-have; return an empty set instead of a 500
    // so the dashboard still renders if the DB isn't set up yet.
    return NextResponse.json({ rows: [], warning: message });
  }
}
