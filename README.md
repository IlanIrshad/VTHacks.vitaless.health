# Sage — Health Companion (VTHacks 2026)

A health & wellness web app with an AI companion ("Sage") that reacts to the
user's live biometric state and leads narrated guided routines (breathing,
mindfulness, focus, energy).

## Sponsor tool integrations

| Tool | Role in this app |
|---|---|
| **Presage** (Human Sensing Layer) | Primary, contactless biometric source — estimates heart rate & respiration rate from short webcam clips, which we turn into stress/focus/energy scores that drive the whole experience. See the note in `src/lib/presage.ts` — Presage's public SDKs are iOS/Android/C++ only, so the browser records a clip and our server forwards it to Presage's Physiology API. |
| **Google Gemini API** | Powers Sage's conversational replies and per-routine spoken intros, using live biometrics as context (`src/lib/gemini.ts`). |
| **ElevenLabs** | Turns Sage's replies and routine narration into spoken audio (`src/lib/elevenlabs.ts`). |
| **Tiger Data (TimescaleDB)** | Stores every biometric sample as a hypertable (`db/schema.sql`) with a continuous aggregate for fast "stress over time" queries. |
| **Vultr** *(not yet wired up)* | Intended deployment target — see "Deploying" below. |
| **GoDaddy** *(not yet wired up)* | Register a project domain and point it at the Vultr deployment for the "Best Domain Name" award. |

The app is fully demoable **without any API keys**: every integration has a
graceful fallback (simulated biometrics, and text-only companion replies if
voice/Gemini keys are missing), so you can develop the UI before sponsor
credentials are issued at check-in.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the keys you have
npm run db:init              # optional — only if DATABASE_URL is set
npm run dev
```

Open http://localhost:3000. Grant camera access when prompted (or skip it —
the app falls back to simulated biometrics automatically).

## Environment variables

See `.env.example` for the full list and where to get each key:

- `GEMINI_API_KEY` — Google AI Studio
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` — ElevenLabs (use the VTHacks promo code at check-in)
- `PRESAGE_API_KEY`, `PRESAGE_API_BASE_URL` — Presage dashboard (confirm the real base URL/endpoint paths once you have access — see the comment at the top of `src/lib/presage.ts`)
- `DATABASE_URL` — Tiger Data connection string

Nothing crashes if a key is missing — that feature just falls back to a
simulated/text-only mode so the rest of the demo keeps working.

## How the biometric-reactive routines work

1. `WebcamCapture` records a ~4s clip every 12s and posts it to `POST /api/biometrics`.
2. The API route forwards the clip to Presage (or, with no key, returns a
   simulated-but-plausible reading) and derives `stressLevel` / `focusLevel`
   / `energyLevel` (0–1) from heart rate & respiration rate.
3. `pickRoutineForState()` (`src/lib/routines.ts`) recommends a routine —
   e.g. box breathing when stress is high, a focus reset when focus is low.
4. `adaptRoutine()` stretches or compresses each step's duration based on
   the live reading — e.g. breathing steps get longer under higher stress.
5. Each step's narration is sent to `/api/voice` (ElevenLabs) and played
   aloud as the routine progresses.
6. Every sample is logged to the Tiger Data hypertable via `/api/biometrics`,
   and `GET /api/sessions` returns recent history for a future trends view.

## Project structure

```
src/
  app/
    page.tsx                 Main screen (sensing + companion + routine)
    api/
      companion/route.ts     POST -> Gemini reply
      voice/route.ts         POST -> ElevenLabs audio (mp3)
      biometrics/route.ts    POST -> Presage reading + DB log
      sessions/route.ts      GET  -> recent biometric history
  components/
    WebcamCapture.tsx        Records clips, posts to /api/biometrics
    BiometricsPanel.tsx      Live vitals/stress/focus/energy tiles
    CompanionChat.tsx        Chat UI with Sage
    RoutinePlayer.tsx        Step-by-step narrated routine player
  lib/
    presage.ts, gemini.ts, elevenlabs.ts, db.ts, routines.ts
db/
  schema.sql                 Tiger Data / TimescaleDB hypertable + continuous aggregate
scripts/
  init-db.js                 Applies db/schema.sql (npm run db:init)
```

## Deploying (Vultr + GoDaddy, for the low-effort sponsor awards)

1. Spin up a Vultr instance (or use their one-click Node/Next.js app), push
   this repo, run `npm install && npm run build && npm start`.
2. Register a project domain via GoDaddy (promo code `MLH0918VTH`) and point
   its DNS A record at the Vultr instance's IP.

## Judging notes

This README doubles as the write-up for "meaningful, demoable" sponsor tool
integration — each tool above is called in a real code path, not just
mentioned. If a key isn't available for a given sponsor at demo time, say so
and show the graceful fallback instead of claiming the integration works.
