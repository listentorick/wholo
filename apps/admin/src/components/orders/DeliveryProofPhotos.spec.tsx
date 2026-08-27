import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import type { DeliveryProofPhoto } from '@wholo/types';
import { DeliveryProofPhotos } from './DeliveryProofPhotos';

const photo = (id: string): DeliveryProofPhoto => ({
  id,
  url: `https://signed/${id}-full`,
  thumbnailUrl: `https://signed/${id}-thumb`,
  width: 1600,
  height: 1200,
  capturedAt: null,
  sortOrder: 0,
});

describe('DeliveryProofPhotos', () => {
  it('renders a muted message when there are no photos', () => {
    render(<DeliveryProofPhotos photos={[]} />);
    expect(screen.getByText('No photos captured')).toBeInTheDocument();
  });

  it('renders a thumbnail per photo and opens the full-size image on click', async () => {
    render(<DeliveryProofPhotos photos={[photo('p1'), photo('p2')]} />);

    const thumbs = screen.getAllByAltText('Delivery photo');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute('src', 'https://signed/p1-thumb');

    await userEvent.click(thumbs[0].closest('button')!);

    const full = screen.getByAltText('Delivery photo, full size');
    expect(full).toHaveAttribute('src', 'https://signed/p1-full');
  });
});
