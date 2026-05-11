import { useEffect, useState } from 'react';
import LightPillar from './LightPillar';
import TrueFocus from './TrueFocus';
import styles from './LoadingScreen.module.css';

const LoadingScreen = ({ duration = 10000, onDone }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration - 800);
    const doneTimer = setTimeout(() => onDone?.(), duration);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [duration, onDone]);

  return (
    <div className={`${styles.overlay}${fading ? ` ${styles.fading}` : ''}`}>
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

      <div className={styles.textWrap}>
        <TrueFocus
          sentence="Object Tracer"
          manualMode={false}
          blurAmount={5}
          borderColor="#84CC16"
          animationDuration={0.5}
          pauseBetweenAnimations={1}
        />
        <span className={styles.subtitle}>flightspace</span>
      </div>
    </div>
  );
};

export default LoadingScreen;
