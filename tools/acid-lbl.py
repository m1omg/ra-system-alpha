#!/usr/bin/env python3
"""What sulfuric-acid vapour does to the heat a hot CO2 world radiates.

A measurement, not part of the page. It exists because nobody has published
one: every Venus model leaves H2SO4 and SO3 vapour out (Venus has parts per
million of it), and a world over a sea of the acid has a hundred times Venus's
column in its air.

Clear-sky column, correlated-k in 5 cm-1 bins over 20-2500 cm-1:
  CO2   HITRAN lines (626, 636, 628), Lorentz, self-broadened, with the
        Perrin & Hartmann (1989) sub-Lorentzian far wings, cut at 120 cm-1;
        CO2-CO2 collision-induced absorption, HITRAN CIA 2024 (its 750-1120
        cm-1 gap bridged log-linearly between the edges)
  H2O   HITRAN lines, bin-mean (weak; no continuum)
  SO3   HITRAN lines, bin-mean
  H2SO4 no line list exists anywhere: its bands as smooth Gaussian envelopes
        (60 cm-1 wide at 500 K) with the ab initio intensities (NIST CCCBDB,
        B2PLYP; they match the one modern absolute measurement, Dunayevskiy
        et al. 2023, to within its own calibration), about 750 km/mol inside
        the 770-1250 cm-1 window where CO2 leaves its gaps
The column: a dry adiabat from the surface to a 200 K stratosphere. The acid
vapour is the model's own (acid.js: the Ayers slope through the 611 K boiling
point, at the model's humidity), well mixed up to where it saturates and on its
saturation curve above; at every level split into H2SO4, SO3 and H2O in the
shares their partial pressures have over the liquid at that temperature.

What it prints: the outgoing flux with the acid's H2SO4 and SO3 and without,
the water it splits into being in both -- the model counts that as water
already -- and their ratio, which is what acid.js multiplies the model's
outgoing flux by.

  pip install hitran-api numpy
  python3 tools/acid-lbl.py --data DIR      # DIR: a HAPI database with tables
                                           # CO2, H2O, SO3 and CO2-CO2_2024.cia
"""
import argparse, json, math, os, sys
import numpy as np

C2 = 1.4387769            # cm K
KB = 1.380649e-23
NA = 6.02214076e23
G_ = 6.674e-11
SIGMA = 5.670374e-8
KMMOL = 1e5 / NA          # 1 km/mol in cm/molecule

ap = argparse.ArgumentParser()
ap.add_argument('--data', required=True)
ap.add_argument('--out', default=None, help='write the grid as JSON here')
ap.add_argument('--quick', action='store_true', help='one Nephtys column only')
args = ap.parse_args()

from hapi import db_begin, getColumn, partitionSum
db_begin(args.data)

NU0, NU1, DB = 20.0, 2500.0, 5.0
NB = int(round((NU1 - NU0) / DB))
EDGES = NU0 + DB * np.arange(NB + 1)
MID = 0.5 * (EDGES[:-1] + EDGES[1:])
NF = 250                                   # fine points per bin (0.02 cm-1)
# g-points: the upper tail resolved, where the line cores are
GQ = np.array([0.05, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.98, 0.995])
GW = np.array([0.125, 0.175, 0.2, 0.2, 0.15, 0.075, 0.04, 0.0225, 0.0125])
assert abs(GW.sum() - 1) < 1e-9

def lines(table):
    c = lambda k: np.array(getColumn(table, k), dtype=float)
    d = dict(nu=c('nu'), S=c('sw'), E=c('elower'), gs=c('gamma_self'), ga=c('gamma_air'),
             n=c('n_air'), M=np.array(getColumn(table, 'molec_id')), I=np.array(getColumn(table, 'local_iso_id')))
    return d

def S_at(L, T):
    """HITRAN intensities scaled to T."""
    out = np.empty_like(L['S'])
    for (m, i) in set(zip(L['M'].tolist(), L['I'].tolist())):
        sel = (L['M'] == m) & (L['I'] == i)
        q = partitionSum(int(m), int(i), 296.0) / partitionSum(int(m), int(i), float(T))
        nu, E = L['nu'][sel], L['E'][sel]
        out[sel] = (L['S'][sel] * q * np.exp(-C2 * E / T) / np.exp(-C2 * E / 296.0)
                    * (1 - np.exp(-C2 * nu / T)) / (1 - np.exp(-C2 * nu / 296.0)))
    return out

def chi(a):
    """Perrin & Hartmann 1989 CO2 far-wing factor (296 K constants), of |nu - nu0|."""
    return np.exp(-0.0888 * np.clip(a - 3, 0, 27) - 0.026 * np.clip(a - 30, 0, 90) - 0.0232 * np.clip(a - 120, 0, None))

CO2 = lines('CO2'); H2O = lines('H2O'); SO3 = lines('SO3')
print(f'lines: CO2 {len(CO2["nu"])}, H2O {len(H2O["nu"])}, SO3 {len(SO3["nu"])}', file=sys.stderr)

NEAR = 6.0                                 # cm-1: lines this close to a bin are summed on the fine grid
def k_co2(p_atm, T):
    """CO2 cross-section per molecule, k-distribution per bin: [NB, len(GQ)].
    Lines within NEAR of the bin on its 0.02 cm-1 grid; the far wings (to 120
    cm-1), smooth across a 5 cm-1 bin, at its centre and added across it."""
    S = S_at(CO2, T)
    gam = CO2['gs'] * p_atm * (296.0 / T) ** CO2['n']
    order = np.argsort(CO2['nu']); nu, S, gam = CO2['nu'][order], S[order], gam[order]
    out = np.zeros((NB, len(GQ)))
    fine = np.linspace(0, DB, NF, endpoint=False) + DB / NF / 2
    for b in range(NB):
        x = EDGES[b] + fine
        lo, hi = np.searchsorted(nu, [EDGES[b] - NEAR, EDGES[b + 1] + NEAR])
        k = np.zeros(NF)
        if hi > lo:
            d = x[None, :] - nu[lo:hi, None]
            g = gam[lo:hi, None]
            k += (S[lo:hi, None] * g / np.pi / (d * d + g * g) * chi(np.abs(d))).sum(axis=0)
        flo, fhi = np.searchsorted(nu, [EDGES[b] - 120, EDGES[b + 1] + 120])
        far = np.r_[np.arange(flo, lo), np.arange(hi, fhi)]
        if far.size:
            d = np.abs(MID[b] - nu[far]); g = gam[far]
            k += (S[far] * g / np.pi / (d * d + g * g) * chi(d)).sum()
        out[b] = np.quantile(k, GQ)
    return out

def mean_lines(L, p_atm, T, broad='ga'):
    """Bin-mean cross-section per molecule from lines falling in each bin."""
    S = S_at(L, T)
    idx = np.clip(((L['nu'] - NU0) / DB).astype(int), 0, NB - 1)
    out = np.zeros(NB)
    np.add.at(out, idx, S)
    return out / DB

# H2SO4: (centre cm-1, km/mol), 60 cm-1 FWHM Gaussian envelopes
H2SO4_BANDS = [(883, 328), (831, 107), (1157, 91), (1136, 73), (1222, 170), (1450, 287),
               (3609, 263), (548, 35), (558, 35), (506, 36), (224, 80), (288, 81)]
def k_h2so4(scale=1.0, fwhm=60.0):
    s = fwhm / 2.3548
    out = np.zeros(NB)
    for c, km in H2SO4_BANDS:
        # the bin-mean of a normalised Gaussian: the difference of its CDF across the bin
        from math import erf
        cdf = lambda v: 0.5 * (1 + erf((v - c) / (s * math.sqrt(2))))
        for b in range(NB):
            w = cdf(EDGES[b + 1]) - cdf(EDGES[b])
            if w > 1e-12: out[b] += scale * km * KMMOL * w / DB
    return out

# CO2-CO2 CIA, HITRAN 2024: blocks of (numin, numax, npts, T) and (nu, k) rows
def load_cia(path):
    blocks, cur = [], None
    for line in open(path):
        if line[:20].strip().startswith('CO2'):
            f = line.split()
            cur = dict(T=float(f[4]), nu=[], k=[]); blocks.append(cur)
        else:
            f = line.split()
            if len(f) >= 2: cur['nu'].append(float(f[0])); cur['k'].append(float(f[1]))
    return blocks
CIA = load_cia(os.path.join(args.data, 'CO2-CO2_2024.cia'))
def k_cia(T):
    """cm^5 molecule^-2 per bin at T: each band's nearest-T block, gap bridged log-linearly."""
    out = np.zeros(NB)
    ranges = {}
    for bl in CIA:
        key = (round(min(bl['nu'])), round(max(bl['nu'])))
        ranges.setdefault(key, []).append(bl)
    for key, bls in ranges.items():
        bl = min(bls, key=lambda q: abs(q['T'] - T))
        nu, k = np.array(bl['nu']), np.array(bl['k'])
        inside = (MID >= nu.min()) & (MID <= nu.max())
        out[inside] = np.maximum(out[inside], np.interp(MID[inside], nu, np.maximum(k, 0)))
    # the 750-1120 gap: log-linear between the edges, as a floor
    a, b = np.searchsorted(MID, [750, 1120])
    ka, kb = max(out[a - 1], 1e-60), max(out[b], 1e-60)
    for j in range(a, b):
        f = (MID[j] - MID[a - 1]) / (MID[b] - MID[a - 1])
        out[j] = max(out[j], math.exp((1 - f) * math.log(ka) + f * math.log(kb)))
    return out

def planck(nu, T):
    """W m-2 sr-1 per cm-1."""
    return 1.191042e-8 * nu ** 3 / np.expm1(C2 * nu / T)

# the model's acid (acid.js): total vapour over the sea, and what it is made of.
# Over ~98.5 % acid the vapour is not the liquid's own mixture except at the
# boil: below it, it is wetter. The shares at T are those of the partial
# pressures over the liquid, a consistent set: water fitted to Gmitro &
# Vermeulen's (1964) tables, H2SO4 from Ayers et al. (1980), SO3 from the JANAF
# equilibrium H2SO4(l) = SO3 + H2O -- 41/39/20 % H2O/H2SO4/SO3 at 500 K.
def acid_psat(T): return 1.01325 * math.exp(10156 * (1 / 611 - 1 / T))          # bar
def shares(T):
    pw = math.exp(46.674 - 10145.1 / T - 3.0333 * math.log(T)) / 1e5              # bar
    ph = math.exp(16.259 - 10156.0 / T) * 1.01325                                 # bar
    ktot = math.exp(98.609 - 24250.3 / T - 9.438 * math.log(T))                    # bar^2
    ps = 0.87 * ktot / pw
    t = pw + ph + ps
    return ph / t, ps / t, pw / t
def split(ptot_bar, T):
    """H2SO4, SO3, H2O partial pressures (bar) of acid vapour ptot at T."""
    if ptot_bar <= 0: return 0.0, 0.0, 0.0
    a, b, c = shares(T)
    return a * ptot_bar, b * ptot_bar, c * ptot_bar

def column(Ts, pco2, pn2, g, RH, strat=200.0, nl=60, acid=True):
    """Levels, layer T, and per-layer columns (molecules/cm2) of CO2, H2O, SO3, H2SO4."""
    ps = pco2 + pn2
    Mbar = (pco2 * 44.01 + pn2 * 28.01) / ps
    cp = (pco2 * 950.0 + pn2 * 1040.0) / ps                 # J/kg/K near 400-500 K
    kappa = 8.314 / (Mbar / 1000) / cp
    p = np.geomspace(ps, 1e-3, nl + 1)
    T = np.maximum(Ts * (p / ps) ** kappa, strat)
    pa0 = RH * acid_psat(Ts) if acid else 0.0
    xa0 = pa0 / ps
    pm = np.sqrt(p[:-1] * p[1:]); Tm = np.sqrt(T[:-1] * T[1:]); dp = (p[:-1] - p[1:]) * 1e5
    mmol = Mbar / 1000 / NA
    ntot = dp / (g * mmol) * 1e-4                           # molecules/cm2 in each layer
    out = dict(p=pm, T=Tm, dp=dp, co2=ntot * pco2 / ps, h2o=np.zeros(nl), so3=np.zeros(nl), h2so4=np.zeros(nl),
               n=ntot, Mbar=Mbar)
    for j in range(nl):
        pa = min(xa0 * pm[j], acid_psat(Tm[j]) * (1.0 if pm[j] < ps * 0.999 else RH)) if acid else 0.0
        x, y, z = split(pa, Tm[j])
        out['h2so4'][j] = ntot[j] * x / pm[j]; out['so3'][j] = ntot[j] * y / pm[j]; out['h2o'][j] = ntot[j] * z / pm[j]
    return out

def olr(col, Ts, g, kco2_of, with_acid_gases=True, h2so4_scale=1.0):
    """Outgoing flux, W/m2, and its spectrum per bin."""
    nl = len(col['T'])
    tau = np.zeros((nl, NB, len(GQ)))
    kH = k_h2so4(h2so4_scale)
    for j in range(nl):
        pj, Tj = col['p'][j], col['T'][j]
        kc = kco2_of(pj / 1.01325, Tj)
        grey = np.zeros(NB)
        # CIA: k n^2 dz, with n the CO2 number density; dz from the layer's own column
        nco2 = pj * 1e5 * (col['co2'][j] / col['n'][j]) / (KB * Tj) * 1e-6          # cm-3
        dz = col['n'][j] / (pj * 1e5 / (KB * Tj) * 1e-6)                             # cm
        grey += k_cia(Tj) * nco2 * nco2 * dz
        if col['h2o'][j] > 0: grey += mean_lines(H2O, pj, Tj) * col['h2o'][j]
        if with_acid_gases:
            if col['so3'][j] > 0: grey += mean_lines(SO3, pj, Tj) * col['so3'][j]
            if col['h2so4'][j] > 0: grey += kH * col['h2so4'][j]
        tau[j] = kc * col['co2'][j] + grey[:, None]
    # upward flux, diffusivity 1.66, top down: t_above[j] is the transmission above level j
    D = 1.66
    t_above = np.ones((NB, len(GQ)))
    F = np.zeros((NB, len(GQ)))
    for j in range(nl - 1, -1, -1):
        t_below = t_above * np.exp(-D * tau[j])
        F += np.pi * planck(MID, col['T'][j])[:, None] * (t_above - t_below)
        t_above = t_below
    F += np.pi * planck(MID, Ts)[:, None] * t_above
    spec = (F * GW[None, :]).sum(axis=1) * DB
    return spec.sum(), spec

# the k-table: CO2 cross-sections on a (p, T) grid, interpolated in log k
PG = np.geomspace(1e-3, 60.0, 14)          # atm
TG = np.arange(150.0, 851.0, 50.0)
cache = os.path.join(args.data, 'kco2_table.npy')
if os.path.exists(cache):
    KT = np.load(cache)
else:
    KT = np.zeros((len(PG), len(TG), NB, len(GQ)))
    for a, pp in enumerate(PG):
        for b, tt in enumerate(TG):
            KT[a, b] = k_co2(pp, tt)
            print(f'k-table {a * len(TG) + b + 1}/{len(PG) * len(TG)}', file=sys.stderr, flush=True)
    np.save(cache, KT)
LK = np.log(np.maximum(KT, 1e-60))
def kco2_of(p_atm, T):
    x = np.interp(math.log(p_atm), np.log(PG), np.arange(len(PG)))
    y = np.interp(T, TG, np.arange(len(TG)))
    a0, b0 = int(min(x, len(PG) - 2)), int(min(y, len(TG) - 2))
    fx, fy = x - a0, y - b0
    l = ((1 - fx) * (1 - fy) * LK[a0, b0] + fx * (1 - fy) * LK[a0 + 1, b0]
         + (1 - fx) * fy * LK[a0, b0 + 1] + fx * fy * LK[a0 + 1, b0 + 1])
    return np.exp(l)

def case(Ts, pco2, pn2=2.0, g=12.24, RH=0.77, scale=1.0):
    col = column(Ts, pco2, pn2, g, RH)
    base, sb = olr(col, Ts, g, kco2_of, with_acid_gases=False)
    full, sf = olr(col, Ts, g, kco2_of, with_acid_gases=True, h2so4_scale=scale)
    pa = RH * acid_psat(Ts)
    x, y, z = split(pa, Ts)
    return dict(Ts=Ts, pco2=pco2, RH=RH, scale=scale, acid_bar=pa, h2so4=x, so3=y, h2o=z,
                olr_base=base, olr_acid=full, ratio=full / base,
                window_base=float(sb[(MID > 770) & (MID < 1300)].sum()),
                window_acid=float(sf[(MID > 770) & (MID < 1300)].sum()))

if args.quick:
    r = case(504.0, 11.22)
    print(json.dumps(r, indent=1))
    sys.exit(0)

rows = []
for Ts in (350.0, 425.0, 504.0, 575.0, 650.0):
    for pco2 in (1.0, 3.0, 11.22, 30.0):
        for RH in (0.05, 0.77):
            r = case(Ts, pco2, RH=RH); rows.append(r)
            print(f"Ts {Ts:5.0f}  CO2 {pco2:6.2f} bar  acid {r['acid_bar']:.3g} bar  "
                  f"OLR {r['olr_base']:7.1f} -> {r['olr_acid']:7.1f}  ratio {r['ratio']:.3f}", flush=True)
for scale in (0.3, 3.0):
    r = case(504.0, 11.22, scale=scale); rows.append(r)
    print(f"Nephtys, H2SO4 intensities x{scale}: ratio {r['ratio']:.3f}", flush=True)
if args.out:
    json.dump(rows, open(args.out, 'w'), indent=1)
