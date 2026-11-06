import { AtlasError, call, dedupeByTeam, json, type Recap } from "./_atlas";

export const config = { runtime: "edge" };

interface Member {
  id: string;
  banned?: boolean | null;
  graduation?: string | null;
  title?: string | null;
  bio?: string | null;
  linkedin?: string | null;
  github?: string | null;
  discord?: string | null;
  psuEmail?: string | null;
  devpost?: string | null;
}

const PROFILE_FIELDS = ["title", "bio", "linkedin", "github", "discord", "psuEmail", "devpost", "graduation"] as const;

/** Members who have filled in any profile data and have not graduated yet. */
function currentMembers(members: Member[], now = new Date()): number {
  // graduation is a "YYYY-MM" month; it counts as graduated once that month is over.
  const thisMonth = now.toISOString().slice(0, 7);
  return members.filter(
    (member) =>
      !member.banned &&
      PROFILE_FIELDS.some((field) => !!member[field]) &&
      !(member.graduation && member.graduation < thisMonth),
  ).length;
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
    const [recaps, members, leaderboard] = await Promise.all([
      call<Recap[]>("/community/feed"),
      call<Member[]>("/community/members").catch(() => [] as Member[]),
      call<{ wins: number; prizeCents?: number | null }[]>("/community/leaderboard").catch(() => null),
    ]);

    const unique = dedupeByTeam(recaps);

    // Wins count per person: two people winning one track is two wins. The
    // platform's leaderboard already tallies exactly that per member, so its
    // sum is the source of truth. The feed-derived figure is only a fallback:
    // it misses wins the feed's team rows do not list members for.
    const feedWins = unique
      .filter((recap) => recap.won === true)
      .reduce((total, recap) => total + Math.max(1, recap.teamMembers?.length ?? 1), 0);
    const leaderboardWins = leaderboard?.reduce((total, row) => total + (row.wins ?? 0), 0) ?? 0;
    const wins = leaderboardWins || feedWins;
    const hackathons = new Set(unique.map((recap) => recap.eventId)).size;
    const shipped = unique.length;
    // Prize money: the leaderboard gives each member their share (a prize paid
    // per member counts once per member; a team total is split between them),
    // so its sum is what the club actually won. Summing one prize per team
    // undercounts per-member prizes, so that is only the fallback.
    const feedPrizeCents = unique.reduce((total, recap) => total + (recap.prizeCents ?? 0), 0);
    const leaderboardPrizeCents = leaderboard?.reduce((total, row) => total + (row.prizeCents ?? 0), 0) ?? 0;
    const prizeCents = leaderboardPrizeCents || feedPrizeCents;
    const activeMembers = currentMembers(members);
    const teamWins = unique.filter((recap) => recap.won === true).length;

    return json({
      wins,
      teamWins,
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
