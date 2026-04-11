import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { listInstallationRepos } from "@/lib/coding/github";
import { getGitHubInstallationsByUserId } from "@/lib/db/queries";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Security: installations are stored server-side per user after a verified
  // GitHub App installation callback. We never trust client-sent installation IDs.
  const installations = await getGitHubInstallationsByUserId(user.id);
  if (!installations.length) {
    return NextResponse.json(
      { error: "GitHub not connected. Connect your GitHub App first." },
      { status: 400 }
    );
  }

  try {
    const url = new URL(request.url);
    const requestedInstallation = url.searchParams.get("installationId");

    const targetInstallations = requestedInstallation
      ? installations.filter(
          (installation) => installation.installationId === requestedInstallation
        )
      : installations;

    if (requestedInstallation && targetInstallations.length === 0) {
      return NextResponse.json(
        { error: "Installation not found for this user." },
        { status: 404 }
      );
    }

    const repos = (
      await Promise.all(
        targetInstallations.map(async (installation) => {
          const list = await listInstallationRepos(
            installation.installationId
          );
          return list.map((repo) => ({
            ...repo,
            installationId: installation.installationId,
          }));
        })
      )
    ).flat();

    return NextResponse.json({ repos });
  } catch (error) {
    console.error("GitHub repo list failed:", error);
    return NextResponse.json(
      { error: "Failed to load GitHub repos" },
      { status: 500 }
    );
  }
}
