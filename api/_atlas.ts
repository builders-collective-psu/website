/*
 * Server-only client for the Hack Atlas platform API.
 *
 * These files live in /api and run as Vercel functions, never in the browser:
 * the API key must not reach the client. The site's own build stays static
 * (`output: "static"`), so the existing dist/ deploy is unaffected — these
 * endpoints simply 404 on a plain static host, and the pages fall back to
 * their built-in numbers.
 *
 * The base URL is configurable because the platform's domain is expected to
 * change; only ATLAS_API_BASE needs updating when it does.
 */

const DEFAULT_BASE = "https://atlas.moldycrust.pizza";

/** oRPC exposes its OpenAPI surface under this prefix; procedures are POSTs. */
const RPC_PREFIX = "/api/rpc/api-reference";

export class AtlasError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function atlasConfig() {
  const base = (process.env.ATLAS_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const key = process.env.ATLAS_API_KEY;
  return { base, key };
}

/**
 * Calls one oRPC procedure, e.g. call("community/feed").
 *
 * Note the platform gates everything under the OpenAPI prefix on the `admin`
 * role, and an API key inherits its owner's role — so ATLAS_API_KEY must
 * belong to an admin account for these to return anything.
 */
export async function call<T>(procedure: string, input: unknown = {}): Promise<T> {
  const { base, key } = atlasConfig();
  if (!key) throw new AtlasError("ATLAS_API_KEY is not set", 503);

  const response = await fetch(`${base}${RPC_PREFIX}/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new AtlasError(`${procedure} failed: HTTP ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export interface Recap {
  id: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  teamId: string | null;
  teamName: string | null;
  won: boolean | null;
  placement: string | null;
  prizeName: string | null;
  prizeCents: number | null;
  track: string | null;
  prizePhotoUrl: string | null;
  eventPhotoUrls: string[] | null;
  githubUrl: string | null;
  devpostUrl: string | null;
  createdAt: string;
  userId: string;
  userName: string;
  userImage: string | null;
  teamMembers: { userId: string; name: string; image: string | null }[] | null;
}

/**
 * A team recap is stored once per member, all sharing the team's outcome, so
 * anything counted or summed has to collapse those rows first or a four-person
 * win counts four times. Personal recaps (teamId === null) always stand alone.
 */
export function dedupeByTeam(recaps: Recap[]): Recap[] {
  const seenTeams = new Set<string>();
  return recaps.filter((recap) => {
    if (!recap.teamId) return true;
    const composite = `${recap.eventId}:${recap.teamId}`;
    if (seenTeams.has(composite)) return false;
    seenTeams.add(composite);
    return true;
  });
}

/** Shared cache policy: cheap for visitors, still fresh within a few minutes. */
export const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? CACHE_HEADER : "no-store",
      ...extraHeaders,
    },
  });
}
