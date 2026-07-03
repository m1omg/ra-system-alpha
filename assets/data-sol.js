/* ============================================================
   The Solar System — alternate dataset for the Ra engine.
   Same shape as data.js (STAR / PLANETS / MOONS / GLOSSARY);
   selected at load time when localStorage 'ra-system' === 'sol'.
   All figures are real: distances in AU (moons too), periods in
   years (moons use their true periods), radii in km, masses in kg.
   comp fractions are approximate bulk composition for the impact lab.
   No baked textures exist for these keys — the procedural
   generators paint every body from the palettes below.
   ============================================================ */

const SOL_SYSTEM = {

GLOSSARY: [
  ["AU", "Astronomical unit — the average Earth–Sun distance, ~149.6 million km."],
  ["Terrestrial planet", "A rocky world with a solid surface (Mercury–Mars)."],
  ["Gas giant", "A planet mostly of hydrogen and helium (Jupiter, Saturn)."],
  ["Ice giant", "A planet mostly of water, ammonia and methane 'ices' (Uranus, Neptune)."],
  ["Dwarf planet", "Orbits the Sun, round, but hasn't cleared its orbital neighbourhood (Pluto)."],
  ["Tidal locking", "A moon spinning exactly once per orbit, always showing the same face."],
  ["Kuiper belt", "The ring of icy bodies beyond Neptune; Pluto is its most famous member."],
  ["Cassini division", "The 4,800 km gap between Saturn's two brightest rings."],
  ["g", "Earth surface gravity. M⊕ = Earth masses."]
],

STAR: {
  key: "sun",
  name: "Sun",
  alt: "Sol",
  kind: "star",
  tagline: "G2V main-sequence star — the only star known to shine on life",
  color: 0xfff2cf,
  light: 0xfff4e0,
  radiusKm: 695700,
  massKg: 1.989e30, comp: { iron: 0, rock: 0, water: 0, gas: 1.0 },
  rotationPeriod: 25,
  stats: [
    ["Mass", "1 M☉ (333,000 M⊕)"],
    ["Spectral type", "G2V"],
    ["Temperature", "5,772 K surface · 15.7 million K core"],
    ["Luminosity", "3.83 × 10²⁶ W"],
    ["Age", "4.6 billion years"]
  ],
  images: [],
  desc:
    "The Sun holds 99.86% of the Solar System's mass and fuses six hundred million tonnes of "+
    "hydrogen every second. It is a middle-aged yellow dwarf, calmer than most stars its size — "+
    "a stability that has given Earth four billion uninterrupted years to grow a biosphere.\n\n"+
    "In another five billion years it will swell into a red giant, swallow Mercury and Venus, "+
    "and end as a slowly cooling white dwarf wrapped in the glowing shroud of its own atmosphere."
},

PLANETS: [
  {
    key: "mercury", name: "Mercury", kind: "rocky",
    parent: "sun",
    tagline: "A scorched iron cannonball — the smallest and swiftest planet",
    dist: 0.387, ecc: 0.2056, period: 0.2408, incl: 7.0,
    radiusKm: 2439.7, rotationPeriod: 58.6,
    massKg: 3.301e23, comp: { iron: 0.70, rock: 0.30, water: 0, gas: 0 },
    color: 0x9c8f82,
    rocky: { base:"#6e6259", a:"#a89a8a", b:"#3f3833", c:"#c9bcab" },
    stats: [
      ["Type", "Terrestrial planet"],
      ["Mass", "0.055 M⊕"],
      ["Diameter", "4,879 km"],
      ["Gravity", "0.38 g"],
      ["Orbital distance", "0.39 AU"],
      ["Day (solar)", "176 Earth days — longer than its year"],
      ["Temperature", "−173 °C night · +427 °C day"],
      ["Moons", "None"]
    ],
    images: [],
    desc:
      "Mercury is mostly core: an iron heart making up 70% of its mass, wrapped in a thin rocky "+
      "rind blasted by the nearby Sun. With almost no atmosphere to carry heat, its surface swings "+
      "600 °C between noon and midnight — the most extreme temperature range of any planet.\n\n"+
      "Its slow 59-day spin and fast 88-day orbit combine so that a single sunrise-to-sunrise day "+
      "lasts two Mercurian years. Ice survives, improbably, in permanently shadowed polar craters."
  },
  {
    key: "venus", name: "Venus", kind: "rocky",
    parent: "sun",
    tagline: "Earth's evil twin — a runaway greenhouse under acid clouds",
    dist: 0.723, ecc: 0.0068, period: 0.6152, incl: 3.39,
    radiusKm: 6051.8, rotationPeriod: 243,
    massKg: 4.867e24, comp: { iron: 0.30, rock: 0.70, water: 0, gas: 0 },
    color: 0xe6cf9a,
    rocky: { base:"#d8b56a", a:"#efd9a4", b:"#b8934f", c:"#f6ead0" },
    atmo: 0xf0dfae,
    stats: [
      ["Type", "Terrestrial planet"],
      ["Mass", "0.815 M⊕"],
      ["Diameter", "12,104 km"],
      ["Gravity", "0.90 g"],
      ["Orbital distance", "0.72 AU"],
      ["Day", "243 Earth days, spinning backwards"],
      ["Surface", "+464 °C · 92 atmospheres of CO₂"],
      ["Moons", "None"]
    ],
    images: [],
    desc:
      "Venus is Earth's size and Earth's density, and nothing else about it is Earthlike. A crushing "+
      "carbon-dioxide atmosphere traps enough heat to melt lead, day or night, pole to equator; the "+
      "clouds are droplets of sulfuric acid, and the air at the surface presses down like a kilometre "+
      "of ocean.\n\n"+
      "It spins backwards, slower than it orbits — a Venusian day outlasts its year. Billions of years "+
      "ago it may have had oceans, before a runaway greenhouse boiled them into the sky. It is the "+
      "standing warning of how a habitable world can die."
  },
  {
    key: "earth", name: "Earth", kind: "terran",
    parent: "sun",
    tagline: "The pale blue dot — the only world known to harbour life",
    dist: 1.0, ecc: 0.0167, period: 1.0, incl: 0.0,
    radiusKm: 6371, rotationPeriod: 1,
    massKg: 5.972e24, comp: { iron: 0.325, rock: 0.674, water: 0.001, gas: 0 },
    color: 0x5a8fce,
    terran: { ocean:"#12365c", ocean2:"#245b8f", land:"#55763a", land2:"#9a8a55", cloud:"#f4f7f9", landAmt:0.35, veg:true, ice:true },
    atmo: 0x9fc8ef,
    life: "intelligent",
    stats: [
      ["Type", "Terrestrial planet"],
      ["Mass", "1 M⊕ (5.97 × 10²⁴ kg)"],
      ["Diameter", "12,742 km"],
      ["Gravity", "1 g"],
      ["Orbital distance", "1 AU"],
      ["Day", "23 h 56 min"],
      ["Surface", "71% ocean · 15 °C average"],
      ["Moons", "The Moon"]
    ],
    images: [],
    desc:
      "Earth is the Solar System's only world with liquid water on its surface, the only one with "+
      "plate tectonics, and — as far as anyone knows — the only place in the universe where matter "+
      "has arranged itself to wonder about all this. Its oxygen atmosphere is pure biology: no known "+
      "process keeps a fifth of the air combustible except four billion years of photosynthesis.\n\n"+
      "An unusually large moon steadies its axial tilt, granting stable seasons across geological "+
      "time. Every human who has ever lived, lived here."
  },
  {
    key: "mars", name: "Mars", kind: "rocky",
    parent: "sun",
    tagline: "The rusted world — a cold desert that once ran with rivers",
    dist: 1.524, ecc: 0.0934, period: 1.8808, incl: 1.85,
    radiusKm: 3389.5, rotationPeriod: 1.03,
    massKg: 6.417e23, comp: { iron: 0.25, rock: 0.74, water: 0.01, gas: 0 },
    color: 0xc4703f,
    rocky: { base:"#9c4f2a", a:"#c97a48", b:"#5f2e18", c:"#e0a072" },
    atmo: 0xd9a882,
    stats: [
      ["Type", "Terrestrial planet"],
      ["Mass", "0.107 M⊕"],
      ["Diameter", "6,779 km"],
      ["Gravity", "0.38 g"],
      ["Orbital distance", "1.52 AU"],
      ["Day", "24 h 37 min"],
      ["Surface", "−63 °C average · 0.006 atmospheres"],
      ["Moons", "Phobos, Deimos"]
    ],
    images: [],
    desc:
      "Mars is a fossil of a livable world. Dry riverbeds, deltas and lake floors record a warm, wet "+
      "youth; today the water survives as polar ice and permafrost under an atmosphere too thin for "+
      "rain. Iron oxide dust — rust — paints the whole planet its famous colour.\n\n"+
      "It hosts the Solar System's tallest volcano (Olympus Mons, 22 km) and its grandest canyon "+
      "(Valles Marineris, as long as the United States is wide). No other planet has been studied so "+
      "closely, or is more likely to feel human bootprints next."
  },
  {
    key: "jupiter", name: "Jupiter", kind: "gasgiant",
    parent: "sun",
    tagline: "The king of planets — heavier than all the others combined",
    dist: 5.203, ecc: 0.0489, period: 11.862, incl: 1.30,
    radiusKm: 69911, rotationPeriod: 0.41,
    massKg: 1.898e27, comp: { iron: 0.02, rock: 0.03, water: 0.01, gas: 0.94 },
    color: 0xc9a97e,
    palette: ["#8a6a4a","#d8bb92","#f0e3cd","#b07a4e","#e8cfa8","#c45f3c"],
    atmo: 0xe0c9a4,
    stats: [
      ["Type", "Gas giant"],
      ["Mass", "318 M⊕"],
      ["Diameter", "139,822 km"],
      ["Gravity", "2.53 g (cloudtops)"],
      ["Orbital distance", "5.2 AU"],
      ["Day", "9 h 56 min — the shortest of any planet"],
      ["Great Red Spot", "A storm wider than Earth, raging ≥190 years"],
      ["Moons", "95 known — Io, Europa, Ganymede, Callisto…"]
    ],
    images: [],
    desc:
      "Jupiter outweighs every other planet combined, two and a half times over. It is a ball of "+
      "hydrogen and helium with no surface at all: the clouds thicken into liquid, the liquid into "+
      "metallic hydrogen, around a hot dense core. Its ten-hour spin whips the atmosphere into the "+
      "banded storms it is famous for — the Great Red Spot alone could swallow Earth.\n\n"+
      "Its gravity rules the system: it shepherds the asteroid belt, flings comets sunward or ejects "+
      "them entirely, and carries a retinue of 95 moons — four of them worlds in their own right, "+
      "discovered the first time anyone pointed a telescope at the sky."
  },
  {
    key: "saturn", name: "Saturn", kind: "gasgiant",
    parent: "sun",
    tagline: "The jewel of the Solar System — a gas giant lighter than water",
    dist: 9.537, ecc: 0.0565, period: 29.457, incl: 2.49,
    radiusKm: 58232, rotationPeriod: 0.45,
    massKg: 5.683e26, comp: { iron: 0.01, rock: 0.04, water: 0.02, gas: 0.93 },
    color: 0xe0cb96,
    palette: ["#b89968","#e8d5a8","#f4ead2","#cbb080","#dfc696","#a8875a"],
    atmo: 0xecd9a8,
    rings: { inner: 1.24, outer: 2.27, color: "#d8c9a6" },
    stats: [
      ["Type", "Gas giant"],
      ["Mass", "95.2 M⊕"],
      ["Diameter", "116,464 km (270,000 km with rings)"],
      ["Gravity", "1.06 g (cloudtops)"],
      ["Orbital distance", "9.5 AU"],
      ["Day", "10 h 33 min"],
      ["Density", "0.69 g/cm³ — it would float"],
      ["Moons", "146 known — Titan, Enceladus, Rhea…"]
    ],
    images: [],
    desc:
      "Saturn's rings are made of water ice — billions of chunks from dust grains to houses, "+
      "spanning 280,000 km yet in places only ten metres thick. They are likely young (perhaps "+
      "younger than the dinosaurs) and slowly raining onto the planet; enjoy them while they last.\n\n"+
      "The planet beneath is the least dense in the Solar System — lighter, on average, than water — "+
      "spinning so fast it visibly bulges at the equator. Among its 146 moons are Titan, with its "+
      "methane seas, and little Enceladus, whose south-polar geysers vent a hidden ocean into space."
  },
  {
    key: "uranus", name: "Uranus", kind: "gasgiant",
    parent: "sun",
    tagline: "The sideways planet — an ice giant rolling around its orbit",
    dist: 19.19, ecc: 0.0457, period: 84.02, incl: 0.77,
    radiusKm: 25362, rotationPeriod: 0.72,
    massKg: 8.681e25, comp: { iron: 0.03, rock: 0.15, water: 0.67, gas: 0.15 },
    color: 0x9fd6d9,
    palette: ["#7fc4c9","#b8e4e6","#d8f0f0","#92ced2","#a8dcdf","#6fb2ba"],
    atmo: 0xbfe8ea,
    stats: [
      ["Type", "Ice giant"],
      ["Mass", "14.5 M⊕"],
      ["Diameter", "50,724 km"],
      ["Gravity", "0.90 g (cloudtops)"],
      ["Orbital distance", "19.2 AU"],
      ["Axial tilt", "98° — it orbits lying on its side"],
      ["Temperature", "−224 °C — the coldest planetary atmosphere"],
      ["Moons", "28 known — Titania, Oberon, Miranda…"]
    ],
    images: [],
    desc:
      "Something enormous hit Uranus long ago and knocked it over: its axis lies within eight "+
      "degrees of its orbital plane, so each pole takes turns pointing at the Sun through a "+
      "42-year day and a 42-year night. It is the coldest planet, colder even than more distant "+
      "Neptune, its inner heat mysteriously missing.\n\n"+
      "Beneath the placid methane-tinted haze lies an ocean of hot, compressed water, ammonia and "+
      "methane — an 'ice' giant in the astronomer's sense. Its moons are named, uniquely, for "+
      "characters from Shakespeare and Pope."
  },
  {
    key: "neptune", name: "Neptune", kind: "gasgiant",
    parent: "sun",
    tagline: "The windiest world — a deep-blue giant found by mathematics",
    dist: 30.07, ecc: 0.0113, period: 164.8, incl: 1.77,
    radiusKm: 24622, rotationPeriod: 0.67,
    massKg: 1.024e26, comp: { iron: 0.03, rock: 0.15, water: 0.70, gas: 0.12 },
    color: 0x4f7fd9,
    palette: ["#2a5ab8","#4f86e0","#7fb0ec","#3968c4","#5f96e6","#1f3f8a"],
    atmo: 0x7fa8ec,
    stats: [
      ["Type", "Ice giant"],
      ["Mass", "17.1 M⊕"],
      ["Diameter", "49,244 km"],
      ["Gravity", "1.14 g (cloudtops)"],
      ["Orbital distance", "30.1 AU"],
      ["Winds", "Up to 2,100 km/h — the fastest known"],
      ["Year", "165 Earth years"],
      ["Moons", "16 known — Triton, Proteus, Nereid…"]
    ],
    images: [],
    desc:
      "Neptune was discovered with pen and paper: astronomers computed where an unseen mass must "+
      "lie to explain Uranus's wobbles, pointed a telescope, and found it within a degree. It has "+
      "completed barely one orbit since.\n\n"+
      "For a world receiving a thousandth of Earth's sunlight it is astonishingly violent — "+
      "supersonic winds, methane clouds torn into streaks, and dark storms the size of continents "+
      "that appear and vanish within years. Its great moon Triton orbits backwards: a captured "+
      "Kuiper-belt world, slowly spiralling toward destruction."
  },
  {
    key: "pluto", name: "Pluto", kind: "iceworld",
    parent: "sun",
    tagline: "The heart of the Kuiper belt — a dwarf planet with glaciers of nitrogen",
    dist: 39.48, ecc: 0.2488, period: 247.9, incl: 17.16,
    radiusKm: 1188.3, rotationPeriod: 6.39,
    massKg: 1.303e22, comp: { iron: 0.05, rock: 0.60, water: 0.35, gas: 0 },
    color: 0xd9c2a8,
    rocky: { base:"#b89878", a:"#e8d5bc", b:"#7a5f48", c:"#f4e9d8" },
    stats: [
      ["Type", "Dwarf planet (Kuiper belt)"],
      ["Mass", "0.0022 M⊕"],
      ["Diameter", "2,377 km — smaller than the Moon"],
      ["Gravity", "0.063 g"],
      ["Orbital distance", "29.7–49.3 AU (crosses Neptune's orbit)"],
      ["Day", "6.4 Earth days"],
      ["Temperature", "−229 °C"],
      ["Moons", "5 — Charon, Styx, Nix, Kerberos, Hydra"]
    ],
    images: [],
    desc:
      "Everyone expected a dead grey rock; New Horizons found mountains of water ice floating in a "+
      "thousand-kilometre glacier of frozen nitrogen — the bright heart, Sputnik Planitia, still "+
      "churning today. Pluto is geologically alive at −229 °C, with a thin blue-hazed atmosphere "+
      "that snows onto the surface as it drifts away from the Sun.\n\n"+
      "Its moon Charon is half Pluto's own size; the pair orbit a point in the space between them, "+
      "faces forever locked together — less a planet and moon than a double world at the edge of "+
      "the classical Solar System."
  }
],

MOONS: [
  {
    key: "moon", name: "The Moon", parent: "earth", kind: "rocky",
    tagline: "Earth's companion — the only other world humans have walked on",
    dist: 0.00257, ecc: 0.0549, period: 0.0748, radiusKm: 1737.4, rotationPeriod: 27.3,
    massKg: 7.346e22, comp: { iron: 0.10, rock: 0.90, water: 0, gas: 0 },
    color: 0xb8b4ac,
    rocky: { base:"#8a867e", a:"#b8b4aa", b:"#524e48", c:"#d8d4c9" },
    stats: [
      ["Mass", "0.0123 M⊕"],
      ["Diameter", "3,474 km"],
      ["Gravity", "0.166 g"],
      ["Distance", "384,400 km — and receding 3.8 cm/yr"],
      ["Orbit", "27.3 days, tidally locked"],
      ["Visitors", "12 humans, 1969–1972"]
    ],
    images: [],
    desc:
      "The Moon was born in violence: a Mars-sized world struck the young Earth, and the debris "+
      "coalesced in orbit. It is huge for a moon — a quarter of Earth's diameter — and its steadying "+
      "pull keeps Earth's tilt, and therefore Earth's climate, from chaotic wandering.\n\n"+
      "Its face records four billion years of bombardment that Earth's weather has erased from its "+
      "own. Twelve people have walked there; the next are preparing to."
  },
  {
    key: "phobos", name: "Phobos", parent: "mars", kind: "rocky",
    tagline: "A doomed potato — spiralling slowly into Mars",
    dist: 0.0000627, ecc: 0.0151, period: 0.000873, radiusKm: 11.3, rotationPeriod: 0.319,
    massKg: 1.066e16, comp: { iron: 0.05, rock: 0.95, water: 0, gas: 0 },
    color: 0x8a7a6c,
    rocky: { base:"#6e6055", a:"#948474", b:"#3f3630", c:"#b0a08e" },
    stats: [
      ["Diameter", "~22 km (irregular)"],
      ["Distance", "9,376 km — closer than any other moon"],
      ["Orbit", "7.7 hours — faster than Mars rotates"],
      ["Fate", "Crashes or shreds into a ring in ~50 Myr"]
    ],
    images: [],
    desc:
      "Phobos orbits so low and so fast that from the Martian surface it rises in the west, crosses "+
      "the sky in four hours, and sets in the east — twice a day. Tidal forces are dragging it two "+
      "metres closer each century; in some fifty million years it will shatter into a short-lived "+
      "ring around Mars."
  },
  {
    key: "deimos", name: "Deimos", parent: "mars", kind: "rocky",
    tagline: "The outer pebble — a quiet captured asteroid",
    dist: 0.000157, ecc: 0.0002, period: 0.00346, radiusKm: 6.2, rotationPeriod: 1.26,
    massKg: 1.48e15, comp: { iron: 0.05, rock: 0.95, water: 0, gas: 0 },
    color: 0x9a8c7c,
    rocky: { base:"#7a6e60", a:"#a2937f", b:"#4a4238", c:"#bcae9a" },
    stats: [
      ["Diameter", "~12 km (irregular)"],
      ["Distance", "23,463 km"],
      ["Orbit", "30.3 hours"],
      ["Surface", "Smooth, dust-blanketed regolith"]
    ],
    images: [],
    desc:
      "Deimos is a lumpy, dust-smoothed body a dozen kilometres across, probably an asteroid nudged "+
      "into Mars orbit long ago. From Mars it looks like a bright star that takes two and a half days "+
      "to drift from horizon to horizon."
  },
  {
    key: "io", name: "Io", parent: "jupiter", kind: "lava",
    tagline: "The volcano moon — the most geologically violent world known",
    dist: 0.00282, ecc: 0.0041, period: 0.00484, radiusKm: 1821.6, rotationPeriod: 1.77,
    massKg: 8.932e22, comp: { iron: 0.20, rock: 0.80, water: 0, gas: 0 },
    color: 0xd9c25f,
    rocky: { base:"#b89a3f", a:"#e8d070", b:"#8a4f1f", c:"#f6ecb0" },
    emissive: 0x301400, emissiveScale: 0.25,
    stats: [
      ["Mass", "0.015 M⊕"],
      ["Diameter", "3,643 km"],
      ["Distance", "421,700 km from Jupiter"],
      ["Orbit", "1.77 days"],
      ["Volcanoes", "~400 active — plumes reach 500 km high"]
    ],
    images: [],
    desc:
      "Caught in a tidal tug-of-war between Jupiter and the other Galilean moons, Io is kneaded "+
      "like dough and heated from within. The result is four hundred active volcanoes, lava lakes "+
      "hundreds of kilometres wide, and sulfur snows that paint the surface yellow, orange and red — "+
      "a world that turns itself inside out every million years, wearing no craters at all."
  },
  {
    key: "europa", name: "Europa", parent: "jupiter", kind: "icemoon",
    tagline: "The ocean under the ice — the best bet for life beyond Earth",
    dist: 0.00449, ecc: 0.009, period: 0.00972, radiusKm: 1560.8, rotationPeriod: 3.55,
    massKg: 4.80e22, comp: { iron: 0.15, rock: 0.77, water: 0.08, gas: 0 },
    color: 0xcfc4ae,
    rocky: { base:"#b0a894", a:"#e0d8c4", b:"#8a5f48", c:"#f4efe2" },
    stats: [
      ["Mass", "0.008 M⊕"],
      ["Diameter", "3,122 km"],
      ["Distance", "671,000 km from Jupiter"],
      ["Orbit", "3.55 days"],
      ["Ocean", "~100 km deep — twice Earth's water"]
    ],
    images: [],
    desc:
      "Europa's smooth ice shell is cracked into a global web of reddish fractures — the surface of "+
      "a hidden ocean holding twice as much liquid water as all of Earth's seas, kept warm by tidal "+
      "flexing for four billion years. Where water, energy and time coexist that long, biology "+
      "becomes a serious question; spacecraft are on their way to ask it."
  },
  {
    key: "ganymede", name: "Ganymede", parent: "jupiter", kind: "icemoon",
    tagline: "The largest moon in the Solar System — bigger than Mercury",
    dist: 0.00716, ecc: 0.0013, period: 0.0196, radiusKm: 2634.1, rotationPeriod: 7.15,
    massKg: 1.482e23, comp: { iron: 0.10, rock: 0.44, water: 0.46, gas: 0 },
    color: 0xa89e90,
    rocky: { base:"#847a6c", a:"#b4aa9a", b:"#4f4840", c:"#d0c6b6" },
    stats: [
      ["Mass", "0.025 M⊕"],
      ["Diameter", "5,268 km"],
      ["Distance", "1,070,000 km from Jupiter"],
      ["Orbit", "7.15 days"],
      ["Unique", "The only moon with its own magnetic field"]
    ],
    images: [],
    desc:
      "Ganymede would be a planet anywhere else: larger than Mercury, layered like one — iron core, "+
      "rock mantle, a deep saltwater ocean sandwiched in ice — and the only moon generating its own "+
      "magnetic field. Its face is split between ancient dark cratered terrain and younger pale "+
      "grooves, the stretch marks of an early epoch when the whole crust shifted."
  },
  {
    key: "callisto", name: "Callisto", parent: "jupiter", kind: "icemoon",
    tagline: "The battered witness — the most cratered world in the system",
    dist: 0.01259, ecc: 0.0074, period: 0.0457, radiusKm: 2410.3, rotationPeriod: 16.7,
    massKg: 1.076e23, comp: { iron: 0.05, rock: 0.45, water: 0.50, gas: 0 },
    color: 0x8a7f70,
    rocky: { base:"#6a6054", a:"#948a78", b:"#3a342c", c:"#b8ad9a" },
    stats: [
      ["Mass", "0.018 M⊕"],
      ["Diameter", "4,821 km"],
      ["Distance", "1,883,000 km from Jupiter"],
      ["Orbit", "16.7 days"],
      ["Surface", "~4 billion years old, saturated with craters"]
    ],
    images: [],
    desc:
      "Callisto has simply endured. Orbiting beyond the tidal wars that heat the inner moons, it has "+
      "no volcanoes, no shifting crust — just four billion years of impacts recorded on the oldest, "+
      "most cratered surface known. Far enough from Jupiter's radiation belts to be survivable, it is "+
      "a favoured candidate for a future human outpost."
  },
  {
    key: "titan", name: "Titan", parent: "saturn", kind: "rocky",
    tagline: "The other world with rain — seas of methane under orange smog",
    dist: 0.00817, ecc: 0.0288, period: 0.0437, radiusKm: 2574.7, rotationPeriod: 15.9,
    massKg: 1.345e23, comp: { iron: 0.05, rock: 0.45, water: 0.50, gas: 0 },
    color: 0xd9a84f,
    rocky: { base:"#b8862f", a:"#e0ad55", b:"#8a5f20", c:"#f0cf8a" },
    atmo: 0xe8b862,
    stats: [
      ["Mass", "0.0225 M⊕"],
      ["Diameter", "5,150 km"],
      ["Distance", "1,222,000 km from Saturn"],
      ["Orbit", "15.9 days"],
      ["Atmosphere", "1.45 atm of nitrogen — denser than Earth's"],
      ["Lakes", "Liquid methane and ethane"]
    ],
    images: [],
    desc:
      "Titan is the only moon with a thick atmosphere and the only world besides Earth with standing "+
      "liquid on its surface: rivers, lakes and seas of methane, filled by hydrocarbon rain beneath "+
      "an orange photochemical smog. The chemistry drifting down from that haze is the same organic "+
      "feedstock that preceded life on Earth.\n\n"+
      "In 2005 the Huygens probe parachuted through and landed on a floodplain of ice pebbles — the "+
      "most distant landing ever made. A nuclear helicopter, Dragonfly, is scheduled to fly its skies "+
      "in the 2030s."
  },
  {
    key: "enceladus", name: "Enceladus", parent: "saturn", kind: "icemoon",
    tagline: "The geyser moon — venting a hidden ocean into space",
    dist: 0.00159, ecc: 0.0047, period: 0.00375, radiusKm: 252.1, rotationPeriod: 1.37,
    massKg: 1.08e20, comp: { iron: 0.02, rock: 0.38, water: 0.60, gas: 0 },
    color: 0xe8f0f2,
    rocky: { base:"#c8d4d8", a:"#eef4f6", b:"#8fa4ac", c:"#ffffff" },
    tail: 0xcfe8ff,
    evapTail: { alpha: 0.28, rate: 0.4 },
    stats: [
      ["Mass", "0.000018 M⊕"],
      ["Diameter", "504 km"],
      ["Distance", "238,000 km from Saturn"],
      ["Orbit", "1.37 days"],
      ["Albedo", "0.99 — the most reflective body known"],
      ["Plumes", "Salt water, silica, hydrogen, organics"]
    ],
    images: [],
    desc:
      "Enceladus is barely five hundred kilometres wide, yet from cracks at its south pole it sprays "+
      "the contents of a subsurface saltwater ocean directly into space — a plume the Cassini "+
      "spacecraft flew through and tasted. It found salts, silica from hot seafloor vents, and free "+
      "hydrogen: chemical energy of exactly the kind that feeds microbial life on Earth's ocean "+
      "floors. The snow falling back paints Enceladus whiter than fresh paper, and the escaping ice "+
      "feeds Saturn's E ring — the tail you see it shedding here."
  },
  {
    key: "triton", name: "Triton", parent: "neptune", kind: "icemoon",
    tagline: "The captured wanderer — a Kuiper-belt world orbiting backwards",
    dist: 0.00237, ecc: 0.000016, period: 0.0161, radiusKm: 1353.4, rotationPeriod: 5.88,
    massKg: 2.14e22, comp: { iron: 0.10, rock: 0.55, water: 0.35, gas: 0 },
    color: 0xd8c8c4,
    rocky: { base:"#b8a8a4", a:"#e4d6d2", b:"#7a6a68", c:"#f6ece8" },
    stats: [
      ["Mass", "0.0036 M⊕"],
      ["Diameter", "2,707 km"],
      ["Distance", "354,800 km from Neptune"],
      ["Orbit", "5.9 days — retrograde, unique among large moons"],
      ["Surface", "−235 °C, nitrogen frost and geysers"]
    ],
    images: [],
    desc:
      "Triton orbits Neptune backwards — the only large moon that does — because it never formed "+
      "there: it is a captured dwarf planet from the Kuiper belt, a sibling of Pluto. The capture is "+
      "slowly killing it; tidal forces are dragging it inward toward eventual breakup into a ring.\n\n"+
      "Voyager 2 photographed geysers of nitrogen gas erupting through its pink polar frost at "+
      "−235 °C, making this frozen exile one of the few geologically active worlds known."
  },
  {
    key: "charon", name: "Charon", parent: "pluto", kind: "icemoon",
    tagline: "Pluto's other half — the ferryman of a double world",
    dist: 0.000131, ecc: 0.0002, period: 0.0175, radiusKm: 606, rotationPeriod: 6.39,
    massKg: 1.586e21, comp: { iron: 0.05, rock: 0.55, water: 0.40, gas: 0 },
    color: 0xb0aaa4,
    rocky: { base:"#8c8680", a:"#bab4ac", b:"#544f4a", c:"#d8d2c9" },
    stats: [
      ["Mass", "0.00027 M⊕ (⅛ of Pluto)"],
      ["Diameter", "1,212 km"],
      ["Distance", "19,600 km from Pluto"],
      ["Orbit", "6.4 days, mutually locked"],
      ["Feature", "Mordor Macula — a dark red polar cap"]
    ],
    images: [],
    desc:
      "Charon is half the diameter of Pluto itself — proportionally the largest moon in the Solar "+
      "System, so large the two orbit a point in open space between them, each hanging motionless "+
      "in the other's sky. Its north pole is stained rust-red by methane escaped from Pluto and "+
      "frozen onto Charon's winter darkness: one world literally painting another."
  }
]
};
