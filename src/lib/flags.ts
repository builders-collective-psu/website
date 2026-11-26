/**
 * Build-time feature flags.
 *
 * REAL_DATA decides where the page's figures come from. Unset, the site
 * builds against the checked-in mock data in src/data/ and makes no calls to
 * the platform at all — no /api/* fetch is even emitted, so a preview or a
 * plain static host shows a complete, stable page. Set it to turn the live
 * wiring on:
 *
 *   REAL_DATA=1 npm run build
 *
 * Vercel production builds turn it on by themselves (VERCEL_ENV=production).
 * Preview builds use the mock data unless REAL_DATA=1 is set, so every branch
 * push does not hit the production platform and its database. Set
 * REAL_DATA=0 to force it off.
 *
 * Live mode also needs ATLAS_API_KEY wherever the /api functions run;
 * without it those endpoints return 503 and the live sections stay hidden.
 */
const TRUTHY = new Set(["1", "true", "on", "yes"]);

// Astro surfaces .env through import.meta.env; process.env only carries what
// the shell exported. Check both so `REAL_DATA=1 npm run build` and a line in
// .env behave the same.
const RAW = import.meta.env.REAL_DATA ?? process.env.REAL_DATA ?? "";

const FALSY = new Set(["0", "false", "off", "no"]);
const value = String(RAW).toLowerCase();
const isVercelDeploy = process.env.VERCEL_ENV === "production";

export const REAL_DATA = TRUTHY.has(value) || (isVercelDeploy && !FALSY.has(value));
