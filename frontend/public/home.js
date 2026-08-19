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
  explore.addEventListener('mouseenter', function () { clearTimeout(exTimer); explore.classList.add('open'); });
  explore.addEventListener('mouseleave', function () { exTimer = setTimeout(function () { explore.classList.remove('open'); }, 260); });
  var exBtn = explore.querySelector('button');
  if (exBtn) exBtn.addEventListener('click', function (e) { e.preventDefault(); explore.classList.toggle('open'); });
  document.addEventListener('click', function (e) { if (!explore.contains(e.target)) explore.classList.remove('open'); });
}

// ── Headline word-cycler: shows the breadth of what we track
var WORDS = ['flights', 'ships', 'the ISS', 'satellites', 'rockets', 'asteroids', 'galaxies'];
var wi = 0, cyc = document.getElementById('cyc');
setInterval(function () {
  wi = (wi + 1) % WORDS.length;
  cyc.style.opacity = '0';
  cyc.style.transform = 'translateY(-16px)';
  setTimeout(function () {
    cyc.textContent = WORDS[wi];
    cyc.style.transform = 'translateY(16px)';
    requestAnimationFrame(function () {
      cyc.style.opacity = '1';
      cyc.style.transform = 'translateY(0)';
    });
  }, 340);
}, 2000);

// ── Cycling wallpaper — fast: small image_url first, preload next, crossfade
// Wallpaper shown until the live APOD set loads. Unsplash (CSP-allowed) — the
// old Wikimedia URLs 400'd, leaving the hero black on first paint.
var WQ = '?w=1920&q=80&auto=format&fit=crop';
var FALLBACK = [
  { u: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564' + WQ, t: 'The Milky Way' },
  { u: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a' + WQ, t: 'A field of stars' },
  { u: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa' + WQ, t: 'Earth from orbit' },
];
var imgs = FALLBACK, idx = 0, showA = true;
var A = document.getElementById('wallA'), B = document.getElementById('wallB'), credit = document.getElementById('credit');
function urlOf(p) { return p.u || p.image_url || p.hd_image_url; }   // image_url = smaller/faster
function paint(el, url, cb) { var im = new Image(); im.onload = cb; im.onerror = cb; im.src = url; el.style.backgroundImage = "url('" + url + "')"; }
function first(p) { paint(A, urlOf(p), function () { A.classList.add('on'); }); credit.textContent = p.t || p.title || 'NASA APOD'; }
function cross(p) {
  var url = urlOf(p), next = showA ? B : A, cur = showA ? A : B;
  paint(next, url, function () { next.classList.add('on'); cur.classList.remove('on'); showA = !showA; });
  credit.textContent = p.t || p.title || 'NASA APOD';
}
first(imgs[0]);
setInterval(function () { idx = (idx + 1) % imgs.length; cross(imgs[idx]); }, 7000);

// Upgrade to the live, server-rotated featured set
fetch('https://api.objecttracer.com/api/v1/blog/featured')
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (d) {
    var ps = ((d && d.posts) || []).filter(function (p) { return p.media_type === 'image' && (p.image_url || p.hd_image_url); });
    if (ps.length) { imgs = ps; idx = 0; first(ps[0]); }
  })
  .catch(function () {});

// ── Reveal-on-load (CSS transition, staggered)
window.addEventListener('load', function () {
  document.querySelectorAll('[data-rise]').forEach(function (el, i) {
    el.style.transitionDelay = (i * 0.11) + 's';
    el.classList.add('in');
  });
});
