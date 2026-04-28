# Self-hosted fonts

Per [HANDOFF.md §06](../../_design/handoff.html), production must self-host fonts (privacy + speed).

## TODO before deploy

Drop these `.woff2` files into this directory (`public/fonts/`), then swap the
Google Fonts `<link>` in `src/layouts/Base.astro` for the self-hosted `@font-face`
declarations already commented in `src/styles/tokens.css`.

### Required files

| File | Family | Weight |
|---|---|---|
| `space-grotesk-400.woff2` | Space Grotesk | 400 |
| `space-grotesk-500.woff2` | Space Grotesk | 500 |
| `space-grotesk-600.woff2` | Space Grotesk | 600 |
| `space-grotesk-700.woff2` | Space Grotesk | 700 |
| `jetbrains-mono-400.woff2` | JetBrains Mono | 400 |
| `jetbrains-mono-500.woff2` | JetBrains Mono | 500 |
| `jetbrains-mono-700.woff2` | JetBrains Mono | 700 |
| `instrument-serif-italic.woff2` | Instrument Serif | 400 italic |

Subset to Latin to stay under the 80 KB total budget (HANDOFF §07).

### Sources

- Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk (OFL)
- JetBrains Mono — https://fonts.google.com/specimen/JetBrains+Mono (OFL)
- Instrument Serif — https://fonts.google.com/specimen/Instrument+Serif (OFL)

Use [google-webfonts-helper](https://gwfh.mranftl.com/fonts) to subset and
download `.woff2` directly.

### Preload

Add to `<head>` in `Base.astro`:

```html
<link rel="preload" href="/fonts/space-grotesk-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-500.woff2" as="font" type="font/woff2" crossorigin>
```
