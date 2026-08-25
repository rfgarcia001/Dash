import React from 'react';
import { cn } from '../../lib/utils';

interface PopoverPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  align?: 'left' | 'right' | 'full';
  width?: string;
  role?: 'menu' | 'dialog';
}

export function PopoverPanel({ open, align = 'left', width = 'w-72', role = 'menu', className, children, ...props }: PopoverPanelProps) {
  if (!open) return null;
  return (
    <div
      role={role}
      className={cn(
        'absolute top-full z-50 mt-2 rounded-[var(--radius-panel)] border border-white/10 bg-[var(--panel)] p-2 shadow-[var(--elevation-2)] animate-in fade-in slide-in-from-top-2 duration-150',
        align === 'right' ? 'right-0' : align === 'full' ? 'left-0 right-0' : 'left-0',
        width,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
