import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<ButtonVariant, string> = {
  /** The single "act here" control — Cobalt, one per view (the Confident Blue Rule). */
  primary: 'bg-primary px-4 py-2.5 text-primary-fg hover:bg-primary-hover',
  /** Quiet alternative — hairline border, never competes with primary. */
  secondary: 'border border-border bg-surface px-4 py-2.5 text-foreground hover:bg-surface-hover',
  /** Borderless — menu items, tertiary actions. */
  ghost: 'px-3 py-2 text-foreground-secondary hover:bg-surface-hover hover:text-foreground',
};

/**
 * Shared button. Square corners are gone — controls are 6px (`rounded-md`) to
 * match the marketing site. Circular controls (the quantity stepper) are their
 * own thing and do not use this.
 */
export function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(BASE, VARIANTS[variant], fullWidth && 'w-full', className)}
      {...rest}
    />
  );
}
