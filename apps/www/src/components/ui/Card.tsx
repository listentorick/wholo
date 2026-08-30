'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** Flat container: white, 8px radius, hairline border. Lifts a touch on hover. */
export function Card({
  children,
  className,
  as = 'div',
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
  interactive?: boolean;
}) {
  const MotionTag = as === 'li' ? motion.li : motion.div;
  return (
    <MotionTag
      className={cn('rounded-lg border border-border bg-white p-7', className)}
      whileHover={
        interactive
          ? { y: -4, borderColor: 'rgba(21,101,255,0.35)', boxShadow: '0 18px 40px -22px rgba(11,29,58,0.28)' }
          : undefined
      }
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      {children}
    </MotionTag>
  );
}
