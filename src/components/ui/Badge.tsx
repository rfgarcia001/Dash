import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'neutral' | 'brand' | 'selection' | 'positive' | 'negative';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dotColor?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-white/[0.045] border-white/10 text-zinc-200',
  brand: 'bg-[var(--action-subtle)] border-[var(--brand-strategy)]/25 text-[var(--brand-strategy)]',
  selection: 'bg-[var(--selection-subtle)] border-[var(--selection)]/30 text-[var(--selection)]',
  positive: 'bg-[var(--status-positive)]/10 border-[var(--status-positive)]/25 text-[var(--status-positive)]',
  negative: 'bg-[var(--status-negative)]/10 border-[var(--status-negative)]/25 text-[var(--status-negative)]',
};

export function Badge({ variant = 'neutral', dotColor, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-[var(--radius-chip)] border px-2.5 py-1 text-sm font-medium',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {dotColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </span>
  );
}

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] font-mono text-sm font-bold text-zinc-200',
        className
      )}
    >
      {rank}
    </span>
  );
}
