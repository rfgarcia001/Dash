import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  closeOnBackdrop?: boolean;
  as?: 'div' | 'form';
  onSubmit?: (event: React.FormEvent) => void;
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className,
  initialFocusRef,
  closeOnBackdrop = true,
  as = 'div',
  onSubmit,
}: DialogProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => {
      (initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  const panelClassName = cn(
    'w-full max-w-md rounded-[var(--radius-panel)] border border-white/10 bg-[var(--panel)] p-6 shadow-[var(--elevation-3)] animate-in zoom-in-95 duration-200',
    className
  );
  const panelProps = {
    ref: panelRef as React.Ref<any>,
    role: 'dialog' as const,
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    className: panelClassName,
    children,
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="presentation"
      onMouseDown={closeOnBackdrop ? (event) => { if (event.target === event.currentTarget) onClose(); } : undefined}
    >
      {as === 'form' ? <form {...panelProps} onSubmit={onSubmit} /> : <div {...panelProps} />}
    </div>
  );
}
