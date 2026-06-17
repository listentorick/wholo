import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandingBannerUploader } from './BrandingBannerUploader';
import { adminAssetImagesApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAssetImagesApi: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
  },
}));

const TOKEN = 'test-token';
const DISTRIBUTOR_ID = 'dist-1';

const mockList = adminAssetImagesApi.list as ReturnType<typeof vi.fn>;
const mockUpload = adminAssetImagesApi.upload as ReturnType<typeof vi.fn>;
const mockDelete = adminAssetImagesApi.delete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockUpload.mockResolvedValue({
    id: 'img-1',
    variants: { mobile: 'https://cdn/banner/mobile.webp', desktop: 'https://cdn/banner/desktop.webp' },
    dominantColor: '#3d6e3c',
  });
  mockDelete.mockResolvedValue(undefined);
});

describe('BrandingBannerUploader', () => {
  it('renders placeholder when no banner exists', async () => {
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(TOKEN, 'distributor-banner', DISTRIBUTOR_ID));
    expect(screen.queryByAltText('Banner')).toBeNull();
  });

  it('shows banner image when one is loaded', async () => {
    mockList.mockResolvedValue([{
      id: 'img-existing',
      variants: { mobile: 'https://cdn/banner/mobile.webp' },
      dominantColor: '#3d6e3c',
    }]);
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(screen.getByAltText('Banner')).toBeInTheDocument());
  });

  it('shows dominant colour swatch when banner has dominantColor', async () => {
    mockList.mockResolvedValue([{
      id: 'img-existing',
      variants: { mobile: 'https://cdn/banner/mobile.webp' },
      dominantColor: '#3d6e3c',
    }]);
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(screen.getByText('#3d6e3c')).toBeInTheDocument());
  });

  it('shows error when list fails', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(screen.getByText('Failed to load banner.')).toBeInTheDocument());
  });

  it('uploads banner when file is selected', async () => {
    const user = userEvent.setup();
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const file = new File(['content'], 'banner.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(TOKEN, 'distributor-banner', DISTRIBUTOR_ID, file));
  });

  it('rejects unsupported file types', async () => {
    render(<BrandingBannerUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const file = new File(['content'], 'banner.bmp', { type: 'image/bmp' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText(/Unsupported format/)).toBeInTheDocument());
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
