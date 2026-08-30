import { ImageResponse } from 'next/og';
import { INTER_EXTRABOLD_B64 } from '@/lib/og-font';

export const alt = 'Stocdup: Sell more. Run smoother.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const interExtraBold = Buffer.from(INTER_EXTRABOLD_B64, 'base64');

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0B1D3A',
          padding: '72px 80px',
          fontFamily: 'Inter',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: '#F2864D' }} />
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: -1 }}>
            <span>stocd</span>
            <span style={{ color: '#6EA8F7' }}>up</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 108, letterSpacing: -4, lineHeight: 1 }}>SELL MORE.</div>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                fontSize: 108,
                letterSpacing: -4,
                lineHeight: 1,
                background: '#F2864D',
                color: '#0B1D3A',
                padding: '0 14px',
              }}
            >
              RUN SMOOTHER.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 25, color: '#AEBAD0', maxWidth: 760 }}>
          The UK-native wholesale platform for independent food and drink distributors.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Inter', data: interExtraBold, weight: 800, style: 'normal' }],
    },
  );
}
