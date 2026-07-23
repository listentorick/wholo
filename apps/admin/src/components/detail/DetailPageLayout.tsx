interface DetailPageLayoutProps {
  children: React.ReactNode;
  /** Omit to render a single-column layout (used in drawer mode, which has no sidebar). */
  sidebar?: React.ReactNode;
}

export function DetailPageLayout({ children, sidebar }: DetailPageLayoutProps) {
  if (!sidebar) {
    return <div className="space-y-5">{children}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_288px]">
      <div className="space-y-5">{children}</div>
      <div>
        <div className="space-y-5 lg:sticky lg:top-6">{sidebar}</div>
      </div>
    </div>
  );
}
