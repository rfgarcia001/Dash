import React from 'react';
import { Equal, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  valueColor?: string;
  className?: string;
  selected?: boolean;
  isHero?: boolean;
  heroTag?: string;
  comparison?: {
    percent: number;
    diff: number;
    isGood: boolean;
    formatted: string;
    prevValue?: number;
    prevFormatted?: string;
  } | null;
  comparisonLabel?: string;
  onClick?: () => void;
}

export function MetricCard({
  title, value, subtext, icon, valueColor, className, selected, isHero, heroTag,
  comparison, comparisonLabel, onClick,
}: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${title}: ${value}. ${selected ? 'Remover do gráfico' : 'Adicionar ao gráfico'}`}
      className={cn(
        'metric-card appearance-none rounded-[var(--radius-panel)] border p-4 flex flex-col justify-between transition-all duration-[var(--motion-base)] relative overflow-hidden text-left w-full',
        isHero ? 'ring-1 ring-[var(--brand-strategy)]/15 hover:border-[var(--brand-strategy)]/50' : 'hover:border-slate-500/40',
        onClick && 'cursor-pointer',
        selected && 'ring-2 ring-[var(--selection)]/70 border-[var(--selection)]/60 bg-[var(--surface-2)]',
        className
      )}
    >
      {isHero && (
        <div className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-[var(--radius-control)] px-2.5 py-0.5 text-[length:var(--type-caption)] font-bold uppercase tracking-wide shadow-sm z-10 bg-gradient-to-br from-[var(--allevo-action-start)] to-[var(--allevo-action-end)] text-[var(--allevo-text-on-action)]">
          <Zap size={10} className="shrink-0" strokeWidth={2.5} />
          <span>{heroTag || 'Destaque'}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'p-2 rounded-[var(--radius-control)] border flex items-center justify-center transition-colors',
              selected
                ? 'bg-[var(--selection-subtle)] text-[var(--selection)] border-[var(--selection)]/30'
                : 'bg-[var(--action-subtle)] text-[var(--brand-strategy)] border-[var(--brand-strategy)]/20'
            )}
          >
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, {
              className: cn('shrink-0', selected ? 'text-[var(--selection)]' : 'text-[var(--brand-strategy)]'),
            }) : icon}
          </div>
          <span data-metric-title className={cn('uppercase', isHero ? 'text-zinc-200' : 'text-zinc-400')}>{title}</span>
        </div>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--selection)] shadow-sm shadow-[var(--selection)]/40" />}
      </div>

      <div className="mb-1">
        <h3 data-metric-value className={cn('tabular-nums mb-1 transition-colors', valueColor || 'text-white')}>{value}</h3>
        <p data-metric-subtext className="text-zinc-400 font-normal">{subtext}</p>
      </div>

      {comparison && (
        <div data-metric-comparison className="mt-3 pt-2.5 border-t border-[var(--border-hairline)] flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-chip)] font-bold text-xs tracking-wide shrink-0 border',
            comparison.isGood
              ? 'bg-[var(--status-positive)]/10 text-[var(--status-positive)] border-[var(--status-positive)]/20'
              : 'bg-[var(--status-negative)]/10 text-[var(--status-negative)] border-[var(--status-negative)]/20'
          )}>
            {comparison.percent > 0 ? (
              <TrendingUp size={11} />
            ) : comparison.percent < 0 ? (
              <TrendingDown size={11} />
            ) : (
              <Equal size={11} className="text-zinc-400" />
            )}
            <span>{comparison.formatted}</span>
          </div>

          <div
            className="text-xs text-zinc-400 font-medium flex w-full min-w-0 items-center gap-1 sm:w-auto sm:justify-end"
            title={comparison.prevFormatted ? `Valor no período anterior: ${comparison.prevFormatted}` : undefined}
          >
            <span className="truncate text-left sm:text-right">{comparisonLabel || 'vs. anterior'}</span>
            {comparison.prevFormatted && (
              <span className="text-zinc-200 font-bold bg-[var(--surface-3)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border-hairline)] shrink-0 text-xs font-mono tabular-nums">
                ({comparison.prevFormatted})
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
