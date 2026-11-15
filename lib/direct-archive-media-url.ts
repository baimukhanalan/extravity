const CHECKSUM = /^[a-f0-9]{64}$/;
const EXTENSION = "(?:jpg|png|webp|mp4)";

export function directArchiveMediaOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isTrustedDirectArchiveMediaUrl(value: string, checksum: string): boolean {
  const origin = directArchiveMediaOrigin();
  if (!origin || !CHECKSUM.test(checksum)) return false;
  try {
    const url = new URL(value);
    return url.origin === origin
      && new RegExp(`^/telegram/${checksum}\\.${EXTENSION}$`).test(url.pathname)
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}
