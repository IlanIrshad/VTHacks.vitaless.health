// Real email sending for check-in reminders, via Resend
// (https://resend.com — free tier, no domain verification needed to send
// from their shared `onboarding@resend.dev` address). Requires
// RESEND_API_KEY in the environment; EMAIL_FROM is optional and defaults to
// that shared address.
//
// The email body is written by Gemini (getCheckInReminderEmail in
// src/lib/gemini.ts), personalized to the user's stated wellness goals —
// same "real data only, no invented content" spirit as the rest of the app:
// if the user hasn't set a goal, the email says something encouraging and
// generic instead of making one up.

import { Resend } from "resend";
import { getCheckInReminderEmail } from "./gemini";

const FROM_ADDRESS = process.env.EMAIL_FROM || "Vitaless <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set. Add it to .env.local (see .env.example).");
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(name: string, body: string): string {
  const paragraphs = body
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p)}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#0b1120;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#12192e;border-radius:16px;padding:32px;color:#e7ecf7;">
      <div style="font-size:20px;font-weight:700;margin-bottom:18px;">Vitaless</div>
      <p style="margin:0 0 14px;">Hi ${escapeHtml(name)},</p>
      ${paragraphs}
      <p style="margin:20px 0 0;font-size:13px;color:#8b93a7;">
        You're getting this because "Remind me to check in" is on in your
        Vitaless account settings. Turn it off any time from there.
      </p>
    </div>
  </body>
</html>`;
}

/** Sends one real check-in reminder email, personalized to the user's goals if they've set any. */
export async function sendCheckInReminder(params: { to: string; name: string; goals?: string }): Promise<void> {
  const { to, name, goals } = params;
  const resend = getClient();

  let body: string;
  try {
    body = await getCheckInReminderEmail({ name, goals });
  } catch (err) {
    // Gemini being unavailable (rate-limited, no key, etc.) shouldn't block
    // the reminder itself — same "don't let the AI touch be a single point
    // of failure" fallback used in /api/body-composition. Deliberately
    // always generic here, never echoing the user's raw goals text: Gemini
    // is given explicit tone/safety instructions for how to reference a
    // goal (see getCheckInReminderEmail in lib/gemini.ts); a plain string
    // template has none of that judgment, so it must not repeat
    // free-text user input back verbatim.
    console.warn("[email] Gemini reminder body unavailable, using generic fallback:", (err as Error).message);
    body = "Just a friendly nudge to open Vitaless for a quick check-in whenever you have a moment.";
  }
  const subject = "A quick check-in from Vitaless";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html: buildHtml(name, body),
    text: `Hi ${name},\n\n${body}`,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
