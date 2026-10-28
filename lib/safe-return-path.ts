const ALLOWED_RETURN_PATHS = ["/catalog", "/app"] as const;
const ALLOWED_RETURN_PREFIXES = ["/opportunities/", "/app/"] as const;

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(path, "https://extravity.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://extravity.local") return null;
  const allowed = ALLOWED_RETURN_PATHS.includes(url.pathname as (typeof ALLOWED_RETURN_PATHS)[number])
    || ALLOWED_RETURN_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  if (!allowed) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withReturnPath(pathname: string, returnPath: string | null): string {
  if (!returnPath) return pathname;
  const params = new URLSearchParams({ next: returnPath });
  return `${pathname}?${params.toString()}`;
}
