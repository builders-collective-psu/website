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
 * Live mode also needs ATLAS_API_KEY wherever the /api functions run;
 * without it those endpoints return 503 and the live sections stay hidden.
 */
const TRUTHY = new Set(["1", "true", "on", "yes"]);

export const REAL_DATA = TRUTHY.has((process.env.REAL_DATA || "").toLowerCase());
