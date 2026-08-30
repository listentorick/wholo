'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { NAV_LINKS } from '@/content';
import { Wordmark } from './Wordmark';
import { Cta } from '../ui/Cta';
import { Icon } from '../ui/Icon';

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm transition-[box-shadow,border-color] duration-300',
        scrolled ? 'border-border shadow-[0_10px_30px_-18px_rgba(11,29,58,0.28)]' : 'border-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-wrap items-center justify-between gap-3 px-4 transition-[height] duration-300 sm:px-8 lg:px-12',
          scrolled ? 'h-14 lg:h-[68px]' : 'h-16 lg:h-[84px]',
        )}
      >
        <a
          href="#top"
          aria-label="Stocdup, back to top"
          onClick={() => setOpen(false)}
          className="min-w-0 shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Wordmark markSize={34} textClassName="text-[20px]" className="lg:hidden" />
          <Wordmark markSize={56} textClassName="text-[32px]" className="hidden lg:inline-flex" />
        </a>

        {/* Desktop */}
        <div className="hidden items-center gap-8 lg:flex">
          <nav className="flex items-center gap-7 text-[15px] font-medium text-navy">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <Cta section="nav" />
        </div>

        {/* Mobile */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Cta section="nav-mobile" label="Register" className="px-3 py-2 text-[13px]" />
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 rounded-md p-1.5 text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name={open ? 'close' : 'menu'} strokeWidth={2} />
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border bg-white px-4 py-3 sm:px-8 lg:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-3 text-[16px] font-medium text-navy hover:bg-canvas"
            >
              {l.label}
            </a>
          ))}
          <Cta section="nav-menu" className="mt-2 w-full" />
        </nav>
      )}
    </header>
  );
}
