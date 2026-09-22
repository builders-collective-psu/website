/*
 * Downloads the leadership team's LinkedIn profile photos.
 *
 * This is a browser-console script, not a Node script. It reuses your own
 * logged-in LinkedIn session, so it only ever sees what you can already see.
 *
 * How to run it:
 *   1. Open https://www.linkedin.com/feed/ and make sure you are signed in.
 *   2. Open DevTools (F12) -> Console. Chrome may ask you to type "allow
 *      pasting" the first time.
 *   3. Paste this whole file, press Enter, and leave the tab in the
 *      foreground. It takes roughly half a minute (there is a deliberate
 *      pause between profiles).
 *   4. Chrome will ask to "Download multiple files" - choose Allow.
 *   5. Move everything it saved into public/headshots/linkedin/ in this repo.
 *      Keep the filenames exactly as they are; the site matches on them.
 *
 * Files are named after the LinkedIn username, e.g. lance-streuber.jpg.
 * Anyone with no profile photo is skipped and listed at the end - their card
 * keeps the initials tile.
 *
 * Getting the RIGHT photo, which an earlier version of this script got wrong:
 * a profile page embeds dozens of other people's photos ("People also
 * viewed", the feed, your own avatar in the nav bar). Scanning the page for
 * image URLs therefore picks up strangers. So this script never scrapes the
 * page body. It uses only two sources that are tied to one specific member:
 *
 *   1. the page's own og:image meta tag, which is the profile owner's photo
 *   2. LinkedIn's Voyager API, whose response we match on publicIdentifier
 *
 * As a last line of defence it also refuses to save the same image URL for
 * two different people, and prints every URL it used so you can spot-check.
 */

(async () => {
  const SLUGS = [
    "ishaannarang22",
    "lance-streuber",
    "vidyut-sriram-4b5a012aa",
    "varnika-yadav-vvy5053",
    "dev-solanki-b9a43a50",
    "anushaagarwal10",
    "trivi-sunil",
    "abhinav-dasari-852952241",
    "vedantshirvi",
    "matmanna",
  ];

  // Spacing the requests out keeps this looking like ordinary browsing.
  const DELAY_MS = 2500;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const EXT_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  // A real profile photo is served from media.licdn.com and has
  // "displayphoto" in the path. The grey silhouette placeholder and every
  // LinkedIn UI asset come from static.licdn.com, so they never match.
  const isProfilePhoto = (url) =>
    /^https:\/\/media\.licdn\.com\/dms\/image\/.*displayphoto/i.test(url);

  /** Source 1: the profile page's own og:image meta tag. */
  async function photoFromMetaTag(slug) {
    const response = await fetch(`https://www.linkedin.com/in/${slug}/`, {
      credentials: "include",
    });

    if (response.url.includes("/authwall") || response.url.includes("/login")) {
      throw new Error("not signed in - LinkedIn redirected to the login wall");
    }
    if (!response.ok) throw new Error(`profile HTTP ${response.status}`);

    const html = await response.text();
    const match =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );
    if (!match) return null;

    const url = match[1].replace(/&amp;/g, "&");
    return isProfilePhoto(url) ? url : null;
  }

  function csrfToken() {
    const match = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
    return match ? match[1] : null;
  }

  /**
   * Source 2: LinkedIn's own API. The response is keyed by member, and we
   * only accept the record whose publicIdentifier is the slug we asked for,
   * so there is no way to pick up someone else's picture here.
   */
  async function photoFromApi(slug) {
    const token = csrfToken();
    if (!token) return null;

    const endpoint =
      "https://www.linkedin.com/voyager/api/identity/dash/profiles" +
      `?q=memberIdentity&memberIdentity=${encodeURIComponent(slug)}`;

    const response = await fetch(endpoint, {
      credentials: "include",
      headers: {
        "csrf-token": token,
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "x-restli-protocol-version": "2.0.0",
      },
    });
    if (!response.ok) return null;

    const body = await response.json();
    const records = [
      ...(body.included || []),
      ...(body.elements || []),
      ...(body.data?.elements || []),
    ];

    const profile = records.find((record) => record.publicIdentifier === slug);
    const vector =
      profile?.profilePicture?.displayImageReference?.vectorImage ||
      profile?.profilePicture?.displayImage?.vectorImage;
    if (!vector?.rootUrl || !vector.artifacts?.length) return null;

    const largest = vector.artifacts.reduce((best, artifact) =>
      (artifact.width || 0) > (best.width || 0) ? artifact : best
    );
    const url = vector.rootUrl + largest.fileIdentifyingUrlPathSegment;
    return isProfilePhoto(url) ? url : null;
  }

  function save(blob, slug) {
    const ext = EXT_BY_TYPE[blob.type] || "jpg";
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${slug}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
    return `${slug}.${ext}`;
  }

  const saved = [];
  const noPhoto = [];
  const failed = [];
  const usedUrls = new Map();

  console.log(`Fetching ${SLUGS.length} profiles...`);

  for (const slug of SLUGS) {
    try {
      let url = null;
      let source = "og:image";

      try {
        url = await photoFromMetaTag(slug);
      } catch (error) {
        // A login-wall redirect is fatal; anything else is worth a retry
        // through the API below.
        if (String(error).includes("login wall")) throw error;
      }

      if (!url) {
        url = await photoFromApi(slug);
        source = "api";
      }

      if (!url) {
        noPhoto.push(slug);
        console.log(`  o ${slug} - no profile photo, keeping initials`);
        continue;
      }

      // Identical URLs for two people means something matched the wrong
      // member. Skip rather than save a stranger's face.
      const owner = usedUrls.get(url);
      if (owner) {
        failed.push([slug, `same image as ${owner} - skipped, download by hand`]);
        console.warn(`  ! ${slug} - resolved to the same photo as ${owner}`);
        continue;
      }
      usedUrls.set(url, slug);

      const image = await fetch(url);
      if (!image.ok) {
        failed.push([slug, `image HTTP ${image.status}`]);
        continue;
      }

      const filename = save(await image.blob(), slug);
      saved.push({ slug, filename, source, url });
      console.log(`  + ${slug} -> ${filename}  (${source})`);
    } catch (error) {
      failed.push([slug, String(error)]);
      console.log(`  x ${slug} - ${error}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDownloaded ${saved.length} of ${SLUGS.length}.`);
  console.log("Move them into public/headshots/linkedin/ without renaming.");
  if (saved.length) {
    console.log("Check these are the right faces:");
    console.table(saved);
  }
  if (noPhoto.length) console.log("No profile photo (keeping initials):", noPhoto);
  if (failed.length) console.log("Failed:", failed);
})();
