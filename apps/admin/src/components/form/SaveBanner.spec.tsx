import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveBanner } from './SaveBanner';

describe('SaveBanner', () => {
  it('renders "Saved" on success', () => {
    render(<SaveBanner success error={null} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('renders the error message when present', () => {
    render(<SaveBanner success={false} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders nothing when neither success nor error', () => {
    const { container } = render(<SaveBanner success={false} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
