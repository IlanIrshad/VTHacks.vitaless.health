// Starts a background interval, once per server process, that checks for
// and sends any check-in reminder emails whose user-scheduled date/time has
// arrived. This app runs as a persistent Node process (`npm start` on the
// Vultr deployment target — see README), not a serverless host, so a plain
// in-process poll works and means reminders fire on their own without any
// external cron job being set up.
//
// Cached on `global` the same way src/lib/mongodb.ts caches its client
// promise, so Next's dev-mode hot reload doesn't start a second interval on
// every file save.

import { processDueReminders } from "./reminders";

const CHECK_INTERVAL_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var _reminderSchedulerStarted: boolean | undefined;
}

export function startReminderScheduler(): void {
  if (global._reminderSchedulerStarted) return;
  if (!process.env.MONGODB_URI) return; // Nothing to poll without accounts storage.
  global._reminderSchedulerStarted = true;

  const tick = () => {
    processDueReminders().catch((err) => {
      console.error("[reminderScheduler]", (err as Error).message);
    });
  };

  setInterval(tick, CHECK_INTERVAL_MS).unref();
}
