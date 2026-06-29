import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // App lives under /[orgSlug] behind auth; these are the public non-content routes.
      disallow: ["/onboarding", "/sign-in", "/sign-up"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
