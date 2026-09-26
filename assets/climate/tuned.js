// Written by tools/climate-tune.mjs -- one knob per described world, set so it
// holds its documented temperature at its documented orbit, and the outgassing
// that keeps its carbon cycle balanced there. Do not edit by hand; re-run the
// tool after changing a profile.
export const TUNED = {
 "ra": {
  "set": {
   "landAlbedo": 0.437773,
   "outgassing": 0.10929
  },
  "nephtys": {
   "co2Bar": 10.6757
  },
  "satis": {
   "co2Bar": 0.00618764,
   "outgassing": 1.97049,
   "biosphere": 1.40765
  },
  "uatur": {
   "h2Bar": 2.68567,
   "n2Bar": 1.27433,
   "outgassing": 1.10693,
   "biosphere": 0.327459
  },
  "shu": {
   "h2Bar": 6.71478
  },
  "yamm": {
   "internalHeat": 0.0500166
  },
  "kauket": {
   "internalHeat": 0.00100904
  },
  "nu": {
   "iceAlbedo": 0.332734
  },
  "naunet": {
   "iceAlbedo": 0.373125
  },
  "anubis": {
   "internalHeat": 285.313,
   "outgassing": 0.0457684,
   "reducedGas": 0.119159
  },
  "khonsu": {
   "internalHeat": 48.3024
  },
  "nut": {
   "iceAlbedo": 0.497969
  }
 },
 "sol": {
  "pluto": {
   "iceAlbedo": 0.534687
  },
  "triton": {
   "iceAlbedo": 0.69625
  }
 }
};
