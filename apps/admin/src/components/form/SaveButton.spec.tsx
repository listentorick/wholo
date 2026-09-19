import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveButton } from './SaveButton';

describe('SaveButton', () => {
  it('shows "Save changes" and is enabled when not submitting', () => {
    render(<SaveButton isSubmitting={false} />);
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('can be held disabled (e.g. until something has changed) without showing the saving label', () => {
    render(<SaveButton isSubmitting={false} disabled />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows a saving label and disables while submitting', () => {
    render(<SaveButton isSubmitting />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
