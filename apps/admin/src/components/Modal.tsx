'use client';

import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  onClose: () => void;
  /** id of the heading element inside `children`, wired to aria-labelledby. */
  labelledBy: string;
  /** When false, Escape and backdrop-click are ignored — use while an action is in flight. Defaults to true. */
  closable?: boolean;
  children: React.ReactNode;
}

export function Modal({ onClose, labelledBy, closable = true, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closableRef = useRef(closable);

  useEffect(() => {
    onCloseRef.current = onClose;
    closableRef.current = closable;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closableRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    const cancelButton = cardRef.current?.querySelector<HTMLButtonElement>('[data-modal-cancel]');
    cancelButton?.focus();

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={closable ? onClose : undefined}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-lg"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
