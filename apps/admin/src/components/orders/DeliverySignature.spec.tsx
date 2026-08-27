import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DeliverySignatureData } from '@wholo/types';
import { DeliverySignature } from './DeliverySignature';

vi.mock('signature_pad', () => ({
  default: class {
    fromData = vi.fn();
    off = vi.fn();
  },
}));

describe('DeliverySignature', () => {
  it('renders a fallback message when there is no signature', () => {
    render(<DeliverySignature signature={null} />);
    expect(screen.getByText('No signature captured')).toBeInTheDocument();
  });

  it('renders a fallback message when the capture size is missing', () => {
    render(<DeliverySignature signature={{ format: 'signature_pad', version: 5, width: 0, height: 0, strokes: [] }} />);
    expect(screen.getByText('No signature captured')).toBeInTheDocument();
  });

  it('mounts a canvas sized to the stored capture dimensions', () => {
    const signature: DeliverySignatureData = { format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [] };
    render(<DeliverySignature signature={signature} />);

    const canvas = screen.getByRole('img', { name: 'Captured signature' }) as HTMLCanvasElement;
    expect(canvas.style.width).toBe('300px');
    expect(canvas.style.height).toBe('150px');
  });
});
