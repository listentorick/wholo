import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryPhotos, PhotoItem } from './DeliveryPhotos';

const props = {
  photos: [] as PhotoItem[],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onRetry: vi.fn(),
};

describe('DeliveryPhotos', () => {
  it('reports a picked file through onAdd', async () => {
    const onAdd = vi.fn();
    render(<DeliveryPhotos {...props} onAdd={onAdd} />);

    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Add delivery photo'), file);

    expect(onAdd).toHaveBeenCalledWith(file);
  });

  it('renders a thumbnail per photo with the right status affordance', () => {
    const photos: PhotoItem[] = [
      { clientId: 'a', previewUrl: 'blob:a', status: 'uploading' },
      { clientId: 'b', previewUrl: 'blob:b', status: 'error' },
      { clientId: 'c', previewUrl: 'blob:c', status: 'done', photoId: 'srv-c' },
    ];
    render(<DeliveryPhotos {...props} photos={photos} />);

    expect(screen.getAllByRole('img', { name: 'Delivery photo' })).toHaveLength(3);
    expect(screen.getByRole('status', { name: 'Uploading photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove photo' })).toHaveLength(3);
  });

  it('fires onRemove / onRetry for the right photo', async () => {
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    const photos: PhotoItem[] = [{ clientId: 'b', previewUrl: 'blob:b', status: 'error' }];
    render(<DeliveryPhotos {...props} photos={photos} onRemove={onRemove} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    expect(onRetry).toHaveBeenCalledWith('b');
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('hides the Add tile once at the max', () => {
    const photos: PhotoItem[] = Array.from({ length: 2 }, (_, i) => ({
      clientId: `p${i}`,
      previewUrl: `blob:${i}`,
      status: 'done' as const,
    }));
    render(<DeliveryPhotos {...props} photos={photos} max={2} />);
    expect(screen.queryByRole('button', { name: 'Add photo' })).not.toBeInTheDocument();
  });
});
