import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase/server";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

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
    const file = formData.get("file") as Blob;

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

    const filename = (formData.get("file") as File).name;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileBuffer = await file.arrayBuffer();

    try {
      const { error } = await supabase.storage
        .from("uploads")
        .upload(safeName, fileBuffer, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      const publicUrl = supabase.storage.from("uploads").getPublicUrl(safeName)
        .data.publicUrl;

      return NextResponse.json({ url: publicUrl });
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
