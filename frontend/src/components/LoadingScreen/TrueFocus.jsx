import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const indexRef = useRef(0);
  const [focusRect, setFocusRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [frameReady, setFrameReady] = useState(false);

  const computeRect = useCallback((index) => {
    if (!wordRefs.current[index] || !containerRef.current) return null;
    const parentRect = containerRef.current.getBoundingClientRect();
    const activeRect = wordRefs.current[index].getBoundingClientRect();
    return {
      x: activeRect.left - parentRect.left,
      y: activeRect.top - parentRect.top,
      width: activeRect.width,
      height: activeRect.height,
    };
  }, []);

  // Batch rect + index update together so new motion.div key sees correct initial position
  const goToIndex = useCallback((next) => {
    const rect = computeRect(next);
    if (rect) setFocusRect(rect);
    indexRef.current = next;
    setCurrentIndex(next);
  }, [computeRect]);

  // Initial rect — sync before first paint
  useLayoutEffect(() => {
    const rect = computeRect(0);
    if (rect) { setFocusRect(rect); setFrameReady(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cycle — use indexRef to avoid stale closure in interval
  useEffect(() => {
    if (manualMode) return;
    const interval = setInterval(() => {
      goToIndex((indexRef.current + 1) % words.length);
    }, (animationDuration + pauseBetweenAnimations) * 1000);
    return () => clearInterval(interval);
  }, [manualMode, animationDuration, pauseBetweenAnimations, words.length, goToIndex]);

  const handleMouseEnter = index => {
    if (manualMode) { setLastActiveIndex(index); goToIndex(index); }
  };
  const handleMouseLeave = () => {
    if (manualMode && lastActiveIndex !== null) goToIndex(lastActiveIndex);
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
              transition: `filter ${animationDuration}s ease`,
            }}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
          >
            {word}
          </span>
        );
      })}

      {/*
        key={currentIndex} → remount on each word so frame appears at correct
        position immediately (no cross-word travel). width/height in style (not
        animate) so corners never collapse to a square.
      */}
      <motion.div
        key={currentIndex}
        className="focus-frame"
        initial={{ opacity: 0 }}
        animate={{ opacity: frameReady ? 1 : 0 }}
        transition={{ opacity: { duration: animationDuration * 0.7, ease: 'easeOut' } }}
        style={{
          x: focusRect.x,
          y: focusRect.y,
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
