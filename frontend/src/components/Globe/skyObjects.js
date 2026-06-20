// Curated "familiar" sky objects for labelling. RA/Dec in J2000 degrees.
// priority: lower = more famous (shown first when decluttering).
// kind: 'star' | 'dso' (deep-sky object) | 'constellation'
export const SKY_OBJECTS = [
  // ── Brightest / most famous stars ──
  { name: 'Sirius',     ra: 101.287, dec: -16.716, kind: 'star', priority: 1 },
  { name: 'Canopus',    ra: 95.988,  dec: -52.696, kind: 'star', priority: 2 },
  { name: 'Arcturus',   ra: 213.915, dec: 19.182,  kind: 'star', priority: 3 },
  { name: 'Vega',       ra: 279.234, dec: 38.784,  kind: 'star', priority: 3 },
  { name: 'Capella',    ra: 79.172,  dec: 45.998,  kind: 'star', priority: 4 },
  { name: 'Rigel',      ra: 78.634,  dec: -8.202,  kind: 'star', priority: 4 },
  { name: 'Procyon',    ra: 114.825, dec: 5.225,   kind: 'star', priority: 4 },
  { name: 'Betelgeuse', ra: 88.793,  dec: 7.407,   kind: 'star', priority: 3 },
  { name: 'Altair',     ra: 297.696, dec: 8.868,   kind: 'star', priority: 4 },
  { name: 'Aldebaran',  ra: 68.980,  dec: 16.509,  kind: 'star', priority: 4 },
  { name: 'Antares',    ra: 247.352, dec: -26.432, kind: 'star', priority: 4 },
  { name: 'Spica',      ra: 201.298, dec: -11.161, kind: 'star', priority: 5 },
  { name: 'Pollux',     ra: 116.329, dec: 28.026,  kind: 'star', priority: 5 },
  { name: 'Deneb',      ra: 310.358, dec: 45.280,  kind: 'star', priority: 4 },
  { name: 'Regulus',    ra: 152.093, dec: 11.967,  kind: 'star', priority: 5 },
  { name: 'Polaris',    ra: 37.954,  dec: 89.264,  kind: 'star', priority: 2 },
  { name: 'Fomalhaut',  ra: 344.413, dec: -29.622, kind: 'star', priority: 5 },
  // ── Famous deep-sky objects ──
  { name: 'Andromeda Galaxy (M31)', ra: 10.685, dec: 41.269, kind: 'dso', priority: 1 },
  { name: 'Orion Nebula (M42)',     ra: 83.822, dec: -5.391, kind: 'dso', priority: 1 },
  { name: 'Pleiades (M45)',         ra: 56.601, dec: 24.114, kind: 'dso', priority: 2 },
  { name: 'Triangulum Galaxy (M33)',ra: 23.462, dec: 30.660, kind: 'dso', priority: 4 },
  { name: 'Whirlpool Galaxy (M51)', ra: 202.470, dec: 47.195, kind: 'dso', priority: 5 },
  { name: 'Crab Nebula (M1)',       ra: 83.633, dec: 22.014, kind: 'dso', priority: 5 },
  { name: 'Hercules Cluster (M13)', ra: 250.423, dec: 36.460, kind: 'dso', priority: 5 },
  { name: 'Lagoon Nebula (M8)',     ra: 270.924, dec: -24.387,kind: 'dso', priority: 6 },
  { name: 'Galactic Center',        ra: 266.417, dec: -29.008,kind: 'dso', priority: 3 },
  // ── Constellation anchors (label at a representative point) ──
  { name: 'Orion',          ra: 83.0,  dec: 0.0,    kind: 'constellation', priority: 2 },
  { name: 'Ursa Major',     ra: 165.0, dec: 56.0,   kind: 'constellation', priority: 3 },
  { name: 'Cassiopeia',     ra: 15.0,  dec: 60.0,   kind: 'constellation', priority: 4 },
  { name: 'Scorpius',       ra: 245.0, dec: -26.0,  kind: 'constellation', priority: 3 },
  { name: 'Cygnus',         ra: 305.0, dec: 42.0,   kind: 'constellation', priority: 4 },
  { name: 'Leo',            ra: 160.0, dec: 18.0,   kind: 'constellation', priority: 4 },
  { name: 'Crux (Southern Cross)', ra: 187.0, dec: -59.0, kind: 'constellation', priority: 3 },
]
