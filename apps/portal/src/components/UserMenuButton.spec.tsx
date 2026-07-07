import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserMenuButton } from './UserMenuButton';

const mockLogout = vi.fn();
const mockChangePassword = vi.fn();
const mockUser = {
  id: '1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  role: 'TRADE_CUSTOMER' as const,
  organisationId: 'org-1',
  organisationName: 'The Grand Hotel',
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout, changePassword: mockChangePassword }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

describe('UserMenuButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the venue icon button', () => {
    render(<UserMenuButton />);
    expect(screen.getByLabelText('Open user menu')).toBeTruthy();
  });

  it('does not show dropdown initially', () => {
    render(<UserMenuButton />);
    expect(screen.queryByText('Signed in as')).toBeNull();
  });

  it('shows dropdown with user name and email when button is clicked', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    expect(screen.getByText('Signed in as')).toBeTruthy();
    expect(screen.getByText('Jane Smith')).toBeTruthy();
    expect(screen.getByText('jane@example.com')).toBeTruthy();
  });

  it('shows User Settings link', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    expect(screen.getByText('User Settings')).toBeTruthy();
  });

  it('User Settings links to /settings', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    const links = screen.getAllByRole('link');
    const settingsLinks = links.filter((l) => l.getAttribute('href') === '/settings');
    expect(settingsLinks.length).toBe(1);
  });

  it('calls logout when Sign out is clicked', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    fireEvent.click(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('calls changePassword when Change Password is clicked', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    fireEvent.click(screen.getByText('Change Password'));
    expect(mockChangePassword).toHaveBeenCalledOnce();
  });

  it('closes dropdown after clicking Change Password', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    fireEvent.click(screen.getByText('Change Password'));
    expect(screen.queryByText('Signed in as')).toBeNull();
  });

  it('closes dropdown after clicking Sign out', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    fireEvent.click(screen.getByText('Sign out'));
    expect(screen.queryByText('Signed in as')).toBeNull();
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <UserMenuButton />
        <div data-testid="outside">Outside</div>
      </div>
    );
    fireEvent.click(screen.getByLabelText('Open user menu'));
    expect(screen.getByText('Signed in as')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Signed in as')).toBeNull();
  });

  it('closes dropdown when a settings link is clicked', () => {
    render(<UserMenuButton />);
    fireEvent.click(screen.getByLabelText('Open user menu'));
    fireEvent.click(screen.getByText('User Settings'));
    expect(screen.queryByText('Signed in as')).toBeNull();
  });
});
