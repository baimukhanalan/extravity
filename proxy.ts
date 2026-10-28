import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * (In Next 16 this convention is `proxy`, the renamed `middleware`.)
 *
 * A nonce is the only way to keep a strict `script-src` while still allowing the
 * few inline scripts this app needs — the anti-FOUC theme script and JSON-LD.
 * `strict-dynamic` lets those nonce'd scripts pull in Next's chunks without
 * whitelisting hashes; Next reads the nonce from the request header and stamps
 * it onto the scripts it generates. Generating a fresh nonce per request forces
 * dynamic rendering, which every route here already is.
 *
 * `style-src` keeps `unsafe-inline`: Tailwind emits inline style attributes that
 * cannot carry a nonce, and styles are not a script-execution vector.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === "development";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https:;
    media-src 'self' blob: https:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Skip static assets and the image optimizer — they execute no scripts, and a
  // per-request CSP on them only adds overhead.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
