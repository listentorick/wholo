import { PROOF_STRIP } from '@/content';

export function ProofStrip() {
  return (
    <div className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-wrap items-center gap-3 px-6 py-5 sm:px-8 lg:px-12">
        <span className="h-1 w-[22px] shrink-0 rounded-full bg-amber" aria-hidden />
        <p className="text-[14px] font-medium text-navy">{PROOF_STRIP.line}</p>
      </div>
    </div>
  );
}
