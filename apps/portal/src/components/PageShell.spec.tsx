import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell, PageSpinner } from './PageShell';

function shellOf(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe('PageShell', () => {
  it('renders its children', () => {
    render(<PageShell>Page content</PageShell>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('fills the flex column so short pages stretch and scroll consistently', () => {
    const { container } = render(<PageShell>x</PageShell>);
    const shell = shellOf(container);
    expect(shell).toHaveClass('flex', 'flex-1', 'flex-col', 'w-full', 'min-w-0');
  });

  it('defaults to the 480px centered commerce shell with padding', () => {
    const { container } = render(<PageShell>x</PageShell>);
    const shell = shellOf(container);
    expect(shell).toHaveClass('max-w-[480px]', 'mx-auto', 'p-5');
  });

  it('applies the reading width variant', () => {
    const { container } = render(<PageShell width="reading">x</PageShell>);
    const shell = shellOf(container);
    expect(shell).toHaveClass('max-w-3xl', 'mx-auto');
    expect(shell).not.toHaveClass('max-w-[480px]');
  });

  it('applies the wide width variant', () => {
    const { container } = render(<PageShell width="wide">x</PageShell>);
    const shell = shellOf(container);
    expect(shell).toHaveClass('max-w-4xl', 'mx-auto');
  });

  it('applies no width cap for the full variant', () => {
    const { container } = render(<PageShell width="full">x</PageShell>);
    const shell = shellOf(container);
    expect(shell.className).not.toMatch(/max-w-/);
    expect(shell).not.toHaveClass('mx-auto');
  });

  it('omits padding when padding="none"', () => {
    const { container } = render(<PageShell padding="none">x</PageShell>);
    expect(shellOf(container)).not.toHaveClass('p-5');
  });

  it('centers content when center is set', () => {
    const { container } = render(<PageShell center>x</PageShell>);
    expect(shellOf(container)).toHaveClass('items-center', 'justify-center');
  });

  it('does not center by default', () => {
    const { container } = render(<PageShell>x</PageShell>);
    expect(shellOf(container)).not.toHaveClass('items-center');
  });

  it('merges extra classes via className', () => {
    const { container } = render(
      <PageShell padding="none" className="pb-12">
        x
      </PageShell>,
    );
    expect(shellOf(container)).toHaveClass('pb-12');
  });

  it('lets className win over conflicting defaults', () => {
    const { container } = render(<PageShell className="p-0">x</PageShell>);
    const shell = shellOf(container);
    expect(shell).toHaveClass('p-0');
    expect(shell).not.toHaveClass('p-5');
  });
});

describe('PageSpinner', () => {
  it('renders an accessible loading indicator', () => {
    render(<PageSpinner />);
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(spinner).toHaveClass('animate-spin');
  });
});
