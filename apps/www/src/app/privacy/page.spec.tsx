import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from './page';
import { PRIVACY_NOTICE } from './notice';

describe('PrivacyPage', () => {
  it('shows the notice title and its revision date', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'STOCDUP PRIVACY NOTICE' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Last updated: 8 October 2026')).toBeInTheDocument();
  });

  it('renders all fifteen numbered sections in order', () => {
    render(<PrivacyPage />);
    const main = screen.getByRole('main');
    const headings = within(main)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toHaveLength(15);
    expect(headings[0]).toBe('1. ABOUT STOCDUP AND THIS NOTICE');
    expect(headings[8]).toBe('9. ANALYTICS AND AGGREGATED REPORTING');
    expect(headings[14]).toBe('15. CHANGES TO THIS NOTICE');
  });

  it('carries no placeholder or editorial notes', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('main').textContent).not.toMatch(/CONFIRM|DRAFT|Placeholder|\[|\]/);
  });

  it('links the privacy email address wherever it appears', () => {
    render(<PrivacyPage />);
    const links = screen.getAllByRole('link', { name: 'privacy@stocdup.com' });
    expect(links.length).toBeGreaterThan(1);
    links.forEach((link) => expect(link).toHaveAttribute('href', 'mailto:privacy@stocdup.com'));
  });

  it('links the ICO complaints page and the Xero terms', () => {
    render(<PrivacyPage />);
    for (const url of [
      'https://ico.org.uk/make-a-complaint/',
      'https://www.xero.com/uk/legal/terms/data-processing/',
      'https://www.xero.com/uk/legal/privacy/',
    ]) {
      expect(screen.getByRole('link', { name: url })).toHaveAttribute('href', url);
    }
  });

  it('shows a labelled term together with its explanation', () => {
    render(<PrivacyPage />);
    expect(screen.getByText('Register-interest leads:').closest('p')).toHaveTextContent(
      /^Register-interest leads: unsuccessful or inactive enquiries are deleted 12 months/,
    );
  });

  it('shows the sub-heading inside the rights section', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { level: 3, name: 'YOUR RIGHT TO OBJECT' }),
    ).toBeInTheDocument();
  });
});

describe('PRIVACY_NOTICE', () => {
  it('numbers its sections 1 to 15 without gaps', () => {
    expect(PRIVACY_NOTICE.map((s) => s.number)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });
});
