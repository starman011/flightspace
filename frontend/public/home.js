// ObjectTracer /home — vanilla JS (CSP-safe: no inline, no external CDN).

// Google Analytics 4 (gtag.js) — loaded externally (CSP allows googletagmanager)
(function () {
  var GA_ID = 'G-WKM9W2VDVT';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Disable Google Signals / ad-personalization (avoids CSP-blocked ad beacons).
  window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
})();

// ── Explore dropdown: text list (left) + image preview (right) that swaps on hover
// Preview images served from images.unsplash.com (allowed in our CSP). The old
// Wikimedia thumbnail URLs return 400 (hotlink-blocked) so the preview was blank.
var UQ = '?w=900&q=80&auto=format&fit=crop';
var MEGA = {
  earth:    {t:'Flights & Ships', d:'Live aircraft and vessels on a real-time 3D Earth.', s:'https://images.unsplash.com/photo-1436491865332-7a61a109cc05' + UQ},
  iss:      {t:'ISS Tracker', d:'Live position, crew manifest and the 4K NASA stream.', s:'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa' + UQ},
  launch:   {t:'Rocket Launches', d:'Upcoming launches with live countdowns and trajectories.', s:'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2' + UQ},
  asteroid: {t:'Near-Earth Asteroids', d:'Close approaches and hazardous objects from NASA NeoWs.', s:'https://images.unsplash.com/photo-1502134249126-9f3755a50d78' + UQ},
  solar:    {t:'Solar System', d:'Real-time positions of the planets in 3D.', s:'https://images.unsplash.com/photo-1614732414444-096e5f1122d5' + UQ},
  galaxy:   {t:'Deep Space', d:'The DESI galaxy catalog and the cosmic web.', s:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564' + UQ},
  moon:     {t:'Moon', d:'Lunar surface and orbital view.', s:'https://images.unsplash.com/photo-1522030299830-16b8d3d049fe' + UQ},
  journal:  {t:'Space Journal', d:"A new astronomy image every day, from NASA's APOD.", s:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a' + UQ},
};
var megaPrev = document.getElementById('megaPrev');
var megaMeta = document.getElementById('megaMeta');
var megaLayers = {};
Object.keys(MEGA).forEach(function (k) {
  var d = document.createElement('div');
  d.className = 'img';
  d.style.backgroundImage = "url('" + MEGA[k].s + "')";
  megaPrev.insertBefore(d, megaMeta);
  megaLayers[k] = d;
});
function showMega(k) {
  Object.keys(megaLayers).forEach(function (kk) { megaLayers[kk].classList.toggle('show', kk === k); });
  megaMeta.innerHTML = '<h4>' + MEGA[k].t + '</h4><p>' + MEGA[k].d + '</p>';
}
document.querySelectorAll('.mega-list a').forEach(function (a) {
  a.addEventListener('mouseenter', function () { showMega(a.dataset.k); });
});
showMega('earth');

// JS-controlled open/close with a grace delay — robust against the hover gap
// (moving from the button down into the panel no longer closes it).
var explore = document.querySelector('.explore'), exTimer;
if (explore) {
  // Hover-to-open is bound only on devices that actually hover.
  //
  // A touch tap fires a synthetic mouseenter BEFORE click. With both bound, the
  // first tap opened the menu (mouseenter) and then immediately closed it again
  // (click toggling it back off), so it looked like the first tap did nothing —
  // and the second worked only because mouseenter no longer re-fired.
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var exBtn = explore.querySelector('button');
  // One place sets the state, so the announced state cannot drift from the
  // visible one — hovering used to open the menu while still reporting closed.
  function setOpen(open) {
    explore.classList.toggle('open', open);
    if (exBtn) exBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (canHover) {
    explore.addEventListener('mouseenter', function () { clearTimeout(exTimer); setOpen(true); });
    explore.addEventListener('mouseleave', function () { exTimer = setTimeout(function () { setOpen(false); }, 260); });
  }
  if (exBtn) {
    exBtn.setAttribute('aria-expanded', 'false');
    exBtn.addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(!explore.classList.contains('open'));
    });
  }
  document.addEventListener('click', function (e) {
    if (!explore.contains(e.target)) setOpen(false);
  });
}

// ── Reveal the hero copy ─────────────────────────────────────────────────────
// The page opens as nothing but the animation. The copy, the nav and the HUD
// notes come in on the visitor's first move — mouse, touch, key or scroll —
// staggered and soft-focused so they arrive rather than appear. The orbit
// scene holds the reveal while its intro is still playing (revealGate) and
// lets it through when the intro ends. Reduced motion shows everything at once.
var root = document.documentElement;
var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
var heroRevealed = false, revealPending = false, revealGate = null;
function revealHero() {
  if (heroRevealed) return;
  if (revealGate && !revealGate()) { revealPending = true; return; }
  heroRevealed = true;
  root.classList.remove('attract');
  document.querySelectorAll('[data-rise]').forEach(function (el, i) {
    el.style.transitionDelay = (0.25 + i * 0.14) + 's';
    el.classList.add('in');
  });
}
(function firstMove() {
  if (reduceMotion) { revealHero(); return; }
  var EVENTS = ['pointermove', 'touchstart', 'keydown', 'wheel', 'scroll'], from = null;
  function on(e) {
    // A mouse has to actually travel: browsers send pointermove for a cursor
    // that is merely resting over a page as it renders.
    if (e.type === 'pointermove' && e.pointerType === 'mouse') {
      if (!from) { from = [e.clientX, e.clientY]; return; }
      if (Math.abs(e.clientX - from[0]) + Math.abs(e.clientY - from[1]) < 6) return;
    }
    revealHero();
    if (heroRevealed || revealPending) EVENTS.forEach(function (ev) { window.removeEventListener(ev, on); });
  }
  EVENTS.forEach(function (ev) { window.addEventListener(ev, on, { passive: true }); });
})();

// ── Orbit scene: hero backdrop and scroll tour ──────────────────────────────
// One set of particles with three forms, each the right picture for what the
// headline is talking about:
//   Earth — flights, ships, rockets, the ISS, the Moon, near-Earth asteroids,
//           with one orbit per thing, ordered outward from the ground;
//   Sun   — the planets, orbiting on those same rings;
//   black hole — galaxies and deep space.
// The particles fly between forms. Every motion turns one way only (prograde):
// the intro winds the vortex forward and settles, form changes add forward
// spin, and the camera circles the other way so it never cancels it out.
//
//  - Load: the black hole assembles top-down, outer arms first; the camera
//    swoops down and it folds into Earth. Until the first mouse move the
//    scene fills the page; then it glides aside for the copy.
//  - Hero: the headline word picks the lit orbit and the form, and the lit
//    thing itself moves — the Moon visibly orbits, an asteroid swings past.
//  - Scroll: the camera flies out through the orbits one at a time, nearest
//    first, and ends pulled back past them all.
//
// The headline word, the lit orbit, the card and the step rail all follow one
// index (setActive), so they cannot disagree.
//
// Raw WebGL rather than three.js: this page is static and CSP-locked to
// 'self', and every mark in the scene is a point, so one shader and one draw
// call cover all of it. Positions are animated in the vertex shader; the CPU
// only projects a few label anchors per frame.
//
// Distances are log-compressed, and the Sun and black hole are illustrations
// — the HUD says which is on screen. Status words are per data source: only
// feeds that really are live say "Live"; a moving particle is never the claim.
var ORBITS = [
  { k: 'earth',    href: '/globe',        words: ['flights', 'ships'],      dist: '0–12 km',        st: 'Live',      live: true, src: 'ADS-B + AIS',     r: 1.17, at: -0.55, form: 'earth' },
  { k: 'launch',   href: '/launches',     words: ['rockets'],               dist: 'Ascent',         st: 'Scheduled',             src: 'Launch manifests', r: 1.44, at: -1.05, form: 'earth' },
  { k: 'iss',      href: '/iss',          words: ['the ISS', 'satellites'], dist: '~420 km',        st: 'Live',      live: true, src: 'Orbital position', r: 1.78, at: -0.15, form: 'earth' },
  { k: 'moon',     href: '/moon',         words: ['the Moon'],              dist: '384,400 km',     st: 'Computed',              src: 'Ephemeris',        r: 2.38, at: -1.75, form: 'earth' },
  { k: 'asteroid', href: '/asteroids',    words: ['asteroids'],             dist: '≤ 0.05 AU',      st: 'Daily',                 src: 'NASA NeoWs',       r: 3.05, at: 0.42,  form: 'earth' },
  { k: 'solar',    href: '/solar-system', words: ['planets'],               dist: '0.4–30 AU',      st: 'Computed',              src: 'Ephemeris',        r: 3.85, at: -0.62, form: 'sun' },
  { k: 'galaxy',   href: '/deep-space',   words: ['galaxies'],              dist: 'Billions of ly', st: 'Catalog',               src: 'DESI survey',      r: 4.85, at: 0.95,  form: 'bh' },
];
var FORMS = ['earth', 'sun', 'bh'];

(function orbitScene() {
  var reduce = reduceMotion;
  var narrowQ = window.matchMedia && matchMedia('(max-width: 860px)');
  function narrow() { return !!(narrowQ && narrowQ.matches); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); }
  var STEPS = ORBITS.length + 1;              // 0 hero, 1..7 one per orbit, 8 pulled back
  var INTRO_MS = reduce ? 0 : 4600;
  var SWIRL = 3;                              // how far the intro winds the vortex, in radians at r = 1.8
  // How much faster the lit orbit's own things move, so the Moon visibly
  // orbits and the planes visibly fly while they are the subject.
  var BOOST = [1.6, 1.0, 1.2, 3.5, 1.0, 0, 0];
  var ISS_HEAD = 1.2, ISS_W = 0.3, MOON_TH = 2.2, MOON_W = 0.1;

  // ── Headline, labels, card and rail ────────────────────────────────────────
  var SEQ = [];
  ORBITS.forEach(function (o, i) { o.words.forEach(function (w) { SEQ.push({ w: w, i: i }); }); });

  var cyc = document.getElementById('cyc');
  var labelsEl = document.getElementById('olabels');
  var railEl = document.getElementById('rail');
  var card = document.getElementById('ocard');
  var hud = document.getElementById('hud');
  var heroEl = document.querySelector('.hero');
  var footEl = document.querySelector('.foot');
  var ocN = document.getElementById('ocN'), ocS = document.getElementById('ocS'), ocT = document.getElementById('ocT');
  var ocD = document.getElementById('ocD'), ocF = document.getElementById('ocF');

  var labels = ORBITS.map(function (o, i) {
    var a = document.createElement('a');
    a.className = 'ol';
    a.href = o.href;
    a.innerHTML = '<span class="ol-eb">' + pad(i + 1) + ' · ' + o.dist + '</span>' +
      '<span class="ol-t">' + MEGA[o.k].t + '</span><span class="ol-stem"></span><span class="ol-dot"></span>';
    a.addEventListener('mouseenter', function () { hold(i); });
    a.addEventListener('focus', function () { hold(i); });
    a.addEventListener('mouseleave', release);
    a.addEventListener('blur', release);
    labelsEl.appendChild(a);
    return { el: a, w: 0, h: 0, shown: false };
  });
  var rail = ORBITS.map(function (o, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span>' + pad(i + 1) + '</span>' + MEGA[o.k].t;
    b.addEventListener('click', function () { goStep(i + 1); });
    railEl.appendChild(b);
    return b;
  });

  var active = -1, si = 0, typer, cycTimer, stage = 0;
  var held = false, paused = false;   // held: hovering a label; paused: took the cycle with the keys
  var hl = ORBITS.map(function () { return 0; }), warp = ORBITS.map(function () { return 0; }), warpGoal = warp.slice();

  function swapWord(w) {
    if (cyc.textContent === w) return;
    cyc.style.opacity = '0';
    cyc.style.transform = 'translateY(-16px)';
    setTimeout(function () {
      cyc.textContent = w;
      cyc.style.transform = 'translateY(16px)';
      requestAnimationFrame(function () {
        cyc.style.opacity = '1';
        cyc.style.transform = 'translateY(0)';
      });
    }, 340);
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    var o = ORBITS[i], m = MEGA[o.k];
    labels.forEach(function (l, j) { l.el.classList.toggle('on', j === i); });
    rail.forEach(function (b, j) { b.classList.toggle('on', j === i); });
    card.href = o.href;
    ocN.textContent = pad(i + 1) + ' / ' + o.dist;
    ocS.textContent = o.st;
    ocS.classList.toggle('live', !!o.live);
    ocT.textContent = m.t;
    ocF.textContent = o.src;
    bringIntoView(i);
    clearInterval(typer);
    if (reduce) { ocD.textContent = m.d; } else {
      var n = 0;
      ocD.textContent = '';
      typer = setInterval(function () {
        n += 2;
        ocD.textContent = m.d.slice(0, n);
        if (n >= m.d.length) clearInterval(typer);
      }, 22);
    }
    kick();
  }

  // When the ISS or the Moon becomes the subject it may be behind Earth. Run
  // it forward along its own orbit to the front, rather than waiting: always
  // forward, never back, so the motion stays consistent.
  function bringIntoView(i) {
    if (!cur || (i !== 2 && i !== 3)) return;
    var want = cur.az - Math.PI / 2 + (i === 2 ? -0.4 : -0.2);         // just left of the point nearest the camera
    var d = ((want - bodyAngle(i)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (d > 4.6) d = 0;                                                 // already just past it, still in front
    warpGoal[i] = warp[i] + d / (i === 2 ? ISS_W : MOON_W);
  }

  function step(dir) {
    si = (si + dir + SEQ.length) % SEQ.length;
    setActive(SEQ[si].i);
    swapWord(SEQ[si].w);
  }
  function showOrbit(i) {
    if (SEQ[si].i !== i) { for (var s = 0; s < SEQ.length; s++) if (SEQ[s].i === i) { si = s; break; } }
    setActive(i);
    swapWord(SEQ[si].w);
  }
  function hold(i) { if (stage >= 0.5) return; held = true; showOrbit(i); }   // in the tour, scroll decides
  function release() { held = false; syncTour(); }

  // The Sun and the black hole get a little longer per word than Earth: they
  // have one word each, and the change of form takes a moment to read.
  function scheduleCycle() {
    clearTimeout(cycTimer);
    cycTimer = setTimeout(function () {
      if (!held && !paused && !document.hidden && stage < 0.5) step(1);
      scheduleCycle();
    }, ORBITS[active].form === 'earth' ? 3000 : 4200);
  }
  setActive(0);
  scheduleCycle();

  // ── Scroll tour: one step per 60% of a screen, once the hero copy is past ──
  function stepPx() { return window.innerHeight * 0.6; }
  function tourStart() { return Math.max(0, heroEl.offsetHeight - window.innerHeight); }
  function goStep(k) { window.scrollTo({ top: tourStart() + k * stepPx(), behavior: reduce ? 'auto' : 'smooth' }); }
  function syncTour() {
    var k = Math.round(stage);
    if (held || k < 1) return;
    showOrbit(Math.min(ORBITS.length, k) - 1);
  }
  var tourOn = false;
  function onScroll() {
    stage = Math.max(0, Math.min(STEPS, (window.scrollY - tourStart()) / stepPx()));
    if (stage >= 0.5) held = false;
    if ((stage >= 0.5) !== tourOn) { tourOn = stage >= 0.5; root.classList.toggle('tour-on', tourOn); setTimeout(measureZones, 450); }
    root.classList.toggle('outro-on', stage > STEPS - 0.5);
    root.classList.toggle('scrolled', window.scrollY > 30);   // buttons, labels and card wait for the first scroll
    hud.classList.toggle('away', footEl.getBoundingClientRect().top < window.innerHeight * 0.6);
    syncTour();
    kick();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Left/right arrows walk the orbits (up/down stay page scroll); Enter opens
  // the lit one. Only when nothing else has focus, so links keep their keys.
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (dir) {
      e.preventDefault();
      if (stage < 0.5) { paused = true; step(dir); }
      else goStep(Math.max(0, Math.min(STEPS, Math.round(stage) + dir)));
    } else if (e.key === 'Enter') location.href = ORBITS[active].href;
  });

  var clock = document.getElementById('clock');
  function tick() {
    var d = new Date();
    clock.textContent = 'UTC ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  tick();
  setInterval(tick, 1000);

  // ── WebGL ──────────────────────────────────────────────────────────────────
  var stage3d = document.querySelector('.stage');
  var glowEl = document.querySelector('.glow');
  var glowLayers = [].slice.call(glowEl.children);   // earth, sun, black hole
  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  function noGL() { root.classList.add('no-gl'); root.classList.remove('intro-on'); revealGate = null; revealHero(); }
  if (!gl) { noGL(); onScroll(); return; }
  var introDone = false;
  revealGate = function () { return introDone; };

  var VS = [
    'attribute vec3 a_p; attribute vec3 a_l; attribute vec4 a_m; attribute vec3 a_w;',
    'attribute vec4 a_b; attribute vec2 a_c; attribute vec4 a_s; attribute vec2 a_d;',
    'uniform mat4 u_vp; uniform vec3 u_cam; uniform vec3 u_light; uniform vec2 u_shift;',
    'uniform float u_t; uniform float u_px; uniform float u_ref; uniform float u_intro; uniform float u_swirl;',
    'uniform float u_bh; uniform float u_sun; uniform float u_mspin;',
    'uniform float u_hl[7]; uniform float u_warp[7];',
    'varying vec3 v_c; varying float v_a;',
    'vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }',
    'vec3 orbit(float r, float th, float y) { return vec3(r * cos(th), y, -r * sin(th)); }',
    'float facing(vec3 n, vec3 p) { return dot(n, normalize(u_cam - p)); }',
    // Behind the central body, seen from the camera? A ray-sphere test per
    // point stands in for a depth buffer: nothing else here is opaque.
    'float occluded(vec3 p, float r2) {',
    '  vec3 d = p - u_cam; float a = dot(d, d), b = dot(u_cam, d), c = dot(u_cam, u_cam) - r2;',
    '  float disc = b * b - a * c; if (disc <= 0.0) return 0.0;',
    '  float t = (-b - sqrt(disc)) / a; return (t > 0.0 && t < 1.0) ? 1.0 : 0.0;',
    '}',
    'void main() {',
    '  float kind = a_m.x, size = a_m.y, lum = a_m.z, hl = 0.0, warp = 0.0;',
    '  for (int i = 0; i < 7; i++) { if (float(i) == a_m.w) { hl = u_hl[i]; warp = u_warp[i]; } }',
    '  float tt = u_t + warp;',
    '  bool star = kind > 2.5 && kind < 3.5, ringPt = kind < 0.5 && a_w.z > 0.5;',
    '  float ms = (star || ringPt) ? 0.0 : u_mspin;',
    '  vec3 pos; float vis = 1.0;',
    // ── Earth form
    '  if (star) {',
    '    pos = a_l; lum *= 0.7 + 0.3 * sin(u_t * (0.5 + a_w.z) + a_w.z * 40.0);',
    '  } else if (kind > 1.5 && kind < 2.5) {',                // 2 launch trail
    '    float s = a_p.x, u = fract(tt / 9.0 + a_p.z);',
    '    pos = orbit(1.0 + 0.44 * (1.0 - (1.0 - s) * (1.0 - s)), a_p.y + 1.5 * s * s + ms, 0.0) + a_l * s;',
    '    vis = step(s, u) * exp(-(u - s) * 5.0) * (1.0 - smoothstep(0.8, 1.0, u));',
    '    lum *= 1.0 + 2.5 * exp(-(u - s) * 80.0);',
    '  } else if (kind > 5.5) {',                              // 6 asteroid swinging past Earth on a bent path
    '    float u = a_p.x, sh = (fract(tt / 13.0 + a_p.z) - 0.5) * 15.0 - u * 1.2;',
    '    vec3 c = orbit(1.0, a_p.y, 0.0), v = normalize(vec3(-c.z, 0.16, c.x));',
    '    pos = rotY(c * (1.65 - 0.1 * sh * sh / (1.0 + 0.06 * sh * sh)) + v * sh + a_l * u, ms);',
    '    vis = 1.0 - smoothstep(4.5, 7.2, abs(sh)); lum *= 0.12 + 1.7 * exp(-u * 7.0);',
    '  } else {',                                              // 0 planar, 1 lit sphere, 4 atmosphere, 5 flare
    '    float th = a_p.y + a_w.x * tt + ms + (a_p.x > 0.0 ? u_swirl * 1.8 / max(a_p.x, 1.2) : 0.0);',
    '    vec3 l = rotY(a_l, a_w.y * tt + ms);',
    '    pos = orbit(a_p.x, th, a_p.z) + l;',
    '    if (kind > 3.5 && kind < 4.5) {',
    '      vec3 n = normalize(l);',
    '      vis = pow(1.0 - abs(facing(n, pos)), 3.0); lum *= 0.12 + max(dot(n, u_light), 0.0);',
    '    } else if (kind > 0.5 && kind < 1.5) {',
    '      vec3 n = normalize(l);',
    '      vis = smoothstep(-0.05, 0.15, facing(n, pos));',
    '      lum *= mix(a_w.z, 1.0, pow(max(dot(n, u_light), 0.0), 0.7));',
    '    } else if (kind > 4.5) {',
    '      float f = pow(max(0.0, sin(u_t * 0.5 + a_w.z * 37.0)), 40.0);',
    '      lum *= 0.2 + 7.0 * f; size *= 1.0 + 1.5 * f;',
    '    } else if (ringPt) {',
    '      lum *= 1.0 + hl * (0.5 + 1.1 * max(0.0, sin(th * 12.0 + u_t * 2.2))); size *= 1.0 + hl * 0.7;',
    '    }',
    '  }',
    // ── Black-hole form. a_c.x: 0 hidden, 1 disk orbit, 2 photon ring,
    // 3 lensed halo, 4 unchanged. The side spinning toward us is brighter.
    '  float kb = a_c.x, ks = a_d.x;',
    '  vec3 pb = pos; float lb = lum, vb = vis;',
    '  if (u_bh > 0.001 && kb < 3.5) {',
    '    lb = a_c.y; vb = 1.0;',
    '    float thb = a_b.y + a_b.w * u_t + ms + u_swirl * 1.8 / max(a_b.x, 1.2);',
    '    if (kb < 0.5) { vb = 0.0; }',
    '    else if (kb < 1.5) {',
    '      pb = orbit(a_b.x, thb, a_b.z);',
    '      lb *= 1.0 + 0.85 * dot(vec3(-sin(thb), 0.0, -cos(thb)), normalize(u_cam - pb));',
    '    } else if (kb < 2.5) {',
    '      vec3 n = normalize(a_l); pb = n * a_b.x; vb = pow(1.0 - abs(facing(n, pb)), 6.0);',
    '    } else {',                                             // light bent round the shadow: a ring facing us
    '      vec3 f = normalize(-u_cam), rt = normalize(cross(f, vec3(0.0, 1.0, 0.0))), up = cross(rt, f);',
    '      pb = (rt * cos(thb) + up * sin(thb)) * a_b.x;',
    '      lb *= 0.7 + 0.6 * cos(thb);',
    '    }',
    '  }',
    // ── Sun form. a_d.x: 0 hidden, 1 planet orbit, 2 photosphere, 3 corona,
    // 4 unchanged, 5 planet orbit plus a local offset (Saturn's rings).
    '  vec3 ps = pos; float ls = lum, vs = vis;',
    '  if (u_sun > 0.001 && (ks < 3.5 || ks > 4.5)) {',
    '    ls = a_d.y; vs = 1.0;',
    '    if (ks < 0.5) { vs = 0.0; }',
    '    else if (ks < 1.5 || ks > 4.5) {',
    '      ps = orbit(a_s.x, a_s.y + a_s.w * u_t + ms, a_s.z) + (ks > 4.5 ? a_l : vec3(0.0));',
    '    } else if (ks < 2.5) {',                               // limb darkening and a slow granulation shimmer
    '      vec3 n = rotY(a_s.xyz, 0.05 * u_t + ms); ps = n * 0.72;',
    '      float fc = facing(n, ps);',
    '      vs = smoothstep(-0.05, 0.12, fc);',
    '      ls *= (0.45 + 0.55 * fc) * (0.8 + 0.2 * sin(u_t * 2.3 + a_s.w * 60.0));',
    '    } else {',
    '      ps = rotY(a_s.xyz, 0.03 * u_t + ms);',
    '      vs = pow(1.0 - abs(facing(normalize(ps), ps)), 2.0);',
    '      ls *= 0.75 + 0.25 * sin(u_t * 1.7 + a_s.w * 40.0);',
    '    }',
    '  }',
    '  float we = max(0.0, 1.0 - u_bh - u_sun);',
    '  pos = pos * we + pb * u_bh + ps * u_sun;',
    '  lum = lum * we + lb * u_bh + ls * u_sun;',
    '  vis = vis * we + vb * u_bh + vs * u_sun;',
    '  vis *= 1.0 - occluded(pos, mix(0.97, 0.5, u_sun));',
    // Intro: outer particles first, the centre last.
    '  float thr = (1.0 - clamp(length(pos.xz) / 9.0, 0.0, 1.0)) * 0.7;',
    '  vis *= smoothstep(thr, thr + 0.3, u_intro);',
    '  gl_Position = u_vp * vec4(pos, 1.0);',
    '  gl_Position.xy += u_shift * gl_Position.w;',
    '  float ps2 = size * u_px * clamp(u_ref / gl_Position.w, 0.45, 2.4) * (1.0 + hl * 0.3);',
    '  gl_PointSize = max(ps2, 1.0);',
    '  vec3 base = vec3(1.0, 0.95, 0.86);',
    '  if (kind > 3.5 && kind < 4.5) base = mix(base, vec3(0.72, 0.84, 1.0), we);',     // a cooler atmosphere
    '  base = mix(base, vec3(1.0, 0.74, 0.40), (kb > 0.5 && kb < 3.5 ? u_bh : 0.0) * 0.85);',
    '  base = mix(base, vec3(1.0, 0.78, 0.42), ks > 1.5 && ks < 3.5 ? u_sun : 0.0);',
    // Each planet its own colour, keyed off its Sun-form orbit radius.
    '  if (ks > 0.5 && ks < 1.5 && a_s.x > 1.6) {',
    '    vec3 tint = a_s.x < 2.0 ? vec3(0.55, 0.78, 1.0) : a_s.x < 3.0 ? vec3(1.0, 0.55, 0.4) : a_s.x < 4.2 ? vec3(1.0, 0.85, 0.65)',
    '              : a_s.x < 5.2 ? vec3(1.0, 0.88, 0.55) : vec3(0.6, 0.9, 1.0);',
    '    base = mix(base, tint, u_sun);',
    '  }',
    '  v_c = mix(base, vec3(0.80, 1.0, 0.16), hl * (ringPt ? 1.0 : 0.75 * we));',
    '  v_a = lum * vis * (1.0 + hl * 0.6) * min(ps2, 1.0);',
    '}',
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'varying vec3 v_c; varying float v_a;',
    'void main() {',
    '  vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0;',
    '  if (d > 1.0) discard;',
    '  float f = 1.0 - d;',
    '  gl_FragColor = vec4(v_c * v_a * f * f, 1.0);',
    '}',
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  var prog = vs && fs && gl.createProgram();
  if (prog) { gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); }
  if (!prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) { noGL(); onScroll(); return; }
  gl.useProgram(prog);
  var U = {};
  ['u_vp', 'u_cam', 'u_light', 'u_shift', 'u_t', 'u_px', 'u_ref', 'u_intro', 'u_swirl', 'u_bh', 'u_sun', 'u_mspin', 'u_hl', 'u_warp'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  root.classList.add('intro-on', 'bh-on');

  // ── Particles ──────────────────────────────────────────────────────────────
  // Earth form: polar centre (r, θ0, y), local offset (xyz), kind, size,
  // brightness, orbit index (-1 = none), angular speed, spin, extra.
  // extra = night-side floor for lit spheres, ring flag for planar points,
  // twinkle/launch/flare phase otherwise.
  // Black-hole form: polar (r, θ0, y), angular speed, kind, brightness.
  // Sun form: four numbers (a polar orbit, or a direction and a phase), kind,
  // brightness. Particles dark in the Earth form exist only in another form.
  var STRIDE = 25, P = [];
  var seed = 20260830;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function gauss() { return (rnd() + rnd() + rnd() - 1.5) / 1.5; }
  var SAME = [4, 0, 0, 0, 0, 0], HIDE = [0, 0, 0, 0, 0, 0];
  function add(kind, r, th, y, lx, ly, lz, size, lum, orbit, w, spin, extra, b, s) {
    b = b || SAME; s = s || SAME;
    P.push(r, th, y, lx, ly, lz, kind, size, lum, orbit, w, spin, extra,
      b[1], b[2], b[3], b[4], b[0], b[5], s[1], s[2], s[3], s[4], s[0], s[5]);
  }
  function onSphere() {
    var z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), z, -s * Math.sin(a)];
  }
  var EARTH_SPIN = 0.045, TAU = Math.PI * 2;
  // The intro winds every structured shape forward by SWIRL·1.8/r and leaves
  // it there, so spirals are built pre-unwound by the same amount.
  function unwind(r) { return SWIRL * 1.8 / Math.max(r, 1.2); }
  // Black hole
  function kep(r) { return 0.8 * Math.pow(r, -1.5); }        // inner orbits turn fastest
  function disk(lum) { var rb = 1.45 + 2.3 * Math.pow(rnd(), 2.4); return [1, rb, rnd() * TAU, gauss() * 0.012 * rb, kep(rb), lum * Math.pow(1.5 / rb, 1.3) + 0.05]; }
  function keep(r, th, y, lum) { return [1, r, th, y, kep(r), lum]; }
  function halo(lum) { return [3, 1.42 + Math.abs(gauss()) * 0.14, rnd() * TAU, 0, 0.12, lum]; }
  // Sun
  function photo(lum) { var d = onSphere(); return [2, d[0], d[1], d[2], rnd(), lum]; }
  function corona(rad, lum) { var d = onSphere(); return [3, d[0] * rad, d[1] * rad, d[2] * rad, rnd(), lum]; }
  function kepS(r) { return 0.55 * Math.pow(r, -1.5); }
  // Sun-form orbit radius and point size, Mercury to Neptune. The first four
  // and the gas giants sit on the chart's rings; the asteroid belt (ring 5)
  // falls between Mars and Jupiter, where it belongs.
  var PLANETS = [[1.17, 3.0], [1.44, 4.2], [1.78, 4.5], [2.38, 3.5], [3.85, 8.2], [4.85, 7.0], [5.75, 5.2], [6.55, 5.1]];

  function build(height, q) {
    var i, j, p, u, h, k;
    // Earth: land from the topology map, ocean thinned and dimmed. In the
    // black hole these are the accretion disk; in the Sun, its surface.
    for (i = 0; i < 60000 * q; i++) {
      p = onSphere();
      h = height ? height(p) : 0.2;
      if (h > 0.035) add(1, 0, 0, 0, p[0], p[1], p[2], 1.55 + h * 1.1, 0.9 + Math.min(h, 0.6) * 1.15, -1, 0, EARTH_SPIN, 0.05, disk(1.6), photo(1.0));
      else if (rnd() < 0.2) add(1, 0, 0, 0, p[0], p[1], p[2], 1.35, 0.3, -1, 0, EARTH_SPIN, 0.03, disk(1.4), photo(1.0));
    }
    for (i = 0; i < 3000 * q; i++) {            // atmosphere, lit at the limb → photon ring → corona
      p = onSphere();
      add(4, 0, 0, 0, p[0] * 1.035, p[1] * 1.035, p[2] * 1.035, 1.4, 0.6, -1, 0, 0, 0, [2, 1.2, 0, 0, 0, 2.4], corona(0.78, 1.2));
    }
    // 01 flights over land, mostly northern mid-latitudes, and ships at sea.
    for (i = 0; i < 700 * q; i++) {
      var lat = Math.max(-60, Math.min(70, 32 + gauss() * 38)) * Math.PI / 180, lon = rnd() * TAU, rr = 1.045;
      add(1, 0, 0, 0, rr * Math.cos(lat) * Math.cos(lon), rr * Math.sin(lat), -rr * Math.cos(lat) * Math.sin(lon), 1.5, 0.6, 0, 0, EARTH_SPIN * 1.7, 0.55, halo(1.0), HIDE);
    }
    for (i = 0, j = 0; j < 520 * q && i < 40000; i++) {
      p = onSphere();
      if (Math.abs(p[1]) > 0.8 || (height && height(p) > 0.02)) continue;
      j++;
      add(1, 0, 0, 0, p[0] * 1.012, p[1] * 1.012, p[2] * 1.012, 1.3, 0.5, 0, 0, EARTH_SPIN * 1.25, 0.45, halo(0.8), HIDE);
    }
    // Black hole only: a bright photon ring hugging the shadow, and light
    // bent round it into a halo facing the camera. In the Sun the first set
    // become coronal streamers.
    for (i = 0; i < 3200 * q; i++) {
      p = onSphere();
      var cr = 0.76 + Math.pow(rnd(), 2.5) * 0.85;
      add(0, 0, 0, 0, p[0], p[1], p[2], 1.3, 0, -1, 0, 0, 0, [2, 1.12 + Math.abs(gauss()) * 0.03, 0, 0, 0, 3.2], corona(cr, 0.55 * Math.pow(0.76 / cr, 2)));
    }
    for (i = 0; i < 3600 * q; i++) {
      add(0, 0, 0, 0, 0, 0, 0, 1.2 + rnd() * 0.6, 0, -1, 0, 0, 0, [3, 1.3 + Math.pow(rnd(), 2) * 0.32, rnd() * TAU, 0, 0.1, 0.5 + rnd() * 0.9], HIDE);
    }
    // Orbit rings: evenly spaced dots, the "chart". The same in every form.
    ORBITS.forEach(function (o, oi) {
      var n = Math.round(o.r * TAU * 64 * Math.min(1, q + 0.25));
      for (j = 0; j < n; j++) add(0, o.r, j / n * TAU, 0, 0, 0, 0, 1.3, 0.42, oi, 0, 0, 1);
    });
    function stream(r, head, len, n, w, spread, orbit, headSize, sun) {
      for (j = 0; j < n; j++) {
        u = Math.pow(rnd(), 1.7);
        var sr = r + gauss() * spread * (0.3 + u * 3), sth = head - u * len, sy = gauss() * spread * 0.4 * (1 + u * 2);
        var sl = 0.2 + Math.pow(1 - u, 3) * 1.1;
        add(0, sr, sth, sy, 0, 0, 0, 1.2 + (1 - u) * 1.3, sl, orbit, w, 0, 0, keep(sr, sth, sy, sl * 1.2), sun);
      }
      add(0, r, head, 0, 0, 0, 0, headSize, 1.8, orbit, w, 0, 0, keep(r, head, 0, 1.8), sun);
    }
    // 02 launches: two ascent trails.
    for (k = 0; k < 2; k++) for (j = 0; j < 420 * q; j++) {
      var s = j / (420 * q);
      add(2, s, k * 2.4 + 0.6, k * 0.5, gauss() * 0.03, gauss() * 0.02, gauss() * 0.03, 1.5 - s * 0.4, 0.8, 1, 0, 0, 0, halo(0.8), HIDE);
    }
    // 03 low Earth orbit: a satellite belt, and the ISS as the bright head.
    for (i = 0; i < 2400 * q; i++) {
      var lr = ORBITS[2].r + gauss() * 0.07, lt = rnd() * TAU, ly = gauss() * 0.025, ll = 0.3 + rnd() * 0.3;
      add(0, lr, lt, ly, 0, 0, 0, 1.2, ll, 2, 0.09 + rnd() * 0.05, 0, 0, keep(lr, lt, ly, ll * 1.4), HIDE);
    }
    stream(ORBITS[2].r, ISS_HEAD, 1.4, 600 * q, ISS_W, 0.025, 2, 4.5, HIDE);
    // 04 the Moon: a small lit sphere riding its orbit.
    for (i = 0; i < 1100 * q; i++) { p = onSphere(); add(1, ORBITS[3].r, MOON_TH, 0, p[0] * 0.21, p[1] * 0.21, p[2] * 0.21, 1.5, 1.5, 3, MOON_W, 0, 0.06, HIDE, HIDE); }
    // 05 asteroids: a rubble belt — the main belt in the Sun form — plus two
    // near-Earth asteroids swinging past on bent paths.
    for (i = 0; i < 2800 * q; i++) {
      var br = ORBITS[4].r + (rnd() - 0.5) * 0.42 + gauss() * 0.06, bt = rnd() * TAU, by = gauss() * 0.07, bl = 0.24 + rnd() * 0.36;
      add(0, br, bt, by, 0, 0, 0, 1 + Math.pow(rnd(), 5) * 2.8, bl, 4, 0.022 + rnd() * 0.012, 0, 0, keep(br, bt, by, bl * 1.3));
    }
    stream(ORBITS[4].r - 0.05, 4.1, 2.0, 700 * q, 0.07, 0.06, 4, 3.8);
    for (k = 0; k < 2; k++) {
      for (i = 0; i < 380 * q; i++) {
        u = Math.pow(rnd(), 1.6);
        add(6, u, k ? 2.5 : 5.3, k * 0.5, gauss() * 0.04, gauss() * 0.02, gauss() * 0.04, 1.1 + (1 - u) * 2.2, 1.0, 4, 0, 0, 0, HIDE, HIDE);
      }
      add(6, 0, k ? 2.5 : 5.3, k * 0.5, 0, 0, 0, 4.5, 1.6, 4, 0, 0, 0, HIDE, HIDE);
    }
    // 06 the planets: bright points on the solar ring with faint halos; in
    // the Sun form they spread out to their own orbits, inner ones fastest,
    // and Saturn gets its rings.
    PLANETS.forEach(function (pl, pi) {
      var pth = pi / 8 * TAU + rnd() * 0.5, sth = rnd() * TAU;
      add(0, ORBITS[5].r, pth, 0, 0, 0, 0, pl[1], 1.2, 5, 0.012, 0, 0, keep(ORBITS[5].r, pth, 0, 1.2), [1, pl[0], sth, 0, kepS(pl[0]), 2.2]);
      for (j = 0; j < 30 * q; j++) {
        var hr = ORBITS[5].r + gauss() * 0.05, ht = pth + gauss() * 0.02, hy = gauss() * 0.03;
        add(0, hr, ht, hy, 0, 0, 0, 1, 0.25, 5, 0.012, 0, 0, keep(hr, ht, hy, 0.25), HIDE);
      }
      if (pi === 5) for (j = 0; j < 340 * q; j++) {
        var rr2 = 0.15 + rnd() * 0.11, ph = rnd() * TAU, tilt = 0.45;
        add(0, 0, 0, 0, rr2 * Math.cos(ph), rr2 * Math.sin(ph) * Math.sin(tilt), -rr2 * Math.sin(ph) * Math.cos(tilt), 1, 0, 5, 0, 0, 0, HIDE, [5, pl[0], sth, 0, kepS(pl[0]), 0.45]);
      }
    });
    // 07 deep space: two faint spiral arms reaching past the frame; in the
    // black hole they wind tighter into the vortex.
    for (k = 0; k < 2; k++) for (i = 0; i < 3600 * q; i++) {
      u = rnd();
      var gr = ORBITS[6].r * 0.92 * Math.exp(u * 0.8) + gauss() * 0.18 * (0.4 + u);
      var gt = k * Math.PI + Math.log(Math.max(gr, 0.5) / ORBITS[6].r) * 3.6 + gauss() * 0.06, gy = gauss() * 0.14 * (1 + u);
      var gl2 = (0.16 + rnd() * 0.32) * (1.15 - u * 0.5), gbr = gr * 0.85;
      add(0, gr, gt - unwind(gr), gy, 0, 0, 0, 1 + rnd() * 0.5, gl2, 6, 0.007, 0, 0,
          [1, gbr, gt - (gr - 4.4) * 0.45 - unwind(gbr), gy * 0.6, 0.06, gl2 * 1.4], HIDE);
    }
    // The two great arms sweeping round the centre, bright heads leading,
    // with the odd flare along them.
    function armPoint(kindA, ar, at, ay, size, lum, extra) {
      var abr = 1.5 + (ar - 1.55) * 0.55;
      add(kindA, ar, at - unwind(ar), ay, 0, 0, 0, size, lum, -1, 0.085, 0, extra,
          [1, abr, at - 0.9 * Math.log(ar / 1.55) - unwind(abr), ay * 0.5, 0.2, lum * 1.25], HIDE);
    }
    for (k = 0; k < 2; k++) {
      for (i = 0; i < 2600 * q; i++) {
        u = Math.pow(rnd(), 1.3);
        var ar = 1.55 * Math.exp(u * Math.log(8.5 / 1.55)) * (1 + gauss() * 0.05);
        armPoint(0, ar, k * Math.PI + 0.8 - 2.1 * Math.log(ar / 1.55) + gauss() * 0.03, gauss() * 0.025 * Math.sqrt(ar),
                 1.1 + 1.4 * Math.exp(-u * 6), 0.18 + 1.5 * Math.exp(-u * 4.5), 0);
      }
      for (i = 0; i < 25; i++) {
        var fr = 1.55 * Math.exp(rnd() * 0.7 * Math.log(8.5 / 1.55));
        armPoint(5, fr, k * Math.PI + 0.8 - 2.1 * Math.log(fr / 1.55), 0, 3.5, 1.0, rnd());
      }
    }
    // Plane dust and background stars belong to no orbit.
    for (i = 0; i < 5000 * q; i++) {
      var dr = 1.3 + Math.pow(rnd(), 0.7) * 8.5, dt = rnd() * TAU, dy = gauss() * 0.2, dl = 0.1 + rnd() * 0.16;
      add(0, dr, dt, dy, 0, 0, 0, 1, dl, -1, 0.01, 0, 0, keep(dr, dt, dy * 0.6, dl * 1.2));
    }
    for (i = 0; i < 1500 * q; i++) {
      p = onSphere();
      var sr = 30 + rnd() * 25;
      add(3, 0, 0, 0, p[0] * sr, p[1] * sr, p[2] * sr, 0.9 + Math.pow(rnd(), 3) * 1.8, 0.1 + Math.pow(rnd(), 2) * 0.6, -1, 0, 0, rnd());
    }
    return new Float32Array(P);
  }

  function upload(data) {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var off = 0;
    [['a_p', 3], ['a_l', 3], ['a_m', 4], ['a_w', 3], ['a_b', 4], ['a_c', 2], ['a_s', 4], ['a_d', 2]].forEach(function (a) {
      var loc = gl.getAttribLocation(prog, a[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a[1], gl.FLOAT, false, STRIDE * 4, off * 4);
      off += a[1];
    });
    return data.length / STRIDE;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  function perspective(fovy, aspect, n, f) {
    var t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
    return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
  }
  function lookAt(e) {
    var zl = Math.hypot(e[0], e[1], e[2]), z = [e[0] / zl, e[1] / zl, e[2] / zl];
    var x = [z[2], 0, -z[0]], xl = Math.hypot(x[0], x[2]); x = [x[0] / xl, 0, x[2] / xl];   // up × z, up = +Y
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  // Light from the upper right, so the dark limb faces the headline.
  var LIGHT = (function () { var v = [0.75, 0.42, 0.52], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  // One camera pose per scroll step. Attract (before the first move): Earth
  // centred and filling the page. Hero: Earth right of the copy (backing off
  // on narrower screens); phone: Earth on the bottom edge like a horizon.
  // Tour: centred, each step a little further out and further round. Last:
  // pulled far back, almost edge-on. The camera circles against the spin
  // (az decreasing), so the scene always appears to turn the same way.
  var ATTRACT = null;
  function keyset() {
    var n = narrow(), sq = clamp01((1440 - W) / 416), fov = n ? 0.8 : 0.66, K = [];
    ATTRACT = n ? { el: 0.58, dist: 9.6, sx: 0, sy: 0.02, az: 0.35, fov: fov }
                : { el: 0.3, dist: 6.3, sx: 0, sy: 0.03, az: 0.35, fov: fov };
    K.push(n ? { el: 0.8, dist: 8.2, sx: 0.05, sy: -0.82, az: 0.35, fov: fov }
             : { el: 0.34, dist: 7.2 * Math.max(1, Math.min(1.45, 1500 / W)), sx: 0.46 + sq * 0.1, sy: 0.14, az: 0.35, fov: fov });
    ORBITS.forEach(function (o, i) {
      K.push({ el: 0.24 + i * 0.045, dist: (2.9 + o.r * 2.05) * (n ? 1.3 : 1), sx: 0, sy: n ? 0.2 : 0.1, az: 0.35 - (i + 1) * 0.55, fov: fov });
    });
    K.push({ el: 0.1, dist: n ? 30 : 24, sx: 0, sy: n ? 0.08 : 0, az: 0.35 - STEPS * 0.55, fov: fov });
    return K;
  }
  function introKey() { return { el: 1.42, dist: narrow() ? 19 : 15.5, sx: 0, sy: 0, az: 0.35 + 1.3, fov: narrow() ? 0.8 : 0.66 }; }
  function mixKey(a, b, e) { var o = {}; for (var p in a) o[p] = a[p] + (b[p] - a[p]) * e; return o; }
  function camera(L) {
    var cam = [L.dist * Math.cos(L.el) * Math.sin(L.az), L.dist * Math.sin(L.el), L.dist * Math.cos(L.el) * Math.cos(L.az)];
    return { cam: cam, vp: mul(perspective(L.fov, W / H, 0.1, 200), lookAt(cam)), shift: [L.sx, L.sy],
             earthR: H / 2 / Math.tan(L.fov / 2) / L.dist };
  }

  var W = 0, H = 0, dpr = 1, count = 0, raf = 0, last = 0, t0 = 0, introStart = 0, revealAt = -1;
  var KEYS = [], ANCH = [], cur = null;
  var bh = 1, sun = 0, mspin = 0, formShown = 'bh', swirlNow = 0, tNow = 0;
  var mouse = { x: 0, y: 0 }, par = { x: 0, y: 0 };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, narrow() ? 1.5 : 1.75);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    labels.forEach(function (l) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; });
    KEYS = keyset();
    measureZones();
    onScroll();
  }

  // Labels hide wherever they would sit on the copy, the card, the rail, the
  // buttons, the nav, or behind the centre. Text rects come from Ranges, so
  // they hug the glyphs rather than the full-width blocks.
  var heroZones = [], uiZones = [];
  function measureZones() {
    heroZones = [];
    document.querySelectorAll('.hero h1, .hero .lede, .hero .pillars').forEach(function (el) {
      var rg = document.createRange();
      rg.selectNodeContents(el);
      [].forEach.call(rg.getClientRects(), function (r) { if (r.width && r.height) heroZones.push(r); });
    });
    uiZones = [];
    [card, railEl, document.querySelector('.nav'), document.querySelector('.hud-cta')].forEach(function (el) {
      var r = el && el.getBoundingClientRect();
      if (r && r.width) uiZones.push(r);
    });
    if (W && !narrow()) {
      ANCH = KEYS.map(function (K, k) { var C = camera(K); return FORMS.map(function (f) { return pickAnchors(C, k, f); }); });
    }
  }
  setInterval(measureZones, 600);   // the cycling word changes the headline's width

  // Where a label would sit for orbit i at angle th — standing on its marker,
  // or hanging from it when `down` — or null when that spot is unusable:
  // off-frame, behind the centre, on the copy or UI, or (unless `overEarth`)
  // on the central body itself.
  function labelBox(C, i, th, down, overEarth, onHero) {
    var o = ORBITS[i], l = labels[i], vp = C.vp, x = o.r * Math.cos(th), z = -o.r * Math.sin(th);
    var cw = vp[3] * x + vp[11] * z + vp[15];
    if (cw <= 0 || behindEarth(C.cam, x, z)) return null;
    var sx = ((vp[0] * x + vp[8] * z + vp[12]) / cw + C.shift[0] + 1) / 2 * W;
    var sy = (1 - ((vp[1] * x + vp[9] * z + vp[13]) / cw + C.shift[1])) / 2 * H;
    var b = { left: sx - l.w / 2, right: sx + l.w / 2, top: down ? sy : sy - l.h, bottom: down ? sy + l.h : sy };
    if (b.left < 40 || b.right > W - 40 || b.top < 92 || b.bottom > H - 52) return null;
    var ex = (C.shift[0] + 1) / 2 * W, ey = (1 - C.shift[1]) / 2 * H, er = C.earthR + 12;
    var nx = Math.max(b.left, Math.min(ex, b.right)) - ex, ny = Math.max(b.top, Math.min(ey, b.bottom)) - ey;
    if (!overEarth && nx * nx + ny * ny < er * er) return null;
    return clear(b, uiZones, 14) && (!onHero || clear(b, heroZones, 14)) ? b : null;
  }
  function clear(b, rects, padPx) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (b.left < r.right + padPx && b.right > r.left - padPx && b.top < r.bottom + padPx && b.bottom > r.top - padPx) return false;
    }
    return true;
  }
  // First standing, then hanging; first clear of the centre, then over it.
  function fitAt(C, i, th, placed, onHero, overOK) {
    for (var pass = 0; pass < (overOK ? 2 : 1); pass++) {
      for (var d = 0; d < 2; d++) {
        var b = labelBox(C, i, th, !!d, !!pass, onHero);
        if (b && clear(b, placed, 18)) return { a: th, down: !!d, over: !!pass, box: b };
      }
    }
    return null;
  }
  // Each orbit has a preferred angle; walk out from it either way until the
  // label lands in clear sky. Done per camera pose and per form, so every
  // viewport and step gets its own arrangement. On tour steps the lit orbit is
  // placed first, with angles taken from the front of the ring. The Sun and
  // the black hole label only their own orbit.
  function pickAnchors(C, k, form) {
    var out = [], placed = [], order = ORBITS.map(function (o, i) { return i; });
    if (k >= 1 && k <= ORBITS.length) { order.splice(k - 1, 1); order.unshift(k - 1); }
    if (k === STEPS) return out;
    var front = KEYS[k].az - Math.PI / 2;
    order.forEach(function (i) {
      var o = ORBITS[i];
      if (form !== 'earth' && o.form !== form) return;
      var pref = k === 0 ? o.at : front + o.at * 0.6;
      for (var pass = 0; pass < 2 && !out[i]; pass++) {
        for (var n = 0; n < 48 && !out[i]; n++) {
          var f = fitAt(C, i, pref + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.13, placed, k === 0, false);
          if (!f && pass) f = fitAt(C, i, pref + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.13, placed, k === 0, true);
          if (f) { out[i] = f; placed.push(f.box); }
        }
      }
    });
    return out;
  }
  // The ISS and the Moon carry their own label while they are lit, so the
  // name rides on the thing that is moving. Same angle formula as the shader.
  function bodyAngle(i) {
    if (i === 2) return ISS_HEAD + ISS_W * (tNow + warp[2]) + mspin + swirlNow * 1.8 / ORBITS[2].r;
    return MOON_TH + MOON_W * (tNow + warp[3]) + mspin + swirlNow * 1.8 / ORBITS[3].r;
  }
  // Labels show only while the camera rests on a step and the scene has
  // settled into one form; while either is moving they fade out.
  function placeLabels(C, s, ready) {
    var k = Math.round(s), fi = bh > 0.5 ? 2 : sun > 0.5 ? 1 : 0;
    var settled = Math.max(bh, sun, 1 - bh - sun) > 0.88;
    var rest = ready && Math.abs(s - k) < 0.28 && settled;
    var set = rest && ANCH[k] ? ANCH[k][fi] : [];
    var shown = [], order = ORBITS.map(function (o, i) { return i; });
    if (active >= 0) { order.splice(active, 1); order.unshift(active); }
    order.forEach(function (i) {
      var l = labels[i], an = set[i], b = null;
      if (rest && fi === 0 && i === active && (i === 2 || i === 3)) {
        var f = fitAt(C, i, bodyAngle(i), shown, k === 0, true);
        if (f) { an = f; b = f.box; }
      }
      if (!b && an) b = labelBox(C, i, an.a, an.down, an.over, k === 0);
      var ok = !!b && clear(b, shown, 10);
      if (ok) shown.push(b);
      if (b) {
        l.el.classList.toggle('down', an.down);
        l.el.style.transform = 'translate3d(' + b.left.toFixed(1) + 'px,' + (b.top + (an.down ? -4 : 4)).toFixed(1) + 'px,0)';
      }
      if (ok !== l.shown) { l.shown = ok; l.el.classList.toggle('show', ok); }
    });
  }
  function behindEarth(c, x, z) {
    var d = [x - c[0], -c[1], z - c[2]];
    var a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
    var disc = b * b - a * (c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - 1);
    if (disc <= 0) return false;
    var t = (-b - Math.sqrt(disc)) / a;
    return t > 0 && t < 1;
  }

  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = reduce ? 30 : (now - t0) / 1000;
    var it = INTRO_MS ? clamp01((now - introStart) / INTRO_MS) : 1;
    if (it >= 0.4 && root.classList.contains('intro-on')) root.classList.remove('intro-on');
    if (it >= 1 && !introDone) { introDone = true; if (revealPending) revealHero(); }
    if (heroRevealed && revealAt < 0) revealAt = now;
    var rv = revealAt < 0 ? 0 : reduce ? 1 : smooth(0, 1, (now - revealAt) / 1800);

    // Camera: the pose for the current scroll position, eased between steps
    // so it rests on each one, then damped so it glides rather than tracks.
    var s = reduce ? Math.round(stage) : stage, k0 = Math.min(STEPS - 1, Math.floor(s));
    var target = mixKey(k0 === 0 ? mixKey(ATTRACT, KEYS[0], rv) : KEYS[k0], KEYS[k0 + 1], smooth(0.2, 0.8, s - k0));
    if (!reduce) target.az += 0.2 * Math.sin(t * 0.04) * (1 - clamp01(s)) + par.x * 0.12;
    target.el += par.y * 0.05;
    if (it < 1) target = mixKey(introKey(), target, smooth(0.3, 1, it));
    cur = (!cur || reduce || it < 1) ? target : mixKey(cur, target, Math.min(1, dt * 4.5));
    var moving = it < 1 || (rv > 0 && rv < 1) || Math.abs(cur.az - target.az) + Math.abs(cur.dist - target.dist) + Math.abs(cur.el - target.el) > 0.002;

    // Form: black hole through the first part of the intro, then whichever
    // form the lit orbit belongs to. Changing form only ever adds spin.
    var f = it < 0.45 ? 'bh' : ORBITS[active].form, kf = reduce ? 1 : Math.min(1, dt * 1.5);
    var nb = bh + ((f === 'bh' ? 1 : 0) - bh) * kf, ns = sun + ((f === 'sun' ? 1 : 0) - sun) * kf;
    mspin += (Math.abs(nb - bh) + Math.abs(ns - sun)) * 2.6;
    if (Math.abs(nb - bh) + Math.abs(ns - sun) > 0.0005) moving = true;
    bh = nb; sun = ns;
    var shownForm = bh > 0.5 ? 'bh' : sun > 0.5 ? 'sun' : 'earth';
    if (shownForm !== formShown) {
      formShown = shownForm;
      root.classList.toggle('bh-on', shownForm === 'bh');
      root.classList.toggle('sun-on', shownForm === 'sun');
    }

    for (var i = 0; i < hl.length; i++) {
      var d = (i === active && it > 0.6 ? 1 : 0) - hl[i];
      hl[i] += d * Math.min(1, dt * 4);
      var w = i === 2 ? ISS_W : MOON_W, lag = warpGoal[i] - warp[i];
      warp[i] += dt * hl[i] * BOOST[i] + (lag > 0 ? Math.min(lag * dt * 2.5, dt * 2.2 / w) : 0);
      if (Math.abs(d) > 0.002) moving = true;
    }
    par.x += (mouse.x - par.x) * 0.04; par.y += (mouse.y - par.y) * 0.04;
    swirlNow = INTRO_MS ? SWIRL * (1 - Math.pow(1 - clamp01(it / 0.85), 3)) : SWIRL;
    tNow = t;

    var C = camera(cur);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.u_vp, false, C.vp);
    gl.uniform3fv(U.u_cam, C.cam);
    gl.uniform3fv(U.u_light, LIGHT);
    gl.uniform2fv(U.u_shift, C.shift);
    gl.uniform1f(U.u_t, t);
    gl.uniform1f(U.u_px, dpr * Math.sqrt(Math.min(H, 1100) / 900));
    gl.uniform1f(U.u_ref, cur.dist);
    gl.uniform1f(U.u_intro, INTRO_MS ? clamp01(it / 0.3) : 1);
    gl.uniform1f(U.u_swirl, swirlNow);
    gl.uniform1f(U.u_bh, bh);
    gl.uniform1f(U.u_sun, sun);
    gl.uniform1f(U.u_mspin, mspin);
    gl.uniform1fv(U.u_hl, hl);
    gl.uniform1fv(U.u_warp, warp);
    gl.drawArrays(gl.POINTS, 0, count);

    // A soft glow behind the centre, in the colour of the form on screen.
    var gr = C.earthR * (2.1 + sun * 0.5), gx = (C.shift[0] + 1) / 2 * W, gy = (1 - C.shift[1]) / 2 * H, gi = smooth(0.3, 0.8, it);
    glowEl.style.transform = 'translate(' + (gx - gr).toFixed(1) + 'px,' + (gy - gr).toFixed(1) + 'px) scale(' + (gr / 100).toFixed(3) + ')';
    glowLayers[0].style.opacity = ((1 - bh - sun) * gi).toFixed(3);
    glowLayers[1].style.opacity = (sun * gi).toFixed(3);
    glowLayers[2].style.opacity = (bh * gi).toFixed(3);

    if (!narrow()) placeLabels(C, s, it >= 1);
    if (!reduce || moving) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && count) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
    kick();
  }, { passive: true });
  // Any input during the intro fast-forwards it rather than making anyone wait.
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      var now = performance.now();
      if (introStart && now - introStart < INTRO_MS - 900) introStart = now - INTRO_MS + 900;
    }, { passive: true });
  });
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    cancelAnimationFrame(raf);
    canvas.classList.remove('on');
    noGL();
  });

  // Continents come from the topology map we already ship for the globe:
  // black ocean, grey-to-white land by elevation. If it fails, Earth is drawn
  // as an even sphere rather than not at all.
  function start(height) {
    var q = narrow() ? 0.5 : (navigator.hardwareConcurrency || 8) <= 4 ? 0.7 : 1;
    count = upload(build(height, q));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    stage3d.insertBefore(canvas, stage3d.firstChild);
    resize();
    t0 = introStart = last = performance.now();
    requestAnimationFrame(function () { canvas.classList.add('on'); glowEl.classList.add('on'); });
    kick();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  }
  var img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas'), w = 512, h = 256;
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data;
    start(function (p) {
      var lat = Math.asin(p[1]), lon = Math.atan2(-p[2], p[0]);
      var u = Math.min(w - 1, Math.floor((lon / TAU + 0.5) * w)), v = Math.min(h - 1, Math.floor((0.5 - lat / Math.PI) * h));
      return px[(v * w + u) * 4] / 255;
    });
  };
  img.onerror = function () { start(null); };
  img.src = '/earth-topology.webp';
})();
