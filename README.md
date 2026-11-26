# builders collective website

site for builders collective at penn state

## stack

- astro 4, static, with tailwind and plain css tokens (`src/styles`)
- vercel edge functions in `api/` for live data from bunker (stats, recaps, built & won)
- d3-geo + topojson for the globe
- web audio for the music and sound effects, no audio files
- blog posts are markdown in `src/content/blog`
- most copy and lists live in `src/data/*.json`
- deployed on vercel, `hero-tally` pushes to bc.matmanna.dev

## dev

- `npm run dev` for the site alone, sections that need `/api` stay hidden
- `npm run dev:live` proxies `/api` to bc.matmanna.dev
- `npm run dev:api` builds and runs the real api handlers locally, needs `ATLAS_API_BASE` and `ATLAS_API_KEY` in `.env`
