'use client';

import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

interface DrawerProps {
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export function Drawer({ onClose, width = 520, children }: DrawerProps) {
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
        setTimeout(() => onCloseRef.current(), 300);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(() => onCloseRef.current(), 300);
  }

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out overflow-y-auto"
        style={{ width: `min(${width}px, 95vw)`, transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
