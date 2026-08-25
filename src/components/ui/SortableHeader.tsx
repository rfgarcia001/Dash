import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SortableHeaderProps {
  column: string;
  activeColumn: string;
  direction: 'asc' | 'desc';
  onSort: (column: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function SortableHeader({
  column,
  activeColumn,
  direction,
  onSort,
  children,
  align = 'left',
  className
}: SortableHeaderProps) {
  const isActive = activeColumn === column;
  const ariaSort = isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const Icon = isActive ? (direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <th aria-sort={ariaSort} className={cn('p-0', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn('table-sort-button', justify)}
        aria-label={`${typeof children === 'string' ? children : 'Coluna'}: ordenar ${isActive && direction === 'asc' ? 'decrescente' : 'crescente'}`}
      >
        <span>{children}</span>
        <Icon size={13} aria-hidden="true" className={cn('shrink-0', isActive ? 'text-[var(--brand-strategy)]' : 'text-[var(--text-subtle)]')} />
      </button>
    </th>
  );
}
