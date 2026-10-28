import { createHmac } from "node:crypto";

const ASSET_ID = /^[a-f0-9]{64}$/;
const SOURCE_MEDIA_PATH = /^\/api\/source-media\/([a-f0-9]{64})$/;
const TELEGRAM_MEDIA_PATH = /^\/api\/telegram-media\/([a-f0-9]{64})$/;
const TELEGRAM_ARCHIVE_KEY = /^telegram-archive:v1:-?[1-9][0-9]*:[1-9][0-9]*:[A-Za-z0-9_-]{20,300}$/;
const EXTRAVITY_VERCEL_ORIGIN = "https://extravity.vercel.app";
const LEGACY_EXTRAVITY_VERCEL_ORIGIN = "https://extracurriculars-kz.vercel.app";

export function appMediaOrigin(): URL | null {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isTrustedAppMediaUrl(value: string, pathname: string): boolean {
  const app = appMediaOrigin();
  if (!app) return false;
  try {
    const url = new URL(value);
    const allowedOrigins = app.origin === EXTRAVITY_VERCEL_ORIGIN
      ? new Set([EXTRAVITY_VERCEL_ORIGIN, LEGACY_EXTRAVITY_VERCEL_ORIGIN])
      : new Set([app.origin]);
    return allowedOrigins.has(url.origin)
      && url.pathname === pathname
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function assetIdForChecksum(checksum: string): string | null {
  return ASSET_ID.test(checksum) ? checksum : null;
}

export function isTrustedRailwayMediaCandidate(media: {
  url: string;
  storageKey?: string;
  checksum: string;
}): boolean {
  try {
    const url = new URL(media.url);
    const assetId = SOURCE_MEDIA_PATH.exec(url.pathname)?.[1];
    return Boolean(assetId
      && isTrustedAppMediaUrl(media.url, `/api/source-media/${assetId}`)
      && media.storageKey === `railway-volume:${assetId}`
      && assetIdForChecksum(media.checksum) === assetId);
  } catch {
    return false;
  }
}

export function isTrustedTelegramArchiveCandidate(media: {
  url: string;
  storageKey?: string;
  checksum: string;
}): boolean {
  if (!media.storageKey || !TELEGRAM_ARCHIVE_KEY.test(media.storageKey)) return false;
  try {
    const url = new URL(media.url);
    const assetId = TELEGRAM_MEDIA_PATH.exec(url.pathname)?.[1];
    return Boolean(assetId
      && isTrustedAppMediaUrl(media.url, `/api/telegram-media/${assetId}`)
      && assetIdForChecksum(media.checksum) === assetId);
  } catch {
    return false;
  }
}

export function isAllowedParserMedia(media: {
  url: string;
  storageKey?: string;
  checksum: string;
}): boolean {
  try {
    const url = new URL(media.url);
    if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")) return true;
    return isTrustedRailwayMediaCandidate(media) || isTrustedTelegramArchiveCandidate(media);
  } catch {
    return false;
  }
}

export function railwayMediaOrigin(): URL | null {
  const value = process.env.PARSER_MEDIA_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    if (url.origin === appMediaOrigin()?.origin) return null;
    return url;
  } catch {
    return null;
  }
}

export function parserMediaCapability(): { mediaConfigured: boolean; mediaBackend: "telegram_archive" | "railway_volume" | "vercel_blob" | "none" } {
  if (process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED === "true"
    && process.env.TELEGRAM_MEDIA_BOT_TOKEN
    && process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID
    && appMediaOrigin()) {
    return { mediaConfigured: true, mediaBackend: "telegram_archive" };
  }
  if (process.env.RAILWAY_MEDIA_ENABLED === "true" && process.env.PARSER_INGEST_SECRET && appMediaOrigin() && railwayMediaOrigin()) {
    return { mediaConfigured: true, mediaBackend: "railway_volume" };
  }
  if (process.env.MEDIA_BLOB_READ_WRITE_TOKEN) return { mediaConfigured: true, mediaBackend: "vercel_blob" };
  return { mediaConfigured: false, mediaBackend: "none" };
}

export function signedRailwayMediaUrl(assetId: string, now = Date.now()): URL | null {
  const secret = process.env.PARSER_INGEST_SECRET;
  const origin = railwayMediaOrigin();
  if (!secret || !origin || !ASSET_ID.test(assetId)) return null;
  const expires = Math.floor(now / 1000) + 45;
  const signature = createHmac("sha256", secret).update(`${assetId}:${expires}`).digest("hex");
  const target = new URL(`/source-media/${assetId}`, origin);
  target.searchParams.set("expires", String(expires));
  target.searchParams.set("sig", signature);
  return target;
}
