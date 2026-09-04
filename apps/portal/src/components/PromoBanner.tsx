import clsx from 'clsx';

interface PromoBannerProps {
  eyebrow?: React.ReactNode;
  headline: React.ReactNode;
  body?: React.ReactNode;
  cta?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Deep-navy promotional card — the marketing site's "band" treatment (bold
 * uppercase headline, second line picked out with a solid amber
 * `box-decoration-clone` highlight) ported into the portal. Content is
 * caller-supplied so each instance can carry its own copy while sharing the
 * one visual style; see `MerchandisingBand` (portal home) and
 * `DistributorNotFound` (404) for the two current instances.
 */
export function PromoBanner({ eyebrow, headline, body, cta, className, style }: PromoBannerProps) {
  return (
    <section className={clsx('relative overflow-hidden rounded-lg bg-navy p-6 sm:p-7', className)} style={style}>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-highlight/25 blur-2xl"
      />
      {eyebrow && (
        <p className="relative flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-on-navy-muted">
          <span aria-hidden className="h-1 w-[22px] rounded-full bg-amber" />
          {eyebrow}
        </p>
      )}
      <h2
        className={clsx(
          'relative text-[28px] font-extrabold uppercase leading-[0.98] tracking-[-0.02em] text-on-navy sm:text-[38px]',
          eyebrow && 'mt-3.5',
        )}
      >
        {headline}
      </h2>
      {body && (
        <p className="relative mt-3.5 max-w-sm text-sm leading-relaxed text-on-navy-muted">{body}</p>
      )}
      {cta && <div className="relative mt-4">{cta}</div>}
    </section>
  );
}
