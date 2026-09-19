// Wrapper around the Gemini API for the AI companion's dialogue and
// routine narration generation. Requires GEMINI_API_KEY in the environment.
// Docs: https://ai.google.dev/gemini-api/docs/quickstart

import { GoogleGenAI } from "@google/genai";

// Default model kept in one place / overridable via env, since Gemini model
// IDs are versioned and change over time (checked against
// https://ai.google.dev/gemini-api/docs/models as of Sep 2026 — a fast
// Flash-tier model is the right fit for a hackathon chatbot's latency/cost).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).");
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export interface BiometricSnapshot {
  heartRateBpm?: number;
  respirationRateBpm?: number;
  stressLevel?: number; // 0-1, derived
  focusLevel?: number; // 0-1, derived
  energyLevel?: number; // 0-1, derived
}

export interface CompanionTurn {
  role: "user" | "companion";
  text: string;
}

const COMPANION_PERSONA = `You are "Sage", a warm, encouraging AI wellness companion inside a
health app. You see the user's live biometric signals (heart rate, stress,
focus, energy — estimated from a camera-based sensing SDK) alongside what
they say. Use this context to personalize your response, but:
- Keep replies short (2-4 sentences) — this is a voice companion, not an essay.
- Never make medical claims or diagnoses. You are a wellness coach, not a clinician.
- When biometrics suggest elevated stress or low focus/energy, gently suggest
  a guided routine (box breathing, body scan, focus reset, or energy boost)
  rather than just describing how the user feels.
- Be specific and actionable, not generic.`;

function describeBiometrics(b?: BiometricSnapshot): string {
  if (!b) return "No live biometric reading yet.";
  const parts: string[] = [];
  if (b.heartRateBpm) parts.push(`heart rate ${Math.round(b.heartRateBpm)} bpm`);
  if (b.respirationRateBpm) parts.push(`respiration ${Math.round(b.respirationRateBpm)} breaths/min`);
  if (b.stressLevel !== undefined) parts.push(`stress ${Math.round(b.stressLevel * 100)}%`);
  if (b.focusLevel !== undefined) parts.push(`focus ${Math.round(b.focusLevel * 100)}%`);
  if (b.energyLevel !== undefined) parts.push(`energy ${Math.round(b.energyLevel * 100)}%`);
  return parts.length ? parts.join(", ") : "No live biometric reading yet.";
}

export async function getCompanionReply(
  userMessage: string,
  history: CompanionTurn[],
  biometrics?: BiometricSnapshot
): Promise<string> {
  const ai = getClient();

  const transcript = history
    .map((turn) => `${turn.role === "user" ? "User" : "Sage"}: ${turn.text}`)
    .join("\n");

  const prompt = `${COMPANION_PERSONA}

Current biometric reading: ${describeBiometrics(biometrics)}

Conversation so far:
${transcript || "(this is the first message)"}

User: ${userMessage}
Sage:`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return response.text?.trim() || "I'm here with you — could you say that again?";
}

/** Generates a short intro line for a guided routine, tailored to the user's current state. */
export async function getRoutineIntro(routineTitle: string, biometrics?: BiometricSnapshot): Promise<string> {
  const ai = getClient();
  const prompt = `${COMPANION_PERSONA}

Current biometric reading: ${describeBiometrics(biometrics)}

Write one warm, one-sentence introduction (spoken aloud by voice) inviting
the user into the "${routineTitle}" routine, referencing how they seem to be
doing right now without sounding clinical.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return response.text?.trim() || `Let's begin ${routineTitle}.`;
}
