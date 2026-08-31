'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const MotionOKContext = createContext(true);

/** True when rich motion should run: user has not asked to reduce it and this is not a coarse pointer. */
export function useMotionOK(): boolean {
  return useContext(MotionOKContext);
}

function computeMotionOK(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return !reduced && !coarse;
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  // SSR + first paint assume motion is on (same DOM either way); the effect corrects it.
  const [motionOK, setMotionOK] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionOK(computeMotionOK());
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!motionOK) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import('lenis'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
      });

      lenis.on('scroll', ScrollTrigger.update);
      const raf = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);

      // Layout can shift as fonts/images settle.
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('load', refresh);
      const t = window.setTimeout(refresh, 600);

      cleanup = () => {
        window.removeEventListener('load', refresh);
        window.clearTimeout(t);
        gsap.ticker.remove(raf);
        lenis.destroy();
        ScrollTrigger.getAll().forEach((s) => s.kill());
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [motionOK]);

  return (
    <MotionOKContext.Provider value={motionOK}>{children}</MotionOKContext.Provider>
  );
}
