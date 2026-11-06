import { AtlasError, call, dedupeByTeam, json, type Recap } from "./_atlas";
import { candidates, decodeEntities, devpostDetails, isDisplayable, ownPhoto } from "./_media";

export const config = { runtime: "edge" };

const CARD_LIMIT = 12;
const PHOTO_LIMIT = 24;

interface EventFlag {
  slug: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Most platform events have no coordinates (stored as 0, 0) but do have a
 * city. Cities and well-known hackathon series map to coordinates here.
 */
const CITIES: Record<string, [number, number]> = {
  "state college": [40.7982, -77.8599],
  "san francisco": [37.7749, -122.4194],
  berkeley: [37.8719, -122.2585],
  "los angeles": [34.0689, -118.4452],
  baltimore: [39.3299, -76.6205],
  pittsburgh: [40.4433, -79.9436],
  philadelphia: [39.9522, -75.1932],
  "ann arbor": [42.2780, -83.7382],
  "college park": [38.9869, -76.9426],
  princeton: [40.3431, -74.6551],
  boston: [42.3601, -71.0589],
  cambridge: [42.3770, -71.1167],
  amherst: [42.3868, -72.5301],
  "new haven": [41.3163, -72.9223],
  atlanta: [33.7756, -84.3963],
  queens: [40.6413, -73.7781],
  "new york": [40.7128, -74.006],
  waterloo: [43.4723, -80.5449],
  dearborn: [42.3223, -83.1763],
};
const SERIES: [RegExp, string][] = [
  [/hackpsu|c0mpiled|gdg@psu/i, "state college"],
  [/hackprinceton/i, "princeton"],
  [/cal ?hacks/i, "san francisco"],
  [/yhack/i, "new haven"],
  [/hack the north/i, "waterloo"],
  [/y combinator/i, "san francisco"],
  [/hacklytics|hackgt/i, "atlanta"],
  [/mhacks/i, "ann arbor"],
  [/bitcamp/i, "college park"],
  [/la hacks|lahacks/i, "los angeles"],
];

function placeFor(city: string | null | undefined, name: string): [number, number] | null {
  const known = city && CITIES[city.trim().toLowerCase()];
  if (known) return known;
  const series = SERIES.find(([pattern]) => pattern.test(name));
  return series ? CITIES[series[1]] : null;
}

/**
 * Recap cards and the photo gallery, from one upstream call.
 *
 * Only the fields the public site shows are forwarded — the platform's recap
 * rows also carry private ratings and notes, which stay on the platform.
 */
export default async function handler(): Promise<Response> {
  try {
    const [feed, flags] = await Promise.all([
      call<Recap[]>("/community/feed"),
      call<EventFlag[]>("/community/event-flags").catch(() => [] as EventFlag[]),
    ]);
    const recaps = dedupeByTeam(feed);
    const coordsBySlug = new Map<string, [number, number]>();
    const cityBySlug = new Map<string, string>();
    for (const flag of flags) {
      const { latitude: lat, longitude: lon } = flag;
      if (typeof lat === "number" && typeof lon === "number" && (lat !== 0 || lon !== 0)) {
        coordsBySlug.set(flag.slug, [lat, lon]);
      }
      if (flag.city && flag.city !== "Unknown") cityBySlug.set(flag.slug, flag.city);
    }
    const unique = [...new Set(recaps.flatMap(candidates))];
    const okPhotos = new Set(
      (await Promise.all(unique.map(async (url) => ((await isDisplayable(url)) ? url : null)))).filter(
        (url): url is string => !!url,
      ),
    );
    // Devpost thumbnails only for recaps with no usable photo of their own.
    const devpost = await devpostDetails(recaps.filter((recap) => !ownPhoto(recap, okPhotos)), 24, 2500);
    const photoFor = (recap: Recap) => ownPhoto(recap, okPhotos) ?? devpost.get(recap.id)?.image ?? null;

    const cards = recaps.slice(0, CARD_LIMIT).map((recap) => ({
      id: recap.id,
      event: recap.eventName,
      eventSlug: recap.eventSlug,
      won: recap.won === true,
      placement: recap.placement,
      prizeName: recap.prizeName,
      prizeCents: recap.prizeCents,
      track: recap.track,
      github: recap.githubUrl,
      devpost: recap.devpostUrl,
      photo: photoFor(recap),
      team: recap.teamName,
      people: (recap.teamMembers ?? [{ userId: recap.userId, name: recap.userName, image: recap.userImage }])
        .map((person) => ({ name: person.name, image: person.image })),
      createdAt: recap.createdAt,
    }));

    const photos = recaps
      .flatMap((recap) =>
        candidates(recap)
          .filter((url) => okPhotos.has(url))
          .map((url) => ({ url, event: recap.eventName, eventSlug: recap.eventSlug })),
      )
      .slice(0, PHOTO_LIMIT);

    // Every win, not just the recent window the cards are sliced to — the
    // trophy case is a running record and should not lose older wins.
    const wins = recaps
      .filter((recap) => recap.won === true)
      .map((recap) => ({
        id: recap.id,
        event: recap.eventName,
        eventSlug: recap.eventSlug,
        eventStart: recap.eventStartDate ?? null,
        eventEnd: recap.eventEndDate ?? null,
        placement: recap.placement,
        prizeName: recap.prizeName,
        prizeCents: recap.prizeCents,
        track: recap.track,
        photo: photoFor(recap),
        team: recap.teamName,
        people: (recap.teamMembers ?? [{ userId: recap.userId, name: recap.userName, image: recap.userImage }])
          .map((person) => person.name),
        createdAt: recap.createdAt,
      }));

    // Per outing (one event, merged by name since some are entered twice):
    // members who went, and wins counted per person.
    const outingsByName = new Map<
      string,
      {
        event: string;
        start: string | null;
        end: string | null;
        lat: number | null;
        lon: number | null;
        people: Set<string>;
        wins: number;
      }
    >();
    for (const recap of recaps) {
      const name = decodeEntities(recap.eventName);
      const key = name.toLowerCase().replace(/\s+/g, " ").trim();
      let outing = outingsByName.get(key);
      if (!outing) {
        outing = { event: name, start: null, end: null, lat: null, lon: null, people: new Set(), wins: 0 };
        outingsByName.set(key, outing);
      }
      if (!outing.start && recap.eventStartDate) {
        outing.start = recap.eventStartDate;
        outing.end = recap.eventEndDate ?? null;
      }
      if (outing.lat === null) {
        const coords = coordsBySlug.get(recap.eventSlug) ?? placeFor(cityBySlug.get(recap.eventSlug), name);
        if (coords) [outing.lat, outing.lon] = coords;
      }
      outing.people.add(recap.userId);
      for (const member of recap.teamMembers ?? []) outing.people.add(member.userId);
      if (recap.won === true) outing.wins += Math.max(1, recap.teamMembers?.length ?? 1);
    }
    const outings = [...outingsByName.values()].map(({ people, ...rest }) => ({ ...rest, people: people.size }));

    return json({ wins, cards, photos, outings, updatedAt: new Date().toISOString() });
  } catch (error) {
    const status = error instanceof AtlasError ? error.status : 502;
    return json({ error: "recaps unavailable" }, status === 401 || status === 403 ? 500 : status);
  }
}
