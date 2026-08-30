import Script from 'next/script';

/**
 * Self-hosted Plausible, proxied first-party through this origin
 * (see next.config.ts rewrites). Rendered only when the build enabled it
 * (`PLAUSIBLE_ENABLED=1`), so local/:local builds ship no analytics.
 *
 * The queue stub lets `track()` (lib/analytics.ts) call `window.plausible`
 * before the script finishes loading.
 */
export function Analytics() {
  if (process.env.PLAUSIBLE_ENABLED !== '1') return null;
  const domain = process.env.PLAUSIBLE_DOMAIN || 'stocdup.com';

  return (
    <>
      <Script
        defer
        data-domain={domain}
        data-api="/api/event"
        src="/js/script.js"
        strategy="afterInteractive"
      />
      <Script id="plausible-queue" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}`}
      </Script>
    </>
  );
}
