import React from 'react';
import { cn } from '../../lib/utils';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div>
        <h3 className="text-[length:var(--type-section)] font-bold text-white">{title}</h3>
        {subtitle && <p className="mt-1 text-sm font-medium text-[var(--text-subtle)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
