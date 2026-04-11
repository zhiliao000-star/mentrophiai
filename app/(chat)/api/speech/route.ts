import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const SpeechRequestSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

function getElevenLabsClient() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new ElevenLabsClient({ apiKey });
}

function getVoiceId() {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID");
  }

  return voiceId;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = SpeechRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid text input" }, { status: 400 });
    }

    const elevenlabs = getElevenLabsClient();

    if (!elevenlabs) {
      return NextResponse.json(
        { error: "Missing ELEVENLABS_API_KEY" },
        { status: 500 }
      );
    }

    const audioStream = await elevenlabs.textToSpeech.convert(getVoiceId(), {
      text: parsed.data.text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    return new Response(audioStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const detail =
      typeof error === "object" &&
      error !== null &&
      "body" in error &&
      (error as { body?: { detail?: { message?: string } } }).body?.detail
        ?.message
        ? (error as { body: { detail: { message: string } } }).body.detail
            .message
        : undefined;

    console.error("Text-to-speech failed:", error);
    return NextResponse.json(
      {
        error:
          detail ||
          (statusCode === 402
            ? "ElevenLabs plan required for this voice. Please use a voice from your own account."
            : "Failed to generate speech"),
      },
      { status: statusCode }
    );
  }
}
