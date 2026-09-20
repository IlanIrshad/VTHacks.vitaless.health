import { NextRequest, NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/mongodb";
import { sendCheckInReminder } from "@/lib/email";

export const runtime = "nodejs";

const MIN_HOURS_BETWEEN_SENDS = 20;

/**
 * Batch-sends real check-in reminder emails to every opted-in user. Not
 * meant to be hit from the browser — protected by a shared secret and meant
 * to be triggered by a system cron job (see README "Email reminders").
 *
 * Example crontab entry (once a day):
 *   0 14 * * * curl -s -X POST https://your-domain/api/reminders/send \
 *     -H "x-cron-secret: $REMINDER_CRON_SECRET"
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
    const db = await getDb();
    const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN_SENDS * 60 * 60 * 1000);
    const users = await db
      .collection<UserDoc>("users")
      .find({
        "preferences.notifyCheckIns": true,
        $or: [{ "preferences.lastReminderSentAt": { $exists: false } }, { "preferences.lastReminderSentAt": { $lt: cutoff } }],
      })
      .toArray();

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        await sendCheckInReminder({ to: user.email, name: user.name, goals: user.preferences?.goals });
        await db.collection<UserDoc>("users").updateOne({ _id: user._id }, { $set: { "preferences.lastReminderSentAt": new Date() } });
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error("[/api/reminders/send]", user.email, (err as Error).message);
      }
    }

    return NextResponse.json({ sent, failed, eligible: users.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/reminders/send]", message);
    return NextResponse.json({ error: "Couldn't run the reminder batch." }, { status: 500 });
  }
}
