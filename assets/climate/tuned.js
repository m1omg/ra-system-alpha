// Written by tools/climate-tune.mjs -- one knob per described world, set so it
// holds its documented temperature at its documented orbit, and the outgassing
// that keeps its carbon cycle balanced there. Do not edit by hand; re-run the
// tool after changing a profile.
export const TUNED = {
 "ra": {
  "set": {
   "landAlbedo": 0.437773,
   "outgassing": 0.511133
  },
  "nephtys": {
   "co2Bar": 11.3579
  },
  "satis": {
   "co2Bar": 0.00618764,
   "outgassing": 1.97049,
   "biosphere": 1.40765
  },
  "uatur": {
   "h2Bar": 4.87488,
   "outgassing": 0.774623
  },
  "shu": {
   "h2Bar": 4.69805
  },
  "yamm": {
   "internalHeat": 0.0500166
  },
  "kauket": {
   "internalHeat": 0.000999834
  },
  "nu": {
   "internalHeat": 25.0187
  },
  "naunet": {
   "iceAlbedo": 0.373125
  },
  "anubis": {
   "h2Bar": 8.03692,
   "outgassing": 1.31202
  },
  "khonsu": {
   "internalHeat": 48.3024
  },
  "nut": {
   "iceAlbedo": 0.497969
  },
  "sekhmet": {
   "internalHeat": 1618.02
  }
 },
 "sol": {}
};
