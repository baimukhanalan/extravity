import { PrismaClient } from "@prisma/client";

const url = process.env.E2E_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url) throw new Error("Dedicated E2E database is required");
const parsed = new URL(url);
const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  || !/(?:^|[_-])(e2e|test)(?:$|[_-])/i.test(name)) {
  throw new Error("E2E catalog fixtures must only be written to a local test database");
}

const prisma = new PrismaClient();
async function main() {
  const opportunity = await prisma.opportunity.findUnique({ where: { slug: "astana-hub-startup-weekend-2026" } });
  if (!opportunity) throw new Error("Demo seed is missing the E2E opportunity");
  const sourceUrl = "https://t.me/extravity_e2e/1001";
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      deletedAt: null,
      moderationStatus: "APPROVED",
      status: "REGISTRATION_OPEN",
      applicationDeadline: deadline,
      sourceType: "telegram",
      sourceUrl,
      provenance: {
        upsert: {
          update: { sourceUrl, sourceAccount: "extravity_e2e", sourcePostId: "1001", accessScope: "PUBLIC" },
          create: { sourceUrl, sourceAccount: "extravity_e2e", sourcePostId: "1001", accessScope: "PUBLIC" },
        },
      },
    },
  });
  await prisma.opportunityMedia.upsert({
    where: { opportunityId_platformMediaId: { opportunityId: opportunity.id, platformMediaId: "e2e-catalog-cover" } },
    update: { url: "/e2e-fixtures/catalog.svg", mimeType: "image/svg+xml", processingState: "READY", rightsState: "SOURCE_POST", rightsEvidenceRef: sourceUrl },
    create: {
      opportunityId: opportunity.id,
      platformMediaId: "e2e-catalog-cover",
      kind: "IMAGE",
      url: "/e2e-fixtures/catalog.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 1,
      checksum: "e2e-catalog-cover",
      processingState: "READY",
      rightsState: "SOURCE_POST",
      rightsEvidenceRef: sourceUrl,
      altText: "E2E catalog fixture",
    },
  });
}

main().finally(() => prisma.$disconnect());
