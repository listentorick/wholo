import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessEndedPanel } from './AccessEndedPanel';
import type { EndedVisit } from './selection';

const visit = (cause: EndedVisit['cause']): EndedVisit => ({
  name: 'Vine & Co',
  distributorId: 'dist-1',
  reason: 'Price lists, ticket 142',
  cause,
  endedAt: '2026-10-23T14:00:00Z',
});

describe('AccessEndedPanel', () => {
  it.each([
    ['EXPIRED', 'Your access to Vine & Co has ended — time ran out', 'Open it again if you still need'],
    ['REVOKED', 'Your access to Vine & Co was ended early', 'The wholesaler or another Stocdup operator ended it'],
    ['LEFT', 'You ended your session in Vine & Co', 'Your access ended with the session.'],
  ] as const)('says why it ended (%s)', (cause, headline, explanation) => {
    render(<AccessEndedPanel visit={visit(cause)} onOpenAgain={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(headline);
    expect(screen.getByRole('status')).toHaveTextContent(explanation);
    expect(screen.getByRole('status')).toHaveTextContent('Reason: Price lists, ticket 142');
  });

  it('offers to open the account again, or to dismiss the note', async () => {
    const onOpenAgain = vi.fn();
    const onDismiss = vi.fn();
    render(<AccessEndedPanel visit={visit('EXPIRED')} onOpenAgain={onOpenAgain} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open again…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onOpenAgain).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
