import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Role } from '@wholo/types';
import { RoleChip } from './RoleChip';

describe('RoleChip', () => {
  it('gives the Owner the one dark chip', () => {
    render(<RoleChip role={Role.DISTRIBUTOR_ADMIN} />);
    expect(screen.getByText('Owner')).toHaveClass('bg-text');
  });

  it('shows a Stocdup operator role as an ordinary role, not as an Owner', () => {
    render(<RoleChip role={Role.PLATFORM_ADMIN} />);
    expect(screen.getByText('Platform admin')).not.toHaveClass('bg-text');
  });
});
