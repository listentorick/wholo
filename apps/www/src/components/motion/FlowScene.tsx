'use client';

import { useEffect, useRef } from 'react';
import { useMotionOK } from './MotionProvider';

/**
 * Connected-flow rail: the line draws left to right and the numbered nodes
 * pop as it reaches them, scrubbed to scroll. Static markup renders first.
 *
 * Targets:
 *   [data-flow-line]  the horizontal rail (scaleX 0 -> 1, origin left)
 *   [data-flow-node]  each numbered step
 */
export function FlowScene({ children }: { children: React.ReactNode }) {
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
        const line = el.querySelector<HTMLElement>('[data-flow-line]');
        const nodes = gsap.utils.toArray<HTMLElement>('[data-flow-node]');
        if (!nodes.length) return;

        gsap.set(line, { transformOrigin: 'left center' });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: 'top 78%',
            end: 'top 32%',
            scrub: 0.8,
          },
        });

        if (line) tl.from(line, { scaleX: 0, ease: 'none' }, 0);
        tl.from(
          nodes,
          { opacity: 0, scale: 0.6, y: 8, stagger: 0.5, ease: 'back.out(2)' },
          0.05,
        );
      }, el);
    })();

    return () => ctx?.revert();
  }, [motionOK]);

  return <div ref={scope}>{children}</div>;
}
