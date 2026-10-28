CREATE TYPE "OpportunityMediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "OpportunityMediaProcessingState" AS ENUM ('STAGED', 'READY', 'FAILED');
CREATE TYPE "OpportunityMediaRightsState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'LICENSED_FALLBACK');
CREATE TYPE "OpportunitySourceAccessScope" AS ENUM ('PUBLIC', 'PRIVATE');

CREATE TABLE "OpportunityMedia" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "kind" "OpportunityMediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "posterUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "platformMediaId" TEXT,
    "processingState" "OpportunityMediaProcessingState" NOT NULL DEFAULT 'STAGED',
    "rightsState" "OpportunityMediaRightsState" NOT NULL DEFAULT 'PENDING',
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpportunityMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityProvenance" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceAccount" TEXT,
    "sourcePostId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessScope" "OpportunitySourceAccessScope" NOT NULL DEFAULT 'PUBLIC',
    "rightsBasis" TEXT,
    "adminOnlyJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpportunityProvenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpportunityMedia_opportunityId_platformMediaId_key" ON "OpportunityMedia"("opportunityId", "platformMediaId");
CREATE INDEX "OpportunityMedia_opportunityId_position_idx" ON "OpportunityMedia"("opportunityId", "position");
CREATE INDEX "OpportunityMedia_processingState_rightsState_idx" ON "OpportunityMedia"("processingState", "rightsState");
CREATE UNIQUE INDEX "OpportunityProvenance_opportunityId_key" ON "OpportunityProvenance"("opportunityId");
CREATE INDEX "OpportunityProvenance_sourceAccount_sourcePostId_idx" ON "OpportunityProvenance"("sourceAccount", "sourcePostId");

ALTER TABLE "OpportunityMedia" ADD CONSTRAINT "OpportunityMedia_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityProvenance" ADD CONSTRAINT "OpportunityProvenance_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
