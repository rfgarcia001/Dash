import React from 'react';
import { Monitor } from 'lucide-react';
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip } from 'recharts';
import { cn } from '../../lib/utils';
import { SortableHeader } from '../ui/SortableHeader';
import { SectionHeader } from '../ui/SectionHeader';
import { Card } from '../ui/Card';
import { RankBadge } from '../ui/Badge';
import { EmptyState, EmptyTableRow } from '../ui/EmptyState';

interface FontesTabProps {
  metricsData: any;
  selectedSourceIndices: number[];
  setSelectedSourceIndices: React.Dispatch<React.SetStateAction<number[]>>;
  sortedPages: any[];
  pageSort: { column: string; direction: 'asc' | 'desc' };
  togglePageSort: (column: string) => void;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
  formatPercent: (val: number) => string;
}

export const FontesTab: React.FC<FontesTabProps> = ({
  metricsData,
  selectedSourceIndices,
  setSelectedSourceIndices,
  sortedPages,
  pageSort,
  togglePageSort,
  formatCurrency,
  formatNumber,
  formatPercent
}) => {
  return (
    <div className="flex flex-col gap-5 sm:gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8">
        {/* Distribuição por Fonte */}
        <Card className="lg:col-span-4 flex flex-col h-fit lg:min-h-[600px]">
          <SectionHeader title="Distribuição por fonte" subtitle="Origem das vendas captadas" className="mb-4 flex-col items-start gap-0" />

          <div className="w-full flex justify-center mt-2 mb-4" style={{ height: '300px' }}>
            {metricsData.sources.filter((s:any) => s.count > 0).length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={metricsData.sources.filter((s:any) => s.count > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="80%"
                    paddingAngle={2}
                    dataKey="count"
                    stroke="none"
                  >
                    {metricsData.sources.filter((s:any) => s.count > 0).map((entry: any) => {
                      const isSelected = selectedSourceIndices.includes(entry.originalIndex);
                      return (
                        <Cell
                          key={`cell-${entry.originalIndex}`}
                          fill={entry.hex}
                          fillOpacity={selectedSourceIndices.length > 0 && !isSelected ? 0.3 : 1}
                          className="transition-all duration-300 outline-none"
                          style={{
                            transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                            transformOrigin: 'center'
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: string, props: any) => [`${value} vendas (${formatCurrency(props.payload.revenue)})`, name]}
                    contentStyle={{
                      backgroundColor: '#1C1C1C',
                      borderColor: '#262626',
                      borderRadius: '8px',
                      color: '#EDEDED',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex justify-center items-center h-full text-zinc-500 font-medium">Nenhum dado encontrado.</div>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--border-hairline)] pt-6 animate-in fade-in duration-300">
            <h4 className="text-xs font-bold text-[var(--brand-strategy)] uppercase tracking-wider mb-4">Análise da seleção</h4>
            {(() => {
              const selectedSources = metricsData.sources.filter((s:any) => selectedSourceIndices.includes(s.originalIndex));
              const totalSelectedVendas = selectedSources.reduce((acc: number, curr: any) => acc + curr.count, 0);
              const totalSelectedReceita = selectedSources.reduce((acc: number, curr: any) => acc + curr.revenue, 0);
              const percVendas = metricsData.totalSalesWithSource > 0 ? totalSelectedVendas / metricsData.totalSalesWithSource : 0;

              return (
                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-center bg-[var(--surface-3)] p-3 rounded-[var(--radius-control)] border border-[var(--border-hairline)]">
                    <span className="text-xs font-bold text-[var(--brand-strategy)] uppercase">Vendas na seleção</span>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[var(--brand-strategy)] font-mono tabular-nums">{totalSelectedVendas} <span className="text-xs font-medium text-zinc-400">vendas</span></div>
                      <div className="text-xs text-zinc-300 font-mono tabular-nums">{formatCurrency(totalSelectedReceita)}</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-[var(--surface-3)]/60 p-2.5 rounded-[var(--radius-control)] border border-[var(--border-hairline)]">
                    <span className="text-xs text-zinc-400">% das {metricsData.totalSalesWithSource} vendas totais</span>
                    <span className="text-sm font-bold text-[var(--brand-strategy)] font-mono tabular-nums">{formatPercent(percVendas)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[var(--surface-3)]/60 p-2.5 rounded-[var(--radius-control)] border border-[var(--border-hairline)]">
                    <span className="text-xs text-zinc-400">% da receita total</span>
                    <span className="text-sm font-bold text-[var(--brand-strategy)] font-mono tabular-nums">{formatPercent(metricsData.totalRevenueWithSource > 0 ? totalSelectedReceita / metricsData.totalRevenueWithSource : 0)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>

        {/* Ranking de Fontes */}
        <Card className="lg:col-span-8 overflow-hidden flex flex-col lg:max-h-[800px]">
          <SectionHeader title="Ranking de fontes" subtitle="Performance por canal de aquisição" className="mb-6 flex-col items-start gap-0 flex-shrink-0" />

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="flex flex-col gap-6">
              {[
                { title: "Tráfego Pago", items: metricsData.sources.filter((s:any) => s.category === "Tráfego Pago") },
                { title: "Tráfego Orgânico", items: metricsData.sources.filter((s:any) => s.category === "Orgânico") },
                { title: "Disparos", items: metricsData.sources.filter((s:any) => s.category === "Disparos") },
                { title: "Sem Origem", items: metricsData.sources.filter((s:any) => s.category === "Sem Origem") },
                { title: "Outros", items: metricsData.sources.filter((s:any) => s.category === "Outros") }
              ].filter(g => g.items.length > 0).map((group) => (
                <div key={group.title} className="flex flex-col gap-3">
                  <h4 className="flex items-center flex-wrap gap-2 font-bold text-zinc-200 uppercase tracking-tight ml-1 text-xs">
                    <span>{group.title}</span>
                    {group.items.length > 1 && (() => {
                      const gSales = group.items.reduce((acc: number, curr: any) => acc + curr.count, 0);
                      const gRev = group.items.reduce((acc: number, curr: any) => acc + curr.revenue, 0);
                      const gPerc = metricsData.totalSalesWithSource > 0 ? gSales / metricsData.totalSalesWithSource : 0;
                      return (
                        <div className="flex items-center gap-2 mt-px font-mono tabular-nums">
                          <span className="text-[10px] pb-[2px] text-zinc-600">|</span>
                          <span className="text-[10px] text-zinc-400 font-bold">{gSales} vendas</span>
                          <span className="text-[10px] pb-[2px] text-zinc-600">|</span>
                          <span className="text-[10px] text-zinc-400 font-bold">{formatPercent(gPerc)} do total</span>
                          <span className="text-[10px] pb-[2px] text-zinc-600">|</span>
                          <span className="text-[10px] text-[var(--brand-strategy)] font-bold">{formatCurrency(gRev)}</span>
                        </div>
                      );
                    })()}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {group.items.map((source: any) => {
                      const percentage = metricsData.totalSalesWithSource > 0
                        ? (source.count / metricsData.totalSalesWithSource)
                        : 0;
                      const isSelected = selectedSourceIndices.includes(source.originalIndex);

                      return (
                        <button
                          key={source.name}
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`${source.name}: ${formatNumber(source.count)} vendas. ${isSelected ? 'Remover do filtro' : 'Adicionar ao filtro'}`}
                          onClick={() => setSelectedSourceIndices(prev =>
                            prev.includes(source.originalIndex)
                              ? prev.filter(i => i !== source.originalIndex)
                              : [...prev, source.originalIndex]
                          )}
                          className={cn("flex w-full items-center justify-between p-3.5 rounded-[var(--radius-control)] border bg-[var(--surface-3)] cursor-pointer transition-all group text-left",
                            isSelected ? "border-[var(--selection)] shadow-lg ring-2 ring-[var(--selection)]/25" : "border-[var(--border-hairline)] shadow-sm hover:shadow-md hover:border-white/20"
                          )}
                        >
                          <div className="flex items-center gap-3.5">
                            <RankBadge rank={source.rank} className={cn(source.bg, "text-white border-transparent shadow-sm", isSelected && "scale-105")} />
                            <div>
                              <h4 className="font-bold text-zinc-100 text-sm">{source.name}</h4>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mt-0.5">{source.category}</p>
                            </div>
                          </div>

                          <div className="text-right font-mono tabular-nums">
                            <div className="font-bold text-zinc-100 text-base">
                              {formatNumber(source.count)} <span className="text-[10px] font-medium text-zinc-500 uppercase">vendas</span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5 flex items-center justify-end gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold",
                                percentage >= 0.2 ? "bg-[var(--brand-strategy)]/15 text-[var(--brand-strategy)]" : "text-zinc-500 bg-black/20"
                              )}>
                                {formatPercent(percentage)} do total
                              </span>
                              <span className="text-zinc-700">|</span>
                              <span className="text-[var(--brand-strategy)] font-bold">{formatCurrency(source.revenue)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {metricsData.sources.length === 0 && (
                <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--border-hairline)]">
                  <EmptyState title="Nenhum dado encontrado para este período." />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Análise de Vendas por Página */}
      <div className="table-panel overflow-hidden flex flex-col mt-2">
        <div className="p-4 sm:p-6 border-b border-[var(--border-hairline)]">
          <SectionHeader title="Análise de vendas por página" subtitle="Tráfego gerado x vendas convertidas" />
        </div>
        <div className="table-scroll-region overflow-x-auto" tabIndex={0} aria-label="Tabela de vendas por página. Deslize horizontalmente para ver todas as colunas.">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="table-heading font-mono font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <SortableHeader column="url" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort}>Página</SortableHeader>
                <SortableHeader column="pageViews" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right">Acessos</SortableHeader>
                <SortableHeader column="checkouts" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right">Checkouts</SortableHeader>
                <SortableHeader column="taxIC" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right">Taxa IC</SortableHeader>
                <SortableHeader column="salesMeta" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right">Vendas (tráfego)</SortableHeader>
                <SortableHeader column="taxVenda" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right">Tx. venda</SortableHeader>
                <SortableHeader column="salesOther" activeColumn={pageSort.column} direction={pageSort.direction} onSort={togglePageSort} align="right" className="border-l border-[var(--table-divider)]">Vendas (orgânico/outros)</SortableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-zinc-300 font-mono text-xs">
              {sortedPages.map((page: any) => {
                 const taxIC = page.pageViews > 0 ? page.checkouts / page.pageViews : 0;
                 const taxVenda = page.checkouts > 0 ? page.salesMeta / page.checkouts : 0;
                 return (
                   <tr key={page.url} className="hover:bg-white/[0.045] transition-colors">
                     <td className="px-6 py-4 font-sans">
                       <div className="font-bold text-zinc-100 flex items-center gap-2">
                         <Monitor size={14} className="text-zinc-500" />
                         <a href={page.url.startsWith('http') ? page.url : `https://${page.url}`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--brand-strategy)] transition-colors">
                           {page.slug}
                         </a>
                       </div>
                       <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[200px] xl:max-w-xs">{page.url}</div>
                     </td>
                     <td className="px-6 py-4 text-right text-zinc-300 tabular-nums">{formatNumber(page.pageViews)}</td>
                     <td className="px-6 py-4 text-right text-zinc-300 tabular-nums">{formatNumber(page.checkouts)}</td>
                     <td className="px-6 py-4 text-right font-bold text-[var(--brand-strategy)] bg-[var(--brand-strategy)]/5 tabular-nums">{formatPercent(taxIC)}</td>
                     <td className="px-6 py-4 text-right font-bold text-[var(--brand-strategy)] tabular-nums">{formatNumber(page.salesMeta)}</td>
                     <td className="px-6 py-4 text-right font-bold text-[var(--brand-strategy)] bg-[var(--brand-strategy)]/5 tabular-nums">{formatPercent(taxVenda)}</td>
                     <td className="px-6 py-4 text-right text-zinc-400 border-l border-[var(--border-hairline)] tabular-nums">{formatNumber(page.salesOther)}</td>
                   </tr>
                 )
              })}
              {metricsData.pagesList.length === 0 && (
                <EmptyTableRow colSpan={7} title="Nenhuma página identificada no período." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
