/**
 * The app's public origin, used to build links that leave the backend:
 * OAuth callback redirects, email digest links, and the Dev Mode resources
 * pushed into Figma.
 *
 * Set it on the Convex deployment, not in `.env.local`:
 *
 *     npx convex env set SITE_URL https://your-app.example.com
 *
 * This throws when unset rather than defaulting to localhost. A missing
 * origin is a deployment misconfiguration, and a silent localhost fallback
 * hides it in the worst possible places: redirects that strand the user
 * after a successful OAuth flow, dead links in already-delivered email, and
 * localhost URLs written onto Figma frames where the whole team sees them.
 * Failing at send time is louder and cheaper to diagnose.
 *
 * `APP_URL` is the deprecated former name, still read so existing
 * deployments keep working. Prefer `SITE_URL`.
 */
export function siteUrl(): string {
  const url = process.env.SITE_URL ?? process.env.APP_URL;
  if (!url) {
    throw new Error(
      "SITE_URL is not set on this Convex deployment. Set it with " +
        "`npx convex env set SITE_URL https://your-app.example.com` - it is " +
        "required for OAuth redirects, email links, and Figma resources."
    );
  }
  // Trailing slashes would produce "https://app.com//org/settings".
  return url.replace(/\/+$/, "");
}
