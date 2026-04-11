DROP INDEX IF EXISTS "GitHubInstallation_userId_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "GitHubInstallation_user_installation_unique" ON "GitHubInstallation" ("userId", "installationId");
