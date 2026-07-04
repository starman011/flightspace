# ObjectTracer — 6-Month LinkedIn Strategy (Daily Posts)

**Start:** July 2026 · **Cadence:** 1 post/day · ~182 posts · **Voice:** builder-in-public

**The two engines of this strategy:**
1. **Feature showcases** — one capability of ObjectTracer, shown, not told (video/GIF > screenshot > text).
2. **Engineering deep-dives** — one real problem you solved, down to the code-level detail. You have an unusually deep bank of these (see Story Bank below); most indie projects don't. This is your differentiator on LinkedIn.

---

## Positioning

One line to repeat until people can say it for you:

> **ObjectTracer — every flying thing, on one real-time 3D globe. Planes, ships, ISS, satellites, rockets, asteroids, galaxies. Free, no login.**

Audience layers (in priority order):
1. **Engineers** (React/Three.js/Go/real-time systems) — they share deep-dives, follow builders.
2. **Aviation & space enthusiasts** — they share features, become users.
3. **Indie hackers / founders** — they follow the build-in-public arc, $0-infra story.

---

## Weekly Rhythm (repeats all 26 weeks)

| Day | Pillar | Format |
|-----|--------|--------|
| Mon | **Feature spotlight** | 20–40s screen recording + 3-line caption |
| Tue | **Engineering deep-dive** | Text post (250–400 words) + 1 code screenshot or diagram |
| Wed | **Bug story / TIL** | Short narrative: symptom → hunt → root cause → one-line fix |
| Thu | **Space/aviation education** | Fact or explainer that ObjectTracer visualizes; end with "watch it live" |
| Fri | **Build-in-public** | Metric, decision, tradeoff, or roadmap item; ask for opinions |
| Sat | **Visual** | Before/after, timelapse, cinematic globe clip; minimal text |
| Sun | **Reflection / question** | Lesson learned, open question to audience; lightest lift |

Why this works: Tue/Wed earn engineer shares, Mon/Sat/Thu earn enthusiast shares, Fri/Sun build the personal narrative that makes people follow *you* rather than the product.

---

## Month-by-Month Arc

### Month 1 — The Earth Page (the hook)
Theme: *"There are 10,000 aircraft above you right now."*
- Features: live globe, click-a-plane detail card, flight trails, airport boards, search, deep links (`/flight/:icao24`).
- Deep-dives: rendering 12K aircraft in one draw call; GPU picking; WebSocket snapshot+delta protocol; client-side interpolation between 5s updates.
- **Day 1 post is drafted below.**

### Month 2 — Real-Time Data Engineering
Theme: *"How a $0/month stack tracks the whole sky."*
- Features: live tracking lock, historical playback, social presence counters, ships layer.
- Deep-dives: Go poller → Redis hot / Postgres warm-cold tiers; bounds-based subscriptions; computing landing ETAs from raw ADS-B (haversine + bearing) instead of a $0.01/call API; camera tracking that pauses during gestures and eases back.

### Month 3 — Leaving Earth
Theme: *"Zoom out. Keep zooming."*
- Features: ISS live view + crew, launch panel + push notifications, launchpad focus, Moon scale with real orbiter ephemeris, solar system scale.
- Deep-dives: multi-scale camera architecture (earth → moon → solar → galaxy in one scene graph); Keplerian propagation from JPL Horizons; ISS stream auto-discovery scraper; texture streaming on scale entry.

### Month 4 — Deep Space & the Night Sky
Theme: *"A planetarium in a browser tab."*
- Features: 9,110-star night sky, constellations, AR point-at-sky mode, DESI galaxy point cloud, galaxy search.
- Deep-dives: Yale BSC5 in one THREE.Points draw call (magnitude→size, B-V→color shader); d3-celestial constellation data; astronomy-engine planet positions to ±1 arcmin; DeviceOrientation AR on iOS.

### Month 5 — Performance & Craft
Theme: *"Making it feel instant."*
- Features: mobile bottom sheet, PWA install, haptics, red-close design system, bento greet page.
- Deep-dives: the perf audit that found 16MB of dead boot downloads; deferring 9.5MB of textures; React.lazy chunking; **the display:none bug that restarted CSS animations** (great Wed story: "my feed kept opening by itself"); mobile 3-state sheet with native touch listeners.

### Month 6 — Growth, SEO & the Road Ahead
Theme: *"From side project to product."*
- Features: shareable deep links, OG image generation at the edge, blog, admin panel with inbound email.
- Deep-dives: SPA SEO (prerendered route HTML, JSON-LD, dynamic meta); the Resend restricted-API-key incident; Vercel "functions must be plain .js" gotcha; what 6 months of daily shipping taught you.
- Final week: retrospective series + "what's next" roadmap → convert followers to waitlist/users.

---

## Post Anatomy (both pillars)

**Feature post:**
1. Hook line — a number or a dare ("Click any plane over the Atlantic. I'll wait.")
2. 2–3 lines: what it does, why it's hard/rare.
3. Media: screen recording, portrait-cropped for mobile feed.
4. CTA: link **in first comment** (LinkedIn suppresses posts with external links in body). "Live at objecttracer.com — free, no login."

**Engineering deep-dive:**
1. Hook — the problem stated as tension ("Every visitor was downloading the Moon. 3.6MB of it. Nobody visited the Moon.")
2. Constraints — why the obvious fix wasn't available ($0 budget, free tiers, 60fps target, mobile).
3. The hunt — 2–4 short paragraphs, real detail: file names, numbers, dead ends. Detail is the credibility.
4. The fix — small code screenshot (carbon.now.sh or IDE), before/after numbers.
5. One transferable lesson.
6. Question to readers ("How would you have solved it?").

**Hook formulas that fit this product:**
- Number + impossibility: "12,000 aircraft. One draw call. 60fps on a phone."
- Confession: "I shipped a bug where the UI opened itself. Twice."
- Money: "FlightAware wanted $0.01/call. I computed ETAs from data I already had. $0."
- Scale jump: "This page renders things 2.5 million light-years apart."

---

## Engineering Story Bank (40 posts of material — all real, from the repo)

Rendering & 3D
1. 12K aircraft as THREE.InstancedMesh — one draw call, per-instance color.
2. GPU color-picking: render IDs to a buffer, read the pixel under the cursor — pixel-perfect clicks; kdbush screen-space fallback for far zoom.
3. Continuous screen-space aircraft scaling (planes stay ~14–18px at any altitude).
4. Multi-scale scene graph: earth/moon/solar/galaxy coexisting, `show()`/`hide()` + camera tweens.
5. Night sky: 9,110 stars, one Points draw call, magnitude→size and B-V→color in the shader.
6. Milky Way skybox from ESO's 800MP panorama, downscaled to 200KB.
7. Moon: 4K NASA albedo reused as its own bump map — texture-cost-free relief.
8. Aircraft trails + 24h archived playback with a timeline scrubber.
9. DESI galaxies: 3.2MB pre-baked point cloud, lazy-loaded on scale entry.
10. AR sky mode: DeviceOrientation → camera quaternion, iOS permission dance.

Real-time systems
11. WebSocket protocol: full snapshot on connect, deltas after — and why.
12. Viewport-bounds subscriptions — only stream what the camera sees.
13. Client-side interpolation between 5s server ticks.
14. Stale-aircraft lifecycle: fade at 60s, remove at 120s.
15. Redis (hot, TTL 30s) / Postgres (warm 24h / cold compressed) data tiers.
16. "X people watching this flight" — anonymous presence counters over WS.
17. Camera tracking lock: pause on user gesture, ease back with cubic tween.
18. ISS live stream auto-discovery: YouTube scraper + keyword validation.
19. Lunar orbiters: JPL Horizons ephemeris → Keplerian propagator, 60s polling.
20. Landing ETA from raw ADS-B (haversine + bearing + ground speed) — $0 vs paid APIs.

Bugs & debugging war stories
21. **display:none restarts CSS animations** — the feed that opened itself (root-cause narrative).
22. The 256px ghost: a CSS variable for a deleted sidebar kept offsetting panels.
23. Resend 401: send keys can't read — the dual-API-key fix.
24. Vercel silently doesn't compile .jsx edge functions.
25. Mobile locate button vs footer FAB — the overlap matrix of 10 bottom-anchored elements.
26. The 3s auto-re-expand timer that made the feed "haunted" (first fix), and why the second bug looked identical but wasn't.
27. Cross-scale flyTo glitch: flying to a launchpad while orbiting the Moon.

Performance
28. The audit: 16MB of boot downloads nobody used (5.6MB muted audio, 9.5MB hidden textures, 505KB unreferenced logo).
29. `audio.preload='none'` — one line, 5.6MB saved.
30. Deferring planet textures to first scale entry — queue thunks, flush on show().
31. React.lazy for 9 page components — what actually got smaller and what didn't.
32. Why the 250KB JS budget is impossible with three.js — and how to budget around a 3D core.
33. Recompressing hero JPEGs: q48, zero visible loss, 55% smaller (show crops).

Product & infra
34. $0/month architecture: Railway + Cloudflare Pages + Neon + Upstash free tiers, and the graceful-degradation rules.
35. SPA SEO: prerendered route HTML + JSON-LD + dynamic OG images from an edge function.
36. Anonymous-first: full product, zero login walls — and what it costs you.
37. Push notifications for rocket launches (service worker, T-30 and T-5).
38. PWA install prompt that waits 30s and respects dismissal for 30 days.
39. Admin panel with inbound email via Resend — reply to users without leaving the app.
40. Design system by attribute selector: every `[aria-label="Close"]` is red.

---

## First Week, Drafted

**Day 1 (Mon) — Earth page feature.**
> Right now, there are ~10,000 aircraft in the sky.
>
> I built a page where you can see every one of them — live, on a 3D globe, in your browser. Click any plane: route, altitude, speed, aircraft photo, even how many other people are watching it with you.
>
> No app. No login. No ads.
>
> It's called ObjectTracer. This month I'll show you what it does — and every Tuesday I'll break down one hard engineering problem behind it, in detail.
>
> [40s screen recording: globe spin → zoom to your city → click a plane → detail card]
>
> (link in comments)

**Day 2 (Tue) — deep-dive:** 12,000 aircraft, one draw call (story #1). End with: "Tomorrow: the bug that made this UI open itself."
**Day 3 (Wed) — bug story:** the haunted feed, part 1 (story #26).
**Day 4 (Thu) — education:** why planes fly great-circle routes — show a real trail curving on the globe.
**Day 5 (Fri) — build-in-public:** the $0/month stack diagram (story #34). Ask: "what would you have paid for?"
**Day 6 (Sat) — visual:** timelapse of Atlantic traffic at dawn, 10s loop, one line of text.
**Day 7 (Sun) — reflection:** "Why I'm building a flight tracker in a world that has Flightradar24." Positioning post — minimalism, free, the whole sky not just planes.

---

## Operating Rules

- **Batch:** write Mon–Sun on Sunday (2h). Record all clips in one 30-min session.
- **Links in first comment**, never the body. Tag nothing; hashtags max 3 (#buildinpublic #threejs #aviation — rotate).
- **Reply to every comment within 2h of posting** (first 90 min decide reach).
- **Repurpose:** every Tue deep-dive → dev.to/Hashnode article after 1 week; every Sat clip → YouTube Short/X.
- **Metrics that matter:** follower growth/week, profile→site clicks (UTM `?ref=li`), DMs from engineers. Vanity: impressions. Review every Friday, adjust the *next* week's mix (double down on whichever pillar outperformed).
- **Sustainability valve:** if a day slips, drop Thu or Sun first — never Tue (the deep-dive is the franchise).
- **Content source:** task.md history, git log, specs/research-log.md, and claude-mem observations are your archive — every past bug is a future post. Keep writing them down as they happen.

## Success Criteria (review at month 3 and 6)

- M3: a Tue deep-dive with 50+ reactions; 500+ new followers; measurable LinkedIn referral traffic in analytics.
- M6: 2,000+ followers; deep-dives regularly shared by engineers you don't know; waitlist/DAU lift attributable to `?ref=li`.
