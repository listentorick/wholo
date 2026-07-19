import { PageHeading } from '@/components/PageHeading';

interface ListPageHeaderProps {
  title: string;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}

export function ListPageHeader({ title, count, actions, className }: ListPageHeaderProps) {
  return (
    <div className={`mb-6 flex items-center justify-between ${className ?? ''}`}>
      <PageHeading>
        {title}
        {typeof count === 'number' && count > 0 && (
          <span className="ml-1.5 font-normal text-muted">({count})</span>
        )}
      </PageHeading>
      {actions}
    </div>
  );
}
