// ObjectTracer /home — vanilla JS (CSP-safe: no inline, no external CDN).

// ── Explore dropdown: text list (left) + image preview (right) that swaps on hover
var MEGA = {
  earth:    {t:'Flights & Ships', d:'Live aircraft and vessels on a real-time 3D Earth.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/800px-The_Earth_seen_from_Apollo_17.jpg'},
  iss:      {t:'ISS Tracker', d:'Live position, crew manifest and the 4K NASA stream.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/800px-International_Space_Station_after_undocking_of_STS-132.jpg'},
  launch:   {t:'Rocket Launches', d:'Upcoming launches with live countdowns and trajectories.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Ariane_5ES_with_ATV_4_on_its_way_to_ELA-3.jpg/800px-Ariane_5ES_with_ATV_4_on_its_way_to_ELA-3.jpg'},
  asteroid: {t:'Near-Earth Asteroids', d:'Close approaches and hazardous objects from NASA NeoWs.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Asteroid_Vesta.jpg/800px-Asteroid_Vesta.jpg'},
  solar:    {t:'Solar System', d:'Real-time positions of the planets in 3D.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Solar_sys8.jpg/800px-Solar_sys8.jpg'},
  galaxy:   {t:'Deep Space', d:'The DESI galaxy catalog and the cosmic web.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/NGC_4414_%28NASA-med%29.jpg/800px-NGC_4414_%28NASA-med%29.jpg'},
  moon:     {t:'Moon', d:'Lunar surface and orbital view.', s:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/800px-FullMoon2010.jpg'},
  journal:  {t:'Space Journal', d:"A new astronomy image every day, from NASA's APOD.", s:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Pillars_of_Creation_%282014%29.jpg/800px-Pillars_of_Creation_%282014%29.jpg'},
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
var FALLBACK = [
  { u: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Pillars_of_Creation_%282014%29.jpg/1024px-Pillars_of_Creation_%282014%29.jpg', t: 'Pillars of Creation' },
  { u: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Carina_Nebula.jpg/1024px-Carina_Nebula.jpg', t: 'Carina Nebula' },
  { u: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/1024px-The_Earth_seen_from_Apollo_17.jpg', t: 'Earth · Apollo 17' },
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
