import Groq, { toFile } from "groq-sdk";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

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
      return NextResponse.json(
        { error: "No audio file uploaded" },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const groq = getGroqClient();

    let transcription;

    try {
      // First try with webm
      transcription = await groq.audio.transcriptions.create({
        file: await toFile(fileBuffer, "audio.webm", {
          type: "audio/webm",
        }),
        model: "whisper-large-v3",
        response_format: "verbose_json",
      });
    } catch (error) {
      console.warn("Transcription failed with webm, trying mp4:", error);
      // If webm fails, try with mp4
      transcription = await groq.audio.transcriptions.create({
        file: await toFile(fileBuffer, "audio.mp4", {
          type: "audio/mp4",
        }),
        model: "whisper-large-v3",
        response_format: "verbose_json",
      });
    }

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
