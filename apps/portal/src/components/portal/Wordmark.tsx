import clsx from 'clsx';

/**
 * The Stocdup lockup — hexagon mark + "stocd**up**" with "up" in Cobalt.
 * `font-extrabold` / `-0.045em` tracking, matching `apps/www`'s `Wordmark.tsx`
 * and the login screen. Previously inlined in `NavigationSidebar`; extracted
 * here now that the top bar and footer both carry it.
 */
export function Wordmark({
  markSize = 28,
  textClassName = 'text-lg',
  className,
}: {
  markSize?: number;
  textClassName?: string;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/stocdup-logo-only.png"
        alt=""
        width={markSize}
        height={markSize}
        className="flex-shrink-0"
        draggable={false}
      />
      <span className={clsx('font-extrabold leading-none tracking-[-0.045em] text-text', textClassName)}>
        stocd<span className="text-primary">up</span>
      </span>
    </span>
  );
}
