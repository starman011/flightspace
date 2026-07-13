# ObjectTracer Design Guideline

The UI's guiding language: Apple's design principles (clarity, deference,
depth) applied to a dark, real-time 3D instrument. Derived from Apple's Human
Interface Guidelines and the design audit of 2026-07; the shipped token system
in `frontend/src/styles/tokens.css` is the source of truth for values.

References: Apple HIG (developer.apple.com/design/human-interface-guidelines),
github.com/dickwu/apple-design-skill (reviewed 2026-07-13; principles adopted,
agent files not imported).

---

## 1. The three pillars (project constitution for UI)

1. **Recurring rounded edge** - exactly four radii, fixed roles, never ad hoc:
   - `--r-pill` (9999) controls: buttons, chips, toggles, pills
   - `--r-card` (22px) containers: panels, sheets, cards
   - `--r-inset` (14px) elements nested inside a card
   - `--r-tight` (10px) small controls, logo chips, avatars
   - Caveat learned in production: never TRANSITION between 9999px and a card
     radius - the tween renders round almost the whole way. Use a fixed sane
     radius (e.g. 18px on a 36px chip) when a shape must morph.

2. **Minimalism, readability, visibility**
   - Three ink weights only: primary `#e9f1f8`, secondary ~56% alpha,
     caption ~34% alpha. If text needs a fourth weight, the hierarchy is wrong.
   - Reading surfaces (feed, blog, detail card) earn MORE opacity than
     controls; readability beats glass purity.
   - One accent means one thing: lime `#b2ff1a` = live/interactive.
     Ice `#c3f5ff` appears only inside the accent gradient.
   - No emoji anywhere in UI; minimalist SVG icons only.

3. **Apple glass (Liquid-glass materials)**
   - One recipe everywhere: fill `rgba(13,19,28,.72)` (nested tiles .55),
     `blur(20px) saturate(150%)`, hairline border, one shadow.
   - Signature: the gloss top rim (`--glass-gloss`, 16% white border-top) on
     every floating surface - it echoes the app icon's glass lip and makes
     unrelated components read as one family.
   - Glass must never harm legibility: content on glass keeps the 4.5:1
     contrast floor (see 3).

## 2. Apple principles, applied here

- **Clarity**: the globe is the content; chrome floats above it as islands
  and never boxes it in. Every island answers "what do I control?" at a
  glance - label the active state, not everything.
- **Deference**: UI yields to content. When a card or sheet is up, secondary
  chrome (locate, footer, telemetry readouts) dims to ~18-25%, blurs 2px, and
  drops BENEATH the surface in z-order. It returns the moment the surface
  closes. Nothing floats on top of an active card.
- **Depth**: layers are real. Fixed z-bands: globe (0) < command overlay (25)
  < nav pills (70) < panels/sheets (200) < page overlays (4000+) < system
  toasts. New components pick a band; they do not invent new numbers between
  bands.

## 3. Hard accessibility floors (from Apple HIG, non-negotiable)

- Touch targets >= 44x44px on mobile, >= 24px pointer targets on desktop.
- Body text contrast >= 4.5:1 against its actual (glass) background.
- Visible keyboard focus on interactive elements.
- `prefers-reduced-motion` respected for decorative animation.
- Every interactive element has an accessible name (`aria-label` doubles as
  our styling contract - e.g. `[aria-label="Close"]` is the red-cross hook).

## 4. Motion rules (learned the hard way; treat as law)

- **Compositor-only for continuous motion**: drags and follows animate
  `transform`/`opacity` ONLY. Never animate layout properties (`max-height`,
  `width`, `top`) per frame - that reflows and repaints blurred surfaces and
  is exactly what "sluggish" means.
- **Never toggle the `animation` or `display` properties to hide/show a
  surface** - restoring them REPLAYS keyframes from zero (the haunted-feed and
  card-jerk bug class). Hide with `visibility` or opacity; disable entry
  animations permanently once interaction begins.
- **Sheets**: fixed-height layer + translateY states; content in an inner
  scroller sized to the visible portion (content-aware, capped). One gesture
  language everywhere: track the finger 1:1, flick moves ONE state in the
  flick's direction, slow drags settle to the nearest snap.
- **Entrances**: one orchestrated moment (spring scale from the origin
  element) beats scattered effects. Elements that "come from" a control grow
  out of its corner (transform-origin at the anchor) and shrink back into it.
- To animate to auto-height, use the `grid-template-rows: 0fr -> 1fr` morph.

## 5. Navigation & platform conventions

- Mobile: primary navigation is reachable at screen edges; sheets pull from
  the bottom with a visible grab handle; the hamburger opens a labeled
  VERTICAL menu (depth), not an icon strip.
- Desktop: hover states exist (lift + tint), tooltips on icon-only controls.
- Deference on landing: anything promotional (nudges, banners) shows once,
  big enough to read, then collapses to a compact affordance - never blocks
  the content it promotes, and never fires while another modal owns the
  screen.

## 6. Copy rules

- Sentence case; active voice; controls say what they do ("Go Live", not
  "Submit"). An action keeps its name through the flow.
- No em-dashes in blog/content surfaces; prefer commas, colons or periods.
- Errors say what happened and how to fix it; empty states invite the next
  action ("First engineering post lands soon.").

## 7. Review checklist (before shipping UI)

1. Radii from the four roles only? No new blur/fill/shadow values?
2. Gloss rim present on new floating surfaces?
3. Text >= 4.5:1 on its real background? Targets >= 44px mobile?
4. Continuous motion transform/opacity only? No animation/display toggles?
5. Does secondary chrome defer (dim + sink) when a surface covers it?
6. Dark canvas intact - no pure white surfaces, no untinted grays?
7. Emoji absent; icons SVG; `aria-label` on icon buttons?
8. Mobile check at 390x844 (constitution Art. XI).
