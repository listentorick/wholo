import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';
import { adminOnboardingApi, adminSettingsApi } from '@wholo/admin-api-client';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock('@wholo/admin-api-client', () => ({
  adminOnboardingApi: { createDistributor: vi.fn() },
  adminSettingsApi: { get: vi.fn(), update: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status = 500) {
      super(message);
    }
  },
}));

// Branding uploaders hit the asset API on mount — stub the whole tab's uploaders.
vi.mock('@/components/branding/BrandingLogoUploader', () => ({
  BrandingLogoUploader: () => <div data-testid="logo-uploader" />,
}));
vi.mock('@/components/branding/BrandingBannerUploader', () => ({
  BrandingBannerUploader: () => <div data-testid="banner-uploader" />,
}));

const authState: Record<string, unknown> = {};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

const mockCreate = adminOnboardingApi.createDistributor as ReturnType<typeof vi.fn>;
const mockSettingsGet = adminSettingsApi.get as ReturnType<typeof vi.fn>;
const mockSettingsUpdate = adminSettingsApi.update as ReturnType<typeof vi.fn>;

const org = { id: 'org-1', name: 'Acme Wines', slug: 'acme-wines', type: 'DISTRIBUTOR' };
const settings = {
  name: 'Acme Wines',
  email: null,
  phone: null,
  slug: 'acme-wines',
  addressLine1: '1 Barrel Way',
  addressLine2: null,
  addressCity: 'Leeds',
  addressState: null,
  addressPostcode: 'LS1 1AA',
  addressCountry: 'United Kingdom',
  defaultOrderAcceptanceMode: 'MANUAL',
  marketplaceVisible: false,
  marketplaceDescription: null,
  tagline: null,
  aboutText: null,
  orderNotificationEmails: [],
  processingDays: [1, 2, 3, 4, 5],
  minimumOrderSpend: null,
};

function setAuth(overrides: Record<string, unknown>) {
  for (const key of Object.keys(authState)) delete authState[key];
  Object.assign(
    authState,
    {
      user: null,
      accessToken: 'tok-1',
      isLoading: false,
      onboardingRequired: true,
      identity: { email: 'ada@acme.com', firstName: 'Ada', lastName: 'Acme' },
      refreshSession: vi.fn().mockResolvedValue(undefined),
    },
    overrides,
  );
}

async function fillBusinessStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Business name'), 'Acme Wines');
  await user.type(screen.getByLabelText('Address line 1'), '1 Barrel Way');
  await user.type(screen.getByLabelText('City'), 'Leeds');
  await user.type(screen.getByLabelText('Postcode'), 'LS1 1AA');
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth({});
  mockCreate.mockResolvedValue(org);
  mockSettingsGet.mockResolvedValue(settings);
  mockSettingsUpdate.mockResolvedValue(settings);
});

describe('OnboardingPage (wizard v2)', () => {
  it('greets by first name, prefills business email, and suggests the slug from the name', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    expect(screen.getByText(/Welcome, Ada/)).toBeInTheDocument();
    expect(screen.getByLabelText('Business email')).toHaveValue('ada@acme.com');

    await user.type(screen.getByLabelText('Business name'), 'Château Léoube');
    expect(screen.getByLabelText('Store URL')).toHaveValue('chateau-leoube');
  });

  it('stops suggesting once the slug is edited by hand', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.type(screen.getByLabelText('Store URL'), 'my-cellar');
    await user.type(screen.getByLabelText('Business name'), 'Acme Wines');

    expect(screen.getByLabelText('Store URL')).toHaveValue('my-cellar');
  });

  it('creates the distributor then advances to the branding step', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await fillBusinessStep(user);
    await user.click(screen.getByRole('button', { name: 'Create your distributorship' }));

    await waitFor(() => expect(screen.getByTestId('logo-uploader')).toBeInTheDocument());
    expect(mockCreate).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ name: 'Acme Wines', slug: 'acme-wines', email: 'ada@acme.com' }),
    );
    expect(mockSettingsGet).toHaveBeenCalledWith('tok-1');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows a slug 409 inline on the portal address field', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    const Err = ApiError as unknown as new (message: string, status?: number) => Error;
    mockCreate.mockRejectedValue(new Err('That portal address is already taken — choose another.', 409));
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await fillBusinessStep(user);
    await user.click(screen.getByRole('button', { name: 'Create your distributorship' }));

    expect(await screen.findByText(/portal address is already taken/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toBeInTheDocument(); // still on step 1
  });

  it('walks the remaining steps via skip and finishes into the dashboard', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await fillBusinessStep(user);
    await user.click(screen.getByRole('button', { name: 'Create your distributorship' }));
    await screen.findByTestId('logo-uploader');

    await user.click(screen.getByRole('button', { name: 'Continue' })); // branding
    await user.click(screen.getByRole('button', { name: 'Skip for now' })); // orders
    await user.click(screen.getByRole('button', { name: 'Skip for now' })); // portal
    await user.click(screen.getByRole('button', { name: 'Skip for now' })); // notifications
    await user.click(screen.getByRole('button', { name: 'Skip for now' })); // discovery → finish

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(authState.refreshSession).toHaveBeenCalled();
    expect(mockSettingsUpdate).not.toHaveBeenCalled(); // everything skipped, nothing saved
  });

  it('saves a wizard step through the settings API before advancing', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await fillBusinessStep(user);
    await user.click(screen.getByRole('button', { name: 'Create your distributorship' }));
    await screen.findByTestId('logo-uploader');
    await user.click(screen.getByRole('button', { name: 'Continue' })); // → orders

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    await waitFor(() =>
      expect(mockSettingsUpdate).toHaveBeenCalledWith(
        'tok-1',
        expect.objectContaining({ defaultOrderAcceptanceMode: 'MANUAL' }),
      ),
    );
    expect(screen.getByText('Tagline')).toBeInTheDocument(); // advanced to portal step
  });

  it('redirects straight to the dashboard when the session is already active', () => {
    setAuth({ user: { id: 'u1' }, onboardingRequired: false, identity: null });
    render(<OnboardingPage />);

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('redirects to login when not authenticated at all', () => {
    setAuth({ accessToken: null, onboardingRequired: false, identity: null });
    render(<OnboardingPage />);

    expect(replace).toHaveBeenCalledWith('/login');
  });
});
