#!/usr/bin/env node
/** Verify a parser-signed repair manifest and reconcile only existing media bytes. */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { parserMediaCapability } from "../../lib/parser-source-media";
import { reconcileRepair, verifyRepairManifest } from "./telegram-media-repair-reconcile";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex < 0 || !args[manifestIndex + 1] || args.some((arg, index) =>
    arg !== "--apply" && arg !== "--manifest" && index !== manifestIndex + 1)) {
    throw new Error("Usage: tsx scripts/maintenance/reconcile-telegram-media-repair.ts --manifest <private-json> [--apply]");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!secret || !appUrl) throw new Error("PARSER_INGEST_SECRET and NEXT_PUBLIC_APP_URL are required");
  if (apply && parserMediaCapability().mediaBackend !== "railway_volume") {
    throw new Error("--apply requires configured Railway media delivery on the site");
  }
  const document = JSON.parse(await readFile(args[manifestIndex + 1], "utf8"));
  const repairs = verifyRepairManifest(document, secret, appUrl);
  const prisma = new PrismaClient();
  try {
    const report = [];
    for (const repair of repairs) report.push(await reconcileRepair(prisma, repair, apply));
    console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", uploaded: repairs.length, report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
