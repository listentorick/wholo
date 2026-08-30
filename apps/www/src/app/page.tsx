import Image from 'next/image';

/**
 * Holding page — replaced by the full landing page in the next change.
 * Exists so the deploy pipeline (image build -> Helm -> Traefik -> Cloudflare)
 * can be proven end to end against www.stocdup.com.
 */
export default function HoldingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-navy px-6 text-center text-white">
      <div className="flex items-center gap-3">
        <Image src="/logo-mark.png" alt="" width={48} height={48} priority className="h-12 w-12" />
        <span className="text-3xl font-extrabold tracking-[-0.045em]">
          stocd<span className="text-primary">up</span>
        </span>
      </div>

      <h1 className="mt-10 text-4xl font-extrabold uppercase leading-[0.95] tracking-display sm:text-6xl">
        Sell more.
        <br />
        <span className="bg-amber px-[0.12em] text-amber-fg">Run smoother.</span>
      </h1>

      <p className="mt-6 max-w-md text-base text-on-navy-muted">
        The UK-native wholesale platform for independent food and drink
        distributors. Full site landing shortly.
      </p>

      <p className="mt-10 flex items-center gap-2 text-sm text-on-navy-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
        Built for UK wholesale
      </p>
    </main>
  );
}
