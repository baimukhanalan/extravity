ALTER TABLE "ParserJob"
  ADD COLUMN "itemsExpired" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "itemsFailed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "itemsQuarantined" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RawSourceItem"
  ADD COLUMN "failureKey" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RawSourceItem_failureKey_key" ON "RawSourceItem"("failureKey");
CREATE INDEX "RawSourceItem_connectorId_url_contentHash_idx"
  ON "RawSourceItem"("connectorId", "url", "contentHash");
