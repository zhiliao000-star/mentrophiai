import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase/server";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine(
      (file) =>
        [
          "image/jpeg",
          "image/png",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ].includes(file.type),
      {
        message: "File type should be JPEG, PNG, PDF, DOCX, or TXT",
      }
    ),
});

async function extractTextFromFile(file: File, fileBuffer: Buffer) {
  if (file.type === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: fileBuffer });

    try {
      const parsed = await parser.getText();
      return parsed.text?.trim() ?? "";
    } finally {
      await parser.destroy();
    }
  }

  if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
    return parsed.value?.trim() ?? "";
  }

  if (file.type === "text/plain") {
    return fileBuffer.toString("utf-8").trim();
  }

  return "";
}

function trimExtractedText(text: string) {
  const maxLength = 20000;
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function getStoragePath(userId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${Date.now()}-${safeName}`;
}

export async function POST(request: Request) {
  const [user, supabase] = await Promise.all([
    getAuthenticatedUser(),
    createSupabaseServerClient(),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = file.name;
    const storagePath = getStoragePath(user.id, filename);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extractedText = trimExtractedText(
      await extractTextFromFile(file, fileBuffer)
    );

    try {
      const { error } = await supabase.storage
        .from("uploads")
        .upload(storagePath, fileBuffer, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      const publicUrl = supabase.storage
        .from("uploads")
        .getPublicUrl(storagePath).data.publicUrl;

      return NextResponse.json({
        url: publicUrl,
        pathname: filename,
        contentType: file.type,
        extractedText: extractedText || undefined,
      });
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
