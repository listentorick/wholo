import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandingLogoUploader } from './BrandingLogoUploader';
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
    variants: { full: 'https://cdn/logo/full.webp', thumb: 'https://cdn/logo/thumb.webp' },
    dominantColor: null,
  });
  mockDelete.mockResolvedValue(undefined);
});

describe('BrandingLogoUploader', () => {
  it('renders placeholder circle when no logo exists', async () => {
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(TOKEN, 'distributor-logo', DISTRIBUTOR_ID));
    expect(screen.getByText('No logo set')).toBeInTheDocument();
  });

  it('shows existing logo image when one is loaded', async () => {
    mockList.mockResolvedValue([{
      id: 'img-existing',
      variants: { full: 'https://cdn/logo/full.webp', thumb: 'https://cdn/logo/thumb.webp' },
      dominantColor: null,
    }]);
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(screen.getByAltText('Logo')).toBeInTheDocument());
    expect(screen.getByText('Logo uploaded')).toBeInTheDocument();
  });

  it('shows error when list fails', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(screen.getByText('Failed to load logo.')).toBeInTheDocument());
  });

  it('uploads new logo when file is selected', async () => {
    const user = userEvent.setup();
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const file = new File(['content'], 'logo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(TOKEN, 'distributor-logo', DISTRIBUTOR_ID, file));
  });

  it('deletes existing image before uploading replacement', async () => {
    const existingImage = { id: 'img-existing', variants: { full: 'https://cdn/f.webp' }, dominantColor: null };
    mockList.mockResolvedValue([existingImage]);

    const user = userEvent.setup();
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => screen.getByAltText('Logo'));

    const file = new File(['content'], 'new-logo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(TOKEN, 'img-existing'));
    expect(mockUpload).toHaveBeenCalled();
  });

  it('rejects unsupported file types', async () => {
    render(<BrandingLogoUploader token={TOKEN} distributorId={DISTRIBUTOR_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const file = new File(['content'], 'logo.gif', { type: 'image/gif' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText(/Unsupported format/)).toBeInTheDocument());
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
