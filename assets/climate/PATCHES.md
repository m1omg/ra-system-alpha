# Changes to the altdev2 physics

`assets/climate/physics/` is the planet-climate-sandbox's altdev2 model, copied
verbatim. Each change below sits behind a parameter whose default reproduces
altdev2 exactly, so it can be taken upstream as it is. Each is marked in the
code with `[ra-climate patch]`; `node tools/patchcheck.mjs` holds the defaults
to altdev2, bit for bit.

## weatherCapK — silicate weathering is supply-limited when hot

`volatiles.js`, carbonate–silicate cycle. The land and seafloor weathering rates
take `min(Tmean, p.weatherCapK)` instead of `Tmean` in their temperature
dependence; unset (the default), the cap is infinite and nothing changes.

Why: the exponential is a kinetic law. Well above today's temperatures,
weathering is limited by how fast erosion exposes fresh rock rather than by how
fast rock dissolves (West et al. 2005; Maher & Chamberlain 2014). Uncapped, a
century of hot, wet runaway after a 5×10²⁶ J impact on Earth weathered at e⁸ ≈
3000× today's rate, stripped the air of CO₂, and left the planet a snowball at
−36 °C for a million years (tools/impactladder.mjs).

This edition sets `weatherCapK: 320` for every world (profiles.js, `STILL`).
Measured after it, the same strike leaves Earth at 21 °C ten thousand years
on. A world feels the cap only while it is above 320 K *and* has liquid water
weathering rock. Set, Nephtys, Sekhmet, Venus and Mercury are hot but dry;
Anubis is the one that qualifies, and there the cap took its CO₂ to 0.104 bar
after 10 Myr instead of 0.101, so it was re-tuned under the cap (outgassing
4.71 → 1.31, tools/climate-tune.mjs). Every documented world, Anubis
included, now settles to the same state over a megayear with the cap and
without it.

## Life follows the climate — biosphere.js, volatiles.js

Six parameters, all unset in altdev2; this edition sets every one (profiles.js,
`STILL`). `tools/patchcheck.mjs` runs the patched model with them unset beside
the verbatim copy from the commit that brought the physics in, and requires
every saved field to agree to the bit.

- **`originWait`** — a bug fix. `stepLife` lifts any first step of an origin
  from below `EXTINCT` to twice it, so every origin took one step: a world
  whose eukaryotes died had them back the next day and a third of the planet
  a megayear later, and `PRO_ORIGIN`/`EUK_ORIGIN` were never waited. Set, the
  population waits that long of habitable conditions (with a host, for
  eukaryotes), then seeds and spreads.
- **`abiogenesis: false`** — prokaryotes are never originated. A world that
  has lost them, surface and refuge, stays dead. (The spin-up states grew them
  on Anubis, Mars and Titan by the bug above; the ledger drops those.)
- **`heatKillsDry`** — with no liquid water left, `habitableShare` still
  reports how far past the ceilings the bands are. Without it an ocean that
  boiled away took its heat excess with it, and life on a 500 °C world faded
  over `SPREAD`, two megayears.
- **`heatDeathFastYears`** — the die-off time constant, 20 yr at 20 K past a
  ceiling, keeps shortening to this at 100 K past it (this edition: a day).
  `heatShock` kills a population outright where every band is 100 K past its
  ceiling, and the system layer calls it when a strike lands, so the verdict
  does not wait for the next step (a day of wall clock at real time).
- **`deepRefuge`** — prokaryotes keep a refuge 1.5 km down in the crust, 35 K
  warmer than the surface, its temperature following the surface through the
  half-rise time of conduction into rock (about 113 kyr for an e-folding). A
  boiled ocean that rains back out within millennia never reaches it, and the
  surface is recolonised from it (Sleep et al. 1989; Abramov & Mojzsis 2009);
  a steam envelope that stays does, about 17 kyr on; a magma ocean that melts
  down past it takes it (`meltRefuge`, called by the system layer).
- **`lifeGatesBio`** — the photosynthetic biosphere (the oxygen source) and
  the biological methane source are scaled by how much of the ground the
  prokaryotes could hold they still hold. A dead planet stops making oxygen.

Measured on Earth (tools/climatecheck.mjs, "Life follows the climate"): 10²⁴ J
is a winter the complex biosphere comes through; 5×10²⁶ J kills complex life
within a month and microbes survive below, back over the surface within
megayears; 10²⁸ J sterilises the surface at once and the crust about 17 kyr
later; 10²⁹ J melts through the refuge. Complex life lost on a habitable world
is back after 8×10⁸ yr; in altdev2 it was back the next day.

## Not a patch: how the energy of a strike gets in

`system.js` puts a strike's heat into the bands directly (`injectHeat`), through
the model's own heat capacity recomputed as it climbs, and pays for water past
its critical point at the model's own price (`hotCapacity`). Nothing in
`physics/` changes for it. Measured before building short steps for the
aftermath (plan item 3e): after 10²⁵ J on Earth, one-day, one-hour and
one-minute steps agree to 0.01 K over a hundred days, so the climate keeps its
one-day floor.
