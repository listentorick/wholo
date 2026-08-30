import { PROOF_STRIP } from '@/content';

export function ProofStrip() {
  return (
    <div className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-wrap flex-wrap items-center gap-x-10 gap-y-3.5 px-6 py-6 sm:px-8 lg:px-12">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
          {PROOF_STRIP.label}
        </span>
        {PROOF_STRIP.items.map((item) => (
          <span key={item} className="flex min-w-0 items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-success" aria-hidden />
            <span className="min-w-0 text-[14px] font-medium text-navy">{item}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
