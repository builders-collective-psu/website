/*
 * One-time seed: pushes the team headshots in public/headshots/linkedin/ to
 * UploadThing, naming each file headshot-<linkedinSlug>.<ext>.
 *
 *   UPLOADTHING_TOKEN=... npx tsx scripts/seed-headshots.mts
 *   ... --dry-run     list what would upload, touch nothing
 *   ... --force       re-upload even if a headshot of that name is present
 *
 * The naming matters: UploadThing has no folders, so the only way the site
 * can pick its headshots out of an app that also holds treasury receipts and
 * recap photos is the HEADSHOT_PREFIX below. Keep it in sync with
 * api/team-photos.ts.
 *
 * Safe to re-run. Existing headshots are skipped unless --force, and nothing
 * is ever deleted.
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { UTApi } from "uploadthing/server";
import { loadEnv } from "./load-env.mts";

export const HEADSHOT_PREFIX = "headshot-";

const SOURCE = new URL("../public/headshots/linkedin/", import.meta.url).pathname;
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");


await loadEnv(new URL("../.env", import.meta.url));

if (!process.env.UPLOADTHING_TOKEN) {
  console.error("UPLOADTHING_TOKEN is not set. Copy it from hacklas's apps/web/.env into .env here.");
  process.exit(1);
}

const api = new UTApi();

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const existing = new Map<string, string>();
for (const file of (await api.listFiles({ limit: 500 })).files) {
  if (file.name.startsWith(HEADSHOT_PREFIX)) existing.set(file.name, file.key);
}
console.log(`UploadThing already holds ${existing.size} headshot(s).`);

// Only files whose basename is a linkedinSlug in team.json: anything else
// (stray duplicates, leftovers) maps to nobody and would just sit in the
// bucket forever.
const team = JSON.parse(
  await readFile(new URL("../src/data/team.json", import.meta.url), "utf8"),
) as { name: string; linkedinSlug?: string }[];
const slugs = new Set(team.map((member) => member.linkedinSlug).filter(Boolean));

const candidates = (await readdir(SOURCE))
  .filter((name) => ALLOWED.has(extname(name).toLowerCase()))
  .filter((name) => {
    const slug = name.slice(0, -extname(name).length);
    if (slugs.has(slug)) return true;
    console.log(`  ? ${name} — no team member with that slug, skipping`);
    return false;
  })
  .sort();

const queue: { name: string; source: string }[] = [];
for (const source of candidates) {
  const name = `${HEADSHOT_PREFIX}${source}`;
  if (existing.has(name) && !force) {
    console.log(`  = ${name} (already uploaded, skipping)`);
    continue;
  }
  queue.push({ name, source });
}

if (!queue.length) {
  console.log("Nothing to upload.");
  process.exit(0);
}

console.log(`\n${dryRun ? "Would upload" : "Uploading"} ${queue.length} file(s):`);
for (const item of queue) console.log(`  + ${item.name}`);
if (dryRun) process.exit(0);

const files = await Promise.all(
  queue.map(async ({ name, source }) => {
    const bytes = await readFile(join(SOURCE, source));
    return new File([new Uint8Array(bytes)], name, {
      type: MIME[extname(source).toLowerCase()] || "application/octet-stream",
    });
  }),
);

const results = await api.uploadFiles(files);

console.log("");
for (const [index, result] of results.entries()) {
  if (result.error) {
    console.error(`  x ${queue[index].name} — ${result.error.message}`);
  } else {
    console.log(`  + ${result.data.name} -> ${result.data.ufsUrl}`);
  }
}
