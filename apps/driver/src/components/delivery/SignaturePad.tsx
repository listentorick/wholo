'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SignaturePadLib from 'signature_pad';
import { SignatureStrokeData } from '@/types/delivery';

export interface SignaturePadHandle {
  /** The captured strokes, or null if nothing has been drawn. */
  getData: () => SignatureStrokeData | null;
  clear: () => void;
}

interface SignaturePadProps {
  /** Fires after every stroke and on clear, with the current empty state. */
  onChange?: (isEmpty: boolean) => void;
  ariaLabel?: string;
}

// Large, tactile signature surface for drivers. Wraps signature_pad v5 directly
// — no React binding — so it stays on a supported dependency and we control the
// devicePixelRatio + resize handling ourselves. Strokes are captured as vector
// point groups (never a raster image); the server stores them verbatim as jsonb.
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, ariaLabel = 'Signature' },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useImperativeHandle(ref, () => ({
    getData: () => {
      const pad = padRef.current;
      const canvas = canvasRef.current;
      if (!pad || !canvas || pad.isEmpty()) return null;
      return {
        format: 'signature_pad',
        version: 5,
        width: canvas.offsetWidth,
        height: canvas.offsetHeight,
        strokes: pad.toData() as unknown[],
      };
    },
    clear: () => {
      padRef.current?.clear();
      onChange?.(true);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      penColor: '#0B1D3A',
      backgroundColor: 'rgba(255,255,255,0)',
    });
    padRef.current = pad;

    // Setting canvas.width/height clears the bitmap, so re-apply the strokes
    // after each resize (signature_pad README recipe).
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      // jsdom throws from getContext rather than returning null — tolerate it so
      // the component still mounts under test.
      try {
        canvas.getContext('2d')?.scale(ratio, ratio);
      } catch {
        /* no 2d context (e.g. test environment) */
      }
      pad.clear();
      pad.fromData(data);
    };
    resize();

    const handleEnd = () => onChange?.(pad.isEmpty());
    pad.addEventListener('endStroke', handleEnd);
    window.addEventListener('resize', resize);

    return () => {
      pad.removeEventListener('endStroke', handleEnd);
      window.removeEventListener('resize', resize);
      pad.off();
      padRef.current = null;
    };
  }, [onChange]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={ariaLabel}
      role="img"
      className="block h-64 w-full touch-none border border-border bg-white"
    />
  );
});
