'use client';

import { useRouter } from 'next/navigation';

interface Props {
  backLabel: string;
  backHref: string;
  title: string;
}

export function PageSubHeader({ backLabel, backHref, title }: Props) {
  const router = useRouter();
  return (
    <div className="w-full border-b border-[#E5E7EB] flex items-center justify-between px-4 py-2.5 flex-shrink-0 bg-white">
      <button
        className="flex items-center gap-1 text-xs text-[#9CA3AF] tracking-wide"
        onClick={() => router.push(backHref)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {backLabel}
      </button>
      <span className="text-sm font-medium text-[#1A1A1A]">{title}</span>
    </div>
  );
}
