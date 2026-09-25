# Changes to the altdev2 physics

`assets/climate/physics/` is the planet-climate-sandbox's altdev2 model, copied
verbatim. Each change below sits behind a parameter whose default reproduces
altdev2 exactly, so it can be taken upstream as it is. Each is marked in the
code with `[ra-climate patch]`.

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

## Not a patch: how the energy of a strike gets in

`system.js` puts a strike's heat into the bands directly (`injectHeat`), through
the model's own heat capacity recomputed as it climbs, and pays for water past
its critical point at the model's own price (`hotCapacity`). Nothing in
`physics/` changes for it. Measured before building short steps for the
aftermath (plan item 3e): after 10²⁵ J on Earth, one-day, one-hour and
one-minute steps agree to 0.01 K over a hundred days, so the climate keeps its
one-day floor.
