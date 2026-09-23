import { createHash } from "node:crypto";

/**
 * Soft gate for the work-in-progress site.
 *
 * This is a curtain, not a lock. The page HTML is still in the response, so
 * anyone using devtools, curl, or "view source" can read it, and search
 * engines can index it. Use it to keep the unfinished site from casual
 * visitors — never to protect anything that actually matters.
 *
 * The password itself is never shipped: only these hashes are, so it is not
 * sitting in the bundle in plain text for anyone who opens the JS.
 */
export const GATE_PASSWORD = process.env.SITE_GATE_PASSWORD || "builders";

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

/** Flip to false (or set SITE_GATE=off) to publish the site openly. */
export const GATE_ENABLED = (process.env.SITE_GATE || "on").toLowerCase() !== "off";
