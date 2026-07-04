# Texture credits

## Ra system (fictional worlds)
`amunet, anubis, horus, khonsu, naunet, nephtys, nu, nut, osiris, ra,
satis, satismoon, sekhmet, set, shu, uatur, wadjet, debris` — AI-generated
equirectangular maps produced for this project (see `tools/` pipeline).

## Solar System (real bodies)

### Planets, Moon, Sun, Saturn rings — Solar System Scope
Source: <https://www.solarsystemscope.com/textures/>
License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
<https://creativecommons.org/licenses/by/4.0/>
Attribution: *Solar System Scope / INOVE (solarsystemscope.com)*, whose maps
are in turn based on public-domain NASA elevation and imagery data.

| file | source texture |
|------|----------------|
| `sun.webp`          | 2k_sun.jpg |
| `mercury.webp`      | 2k_mercury.jpg |
| `venus.webp`        | 2k_venus_atmosphere.jpg |
| `earth.webp`        | 2k_earth_daymap.jpg |
| `moon.webp`         | 2k_moon.jpg |
| `mars.webp`         | 2k_mars.jpg |
| `jupiter.webp`      | 2k_jupiter.jpg |
| `saturn.webp`       | 2k_saturn.jpg |
| `saturn_rings.webp` | 2k_saturn_ring_alpha.png |
| `uranus.webp`       | 2k_uranus.jpg |
| `neptune.webp`      | 2k_neptune.jpg |

### Galilean moons + Titan — NASA / JPL / USGS (public domain)
U.S. Government works, no copyright. Downloaded from Wikimedia Commons.

| file | source | mission |
|------|--------|---------|
| `io.webp`       | "Io modest scale map — SSI-only color (SIMP0)" | Galileo/Voyager, USGS |
| `europa.webp`   | "Europa Voyager–GalileoSSI global mosaic"       | Galileo/Voyager, USGS |
| `ganymede.webp` | "Ganymede map NASA JPL Voyager"                 | Voyager/Galileo, NASA/JPL |
| `callisto.webp` | "Callisto USGS global"                          | Galileo/Voyager, USGS |
| `titan.webp`    | "Map of Titan" (Cassini ISS)                    | Cassini, NASA/JPL/SSI |

### Composited: real imaged hemisphere + procedural fill (public domain source)
These worlds were only imaged over one hemisphere by their flyby spacecraft;
the real cylindrical mosaic is used where data exists, and the un-imaged polar
band is filled with a colour-matched, feathered procedural texture (see
`tools/`-style value-noise). The real half is NASA public-domain imagery.

| file | real source (imaged hemisphere) | mission |
|------|---------------------------------|---------|
| `pluto.webp`  | "Pluto color mapmosaic"        | New Horizons, NASA/JHUAPL/SwRI |
| `charon.webp` | "Cpmap cyl PS717 HR 180"       | New Horizons, NASA/JHUAPL/SwRI |
| `triton.webp` | "Triton map no grid" (Voyager 2)| Voyager 2, NASA/JPL |

### Kept procedural (no clean full-globe map available)
Enceladus (real maps are grid/label-annotated), Phobos and Deimos (few-km
irregular chunks) — these use the engine's procedural texture generator.

All real textures were downscaled and re-encoded to WebP for this project;
originals are unmodified in content. The composited maps combine unmodified
real imagery with generated fill only over the never-imaged regions.
