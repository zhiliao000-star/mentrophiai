CREATE TABLE IF NOT EXISTS "GitHubInstallation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "installationId" varchar(64) NOT NULL,
  "accountId" varchar(64),
  "accountLogin" text,
  "accountType" varchar(32),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitHubInstallation_userId_unique" ON "GitHubInstallation" ("userId");
