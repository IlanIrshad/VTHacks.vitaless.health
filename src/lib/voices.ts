// Curated subset of ElevenLabs' premade voice library offered in the
// account-settings voice picker. Each id was verified live against this
// project's ElevenLabs key with a real synthesis call (2026-09-19) — see
// the note in .env.example about ELEVENLABS_VOICE_ID for the narrator
// default, which is the same "George" id as below.

export interface VoiceOption {
  id: string;
  label: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "SAz9YHcvj6GT2YYXdXww", label: "River — calm, neutral" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — warm, neutral" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — grounded, male" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — gentle, female" },
];
