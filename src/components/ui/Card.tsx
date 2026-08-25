import React from 'react';
import { cn } from '../../lib/utils';

type Elevation = 1 | 2 | 3;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  padded?: boolean;
}

const ELEVATION_CLASSES: Record<Elevation, string> = {
  1: 'shadow-[var(--elevation-1)]',
  2: 'shadow-[var(--elevation-2)]',
  3: 'shadow-[var(--elevation-3)]',
};

export function Card({ elevation = 2, padded = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border border-white/10 bg-[var(--panel)]',
        ELEVATION_CLASSES[elevation],
        padded && 'p-5 sm:p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
