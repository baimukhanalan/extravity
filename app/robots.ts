import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/catalog", "/opportunities/"],
      disallow: ["/app/", "/admin/", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
