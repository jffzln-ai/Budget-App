import { useEffect, useRef, useState } from 'react';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animates a number from its previous value to the new one, so figures that
// change after a sync or a horizon switch visibly update in place. The first
// render shows the value directly; reduced-motion users always get it directly.
export function useCountUp(value, duration = 650) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (value == null || from == null || from === value || reduceMotion()) { setShown(value); return; }
    let raf;
    const start = performance.now();
    const step = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return shown;
}
