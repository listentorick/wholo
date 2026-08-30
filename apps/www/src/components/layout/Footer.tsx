import { FOOTER } from '@/content';
import { Wordmark } from './Wordmark';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-navy">
      <div className="mx-auto max-w-wrap px-6 pb-9 pt-12 sm:px-8 lg:px-12 lg:pt-[52px]">
        <Wordmark tone="light" markSize={44} textClassName="text-[26px]" />

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.09] pt-6">
          <span className="text-[13px] text-on-navy-dim">{FOOTER.tagline}</span>
          <nav className="flex flex-wrap gap-6 text-[14px]">
            {FOOTER.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-on-navy-soft transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <p className="mt-6 text-[12.5px] text-[#6B7A94]">{FOOTER.legal}</p>
      </div>
    </footer>
  );
}
