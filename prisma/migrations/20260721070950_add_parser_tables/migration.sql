-- CreateTable
CREATE TABLE "SourceConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'daily',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "robotsPolicy" TEXT NOT NULL DEFAULT 'respect',
    "rateLimitMs" INTEGER NOT NULL DEFAULT 2000,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserJob" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParserJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSourceItem" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT,
    "url" TEXT NOT NULL,
    "contentHash" TEXT,
    "httpStatus" INTEGER,
    "rawText" TEXT,
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "processingState" TEXT NOT NULL DEFAULT 'fetched',
    "error" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceConnector_enabled_idx" ON "SourceConnector"("enabled");

-- CreateIndex
CREATE INDEX "ParserJob_status_idx" ON "ParserJob"("status");

-- CreateIndex
CREATE INDEX "ParserJob_createdAt_idx" ON "ParserJob"("createdAt");

-- CreateIndex
CREATE INDEX "RawSourceItem_contentHash_idx" ON "RawSourceItem"("contentHash");

-- CreateIndex
CREATE INDEX "RawSourceItem_processingState_idx" ON "RawSourceItem"("processingState");

-- AddForeignKey
ALTER TABLE "ParserJob" ADD CONSTRAINT "ParserJob_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "SourceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSourceItem" ADD CONSTRAINT "RawSourceItem_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "SourceConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
