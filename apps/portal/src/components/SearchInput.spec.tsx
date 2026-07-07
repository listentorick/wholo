import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('renders a search input with the given placeholder and value', () => {
    render(<SearchInput value="merlot" onChange={() => {}} placeholder="Search products…" />);

    const input = screen.getByPlaceholderText('Search products…') as HTMLInputElement;
    expect(input.type).toBe('search');
    expect(input.value).toBe('merlot');
  });

  it('calls onChange with the typed value', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search…" />);

    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'shiraz' } });

    expect(onChange).toHaveBeenCalledWith('shiraz');
  });

  it('applies extra wrapper classes', () => {
    const { container } = render(
      <SearchInput value="" onChange={() => {}} className="mb-5" />,
    );

    expect((container.firstChild as HTMLElement).className).toContain('mb-5');
  });
});
