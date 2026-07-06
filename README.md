# Ra System Alpha — Physics Sandbox

**The physically-accurate, Universe-Sandbox-style edition of the Ra system simulation.**
This fork of the [experimental edition](https://github.com/m1omg/ra-system-experimental)
is where real physics lands first: N-body gravity, custom body creation, and whatever
else the sandbox grows next. The [stable](https://github.com/m1omg/ra-system-simulation)
and experimental editions keep the curated fictional-system experience.

A self-contained, browser-based 3D orrery of the **Ra (10 Tauri)** system from the
*Satis* worldbuilding document — the star, its planets, their moons, the brown-dwarf
companion **Horus** with its own four worlds, and the far outer system from the
author's Universe Sandbox save: the ghost-pale gas giant **Salibe**, the frozen
super-Earth **Yamm**, the sednoid ice world **Kauket**, and a glittering **fragment
belt** of ~680 collision shards near Wadjet's orbit.

## How to run

**Just double-click `index.html`** (or open it in any modern browser — Chrome,
Firefox, Edge). No server, no internet, no installation required. Everything runs
locally.

### Two reading modes (one page, **📖** toggle)

Each world opens with a short, readable **summary**, followed by your *exact* words from the
source document underneath (where the document describes that world). The **📖** button in the
bottom bar flips between:

- **Summary + source** (default) — the summary, then your verbatim text beneath it.
- **Author's text** — your *exact* words only, with no summary and no paraphrasing.

(Worlds the document hasn't described yet — Shu, Horus, Khonsu, Nut, Osiris, Salibe, Yamm,
Kauket — show only the summary in the default mode, and a short note in author's-text mode.)

## What's inside

- **Every body from the document**, placed on Keplerian elliptical orbits with
  physically-scaled *relative* orbital speeds (inner worlds race, outer worlds crawl).
- **Photoreal surface maps** for every world (with a fast **procedural** texture baked
  into the browser as an instant first paint and automatic fallback): banded gas giants,
  the blue-marble ocean of Uat-Ur, Satis's violet-forested continents, the rusty deserts
  of Set, molten Sekhmet, the brown-dwarf glow of Horus, and more.
- **Click any world** (or use the list on the left, or click its label) to fly the
  camera to it and open a data panel with its real figures, a description, and the
  AI-rendered concept art from the document.
- **Two systems in one page** — flip between the fictional **Ra** system and **our
  real Solar System** (⇄ button) with real photo textures for 15 bodies and real
  Saturn rings.
- **Two languages** — an in-page **English ↔ Slovenčina** toggle (🌐 button).

## Fly mode (🚀)

A free-roam flight mode (real scale) lets you pilot a camera through the system:
throttle up, thrust, strafe, roll, and **⤳ Go&nbsp;to** any world. **⛓ Follow** locks
onto a body and co-moves as it orbits; **⚡ Auto** scales your speed to nearby bodies
(click for uncapped manual speed). Keyboard: `W/S` or `↑↓` fly, `A/D` or `←→` strafe,
`PgUp/PgDn` or `R` up/down, drag to look, `Q/E` roll, wheel = speed, `F` = follow,
`Esc` = exit.

## Impact lab (💥) — destruction sandbox

Open the Impact lab and strike any world to watch real impact physics play out.
It is a genuine little physics sandbox, not just an effect:

- **Two weapons.** A customizable **☄ asteroid** (set its **diameter**, **speed**, and
  **material** — rock / iron / ice / comet — the panel shows the resulting mass and
  kinetic energy, quoted in joules, tons of TNT, and multiples of Chicxulub), or a
  continuous **laser** (set its **power** in watts and hold to pour energy in).
- **A real energy budget.** Every strike's kinetic energy is spent against each
  world's own composition: heating and melting rock, boiling oceans to steam,
  flashing ice to vapour. Damage is **cumulative** and **persists** as scars.
- **Composition-aware melting.** Watch craters grow into lava seas and finally a
  global magma ocean; water worlds boil their oceans away before the rock melts;
  gas giants inflate rather than crater.
- **Worlds actually come apart.** Pour in more than a world's **gravitational binding
  energy** and it *shatters* — the planet is replaced in place by a debris field whose
  fragments then evolve under the dead world's own **self-gravity**: pieces flung below
  escape speed decelerate, fall back and **re-accrete into a battered rubble-pile
  remnant** — and if enough mass gathers, part of it **coalesces into moonlet(s) that
  orbit the remnant** on their own real orbits (its label pulses when it forms). Each
  moonlet is a first-class body: click it to fly there, it's named and labelled, and it
  opens its own data panel. Re-accretion runs on sim-time, so the **speed slider
  fast-forwards it** (and pausing freezes it). Faster pieces disperse outward. A
  barely-fatal blow reforms a lumpy dwarf (sometimes with a little moon); a massive
  overkill scatters almost everything. **Kepler shear** smears the
  escaping cloud along the dead world's orbit into a glittering ring over (sim) time,
  and a shattered planet **liberates its moons**, which sail on around Ra on their own
  newly-computed orbits.
- **Even the star is fair game.** Pump more than Ra's own binding energy into it and it
  detonates in a supernova-like blast: a blinding core flash, an expanding shock shell,
  a shader-driven ejecta cloud that cools from white-gold through orange to a wispy
  remnant nebula — while the dying light surges, reddens and goes out, nearby worlds
  are scorched by inverse-square exposure, and the survivors are flung onto unbound
  orbits. A collapsed ember core is all that remains (🧽 Heal undoes even this).
  The blast propagates at **physical speed on sim time**: the radiation front
  (light/heat/X-rays) crosses the system at *c* (8.3 min per AU) and the matter shock
  follows at 0.1 *c*, so each world is flash-scorched first and hammered later — crank
  the time warp to ~1 hour/s–1 day/s to watch the fronts sweep the system, pause to
  freeze them mid-flight.
- **Momentum is conserved.** A massive, fast strike **kicks the target's orbit** — the
  new ellipse is recomputed exactly from the perturbed state vector and redrawn.
- **Superheated worlds lose mass**, and the data panel tracks the live figure.
- **🧽 Heal** removes every scar, re-forms shattered worlds, and re-captures their moons.

## Sound (🔊)

Optional procedural **sound effects** (whoosh, impact, shatter, heal chime). Space is
silent in reality — this is rule-of-cool only — so it's a toggle you can switch off.

## Controls

| Action | How |
| --- | --- |
| Orbit camera | Left-drag |
| Zoom | Scroll wheel |
| Orbit camera (alt) | Right-drag |
| Pan | Middle-drag |
| Focus a world | Click it / pick from the list / click its label |
| Play / pause | Bottom bar |
| Time speed | "Speed" slider (0.05× – 40×, logarithmic) |
| Exaggerate sizes | "Size" slider |
| Real ↔ Compressed orbits | "📏" button, bottom bar |
| Author's text ↔ Summary | "📖" button, bottom bar |
| Toggle orbits / labels / tails | Bottom bar |
| Fly mode (free-roam) | "🚀 Fly" button, bottom bar |
| Impact lab (strike a world) | "💥 Impact" button, bottom bar |
| Sound effects on/off | "🔊 SFX" button, bottom bar |
| Ra ↔ real Solar System | "⇄" button, bottom bar |
| English ↔ Slovenčina | "🌐" button, bottom bar |
| Reset view | Bottom bar |
| Help & glossary | **?** button, top-right |
| Deep-link a world | open `index.html#satis` (any body key) |

## A note on scale

The system spans from a hot Neptune at **0.05 AU** to a brown dwarf at **46 AU** — a
~950× range — and body diameters range from ~2,500 km moons to a 126,000 km brown dwarf.
Two view modes (toggle in the bottom bar):

- **Real scale** (default) — orbits sit at their true distance in AU, so Amunet hugs the
  star and Horus is far out at 46 AU. Zoom out to find Shu and Horus.
- **Compressed** — a non-linear law squeezes the range so the whole system fits on screen
  at once.

Body sizes are exaggerated in both modes (true sizes would be invisible dots). The *real*
figures are always shown in each world's data panel, and relative orbital *speeds* remain
physically correct (Kepler's third law).

## Files

```
index.html                       — the page (shell + UI; 📖 toggles summary/author's text)
assets/app.js                    — 3D engine (Three.js scene, textures, orbits, impacts, flight)
assets/data.js                   — Ra-system body data, stats, summary descriptions
assets/data-sol.js               — our real Solar System body data (⇄ toggle)
assets/descriptions-verbatim.js  — the author's word-for-word descriptions
assets/lang-sk.js                — Slovak (Slovenčina) translation strings (🌐 toggle)
assets/img/                      — concept art + real photo textures
assets/lib/                      — Three.js r132 + OrbitControls (bundled for offline use)
```

To update a world's numbers or summary text, edit `assets/data.js` (Ra) or
`assets/data-sol.js` (Solar System); to update the verbatim text, edit
`assets/descriptions-verbatim.js`; to update the Slovak strings, edit `assets/lang-sk.js`.

## Surface textures

By default every world loads a **baked surface map** (`assets/img/textures/<key>.webp`):
AI-generated equirectangular maps for the fictional Ra worlds, and real public-domain /
CC-BY photography for the Solar System bodies (see
[`assets/img/textures/CREDITS.md`](assets/img/textures/CREDITS.md) for attribution). Each
world *also* has a fast, deterministic **procedural** texture generated in the browser as an
instant first paint and automatic fallback — if a baked map is missing or fails to load, the
world silently keeps its procedural texture, so the page always works and stays fully offline.

The Ra maps are **baked once, offline** and committed as plain image files — the page itself
makes no API calls, so it stays openable offline with no key. To (re)generate them:

```
node tools/gen-refs.mjs    # render procedural refs + build per-body prompts → tools/_raw/ref/, tools/prompts.json
tools/gen-ai.sh            # drive Codex's built-in gpt-image-2 (uses Codex auth, no API key) → tools/_raw/ai/
python3 tools/post.py      # seam-blend + downscale → assets/img/textures/<key>.webp
```

`tools/texture-core.mjs` is a headless duplicate of the procedural generators from
`assets/app.js` (kept in sync by hand) used only to produce the reference images.
`tools/_raw/` (references + full-res originals) is git-ignored; only the final
`assets/img/textures/*.webp` are committed.

(`index-ai.html` and `index-verbatim.html` are legacy **redirects** to `index.html` — the
old separate editions were merged into one page with the 📖 and texture toggles above.)

---
*Planetary classification follows the ArcBuilder PCL. Built from “Satis v10”.*
