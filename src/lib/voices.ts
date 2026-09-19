// Curated subset of ElevenLabs' voice library offered in the account-settings
// voice picker, sourced directly from this project's actual ElevenLabs
// account (GET /v1/voices, 2026-09-19) rather than guessed — the account's
// full library has only 21 voices and exactly one is labeled gender
// "neutral" (River), so there's no second true-neutral option to offer.
// Each id below is confirmed both by that listing and a real synthesis call.
//
// Note: the narrator's env default (ELEVENLABS_VOICE_ID, "George") is NOT
// included here — George is labeled gender "male" in this account, not
// neutral as an earlier version of this file incorrectly assumed before
// voices_read access was available to verify it.

export interface VoiceOption {
  id: string;
  label: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "SAz9YHcvj6GT2YYXdXww", label: "River — relaxed, neutral" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian — deep, comforting (male)" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — steady, calm (male)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — reassuring, confident (female)" },
];
