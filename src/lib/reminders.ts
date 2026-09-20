// Shared logic for actually sending due check-in reminder emails — the
// single-user date+time a user picks in Account settings
// (preferences.reminderScheduledAt) is a one-time send, not a recurring
// daily one. Used by both the in-process background scheduler
// (src/lib/reminderScheduler.ts, the normal path when the app is deployed
// as a persistent Node process) and the manually-triggerable
// POST /api/reminders/send route (for ops/testing on hosts that don't run
// a persistent process).

import { getDb, type UserDoc } from "./mongodb";
import { sendCheckInReminder } from "./email";

export interface ReminderBatchResult {
  due: number;
  sent: number;
  failed: number;
}

/** Sends every check-in reminder whose scheduled time has arrived, then clears the schedule so it fires exactly once. */
export async function processDueReminders(): Promise<ReminderBatchResult> {
  const db = await getDb();
  const now = new Date();

  // $type: "date" excludes docs where the field is null/missing — without
  // it, $lte would still match those under MongoDB's cross-type BSON
  // ordering (Null sorts below Date), and every non-scheduled user would
  // get emailed.
  const dueUsers = await db
    .collection<UserDoc>("users")
    .find({ "preferences.reminderScheduledAt": { $type: "date", $lte: now } })
    .toArray();

  let sent = 0;
  let failed = 0;
  for (const user of dueUsers) {
    try {
      await sendCheckInReminder({ to: user.email, name: user.name, goals: user.preferences?.goals });
      await db
        .collection<UserDoc>("users")
        .updateOne({ _id: user._id }, { $set: { "preferences.lastReminderSentAt": now, "preferences.reminderScheduledAt": null } });
      sent += 1;
    } catch (err) {
      // Left scheduled on failure (e.g. Resend down) so the next tick retries it automatically.
      failed += 1;
      console.error("[reminders]", user.email, (err as Error).message);
    }
  }

  return { due: dueUsers.length, sent, failed };
}
