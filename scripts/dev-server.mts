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

const ROOT = new URL("../dist/", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4321);

// Load .env without a dependency.
try {
  const env = await readFile(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  console.warn("No .env found — /api/* will return 503.");
}

const { default: stats } = await import("../api/stats.ts");
const { default: recaps } = await import("../api/recaps.ts");

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

  const handler =
    url.pathname === "/api/stats" ? stats : url.pathname === "/api/recaps" ? recaps : null;

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
