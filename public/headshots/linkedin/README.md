# LinkedIn profile photos

Drop the files that `scripts/fetch-linkedin-photos.js` downloads into this
folder, keeping their names exactly as saved — the filename is the person's
LinkedIn username (`linkedinSlug` in `src/data/team.json`).

```
public/headshots/linkedin/lance-streuber.jpg
public/headshots/linkedin/matmanna.jpg
```

`.jpg`, `.jpeg`, `.png` and `.webp` all work. At build time each team
card looks for a file here matching that person's username; if there isn't
one, the card falls back to the initials tile in `public/headshots/`. So a
missing photo is fine — nothing breaks, and adding the file later is the only
step needed to swap it in.
