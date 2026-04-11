import { SignJWT, importPKCS8 } from "jose";
import type { CodingRepo } from "@/lib/coding/types";

type GitHubRepoResponse = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
};

const GITHUB_API_BASE = "https://api.github.com";

function getGitHubAppId() {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error("Missing GITHUB_APP_ID");
  }
  return appId;
}

function getGitHubPrivateKey() {
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error("Missing GITHUB_APP_PRIVATE_KEY");
  }
  return rawKey.replace(/\\n/g, "\n");
}

async function createAppJwt() {
  const privateKey = await importPKCS8(
    getGitHubPrivateKey(),
    "RS256"
  );
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(getGitHubAppId())
    .sign(privateKey);
}

export async function getInstallationToken(installationId: string) {
  const jwt = await createAppJwt();
  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mentrophi-ai",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub installation token failed: ${text}`);
  }

  const payload = (await response.json()) as { token: string };
  return payload.token;
}

export async function listInstallationRepos(
  installationId: string
): Promise<CodingRepo[]> {
  const token = await getInstallationToken(installationId);
  const response = await fetch(`${GITHUB_API_BASE}/installation/repositories`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mentrophi-ai",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub repo list failed: ${text}`);
  }

  const payload = (await response.json()) as {
    repositories: GitHubRepoResponse[];
  };

  return payload.repositories.map((repo) => ({
    id: repo.id,
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    defaultBranch: repo.default_branch,
    private: repo.private,
  }));
}

export async function getRepoInfo(
  installationId: string,
  fullName: string
): Promise<CodingRepo> {
  const token = await getInstallationToken(installationId);
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mentrophi-ai",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub repo lookup failed: ${text}`);
  }

  const repo = (await response.json()) as GitHubRepoResponse;
  return {
    id: repo.id,
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    defaultBranch: repo.default_branch,
    private: repo.private,
  };
}

export async function createPullRequest(
  installationId: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
) {
  const token = await getInstallationToken(installationId);
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mentrophi-ai",
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub PR creation failed: ${text}`);
  }

  return response.json() as Promise<{ html_url?: string }>;
}
