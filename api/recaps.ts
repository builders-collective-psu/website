import { AtlasError, call, dedupeByTeam, json, type Recap } from "./_atlas";

export const config = { runtime: "edge" };

const CARD_LIMIT = 12;
const PHOTO_LIMIT = 24;

/**
 * Recap cards and the photo gallery, from one upstream call.
 *
 * Only the fields the public site shows are forwarded — the platform's recap
 * rows also carry private ratings and notes, which stay on the platform.
 */
export default async function handler(): Promise<Response> {
  try {
    const recaps = dedupeByTeam(await call<Recap[]>("/community/feed"));

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
      photo: recap.prizePhotoUrl ?? recap.eventPhotoUrls?.[0] ?? null,
      team: recap.teamName,
      people: (recap.teamMembers ?? [{ userId: recap.userId, name: recap.userName, image: recap.userImage }])
        .map((person) => ({ name: person.name, image: person.image })),
      createdAt: recap.createdAt,
    }));

    const photos = recaps
      .flatMap((recap) =>
        [recap.prizePhotoUrl, ...(recap.eventPhotoUrls ?? [])]
          .filter((url): url is string => !!url)
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
        placement: recap.placement,
        prizeName: recap.prizeName,
        prizeCents: recap.prizeCents,
        track: recap.track,
        photo: recap.prizePhotoUrl ?? recap.eventPhotoUrls?.[0] ?? null,
        team: recap.teamName,
        people: (recap.teamMembers ?? [{ userId: recap.userId, name: recap.userName, image: recap.userImage }])
          .map((person) => person.name),
        createdAt: recap.createdAt,
      }));

    return json({ wins, cards, photos, updatedAt: new Date().toISOString() });
  } catch (error) {
    const status = error instanceof AtlasError ? error.status : 502;
    return json({ error: "recaps unavailable" }, status === 401 || status === 403 ? 500 : status);
  }
}
