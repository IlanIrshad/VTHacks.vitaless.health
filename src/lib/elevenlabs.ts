// Wrapper around the ElevenLabs TTS API for the companion's voice and
// narrated routine steps. Requires ELEVENLABS_API_KEY in the environment.
// Docs: https://elevenlabs.io/docs/eleven-api/quickstart

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!client) {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not set. Add it to .env.local (see .env.example).");
    }
    client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return client;
}

/** Synthesizes speech for the given text and returns raw MP3 bytes. `voiceId` overrides the env-default narrator voice — used for a signed-in user's preferred voice. */
export async function synthesizeSpeech(text: string, voiceId?: string): Promise<Buffer> {
  const elevenlabs = getClient();
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

  const audioStream = await elevenlabs.textToSpeech.convert(voice, {
    text,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
