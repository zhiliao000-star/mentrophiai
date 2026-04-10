import Groq, { toFile } from "groq-sdk";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const supportedAudioTypes = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/m4a",
  "audio/x-m4a",
]);

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  return new Groq({ apiKey });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file uploaded" }, { status: 400 });
    }

    if (!supportedAudioTypes.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported audio type. Use webm, mp4, wav, or mp3." },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file: await toFile(fileBuffer, file.name || "recording.webm", {
        type: file.type,
      }),
      model: "whisper-large-v3",
      response_format: "verbose_json",
    });

    return NextResponse.json({
      text: transcription.text?.trim() ?? "",
    });
  } catch (error) {
    console.error("Transcription failed:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
