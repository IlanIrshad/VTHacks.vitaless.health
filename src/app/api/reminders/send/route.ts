import { NextRequest, NextResponse } from "next/server";
import { processDueReminders } from "@/lib/reminders";

export const runtime = "nodejs";

/**
 * Manually runs the same due-reminder check the background scheduler
 * (src/lib/reminderScheduler.ts) already runs every 60s on its own — this
 * route exists for ops visibility and for hosts that don't run this app as
 * a persistent process. Not meant to be hit from the browser — protected by
 * a shared secret (see README "Email check-in reminders").
 */
export async function POST(req: NextRequest) {
  const configuredSecret = process.env.REMINDER_CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "REMINDER_CRON_SECRET is not configured." }, { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/reminders/send]", message);
    return NextResponse.json({ error: "Couldn't run the reminder batch." }, { status: 500 });
  }
}
