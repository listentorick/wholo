import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListPagination } from './ListPagination';

describe('ListPagination', () => {
  it('renders nothing when there is no more data', () => {
    const { container } = render(
      <ListPagination hasMore={false} isLoadingMore={false} onLoadMore={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a Load more button when there is more data', () => {
    render(<ListPagination hasMore={true} isLoadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('shows a loading label and disables the button while loading more', () => {
    render(<ListPagination hasMore={true} isLoadingMore={true} onLoadMore={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Loading…' });
    expect(button).toBeDisabled();
  });

  it('calls onLoadMore when clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(<ListPagination hasMore={true} isLoadingMore={false} onLoadMore={onLoadMore} />);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
