import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Permission } from '@wholo/types';
import NewTaxTypePage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const granted: { list: string[] } = { list: [] };
vi.mock('@/lib/permissions', () => ({ useCan: () => (p: string) => granted.list.includes(p) }));

beforeEach(() => {
  granted.list = [];
});

describe('New tax type page', () => {
  it('shows the create form to someone who can manage tax types', () => {
    granted.list = [Permission.TAX_TYPES_MANAGE];
    render(<NewTaxTypePage />);
    expect(screen.getByRole('button', { name: 'Create tax type' })).toBeInTheDocument();
  });

  it('tells someone who arrived by URL without permission, instead of showing a form that cannot save', () => {
    granted.list = [Permission.TAX_TYPES_READ];
    render(<NewTaxTypePage />);
    expect(screen.getByText(/don.t have permission to create tax types/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create tax type' })).not.toBeInTheDocument();
  });
});
