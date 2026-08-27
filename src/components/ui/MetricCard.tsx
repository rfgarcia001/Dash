import React from 'react';
import { Equal, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtext?: string;
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
  /** Per-funnel values shown as a colored-dot legend when 2-3 funnels are
   * selected; the big `value` above stays the combined total either way. */
  breakdown?: { name: string; color: string; value: string }[];
}

export function MetricCard({
  title, value, subtext, icon, valueColor, className, selected, isHero, heroTag,
  comparison, comparisonLabel, onClick, breakdown,
}: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${title}: ${value}. ${selected ? 'Remover do gráfico' : 'Adicionar ao gráfico'}`}
      className={cn(
        'metric-card appearance-none rounded-[var(--radius-panel)] border p-4 flex flex-col justify-between transition-all duration-[var(--motion-base)] relative text-left w-full',
        // overflow-hidden only clips the isHero corner ribbon — applying it
        // unconditionally was clipping the value/comparison text in compact
        // cards whenever a long currency amount needed to wrap to 2 lines.
        isHero ? 'overflow-hidden ring-1 ring-[var(--brand-strategy)]/15 hover:border-[var(--brand-strategy)]/50' : 'hover:border-slate-500/40',
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
                ? 'bg-[var(--selection-subtle)] text-[var(--selection-ink)] border-[var(--selection-ink)]/30'
                : 'bg-[var(--action-subtle)] text-[var(--brand-strategy-ink)] border-[var(--brand-strategy-ink)]/20'
            )}
          >
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, {
              className: cn('shrink-0', selected ? 'text-[var(--selection-ink)]' : 'text-[var(--brand-strategy-ink)]'),
            }) : icon}
          </div>
          <span data-metric-title className={cn('uppercase', isHero ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>{title}</span>
        </div>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--selection)] shadow-sm shadow-[var(--selection)]/40" />}
      </div>

      <div className="mb-1">
        <h3 data-metric-value className={cn('tabular-nums mb-1 transition-colors break-words', valueColor || 'text-[var(--text-primary)]')}>{value}</h3>
        {/* Always rendered (invisible when empty) so cards without a subtext
            reserve the same line height — otherwise their breakdown dots
            sit a line higher than a sibling card that has one, misaligning
            the whole row (e.g. only Investimento Total keeps "Valor com
            impostos" while the other 3 hero cards have none). */}
        <p data-metric-subtext className={cn('text-[var(--text-muted)] font-normal', !subtext && 'invisible')}>{subtext || ' '}</p>
        {breakdown && breakdown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {breakdown.map((item) => (
              <span key={item.name} title={item.name} aria-label={`${item.name}: ${item.value}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                {item.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {comparison && (
        // flex-wrap (not a fixed single row) lets the badge/label/chip drop to
        // a second line as whole units on narrow compact cards, instead of
        // being squeezed until the label collapses to zero width or overflows.
        <div data-metric-comparison className="mt-3 pt-2.5 border-t border-[var(--border-hairline)] flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
              <Equal size={11} className="text-[var(--text-muted)]" />
            )}
            <span>{comparison.formatted}</span>
          </div>

          <div
            className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1"
            title={comparison.prevFormatted ? `Valor no período anterior: ${comparison.prevFormatted}` : undefined}
          >
            <span className="whitespace-nowrap">{comparisonLabel || 'vs. anterior'}</span>
            {comparison.prevFormatted && (
              <span className="text-[var(--text-primary)] font-bold bg-[var(--surface-3)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border-hairline)] shrink-0 text-xs font-mono tabular-nums">
                ({comparison.prevFormatted})
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
