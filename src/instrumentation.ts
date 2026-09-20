// Next.js calls register() once when the server process starts (Node.js
// runtime only — this file is also imported for the Edge runtime, where the
// reminder scheduler can't run, hence the NEXT_RUNTIME check). This is what
// actually kicks off the check-in reminder background poller — see
// src/lib/reminderScheduler.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderScheduler } = await import("./lib/reminderScheduler");
    startReminderScheduler();
  }
}
