import { cn } from '@/lib/cn';

export type IconName =
  | 'search'
  | 'grid'
  | 'trend'
  | 'clipboard'
  | 'scale'
  | 'camera'
  | 'bolt'
  | 'people'
  | 'check'
  | 'arrow-right'
  | 'arrow-left'
  | 'menu'
  | 'close';

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4h6a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" />
      <path d="M9 4a2 2 0 0 0-2 2M9 4a2 2 0 0 1 2 2h2" />
      <path d="m8 13 2.5 2.5L15 11" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M5 7l7-4 7 4" />
      <path d="M5 7l-2 6a4 4 0 0 0 8 0L5 7Zm14 0-2 6a4 4 0 0 0 8 0l-2-6" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  bolt: <path d="M13 2 3 14h7l-1 8 10-12h-7z" />,
  people: (
    <>
      <path d="M16 3.1a4 4 0 0 1 0 7.8M21 21v-1a4 4 0 0 0-3-3.9" />
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

interface IconProps {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  title?: string;
}

export function Icon({ name, className, strokeWidth = 1.6, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-6 w-6 shrink-0', className)}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
