/* ============================================================
   Slovenčina — natural Slovak translation of the whole sim.
   English stays the default; the 🌐 button in the bottom bar
   switches languages (persisted in localStorage 'ra-lang').
   - ui:      strings written from app.js (T(key))
   - html:    innerHTML for static elements, by element id
   - titles:  tooltip (title=) attributes, by element id
   - data:    per-body tagline / desc / stats / image captions
   - verbatim: natural translations of the author's own texts
   ============================================================ */
const LANG_SK = {

ui: {
  'play':'▶ Spustiť','pause':'⏸ Pauza',
  'rt':'reálny čas','u-yr':'r/s','u-mo':'mes/s','u-day':'dní/s','u-hr':'h/s','u-min':'min/s','u-s':'s/s',
  'e-yr':'r','e-day':'dní','e-hr':'h','e-min':'min','e-s':'s',
  'real-scale':'📏 Reálna mierka','compressed':'📐 Stlačená',
  'authors-text':'📖 Autorov text','summary-source':'📖 Zhrnutie + zdroj',
  'type-star':'Hviezda','type-bd':'Hnedý trpaslík','type-moon':'Mesiac','type-planet':'Planéta',
  'nav-ra':'Sústava Ra','nav-horus':'Podsústava Horus',
  'nav-sol':'Slnečná sústava',
  'title-sol-h1':'<b>Slnečná</b> sústava',
  'doc-title-sol':'Slnečná sústava — interaktívna 3D simulácia',
  'sys-to-sol':'⇄ 🌍 Slnečná sústava','sys-to-ra':'⇄ ✨ Sústava Ra','sys-change':'⇄ Zmeniť sústavu',
  'choose-title':'Vyber si planetárnu sústavu',
  'choose-ra':'✨ Sústava Ra','choose-ra-sub':'Fiktívny svet — „Satis v10“',
  'choose-sol':'🌍 Slnečná sústava','choose-sol-sub':'Náš domov — skutočné planéty a mesiace',
  'life-title':'hostí život','life-intelligent':'inteligentný','life-alien':'cudzí','life-seeded':'zanesený','life-native':'pôvodný',
  'from-source':'Zo zdroja — autorov text (preklad)',
  'no-desc':'(Zdrojový dokument tento svet zatiaľ neopisuje — zobrazené je zhrnutie.)',
  'debris-type':'Pole trosiek','debris-name-span':'zničený svet','debris-tag':'Pole trosiek.',
  'st-status':'Stav','st-destroyed':'☠ Zničený','st-cause':'Príčina','st-cause-v':'Bombardovanie (impaktné laboratórium)',
  'st-eabs':'Pohltená energia','st-ebind':'Väzbová energia',
  'debris-epitaph':'{name} už neexistuje. Nahromadené bombardovanie prekročilo gravitačnú väzbovú energiu a svet sa rozpadol. Tam, kde bol {name}, sa teraz rozlietavajú rozžeravené úlomky a chladnúci vyvrhnutý materiál — a Keplerov strih ich rozmazáva pozdĺž pôvodnej dráhy do trblietavého prstenca trosiek. Zrýchlite čas a sledujte, ako sa oblúk uzavrie do celého prstenca.',
  'heal-hint':'(🧽 Uzdraviť v impaktnom laboratóriu planétu obnoví.)',
  'nav-destroyed':'zničený',
  'st-orbit-now':'Dráha (aktuálna)',
  'st-mass-now':'Hmotnosť (aktuálna)',
  'tier-massloss':' · hmotnosť −{p} %',
  'st-ring':'Prstenec trosiek','st-ring-v':'☄ rozmazáva sa pozdĺž pôvodnej dráhy',
  'tier-puff-1':' · obal: prehriaty, žiari',
  'tier-puff-2':' · obal: nafúknutý ako horúci Jupiter — plyn uniká',
  'tier-puff-3':' · obal: prúdi preč — hrozí rozpad',
  'imp-immune':' · voči tvojim zbraniam imúnny','imp-destroyed':' · ☠ zničený — pole trosiek',
  'imp-strike':'úder','imp-beam':'lúč/s','imp-binding-over':'≥100 % väzbovej energie ☠','imp-binding-of':' % väzbovej energie',
  'imp-melts-sea':' · roztaví more široké ~{km} km',
  'tier-crater':' · povrch: posiaty krátermi','tier-seas':' · povrch: roztrúsené moria taveniny',
  'tier-thaw':' · topí sa — moria kvapalnej vody ({p} %)',
  'tier-thaw-polar':' · topí sa — polárne moria ({p} %)',
  'tier-steam':' · oceány vrú — parná atmosféra ({p} %)',
  'tier-regional':' · povrch: regionálne tavenie ({p} % roztavených)','tier-ocean':' · povrch: globálny magmatický oceán ({p} % roztavených)',
  'tier-molten':' · povrch: úplne roztavený, prehriaty','tier-white':' · povrch: rozžeravený dobiela — hrozí rozpad',
  'imp-w-ast':'☄ Asteroid','imp-w-las':'🔆 Laser',
  'imp-hint-ast':'Klikni na svet a udri · jazvy zostávajú · dosť celkovej energie roztrhá kôru',
  'imp-hint-las':'Stlač a drž pre paľbu · ťahaním vedieš lúč po svetoch · pustením končíš',
  'mat-0':'🧊 Ľad','mat-1':'🪨 Hornina','mat-2':'⛓ Železo',
  'fly-notarget':'◎ žiadny cieľ — ťukni na svet',
  'doc-title':'Sústava Ra — interaktívna 3D simulácia'
},

html: {
  'loader-sub':'Budujem planetárnu sústavu…',
  'title-sub':'Interaktívna 3D simulácia',
  'title-h1':'Planetárna sústava <b>Ra</b>',
  'help-nav-h':'Navigácia',
  'help-nav':'<b>Ťahanie</b> — otáčanie kamery (ľavé aj pravé tlačidlo)<br><b>Koliesko</b> — priblíženie / oddialenie<br><b>Ťahanie stredným tlačidlom</b> — posun<br><b>Klik na svet</b> — priblíži ho a otvorí popis<br><b>Na dotykovej obrazovke</b> — ťuknutie svet priblíži; ⓘ (vpravo hore) otvorí informačný panel<br><b>Zoznam / menovky</b> — skok na ľubovoľné teleso',
  'help-scale-h':'O mierke',
  'help-scale':'<b>Reálna mierka</b> (predvolená) kladie každú dráhu do skutočnej vzdialenosti v AU — Amunet sa tak túli k hviezde a Horus je ďaleko na 46 AU; Shu a Horus nájdete oddialením. <b>Stlačená</b> (prepínač v dolnej lište) stláča obrovský rozsah 0,05–46 AU tak, aby sa celá sústava zmestila na obrazovku naraz. Veľkosti telies sú v oboch režimoch zveličené (skutočné by boli neviditeľné). Reálne čísla sú v dátovom paneli každého sveta; obežné <b>rýchlosti</b> sa riadia Keplerovými zákonmi.',
  'gloss-h':'Slovník',
  'credits-h':'Poďakovanie',
  'credits':'Textúry Slnečnej sústavy: mapy planét a Mesiaca od <b>Solar System Scope</b> (solarsystemscope.com, CC BY 4.0); Galileovské mesiace a Titan zo snímok <b>NASA / JPL / USGS</b> (voľné dielo). Pluto, Cháron a Triton používajú svoju skutočne nasnímanú pologuľu (NASA New Horizons / Voyager 2) s procedurálnou výplňou nad nikdy nenasnímaným pólom. Svety sústavy Ra používajú mapy generované AI. Postavené na Three.js.',
  'lbl-speed':'Rýchlosť','lbl-size':'Veľkosť',
  't-orbits':'◉ Dráhy','t-labels':'🏷 Menovky','t-tails':'☄ Chvosty','reset':'⟲ Obnoviť pohľad',
  't-fly':'🚀 Let','t-impact':'💥 Impakt',
  'fly-title':'🚀 Voľný let','lbl-throttle':'Rýchlosť','fly-exit':'✕ Koniec',
  'fly-goto':'⤳ Leť&nbsp;k','fly-follow':'⛓ Sleduj','fly-orient':'◎ Zorientuj','fly-brake':'⏹ Brzda',
  'fly-hint':'W/S alebo ↑↓ let · A/D alebo ←→ úkrok · PgUp/PgDn alebo R = hore·dole · ťahanie = rozhliadanie · Q/E náklon · koliesko = rýchlosť · F = sledovanie · klik na svet (znova = leť k) · Esc koniec',
  'imp-title':'💥 Impaktné laboratórium','imp-heal':'🧽 Uzdraviť',
  'lbl-imp-dia':'Priemer','lbl-imp-spd':'Rýchlosť','lbl-imp-mat':'Materiál','lbl-imp-pow':'Výkon'
},

titles: {
  't-scale':'Prepína skutočné vzdialenosti a stlačené dráhy',
  't-text':'Prepína autorov text a krátke zhrnutie',
  't-tails':'Zapne/vypne vyparovacie chvosty (Amunet, Sekhmet)',
  't-fly':'Voľný let (reálna mierka)',
  't-impact':'Impaktné laboratórium — nastaviteľné dopady asteroidov a laser',
  't-sfx':'Zvukové efekty — nerealistické (vesmír je tichý), ale pre efekt',
  't-system':'Prepni medzi fiktívnou sústavou Ra a našou skutočnou Slnečnou sústavou',
  't-lang':'Slovenčina / English',
  'imp-heal':'Odstráni všetky jazvy a vynuluje poškodenie',
  'imp-exit':'Zavrieť (Esc)',
  'helpbtn':'Pomoc a slovník',
  'infobtn':'Zobraziť / skryť informácie o vybranom svete',
  'navbtn':'Zoznam telies',
  'size-reset':'Obnoviť predvolenú veľkosť',
  'fly-exit':'Ukončiť let (Esc)',
  'fly-auto':'Rýchlosť sa automaticky prispôsobuje okolitým telesám — kliknutím prepneš na ručnú (neobmedzenú)',
  'fly-follow':'Sleduj cieľ na jeho obežnej dráhe (F)',
  'fly-fwd':'Ťah vpred (podrž)','fly-back':'Spätný ťah (podrž)'
},

data: {

  /* ---------- Slnečná sústava ---------- */
  sun: {
    name:'Slnko',
    tagline:'Hviezda hlavnej postupnosti G2V — jediná hviezda, o ktorej vieme, že svieti na život',
    stats:[['Hmotnosť','1 M☉ (333 000 M⊕)'],['Spektrálny typ','G2V'],['Teplota','5 772 K povrch · 15,7 mil. K jadro'],
           ['Svietivosť','3,83 × 10²⁶ W'],['Vek','4,6 miliardy rokov']],
    desc:'Slnko drží 99,86 % hmotnosti Slnečnej sústavy a každú sekundu spáli šesťsto miliónov ton vodíka. Je to žltý trpaslík v strednom veku, pokojnejší než väčšina hviezd jeho veľkosti — a práve táto stabilita dala Zemi štyri miliardy neprerušených rokov na to, aby si vypestovala biosféru.\n\nO ďalších päť miliárd rokov sa nafúkne na červeného obra, pohltí Merkúr a Venušu a skončí ako pomaly chladnúci biely trpaslík zahalený v žiariacom rubáši vlastnej atmosféry.'
  },
  mercury: {
    name:'Merkúr',
    tagline:'Spálená železná delová guľa — najmenšia a najrýchlejšia planéta',
    stats:[['Typ','Terestrická planéta'],['Hmotnosť','0,055 M⊕'],['Priemer','4 879 km'],['Gravitácia','0,38 g'],
           ['Obežná vzdialenosť','0,39 AU'],['Deň (slnečný)','176 pozemských dní — dlhší než jeho rok'],
           ['Teplota','−173 °C v noci · +427 °C cez deň'],['Mesiace','Žiadne']],
    desc:'Merkúr je väčšinou jadro: železné srdce tvorí 70 % jeho hmotnosti a obaľuje ho len tenká kamenná kôra bičovaná blízkym Slnkom. Takmer bez atmosféry, ktorá by prenášala teplo, sa jeho povrch medzi poludním a polnocou hojdá o 600 °C — najextrémnejší teplotný rozsah zo všetkých planét.\n\nPomalá 59-dňová rotácia a rýchly 88-dňový obeh sa skladajú tak, že jediný deň od východu po východ Slnka trvá dva merkúrovské roky. V trvalo zatienených polárnych kráteroch — neuveriteľne — prežíva ľad.'
  },
  venus: {
    name:'Venuša',
    tagline:'Zlé dvojča Zeme — skleníkový kolaps pod kyselinovými oblakmi',
    stats:[['Typ','Terestrická planéta'],['Hmotnosť','0,815 M⊕'],['Priemer','12 104 km'],['Gravitácia','0,90 g'],
           ['Obežná vzdialenosť','0,72 AU'],['Deň','243 pozemských dní, točí sa opačne'],
           ['Povrch','+464 °C · 92 atmosfér CO₂'],['Mesiace','Žiadne']],
    desc:'Venuša má veľkosť Zeme aj hustotu Zeme — a nič iné na nej zemské nie je. Drvivá atmosféra oxidu uhličitého zadržiava toľko tepla, že roztaví olovo, vo dne v noci, od pólu k pólu; oblaky sú kvapôčky kyseliny sírovej a vzduch pri povrchu tlačí ako kilometer oceánu.\n\nTočí sa opačne a pomalšie, než obieha — venušanský deň prežije jej rok. Pred miliardami rokov mohla mať oceány, kým ich skleníkový kolaps nevyvaril do neba. Je to trvalá výstraha, ako môže obývateľný svet zomrieť.'
  },
  earth: {
    name:'Zem',
    tagline:'Bledomodrá bodka — jediný svet, o ktorom vieme, že nesie život',
    stats:[['Typ','Terestrická planéta'],['Hmotnosť','1 M⊕ (5,97 × 10²⁴ kg)'],['Priemer','12 742 km'],['Gravitácia','1 g'],
           ['Obežná vzdialenosť','1 AU'],['Deň','23 h 56 min'],['Povrch','71 % oceán · priemer 15 °C'],['Mesiace','Mesiac']],
    desc:'Zem je jediný svet Slnečnej sústavy s kvapalnou vodou na povrchu, jediný s platňovou tektonikou a — pokiaľ vieme — jediné miesto vo vesmíre, kde sa hmota usporiadala tak, aby sa nad tým všetkým dokázala čudovať. Jej kyslíková atmosféra je čistá biológia: nepoznáme proces, ktorý by udržal pätinu vzduchu horľavú, okrem štyroch miliárd rokov fotosyntézy.\n\nNezvyčajne veľký mesiac jej stabilizuje sklon osi a daruje stále ročné obdobia naprieč geologickým časom. Každý človek, ktorý kedy žil, žil tu.'
  },
  mars: {
    name:'Mars',
    tagline:'Zhrdzavený svet — studená púšť, ktorou kedysi tiekli rieky',
    stats:[['Typ','Terestrická planéta'],['Hmotnosť','0,107 M⊕'],['Priemer','6 779 km'],['Gravitácia','0,38 g'],
           ['Obežná vzdialenosť','1,52 AU'],['Deň','24 h 37 min'],['Povrch','priemer −63 °C · 0,006 atmosféry'],
           ['Mesiace','Fobos, Deimos']],
    desc:'Mars je fosília obývateľného sveta. Vyschnuté riečiská, delty a dná jazier zaznamenávajú teplú, vlhkú mladosť; dnes voda prežíva ako polárny ľad a permafrost pod atmosférou pritenkou na dážď. Prach oxidu železa — hrdza — farbí celú planétu do jej slávneho odtieňa.\n\nHostí najvyššiu sopku Slnečnej sústavy (Olympus Mons, 22 km) aj jej najveľkolepejší kaňon (Valles Marineris, dlhý ako Spojené štáty široké). Žiadna iná planéta nebola preskúmaná dôkladnejšie — a na žiadnej skôr nepristanú ľudské čižmy.'
  },
  jupiter: {
    name:'Jupiter',
    tagline:'Kráľ planét — ťažší než všetky ostatné dokopy',
    stats:[['Typ','Plynný obor'],['Hmotnosť','318 M⊕'],['Priemer','139 822 km'],['Gravitácia','2,53 g (vrchol oblakov)'],
           ['Obežná vzdialenosť','5,2 AU'],['Deň','9 h 56 min — najkratší zo všetkých planét'],
           ['Veľká červená škvrna','Búrka širšia než Zem, zúri ≥190 rokov'],['Mesiace','95 známych — Io, Európa, Ganymedes, Kallisto…']],
    desc:'Jupiter preváži všetky ostatné planéty dokopy, dva a pol krát. Je to guľa vodíka a hélia bez akéhokoľvek povrchu: oblaky hustnú na kvapalinu, kvapalina na kovový vodík, okolo horúceho hustého jadra. Desaťhodinová rotácia šľahá atmosféru do pásových búrok, ktorými je slávny — samotná Veľká červená škvrna by prehltla Zem.\n\nJeho gravitácia vládne sústave: pasie pás asteroidov, vrhá kométy k Slnku alebo ich vyhadzuje von, a nesie sprievod 95 mesiacov — štyri z nich sú svety samy osebe, objavené v okamihu, keď ktokoľvek prvý raz namieril ďalekohľad na oblohu.'
  },
  saturn: {
    name:'Saturn',
    tagline:'Klenot Slnečnej sústavy — plynný obor ľahší než voda',
    stats:[['Typ','Plynný obor'],['Hmotnosť','95,2 M⊕'],['Priemer','116 464 km (270 000 km s prstencami)'],
           ['Gravitácia','1,06 g (vrchol oblakov)'],['Obežná vzdialenosť','9,5 AU'],['Deň','10 h 33 min'],
           ['Hustota','0,69 g/cm³ — plával by'],['Mesiace','146 známych — Titan, Enceladus, Rhea…']],
    desc:'Saturnove prstence sú z vodného ľadu — miliardy úlomkov od zrniek prachu po domy, rozpäté cez 280 000 km, no miestami len desať metrov hrubé. Sú pravdepodobne mladé (možno mladšie než dinosaury) a pomaly pršia na planétu; užite si ich, kým trvajú.\n\nPlanéta pod nimi je najredšia v Slnečnej sústave — v priemere ľahšia než voda — a točí sa tak rýchlo, že sa viditeľne vydúva na rovníku. Medzi jej 146 mesiacmi je Titan so svojimi metánovými morami aj malý Enceladus, ktorého gejzíry na južnom póle chrlia skrytý oceán do vesmíru.'
  },
  uranus: {
    name:'Urán',
    tagline:'Prevrátená planéta — ľadový obor, ktorý sa kotúľa po svojej dráhe',
    stats:[['Typ','Ľadový obor'],['Hmotnosť','14,5 M⊕'],['Priemer','50 724 km'],['Gravitácia','0,90 g (vrchol oblakov)'],
           ['Obežná vzdialenosť','19,2 AU'],['Sklon osi','98° — obieha ľažmo na boku'],
           ['Teplota','−224 °C — najchladnejšia planetárna atmosféra'],['Mesiace','28 známych — Titania, Oberon, Miranda…']],
    desc:'Do Uránu kedysi dávno narazilo niečo obrovské a prevrátilo ho: jeho os leží do ôsmich stupňov od roviny dráhy, takže póly sa striedajú v mierení na Slnko počas 42-ročného dňa a 42-ročnej noci. Je to najchladnejšia planéta, chladnejšia než vzdialenejší Neptún — jeho vnútorné teplo záhadne chýba.\n\nPod pokojným metánovým oparom leží oceán horúcej stlačenej vody, amoniaku a metánu — „ľadový" obor v astronomickom zmysle slova. Jeho mesiace nesú, jedinečne, mená postáv zo Shakespeara a Popa.'
  },
  neptune: {
    name:'Neptún',
    tagline:'Najveternejší svet — tmavomodrý obor nájdený matematikou',
    stats:[['Typ','Ľadový obor'],['Hmotnosť','17,1 M⊕'],['Priemer','49 244 km'],['Gravitácia','1,14 g (vrchol oblakov)'],
           ['Obežná vzdialenosť','30,1 AU'],['Vetry','Až 2 100 km/h — najrýchlejšie známe'],['Rok','165 pozemských rokov'],
           ['Mesiace','16 známych — Triton, Proteus, Nereida…']],
    desc:'Neptún objavili perom a papierom: astronómovia vypočítali, kde musí ležať neviditeľná hmota vysvetľujúca chvenie Uránu, namierili ďalekohľad — a našli ho s presnosťou na stupeň. Odvtedy stihol sotva jeden obeh.\n\nNa svet prijímajúci tisícinu zemského slnečného svitu je ohromujúco násilný — nadzvukové vetry, metánové oblaky trhané na šmuhy a temné búrky veľkosti kontinentov, ktoré sa objavia a zmiznú v priebehu rokov. Jeho veľký mesiac Triton obieha odzadu: zajatý svet z Kuiperovho pásu, pomaly špirálujúci v ústrety skaze.'
  },
  pluto: {
    name:'Pluto',
    tagline:'Srdce Kuiperovho pásu — trpasličia planéta s ľadovcami z dusíka',
    stats:[['Typ','Trpasličia planéta (Kuiperov pás)'],['Hmotnosť','0,0022 M⊕'],['Priemer','2 377 km — menší než Mesiac'],
           ['Gravitácia','0,063 g'],['Obežná vzdialenosť','29,7–49,3 AU (križuje dráhu Neptúna)'],['Deň','6,4 pozemského dňa'],
           ['Teplota','−229 °C'],['Mesiace','5 — Cháron, Styx, Nix, Kerberos, Hydra']],
    desc:'Všetci čakali mŕtvu sivú skalu; New Horizons našiel hory z vodného ľadu plávajúce v tisíckilometrovom ľadovci zamrznutého dusíka — jasné srdce, Sputnik Planitia, sa prevaľuje dodnes. Pluto je geologicky živé pri −229 °C, s tenkou modro zahmlenou atmosférou, ktorá sneží späť na povrch, keď sa vzďaľuje od Slnka.\n\nJeho mesiac Cháron má polovicu jeho veľkosti; dvojica obieha bod v prázdnom priestore medzi nimi, tváre navždy zamknuté k sebe — menej planéta s mesiacom než dvojsvet na okraji klasickej Slnečnej sústavy.'
  },
  moon: {
    name:'Mesiac',
    tagline:'Spoločník Zeme — jediný ďalší svet, po ktorom kráčali ľudia',
    stats:[['Hmotnosť','0,0123 M⊕'],['Priemer','3 474 km'],['Gravitácia','0,166 g'],
           ['Vzdialenosť','384 400 km — a vzďaľuje sa 3,8 cm/rok'],['Obeh','27,3 dňa, slapovo viazaný'],
           ['Návštevníci','12 ľudí, 1969–1972']],
    desc:'Mesiac sa zrodil v násilí: do mladej Zeme narazil svet veľkosti Marsu a trosky sa zliali na obežnej dráhe. Na mesiac je obrovský — štvrtina priemeru Zeme — a jeho stabilizujúci ťah bráni sklonu Zeme, a teda aj jej klíme, v chaotickom blúdení.\n\nJeho tvár zaznamenáva štyri miliardy rokov bombardovania, ktoré zemské počasie z tej našej dávno zmazalo. Kráčalo po ňom dvanásť ľudí; ďalší sa chystajú.'
  },
  phobos: {
    name:'Fobos',
    tagline:'Odsúdený zemiak — pomaly špiráluje do Marsu',
    stats:[['Priemer','~22 km (nepravidelný)'],['Vzdialenosť','9 376 km — bližšie než ktorýkoľvek iný mesiac'],
           ['Obeh','7,7 hodiny — rýchlejšie, než sa Mars točí'],['Osud','O ~50 mil. rokov spadne alebo sa roztrhá na prstenec']],
    desc:'Fobos obieha tak nízko a tak rýchlo, že z marťanského povrchu vychádza na západe, za štyri hodiny prekročí oblohu a zapadá na východe — dvakrát denne. Slapové sily ho každé storočie pritiahnu o dva metre bližšie; o nejakých päťdesiat miliónov rokov sa roztriešti na krátkotrvajúci prstenec okolo Marsu.'
  },
  deimos: {
    name:'Deimos',
    tagline:'Vonkajší kamienok — tichý zajatý asteroid',
    stats:[['Priemer','~12 km (nepravidelný)'],['Vzdialenosť','23 463 km'],['Obeh','30,3 hodiny'],
           ['Povrch','Hladký, prachom prikrytý regolit']],
    desc:'Deimos je hrboľaté, prachom uhladené teleso s tuctom kilometrov v priemere — pravdepodobne asteroid, ktorý kedysi dávno skĺzol na obežnú dráhu Marsu. Z Marsu vyzerá ako jasná hviezda, ktorej trvá dva a pol dňa doplaviť sa od obzoru k obzoru.'
  },
  io: {
    name:'Io',
    tagline:'Sopečný mesiac — geologicky najnásilnejší známy svet',
    stats:[['Hmotnosť','0,015 M⊕'],['Priemer','3 643 km'],['Vzdialenosť','421 700 km od Jupitera'],
           ['Obeh','1,77 dňa'],['Sopky','~400 aktívnych — chocholy siahajú 500 km vysoko']],
    desc:'Io, zovreté v slapovom preťahovaní medzi Jupiterom a ostatnými galileovskými mesiacmi, je miesené ako cesto a zohrievané zvnútra. Výsledkom je štyristo aktívnych sopiek, lávové jazerá široké stovky kilometrov a sírové snehy farbiace povrch do žlta, oranžova a červena — svet, ktorý sa každý milión rokov obráti naruby a nenosí jediný kráter.'
  },
  europa: {
    name:'Európa',
    tagline:'Oceán pod ľadom — najlepšia stávka na život mimo Zeme',
    stats:[['Hmotnosť','0,008 M⊕'],['Priemer','3 122 km'],['Vzdialenosť','671 000 km od Jupitera'],
           ['Obeh','3,55 dňa'],['Oceán','~100 km hlboký — dvojnásobok zemskej vody']],
    desc:'Hladký ľadový pancier Európy je rozpukaný do celosvetovej siete červenkastých trhlín — povrch skrytého oceánu, ktorý drží dvakrát toľko kvapalnej vody ako všetky moria Zeme a ktorý štyri miliardy rokov zohrieva slapové hnetenie. Tam, kde voda, energia a čas koexistujú tak dlho, sa biológia stáva vážnou otázkou; sondy sú na ceste ju položiť.'
  },
  ganymede: {
    name:'Ganymedes',
    tagline:'Najväčší mesiac Slnečnej sústavy — väčší než Merkúr',
    stats:[['Hmotnosť','0,025 M⊕'],['Priemer','5 268 km'],['Vzdialenosť','1 070 000 km od Jupitera'],
           ['Obeh','7,15 dňa'],['Unikát','Jediný mesiac s vlastným magnetickým poľom']],
    desc:'Kdekoľvek inde by bol Ganymedes planétou: väčší než Merkúr, vrstvený ako planéta — železné jadro, kamenný plášť, hlboký slaný oceán vložený do ľadu — a ako jediný mesiac si generuje vlastné magnetické pole. Jeho tvár sa delí na prastarý tmavý kráterovaný terén a mladšie bledé ryhy, strie z ranej epochy, keď sa pohla celá kôra.'
  },
  callisto: {
    name:'Kallisto',
    tagline:'Doráňaný svedok — najkráterovanejší svet sústavy',
    stats:[['Hmotnosť','0,018 M⊕'],['Priemer','4 821 km'],['Vzdialenosť','1 883 000 km od Jupitera'],
           ['Obeh','16,7 dňa'],['Povrch','~4 miliardy rokov starý, nasýtený krátermi']],
    desc:'Kallisto jednoducho vydržala. Obieha za slapovými vojnami, ktoré zohrievajú vnútorné mesiace, a tak nemá sopky ani posúvajúcu sa kôru — len štyri miliardy rokov dopadov zapísaných na najstaršom, najkráterovanejšom známom povrchu. Dosť ďaleko od Jupiterových radiačných pásov na to, aby sa tam dalo prežiť, je obľúbeným kandidátom na budúcu ľudskú základňu.'
  },
  titan: {
    name:'Titan',
    tagline:'Ten druhý svet s dažďom — metánové moria pod oranžovým smogom',
    stats:[['Hmotnosť','0,0225 M⊕'],['Priemer','5 150 km'],['Vzdialenosť','1 222 000 km od Saturna'],
           ['Obeh','15,9 dňa'],['Atmosféra','1,45 atm dusíka — hustejšia než zemská'],['Jazerá','Kvapalný metán a etán']],
    desc:'Titan je jediný mesiac s hustou atmosférou a jediný svet okrem Zeme so stojacou kvapalinou na povrchu: rieky, jazerá a moria metánu, napĺňané uhľovodíkovým dažďom pod oranžovým fotochemickým smogom. Chémia klesajúca z toho oparu je tá istá organická surovina, ktorá na Zemi predchádzala životu.\n\nV roku 2005 sa sonda Huygens zniesla padákom a pristála na záplavovej rovine z ľadových okruhliakov — najvzdialenejšie pristátie, aké sa kedy podarilo. V tridsiatych rokoch má jeho oblohu brázdiť jadrová helikoptéra Dragonfly.'
  },
  enceladus: {
    name:'Enceladus',
    tagline:'Gejzírový mesiac — chrlí skrytý oceán do vesmíru',
    stats:[['Hmotnosť','0,000018 M⊕'],['Priemer','504 km'],['Vzdialenosť','238 000 km od Saturna'],
           ['Obeh','1,37 dňa'],['Albedo','0,99 — najodrazivejšie známe teleso'],['Chocholy','Slaná voda, oxid kremičitý, vodík, organika']],
    desc:'Enceladus má sotva päťsto kilometrov v priemere, a predsa z trhlín na južnom póle strieka obsah podpovrchového slaného oceánu priamo do vesmíru — chochol, ktorým sonda Cassini preletela a ochutnala ho. Našla soli, oxid kremičitý z horúcich prieduchov na dne a voľný vodík: chemickú energiu presne toho druhu, ktorý na dne zemských oceánov živí mikrobiálny život. Padajúci sneh farbí Enceladus na belšie než čerstvý papier a unikajúci ľad sýti Saturnov prstenec E — chvost, ktorý tu vidíte za ním.'
  },
  triton: {
    name:'Triton',
    tagline:'Zajatý tulák — svet z Kuiperovho pásu obiehajúci odzadu',
    stats:[['Hmotnosť','0,0036 M⊕'],['Priemer','2 707 km'],['Vzdialenosť','354 800 km od Neptúna'],
           ['Obeh','5,9 dňa — retrográdny, medzi veľkými mesiacmi jediný'],['Povrch','−235 °C, dusíkový mráz a gejzíry']],
    desc:'Triton obieha Neptún odzadu — ako jediný veľký mesiac — pretože tam nikdy nevznikol: je to zajatá trpasličia planéta z Kuiperovho pásu, súrodenec Pluta. To zajatie ho pomaly zabíja; slapové sily ho vlečú dovnútra, k budúcemu roztrhaniu na prstenec.\n\nVoyager 2 odfotografoval gejzíry dusíkového plynu prerážajúce jeho ružový polárny mráz pri −235 °C — vďaka čomu je tento zamrznutý vyhnanec jedným z mála známych geologicky aktívnych svetov.'
  },
  charon: {
    name:'Cháron',
    tagline:'Druhá polovica Pluta — prievozník dvojsveta',
    stats:[['Hmotnosť','0,00027 M⊕ (⅛ Pluta)'],['Priemer','1 212 km'],['Vzdialenosť','19 600 km od Pluta'],
           ['Obeh','6,4 dňa, vzájomne viazaný'],['Útvar','Mordor Macula — tmavočervená polárna čiapka']],
    desc:'Cháron má polovicu priemeru samotného Pluta — pomerovo najväčší mesiac Slnečnej sústavy, taký veľký, že dvojica obieha bod vo voľnom priestore medzi nimi a každý visí nehybne na oblohe toho druhého. Jeho severný pól je zafarbený hrdzavočerveno metánom, ktorý unikol z Pluta a zamrzol do Chárnovej zimnej tmy: jeden svet doslova maľuje druhý.'
  },
  ra: {
    tagline:'Hviezda hlavnej postupnosti F8V — srdce sústavy',
    stats:[['Hmotnosť','1,139 M☉'],['Spektrálny typ','F8V'],['Teplota','~6050 K (5777 °C)'],
           ['Svietivosť','3,042 × Slnko'],['Vek','5,3 miliardy rokov']],
    desc:'Ra (v katalógoch 10 Tauri) je na kovy bohatá hviezda triedy F8 — o čosi hmotnejšia, horúcejšia a trikrát svietivejšia než Slnko. Jej silné ultrafialové žiarenie a široká obývateľná zóna formujú každý svet, ktorý okolo nej obieha: poháňajú oceány kyseliny sírovej na Nephtys, hrubé ozónové štíty Satis aj kovové dažde blízkej Amunet. So svojimi 5,3 miliardami rokov je to starnúca hviezda hlavnej postupnosti — jedného dňa sa nafúkne na podobra a naposledy pretvorí vnútorné planéty.'
  },
  amunet: {
    tagline:'Horúci super-Neptún — veľký brat Neptúna v Jupiterových šatách',
    stats:[['Typ','Horúci super-Neptún (zloženie) / horúci Saturn (hmotnosť)'],['Hmotnosť','98,8 M⊕ (0,311 Jupitera)'],
           ['Priemer','85 758 km'],['Gravitácia','2,18 g (vrchol oblakov)'],['Obežná vzdialenosť','0,0485 AU'],
           ['Oslnenie','1 291,9 × Zem'],['Teplota oblakov','787 °C priem. (1000–1700 °C na dennej strane)'],['Mesiace','Žiadne']],
    images:['Amunet — jej rozpálená atmosféra žiari a oblaky odpareného kameňa a kovu z nej prúdia preč'],
    desc:'Z diaľky vyzerá Amunet ako horúci Neptún — a zložením ním aj je, no váži viac než Saturn. Drží väčšinu horniny a vody celej sústavy, uväznenú však v pekle. Vrcholky oblakov sú dosť horúce na dažde kovov: bronzové a strieborné oblaky bičované vetrami rýchlejšími než úniková rýchlosť menšieho mesiaca, osvetľované búrkami s miliónnásobkom výkonu pozemskej elektrickej siete, ktoré plnia oblohu kyanidom.\n\nPri zostupe žiari vzduch oranžovo, potom žlto, napokon dobiela. Oblaky horniny a kovov sa vracajú; dažďové kvapky oxidu horečnatého a kremeňa veľkosti päste padajú ako žeravé meteory. Pri štyroch miliónoch atmosfér leží plytké more kvapalného kovového vodíka — „slané“ rozpustenou vodou — spočívajúce na čiernom plášti superiónového ľadu. V strede dosahuje polotekuté jadro z oxidu horečnatého a kremeňa 14 000 °C: láva horúca ako povrch modrobielej hviezdy.'
  },
  wadjet: {
    tagline:'Horúci sub-Neptún — kríženec Venuše a Neptúna, stopercentne pekelný',
    stats:[['Typ','Horúci mini/sub-Neptún'],['Hmotnosť','10,4 M⊕'],['Priemer','30 936 km'],
           ['Gravitácia','1,76 g (vrchol oblakov)'],['Obežná vzdialenosť','0,25 AU'],['Oslnenie','48,67 × Zem'],
           ['Teplota','359 °C hore · 2170 °C na dne'],['Tlak','36,2 → 530 kiloatmosfér'],
           ['Mesiace','Sekhmet + niekoľko veľkosti asteroidov']],
    images:['Wadjet — pásikavý sub-Neptún v špinavých, žiarivých farbách',
            'Sekhmet (v popredí) plávajúci pred materským Wadjetom',
            '„Povrch“ Wadjetu — superkritický oceán nad žeravým, takmer roztaveným kremeňom'],
    desc:'Typ, ktorý v našej slnečnej sústave chýba: sub-Neptún, prevažne z horniny a železa (železa má viac než ktorákoľvek slnečná planéta), no štvrtinu hmotnosti mu tvorí oceán hlboký stovky kilometrov, zabalený vo vodíkovej atmosfére s 36 000-násobkom pozemského tlaku.\n\nJeho oceán nie je kvapalina, ale superkritická tekutina. Na „hladine“ žiari oranžovočerveno; hlboko dole žiari morské dno pri 2170 °C žltobielo a pevné ho drží iba tlak. Nezničiteľný návštevník by našiel zvlnené kopce žeravého kremenného tmelu s konzistenciou asfaltu až medu, rieky a „vodopády“ roztavenej horniny a zem, ktorá sa za pár minút mení na dobiela rozžeravenú lávu. Prísne vzaté by ste nestáli na povrchu — stáli by ste na jadre.'
  },
  set: {
    tagline:'AreanXerický — najsuchší svet sústavy Ra',
    stats:[['Typ','AreanXerický (horúci suchý svet marsovského typu)'],['Hmotnosť','0,37 M⊕'],
           ['Priemer','7 680 km (0,6 × Zem)'],['Gravitácia','1,02 g'],['Obežná vzdialenosť','0,66 AU'],
           ['Oslnenie','721 × … 7,21 × Zem'],['Teplota','120 °C'],['Tlak','0,011 atm'],['Mesiace','Žiadne']],
    images:['Set — hrdzavočervený púštny svet bohatý na železo',
            'Erodované červené veže pod Setovou zahmlenou, rozpálenou oblohou',
            'Parou vyrezané kaňony, zachované od Setovej búrlivej mladosti'],
    desc:'Set sa zrodil pod prikrývkou prehriatej pary, no žiara Ra bola priprudká na to, aby tá voda niekedy skondenzovala. Tak sa len pražil — para a vulkanizmus vyrezali fantastické, pokrútené krajiny, kým jeho vnútro bohaté na železo nevychladlo a geológia v priebehu pár stoviek miliónov rokov nestíchla.\n\nO čosi viac hmoty a stala by sa z neho Venuša; takto je „len“ neznesiteľne horúci a na kosť suchý, s červeňou prehĺbenou hrdzou z atmosféry, ktorú už dávno rozložilo žiarenie. Riedky vzduch (dvojnásobok Marsu) poháňa rýchle, no slabé piesočné búrky, takže jeho prastarý parou vyrezaný terén prežíva takmer nedotknutý. Keď sa Ra nafúkne na červeného obra, Setova kôra sa roztaví ešte raz, naposledy.'
  },
  nephtys: {
    tagline:'Vitriolický BathyGaián — oceán kyseliny sírovej, a cudzí život',
    stats:[['Typ','Vitriolický BathyGaián'],['Hmotnosť','2,1 M⊕'],['Priemer','16 540 km'],['Gravitácia','1,25 g'],
           ['Obežná vzdialenosť','1,448 AU'],['Oslnenie','145 × Zem'],['Teplota','231 °C'],
           ['Život','Cudzí — rozpúšťadlom kyselina sírová, biomolekuly zo silikónov'],
           ['Mesiace','Žiadne (jeden do nej dávno narazil)']],
    images:['Nephtys — utopená v červenohnedých sírových „vodách“, bodkovaná pominuteľnými sopečnými ostrovmi'],
    desc:'Nephtys vyzerá ako špinavá mláka, do ktorej napadalo jesenné lístie — a je oveľa zvláštnejšia. Celý svet je presiaknutý oceánom kyseliny sírovej, prerušovaným len krátkodobými sopečnými ostrovmi, ktoré jeho žieravé moria čoskoro zožerú.\n\nJe to druhý svet sústavy nesúci život, no jeho biochémia je nadobro cudzia: rozpúšťadlom je kyselina sírová, kostrou biomolekúl silikóny (siloxány). Nephtys sa narodila vlhkejšia a vodnatejšia, no UV žiarenie Ra jej oceány rozštiepilo na vodík a kyslík, zatiaľ čo sopky chrlili oxid siričitý — z vody sa stala takmer čistá kyselina, ktorá rozpustila kovy a zafarbila svet dočervenohneda.'
  },
  satis: {
    tagline:'AreanLakustrický — svet veľkosti Marsu, ktorý zrodil inteligentný život',
    stats:[['Typ','AreanLakustrický'],['Hmotnosť','0,25 M⊕ (2,37 × Mars)'],['Priemer','7 780 km'],
           ['Gravitácia','0,68 g'],['Obežná vzdialenosť','1,71 AU'],['Oslnenie','103,7 % Zeme'],
           ['Pokrytie vodou','60 %'],['Teplota','24 °C'],['Tlak','0,62 atm (66 % O₂, 29 % N₂)'],
           ['Život','Komplexný — dal vzniknúť inteligencii'],['Mesiace','1 (polovica hmotnosti Luny)']],
    images:['Satis — modré moria a fialové lesy, s jediným mesiacom',
            'Týčiace sa fialové lesy počas epochy Rozkvetu',
            'Levanduľové krovinaté pláne pri plytkom jazere pod jasnou oblohou Ra'],
    desc:'Satis je záhadou sústavy: svet veľkosťou bližší Marsu než Zemi, bez platňovej tektoniky — a predsa zrodil inteligentný život. Pomenovaný po egyptskej bohyni životodarných záplav Nílu žije a umiera v cykloch.\n\nRaz za pár stoviek miliónov rokov dosiahne teplo v jeho vnútri kritický bod a planéta sa prebúdza: Snehová guľa → Odmäk → Rozkvet → Sopečné obdobie → Súmrak → Snehová guľa. Práve teraz, 165 miliónov rokov v aktuálnom cykle, je Satis na vrchole svojej epochy Rozkvetu — horúci, vlhký raj pripomínajúci karbón, plný fialových lesov, plytkých morí a vzduchu bohatého na kyslík (41 % O₂ pri pozemskom tlaku). Silná ozónová vrstva z UV žiarenia Ra robí jeho povrch menej ožiareným než pozemský. No každý cyklus je dlhší a prudší než predchádzajúci; plazivé Sopečné obdobie raj jedného dňa nadobro ukončí.'
  },
  uatur: {
    tagline:'BathyPelagický — dokonalá modrá guľôčka, ktorá je pre život púšťou',
    stats:[['Typ','BathyPelagický (svet hlbokého oceánu)'],['Hmotnosť','9,1 M⊕'],['Priemer','27 456 km'],
           ['Gravitácia','1,96 g'],['Obežná vzdialenosť','3,50 AU'],['Excentricita','0,179'],
           ['Oslnenie','24,83 % Zeme'],['Teplota','8 °C'],['Tlak','5,51 atm'],
           ['Život','Riedke prokaryoty (zanesené z Nu) + kolónie zo Satis'],['Mesiace','Nu, Naunet']],
    images:['Uat-Ur — skutočná modrá guľôčka, zohrievaná zvnútra'],
    desc:'Z vesmíru je Uat-Ur najkrajším svetom Ra — skutočná modrá guľôčka. Je naozaj mierny: napriek vzdialenosti ho hreje atmosféra bohatá na vodík a metán, oblaky CO₂ a vnútorné teplo sveta s takmer Neptúnovou hmotnosťou.\n\nA predsa je takmer bez života. Uat-Ur je z 28 % voda: pod jeho ~100 km hlbokým oceánom leží hrubý plášť vysokotlakového ľadu, ktorý skalnaté vnútro od oceánu odrezáva a necháva vodu takmer čistú — sterilnú, na živiny chudobnú obriu kvapku. Pri osvetlenej hladine sa vznáša len jednoduchý život, z veľkej časti zanesený z mesiaca Nu. Biomyseľ Satis ho kolonizovala — bioluminiscenčné oblačné lesy dnes rozsvecujú jeho noci — no pre ňu je len dočasným predmostím.'
  },
  shu: {
    tagline:'Studený svet nízkej hustoty na zamrznutej hranici sústavy',
    stats:[['Hmotnosť','1,71 M⊕'],['Hustota','2 g/cm³ (ľadová)'],['Obežná vzdialenosť','15,7 AU'],
           ['Excentricita','0,113'],['Oslnenie','1,234 % Zeme'],['Teplota','−130 °C']],
    desc:'Shu je vzdialený svet nízkej hustoty v studenej vonkajšej sústave — dostáva len asi 1 % zemského slnečného svitu a pri −130 °C sedí na hranici medzi planétami Ra a ríšou jej hnedotrpasličieho spoločníka Horusa. (Autorove poznámky k Shu ešte len vznikajú.)'
  },
  sekhmet: {
    tagline:'Roztavený kríženec Io a Venuše, vlečúci kométam podobný chvost',
    stats:[['Hmotnosť','0,761 × Luna'],['Hustota','6,23 g/cm³'],['Priemer','0,202 × Zem (~2 574 km)'],
           ['Gravitácia','0,229 g'],['Materská planéta','Wadjet']],
    images:['Sekhmet — horúci, zahmlený kamenný mesiac; za ním planie Ra',
            'Sekhmet (v popredí) v silhuete pred materským Wadjetom',
            'Na povrchu Sekhmetu: nad roztavenými sopečnými pláňami sa týči Wadjet'],
    desc:'Kedysi, na geologický okamih počas Wadjetovej migrácie, bol Sekhmet oceánskym svetom bohatým na organické látky — potom vyvrel dosucha, dobili ho impakty a sčasti sa roztavil do morí lávy a roztavenej soli. Po pokojnom veku mu nedávny dopad asteroidu znova zvýšil excentricitu dráhy a rozdúchal Wadjetovo slapové zohrievanie.\n\nDnes je pekelnou zmesou Io a Venuše, s ťažkým príklonom k Io: sopky, roztavené pláne a podzemné jazerá síry, 450 °C aj na najpokojnejších miestach — to všetko pod takmer vákuovou oblohou, keďže jeho riedku odplynenú „atmosféru“ strháva žiarenie tak rýchlo, ako vzniká. Unikajúca hmota sa za ním tiahne ako jemný, kométam podobný chvost, ktorý často zametá cez Wadjet a korení jeho oblaky.'
  },
  satismoon: {
    tagline:'Malý spoločník, ktorý drží Satis pri živote',
    stats:[['Hmotnosť','~0,5 × Luna'],['Obežná vzdialenosť','68 780 km (okolo Satis)'],['Materská planéta','Satis']],
    desc:'Vznikol ako náš Mesiac, obrím impaktom na začiatku dejín Satis, a má polovicu hmotnosti Luny. Hoci je malý, znamená nesmierne veľa: jeho slapy pomáhajú brániť vnútru Satis, aby stuhlo, udržiavajú magnetické pole planéty a zpravidelňujú veľké cykly od Snehovej gule po Rozkvet, vďaka ktorým je komplexný život na svete veľkosti Marsu vôbec možný.'
  },
  nu: {
    tagline:'Ľadovo-oceánsky mesiac s otvorenou vodou pod vákuovou oblohou — a životom',
    stats:[['Hmotnosť','1,4 × Luna'],['Hustota','3,98 g/cm³'],['Priemer','3 672 km'],['Gravitácia','0,208 g'],
           ['Zloženie','72,9 % hornina · 22,7 % železo · 4,6 % voda'],['Priem. teplota','−93 °C (oázy 0–90 °C)'],
           ['Život','Pôvodný — mikrobiálny, s kyslíkovou fotosyntézou'],['Materská planéta','Uat-Ur']],
    desc:'Chiméra Io, Európy a Zeme. Nu, sotva väčší než Luna, patrí k slapovo najzohrievanejším telesám sústavy — no vysoký obsah vody ho ušetril osudu Io. Namiesto sopečného pekla je hydrotermálnym rajom: globálny oceán pár stupňov nad bodom mrazu, pokrytý ľadom často len metre hrubým, so vzácnymi oázami otvorenej modrej vody pariacej sa pod takmer vákuovou, takmer čiernou oblohou.\n\nHoci má menej než 5 % vody podľa hmotnosti, aj to je 3,4-násobok všetkej pozemskej vody. Život tu nielen existuje, ale prekvitá — vyvinul dokonca kyslíkovú fotosyntézu. Genetika ukazuje, že život na Nu aj Uat-Ur začal práve tu, a odolní domorodci z Nu zatiaľ odrazili každý pokus biomysle Satis o zamorenie.'
  },
  naunet: {
    tagline:'Kde končia svety marsovského typu a začínajú ľadové mesiace?',
    stats:[['Hmotnosť','3,45 × Luna'],['Hustota','3,98 g/cm³'],['Gravitácia','0,281 g'],
           ['Zloženie','88,7 % hornina · 10,9 % železo · 0,3 % voda'],['Priem. teplota','−100 °C'],['Materská planéta','Uat-Ur']],
    desc:'Hmotnejší než Ganymedes, no pri −100 °C má bližšie k najchladnejším kútom Marsu. Naunet je prevažne kamenný, zabalený v 2–14 km hrubej kôre z vodného, amoniakového a CO₂ ľadu, s riedkou (3–4 mbar) atmosférou. Znížené body topenia dovoľujú podzemným vreckám sýtenej amoniakovo-vodnej soľanky pretrvávať; občas vybuchnú v kryovulkanizme a zamrznú do priesvitného čerstvého ľadu.\n\nKým Nu má život, Naunet je sterilný — jeho zásadité soľanky a nespojité moria nikdy nedali žiadnej biochémii šancu uchytiť sa. Mrazom pobozkaná verzia Marsu: nie živá, ale krásna.'
  },
  horus: {
    tagline:'Hnedotrpasličí spoločník Ra — nevydarená hviezda s vlastnými svetmi',
    stats:[['Typ','Hnedý trpaslík (substelárny spoločník)'],['Hmotnosť','46,6 Jupiterov'],['Hustota','84,7 g/cm³'],
           ['Priemer','125 840 km'],['Gravitácia','152 g'],['Obežná vzdialenosť','45,8 AU'],['Teplota','559 °C'],
           ['Mesiace','Anubis, Khonsu, Nut, Osiris']],
    desc:'Horus nie je planéta, ale hnedý trpaslík — teleso so 46-násobkom hmotnosti Jupitera, z ktorého sa hviezda nikdy celkom nestala. Vlastným pomalým gravitačným zmršťovaním stále žhaví na matných 559 °C a svieti svojmu sprievodu ako slabé, zachmúrené slnko. Okolo neho obiehajú štyri vlastné svety vrátane klamlivej „modrej guľôčky“ Anubisa.'
  },
  anubis: {
    tagline:'Klamlivý boh smrti — „modrá guľôčka“, ktorá je nadobro mŕtva',
    stats:[['Hmotnosť','0,468 M⊕'],['Zloženie','45,9 % voda · 44,2 % hornina · 9,9 % železo'],
           ['Obežná vzdialenosť','0,00852 AU (okolo Horusa)'],['Priem. teplota','81,2 °C'],['Materské teleso','Horus']],
    desc:'Cez ďalekohľad vyzerá Anubis ako svätý grál: slapovo zohriaty na teploty kvapalnej vody, s kyslíkovou signatúrou a hmlisto modrým diskom. Zblízka svoje meno prezradí. Naozaj má oceány kvapalnej vody a voľný kyslík — lenže ten kyslík značí neprítomnosť života, nie jeho prítomnosť. Patrí k najnehostinnejším terestrickým telesám celej sústavy: krásna, abiotická modrá guľôčka.'
  },
  khonsu: {
    tagline:'Studený kamenný mesiac hnedého trpaslíka',
    stats:[['Hmotnosť','0,554 M⊕'],['Zloženie','72,8 % hornina · 13,6 % voda · 13,6 % železo'],
           ['Obežná vzdialenosť','0,0125 AU (okolo Horusa)'],['Priem. teplota','−99,5 °C'],['Materské teleso','Horus']],
    desc:'Studený, prevažne kamenný svet obiehajúci Horusa pri −99,5 °C.'
  },
  nut: {
    tagline:'Mrazivý svet Horusa s ľadovou škrupinou, podobný Európe',
    stats:[['Hmotnosť','1,74 M⊕'],['Zloženie','54,1 % voda · 29,7 % hornina · 16,3 % železo'],
           ['Obežná vzdialenosť','0,0156 AU (okolo Horusa)'],['Priem. teplota','−190 °C'],['Materské teleso','Horus']],
    desc:'Hlboko zamrznutý svet bohatý na vodu pri −190 °C — jedno z najchladnejších miest sústavy Ra.'
  },
  osiris: {
    tagline:'Mini-Neptún obiehajúci hnedého trpaslíka',
    stats:[['Hmotnosť','15,5 M⊕'],['Zloženie','72,3 % H/He · 22,2 % voda · 4 % hornina · 1,5 % železo'],
           ['Obežná vzdialenosť','0,781 AU (okolo Horusa)'],['Materské teleso','Horus']],
    desc:'Najvzdialenejší a najväčší mesiac Horusa — skutočný mini-Neptún z vodíka a hélia nad vodou, krúžiaci okolo svojho hnedotrpasličieho primára ďaleko od tepla Ra.'
  }
},

/* ---------- Slnečná sústava (alternatívny dataset, data-sol.js) ---------- */
glossarySol: [
  ["AU", "Astronomická jednotka — priemerná vzdialenosť Zem–Slnko, ~149,6 milióna km."],
  ["Terestrická planéta", "Kamenný svet s pevným povrchom (Merkúr–Mars)."],
  ["Plynný obor", "Planéta prevažne z vodíka a hélia (Jupiter, Saturn)."],
  ["Ľadový obor", "Planéta prevažne z 'ľadov' vody, amoniaku a metánu (Urán, Neptún)."],
  ["Trpasličia planéta", "Obieha Slnko, je guľatá, no nevyčistila si okolie svojej dráhy (Pluto)."],
  ["Slapové viazanie", "Mesiac sa otočí presne raz za obeh — ukazuje stále tú istú tvár."],
  ["Kuiperov pás", "Prstenec ľadových telies za Neptúnom; Pluto je jeho najslávnejším členom."],
  ["Cassiniho delenie", "4 800 km široká medzera medzi dvoma najjasnejšími Saturnovými prstencami."],
  ["g", "Zemská povrchová gravitácia. M⊕ = hmotnosti Zeme."]
],

glossary: [
  ['Oslnenie','Slnečný svit dopadajúci na planétu, v % toho, čo dostáva Zem.'],
  ['AreanXerický','Horúci, suchý svet marsovského (areánskeho) typu.'],
  ['AreanLakustrický','Svet marsovského typu striedajúci aktívne/teplé-vlhké a zamrznuté obdobia.'],
  ['BathyGaián','Terestrický svet s kvapalnými plochami, pokrytý hlbokým oceánom.'],
  ['BathyPelagický','Svet hlbokého globálneho oceánu.'],
  ['Vitriolický','Oceány z kyseliny sírovej.'],
  ['Fotodisociácia','Rozštiepenie molekuly svetlom/žiarením (zvyčajne UV).'],
  ['Hlavná postupnosť','„Normálna“ hviezda spaľujúca v jadre vodík na hélium.'],
  ['g','Povrchová gravitácia Zeme. AU = priemerná vzdialenosť Zem–Slnko.']
],

verbatim: {
  "amunet": "Keby ste sa na obrázok tejto planéty pozreli z diaľky a k tomu na jej zloženie, dalo by sa vám odpustiť, keby ste ju považovali za horúci svet podobný Neptúnu, hoci bohatý na vodík a hélium. Nemýlili by ste sa, prísne vzaté — zloženie Amunet má naozaj bližšie k neptúnskemu než k pravému plynnému obrovi. Amunet je však hmotnejšia než Saturn. Aj na sústavu takú bohatú na kovy, ako je Raova, je to nezvyčajné: hoci sústava oplýva hustými terestrickými planétami, väčšinu jej horniny a vody drží celkovo vzaté práve táto planéta. Prečo po nej teda biomyseľ Satis vôbec neprahne? Nuž…\n\nAmunet, aj keby sme jej teplotu merali na vrcholkoch oblakov, je dosť horúca na dažde kovov. Refraktérne materiály, pri pozemských teplotách tvrdé ako kameň, plnia oblohu v podobe nádherných bronzových a strieborných oblakov (a trochu týchto kovov by ste tam naozaj našli!), bičovaných vetrami rýchlejšími než úniková rýchlosť stredne veľkého mesiaca. Pod nimi sa veci len zhoršujú. Spaľujúca žiara titanského, blízkeho slnka mizne a nahrádzajú ju titanské búrky s bleskami, ktoré generujú miliónkrát viac energie než celosvetová výroba elektriny ľudstva 21. storočia, a plnia oblohu kyanidom. Keby bol niekto nezničiteľný, zostup pod túto násilnú vrstvu oblakov, bleskov a búrok by znamenal ponor do zdanlivo nekonečného oparu, ktorý začína oranžovo rozžeravený a postupne sa rozjasňuje, až žiari nažlto a napokon dobiela. Nebyť nesmiernych tlakov a teplôt, bola by táto scéna takmer pokojná — za týchto podmienok totiž nemôže do oblakov kondenzovať žiadna látka. Bez rozžeraveného svitu superkritického vodíka by tu vládla úplná tma.\n\nNapokon vzduch zhustne na kalnú polievku a oblaky svojho druhu sa začnú vracať — teda aspoň ak si náš hypotetický nezničiteľný cestovateľ stiahne expozíciu kamery natoľko, aby nevidel len beztvarú, dobiela rozžeravenú žiaru. Ukáže sa, že vodík a hélium nie sú jediné, čo sa v tomto bizarnom horúcom mori nachádza. Tieto oblaky, hoci pôsobia oveľa hustejšie a hmlistejšie než ich príbuzní vo vrchnej atmosfére, sú nezameniteľne z horniny a kovov.\n\nNakoniec sa vráti aj dážď svojho druhu. Na rozdiel od dažďa vysoko v atmosfére sa tento — vďaka gravitácii hustého jadra pod ním a extrémnej teplote a tlaku tejto vrstvy — ponáša skôr na padajúce meteory: obrie kvapky veľkosti päste, rútiace sa v gravitácii jadra extrémnou rýchlosťou. A ako klesáme ešte hlbšie, tieto obrie kvapky sa spájajú a nesmierny tlak ich drví na kašovité gule oxidu horečnatého a kremeňa, podobné oveľa chladnejším čpavkovo-vodným kašovitým guliam v atmosfére Jupitera — ibaže takmer takým horúcim ako povrch Slnka. Ak odhliadneme od tlakov, pripomína to rané dni Amunet, keď na jej rastúci plynný obal padali meteory z protoplanetárneho disku, z ktorého sa sformovala. Tá podobnosť je viac než náhodná — ako tie skaly padali do plynného obalu, vyparovali sa a miešali s atmosférou Amunet. Vďaka veľkej hmotnosti planéty zostáva veľká časť toho materiálu odparená v spodných vrstvách jej superkritického tekutého obalu a po takmer piatich miliardách rokov stále kondenzuje a živí nekonečný, ohnivý dážď.\n\nVšetky okrem najväčších kašovitých gúľ sa znova vyparia skôr, než na čokoľvek dopadnú, vrátia svoj materiál superkritickému vodíku nad sebou, aby opäť spŕchli — a cyklus sa opakuje. Niektoré však, keď okolitý tlak dosiahne 4 milióny atmosfér, padnú do mora tekutého kovu. Tým kovom nie je železo, titán, ba ani volfrám — je to vodík! Keby táto zvláštna kvapalina nežiarila tak jasno ako povrch Slnka, videli by ste, že je čierna, no zrkadlovo lesklá — hľadeli by ste na čierne zrkadlo veľkosti planéty. To je zdroj kolosálneho magnetického poľa planéty. Prúdy v ňom sú mocné, a predsa jeho hladina pôsobí pokojne a vyrovnane — pri takom tlaku a gravitácii veľa priestoru na vlny nezostáva. Gravitácia tu už presiahla 6 gé, oproti 1,67 gé na vrcholkoch oblakov. Bola by ešte vyššia, keby v tomto bode nebola takmer tretina hmotnosti planéty nad vami a čiastočne tak nevyvažovala neúprosný ťah jadra vlastnou gravitáciou. Kašovité gule, ktoré dopadnú až sem, sú navždy stratené — rozpustené a rozriedené v tomto zvláštnom mori.\n\nPo príchode k oceánu kovového vodíka by vám bolo odpustené, keby ste si mysleli, že povaha tejto planéty je rovnaká ako u plynných obrov našej slnečnej sústavy, Jupitera a Saturnu. No keby ste zanalyzovali chemické zloženie tohto zvláštneho oceánu, dostali by ste prvý náznak nezvyčajnej povahy tohto sveta — kovový vodík má v sebe rozpustenú vodu, je vodou „slaný“! Po hlbokom ponore do oceánu tekutého vodíka by ste čoskoro narazili na zvláštnu čiernu pevnú látku, horúcejšiu než povrch nášho Slnka. Táto zvláštna pevnina má ryhy, kaňony a ďalšie nerovnosti, desivo podobné útvarom na dne oceánov terestrických svetov. Keby ste zmerali jej chemické zloženie, zistili by ste, že je to — voda! Presnejšie superiónová voda.\n\nTak sa napokon odhaľuje pravá neptúnska povaha tejto planéty. Amunet je hmotnosťou malý joviánsky svet, zložením neptúnsky. Plynného obalu má viac než väčšina neptúnskych svetov, no vodík a hélium tvoria menej než tretinu jej hmotnosti. Jej plášť a jadro z vody a horniny sú však ukryté pod prikrývkou kovového vodíka — veľký brat Neptúna dostal Jupiterove šaty. Pravdaže, vnútra pravých joviánov obsahujú vodu a horninu tiež, no tam sú tieto látky úplne rozpustené v oceáne kovového vodíka hlbokom tisíce kilometrov a rozriedené na nízke koncentrácie. Tu je ten oceán pomerne plytký, takže je rozpustenou H2O nasýtený, a hoci sa zo všetkých síl usiluje prehrýzť do superiónového ľadového plášťa, dokáže mu nahlodať iba povrch.\n\nAk podmienky prežijete a máte čím sa prekopať do superiónového ľadového plášťa tvrdého ako skala, napokon narazíte na polotekuté kamenné jadro, ktoré v strede dosahuje až 14 000 °C — horúce ako chladnejšia modrobiela hviezda! Toto jadro tvorí zmes pevného oxidu horečnatého a roztaveného kremeňa. Inými slovami, je z lávy horúcej ako povrch hmotnej hviezdy. Obsahuje takmer polovicu hmotnosti celej planéty a je zdrojom drvivej gravitácie, ktorá vládne vrstvám nad ním. Iróniou — hoci nie prekvapením — je, že keby ste sa ocitli presne v jeho strede a vyhli sa rozdrveniu tlakom, necítili by ste žiadnu gravitáciu, tak ako v strede všetkých ostatných planét: príťažlivosť zo všetkých smerov by sa vyrovnala na čistú nulu.\n\nVnútorná stavba:\n\nAtmosféra — extrémne turbulentná, konvektívna, neustále búrky s bleskami, dažde horniny a železa.\n\nSuperkritický vodíkový plášť, z ktorého na jadro prší tekutá hornina, oveľa prudšie než vo vrstve oblakov.\n\nPlytké more tekutého vodíka na krajine zo superiónového ľadu. Všetko pri teplotách blízkych povrchu Slnka.\n\nSuperiónový ľad.\n\nHyperstlačená hornina.",

  "wadjet": "Prvá planéta (podľa vzdialenosti od primára) sústavy Ra je typu, ktorý sa v našej slnečnej sústave nevyskytuje — sub-Neptún. Wadjet je zvláštny kríženec Venuše a Neptúna: väčšinu jeho hmotnosti tvorí hornina a železo, tak ako pri terestrických planétach našej slnečnej sústavy (v skutočnosti má železa viac než ktorákoľvek naša planéta!), no až štvrtina jeho hmotnosti je v globálnom oceáne hlbokom stovky kilometrov, obklopenom horúcou, dusivou vodíkovou atmosférou s 36 000-násobkom tlaku tej našej.\n\nAko môže existovať oceán, keď planéta dostáva od Ra takmer 50-krát viac slnečného svitu než Zem od Slnka? Nuž, Wadjetov oceán nie je kvapalný — je to superkritická tekutina, zvláštne skupenstvo hmoty kdesi medzi kvapalinou a plynom.\n\nNa „hladine mora“ je teplota už dosť vysoká na to, aby oceán žiaril oranžovočerveno, čo je pre viditeľnosť dobrá správa, keďže priame slnečné svetlo tak hlboko nedosiahne! Atmosféra nad ním je v neustálej búrke mnohotisícnásobne silnejšej než najsilnejšie búrky našej slnečnej sústavy, zásluhou neúprosného hviezdneho žiarenia dopadajúceho na planétu. Pri ďalšom zostupe do hlbín (ak by človek prežil tú teplotu a tlak!) sa napokon dosiahne morské dno — horúce ako povrch hviezdy s nízkou hmotnosťou, žiariace žltobielo od neuveriteľných 2170 °C. Jediné, čo ho drží aspoň polotuhé, je tlak; pri 1 atmosfére by bola celá planéta úplne roztavená. Keby ste boli astronaut v nezničiteľnom skafandri, videli by ste krajinu, ktorá má so Zemou čo-to spoločné — pláne a zvlnené kopce — no už jediný krok by vám prezradil, že na Zemi nie ste: cítili by ste, ako sa vám nohy pomaly prepadajú do podložnej horniny, a každý krok by bol v drvivej gravitácii utrpením. Keby bol váš skafander dosť ľahký, mohli by ste plávať — hustota okolitého superkritického oceánu je mnohonásobkom hustoty pozemskej vody. Horniny morského dna majú zvyčajne konzistenciu kdesi medzi asfaltom a medom, miestami sú úplne roztavené a vytvárajú lávové jazerá a pramene. Krajina pomaly, ale neustále tečie a mení sa; mäkká konzistencia dna znamená, že sopečné výbuchy sú zriedkavé — vnútorný tlak sa uvoľňuje pozvoľna a postupne, nie prudko a v dávkach ako na terestrických planétach. Rozdiel medzi najvyšším a najnižším bodom je iba 5 km — „zem“ je príliš mäkká a gravitácia príliš vysoká na veľké pohoria. Vzhľadom na to všetko môže materiál mäkkej, polotekutej „kôry“ prekvapiť — je to kremeň!\n\nExtrémne vnútorné teplo Wadjetu a jeho vonkajšie zohrievanie drvivou, teplo zadržiavajúcou atmosférou vytvárajú prostredie zrelé na sopečné erupcie. Tie sú mimoriadne časté, no nepodobajú sa žiadnej erupcii na Zemi ani na inej terestrickej planéte. „Kôra“ je príliš mäkká na platňovú tektoniku, takže Wadjetov vulkanizmus má podobu erupcií nad horúcimi škvrnami. V podmienkach extrémnych tlakov a takmer roztavenej kôry však tieto erupcie vyzerajú tak, že sa veľké plochy kôry v priebehu minút spontánne roztavia a vyvrhnú obrovské množstvá tmavých, chemicky bohatých výparov. Keďže Wadjetova atmosféra/oceán je konvektívna, tieto výpary si po dlhom čase nájdu cestu do jeho oblačnej pokrývky, obohacujú jej chémiu a pomáhajú ju farbiť do jasných, hoci špinavých farieb.\n\nKeby ste dokázali prežiť tie neuveriteľne nehostinné podmienky, výhľad by bol veľkolepý — zvlnené kopce žeravého tmelu, zahalené „hmlou“ z vysokého tlaku ohýbajúceho svetlo, zem vlniaca sa pod nohami ako želé. V aktívnejších oblastiach by ste videli, ako chuchvalce tekutej horniny dvíhajú kopce vyzerajúce ako z pudingu a ako roztavená hornina tečie v riekach, miestami dokonca vytvára „vodopády“. Videli by ste, ako sa zdanlivo stabilné kopce a údolia v priebehu minút menia na dobiela rozžeravenú lávu a pritom chrlia čierny dym. Tento výhľad si však tak skoro nepozriete — podmienky na Wadjete robia z Venuše príjemné miesto. Prísne vzaté by ste ani nestáli na jeho povrchu, ale na jeho jadre. Nie celkom neptúnsky, nie celkom terestrický — ale stopercentne pekelný.\n\nDejiny Wadjetu\n\nWadjet začal svoj príbeh ako protoplanéta ďaleko od Ra, hneď za snežnou čiarou, zo zmesi železa, horniny a ľadu. Kovmi bohaté zloženie znamenalo prevahu horniny a železa, no Wadjetova prvotná protoplanetárna podoba sa rýchlo zlúčila s ďalšími, menšími protoplanétami a začala z Raovho protoplanetárneho disku naberať horninu, železo, vodný ľad a vodíkovo-héliový plyn. Po dosiahnutí niekoľkých zemských hmotností mal našliapnuté k lavínovitému naberaniu plynu, pri ktorom by pribral stovky zemských hmotností vodíka a hélia — a sústava Ra by mala hneď za snežnou čiarou plynného obra podobného Jupiteru, čo by pravdepodobne navždy zabránilo vzniku Satis. To sa však očividne nestalo.\n\nKeď Wadjet dosiahol hmotnosť o čosi nižšiu než Neptún v našej slnečnej sústave a vytvoril si sprievod mladých mesiacov, rané obrie impakty a trenie o hustý Raov protoplanetárny disk ho prinútili pomaly špirálovať dovnútra, k Ra. Cestou stratil väčšinu mesiacov slapovou disipáciou, zrážkami a blízkymi stretmi s terestrickými protoplanétami; premiešal protoplanetárny disk, rozptýlil mnoho terestrických protoplanét a spôsobil, že časť ľadového materiálu spoza snežnej čiary opäť vstúpila do vnútornej sústavy (oboje sa stalo už o niekoľko miliónov rokov skôr pri migrácii Amunet, formovanie terestrických planét to však veľmi neovplyvnilo, keďže sa ešte nezačali formovať). To jednak znížilo výslednú hmotnosť Satis a Setu (Nephtys má pôvod skôr podobný Wadjetu), jednak ich obohatilo o prchavé látky — mladá, aktívna Ra by inak vnútorné protoplanéty nechala úplne suché.\n\nWadjet strácal hmotnosť aj sám, impaktmi a ožarovaním svojej vodíkovo-héliovej atmosféry blízkou materskou hviezdou — dnes má preto len 71 percent hmotnosti Uránu. Napokon prišiel o všetky mesiace okrem jedného, Sekhmeta. No ani sám nevyviazol bez šrámov.",

  "sekhmet": "Wadjetov jediný veľký mesiac, Sekhmet, má za sebou búrlivý príbeh. V čase zrodu tvorila asi tretinu jeho hmotnosti zmes vody, organických zlúčenín, ľadu CO2 a amoniaku. Keď Wadjet migroval, tento ľad sa začal vyparovať. Na geologicky krátky okamih bol Sekhmet oceánskym svetom s vodami plnými organických látok — a keby ten stav vydržal, mohol potenciálne zrodiť život. Čoskoro však, ako sa Wadjet blížil k svojmu slnku, začal prudko vrieť a zostala z neho vysušená škrupina pokrytá soľnými pláňami. A akoby to nestačilo, gravitačný tanec počas migrácie prehnal Sekhmet viacerými ťažkými impaktmi, ktoré odstránili veľkú časť jeho kôry a plášťa, a presunul ho na blízku, výstrednú dráhu, kde ho pustošili Wadjetove slapové sily. Istý čas bol Sekhmet takmer úplne roztavený, zaplavený moriami lávy a roztavenej soli. Napokon sa jeho dráha zokrúhlila a usadil sa v pokojnejšej fáze — hoci na najhorúcejších miestach si vďaka neúprosnému teplu materskej hviezdy stále držal povrchové jazerá minerálov s nízkou teplotou topenia.\n\nToto pokojné obdobie sa skončilo pomerne nedávno, keď dopad veľkého asteroidu vniesol do jeho dráhy výstrednosť a oživil slapové zohrievanie Wadjetom. V súčasnosti pripomína pekelnú zmes Io a Venuše, hoci sa výrazne prikláňa k tej prvej. Veľká časť povrchu je pokrytá sopkami a roztavená. Časti, ktoré možno nazvať pevnými či aspoň polopevnými, vulkanizmus neprestajne pretvára a podzemné jazerá síry sú bežné. Aj na najpokojnejších a najstabilnejších miestach môžu teploty dosiahnuť 450 °C. O to pozoruhodnejšie je, že to dokáže bez pomoci drvivej atmosféry — vriace sírové jazerá odkryté na povrchu, sopečná činnosť a sublimácia niektorých látok síce vytvárajú prechodnú atmosféru, tá sa však pre nízku hmotnosť mesiaca a extrémne slnečné ožiarenie takmer okamžite stráca do vesmíru. Sekhmetova „atmosféra“ je preto takmer vákuum. Tieto procesy vytvárajú úchvatný pohľad — tak ako jeho materská planéta, aj Sekhmet pomaly odovzdáva hmotu vesmíru a vytvára jemný, kométam podobný chvost. Ten často pretína Wadjet a obohacuje chémiu jeho oblakov. Vďaka faktickej neprítomnosti atmosféry však môžu niektoré miesta v noci pri póloch klesnúť aj pár stupňov pod 0 °C!\n\nVo všeobecnosti je Sekhmetovo prostredie extrémnejšie než na Io, hoci miera slapového zohrievania je podobná. Vďačí za to intenzívnemu žiareniu Ra — aj bez slapového zohrievania by bol dosť horúci na to, aby boli mnohé horniny mäkké a v tme matne červeno žiarili.",

  "set": "Set je druhá najbližšia planéta k Ra a nie je to práve miesto, ktoré by ste chceli nazývať domovom — iba ak ste veľkým fanúšikom pekelne horúcich púští a geológie. Tak ako Zem, Mars, Venuša a Satis sa aj Set narodil obklopený prikrývkou prehriatej pary, no na rozdiel od nich bola žiara jeho domovskej hviezdy priveľmi prudká na to, aby voda čo i len nakrátko skondenzovala. Tak sa pražil ďalej; sopečná činnosť a para týrali povrch a vyrezávali erodované, fantastické krajiny. Parný skleníkový efekt spolu s mladým, sopečným svetom bol dosť silný na to, aby sa povrch na mnohých miestach na pomerne dlhý čas po vzniku planéty úplne roztavil. Táto raná aktivita spolu so Setovým zložením bohatým na železo (planéty bohaté na železo strácajú vnútorné teplo rýchlejšie) spôsobila, že Setova geologická aktivita ustala už v prvých pár stovkách miliónov rokov po jeho vzniku.\n\nKeby bol Set len o trochu hmotnejší a o trochu chladnejší, vyvinul by sa priamo na cytherejský svet (svet venušanského typu) — neuveriteľne horúci, s lavínovitým skleníkom a hustou atmosférou. Nízka hmotnosť ho pred týmto osudom zachránila; stal sa „len“ neznesiteľne horúcim a suchým, keď sa parná atmosféra, čo ho kedysi halila, rozplynula, a dnes nesie pochybnú poctu najsuchšieho sveta sústavy Ra. Na prvý pohľad vyzerá ako Mars bez ľadu, no jeho červeň je ešte hlbšia a živšia — vďaka obsahu železa a kyslíku, ktorý sa uvoľnil, keď bola prvotná vodná atmosféra fotodisociovaná na vodík, ktorý unikol, a kyslík, ktorý sa naviazal na železo a vytvoril hrdzu. Jeho terén však nie je terénom typického sveta marsovského typu — nenesie žiadne typické vyschnuté riečiská ani stopy po kvapalnej vode. Tento svet nikdy nebol obývateľný; namiesto toho nesie fantastické, pokrútené erodované krajiny, vyrezané parou takou agresívnou, že by pri dotyku odrezala ľudské končatiny.\n\nHoci má Set gravitáciu o čosi vyššiu než Zem, jeho atmosféra je sotva 2× hustejšia než marťanská — piesočné búrky na ňom pôsobia pôsobivo aj v porovnaní s tými na Marse a vďaka neúprosnému praženiu pod Ra dosahujú oveľa vyššie rýchlosti vetra, no pre nízku hustotu vzduchu nemajú veľkú eróznu ani ničivú silu. Aj preto zostáva Setova jedinečná geológia, vyrezaná v jeho ranej histórii, zachovaná dodnes. Planéta má pôsobivé zásoby železa a iných kovov, no v súčasnosti nemá žiadnu geologickú aktivitu okrem občasného otrasu. Keď Ra napokon opustí hlavnú postupnosť a začne sa rozpínať na červeného obra, Setova kôra sa roztaví ešte raz a pretvorí planétu naposledy pred zánikom.",

  "nephtys": "Na prvý pohľad vyzerá Nephtys ako planetárna verzia špinavej mláky, do ktorej napadalo jesenné lístie a zafarbilo ju dočervenohneda. Pravda je oveľa zaujímavejšia, ale aj desivejšia — planéta je presiaknutá oceánom kyseliny sírovej, z ktorého vytŕča len zopár pominuteľných sopečných ostrovov, ktoré agresívne „vody“ tohto sveta čoskoro erodujú preč. Je to popri Satis druhý svet sústavy nesúci život, no na rozdiel od Satis je biochémia tohto sveta dosť odlišná od tej, na ktorú sú ľudia zvyknutí — ako rozpúšťadlo využíva kyselinu sírovú a ako základ biomolekúl silikóny (siloxány). Keď bola Nephtys mladá, migrovala z vonkajších častí sústavy Ra, pričom stratila mesiac (zrútil sa na ňu) a bombardovali ju husté protoplanéty, ktoré ju pripravili o väčšinu vody. To, čo zostalo, stále stačilo pokryť planétu hlbokým oceánom — ten však bol priplytký na to, aby ho na dne uväznil vysokotlakový ľad, a hydrotermálne prieduchy a sopky mohli voľne prerážať morské dno a dodávať do oceánu minerály a zložité molekuly nevyhnutné pre vznik života.\n\nKeby Nephtys obiehala chladnejšiu, červenšiu hviezdu, príbeh jej formovania sa mohol skončiť tu a mohla sa stať štandardným BathyGaiánskym oceánskym svetom nesúcim život. Ním sa napokon aj stala — no v ničom nie štandardným. Vysoký tok UV žiarenia od Ra rozštiepil jej oceány na vodík a kyslík, zatiaľ čo sopky pumpovali do atmosféry oxid siričitý, a z vody sa stala takmer čistá kyselina sírová. Tá čoskoro rozpustila takmer všetky soli a kovy tohto sveta a zafarbila ho dočervenohneda. (Táto časť je rozpracovaná, Nephtys rozvediem neskôr.)",

  "satis": "Svet, z ktorého prišli títo záhadní útočníci, sme my ľudia pomenovali Satis, po staroegyptskej bohyni zosobňujúcej životodarné, no často aj ničivé záplavy Nílu — a je to enigma. Nikto by nečakal, že mnohobunkový, nieto ešte inteligentný život by sa mohol vyvinúť na svete veľkosťou bližšom Marsu než Zemi, a už vôbec nie na takom, ktorý nemá platňovú tektoniku. Náš protivník má šťastie: vyvinul sa počas krátkeho (geologicky vzaté) obdobia existencie Satis, keď je atmosféra hustá, geológia aktívna a moria sa hemžia živinami, no vzduch ešte nestihli otráviť sopečné plyny a moria neupadli do sulfidického strnutia.\n\nKaždá obývateľná planéta prechádza obdobiami, keď život prekvitá, aj takými, keď je ho pomenej; no pre malú veľkosť sú cykly Satis podstatne drsnejšie než pozemské — planéta je väčšinu svojej existencie takmer geologicky nečinná a len raz za niekoľko stoviek miliónov rokov dosiahne geotermálna energia v jej vnútri kritické množstvo a geológia planéty sa prebudí. Mesiac Satis a jej v porovnaní s Marsom vyššia hmotnosť pomohli zabrániť stuhnutiu jej vnútra, pomáhajú udržiavať magnetické pole a chránia planétu pred večnou premenou na marsovskú púšť, pričom cykly udržiavajú pomerne pravidelné — zatiaľ. Planéta má magnetické pole, hoci slabšie než Zem, čo obývateľnosti vážne neprekáža: intenzívne UV svetlo primára Satis spolu s atmosférou bohatou na kyslík vytvára veľmi silnú ozónovú vrstvu, takže na samotný povrch dopadá menej nebezpečného žiarenia než na Zemi! Pomerne vysoká hustota planéty vďaka vysokému obsahu kovov — mesiac Satis vznikol podobne ako náš, zrážkou s planetoidom na začiatku jej histórie — pomáha udržiavať prchavé látky ako vodu, dusík, kyslík a organické zlúčeniny.\n\nŽivot na Satis existuje 4,8 miliardy rokov, no väčšinu svojej existencie fungoval na úrovni pozemského proterozoika — zopár ekvivalentov protistov, rias a lišajníkov popri množstve bakteriálneho slizu. Nie že by sa nesnažil — fosílie dokladajú prvé mnohobunkové organizmy už pred 2,8 miliardami rokov — no každé obdobie hojnosti sa nevyhnutne končí lavínovitou geologickou aktivitou, ktorá otrávi vzduch aj vodu a ukončí krátke obdobia raja, ktoré cykly Satis prinášajú. Tak ako záplavy Nílu v starovekom Egypte, aj cykly Satis prinášajú život — a smrť. Tieto cykly (medzi Odmäkom a ďalšou Snehovou guľou) zvyčajne trvajú 10 až 100 miliónov rokov, krátko v porovnaní s pokojnými obdobiami, počas ktorých je Satis snehovou guľou, čímsi ako suchšou verziou Zeme v kryogéne. Aktuálny cyklus však beží už 165 miliónov rokov a je práve na vrchole svojho obdobia rozkvetu (ktoré prichádza tesne predtým, než sa planéta zmení na sopečné peklo). Cykly Satis fungujú takto:\n\nObdobie Snehovej gule → Odmäk → Rozkvet → Sopečné obdobie → Súmrak → Snehová guľa (v zdroji zafarbené podľa obývateľnosti: červená nízka, žltá stredná, zelená vysoká)\n\nPočas obdobia snehovej gule je geologická aktivita na veľmi nízkej, takmer marsovskej úrovni, hoci oceány zostávajú pod kôrou ľadu kvapalné; pod kôrou sa však hromadí teplo a tlak, až kým nedosiahnu kritický bod, v ktorom miera vulkanizmu prudko stúpne na pozemskú úroveň a začnú sa hromadiť skleníkové plyny. Tie zvýšia teplotu planéty, (čiastočne) zamrznuté oceány sa roztopia a CO2 z novoprebudených sopiek dodá vzpruhu miestnym ekvivalentom siníc a rias, čo zdvihne hladinu kyslíka a spustí prudkú explóziu biodiverzity a komplexnosti života.\n\nPočas Odmäku nie je Satis obývateľnejšia než tundra a arktické oceány Zeme, keďže hladiny skleníkových plynov ešte nie sú — aspoň podľa našich meradiel — ktovieako vysoké. Postupom času sa však geologická aktivita rozbieha, vnútorný tlak a teplo sa čoraz viac uvoľňujú cez nepoddajnú, hrubú kôru a celá planéta sa mení na tropickú. Z fosílnych dokladov vieme, že predchádzajúce Odmäky priniesli explózie biodiverzity zhruba porovnateľné s avalonskou a kambrickou explóziou v dejinách Zeme, po ktorých počas Rozkvetu kolonizovali súš jednoduché ekvivalenty rastlín, húb a hmyzu. V predošlých cykloch tieto formy života vyhynuli práve vo chvíli, keď sa objavili prvé jednoduché lesy — lavínovitá sopečná aktivita ich udusila v kolíske, keď planéta vstupovala do Sopečného obdobia. Tentoraz však Rozkvet trval dosť dlho na to, aby zrodil inteligentný život. Satis je priľahká na trvalé udržanie zemskej atmosféry — každý cyklus ju pripraví o významné množstvo vody a ďalších prchavých látok, keďže ľadová kôra, ktorú jej oceány zvyčajne majú, ich inokedy chráni pred vyparovaním. Zatiaľ sa však usudzuje, že k žiadnemu úbytku povrchových prchavých látok nedošlo — sopečné odplyňovanie dopĺňa straty parou a rôznymi plynmi z vnútra Satis. Vnútorné zásoby Satis však nie sú neobmedzené.\n\nDlhodobé vyhliadky Satis ale také ružové nie sú. Naši vedci predpovedajú, že keďže sa každý cyklus zdá byť dlhší a intenzívnejší, Sopečné obdobie aktuálneho cyklu vyčerpá väčšinu vnútorného tepla planéty a uvrhne ju do večnej zimy: väčšina oceánov sa počas intenzívneho skleníka Sopečného obdobia vyparí, potom zamrzne a Satis sa usadí v klasickom marsovskom, areánskom stave — až kým sa zvyšné zamrznuté oceány o niekoľko stoviek miliónov rokov nevyparia vlhkým skleníkovým efektom, keď sa mohutné slnko Satis začne meniť na podobra a zo Satis bude čoraz horúcejšia púšť. Táto teória však zatiaľ potvrdená nebola. V každom prípade Satis najbližších minimálne 15 miliónov rokov nezamrzne — no jej klíma sa znepokojivou rýchlosťou mení na „skleníkový stav“, čo naznačuje, že Rozkvet čoskoro ustúpi pomaly sa plaziacemu, no nevyhnutnému Sopečnému obdobiu. V súčasnosti prostredie Satis veľmi pripomína pozemský karbón či juru — horúci, vlhký raj biodiverzity.\n\nVoda pokrýva 60 percent Satis, no planéta má len zlomok pozemskej vody — je menšia, jej moria sú v priemere plytké a veľká časť vody je v močiaroch a premočených džungliach namiesto oceánskych hlbín. Paradoxne tak Satis pôsobí ako vlhší a živší svet než Zem, keďže väčšina pozemského hlbokého oceánu nevidí slnečné svetlo a v porovnaní s plytčinami je na život chudobná. Pôvodný atmosférický tlak Satis presahoval 2 atmosféry — od svojho zrodu stratila viac vzduchu, než jej zostáva (!), a predsa je jej dnešná, na kyslík bohatá atmosféra viac než dosť hustá na dýchanie (zodpovedá koncentrácii takmer 41 percent kyslíka pri pozemskom tlaku). Atmosféra stráca dusík rýchlejšie než kyslík, keďže je ľahší, čo počas teplých, vlhkých geologických období prispieva k prevahe kyslíka.",

  "nu": "Keby človek videl Nu z obežnej dráhy, vyzeral by takmer, akoby niekto stvoril zvláštnu chiméru Io, Európy a Zeme. Mesiac ľadových oceánov rozlámaných hypervulkanizmom, ktorý farbí ľad a horninu sírovou žltou — Nu je vskutku jedným z najzaujímavejších mesiacov sústavy Ra. Hoci mu chýba tak dostatočné zohrievanie svetlom materskej hviezdy (aké má Satis), ako aj hustá skleníková atmosféra zadržiavajúca teplo (akú má jeho materská planéta Uat-Ur), má oceány kvapalnej vody. To samo osebe nie je výnimočné — mnohé ľadové mesiace ako Európa či Enceladus, ba aj trpasličie planéty ako Pluto, majú hlboké oceány pod hrubými ľadovými kôrami. Nu je však naozaj zvláštny: hoci nie je oveľa hmotnejší než náš Mesiac a je ľahší než Ganymedes, najhmotnejší mesiac našej slnečnej sústavy, má miesta takmer otvoreného oceánu, pokryté ľadom hrubým iba metre — a nad niektorými horúcimi prameňmi otvorenú vodu pod čiernou, takmer vákuovou oblohou.\n\nNu to dokazuje napriek takmer úplnej bezvzduchosti tým, že patrí k slapovo najzohrievanejším objektom sústavy Ra. Pri tepelnom toku silnom ako na Io, či ešte silnejšom, by človek čakal pekelnú, poloroztavenú pustatinu; v mnohých ohľadoch je však lepším miestom pre život než falošný raj, ktorým je jeho materská planéta — vysoký obsah vody ho ušetril osudu sopečného pekla a je v istom zmysle hydrotermálnym rajom. Genetický výskum vskutku odhalil, že život na Nu aj Uat-Ur vznikol práve na Nu.\n\nPrekvapivo, život na Nu nielen existuje, ale prekvitá. Dostal sa až k vývoju kyslíkovej fotosyntézy — hoci skutočnosť, že väčšinu oceánu pokrývajú stovky metrov ľadu, obmedzuje fotosyntetizujúce organizmy na vzácne oázy, kde je ľad tenký alebo chýba, a komplexnosť života sa zatiaľ zastavila pri koloniálnych ekvivalentoch prokaryotov. Pomerne nízky obsah vody je skrytým požehnaním — Nu má menej než 5 percent vody podľa hmotnosti, čo však stále znamená 3,38-násobok všetkej vody Zeme. Časť je, pravdaže, zamrznutá v pevnej ľadovej kôre, no tá je na Nu väčšinou hrubá nanajvýš pár stoviek metrov a na vzácnych, sopečne aktívnych horúcich škvrnách možno vidieť modrú vodu odkrytú takmer vákuu, ako si nad sebou vytvára pominuteľnú, dočasnú atmosféru vodnej pary, ktorá ju drží kvapalnú. Pri pohľade na takú scénu by človek pokojne zabudol, že stojí na svete sotva väčšom než náš Mesiac, kde je priemerná teplota len −93,15 °C — chladnejšie než na Marse. Biomyseľ Satis podnikla niekoľko pokusov o kolonizáciu, no miestny život, hoci primitívny, je mimoriadne odolný — prispôsobený moriam, ktoré bujný vulkanizmus robí kyslými a toxickými pre väčšinu foriem života zo Satis — a zatiaľ sa každému pokusu o zamorenie rázne ubránil.\n\nExistencia tohto mesiaca ľudských vedcov spočiatku miatla. Ako môže mať taký aktívny mesiac toľko vody? Io v našej slnečnej sústave je suchší než samotná Venuša — taký intenzívne slapovo zohrievaný mesiac by mal byť predsa vysušený na kosť. Kľúčovým rozdielom je tu povaha materskej planéty. Mladý Jupiter by pre svoje formujúce sa mesiace žiaril takmer ako hviezda s nízkou hmotnosťou a rozohrial Io natoľko, že všetka jeho voda vyvrela a zostal suchý na kosť. Mladý Uat-Ur na to, našťastie, ani zďaleka nestačil a slapové zohrievanie nikdy nedokázalo vyvariť vodu Nu — bolo zo svojej podstaty vždy buď lokalizované, alebo priveľmi hlboko pod povrchom: horúce škvrny s 1500 °C proti ľadu s −93,15 °C, vytvárajúce povrchové oázy s 0–90 °C a globálny oceán len pár stupňov nad bodom mrazu.",

  "naunet": "Pri Naunete si človek môže položiť otázku: „Kde končia svety marsovského typu a kde začínajú ľadové mesiace?“ Je hmotnejší než najhmotnejší mesiac slnečnej sústavy, Ganymedes, a jeho priemerná teplota (−100 °C) má vskutku bližšie k najchladnejším miestam Marsu než k Jupiterovým mesiacom. Tak ako Mars je zložený prevažne z horniny, no stále má vyše polovice vody Zeme — väčšinu uzamknutú v pevnej podobe v ľadovej kôre hrubej 2 až 14 km. Tento ľad však nie je čistá voda: časť tvorí amoniak a oxid uhličitý. Znížením bodu topenia to na tomto mesiaci umožňuje existenciu rozsiahlych vreciek sýteného amoniakovo-vodného roztoku. Občas tieto vrecká vybuchnú na povrch spôsobom desivo pripomínajúcim sopky chrliace lávu na Zemi — hoci tunajšia tekutina je oveľa chladnejšia. Tento kryovulkanizmus sám poháňa bežný vulkanizmus erumpujúci do kilometre hrubého ľadu.\n\nNaunet nedostáva toľko tepla ako Nu a chýbajú mu neustále gejzíry a pretváranie povrchu, ktoré Nu charakterizujú, no je to svet s vlastnými prednosťami. Na rozdiel od Nu má skromnú (len asi 3–4 milibary) atmosféru, nie exosféru. Čo mu chýba na aktivite, doháňa stálosťou. V jednej oblasti má však Nu jednoznačne navrch, a tou je život. Nu má primitívny, ale prosperujúci ekosystém; Naunet je sterilný — jeho amoniakovo-vodné podzemné moria sú príliš zásadité na prežitie foriem života na báze vody a uhlíka, ako sú tie pozemské či satiské, a ich nespojitá, ostrovčekovitá povaha nikdy nedala šancu vzniknúť a rozvinúť sa alternatívnej biochémii.\n\nKeby si človek stal na povrch Nauneta, mohol by si myslieť, že je na bizarnej, mrazom pobozkanej verzii Marsu. Pri troche šťastia by mohol vidieť, ako amoniakom bohaté soľanky erumpujú na povrch a potom zamŕzajú do priesvitného, čerstvého ľadu. Naunet možno nie je živý v biologickom zmysle — ale krásny je určite.",

  "uatur": "Uat-Ur je, tak ako zvyšok sústavy Ra, pre ľudské zmysly klamlivý. Z vesmíru vyzerá ako najkrajší svet Ra — skutočná modrá guľôčka, oceánska planéta. Oceánskou planétou naozaj je, no nijako zvlášť obývateľným svetom nie. Dôvodom nie je jeho vzdialená dráha, atmosféra ani teplota — podľa všetkých meradiel je Uat-Ur mierny svet nesúci vodu. Dostáva ešte menej svetla a tepla než Mars, no zohrieva ho kombinácia vysokého obsahu vodíka a metánu v atmosfére, oblakov CO2 a vnútorného tepla vlastného svetu hmotnosťou bližšiemu Neptúnu než Zemi.\n\nDôvodom neobývateľnosti Uat-Uru je jeho zloženie. Hoci nie je ľadovým obrom, Uat-Ur tvorí z 28,1 percenta voda — pod jeho ~100 km hlbokým oceánom preto leží veľmi hrubá vrstva vysokotlakového ľadu, ktorá bráni akejkoľvek interakcii medzi skalnatým vnútrom a oceánom. Jeho voda je tak takmer čistá voda — chudobné prostredie pre vznik života. Napriek tomu tu život na úrovni prokaryotov existuje: pôvodne vznikol na mesiaci Nu a preniesli ho meteory padajúce z neho pri výmene materiálu. Tieto formy života žijú v sladkovodnom prostredí pri hladine oceánu, kde riedke organické látky interagujú so slnečným svetlom. Oceán objímajúci celý svet pokrýva hustá atmosféra z dusíka, metánu, CO2 a kyseliny dusičnej. Túto biosféru však výrazne zatienila invázia biosférickej mysle zo Satis — vybudovala si na Uat-Ure predmostie a dokonca naň zvrhla niekoľko komét a asteroidov, aby jeho globálny oceán trochu obohatila o živiny. Následky jej konania vidno z vesmíru: bioluminiscenčné oblačné lesy rozsvecujú noc a ľadové čiapky, jediná „pevnina“ tohto sveta, hostia kolónie odolnejšieho, chladu prispôsobeného života zo Satis. Pre potreby biomysle Satis je však Uat-Ur nedostatočný — je to na živiny chudobná, obria kvapka vody vo vesmíre, prinajlepšom dočasné riešenie. Biomyseľ Satis sa musela rozpínať inam.",

  "anubis": "Keby ste sa na Anubisa pozreli optikou spektroskopie, takmer by ste si mysleli, že ste našli svätý grál. Mesiac zohrievaný neúnavným slapovým stláčaním materského hnedého trpaslíka presne na teplotu kvapalnej vody, kyslíková signatúra… Aj zblízka vyzerá ako skutočná modrá guľôčka — trochu zahmlená, ale to sa pri tak malom prísune tepla od materskej hviezdy dá čakať. Ako však napovedá meno, tento mesiac nie je tým, čím sa zdá…\n\nNa rozdiel od iných svetov kedysi považovaných za podobné Zemi, ako Mars či Venuša, Anubis nesklame v tom, čo neponúka. Prísne vzaté je naozaj oceánskym svetom so skutočnými oceánmi kvapalnej vody a atmosférou bohatou na voľný kyslík. No popri troch najvnútornejších planétach Ra, ktoré sú nehostinné už len blízkosťou k svojej hviezde, patrí Anubis k najnehostinnejším terestrickým telesám sústavy Ra. Kyslík tu neznačí život, ale jeho absolútnu neprítomnosť. Aby sme pochopili prečo, musíme porozumieť príbehu jeho vývoja. Príbehu Anubisa.\n\nAnubis sa sformoval vo vonkajšej časti sústavy Ra a tam aj zostal, no jeho vývoj, tak ako pri ostatných mesiacoch Horusa,\n\n— Opis Anubisa je v zdrojovom dokumente nedokončený. —"
}
};
