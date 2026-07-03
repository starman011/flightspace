# Website Performance Audit — 2026-07-03

Scope: production build output (`vite build`), public asset payloads, load timing
of heavy resources, code-splitting state. Constitution reference: Article IV.

## Headline numbers

| Payload | Size | Loaded when |
|---------|------|-------------|
| JS total (gzip) | ~547 KB (three 139 + globe 204 + index 107 + vendor 97) | boot |
| CSS (gzip) | ~42 KB single file | boot |
| Solar/moon textures | ~9.9 MB (moon.jpg alone 3.6 MB) | **boot (eager)** |
| ambient-space.mp3 | 5.6 MB | **boot (eager, muted by default)** |
| desi-galaxies.json | 3.2 MB | galaxy scale only (correctly lazy) |
| logo-full.svg | 505 KB | never — unreferenced |

A first-time visitor who only looks at flights downloads ~16 MB of assets they
never see or hear. That, not JS, is the dominant problem.

## Findings, prioritized

### P1 — multi-MB wins, low effort

1. **Ambient audio downloads at boot.** `useAmbientAudio.js` constructs
   `new Audio('/ambient-space.mp3')` on mount; default `preload` fetches the
   full 5.6 MB even though sound is muted by default. Fix: `audio.preload =
   'none'` — `play()` triggers the fetch when the user actually unmutes.
2. **Moon texture (3.6 MB) loads at Globe mount.** `createMoonScene` is called
   during scene init (Globe.jsx:1650) and eagerly `loader.load`s the 4K
   moon.jpg. Fix: defer the texture load until the first transition to moon
   scale (material already supports late `map` assignment), and/or downscale
   4K→2K (~900 KB) — the scene brief says "crisp limb at close range", 2K is
   still fine at typical distances.
3. **All planet textures (~6 MB) load at Globe mount.** `createSolarSystem`
   loads sun/venus/mercury/mars/jupiter/saturn/etc. textures during init even
   though the solar group starts hidden. The material code already assigns
   `mat.map` asynchronously — gating the `loader.load` calls on first
   solar-scale entry is a contained change.
4. **Delete `public/logo-full.svg`** — 505 KB auto-traced vector, referenced
   nowhere (index.html uses `/api/og` for og:image and favicon-512 for logo).

### P2 — JS/code splitting

5. **Zero `React.lazy` in the app.** AdminPage, PlanesPage, FlightPage,
   BlogPage, StaticPages, LaunchPanel, DeepSpacePanel + SolarMap,
   GalaxyConeView all ship in the boot bundle (index: 107 KB gz). Route-level
   lazy() with Suspense would cut the boot chunk meaningfully and splits their
   CSS automatically.
6. **Material Symbols loads the full variable font** (~300 KB). Google Fonts
   supports `&icon_names=` subsetting; needs an inventory of used glyphs and
   breaks silently when a new icon is added — do only with a lint/check step.

### P3 — image + budget hygiene

7. Hero photos (night-sky.jpg 584 KB, flight-sky.jpg 584 KB, boy-sky.jpg
   440 KB) → WebP at ~150–200 KB each, `loading="lazy"` where below the fold.
8. **Constitution Article IV budget is unreachable as written** (JS gz hard
   limit 250 KB) — three.js + globe alone are 343 KB gz and are the product.
   Either amend the budget to exempt the 3D core or set the budget on the
   non-3D remainder (index + vendor ≈ 204 KB gz, which CAN meet 150 KB with
   finding #5).

## Suggested order

1 → 4 → 2 → 3 (asset wins first), then 5, then 7; 6 and the Article IV
amendment as separate decisions.
