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

## iceAlbedo — the world's own ice — radiation.js, climate.js, waterworld.js

Sea ice reflects `ALB_ICE`, 0.60, which is Earth's. The ice of the outer moons
runs from Callisto's dirty 0.2 through Ganymede's 0.4 to Enceladus's 0.99, and
under a quarter of Earth's light a world's temperature turns on which: Naunet's
documented −100 °C over an ice crust needs 0.37, and at 0.60 the model put it
at −117 °C with its air frozen out. `iceAlbedo` replaces 0.60 for the world
that sets it; unset, 0.60.

The small-waterworld model (Arnscheidt et al. 2019) writes its own frozen albedo,
0.2 + 0.4 × ice, and Enceladus runs on it: `iceAlbedo` sets that too, and unset
the line is altdev2's to the bit (0.6 − 0.2 is not 0.4 in floating point, so the
literal stays). Enceladus's Bond albedo is 0.81 (Howett et al. 2010); its data
row's 0.99 is the visual geometric albedo. At 0.60 its noon was 103 K, at 0.81 it
is 85 K, where Cassini saw about 80 K (Spencer et al. 2006).

## sealOxidation, reducedGas — oxygen on a sealed ocean floor — volatiles.js

On a waterworld whose rock lies under high-pressure ice, altdev2 already throttles
the volcanic gas coming up and the seafloor weathering of CO₂ going down by the
same `sealFactor`, "since it is the same interface seen from the other side".
The oxygen cycle had been left open: its seafloor oxidation ran at the full rate,
and the crust took up 85 % of the oxygen that water escape leaves behind, through
a floor that passes a fifteenth of everything else. `sealOxidation` puts both
behind the same seal.

Measured on Anubis at 81 °C, 0.7 bar N₂ and 0.3 bar O₂, the documented abiotic
oxygen world. Unsealed: escape brings 3.6×10⁻⁶ kg/m²/yr, the seafloor takes 2.9×10⁻⁴
(τ 12 Myr), the most oxygen it can keep with no volcanic reductants is 0.004 bar,
and its 0.3 bar was gone in 20 Myr. Sealed: 2.2×10⁻⁵ in, 2.0×10⁻⁵ out (τ 177 Myr),
and it can keep 0.34 bar. That is the result expected for sealed waterworlds
(Glaser et al. 2020).

`reducedGas` is the share of Earth's reduced volcanic gases (H₂, CO, H₂S) per unit
of eruption, which the mantle's oxygen fugacity sets: log(H₂/H₂O) falls half a
decade per decade of fO₂ (Gaillard & Scaillet 2014). A mantle that took up the
oxygen of oceans lost early is an oxidised one (Schaefer et al. 2016). Anubis's
is balanced by the tuner to hold its 0.3 bar: 0.12 of Earth's, about two log
units more oxidised. Unset, 1.

## h2SinksO2 — oxygen does not last in a hydrogen sky — volatiles.js

altdev2 keeps free oxygen and a hydrogen envelope side by side. A Hycean world
with a biosphere grew bars of O₂ inside 80 % H₂, a mixture no chemistry keeps:
photolysis fills an H₂ atmosphere with atomic hydrogen, and against it oxygen
lasts years (Seager, Bains & Hu 2013). `h2SinksO2` burns the oxygen at the end of
each step, 2 H₂ + O₂ → 2 H₂O, 4 : 32 by mass, and the water goes to the sea.

The step controller bounds on how fast the oxygen moves, and with the oxygen
pinned at zero it moves not at all. Read before the burn, the biosphere's whole
output still counted: 97 572 steps for 100 kyr on Uat-Ur, against 3 after it.

Uat-Ur's methane is made by its biosphere, since photolysis at its light breaks
4×10⁻⁴ kg/m²/yr and its sealed seafloor supplies next to none. The biosphere's
oxygen goes into its hydrogen: 0.026 bar of its 2.4 in 20 Myr, beside the 0.017
that escapes.

## overlay — a second liquid beside the water — climate.js, radiation.js

The model knows one liquid. Nephtys's sea is sulfuric acid, kept in the system
layer (`acid.js`), and it reaches the physics through `params.overlay`, per band:
`vapour` (bar), the water in the acid's vapour, which the longwave, the cloud
cover and the near-infrared darkening take as water vapour, as it is; `gas`
(bar), the rest of it, H₂SO₄ and SO₃, in the band's pressure, its cloud cover and
the dry air's Rayleigh as vapour would be but in neither of water's radiative
terms (radiation.js reads it as `overlayCloud`); `olr`, the share of the band's
outgoing longwave that gas lets out, a factor on it; `share` and `albedo`, a
share of the ground under something else and what it reflects; and `C`, heat
capacity added to the band's. `acid.js` sets it before every step from the
temperatures the last one left, with the acid's mixed layer and the latent heat
of the acid each kelvin puts in the air, and re-reads the vapour after the step,
as the model does for water. Held fixed through a step, including in the
Jacobian, so the step sees one consistent world. Unset, every term adds a zero
or multiplies by one; handed in with no gas and all its longwave let out, it is
the overlay without them, to the bit (patchcheck).

The acid is the 98.3 % azeotrope: 1830 kg/m³, 1.4 kJ/kg/K, boiling at 338 °C under
an atmosphere on the Clausius–Clapeyron slope measured over concentrated acid,
10156 K (Ayers, Gillett & Gras 1980), which makes its heat of vaporisation
0.86 MJ/kg; it freezes at +3 °C. (Evaporating the azeotrope pays for splitting
part of it too, 1.0–1.1 MJ/kg all told; the boiling point is quoted from 317 to
338 °C, and the total vapour tabulated at 500 K is 1.8–3 times this curve's.)

Its vapour is not the liquid's own mixture. It is H₂SO₄, SO₃ and water in the
shares their partial pressures have over the acid — water fitted to Gmitro &
Vermeulen's (1964) tables, H₂SO₄ Ayers et al. (1980), SO₃ the JANAF equilibrium
H₂SO₄(l) ⇌ SO₃ + H₂O — 39/20/41 % at 500 K, mostly water below 400 K. The water
is water. What the H₂SO₄ and SO₃ do to the outgoing heat was measured, because
nobody had: every Venus model leaves them out, Venus having parts per million
of the vapour. `tools/acid-lbl.py` is a clear-sky correlated-k column over
20–2500 cm⁻¹: HITRAN CO₂ (Perrin & Hartmann far wings), H₂O and SO₃ lines,
CO₂–CO₂ collision-induced absorption, and H₂SO₄'s bands from their ab initio
intensities (NIST CCCBDB; no line list exists) — about 750 km/mol inside the
770–1250 cm⁻¹ window, eleven times water's whole bending band. Checked on CO₂
doubled in a dry 1-bar column: 4.9 W/m². Over a 500 K sea the H₂SO₄ closes the
gap a hot CO₂ sky leaves near 1100–1300 cm⁻¹, CO₂'s own hot bands having closed
800–1100 already: 93.1 % of the heat gets out under 11 bar of CO₂, 83 % under 3,
78 % under 1, all of it under 90 bar, or over a sea too cold to give vapour.
Saturated at any humidity past a trace. Bounds of ×0.3 and ×3 on the intensities
move the 93.1 % to 94.7 and 91.5. `acid.js` reads the table: surface
temperature × ln CO₂ × humidity. Not in it: the acid cloud's own longwave (black
in the thermal infrared; the cloud here is the model's), the water continuum,
and the CO₂ hot lines HITRAN leaves out at 500 K, which would close more of the
window before the acid could.

Nephtys's sea: 95 % of the world (the book's "just a few transient volcanic
islands"), 3 km deep, 22.7 mbar of vapour at 231 °C, boiling at 447 °C under its
12.7 bar of air — 10.7 bar of it CO₂, where counting the acid as water took 11.2.
It more than doubles the world's heat capacity, so a strike warms it less than
the same world dry; 10²⁷ J puts a quarter of the sea in the air, and 2×10²⁸ J
all of it, which rains back as the world cools.

## volatileIces, n2IceBar, ch4IceBar — nitrogen and methane frost — volatiles.js, climate.js, snapshot.js

altdev2 freezes CO₂ out onto cold ground and nothing else, so Pluto and Triton
kept whatever air they were given, and a Pluto moved inward grew none. With
`volatileIces` a world has nitrogen and methane frost (CO rides with the
nitrogen, which it matches), `n2IceBar` and `ch4IceBar` of it, the pressure each
would make if it all rose. Where there is frost, the air holds the vapour
pressure over it at the cold trap, as far as the frost can supply, and snows out
onto it past that. The vapour pressure is one Clausius–Clapeyron slope each:
nitrogen through its triple point and Pluto's 11.5 µbar over ice at 37.0 K
(Gladstone et al. 2016), which is 6.9 kJ/mol; methane through its triple point
at 9.2 kJ/mol.

The frost's latent heat is carried as heat capacity in the bands at the cold
trap, as the model carries its water's, so a frosted world is held near its
frost point while the frost lasts. That is what keeps Pluto's ice at 37 K. A
first version relaxed the air towards the vapour pressure over 2000 years and
paid no latent heat. Moved to 1 AU, it kept a trace of nitrogen in the air that
the small-waterworld wind carried off as fast as it rose, and the step
controller held the world to fourteen-minute steps. With the heat paid, Pluto at
1 AU stays below 90 K for years while its frost rises. It holds 1.1 bar of
nitrogen and 0.05 of methane after 25 years, and loses it to escape within 600;
brought back first, it snows back to 12.5 µbar over its frost in 11 kyr. That
takes 570 steps.

Snapshots carry the frost where a world has any, and nothing otherwise, so
altdev2's saves are unchanged. Unset, the model is altdev2's to the bit
(patchcheck: Titan, and a control).

## Not a patch: how the energy of a strike gets in

`system.js` puts a strike's heat into the bands directly (`injectHeat`), through
the model's own heat capacity recomputed as it climbs, and pays for water past
its critical point at the model's own price (`hotCapacity`). Nothing in
`physics/` changes for it. Measured before building short steps for the
aftermath (plan item 3e): after 10²⁵ J on Earth, one-day, one-hour and
one-minute steps agree to 0.01 K over a hundred days, so the climate keeps its
one-day floor.
