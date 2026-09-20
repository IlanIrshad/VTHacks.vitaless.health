# Vitaless — AI-powered wellness (VTHacks 2026)

A health & wellness web app with an AI companion ("Sage") that reacts to the
user's live biometric state and leads narrated guided routines (breathing,
mindfulness, focus, energy).

## Sponsor tool integrations

| Tool | Role in this app |
|---|---|
| **Presage** (Human Sensing Layer) | The *only* biometric source — estimates heart rate and respiration rate from short webcam clips, which we turn into stress/focus/energy scores that drive the whole experience. There is deliberately no simulated fallback: without a working camera and a configured Presage key, the app shows no reading rather than inventing one. See the note in `src/lib/presage.ts` — Presage's public SDKs are iOS/Android/C++ only, so the browser records a clip and our server forwards it to Presage's Physiology API. |
| **Google Gemini API** | Powers Sage's conversational replies and per-routine spoken intros, using live biometrics as context (`src/lib/gemini.ts`). |
| **ElevenLabs** | Turns Sage's replies and routine narration into spoken audio (`src/lib/elevenlabs.ts`). |
| **Tiger Data (TimescaleDB)** | Stores every biometric sample as a hypertable (`db/schema.sql`) with a continuous aggregate for fast "stress over time" queries. |
| **MongoDB Atlas** | Optional user accounts — email/password (bcrypt-hashed), persisted Gemini chat history, and preferences (timezone, goals, preferred voice). Sign-in is opt-in; the app is fully usable anonymously (`src/lib/mongodb.ts`, `src/lib/auth.ts`). |
| **Vultr** *(not yet wired up)* | Intended deployment target — see "Deploying" below. |
| **GoDaddy** *(not yet wired up)* | Register a project domain and point it at the Vultr deployment for the "Best Domain Name" award. |

Most of the app is demoable without every key: Gemini/ElevenLabs/Tiger
Data/MongoDB all degrade gracefully (text-only companion replies, no voice,
no persistence) if their key is missing. **Biometrics are the one deliberate
exception** — there is no simulated fallback. Without a working camera and a
configured `PRESAGE_API_KEY`, the app shows no reading at all rather than
inventing one; every number on screen came from a real Presage measurement.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the keys you have
npm run db:init              # optional — only if DATABASE_URL is set
npm run dev
```

MongoDB needs no init script — collections and the unique index on
`users.email` are created automatically on first signup.

Open http://localhost:3000. Grant camera access when prompted — without it
(and without `PRESAGE_API_KEY` set), the app has no biometric data to show
and says so honestly rather than making numbers up.

## Environment variables

See `.env.example` for the full list and where to get each key:

- `GEMINI_API_KEY` — Google AI Studio. Default model is `gemini-3.6-flash` (confirmed live 2026-09-19 — earlier Flash models have been retired).
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` — ElevenLabs (use the VTHacks promo code at check-in)
- `PRESAGE_API_KEY`, `PRESAGE_API_BASE_URL` — Presage dashboard. Base URL + full request/response contract confirmed live 2026-09-19 (auth is `x-api-key`, not `Authorization: Bearer`; only the `/v2/*` upload endpoints are actually deployed) — see the comment at the top of `src/lib/presage.ts`.
- `DATABASE_URL` — Tiger Data connection string
- `MONGODB_URI`, `SESSION_SECRET` — MongoDB Atlas connection string + a random secret for signing session cookies (generate one with the command in `.env.example`)
- `RESEND_API_KEY`, `EMAIL_FROM`, `REMINDER_CRON_SECRET` — Resend (free tier) for real check-in reminder emails — see "Email check-in reminders" below.

Nothing crashes if a key is missing. For Gemini/ElevenLabs/Mongo/Resend,
that feature just falls back to a text-only/unavailable mode so the rest of
the demo keeps working. `PRESAGE_API_KEY` is the exception: without it, the
app shows no biometric reading at all — it will never substitute a fake one.

## How the biometric-reactive routines work

1. `WebcamCapture` records a ~4s clip every 12s and posts it to `POST /api/biometrics`.
2. The API route forwards the clip to Presage and derives `stressLevel` /
   `focusLevel` / `energyLevel` (0–1) from the real returned heart rate and
   respiration rate. If `PRESAGE_API_KEY` isn't set, or Presage can't
   process the clip, the route returns an error instead of a reading —
   never a fabricated one.
3. `pickRoutineForState()` (`src/lib/routines.ts`) recommends a routine —
   e.g. box breathing when stress is high, a focus reset when focus is low.
4. `adaptRoutine()` stretches or compresses each step's duration based on
   the live reading — e.g. breathing steps get longer under higher stress.
5. Each step's narration is sent to `/api/voice` (ElevenLabs) and played
   aloud as the routine progresses.
6. Every sample is logged to the Tiger Data hypertable via `/api/biometrics`,
   and `GET /api/sessions` returns recent history for the Trends tab.

## Body composition scan

The "Body scan" tab estimates body fat % from height, weight, age, and
gender using the Deurenberg (1991) formula — a real published equation, not
a Gemini guess:

```
BodyFat% = 1.2 * BMI + 0.23 * Age - 10.8 * sex - 5.4   (sex: 1 = male, 0 = female)
```

`src/lib/bodyComposition.ts` computes the number and its ACE category band
(e.g. "Average", "Fitness") entirely in code. Gemini (`getBodyCompositionInsight`
in `src/lib/gemini.ts`) only writes a short plain-language explanation of the
already-computed result — it's explicitly instructed never to invent or
recalculate the percentage. If live Presage vitals (heart rate, respiration)
are available they're shown alongside and passed to Gemini as context, but
they never factor into the formula itself — body fat % is derived only
from height/weight/age/gender, since that's what the formula is actually
validated on.

## Email check-in reminders

Signed-in users can pick an exact date and time in Account settings
("Email me a check-in reminder at") and get exactly one real reminder
email at that moment — via a native `<input type="datetime-local">`
(`src/components/AccountSettingsModal.tsx`), not a recurring daily send.
The email itself is sent via [Resend](https://resend.com/) (free tier, no
domain verification needed for their shared `onboarding@resend.dev`
sender) and personalized: `getCheckInReminderEmail` in `src/lib/gemini.ts`
writes the body from the user's actual saved wellness goal, or a generic
but still warm message if they haven't set one — it never invents a goal.

- The picked date+time is read in the browser's own local clock and sent
  to the server as an ISO timestamp (`src/lib/datetime.ts`), stored as
  `preferences.reminderScheduledAt`. Validated server-side
  (`/api/profile`) to be a real, future date/time. Clearing the field and
  saving cancels it.
- **`src/lib/reminderScheduler.ts`** — a background poller, started once
  per server process from `src/instrumentation.ts` (Next's `register()`
  hook, which runs when the server starts), checks every 60s for any
  `reminderScheduledAt` that's arrived and sends it (`src/lib/reminders.ts`
  → `processDueReminders()`), then clears the schedule so it fires exactly
  once. Because this app runs as a persistent Node process (`npm start` on
  the Vultr target below, not a serverless host), this "just works" with
  no cron setup — the reminder fires on its own while the server is up.
- **`POST /api/reminders/test`** — signed-in only, sends one reminder to the
  caller's own address immediately, ignoring any schedule. This is what the
  "Send me a test reminder now" button in Account settings hits, so the
  feature is demoable without waiting for a scheduled time.
- **`POST /api/reminders/send`** — manually runs the same due-reminder check
  the background poller already runs every 60s; exists for ops visibility
  and for hosts that don't run this app as a persistent process. Protected
  by a shared secret header (`x-cron-secret`, matched against
  `REMINDER_CRON_SECRET`), e.g.:
  ```
  curl -s -X POST https://your-domain/api/reminders/send \
    -H "x-cron-secret: $REMINDER_CRON_SECRET"
  ```

Timezone in Account settings is a separate dropdown of real IANA zones (via
the browser's own `Intl.supportedValuesOf("timeZone")`, defaulting to the
visitor's detected zone) rather than a free-text field — it's currently
informational (used as general profile context) rather than feeding the
reminder scheduler, since the reminder date/time picker already captures
the user's intended moment directly in their local clock.

## User accounts (optional)

Sign-in is entirely opt-in — every screen works fully anonymously first.
Signing in (via the "Sign in" button in the header) additionally:

- Persists Gemini chat history across visits (`conversations` collection),
  loaded back into the chat on the next sign-in.
- Persists preferences — timezone, wellness goals, preferred ElevenLabs
  voice, check-in reminders (`users.preferences`), editable from the
  "Account settings" menu.

Passwords are bcrypt-hashed (never stored in plain text); sessions are a
signed JWT in an httpOnly cookie (`src/lib/auth.ts`). There's deliberately no
email verification or password-reset flow — out of scope for the hackathon
timeline, same as everywhere else non-essential was cut (see the build plan).

## Project structure

```
src/
  instrumentation.ts          Next's server-start hook — boots the reminder scheduler
  app/
    page.tsx                 Root: shared state (biometrics, chat, auth) + tab views
    api/
      companion/route.ts     POST -> Gemini reply (+ persists chat turn if signed in)
      voice/route.ts         POST -> ElevenLabs audio (mp3)
      biometrics/route.ts    POST -> Presage reading + Tiger Data log
      body-composition/route.ts  POST -> body fat % estimate (formula) + Gemini insight
      sessions/route.ts      GET  -> recent biometric history (Trends tab)
      conversation/route.ts  GET  -> signed-in user's persisted chat history
      profile/route.ts       GET/PUT -> signed-in user's preferences (incl. reminderScheduledAt)
      reminders/
        test/route.ts         POST -> email the signed-in user one reminder now
        send/route.ts          POST -> cron-secret-protected manual run of the due-reminder check
      auth/
        signup, login, logout, me   Account + session endpoints
  components/
    WebcamCapture.tsx        Sensing loop (camera + Presage), posts to /api/biometrics —
                              only mounted while a tab that needs it is active
    DashboardView, LiveSessionView, RoutinesView, TrendsView, BodyScanView   The 5 tabs
    RoutinePlayer.tsx        Step-by-step narrated routine player + session summary
    BreathingCircle.tsx      Pacing-synced breathing visual
    TopNav.tsx                Tab nav + account menu
    AuthModal.tsx, AccountSettingsModal.tsx   Sign-in/up and preferences UI
  lib/
    presage.ts, gemini.ts, elevenlabs.ts, routines.ts, trend.ts, chat.ts
    bodyComposition.ts       Deurenberg formula + ACE category bands (body fat %)
    email.ts                 Resend client, sends the check-in reminder email
    reminders.ts             processDueReminders() — the actual due-reminder send logic
    reminderScheduler.ts     Starts the 60s background poll (once per server process)
    timezones.ts             Real IANA timezone list for the settings dropdown
    datetime.ts               <input type="datetime-local"> <-> ISO timestamp conversion
    db.ts                    Tiger Data (Postgres) client
    mongodb.ts, auth.ts      MongoDB client + password/session helpers
db/
  schema.sql                 Tiger Data / TimescaleDB hypertable + continuous aggregate
scripts/
  init-db.js                 Applies db/schema.sql (npm run db:init) — Tiger Data only;
                              MongoDB collections/indexes are created on first signup
```

## Deploying (Vultr + GoDaddy, for the low-effort sponsor awards)

1. Spin up a Vultr instance (or use their one-click Node/Next.js app), push
   this repo, run `npm install && npm run build && npm start`.
2. Register a project domain via GoDaddy (promo code `MLH0918VTH`) and point
   its DNS A record at the Vultr instance's IP.

## Judging notes

This README doubles as the write-up for "meaningful, demoable" sponsor tool
integration — each tool above is called in a real code path, not just
mentioned. If a key isn't available for Gemini/ElevenLabs/Mongo at demo
time, say so and show the graceful fallback instead of claiming the
integration works. Presage has no fallback to fall back to — if its key
isn't working, the honest thing to show is no biometric reading, not a
fake one.
