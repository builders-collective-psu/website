import { createHash } from "node:crypto";

/**
 * Optional soft gate for the site.
 *
 * Off unless SITE_GATE_PASSWORD is set at build time — no password, no gate,
 * and none of the gate's markup or script ships. Setting a password is what
 * puts the curtain up:
 *
 *   SITE_GATE_PASSWORD=somephrase npm run build
 *
 * It is a curtain, not a lock, even when enabled. The page HTML is still in
 * the response, so anyone using devtools, curl or "view source" can read it,
 * and crawlers can index it. Never put anything sensitive behind it.
 *
 * The password itself is never shipped: only the hashes below are, so it is
 * not sitting in the bundle in plain text.
 */
export const GATE_PASSWORD = process.env.SITE_GATE_PASSWORD || "";

export const GATE_ENABLED = GATE_PASSWORD.length > 0;

/** Non-cryptographic fallback for pages served over plain http, where
 *  crypto.subtle is unavailable. */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function gateHashes() {
  return {
    sha: createHash("sha256").update(GATE_PASSWORD).digest("hex"),
    djb: djb2(GATE_PASSWORD),
  };
}
