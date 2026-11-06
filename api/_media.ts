import type { Recap } from "./_atlas";

const DEVPOST_TIMEOUT_MS = 8000;
const DEVPOST_CONCURRENCY = 6;

/**
 * Browsers cannot decode iPhone HEIC uploads, so the <img> shows broken. The
 * UploadThing URLs carry no extension (the filename lives in the response
 * headers), so the type is checked with a HEAD request. Unknown = keep.
 */
const typeCache = new Map<string, boolean>();

export async function isDisplayable(url: string): Promise<boolean> {
  const cached = typeCache.get(url);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2500) });
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    const disposition = (response.headers.get("content-disposition") ?? "").toLowerCase();
    if (response.ok && (/hei[cf]/.test(type) || /\.hei[cf]/.test(disposition))) ok = false;
    else if (response.ok && type && !type.startsWith("image/")) ok = false;
  } catch {
    // Timeout or network error: assume it is fine.
  }
  typeCache.set(url, ok);
  return ok;
}

export interface DevpostInfo {
  image: string | null;
  title: string | null;
  summary: string | null;
}

/** Per-isolate memo; the CDN cache header covers the rest. */
const devpostCache = new Map<string, DevpostInfo | null>();

const metaContent = (html: string, property: string) => {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "i"))?.[0];
  const value = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return value ? decodeEntities(value).trim() : null;
};

/**
 * A Devpost project's title, one-line summary and thumbnail, from the page's
 * Open Graph tags. Only devpost.com pages are fetched, and only real project
 * images (software_*) are accepted, never Devpost's generic placeholder.
 */
export async function devpostInfo(rawUrl: string, timeoutMs = DEVPOST_TIMEOUT_MS): Promise<DevpostInfo | null> {
  let page: URL;
  try {
    page = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = page.hostname.toLowerCase();
  if (page.protocol !== "https:" || (host !== "devpost.com" && !host.endsWith(".devpost.com"))) {
    return null;
  }
  page.search = "";
  const key = page.toString();
  if (devpostCache.has(key)) return devpostCache.get(key) ?? null;

  let info: DevpostInfo | null = null;
  try {
    const response = await fetch(key, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; BuildersCollectiveSite/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      const html = await response.text();
      const src = metaContent(html, "og:image");
      const image =
        src && /^https:\/\//.test(src) && /software_(thumbnail_)?photos/.test(src) && !/\.hei[cf]($|\?)/i.test(src)
          ? src
          : null;
      info = { image, title: metaContent(html, "og:title"), summary: metaContent(html, "og:description") };
    }
  } catch {
    // Timeout or network failure: leave the recap without Devpost details.
  }
  if (info) devpostCache.set(key, info);
  return info;
}

/**
 * Devpost details for recaps that link a project, a few at a time: Devpost
 * starts timing out when hit with dozens of requests at once.
 */
export async function devpostDetails(
  recaps: Recap[],
  max = 80,
  timeoutMs = DEVPOST_TIMEOUT_MS,
): Promise<Map<string, DevpostInfo>> {
  const needed = recaps.filter((recap) => recap.devpostUrl).slice(0, max);
  const found = new Map<string, DevpostInfo>();
  let next = 0;
  const worker = async () => {
    while (next < needed.length) {
      const recap = needed[next++];
      const info = await devpostInfo(recap.devpostUrl as string, timeoutMs);
      if (info) found.set(recap.id, info);
    }
  };
  await Promise.all(Array.from({ length: DEVPOST_CONCURRENCY }, worker));
  return found;
}

export const candidates = (recap: Recap): string[] =>
  [recap.prizePhotoUrl, ...(recap.eventPhotoUrls ?? [])].filter((url): url is string => !!url);

export const ownPhoto = (recap: Recap, ok: Set<string>): string | null =>
  candidates(recap).find((url) => ok.has(url)) ?? null;

/** The platform stores some names HTML-escaped (e.g. &#39;). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

