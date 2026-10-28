-- Telegram account linking uses a short-lived, one-time credential instead of
-- exposing User.id as an authorization token.
ALTER TABLE "User"
ADD COLUMN "telegramLinkTokenHash" TEXT,
ADD COLUMN "telegramLinkTokenExpiresAt" TIMESTAMP(3);

-- The previous application-level detach/update sequence could theoretically
-- leave duplicates under concurrent requests. Keep the most recently updated
-- binding before enforcing the invariant in PostgreSQL.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "telegramChatId"
           ORDER BY "updatedAt" DESC, "id" DESC
         ) AS position
  FROM "User"
  WHERE "telegramChatId" IS NOT NULL
)
UPDATE "User" AS target
SET "telegramChatId" = NULL
FROM ranked
WHERE target."id" = ranked."id"
  AND ranked.position > 1;

CREATE UNIQUE INDEX "User_telegramChatId_key"
ON "User"("telegramChatId");

CREATE UNIQUE INDEX "User_telegramLinkTokenHash_key"
ON "User"("telegramLinkTokenHash");
