import { AtlasError, call, dedupeByTeam, json, type Recap } from "./_atlas";

export const config = { runtime: "edge" };

interface Member {
  id: string;
  banned?: boolean | null;
}

/**
 * Club figures for the hero.
 *
 * Caveat worth knowing: community.feed returns the 60 most recent recaps, so
 * these are totals over that window, not all time. A dedicated aggregate
 * procedure on the platform (SQL COUNT/SUM over the whole table) would make
 * them exact and is the better long-term home for this — see TASKS.md in the
 * hacklas repo, "club overview pages".
 */
export default async function handler(): Promise<Response> {
  try {
    const [recaps, members] = await Promise.all([
      call<Recap[]>("community/feed"),
      call<Member[]>("community/members").catch(() => [] as Member[]),
    ]);

    const unique = dedupeByTeam(recaps);

    const wins = unique.filter((recap) => recap.won === true).length;
    const hackathons = new Set(unique.map((recap) => recap.eventId)).size;
    const shipped = unique.length;
    const prizeCents = unique.reduce((total, recap) => total + (recap.prizeCents ?? 0), 0);
    const activeMembers = members.filter((member) => !member.banned).length;

    return json({
      wins,
      hackathons,
      shipped,
      members: activeMembers || null,
      prizeCents,
      prizeTotal: `$${Math.round(prizeCents / 100).toLocaleString("en-US")}`,
      window: { recaps: recaps.length, capped: recaps.length >= 60 },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const status = error instanceof AtlasError ? error.status : 502;
    // The page keeps its built-in numbers when this fails, so a bad upstream
    // degrades to stale-but-correct rather than to an empty hero.
    return json({ error: "stats unavailable" }, status === 401 || status === 403 ? 500 : status);
  }
}
