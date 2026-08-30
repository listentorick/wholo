'use client';

import { motion, type Variants } from 'motion/react';
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
  /** stagger direct children instead of animating as one block */
  stagger?: number;
  as?: 'div' | 'li' | 'section';
}

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * In-view entrance: fade + rise + a whisper of blur. When motion is off
 * (reduced-motion / touch) it renders its children plainly — no hidden
 * initial state, no wrapper animation.
 */
export function Reveal({
  children,
  className,
  y = 22,
  x = 0,
  delay = 0,
  stagger,
  as = 'div',
}: RevealProps) {
  const motionOK = useMotionOK();

  if (!motionOK) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = motion[as];

  if (stagger) {
    const container: Variants = {
      hidden: {},
      show: { transition: { staggerChildren: stagger, delayChildren: delay } },
    };
    const item: Variants = {
      hidden: { opacity: 0, y, x, filter: 'blur(6px)' },
      show: { opacity: 1, y: 0, x: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease } },
    };
    return (
      <MotionTag
        className={className}
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      >
        {Array.isArray(children) ? (
          children.map((child, i) => (
            <motion.div key={i} variants={item}>
              {child}
            </motion.div>
          ))
        ) : (
          <motion.div variants={item}>{children}</motion.div>
        )}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={cn(className)}
      initial={{ opacity: 0, y, x, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, x: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </MotionTag>
  );
}
