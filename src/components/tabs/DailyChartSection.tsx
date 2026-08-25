import React from 'react';
import { Activity, Check } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line
} from 'recharts';
import { cn } from '../../lib/utils';

// Fallback hue for a series whose funnel isn't in `funnelColors` (e.g. "Sem
// origem"), so it never crashes — real funnels always come from the prop.
const UNKNOWN_FUNNEL_HUE = '#64748b';

// Secondary channel for line series beyond the first (which is always a solid
// Bar): with 10 selectable metrics sharing 8 CVD-safe hues, a couple of pairs
// sit closer than ideal, so pattern — not just hue — carries identity too.
// Index 0 is the Bar slot; index 1 (the first Line) stays solid.
const LINE_DASH_PATTERNS = [undefined, undefined, '7 4', '2 3', '10 3 2 3'];

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(hex: string, target: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const mix = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x + (y - x) * amount)));
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Main products: lighter tints of the family hue, base color first.
function familyPalette(baseHex: string, count: number) {
  return Array.from({ length: count }, (_, i) => mixHex(baseHex, '#ffffff', i * 0.22));
}

// Order Bumps: darker/muted tints of the same family hue — a related but
// visually receded variant, not a competing identity.
function familyOrderBumpPalette(baseHex: string, count: number) {
  return Array.from({ length: count }, (_, i) => mixHex(baseHex, '#0F1115', 0.35 + i * 0.15));
}

interface DailyChartSectionProps {
  dailyMetrics: any[];
  selectedMetrics: string[];
  setSelectedMetrics: React.Dispatch<React.SetStateAction<string[]>>;
  showMovingAverage: boolean;
  setShowMovingAverage: React.Dispatch<React.SetStateAction<boolean>>;
  METRIC_CONFIG: Record<string, any>;
  // Name -> hex, built from the same funnel list and index-based palette
  // that colors the funnel tags/checkboxes in Dashboard.tsx, so a funnel's
  // color is identical everywhere it appears, never guessed from its name.
  funnelColors: Record<string, string>;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
}

export const DailyChartSection: React.FC<DailyChartSectionProps> = ({
  dailyMetrics,
  selectedMetrics,
  setSelectedMetrics,
  showMovingAverage,
  setShowMovingAverage,
  METRIC_CONFIG,
  funnelColors,
  formatCurrency,
  formatNumber
}) => {
  const hasCurrencyMetric = selectedMetrics.some((key) => METRIC_CONFIG[key]?.type === 'currency');
  const hasQuantityMetric = selectedMetrics.some((key) => METRIC_CONFIG[key]?.type !== 'currency');
  // Each funnel keeps the exact hue shown on its tag/checkbox elsewhere in the
  // dashboard; products within it are lighter tints of that hue, Order Bumps
  // are darker/muted tints — an ordinal ramp per family rather than a second,
  // unrelated hue (legend text already labels "OB", so the ramp only needs
  // to read as "same family, different item").
  const productTotals: Record<string, number> = dailyMetrics.reduce((totals: Record<string, number>, day: any) => {
    Object.entries(day.productSales || {}).forEach(([product, sales]) => {
      totals[product] = (totals[product] || 0) + Number(sales || 0);
    });
    return totals;
  }, {} as Record<string, number>);
  const getSeriesMeta = (series: string) => {
    const [funnel = 'Sem origem', kind = 'main', ...productParts] = series.split('::');
    return {
      funnel: funnel.trim() || 'Sem origem',
      isOrderBump: kind === 'ob',
      product: productParts.join('::') || series
    };
  };
  const sortedProducts = Object.entries(productTotals).sort(([, a], [, b]) => b - a);
  const orderBumpProducts = sortedProducts.filter(([product]) => getSeriesMeta(product).isOrderBump);
  const mainProducts = sortedProducts.filter(([product]) => !getSeriesMeta(product).isOrderBump);
  // Keep the chart legible while always showing every Order Bump accepted in the period.
  const products = [...mainProducts.slice(0, 6), ...orderBumpProducts].map(([product]) => product);
  const compactProductName = (product: string) => product
      .replace(/^Curso do Livro\s*[-–]?\s*/i, '')
      .replace(/^Livro Digital\s*/i, 'Livro ')
      .replace(/Gestão de Projetos com Inteligência Artificial/gi, 'Gestão IA')
      .replace(/Gestão de Projetos com IA/gi, 'Gestão IA')
      .replace(/Estratégia em Ação:\s*PMOs\s*&\s*VMOs/gi, 'Livro')
      .replace(/Estratégia em Ação/gi, 'Estratégia')
      .replace(/Base de Conhecimento \+ Copiloto de Leitura/gi, 'Base + Cop.');
  const compactLegendLabel = (series: string) => {
    const { funnel, isOrderBump, product } = getSeriesMeta(series);
    const funnelName = /estrat(é|e)gia/i.test(funnel)
      ? 'Estrat.'
      : /gest(ã|a)o/i.test(funnel)
        ? 'Gestão'
        : funnel.length > 15 ? `${funnel.slice(0, 15)}...` : funnel;
    return `${funnelName} · ${isOrderBump ? 'OB · ' : ''}${compactProductName(product)}`;
  };
  const fullSeriesLabel = (series: string) => {
    const { funnel, isOrderBump, product } = getSeriesMeta(series);
    return `${isOrderBump ? 'Order Bump · ' : ''}${funnel} · ${product}`;
  };
  const productColor = (series: string) => {
    const { funnel, isOrderBump } = getSeriesMeta(series);
    const baseHue = funnelColors[funnel] || UNKNOWN_FUNNEL_HUE;
    const siblings = (isOrderBump ? orderBumpProducts : mainProducts).filter(([name]) => getSeriesMeta(name).funnel === funnel);
    const palette = isOrderBump ? familyOrderBumpPalette(baseHue, siblings.length) : familyPalette(baseHue, siblings.length);
    const index = siblings.findIndex(([name]) => name === series);
    return palette[Math.max(index, 0) % palette.length];
  };
  const productChartData = dailyMetrics.map((day) => {
    const point: Record<string, string | number> = { date: day.date };
    products.forEach((product, index) => {
      point[`product_${index}`] = Number(day.productSales?.[product] || 0);
    });
    return point;
  });

  return (
    <div className="bg-[var(--panel)]/95 rounded-[var(--radius-panel)] border border-[var(--border-hairline)] p-5 sm:p-6 shadow-[var(--elevation-2)]">
      <div className="flex flex-col gap-4 mb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[length:var(--type-section)] font-bold text-white">Histórico diário</h3>
            <p className="mt-1 text-sm text-zinc-400 font-medium">Selecione até cinco métricas para comparar.</p>
          </div>
          <button
            onClick={() => setSelectedMetrics([])}
            className="min-h-11 self-start sm:self-auto text-xs font-bold px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.04] rounded-[var(--radius-control)] transition-colors border border-[var(--border-hairline)] cursor-pointer"
          >
            Limpar seleção
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 mr-1">Análise</span>
          <button
            type="button"
            onClick={() => setShowMovingAverage(prev => !prev)}
            aria-pressed={showMovingAverage}
            className={cn(
              "min-h-11 flex items-center gap-2 cursor-pointer select-none text-xs font-bold px-3 py-2 rounded-[var(--radius-control)] border transition-colors",
              showMovingAverage
                ? "bg-[var(--selection-subtle)] border-[var(--selection)]/50 text-[var(--selection)]"
                : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white hover:border-white/20"
            )}
          >
            <div className={cn(
              "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-all shrink-0",
              showMovingAverage
                ? "bg-[var(--selection)] border-[var(--selection)] shadow-sm shadow-[var(--selection)]/30"
                : "bg-[#1C1C1C] border-[#383838]"
            )}>
              {showMovingAverage && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            <span className="flex items-center gap-1.5">
              <Activity size={13} className="text-[var(--selection)]" /> Média Móvel (7D)
            </span>
          </button>
        </div>
      </div>

      <div className="h-[320px] sm:h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dailyMetrics}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
            <XAxis dataKey="date" tick={{ fill: '#A3A3A3', fontSize: 12, fontFamily: 'monospace' }} tickLine={false} axisLine={{ stroke: '#262626' }} dy={10} />
            
            {hasCurrencyMetric && (
              <YAxis 
                yAxisId="currency"
                orientation="left"
                tick={{ fill: '#A3A3A3', fontSize: 12, fontFamily: 'monospace' }}
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => `R$ ${val}`}
              />
            )}
            {hasQuantityMetric && (
              <YAxis 
                yAxisId="number"
                orientation="right"
                tick={{ fill: '#A3A3A3', fontSize: 12, fontFamily: 'monospace' }}
                tickLine={false} 
                axisLine={false} 
              />
            )}
            
            <Tooltip 
              formatter={(value: any, name: string) => {
                const isMM = typeof name === 'string' && name.startsWith('MM 7D');
                const cleanName = isMM ? name.replace(/^MM 7D \((.*)\)$/, '$1') : name;
                const metricKey = Object.keys(METRIC_CONFIG).find(k => METRIC_CONFIG[k].label === cleanName);
                let formattedVal = value;
                if (typeof value === 'number') {
                  if (metricKey && METRIC_CONFIG[metricKey].type === 'currency') {
                    formattedVal = formatCurrency(value);
                  } else if (metricKey && METRIC_CONFIG[metricKey].type === 'percent') {
                    formattedVal = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value);
                  } else {
                    formattedVal = formatNumber(value);
                  }
                }
                return [formattedVal, name];
              }}
              contentStyle={{ 
                backgroundColor: '#151922', 
                borderColor: 'rgba(148, 163, 184, 0.18)', 
                borderRadius: '8px', 
                color: '#EDEDED', 
                fontWeight: 'bold',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontFamily: 'monospace', fontSize: '12px' }} iconType="circle" />
            
            {selectedMetrics.map((key, index) => {
              const config = METRIC_CONFIG[key];
              if (!config) return null;
              const yAxisId = config.type === 'currency' ? 'currency' : 'number';

              return (
                <React.Fragment key={key}>
                  {index === 0 ? (
                    <Bar 
                      key={key} 
                      dataKey={key} 
                      name={config.label} 
                      fill={config.color} 
                      radius={[4, 4, 0, 0]} 
                      yAxisId={yAxisId} 
                    />
                  ) : (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={config.label}
                      stroke={config.color}
                      strokeWidth={2.5}
                      strokeDasharray={LINE_DASH_PATTERNS[index % LINE_DASH_PATTERNS.length]}
                      dot={{ r: 3.5, strokeWidth: 1.5, fill: '#121212' }}
                      activeDot={{ r: 5 }}
                      yAxisId={yAxisId}
                    />
                  )}

                  {showMovingAverage && (
                    <Line 
                      key={`${key}_mm7`}
                      type="monotone" 
                      dataKey={`${key}_mm7`} 
                      name={`MM 7D (${config.label})`} 
                      stroke={config.color}
                      strokeWidth={2} 
                      strokeDasharray="5 4" 
                      strokeOpacity={0.72}
                      dot={false} 
                      activeDot={{ r: 4 }} 
                      yAxisId={yAxisId} 
                    />
                  )}
                </React.Fragment>
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {products.length > 0 && (
        <section className="mt-8 border-t border-[var(--border-hairline)] pt-6">
          <div className="mb-4">
            <h3 className="text-[length:var(--type-section)] font-bold text-white">Vendas por produto e Order Bump</h3>
            <p className="mt-1 text-sm text-zinc-400 font-medium">Produto principal e Order Bump vendidos por dia no período selecionado.</p>
          </div>
          <div className="h-[260px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={productChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                <XAxis dataKey="date" tick={{ fill: '#A3A3A3', fontSize: 12, fontFamily: 'monospace' }} tickLine={false} axisLine={{ stroke: '#262626' }} dy={10} />
                <YAxis allowDecimals={false} tick={{ fill: '#A3A3A3', fontSize: 12, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatNumber(value), fullSeriesLabel(name)]}
                  contentStyle={{ backgroundColor: '#151922', borderColor: 'rgba(148, 163, 184, 0.18)', borderRadius: '8px', color: '#EDEDED', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '12px' }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '16px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '18px' }}
                  iconType="circle"
                  formatter={(value: string) => <span title={fullSeriesLabel(value)}>{compactLegendLabel(value)}</span>}
                />
                {products.map((product, index) => (
                  <Bar
                    key={product}
                    dataKey={`product_${index}`}
                    name={product}
                    stackId="products"
                    fill={productColor(product)}
                    radius={index === products.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
};
