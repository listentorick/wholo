'use client';

import { useEffect, useRef } from 'react';
import { useMotionOK } from './MotionProvider';

/**
 * Hero choreography. The markup is server-rendered and fully visible without
 * JS; when motion is on we (a) play a one-time assemble on load and (b) add a
 * light scroll parallax as the hero leaves. No pin — the first screen never
 * feels stuck.
 *
 * Targets, set as data-attributes on the hero markup:
 *   [data-hero-stagger]  elements that rise in sequence
 *   [data-hero-shot]     the screenshot frame (parallax + assemble)
 *   [data-shot-sidebar]  the frame's dark sidebar (slides in)
 *   [data-shot-row]      the frame's content rows (cascade)
 */
export function HeroScene({ children }: { children: React.ReactNode }) {
  const motionOK = useMotionOK();
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !motionOK ||
      !scope.current ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = scope.current;
    let ctx: { revert: () => void } | undefined;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
          .from('[data-hero-stagger]', {
            y: 26,
            opacity: 0,
            filter: 'blur(8px)',
            duration: 0.8,
            stagger: 0.09,
            delay: 0.05,
          })
          .from(
            '[data-hero-shot]',
            { y: 34, opacity: 0, scale: 0.965, duration: 0.9 },
            '-=0.7',
          )
          .from('[data-shot-sidebar]', { xPercent: -110, duration: 0.6 }, '-=0.55')
          .from(
            '[data-shot-row]',
            { x: 22, opacity: 0, duration: 0.45, stagger: 0.06 },
            '-=0.4',
          );

        gsap.to('[data-hero-stagger]', {
          yPercent: -14,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 1 },
        });
        gsap.to('[data-hero-shot]', {
          yPercent: -6,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 1 },
        });
      }, el);
    })();

    return () => ctx?.revert();
  }, [motionOK]);

  return <div ref={scope}>{children}</div>;
}
