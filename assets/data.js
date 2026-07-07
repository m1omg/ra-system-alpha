/* ============================================================
   The Ra Planetary System — body data
   Source: "Satis v10" worldbuilding document.
   Classification follows the ArcBuilder Planetary Classification List.

   Notes on units / scaling used by the engine:
     - dist  : real orbital semi-major axis in AU (around Ra), or in
               1000 km for moons (used for ordering/labels only).
     - aDisp : DISPLAY semi-major axis in scene units (computed in app.js
               from a compressed power-law so the system is viewable).
     - period: orbital period used for animation pacing (sim "years");
               heliocentric values are physically scaled (Kepler),
               moon values are tuned for pleasant viewing.
     - radiusKm : real mean radius in km (for the info panel).
     - rDisp : DISPLAY radius (computed in app.js, compressed).
   ============================================================ */

const GLOSSARY = [
  ["Insolation", "Sunlight reaching the planet, as a % of what Earth gets."],
  ["AreanXeric", "A hot, dry, Mars-like (Arean) world."],
  ["AreanLacustric", "A Mars-like world that cycles between active/warm-wet and frozen states."],
  ["BathyGaian", "A terrestrial world with liquid bodies, covered by a deep ocean."],
  ["BathyPelagic", "A deep global-ocean world."],
  ["Vitriolic", "Oceans made of sulfuric acid."],
  ["Photodissociation", "Splitting of a molecule by light/radiation (usually UV)."],
  ["Main sequence", "A 'normal' star fusing hydrogen into helium in its core."],
  ["Detached object", "A body whose far-flung orbit never comes near the planets — like Sedna in our system. Kauket is one."],
  ["Fragment swarm", "The glittering belt near Wadjet's orbit: ~680 collision fragments on bound orbits, from the author's Universe Sandbox save."],
  ["g", "Earth surface gravity. AU = average Earth–Sun distance."]
];

const STAR = {
  key: "ra",
  name: "Ra",
  alt: "10 Tauri",
  kind: "star",
  tagline: "F8V main-sequence star — the heart of the system",
  color: 0xfff1d6,
  light: 0xfff4e0,
  radiusKm: 835000,          // ~1.2 R☉ (visual radius is set separately)
  massKg: 2.266e30, comp: { iron: 0,     rock: 0,     water: 0,     gas: 1.0   },   // Universe Sandbox .ubox depots
  rotationPeriod: 18,
  stats: [
    ["Mass", "1.139 M☉"],
    ["Spectral type", "F8V"],
    ["Temperature", "~6050 K (5777 °C)"],
    ["Luminosity", "3.042 × Sun"],
    ["Age", "5.3 billion years"]
  ],
  images: [],
  desc:
    "Ra (catalogued as 10 Tauri) is a metal-rich F8-class star, somewhat more massive, "+
    "hotter and three times more luminous than the Sun. Its strong ultraviolet output and "+
    "broad habitable zone shape every world that orbits it — fuelling sulfuric-acid oceans "+
    "on Nephtys, thick ozone shields on Satis, and the metal rains of close-in Amunet. "+
    "At 5.3 billion years old it is an aging main-sequence star, and will one day swell into "+
    "a subgiant that reshapes the inner planets a final time."
};

/* Order = increasing distance from Ra */
const PLANETS = [
  {
    key: "amunet", name: "Amunet", kind: "gasgiant",
    parent: "ra",
    tagline: "Hot super-Neptune — a big brother of Neptune wearing Jupiter's clothes",
    dist: 0.0485, ecc: 0.0, period: 0.0100,
    radiusKm: 42879, rotationPeriod: 5,
    massKg: 5.903e26, comp: { iron: 0.090, rock: 0.428, water: 0.161, gas: 0.321 },   // Universe Sandbox .ubox depots
    color: 0xc89a63,
    palette: ["#7a4a2a","#caa06a","#e6c08a","#b87a3c","#e8e0d0","#d98a4a"],
    emissive: 0x3a1402, emissiveScale: 0.35,
    atmo: 0xe0a868,
    evapTail: true,       // it sheds vaporised envelope — drawn as a comet-like gas tail
    stats: [
      ["Type", "Hot super-Neptune (composition) / hot Saturn (mass)"],
      ["Mass", "98.8 M⊕ (0.311 Jupiter)"],
      ["Diameter", "85,758 km"],
      ["Gravity", "2.18 g (cloudtops)"],
      ["Orbital distance", "0.0485 AU"],
      ["Insolation", "1,291.9 × Earth"],
      ["Cloudtop temp.", "787 °C avg (1000–1700 °C dayside)"],
      ["Moons", "None"]
    ],
    images: [
      ["amunet_a.jpg", "Amunet — its searing atmosphere glows, with clouds of vaporised rock and metal streaming away"]
    ],
    desc:
      "From afar Amunet looks like a hot Neptune, and by composition it is one — yet it outweighs "+
      "Saturn. It holds most of the system's rock and water, but locked in hell. The cloudtops are "+
      "hot enough to rain metals: bronze and silver clouds buffeted by winds faster than a moon's "+
      "escape velocity, lit by lightning storms a million times Earth's electricity output, filling "+
      "the skies with cyanide.\n\n"+
      "Descend and the air glows orange, then yellow, then white-hot. Rock and metal clouds reappear; "+
      "fist-sized raindrops of magnesium oxide and silica fall as searing meteors. At four million "+
      "atmospheres lies a shallow sea of liquid metallic hydrogen — salty with dissolved water — resting "+
      "on a black mantle of superionic ice. At the centre, a semi-molten core of magnesium oxide and "+
      "silica reaches 14,000 °C: lava as hot as the surface of a blue-white star."
  },
  {
    key: "wadjet", name: "Wadjet", kind: "gasgiant",
    parent: "ra",
    tagline: "Hot sub-Neptune — a hybrid of Venus and Neptune, 100% hellish",
    dist: 0.25, ecc: 0.0, period: 0.1171,
    radiusKm: 15468, rotationPeriod: 8,
    massKg: 6.210e25, comp: { iron: 0.374, rock: 0.356, water: 0.248, gas: 0.022 },   // Universe Sandbox .ubox depots
    color: 0x4fb3a6,
    palette: ["#caa84a","#3fae9e","#cfe0e8","#5fc0b0","#d98a4a","#e8d59a"],
    emissive: 0x10201e, emissiveScale: 0.10,
    atmo: 0x7fd0c4,
    stats: [
      ["Type", "Hot mini / sub-Neptune"],
      ["Mass", "10.4 M⊕"],
      ["Diameter", "30,936 km"],
      ["Gravity", "1.76 g (cloudtops)"],
      ["Orbital distance", "0.25 AU"],
      ["Insolation", "48.67 × Earth"],
      ["Temperature", "359 °C tops · 2170 °C seafloor"],
      ["Pressure", "36.2 → 530 kiloatmospheres"],
      ["Moons", "Sekhmet + several asteroid-sized"]
    ],
    images: [
      ["wadjet_a.jpg", "Wadjet — a banded sub-Neptune in dirty, vivid colour"],
      ["wadjet_c.jpg", "Sekhmet (foreground) drifting in front of its parent Wadjet"],
      ["wadjet_b.jpg", "Wadjet's 'surface' — a supercritical ocean over glowing, near-molten quartz"]
    ],
    desc:
      "A type absent from our Solar System: a sub-Neptune, mostly rock and iron (more iron than any Solar "+
      "planet) yet with a quarter of its mass in an ocean hundreds of kilometres deep, wrapped in a hydrogen "+
      "atmosphere at 36,000 times Earth's pressure.\n\n"+
      "Its ocean isn't liquid but supercritical fluid. At 'sea level' it glows orange-red; far below, the "+
      "seafloor glows yellow-white at 2170 °C, kept barely solid only by pressure. An indestructible visitor "+
      "would find rolling hills of glowing quartz putty with the consistency of asphalt-to-honey, rivers and "+
      "'waterfalls' of molten rock, and ground that turns to white-hot lava in minutes. Strictly, you wouldn't "+
      "stand on its surface — you'd stand on its core."
  },
  {
    key: "set", name: "Set", kind: "rocky",
    parent: "ra",
    tagline: "AreanXeric — the driest world in the Ra system",
    dist: 0.66, ecc: 0.0, period: 0.5024,
    radiusKm: 3840, rotationPeriod: 1.4,
    massKg: 1.430e24, comp: { iron: 0.488, rock: 0.512, water: 0,     gas: 0     },   // Universe Sandbox .ubox depots
    color: 0xa83c1e,
    palette: ["#6e2410","#b8431e","#d6562a","#8a2e14","#c8552a","#e07a3c"],
    rocky: { base:"#8a2c12", a:"#c4501f", b:"#5e1e0c", c:"#e08038" },
    atmo: 0xc86a3a, atmoThin: true,
    stats: [
      ["Type", "AreanXeric (hot dry Mars-like)"],
      ["Mass", "0.37 M⊕"],
      ["Diameter", "7,680 km (0.6 × Earth)"],
      ["Gravity", "1.02 g"],
      ["Orbital distance", "0.66 AU"],
      ["Insolation", "721 × … 7.21 × Earth"],
      ["Temperature", "120 °C"],
      ["Pressure", "0.011 atm"],
      ["Moons", "None"]
    ],
    images: [
      ["set_a.jpg", "Set — a rust-red, iron-rich desert world"],
      ["set_b.jpg", "Eroded red spires under Set's hazy, broiling sky"],
      ["set_c.jpg", "Steam-carved canyons, preserved since Set's violent youth"]
    ],
    desc:
      "Set was born under a blanket of superheated steam, but Ra's blaze was too fierce for that water to "+
      "ever condense. It simply broiled — steam and volcanism carving fantastic, twisted landscapes before "+
      "its iron-rich interior cooled and geology fell silent within a few hundred million years.\n\n"+
      "A little more mass and it would have become a Venus; instead it is merely unbearably hot and bone-dry, "+
      "its deep red deepened by rust from an atmosphere long since photodissociated away. Its thin air (twice "+
      "Mars's) drives fast but feeble sandstorms, so its ancient steam-cut terrain survives nearly untouched. "+
      "When Ra swells to a red giant, Set's crust will melt one last time."
  },
  {
    key: "nephtys", name: "Nephtys", kind: "ocean",
    parent: "ra",
    tagline: "Vitriolic BathyGaian — an ocean of sulfuric acid, and alien life",
    dist: 1.448, ecc: 0.05, period: 1.633,
    radiusKm: 8270, rotationPeriod: 1.1,
    massKg: 1.254e25, comp: { iron: 0.172, rock: 0.827, water: 0.001, gas: 0     },   // Universe Sandbox .ubox depots
    color: 0x9c5236,
    terran: { ocean:"#7a3a22", ocean2:"#9c5236", land:"#caa07a", cloud:"#e8d8c0", landAmt:0.18 },
    palette: ["#5a2a18","#9c5236","#c8895f","#7a3a22"],
    atmo: 0xc08a5a,
    life: "alien",
    stats: [
      ["Type", "Vitriolic BathyGaian"],
      ["Mass", "2.1 M⊕"],
      ["Diameter", "16,540 km"],
      ["Gravity", "1.25 g"],
      ["Orbital distance", "1.448 AU"],
      ["Insolation", "145 × Earth"],
      ["Temperature", "231 °C"],
      ["Life", "Alien — sulfuric-acid solvent, silicone biomolecules"],
      ["Moons", "None (one crashed into it long ago)"]
    ],
    images: [
      ["nephtys_a.jpg", "Nephtys — drowned in reddish-brown sulfuric 'waters', dotted with transient volcanic isles"]
    ],
    desc:
      "Nephtys looks like a dirty puddle where autumn leaves have fallen — and it is far stranger than that. "+
      "The whole world is soaked in an ocean of sulfuric acid, broken only by short-lived volcanic islands "+
      "soon eaten away by its corrosive seas.\n\n"+
      "It is the system's second life-bearing world, but its biochemistry is utterly alien: sulfuric acid as "+
      "solvent, silicones (siloxanes) as the backbone of biomolecules. Born wetter and watery, Nephtys had its "+
      "oceans split by Ra's UV into hydrogen and oxygen while volcanoes pumped out sulfur dioxide — turning its "+
      "water into nearly pure acid that dissolved its metals and stained it reddish-brown."
  },
  {
    key: "satis", name: "Satis", kind: "terran",
    parent: "ra",
    tagline: "AreanLacustric — a Mars-sized world that birthed intelligent life",
    dist: 1.71, ecc: 0.02, period: 2.095,
    radiusKm: 3890, rotationPeriod: 1.0,
    massKg: 1.493e24, comp: { iron: 0.370, rock: 0.630, water: 0,     gas: 0     },   // Universe Sandbox .ubox depots
    color: 0x3a6ea5,
    terran: { ocean:"#16386b", ocean2:"#2b62a0", land:"#8a3fb0", land2:"#b86fd0", cloud:"#eef2f6", landAmt:0.40, veg:true },
    atmo: 0x88b6ff,
    life: "intelligent",
    vegKill: "purple",     // multicellular world: ≥1e27 J absorbed kills its violet forests
    stats: [
      ["Type", "AreanLacustric"],
      ["Mass", "0.25 M⊕ (2.37 × Mars)"],
      ["Diameter", "7,780 km"],
      ["Gravity", "0.68 g"],
      ["Orbital distance", "1.71 AU"],
      ["Insolation", "103.7 % of Earth"],
      ["Water coverage", "60 %"],
      ["Temperature", "24 °C"],
      ["Pressure", "0.62 atm (66% O₂, 29% N₂)"],
      ["Life", "Complex — gave rise to intelligence"],
      ["Moons", "1 (half the mass of Luna)"]
    ],
    images: [
      ["satis_a.jpg", "Satis — blue seas and violet forests, with its single moon"],
      ["satis_c.jpg", "Towering violet forests during the Flourishing epoch"],
      ["satis_d.jpg", "Lavender shrublands beside a shallow lake under Ra's bright sky"]
    ],
    desc:
      "Satis is the enigma of the system: a world closer in size to Mars than Earth, without plate tectonics, "+
      "that nonetheless gave rise to intelligent life. Named for the Egyptian goddess of the Nile's life-giving "+
      "floods, it lives and dies by cycles.\n\n"+
      "Every few hundred million years its interior heat reaches a critical point and the planet wakes: "+
      "Snowball → Thaw → Flourishing → Volcanic → Twilight → Snowball. Right now, 165 million years into the "+
      "current cycle, Satis is at the peak of its Flourishing epoch — a hot, humid, Carboniferous-like paradise "+
      "of violet forests, shallow seas and oxygen-rich air (41% O₂ at Earthlike pressure). A strong ozone layer "+
      "from Ra's UV makes its surface less irradiated than Earth's. But each cycle is longer and fiercer than "+
      "the last; the creeping Volcanic epoch will one day end the paradise for good."
  },
  {
    key: "uatur", name: "Uat-Ur", kind: "ocean",
    parent: "ra",
    tagline: "BathyPelagic — a flawless blue marble that is a desert for life",
    dist: 3.50, ecc: 0.179, period: 6.135,
    radiusKm: 13728, rotationPeriod: 6,
    massKg: 5.433e25, comp: { iron: 0.116, rock: 0.603, water: 0.281, gas: 0     },   // Universe Sandbox .ubox depots
    color: 0x2a6bb0,
    terran: { ocean:"#0e3a72", ocean2:"#2f73bd", land:"#dfeaf2", cloud:"#dfeefa", landAmt:-0.15, ice:true },
    atmo: 0x7ab0ee,
    life: "seeded",
    stats: [
      ["Type", "BathyPelagic (deep ocean world)"],
      ["Mass", "9.1 M⊕"],
      ["Diameter", "27,456 km"],
      ["Gravity", "1.96 g"],
      ["Orbital distance", "3.50 AU"],
      ["Eccentricity", "0.179"],
      ["Insolation", "24.83 % Earth"],
      ["Temperature", "8 °C"],
      ["Pressure", "5.51 atm"],
      ["Life", "Sparse prokaryotes (seeded from Nu) + Satis colonies"],
      ["Moons", "Nu, Naunet"]
    ],
    images: [
      ["uatur_a.jpg", "Uat-Ur — a true blue marble, warmed from within"]
    ],
    desc:
      "From space, Uat-Ur is the most beautiful world of Ra — a true blue marble. It is genuinely temperate, "+
      "warmed despite its distance by a hydrogen- and methane-rich atmosphere, CO₂ clouds, and the internal "+
      "heat of a world nearly Neptune's mass.\n\n"+
      "Yet it is nearly lifeless. Uat-Ur is 28% water: beneath its ~100 km ocean lies a thick mantle of "+
      "high-pressure ice that seals the rocky interior away, leaving the ocean almost pure — a sterile, "+
      "nutrient-poor giant droplet. Only simple life drifts near the sunlit top, much of it seeded from its "+
      "moon Nu. The Satis biosphere-mind has colonised it — bioluminescent cloud-forests now light its nights "+
      "— but to that mind it is only a temporary foothold."
  },
  {
    key: "shu", name: "Shu", kind: "iceworld",
    parent: "ra",
    tagline: "A cold, low-density world on the system's frozen frontier",
    dist: 15.7, ecc: 0.113, period: 58.29,
    radiusKm: 10680, rotationPeriod: 9,
    massKg: 6.519e24, comp: { iron: 0.146, rock: 0.439, water: 0.375, gas: 0.041 },   // Universe Sandbox .ubox depots
    color: 0xaebfcf,
    palette: ["#7f93a8","#b6c6d6","#dde8f0","#9aaabd"],
    atmo: 0x9fb6cc,
    stats: [
      ["Mass", "1.71 M⊕"],
      ["Density", "2 g/cm³ (icy)"],
      ["Orbital distance", "15.7 AU"],
      ["Eccentricity", "0.113"],
      ["Insolation", "1.234 % Earth"],
      ["Temperature", "−130 °C"]
    ],
    images: [],
    desc:
      "Shu is a distant, low-density world of the cold outer system — only about 1% of Earth's sunlight reaches "+
      "it, and at −130 °C it sits on the frontier between Ra's planets and the realm of its brown-dwarf companion, "+
      "Horus. (The worldbuilding notes for Shu are still in progress.)"
  },
  /* ---- The trans-Horus worlds. All three exist in the author's Universe
     Sandbox save ("Ra planetary system 10 Taur 2.ubox"); orbits, masses,
     radii and compositions below are extracted from its state vectors. ---- */
  {
    key: "salibe", name: "Salibe", kind: "gasgiant",
    parent: "ra",
    tagline: "A ghost-pale fourth gas giant, far beyond Horus",
    dist: 146.8, ecc: 0.219, period: 1670, incl: 0.2,
    radiusKm: 46472, rotationPeriod: 0.55,
    massKg: 1.215e26, comp: { iron: 0.011, rock: 0.034, water: 0.152, gas: 0.803 },   // Universe Sandbox .ubox depots
    color: 0x9db4c4,
    palette: ["#6b8698","#9db4c4","#d3e2ea","#7d97a9","#b7ccd8"],
    atmo: 0xa8c8da,
    stats: [
      ["Mass", "20.3 M⊕"],
      ["Density", "0.29 g/cm³ (very puffy)"],
      ["Diameter", "92,943 km"],
      ["Composition", "80.3% H/He · 15.2% water · 3.4% rock · 1.1% iron"],
      ["Orbital distance", "146.8 AU"],
      ["Eccentricity", "0.219"],
      ["Orbital period", "~1,670 years"],
      ["Insolation", "0.014 % Earth"],
      ["Temperature", "−224 °C"]
    ],
    images: [],
    desc:
      "Three times farther from Ra than Horus, Salibe is the system's overlooked fourth gas giant — twenty Earth "+
      "masses of hydrogen so cold and so gently squeezed that it is one of the puffiest worlds known, barely a "+
      "third of water's density. At −224 °C its cloud decks have frozen into a nearly featureless, ghost-pale "+
      "haze that reflects the pinprick glare of the distant star. (The worldbuilding notes for Salibe are still "+
      "in progress.)"
  },
  {
    key: "yamm", name: "Yamm", kind: "rocky",
    parent: "ra",
    tagline: "A frozen super-Earth adrift on a tilted, eccentric orbit",
    dist: 558.5, ecc: 0.522, period: 12400, incl: 9.2,
    radiusKm: 12625, rotationPeriod: 1.3,
    massKg: 3.165e25, comp: { iron: 0.207, rock: 0.637, water: 0.151, gas: 0.005 },   // Universe Sandbox .ubox depots
    color: 0x767a86,
    rocky: { base:"#4c4f58", a:"#7e828e", b:"#2a2c33", c:"#d5dde6" },
    stats: [
      ["Mass", "5.30 M⊕"],
      ["Density", "3.76 g/cm³"],
      ["Diameter", "25,249 km"],
      ["Composition", "63.7% rock · 20.7% iron · 15.1% water (ice)"],
      ["Orbital distance", "558.5 AU (267 → 850 AU)"],
      ["Eccentricity", "0.522"],
      ["Inclination", "9.2°"],
      ["Orbital period", "~12,400 years"],
      ["Temperature", "−242 °C"]
    ],
    images: [],
    desc:
      "Named for the old god of the raging sea, Yamm is a five-Earth-mass world of rock and iron glazed with "+
      "frozen oceans — a sea god locked in ice. It drifts through the darkness on a lonely, eccentric orbit "+
      "tilted 9° out of the system's plane, swinging from 267 to 850 AU once every twelve millennia; Ra is "+
      "little more than the brightest star in its sky. (The worldbuilding notes for Yamm are still in progress.)"
  },
  {
    key: "kauket", name: "Kauket", kind: "iceworld",
    parent: "ra",
    tagline: "A sednoid ice world on a million-year orbit — the system's dark frontier",
    dist: 10934, ecc: 0.893, period: 1071000, incl: 0.2,
    radiusKm: 13359, rotationPeriod: 1.1,
    massKg: 1.171e25, comp: { iron: 0.046, rock: 0.300, water: 0.625, gas: 0.029 },   // Universe Sandbox .ubox depots
    color: 0x4a5666,
    palette: ["#323a48","#4a5666","#6c7d90","#3c4654"],
    stats: [
      ["Mass", "1.96 M⊕"],
      ["Density", "1.17 g/cm³ (icy)"],
      ["Diameter", "26,718 km"],
      ["Composition", "62.5% water (ice) · 30% rock · 4.6% iron"],
      ["Orbital distance", "10,934 AU (1,173 → 20,700 AU)"],
      ["Eccentricity", "0.893"],
      ["Orbital period", "~1.07 million years"],
      ["Temperature", "−263 °C (10 K)"]
    ],
    images: [],
    desc:
      "Kauket — named for the primordial goddess of darkness — is the outermost world of the Ra system, a "+
      "detached, Sedna-like wanderer whose orbit never comes within a thousand AU of the planets. Two Earth "+
      "masses of frozen ocean over rock, it rides a million-year ellipse out to a fifth of a light-year, at "+
      "ten kelvins above absolute zero: even its thin envelope of gases lies frozen on the ice. From its "+
      "surface, Ra is only an exceptionally bright star in an eternal night. (The worldbuilding notes for "+
      "Kauket are still in progress.)"
  }
];

/* ---- The Wadjet fragment swarm: the author's .ubox save holds 1,652
   collision fragments; the 684 still on bound orbits form a tight debris
   belt crossing the Wadjet–Sekhmet orbit. The engine seeds its belt
   points from this fitted element distribution (a in AU, i in degrees). ---- */
const BELT = {
  key: "belt",
  core: { frac: 0.78, a: [0.264, 0.014], e: [0.226, 0.010], inc: [3.6, 0.7] },
  tail: { aMin: 0.14, aMax: 0.53, eMax: 0.60, incMax: 19.6 },
  color: 0xb9a892
};

/* Moons keyed by parent planet */
const MOONS = [
  {
    key: "sekhmet", name: "Sekhmet", parent: "wadjet", kind: "lava",
    tagline: "A molten Io–Venus hybrid trailing a comet-like tail",
    dist: 0.0016, ecc: 0.02, period: 0.030,
    radiusKm: 1287, rotationPeriod: 0.6,
    massKg: 5.590e22, comp: { iron: 0.650, rock: 0.350, water: 0,     gas: 0     },   // Universe Sandbox .ubox depots
    color: 0xd98a32,
    rocky: { base:"#7a3a10", a:"#e6a83a", b:"#2a1206", c:"#ffd060" },
    emissive: 0x401400, emissiveScale: 0.5,
    tail: 0xffb060,
    evapTail: { alpha: 0.4, rate: 0.55 },   // "subtle comet-like tail" — much milder than Amunet's
    stats: [
      ["Mass", "0.761 × Luna"],
      ["Density", "6.23 g/cm³"],
      ["Diameter", "0.202 × Earth (~2,574 km)"],
      ["Gravity", "0.229 g"],
      ["Parent", "Wadjet"]
    ],
    images: [
      ["sekhmet_a.jpg", "Sekhmet — a hot, hazy rocky moon, with Ra blazing beyond"],
      ["wadjet_c.jpg", "Sekhmet (foreground) silhouetted against its parent Wadjet"],
      ["sekhmet_b.jpg", "Standing on Sekhmet: Wadjet looms over molten volcanic plains"]
    ],
    desc:
      "Once, for a geological instant during Wadjet's migration, Sekhmet was an ocean world rich in organics — "+
      "then it boiled dry, was battered by impacts, and partly melted into seas of lava and molten salt. After "+
      "a quiet age, a recent asteroid strike re-eccentrified its orbit and reignited Wadjet's tidal heating.\n\n"+
      "Today it is a hellish blend of Io and Venus, leaning hard toward Io: volcanoes, molten plains and "+
      "underground sulfur lakes, 450 °C even in its calmest spots — all under a near-vacuum sky, since its thin "+
      "outgassed 'atmosphere' is stripped away as fast as it forms. That escaping matter trails behind it as a "+
      "subtle comet-like tail that often sweeps across Wadjet, seasoning its clouds."
  },
  {
    key: "satismoon", name: "Khnum", parent: "satis", kind: "rocky",
    tagline: "A small companion that keeps Satis alive",
    dist: 0.00045977, ecc: 0.03, period: 0.011239,   // 68,780 km from Satis (AU); real Kepler period ≈ 4.1 d
    radiusKm: 1390, rotationPeriod: 2.5,
    color: 0x9a958c,
    rocky: { base:"#6f6a62", a:"#a8a299", b:"#4a463f", c:"#c4bfb6" },
    stats: [
      ["Mass", "~0.5 × Luna"],
      ["Orbital distance", "68,780 km (around Satis)"],
      ["Parent", "Satis"]
    ],
    images: [],
    desc:
      "Formed like our own Moon, in a giant impact early in Satis's history, this single moon is half the mass "+
      "of Luna. Small as it is, it matters enormously: its tides help keep Satis's interior from freezing solid, "+
      "sustain the planet's magnetic field, and regularise the great Snowball-to-Flourishing cycles that make "+
      "complex life on a Mars-sized world possible at all."
  },
  {
    key: "nu", name: "Nu", parent: "uatur", kind: "icemoon",
    tagline: "An ice-ocean moon with open water under a vacuum sky — and life",
    dist: 0.0009133, ecc: 0.086, period: 0.026,   // 136,610 km from Uat-Ur, expressed in AU
    radiusKm: 1836, rotationPeriod: 1.2,
    massKg: 1.031e23, comp: { iron: 0.227, rock: 0.727, water: 0.046, gas: 0     },   // Universe Sandbox .ubox depots
    color: 0xcfd6c4,
    rocky: { base:"#8a8f7a", a:"#e8e2c8", b:"#3a5a6a", c:"#d8c24a" },
    atmo: 0x9fc0c8, atmoThin: true,
    life: "native",
    stats: [
      ["Mass", "1.4 × Luna"],
      ["Density", "3.98 g/cm³"],
      ["Diameter", "3,672 km"],
      ["Gravity", "0.208 g"],
      ["Composition", "72.9% rock · 22.7% iron · 4.6% water"],
      ["Avg. temp.", "−93 °C (oases 0–90 °C)"],
      ["Life", "Native — microbial, oxygen-producing photosynthesis"],
      ["Parent", "Uat-Ur"]
    ],
    images: [],
    desc:
      "A chimera of Io, Europa and Earth. Barely larger than Luna, Nu is among the most tidally heated bodies in "+
      "the system — but its high water content spared it Io's fate. Instead of a volcanic hell it is a hydrothermal "+
      "paradise: a global ocean a few degrees above freezing, crusted by ice often only metres thick, with rare "+
      "oases of open blue water steaming under a near-vacuum, near-black sky.\n\n"+
      "Despite under 5% water by mass, that is still 3.4× all of Earth's water. Life not only exists here but "+
      "thrives — it even evolved oxygen-producing photosynthesis. Genetics show life on both Nu and Uat-Ur "+
      "began here, and Nu's hardy natives have so far repelled every attempt by the Satis biomind to infest them."
  },
  {
    key: "naunet", name: "Naunet", parent: "uatur", kind: "icemoon",
    tagline: "Where do Mars-like worlds end and icy moons begin?",
    dist: 0.0015085, ecc: 0.019, period: 0.050,   // 225,660 km from Uat-Ur, expressed in AU
    radiusKm: 2475, rotationPeriod: 2.0,
    massKg: 2.534e23, comp: { iron: 0.109, rock: 0.888, water: 0.003, gas: 0     },   // Universe Sandbox .ubox depots
    color: 0xc4b6a4,
    rocky: { base:"#7a6a58", a:"#cbbfae", b:"#5a4a3a", c:"#e8ddca" },
    atmoThin: true, atmo: 0xb0a890,
    stats: [
      ["Mass", "3.45 × Luna"],
      ["Density", "3.98 g/cm³"],
      ["Gravity", "0.281 g"],
      ["Composition", "88.7% rock · 10.9% iron · 0.3% water"],
      ["Avg. temp.", "−100 °C"],
      ["Parent", "Uat-Ur"]
    ],
    images: [],
    desc:
      "More massive than Ganymede, yet at −100 °C it feels closer to the coldest parts of Mars. Naunet is mostly "+
      "rock, wrapped in a 2–14 km crust of water, ammonia and CO₂ ice, with a thin (3–4 mbar) atmosphere. "+
      "Depressed melting points let pockets of carbonated ammonia-water brine persist underground; sometimes they "+
      "erupt in cryovolcanism, freezing into translucent fresh ice.\n\n"+
      "Where Nu has life, Naunet is sterile — its alkaline brines and disconnected seas never let any biochemistry "+
      "take hold. A frost-kissed version of Mars: not alive, but beautiful."
  }
];

/* Horus — brown-dwarf companion to Ra — with its own planet-sized moons */
const HORUS = {
  key: "horus", name: "Horus", kind: "browndwarf",
  parent: "ra",
  tagline: "A brown-dwarf companion to Ra — a failed star with worlds of its own",
  dist: 45.8, ecc: 0.141, period: 290.4,
  radiusKm: 62920, rotationPeriod: 7,
  massKg: 8.841e28, comp: { iron: 0.003, rock: 0.012, water: 0.016, gas: 0.968 },   // Universe Sandbox .ubox depots
  color: 0x7a2418,
  palette: ["#3a0e06","#7a2010","#a83418","#581608","#c24a22"],
  emissive: 0x6a1a08, emissiveScale: 0.7,
  light: 0xff5522,
  stats: [
    ["Type", "Brown dwarf (sub-stellar companion)"],
    ["Mass", "46.6 Jupiters"],
    ["Density", "84.7 g/cm³"],
    ["Diameter", "125,840 km"],
    ["Gravity", "152 g"],
    ["Orbital distance", "45.8 AU"],
    ["Temperature", "559 °C"],
    ["Moons", "Anubis, Khonsu, Nut, Osiris"]
  ],
  images: [],
  desc:
    "Horus is not a planet but a brown dwarf — an object 46 times Jupiter's mass that never quite became a star. "+
    "It still glows a dull 559 °C from its own slow gravitational contraction, lighting its retinue like a faint, "+
    "sullen sun. Around it orbit four worlds of their own, including the deceptive 'blue marble' Anubis."
};

const HORUS_MOONS = [
  {
    key:"anubis", name:"Anubis", parent:"horus", kind:"ocean",
    tagline:"The deceptive god of death — a 'blue marble' that is utterly dead",
    dist:0.00852, ecc:0.0158, period:0.018, radiusKm:4700, rotationPeriod:1.4,
    massKg: 2.798e24, comp: { iron: 0.099, rock: 0.442, water: 0.459, gas: 0     },   // Universe Sandbox .ubox depots
    color:0x4a7fa8,
    terran:{ ocean:"#2a5a7a", ocean2:"#4f86ad", land:"#c8c0b0", cloud:"#dfeaf0", landAmt:-0.15, ice:true },
    atmo:0x9fc8e0,
    stats:[
      ["Mass","0.468 M⊕"],
      ["Composition","45.9% water · 44.2% rock · 9.9% iron"],
      ["Orbital distance","0.00852 AU (around Horus)"],
      ["Avg. temp.","81.2 °C"],
      ["Parent","Horus"]
    ],
    images:[],
    desc:
      "Through a telescope Anubis looks like the holy grail: tidally warmed to liquid-water temperatures, with an "+
      "oxygen signature and a hazy blue disc. Up close it betrays its name. It truly has liquid-water oceans and "+
      "free oxygen — but that oxygen marks the absence of life, not its presence. It is among the most hostile "+
      "terrestrial bodies of the whole system: a beautiful, abiotic blue marble."
  },
  {
    key:"khonsu", name:"Khonsu", parent:"horus", kind:"rocky",
    tagline:"A cold, rocky moon of the brown dwarf",
    dist:0.0125, ecc:0.0066, period:0.030, radiusKm:4900, rotationPeriod:2,
    massKg: 3.307e24, comp: { iron: 0.136, rock: 0.728, water: 0.136, gas: 0     },   // Universe Sandbox .ubox depots
    color:0x9a8d7a,
    rocky:{ base:"#6f6354", a:"#a89880", b:"#463d32", c:"#c8bba6" },
    stats:[
      ["Mass","0.554 M⊕"],
      ["Composition","72.8% rock · 13.6% water · 13.6% iron"],
      ["Orbital distance","0.0125 AU (around Horus)"],
      ["Avg. temp.","−99.5 °C"],
      ["Parent","Horus"]
    ],
    images:[],
    desc:"A cold, predominantly rocky world orbiting Horus at −99.5 °C."
  },
  {
    key:"nut", name:"Nut", parent:"horus", kind:"icemoon",
    tagline:"A frigid, ice-shelled, Europa-like world of Horus",
    dist:0.0156, ecc:0.0104, period:0.042, radiusKm:7500, rotationPeriod:3,
    massKg: 1.036e25, comp: { iron: 0.255, rock: 0.745, water: 0,     gas: 0     },   // Universe Sandbox .ubox depots
    color:0xbcd0d8,
    rocky:{ base:"#cdd9e2", a:"#eaf1f6", b:"#7d96a8", c:"#c7a487" },  // pale ice + tan lineae
    atmoThin:true, atmo:0xaccad6,
    stats:[
      ["Mass","1.74 M⊕"],
      ["Composition","54.1% water · 29.7% rock · 16.3% iron"],
      ["Orbital distance","0.0156 AU (around Horus)"],
      ["Avg. temp.","−190 °C"],
      ["Parent","Horus"]
    ],
    images:[],
    desc:"A deeply frozen, water-rich world at −190 °C — one of the coldest places in the Ra system."
  },
  {
    key:"osiris", name:"Osiris", parent:"horus", kind:"gasgiant",
    tagline:"A mini-Neptune orbiting a brown dwarf",
    dist:0.781, ecc:0.014, period:0.16, radiusKm:24000, rotationPeriod:6,
    massKg: 9.227e25, comp: { iron: 0.015, rock: 0.040, water: 0.222, gas: 0.723 },   // Universe Sandbox .ubox depots
    color:0x6fb0c8,
    palette:["#3a7a96","#6fb0c8","#bfe2ee","#4f93ad","#a8d8e6"],
    atmo:0x9fd6e8,
    stats:[
      ["Mass","15.5 M⊕"],
      ["Composition","72.3% H/He · 22.2% water · 4% rock · 1.5% iron"],
      ["Orbital distance","0.781 AU (around Horus)"],
      ["Parent","Horus"]
    ],
    images:[],
    desc:"The outermost and largest moon of Horus — a true mini-Neptune of hydrogen and helium over water, "+
         "circling its brown-dwarf primary far from the warmth of Ra."
  }
];
