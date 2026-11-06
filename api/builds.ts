import { AtlasError, call, dedupeByTeam, json, type Recap } from "./_atlas";
import { candidates, decodeEntities, devpostDetails, isDisplayable } from "./_media";

export const config = { runtime: "edge" };

const LARP_TEXT_LIMIT = 320;

/** Bunker's own scraped Devpost data (GET /projects). */
interface BunkerProject {
  urlKey: string;
  name: string;
  description: string | null;
}

/** Same key bunker uses for a Devpost URL: host without www, path, lower case. */
function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/**
 * Last resort for a project title: the Devpost slug, minus Devpost's random
 * suffix ("orca-03zer4" → "Orca"). Better than falling back to the team
 * name, which for many teams is just the event's name.
 */
function titleFromDevpost(url: string | null): string | null {
  const slug = url?.match(/devpost\.com\/software\/([^/?#]+)/i)?.[1];
  if (!slug) return null;
  const words = slug.split("-");
  if (words.length > 1 && /^(?=.*\d)[a-z0-9]{5,7}$/i.test(words[words.length - 1])) words.pop();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || null;
}

interface Larp {
  userId: string;
  userName: string;
  userImage: string | null;
  eventName: string;
  linkedinUrl: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
}

const eventKey = (name: string) => decodeEntities(name).toLowerCase().replace(/\s+/g, " ").trim();

/**
 * What we built, for the Built & Won section: every winning project grouped
 * by event, with its Devpost title and summary, the team, photos, and the
 * members' LinkedIn posts ("larps") about it.
 *
 * Separate from /api/recaps because the Devpost lookups are slow, and the
 * hero should not wait on them. Ratings and private notes are never sent.
 */
export default async function handler(): Promise<Response> {
  try {
    const [feed, larps, bunkerProjects] = await Promise.all([
      call<Recap[]>("/community/feed"),
      call<Larp[]>("/larp/feed").catch(() => [] as Larp[]),
      call<BunkerProject[]>("/projects").catch(() => [] as BunkerProject[]),
    ]);
    // Project titles and summaries come from bunker, which scrapes Devpost
    // itself. Fetching Devpost from here is only a fallback: Devpost blocks
    // requests from Vercel's servers, so in production it mostly fails.
    const known = new Map(bunkerProjects.map((p) => [p.urlKey, p]));
    const winners = dedupeByTeam(feed).filter((recap) => recap.won === true);

    const urls = [...new Set(winners.flatMap(candidates))];
    const ok = new Set(
      (await Promise.all(urls.map(async (url) => ((await isDisplayable(url)) ? url : null)))).filter(
        (url): url is string => !!url,
      ),
    );
    const devpost = await devpostDetails(
      winners.filter((recap) => recap.devpostUrl && !known.has(canonicalUrl(recap.devpostUrl))),
    );

    const larpsFor = (recap: Recap) => {
      const team = new Set([recap.userId, ...(recap.teamMembers ?? []).map((m) => m.userId)]);
      const key = eventKey(recap.eventName);
      return larps
        .filter((larp) => team.has(larp.userId) && eventKey(larp.eventName) === key)
        .map((larp) => {
          const text = larp.ogDescription ? decodeEntities(larp.ogDescription).trim() : "";
          return {
            author: larp.userName,
            authorImage: larp.userImage,
            url: larp.linkedinUrl,
            text: text.length > LARP_TEXT_LIMIT ? `${text.slice(0, LARP_TEXT_LIMIT).trimEnd()}…` : text,
            image: larp.ogImageUrl ? decodeEntities(larp.ogImageUrl) : null,
          };
        });
    };

    const events = new Map<
      string,
      { event: string; start: string | null; end: string | null; projects: unknown[]; photos: string[] }
    >();
    for (const recap of winners) {
      const key = eventKey(recap.eventName);
      let group = events.get(key);
      if (!group) {
        group = { event: decodeEntities(recap.eventName), start: null, end: null, projects: [], photos: [] };
        events.set(key, group);
      }
      if (!group.start && recap.eventStartDate) {
        group.start = recap.eventStartDate;
        group.end = recap.eventEndDate ?? null;
      }
      const info = devpost.get(recap.id);
      const fromBunker = recap.devpostUrl ? known.get(canonicalUrl(recap.devpostUrl)) : undefined;
      // Devpost-sourced gallery photos (tagged #src=devpost) lead, then the rest;
      // the tag is dropped and duplicates collapse on the bare URL.
      const tagged = candidates(recap).filter((url) => ok.has(url));
      const rank = (url: string) => (url.includes("#src=devpost") ? 0 : url.includes("#src=") ? 2 : 1);
      const ordered = [...tagged].sort((a, b) => rank(a) - rank(b));
      if (info?.image) ordered.splice(ordered.filter((u) => rank(u) === 0).length, 0, info.image);
      const photos = [...new Set(ordered.map((url) => url.split("#")[0]))];
      group.photos.push(...photos.filter((url) => !group.photos.includes(url)));
      group.projects.push({
        id: recap.id,
        title: fromBunker?.name ?? info?.title ?? titleFromDevpost(recap.devpostUrl) ?? recap.teamName ?? null,
        summary: fromBunker?.description ?? info?.summary ?? null,
        placement: recap.placement,
        prize: recap.prizeName ? decodeEntities(recap.prizeName) : null,
        prizeCents: recap.prizeCents,
        track: recap.track,
        team: recap.teamName,
        members: (recap.teamMembers ?? [{ userId: recap.userId, name: recap.userName, image: recap.userImage }]).map(
          (person) => ({ name: person.name, image: person.image }),
        ),
        devpost: recap.devpostUrl,
        github: recap.githubUrl,
        photos,
        larps: larpsFor(recap),
      });
    }

    const list = [...events.values()].sort((a, b) => String(b.start ?? "").localeCompare(String(a.start ?? "")));
    return json({ events: list, updatedAt: new Date().toISOString() });
  } catch (error) {
    const status = error instanceof AtlasError ? error.status : 502;
    return json({ error: "builds unavailable" }, status === 401 || status === 403 ? 500 : status);
  }
}
