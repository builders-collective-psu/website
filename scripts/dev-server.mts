/*
 * Local preview with working API endpoints.
 *
 * `astro dev` and `astro preview` only serve the static site — the files in
 * /api are Vercel functions and neither knows about them, which is why the
 * hero falls back to its built-in numbers locally. This server fills that
 * gap: it serves dist/ and runs the real handlers from /api for the two
 * endpoints, so what you see locally is what production will show.
 *
 *   npm run dev:api        # then open http://localhost:4321
 *
 * Reads ATLAS_API_BASE and ATLAS_API_KEY from .env.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { loadEnv } from "./load-env.mts";

const ROOT = new URL("../dist/", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4321);


await loadEnv(new URL("../.env", import.meta.url));

const { default: stats } = await import("../api/stats.ts");
const { default: recaps } = await import("../api/recaps.ts");
const { default: teamPhotos } = await import("../api/team-photos.ts");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  const routes: Record<string, () => Promise<Response>> = {
    "/api/stats": stats,
    "/api/recaps": recaps,
    "/api/team-photos": teamPhotos,
  };
  const handler = routes[url.pathname] ?? null;

  if (handler) {
    const response = await handler();
    res.writeHead(response.status, Object.fromEntries(response.headers));
    Readable.fromWeb(response.body as never).pipe(res);
    console.log(`${response.status} ${url.pathname}`);
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^\/+/, "");
  try {
    const body = await readFile(join(ROOT, relative));
    res.writeHead(200, { "content-type": MIME[extname(relative)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => {
  console.log(`dist/ + live /api on http://localhost:${PORT}`);
});
