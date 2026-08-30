import { CONFIRMATION } from '@/content';
import { Icon } from '../ui/Icon';

/** Post-submit state, shown in place of the form. */
export function RegisterConfirmation() {
  return (
    <div className="flex flex-col gap-5 rounded-lg bg-white p-8 text-navy sm:p-10">
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#E7F6EC]">
        <Icon name="check" strokeWidth={2.6} className="h-6 w-6 text-success" />
      </div>
      <div className="flex flex-col gap-2.5">
        <h3 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em]">
          {CONFIRMATION.heading}
        </h3>
        <p className="text-[16px] text-muted">{CONFIRMATION.body}</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-muted">
          {CONFIRMATION.stepsLabel}
        </p>
        {CONFIRMATION.steps.map((step, i) => (
          <div key={step} className="flex gap-3">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-canvas text-[12px] font-bold text-navy">
              {i + 1}
            </span>
            <p className="min-w-0 text-[14.5px] text-muted">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
