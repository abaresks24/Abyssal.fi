'use client';
import { useState, useEffect } from 'react';

function compute(w: number) {
  return {
    isMobile:  w < 768,
    isTablet:  w >= 768 && w < 1024,
    isDesktop: w >= 1024,
    width: w,
  };
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() =>
    compute(typeof window !== 'undefined' ? window.innerWidth : 1280),
  );

  useEffect(() => {
    const handler = () => setBp(compute(window.innerWidth));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return bp;
}
