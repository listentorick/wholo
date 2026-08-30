import { cn } from '@/lib/cn';

type Variant = 'default' | 'hero' | 'catalogue' | 'runs';

interface ScreenshotFrameProps {
  tab: string;
  label: string;
  variant?: Variant;
  className?: string;
  elevated?: boolean;
}

const Bar = ({ tab }: { tab: string }) => (
  <div className="flex items-center gap-[7px] border-b border-border bg-white px-3.5 py-[11px]">
    <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-border" />
    <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-border" />
    <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-border" />
    <span className="ml-2 truncate text-xs font-semibold text-muted">{tab}</span>
  </div>
);

/** A decorative wireframe line. `w` is a percentage of the row. */
const Ln = ({ w = '60%', className }: { w?: string; className?: string }) => (
  <span
    className={cn('block h-[11px] max-w-full rounded-[3px] bg-border', className)}
    style={{ width: w }}
  />
);

const LabelLine = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-muted">
    {children}
  </span>
);

/**
 * Placeholder for a real product screenshot. Neutral wireframe + a clear label
 * telling the team what capture goes here. Fully fluid — never forces its
 * container wider. Swapped for <Image> once real, safe-to-show captures exist.
 */
export function ScreenshotFrame({
  tab,
  label,
  variant = 'default',
  className,
  elevated,
}: ScreenshotFrameProps) {
  return (
    <div
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-lg border border-border bg-offwhite',
        elevated && 'shadow-[0_30px_70px_-24px_rgba(0,0,0,0.6)]',
        className,
      )}
    >
      <Bar tab={tab} />

      {variant === 'hero' ? (
        <div className="grid min-h-[300px] grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[118px_minmax(0,1fr)]">
          <div data-shot-sidebar className="flex flex-col gap-[11px] bg-navy p-4">
            <span className="h-[9px] w-full rounded-[3px] bg-white/30" />
            <span className="h-[9px] w-full rounded-[3px] bg-white/[0.13]" />
            <span className="h-[9px] w-3/4 rounded-[3px] bg-white/[0.13]" />
            <span className="h-[9px] w-full rounded-[3px] bg-white/[0.13]" />
            <span className="h-[9px] w-2/3 rounded-[3px] bg-white/[0.13]" />
          </div>
          <div className="flex min-w-0 flex-col gap-[13px] bg-canvas p-5">
            {['38%', '52%', '30%', '46%', '40%'].map((w, i) => (
              <div key={w} data-shot-row className="flex items-center justify-between gap-3">
                <Ln w={w} />
                <span
                  className="h-[11px] w-[52px] shrink-0 rounded-[3px]"
                  style={{ background: i === 2 || i === 3 ? '#F3E0D3' : '#D6E7DA' }}
                />
              </div>
            ))}
            <LabelLine>{label}</LabelLine>
          </div>
        </div>
      ) : variant === 'catalogue' ? (
        <div className="flex min-w-0 flex-col gap-3 bg-canvas p-5">
          <Ln w="40%" />
          <div className="grid grid-cols-3 gap-2.5">
            <span className="h-16 rounded-[3px] bg-border" />
            <span className="h-16 rounded-[3px] bg-border" />
            <span className="h-16 rounded-[3px] bg-border" />
          </div>
          <Ln w="88%" />
          <Ln w="74%" />
          <LabelLine>{label}</LabelLine>
        </div>
      ) : variant === 'runs' ? (
        <div className="flex min-w-0 flex-col gap-3 p-[22px]">
          <Ln w="45%" />
          <div className="flex gap-2.5">
            <span className="h-12 w-1/3 rounded-[3px] bg-border" />
            <span className="h-12 w-1/3 rounded-[3px] bg-border" />
            <span className="h-12 w-1/3 rounded-[3px] bg-border" />
          </div>
          <Ln w="86%" />
          <Ln w="78%" />
          <LabelLine>{label}</LabelLine>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 p-[22px]">
          <Ln w="35%" />
          <Ln w="92%" />
          <Ln w="88%" />
          <Ln w="90%" />
          <Ln w="80%" />
          <LabelLine>{label}</LabelLine>
        </div>
      )}
    </div>
  );
}
