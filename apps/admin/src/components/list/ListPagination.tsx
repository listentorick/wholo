interface ListPaginationProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export function ListPagination({ hasMore, isLoadingMore, onLoadMore }: ListPaginationProps) {
  if (!hasMore) return null;

  return (
    <div className="border-t border-border px-5 py-3.5">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoadingMore}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
      >
        {isLoadingMore ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
