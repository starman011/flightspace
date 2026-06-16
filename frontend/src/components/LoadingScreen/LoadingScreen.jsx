import { useEffect, useMemo, useState } from 'react';
import styles from './LoadingScreen.module.css';

const FACTS = [
  'A place to track everything.',

  // ── Aviation ──────────────────────────────────────────────
  'Over 100,000 flights take off around the world every single day.',
  'Commercial jets cruise at about 35,000 ft — roughly 10.7 km up.',
  'ADS-B lets an aircraft broadcast its GPS position about twice a second.',
  'A transponder code of 7700 means a general emergency on board.',
  'At any moment, around 10,000 aircraft are airborne worldwide.',
  'The Boeing 747 was nicknamed the "Queen of the Skies" for 50 years.',
  'Contrails are just water vapour freezing in the thin, cold air at altitude.',
  'The longest non-stop flight covers nearly 15,000 km in one go.',
  'An aircraft\'s ICAO24 is a unique 24-bit address — its digital fingerprint.',
  'Cruising winds can push a jet past 1,000 km/h over the ground.',

  // ── Maritime ──────────────────────────────────────────────
  'AIS lets ships broadcast their position so they can avoid collisions.',
  'The largest container ships carry over 24,000 containers at once.',
  'About 90% of everything you own travelled to you by sea.',
  'Sound travels about four times faster in water than in air.',
  'The Mariana Trench is deeper than Mount Everest is tall.',

  // ── Satellites & the ISS ──────────────────────────────────
  'The ISS orbits Earth every 90 minutes, at about 28,000 km/h.',
  'Astronauts on the ISS see 16 sunrises and sunsets every day.',
  'The ISS is about the size of a football field — the biggest thing we\'ve built in space.',
  'Thousands of active satellites are circling Earth right now.',
  'GPS satellites orbit ~20,200 km up — and account for relativity to stay accurate.',
  'Geostationary satellites sit 35,786 km up, appearing fixed in the sky.',
  'Starlink satellites orbit low — around 550 km above the surface.',
  'The Hubble Space Telescope orbits Earth at roughly 540 km.',
  'Satellites are tracked using "two-line element" sets — TLEs.',

  // ── Rockets & launches ────────────────────────────────────
  'Reaching orbit means going sideways at nearly 7.8 km/s — about 28,000 km/h.',
  'It took the Apollo astronauts about three days to reach the Moon.',
  'A rocket must shed almost 90% of its mass as fuel just to reach orbit.',
  'The Saturn V remains the most powerful rocket ever flown.',
  'Reusable boosters can land themselves upright after launch.',

  // ── Asteroids & comets ────────────────────────────────────
  'Asteroid close approaches are measured in "lunar distances".',
  'One lunar distance is about 384,400 km — the Earth–Moon gap.',
  'Most shooting stars burn up 75–100 km above the ground.',
  'Halley\'s Comet swings by about every 76 years — next in 2061.',
  'NASA tracks tens of thousands of near-Earth objects.',

  // ── Solar system ──────────────────────────────────────────
  'Light from the Sun takes about 8 minutes to reach Earth.',
  'Light takes just 1.3 seconds to travel from the Moon to Earth.',
  'The Sun holds 99.8% of all the mass in the solar system.',
  'One million Earths could fit inside the Sun.',
  'Jupiter is so large that about 1,300 Earths could fit inside it.',
  'A day on Venus is longer than a whole year on Venus.',
  'Mars has Olympus Mons — a volcano nearly 22 km tall.',
  'Saturn is so light it would float in a big enough bath of water.',
  'Mercury and Venus are the only planets with no moons.',
  'Pluto takes 248 Earth years to orbit the Sun just once.',
  'One astronomical unit — the Earth–Sun distance — is about 150 million km.',
  'The footprints on the Moon could last 100 million years.',
  'Saturn\'s rings are mostly water ice, some bands only ~10 m thick.',

  // ── Deep space & the universe ─────────────────────────────
  'There are more stars than grains of sand on all of Earth\'s beaches.',
  'The observable universe may hold around 2 trillion galaxies.',
  'The Milky Way will merge with Andromeda in about 4.5 billion years.',
  'Sound can\'t travel through space — it\'s completely silent out there.',
  'Neutron stars can spin over 700 times every second.',
  'A teaspoon of neutron-star matter would weigh about a billion tonnes.',
  'The universe is roughly 13.8 billion years old.',
  'Time runs measurably slower near a black hole\'s immense gravity.',
  'Voyager 1 is over 24 billion km away — and still sending data home.',
  'Voyager 1 left the solar system in 2012, the first craft to do so.',
  'The Parker Solar Probe hit ~690,000 km/h — the fastest human-made object.',

  // ── Earth ─────────────────────────────────────────────────
  'Space begins about 100 km up — the Kármán line.',
  'Earth\'s atmosphere has no hard edge; it just fades into space.',
  'A bolt of lightning is several times hotter than the Sun\'s surface.',
];

const PREV_KEY = 'fs_load_fact';

function pickFact() {
  let i = Math.floor(Math.random() * FACTS.length);
  try {
    const prev = Number(sessionStorage.getItem(PREV_KEY));
    // Skip index 0 ("A place to track everything") on repeat loads, and never
    // show the same fact twice in a row.
    let guard = 0;
    while (FACTS.length > 1 && (i === prev) && guard++ < 12) {
      i = Math.floor(Math.random() * FACTS.length);
    }
    sessionStorage.setItem(PREV_KEY, String(i));
  } catch (_) { /* sessionStorage unavailable — plain random */ }
  return FACTS[i];
}

const LoadingScreen = ({ duration = 2500, onDone }) => {
  const [fading, setFading] = useState(false);

  const fact = useMemo(() => pickFact(), []);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration - 800);
    const doneTimer = setTimeout(() => onDone?.(), duration);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [duration, onDone]);

  return (
    <div className={`${styles.overlay}${fading ? ` ${styles.fading}` : ''}`}>
      <div className={styles.center}>
        <div className={styles.logoWrap}>
          <div className={styles.ring} />
          <div className={styles.dot} />
        </div>
        <p className={styles.appName}>Object Tracer</p>
        <p className={styles.fact}>{fact}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
