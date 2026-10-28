export function railwayMediaDisplayUrl(media: { url: string; storageKey?: string | null }, preview = false): string | null {
  if (media.storageKey?.startsWith("telegram-archive:v1:")) {
    try {
      const url = new URL(media.url);
      if (!/^\/api\/telegram-media\/[a-f0-9]{64}$/.test(url.pathname) || url.search || url.hash) return null;
      return preview ? url.pathname.replace("/api/telegram-media/", "/api/admin/telegram-media/") : url.pathname;
    } catch {
      return null;
    }
  }
  if (!media.storageKey?.startsWith("railway-volume:")) return null;
  const assetId = media.storageKey.slice("railway-volume:".length);
  if (!/^[a-f0-9]{64}$/.test(assetId)) return null;
  try {
    const url = new URL(media.url);
    if (url.pathname !== `/api/source-media/${assetId}` || url.search || url.hash) return null;
    return preview ? `/api/admin/source-media/${assetId}` : url.pathname;
  } catch {
    return null;
  }
}
