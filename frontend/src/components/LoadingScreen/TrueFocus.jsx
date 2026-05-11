import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import './TrueFocus.css';

const TrueFocus = ({
  sentence = 'True Focus',
  separator = ' ',
  manualMode = false,
  blurAmount = 5,
  borderColor = 'green',
  glowColor = 'rgba(0, 255, 0, 0.6)',
  animationDuration = 0.5,
  pauseBetweenAnimations = 1,
}) => {
  const words = sentence.split(separator);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastActiveIndex, setLastActiveIndex] = useState(null);
  const containerRef = useRef(null);
  const wordRefs = useRef([]);
  const mountedRef = useRef(true);
  const [focusRect, setFocusRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Auto-cycle — simple index increment, no rect work here
  useEffect(() => {
    if (manualMode) return;
    const interval = setInterval(() => {
      if (mountedRef.current) setCurrentIndex(prev => (prev + 1) % words.length);
    }, (animationDuration + pauseBetweenAnimations) * 1000);
    return () => clearInterval(interval);
  }, [manualMode, animationDuration, pauseBetweenAnimations, words.length]);

  // Rect computed here — useLayoutEffect runs sync before paint,
  // so no layout reflow jank and no visible jump from stale position
  useLayoutEffect(() => {
    if (!wordRefs.current[currentIndex] || !containerRef.current) return;
    const parentRect = containerRef.current.getBoundingClientRect();
    const activeRect = wordRefs.current[currentIndex].getBoundingClientRect();
    setFocusRect({
      x: activeRect.left - parentRect.left,
      y: activeRect.top - parentRect.top,
      width: activeRect.width,
      height: activeRect.height,
    });
    if (!frameReady) setFrameReady(true);
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseEnter = index => {
    if (manualMode) { setLastActiveIndex(index); setCurrentIndex(index); }
  };
  const handleMouseLeave = () => {
    if (manualMode && lastActiveIndex !== null) setCurrentIndex(lastActiveIndex);
  };

  return (
    <div className="focus-container" ref={containerRef}>
      {words.map((word, index) => {
        const isActive = index === currentIndex;
        return (
          <span
            key={index}
            ref={el => (wordRefs.current[index] = el)}
            className={`focus-word ${manualMode ? 'manual' : ''} ${isActive && !manualMode ? 'active' : ''}`}
            style={{
              filter: isActive ? 'blur(0px)' : `blur(${blurAmount}px)`,
              '--border-color': borderColor,
              '--glow-color': glowColor,
              transition: `filter ${animationDuration}s ease-out`,
            }}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
          >
            {word}
          </span>
        );
      })}

      {/* tween + easeOut matches the CSS blur timing exactly — no spring overshoot */}
      <motion.div
        className="focus-frame"
        animate={{
          x: focusRect.x,
          y: focusRect.y,
          opacity: frameReady ? 1 : 0,
        }}
        transition={{
          x:       { type: 'tween', duration: animationDuration, ease: 'easeOut' },
          y:       { type: 'tween', duration: animationDuration, ease: 'easeOut' },
          opacity: { type: 'tween', duration: animationDuration * 0.5, ease: 'easeOut' },
        }}
        style={{
          width: focusRect.width,
          height: focusRect.height,
          '--border-color': borderColor,
          '--glow-color': glowColor,
        }}
      >
        <span className="corner top-left" />
        <span className="corner top-right" />
        <span className="corner bottom-left" />
        <span className="corner bottom-right" />
      </motion.div>
    </div>
  );
};

export default TrueFocus;
