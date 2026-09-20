# Vitaless — AI-powered wellness (VTHacks 2026)

A health & wellness web app with an AI companion ("Sage") that reacts to the
user's live biometric state and leads narrated guided routines (breathing,
mindfulness, focus, energy).

## Sponsor tool integrations

| Tool | Role in this app |
|---|---|
| **Presage** (Human Sensing Layer) | The *only* biometric source — estimates heart rate, respiration rate, and heart-rate variability from short webcam clips, which we turn into stress/focus/energy scores that drive the whole experience. There is deliberately no simulated fallback: without a working camera and a configured Presage key, the app shows no reading rather than inventing one. See the note in `src/lib/presage.ts` — Presage's public SDKs are iOS/Android/C++ only, so the browser records a clip and our server forwards it to Presage's Physiology API. |
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

Nothing crashes if a key is missing. For Gemini/ElevenLabs/Mongo, that
feature just falls back to a text-only/unavailable mode so the rest of the
demo keeps working. `PRESAGE_API_KEY` is the exception: without it, the app
shows no biometric reading at all — it will never substitute a fake one.

## How the biometric-reactive routines work

1. `WebcamCapture` records a ~4s clip every 12s and posts it to `POST /api/biometrics`.
2. The API route forwards the clip to Presage and derives `stressLevel` /
   `focusLevel` / `energyLevel` (0–1) from the real returned heart rate,
   respiration rate, and (when present) heart-rate variability. If
   `PRESAGE_API_KEY` isn't set, or Presage can't process the clip, the route
   returns an error instead of a reading — never a fabricated one.
3. `pickRoutineForState()` (`src/lib/routines.ts`) recommends a routine —
   e.g. box breathing when stress is high, a focus reset when focus is low.
4. `adaptRoutine()` stretches or compresses each step's duration based on
   the live reading — e.g. breathing steps get longer under higher stress.
5. Each step's narration is sent to `/api/voice` (ElevenLabs) and played
   aloud as the routine progresses.
6. Every sample is logged to the Tiger Data hypertable via `/api/biometrics`,
   and `GET /api/sessions` returns recent history for the Trends tab.

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
  app/
    page.tsx                 Root: shared state (biometrics, chat, auth) + tab views
    api/
      companion/route.ts     POST -> Gemini reply (+ persists chat turn if signed in)
      voice/route.ts         POST -> ElevenLabs audio (mp3)
      biometrics/route.ts    POST -> Presage reading + Tiger Data log
      sessions/route.ts      GET  -> recent biometric history (Trends tab)
      conversation/route.ts  GET  -> signed-in user's persisted chat history
      profile/route.ts       GET/PUT -> signed-in user's preferences
      auth/
        signup, login, logout, me   Account + session endpoints
  components/
    WebcamCapture.tsx        Always-mounted sensing loop, posts to /api/biometrics
    DashboardView, LiveSessionView, RoutinesView, TrendsView   The 4 tabs
    RoutinePlayer.tsx        Step-by-step narrated routine player + session summary
    BreathingCircle.tsx      Pacing-synced breathing visual
    TopNav.tsx                Tab nav + account menu
    AuthModal.tsx, AccountSettingsModal.tsx   Sign-in/up and preferences UI
  lib/
    presage.ts, gemini.ts, elevenlabs.ts, routines.ts, trend.ts, chat.ts
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
