/**
 * The hero globe: an orthographic Earth facing America, with a dot for every
 * outing (grey) and every event we won at (orange). When the tally selects an
 * event, the globe turns to centre it and puts a beacon on it.
 *
 * Loaded only on desktop (see Globe.astro), so phones never download it.
 */
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";

interface Outing {
  event: string;
  wins: number;
  lat: number | null;
  lon: number | null;
}

interface Selected {
  event: string;
  lat?: number | null;
  lon?: number | null;
}

const SVG = "http://www.w3.org/2000/svg";
const AMERICA: [number, number] = [-96, 38];

export function initGlobe(root: HTMLElement) {
  const svg = root.querySelector("svg");
  if (!svg) return;

  const size = 320;
  const projection = geoOrthographic()
    .scale(size / 2 - 4)
    .translate([size / 2, size / 2])
    .clipAngle(90)
    .rotate([-AMERICA[0], -AMERICA[1]]);
  const path = geoPath(projection);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const land = feature(land110 as any, (land110 as any).objects.land);
  const graticule = geoGraticule10();

  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string) => {
    const el = document.createElementNS(SVG, tag);
    el.setAttribute("class", cls);
    return el;
  };

  const sphere = make("path", "g-sphere");
  const grid = make("path", "g-grid");
  const ground = make("path", "g-land");
  const dots = make("g", "g-dots");
  const beacon = make("circle", "g-beacon");
  beacon.setAttribute("r", "4");
  svg.append(sphere, grid, ground, dots, beacon);

  let outings: Outing[] = [];
  let selected: Selected | null = null;

  function render() {
    sphere.setAttribute("d", path({ type: "Sphere" }) ?? "");
    grid.setAttribute("d", path(graticule) ?? "");
    ground.setAttribute("d", path(land) ?? "");

    const centre = projection.invert?.([size / 2, size / 2]) ?? AMERICA;
    dots.replaceChildren(
      ...outings
        .filter((o) => o.lat !== null && o.lon !== null)
        .filter((o) => geoDistance([o.lon as number, o.lat as number], centre) < Math.PI / 2)
        .sort((a, b) => a.wins - b.wins)
        .map((o) => {
          const [x, y] = projection([o.lon as number, o.lat as number]) ?? [0, 0];
          const dot = make("circle", o.wins > 0 ? "g-dot g-dot--won" : "g-dot");
          dot.setAttribute("cx", x.toFixed(1));
          dot.setAttribute("cy", y.toFixed(1));
          dot.setAttribute("r", o.wins > 0 ? "3" : "2");
          if (o.wins > 0) dot.setAttribute("data-event", o.event);
          return dot;
        }),
    );

    if (selected && selected.lat != null && selected.lon != null) {
      const visible = geoDistance([selected.lon, selected.lat], centre) < Math.PI / 2;
      const [x, y] = projection([selected.lon, selected.lat]) ?? [0, 0];
      beacon.setAttribute("cx", x.toFixed(1));
      beacon.setAttribute("cy", y.toFixed(1));
      beacon.style.display = visible ? "" : "none";
    } else {
      beacon.style.display = "none";
    }
  }

  // Turn to a point with a small overshoot, like a game camera settling.
  let frame = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const backOut = (t: number) => {
    const s = 1.4;
    return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  };

  function turnTo(lon: number, lat: number) {
    cancelAnimationFrame(frame);
    const [r0, r1] = projection.rotate();
    const from: [number, number] = [-r0, -r1];
    const to: [number, number] = [lon, lat];
    if (reduced) {
      projection.rotate([-to[0], -to[1]]);
      render();
      return;
    }
    const between = geoInterpolate(from, to);
    const start = performance.now();
    const duration = 560;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const [x, y] = between(backOut(t));
      projection.rotate([-x, -y]);
      render();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // Orange dots are tappable: they pick that event in the tally. Pointerdown,
  // not click: dots are redrawn while the globe turns, which would drop a click.
  dots.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    const name = target?.getAttribute("data-event");
    if (name) window.dispatchEvent(new CustomEvent("tally:pick", { detail: name }));
  });

  window.addEventListener("tally:outings", (event) => {
    outings = ((event as CustomEvent).detail as Outing[]) ?? [];
    root.setAttribute("data-ready", "");
    render();
  });

  window.addEventListener("tally:select", (event) => {
    selected = (event as CustomEvent).detail as Selected;
    if (selected && selected.lat != null && selected.lon != null) {
      // Restart the beacon ping for each new pick.
      beacon.classList.remove("is-ping");
      void (beacon as unknown as HTMLElement).getBoundingClientRect();
      beacon.classList.add("is-ping");
      turnTo(selected.lon, selected.lat);
    } else {
      render();
    }
  });

  // One flying note per musical note, launched from the beacon on the
  // selected event. Bass notes are ink, chord notes orange; higher pitches
  // fly higher.
  const notes = root.querySelector<HTMLElement>("[data-notes]");
  const GLYPHS = ["♪", "♫", "♩", "♬"];
  let noteSeed = 3;
  let noteCount = 0;
  const rnd = () => {
    noteSeed = (noteSeed * 16807) % 2147483647;
    return noteSeed / 2147483647;
  };
  window.addEventListener("fx:note", (event) => {
    if (!notes || reduced) return;
    const { midi, kind } = (event as CustomEvent<{ midi: number; kind: string }>).detail;
    // From the beacon (SVG units → the box, relative to its centre). With no
    // beacon — an event without a location — from the middle of the globe, so
    // every note played still gets its note.
    const scale = root.clientWidth / size;
    const hasBeacon = beacon.style.display !== "none" && beacon.hasAttribute("cx");
    const sx = hasBeacon ? Number(beacon.getAttribute("cx")) * scale - root.clientWidth / 2 : 0;
    const sy = hasBeacon ? Number(beacon.getAttribute("cy")) * scale - root.clientHeight / 2 : 0;
    const lift = 70 + Math.max(0, Math.min(1, (midi - 48) / 32)) * 90; // pitch → height
    const angle = (-90 + (rnd() - 0.5) * 110) * (Math.PI / 180);
    const note = document.createElement("span");
    note.className = "note";
    note.style.setProperty("--sx", `${sx}px`);
    note.style.setProperty("--sy", `${sy}px`);
    note.style.setProperty("--dx", `${sx + Math.cos(angle) * lift}px`);
    note.style.setProperty("--dy", `${sy + Math.sin(angle) * lift}px`);
    note.style.setProperty("--rot", `${Math.round(rnd() * 40 - 20)}deg`);
    note.style.setProperty("--size", `${kind === "bass" ? 30 : 22}px`);
    if (kind === "bass") note.style.setProperty("--tint", "var(--ink)");
    const glyph = document.createElement("span");
    glyph.textContent = GLYPHS[noteCount++ % GLYPHS.length];
    note.appendChild(glyph);
    note.addEventListener("animationend", (e) => {
      if (e.target === note) note.remove();
    });
    notes.appendChild(note);
  });

  // Data may have arrived before this module loaded.
  const w = window as unknown as { __tallyOutings?: Outing[]; __tallySelected?: Selected };
  if (w.__tallyOutings) {
    outings = w.__tallyOutings;
    root.setAttribute("data-ready", "");
  }
  render();
  if (w.__tallySelected) window.dispatchEvent(new CustomEvent("tally:select", { detail: w.__tallySelected }));
}
