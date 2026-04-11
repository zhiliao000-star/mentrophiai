import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  getInstallationIdForUser,
  listInstallationRepos,
} from "@/lib/coding/github";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const installationId = getInstallationIdForUser();
  if (!installationId) {
    return NextResponse.json(
      { error: "Missing GitHub installation. Connect a GitHub App first." },
      { status: 400 }
    );
  }

  try {
    const repos = await listInstallationRepos(installationId);
    return NextResponse.json({ repos });
  } catch (error) {
    console.error("GitHub repo list failed:", error);
    return NextResponse.json(
      { error: "Failed to load GitHub repos" },
      { status: 500 }
    );
  }
}
