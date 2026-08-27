'use client';

import { useEffect, useRef } from 'react';
import SignaturePadLib from 'signature_pad';
import type { DeliverySignatureData } from '@wholo/types';

interface DeliverySignatureProps {
  signature: DeliverySignatureData | null;
}

// Read-only replay of a captured signature. The driver app stores strokes as
// signature_pad vector point-groups (never a raster), plus the capture-time
// canvas CSS size — we size a canvas to match and replay via `fromData`, the
// same recipe apps/driver/src/components/delivery/SignaturePad.tsx uses on
// resize. No pointer listeners: this canvas is never drawn on.
export function DeliverySignature({ signature }: DeliverySignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const width = signature?.width ?? 0;
  const height = signature?.height ?? 0;
  const strokes = signature?.strokes;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes || width <= 0 || height <= 0) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    // jsdom throws from getContext rather than returning null — tolerate it so
    // the component still mounts under test.
    try {
      canvas.getContext('2d')?.scale(ratio, ratio);
    } catch {
      /* no 2d context (e.g. test environment) */
    }

    const pad = new SignaturePadLib(canvas, { penColor: '#0B1D3A', backgroundColor: 'rgba(255,255,255,0)' });
    pad.fromData(strokes as Parameters<typeof pad.fromData>[0]);
    pad.off();

    return () => {
      pad.off();
    };
  }, [strokes, width, height]);

  if (!signature || width <= 0 || height <= 0) {
    return <p className="text-sm text-muted">No signature captured</p>;
  }

  return (
    <div className="inline-block rounded-md border border-border bg-white p-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Captured signature"
        style={{ width, height, maxWidth: '100%' }}
        className="block"
      />
    </div>
  );
}
