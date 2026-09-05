import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { XeroConnectionCard } from './XeroConnectionCard';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    getConnection: vi.fn(),
    createXeroAuthorizationUrl: vi.fn(),
    disconnect: vi.fn(),
    countContactsNeedingAttention: vi.fn(),
    countProductsNeedingAttention: vi.fn(),
    countTaxTypesNeedingAttention: vi.fn(),
  },
}));

const TOKEN = 'test-token';

const mockGetConnection = adminAccountingApi.getConnection as ReturnType<typeof vi.fn>;
const mockCreateAuthUrl = adminAccountingApi.createXeroAuthorizationUrl as ReturnType<typeof vi.fn>;
const mockDisconnect = adminAccountingApi.disconnect as ReturnType<typeof vi.fn>;
const mockCountContactsNeedingAttention = adminAccountingApi.countContactsNeedingAttention as ReturnType<
  typeof vi.fn
>;
const mockCountProductsNeedingAttention = adminAccountingApi.countProductsNeedingAttention as ReturnType<
  typeof vi.fn
>;
const mockCountTaxTypesNeedingAttention = adminAccountingApi.countTaxTypesNeedingAttention as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  delete (window as unknown as { location?: unknown }).location;
  (window as unknown as { location: { href: string } }).location = { href: '' };
  mockCountContactsNeedingAttention.mockResolvedValue({ count: 0 });
  mockCountProductsNeedingAttention.mockResolvedValue({ count: 0 });
  mockCountTaxTypesNeedingAttention.mockResolvedValue({ count: 0 });
});

describe('XeroConnectionCard', () => {
  it('shows a Connect button when there is no connection', async () => {
    mockGetConnection.mockResolvedValue(undefined);
    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Connect Xero')).toBeInTheDocument());
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });

  it('shows connected details and a Disconnect button when connected', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'CONNECTED',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });
    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Acme Wines')).toBeInTheDocument());
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    expect(screen.getByText('View synced data').closest('a')).toHaveAttribute('href', '/integrations/accounting');
  });

  it('shows the sync stat chips with per-category counts when any category needs attention', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'CONNECTED',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-01-02T00:00:00.000Z',
    });
    mockCountContactsNeedingAttention.mockResolvedValue({ count: 4 });
    mockCountProductsNeedingAttention.mockResolvedValue({ count: 2 });
    mockCountTaxTypesNeedingAttention.mockResolvedValue({ count: 0 });

    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Tax types')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for review since your last sync on/)).toBeInTheDocument();
  });

  it('shows a generic review caption when the connection has never synced', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'CONNECTED',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });
    mockCountContactsNeedingAttention.mockResolvedValue({ count: 1 });

    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Waiting for review since you connected')).toBeInTheDocument());
  });

  it('hides the sync stats block when no category needs attention', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'CONNECTED',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });

    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Acme Wines')).toBeInTheDocument());
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument();
    expect(screen.queryByText('Products')).not.toBeInTheDocument();
    expect(screen.queryByText('Tax types')).not.toBeInTheDocument();
  });

  it('does not fetch or show attention counts when not connected', async () => {
    mockGetConnection.mockResolvedValue(undefined);
    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Connect Xero')).toBeInTheDocument());
    expect(mockCountContactsNeedingAttention).not.toHaveBeenCalled();
    expect(mockCountProductsNeedingAttention).not.toHaveBeenCalled();
    expect(mockCountTaxTypesNeedingAttention).not.toHaveBeenCalled();
    expect(screen.queryByText('View synced data')).not.toBeInTheDocument();
  });

  it('shows a load error banner when the status fetch fails', async () => {
    mockGetConnection.mockRejectedValue(new Error('network error'));
    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Failed to load connection status.')).toBeInTheDocument());
  });

  it('navigates to the authorization URL when Connect Xero is clicked', async () => {
    mockGetConnection.mockResolvedValue(undefined);
    mockCreateAuthUrl.mockResolvedValue({ authorizationUrl: 'https://xero.example/consent' });
    const user = userEvent.setup();

    render(<XeroConnectionCard />);
    await waitFor(() => screen.getByText('Connect Xero'));
    await user.click(screen.getByText('Connect Xero'));

    await waitFor(() => expect(mockCreateAuthUrl).toHaveBeenCalledWith());
    await waitFor(() => expect(window.location.href).toBe('https://xero.example/consent'));
  });

  it('shows a reconnect prompt when the connection status is ERROR', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'ERROR',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });
    render(<XeroConnectionCard />);

    await waitFor(() => expect(screen.getByText('Connection error')).toBeInTheDocument());
    expect(screen.getByText('Reconnect Xero')).toBeInTheDocument();
    expect(screen.queryByText('Disconnect')).not.toBeInTheDocument();
  });

  it('navigates to the authorization URL when Reconnect Xero is clicked', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'ERROR',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });
    mockCreateAuthUrl.mockResolvedValue({ authorizationUrl: 'https://xero.example/consent' });
    const user = userEvent.setup();

    render(<XeroConnectionCard />);
    await waitFor(() => screen.getByText('Reconnect Xero'));
    await user.click(screen.getByText('Reconnect Xero'));

    await waitFor(() => expect(mockCreateAuthUrl).toHaveBeenCalledWith());
  });

  it('disconnects and returns to the not-connected state', async () => {
    mockGetConnection.mockResolvedValue({
      provider: 'XERO',
      status: 'CONNECTED',
      externalOrganisationName: 'Acme Wines',
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: null,
    });
    mockDisconnect.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<XeroConnectionCard />);
    await waitFor(() => screen.getByText('Disconnect'));
    await user.click(screen.getByText('Disconnect'));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith());
    await waitFor(() => expect(screen.getByText('Connect Xero')).toBeInTheDocument());
  });
});
