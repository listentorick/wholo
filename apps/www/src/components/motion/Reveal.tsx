'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useMotionOK } from './MotionProvider';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** vertical travel in px */
  y?: number;
  /** horizontal travel in px */
  x?: number;
  delay?: number;
  /** stagger direct children (seconds between each) */
  stagger?: number;
  as?: 'div' | 'li' | 'section' | 'ul';
}

type Phase = 'ssr' | 'hidden' | 'shown';

/**
 * In-view entrance: fade + rise + a whisper of blur, done with a CSS
 * transition + one IntersectionObserver (no animation library).
 *
 * - Server render and no-JS: children are visible, unstyled.
 * - Motion off (reduced-motion / touch): visible immediately.
 * - Above the fold on load: shown at once, no reveal (avoids a flash).
 * - Below the fold: hidden, then transitions in when scrolled to.
 */
export function Reveal({
  children,
  className,
  y = 22,
  x = 0,
  delay = 0,
  stagger,
  as: Tag = 'div',
}: RevealProps) {
  const motionOK = useMotionOK();
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>('ssr');

  useEffect(() => {
    const el = ref.current;
    if (!motionOK || !el) {
      setPhase('shown');
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setPhase('shown');
      return;
    }
    setPhase('hidden');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPhase('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motionOK]);

  const style = {
    '--reveal-x': `${x}px`,
    '--reveal-y': `${y}px`,
    '--reveal-delay': `${delay}s`,
    '--reveal-stagger': stagger ? `${stagger}s` : undefined,
  } as React.CSSProperties;

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-reveal={phase === 'ssr' ? undefined : phase}
      data-reveal-stagger={stagger ? '' : undefined}
      className={cn(className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
