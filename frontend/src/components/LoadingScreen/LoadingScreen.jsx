import { useEffect, useMemo, useState } from 'react';
import LightPillar from './LightPillar';
import TrueFocus from './TrueFocus';
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

const LoadingScreen = ({ duration = 10000, onDone }) => {
  const [fading, setFading] = useState(false);
  const [pillarMounted, setPillarMounted] = useState(false);

  const fact = useMemo(
    () => FACTS[Math.floor(Math.random() * FACTS.length)],
    [],
  );

  useEffect(() => {
    const pillarTimer = setTimeout(() => setPillarMounted(true), 80);
    const fadeTimer   = setTimeout(() => setFading(true), duration - 800);
    const doneTimer   = setTimeout(() => onDone?.(), duration);
    return () => { clearTimeout(pillarTimer); clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [duration, onDone]);

  return (
    <div className={`${styles.overlay}${fading ? ` ${styles.fading}` : ''}`}>
      {pillarMounted && (
        <div className={styles.pillarWrap}>
          <LightPillar
            topColor="#5227FF"
            bottomColor="#FF9FFC"
            intensity={1}
            rotationSpeed={0.3}
            glowAmount={0.002}
            pillarWidth={3}
            pillarHeight={0.4}
            noiseIntensity={0.5}
            pillarRotation={25}
            interactive={false}
            mixBlendMode="screen"
            quality="high"
          />
        </div>
      )}

      <div className={styles.textWrap}>
        <TrueFocus
          sentence="Object Tracer"
          manualMode={false}
          blurAmount={5}
          borderColor="#84CC16"
          animationDuration={1.2}
          pauseBetweenAnimations={1.5}
        />
        <span className={styles.subtitle}>{fact}</span>
      </div>
    </div>
  );
};

export default LoadingScreen;
