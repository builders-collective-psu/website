import { json } from "./_atlas";

/**
 * Team headshots, resolved from UploadThing at request time.
 *
 * UploadThing has no folders: one listing returns every file the app owns,
 * which for this token includes treasury receipts and recap photos. So the
 * filter below is not cosmetic — it is what keeps anything other than a
 * headshot from being named in a public response. Only files called
 * headshot-<linkedinSlug>.<ext> are considered, and only their slug and URL
 * are returned.
 *
 * Seeded by scripts/seed-headshots.mts; the two must agree on the prefix.
 */
const HEADSHOT_PREFIX = "headshot-";
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

interface UploadThingFile {
  key: string;
  name: string;
  status: string;
}

export default async function handler(): Promise<Response> {
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) return json({ error: "UPLOADTHING_TOKEN is not set" }, 503);

  // The token is base64 JSON: { apiKey, appId, regions }. The REST API
  // authenticates with the apiKey inside it (passing the whole token gives
  // 401), and the appId forms the public file URL.
  let apiKey: string;
  let appId: string;
  try {
    ({ apiKey, appId } = JSON.parse(atob(token)));
    if (!apiKey || !appId) throw new Error("missing fields");
  } catch {
    return json({ error: "UPLOADTHING_TOKEN is malformed" }, 503);
  }

  const response = await fetch("https://api.uploadthing.com/v6/listFiles", {
    method: "POST",
    headers: {
      "x-uploadthing-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ limit: 500 }),
  });

  if (!response.ok) {
    return json({ error: `listFiles HTTP ${response.status}` }, 502);
  }

  const body = (await response.json()) as { files?: UploadThingFile[] };

  const photos: Record<string, string> = {};
  for (const file of body.files ?? []) {
    if (!file.name?.startsWith(HEADSHOT_PREFIX)) continue;
    if (!ALLOWED_EXTENSIONS.test(file.name)) continue;
    if (file.status && file.status !== "Uploaded") continue;

    // headshot-lance-streuber.jpg -> lance-streuber
    const slug = file.name.slice(HEADSHOT_PREFIX.length).replace(ALLOWED_EXTENSIONS, "");
    if (slug) photos[slug] = `https://${appId}.ufs.sh/f/${file.key}`;
  }

  return json({ photos, count: Object.keys(photos).length });
}
