import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const post = "https://t.me/myextrakz/3354";
const output = join(process.cwd(), "public/source-media/tamos-case-hackathon-2026-1.jpg");

async function main() {
  const response = await fetch(`${post}?embed=1&mode=tme`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Source post unavailable: ${response.status}`);
  const html = await response.text();
  const images = [...html.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)].map((match) => match[1]);
  if (images.length !== 1 || new URL(images[0]).hostname !== "cdn4.telesco.pe") {
    throw new Error(`Unexpected source photo count or host: ${images.length}`);
  }
  const imageResponse = await fetch(images[0], { signal: AbortSignal.timeout(20_000) });
  if (!imageResponse.ok || !imageResponse.headers.get("content-type")?.startsWith("image/jpeg")) {
    throw new Error(`Source photo unavailable: ${imageResponse.status}`);
  }
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (bytes.length < 10_000 || bytes.length > 4_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Unexpected JPEG bytes: ${bytes.length}`);
  }
  await writeFile(output, bytes);
  console.log(JSON.stringify({ post, output, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
