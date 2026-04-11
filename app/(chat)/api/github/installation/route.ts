import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { upsertGitHubInstallation } from "@/lib/db/queries";
import { getInstallationInfo } from "@/lib/coding/github";
import { z } from "zod";

const InstallationSchema = z.object({
  installationId: z.string().min(1),
});

async function resolveInstallationId(request: Request) {
  const url = new URL(request.url);
  const queryInstallationId = url.searchParams.get("installation_id");
  if (queryInstallationId) {
    return queryInstallationId;
  }

  const body = await request.json().catch(() => null);
  const parsed = InstallationSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.installationId;
}

/**
 * GitHub App installation callback.
 *
 * Security model: we never trust client-supplied account fields.
 * We fetch installation metadata using the GitHub App JWT and persist
 * the verified installation data against the authenticated user.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const installationId = await resolveInstallationId(request);
  if (!installationId) {
    return NextResponse.json(
      { error: "Invalid GitHub installation payload" },
      { status: 400 }
    );
  }

  const installationInfo = await getInstallationInfo(installationId);

  await upsertGitHubInstallation({
    userId: user.id,
    installationId,
    accountId: installationInfo.account?.id
      ? String(installationInfo.account.id)
      : undefined,
    accountLogin: installationInfo.account?.login,
    accountType: installationInfo.account?.type,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  return POST(request);
}
