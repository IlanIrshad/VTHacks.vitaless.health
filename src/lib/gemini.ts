// Wrapper around the Gemini API for the AI companion's dialogue and
// routine narration generation. Requires GEMINI_API_KEY in the environment.
// Docs: https://ai.google.dev/gemini-api/docs/quickstart

import { GoogleGenAI } from "@google/genai";

// Default model kept in one place / overridable via env, since Gemini model
// IDs are versioned and change over time. Confirmed live against
// https://generativelanguage.googleapis.com on 2026-09-19 — gemini-2.5-flash
// and earlier are retired; gemini-3.6-flash is current (a fast Flash-tier
// model is the right fit for a hackathon chatbot's latency/cost).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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

/**
 * Writes a short interpretation of an already-computed body-fat estimate.
 * Gemini never produces the percentage itself (see lib/bodyComposition.ts
 * for why) — it only explains a real, formula-derived number, using live
 * Presage vitals as supporting context if available.
 */
export async function getBodyCompositionInsight(params: {
  bodyFatPercent: number;
  category: string;
  bmi: number;
  age: number;
  gender: string;
  biometrics?: BiometricSnapshot;
}): Promise<string> {
  const ai = getClient();
  const { bodyFatPercent, category, bmi, age, gender, biometrics } = params;

  const prompt = `You are Sage, a warm, encouraging AI wellness companion. A body
composition estimate has already been calculated for the user using a
published formula (Deurenberg 1991, from BMI/age/gender) — you are NOT
calculating or guessing the number, only explaining one that's already
computed:

- Estimated body fat: ${bodyFatPercent}%
- Category: ${category}
- BMI: ${bmi}
- Age: ${age}, Gender: ${gender}
- Live vitals right now: ${describeBiometrics(biometrics)}

Write 2-4 short sentences, in plain prose (no markdown, no lists, no
emoji — this may be read aloud):
- State the estimate and category plainly, and mention once that it's a
  formula-based estimate, not a clinical measurement.
- If live vitals are available, you may reference them as general context,
  but never imply they were used to calculate body fat — they weren't.
- Never use judgmental, shaming, or diagnostic language about body size.
  Frame everything neutrally and supportively.
- Do not suggest diets, supplements, or specific numeric goals.

Sage:`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return (
    response.text?.trim() ||
    `Your estimated body fat is ${bodyFatPercent}% (${category}), based on the Deurenberg formula — a formula-based estimate, not a clinical measurement.`
  );
}

/**
 * Writes the body of a check-in reminder email, personalized to the user's
 * stated wellness goals if they've set any in Account settings. Never
 * invents a goal the user hasn't actually written down.
 */
export async function getCheckInReminderEmail(params: { name: string; goals?: string }): Promise<string> {
  const ai = getClient();
  const { name, goals } = params;

  const prompt = `You are Sage, a warm, encouraging AI wellness companion inside the
Vitaless app. Write a short check-in reminder email body for ${name}.

${goals && goals.trim() ? `Their stated wellness goal: "${goals.trim()}"` : "They haven't written down a specific wellness goal yet."}

Rules:
- 2-3 short sentences, plain prose, no markdown, no lists, no emoji, no subject line.
- Gently invite them to open Vitaless for a quick check-in.
- If a goal is given, reference it naturally and specifically. If not, keep it
  warm and generic — do not invent a goal they haven't stated.
- Never make medical claims or diagnoses.
- Do not sign off with a name — the template already does that.

Sage:`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return (
    response.text?.trim() ||
    `Just a friendly nudge to open Vitaless for a quick check-in whenever you have a moment.`
  );
}
