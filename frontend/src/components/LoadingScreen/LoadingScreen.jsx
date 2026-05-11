import { useEffect, useMemo, useState } from 'react';
import styles from './LoadingScreen.module.css';

const FACTS = [
  'A place to track everything.',
  'The ISS orbits Earth every 90 minutes.',
  'Light from the Sun takes 8 minutes to reach Earth.',
  'There are more stars than grains of sand on all Earth\'s beaches.',
  'A day on Venus is longer than a year on Venus.',
  'Neutron stars can spin 700 times per second.',
  'The Milky Way will collide with Andromeda in 4.5 billion years.',
  'Sound cannot travel through space — it is completely silent.',
  'One million Earths could fit inside the Sun.',
  'The footprints on the Moon will last 100 million years.',
  'Saturn\'s rings are mostly water ice, some as thin as 10 metres.',
  'Voyager 1 left our solar system in 2012 — still transmitting.',
  'A teaspoon of neutron star matter weighs a billion tonnes.',
  'The universe is about 13.8 billion years old.',
  'Space begins 100 km above Earth — the Kármán line.',
];

const LoadingScreen = ({ duration = 2500, onDone }) => {
  const [fading, setFading] = useState(false);

  const fact = useMemo(
    () => FACTS[Math.floor(Math.random() * FACTS.length)],
    [],
  );

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
