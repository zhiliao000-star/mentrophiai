import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { upsertGitHubInstallation } from "@/lib/db/queries";

const InstallationSchema = z.object({
  installationId: z.string().min(1),
  accountId: z.string().optional(),
  accountLogin: z.string().optional(),
  accountType: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = InstallationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid GitHub installation payload" },
      { status: 400 }
    );
  }

  await upsertGitHubInstallation({
    userId: user.id,
    installationId: parsed.data.installationId,
    accountId: parsed.data.accountId,
    accountLogin: parsed.data.accountLogin,
    accountType: parsed.data.accountType,
  });

  return NextResponse.json({ ok: true });
}
