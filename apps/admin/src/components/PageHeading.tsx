interface PageHeadingProps {
  children: React.ReactNode;
  className?: string;
  size?: 'lg' | 'xl';
}

export function PageHeading({ children, className, size = 'xl' }: PageHeadingProps) {
  return (
    <div className={`inline-block ${className ?? ''}`}>
      <h1 className={`${size === 'lg' ? 'text-lg' : 'text-xl'} font-semibold text-primary`}>
        {children}
      </h1>
      <span aria-hidden className="mt-1.5 block h-1 w-full rounded-full bg-accent" />
    </div>
  );
}
