import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  listInstallationRepos,
} from "@/lib/coding/github";
import { getGitHubInstallationByUserId } from "@/lib/db/queries";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const installation = await getGitHubInstallationByUserId(user.id);
  if (!installation) {
    return NextResponse.json(
      { error: "GitHub not connected. Connect your GitHub App first." },
      { status: 400 }
    );
  }

  try {
    const repos = await listInstallationRepos(installation.installationId);
    return NextResponse.json({ repos });
  } catch (error) {
    console.error("GitHub repo list failed:", error);
    return NextResponse.json(
      { error: "Failed to load GitHub repos" },
      { status: 500 }
    );
  }
}
