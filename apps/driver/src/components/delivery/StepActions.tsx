interface StepActionsProps {
  children: React.ReactNode;
}

// Sticky action bar for the Deliver flow steps. Anchors Back / Continue /
// Accept delivery to the bottom of the device: pinned to the viewport while
// content scrolls under it, pushed to the bottom on short screens (mt-auto),
// bled to the screen edges (negative margins cancel PageShell's p-5), and
// clear of the iOS home indicator (safe-area inset).
export function StepActions({ children }: StepActionsProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-auto flex flex-col gap-2 border-t border-border bg-white px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
