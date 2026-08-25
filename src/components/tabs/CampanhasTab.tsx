import React from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { SortableHeader } from '../ui/SortableHeader';
import { EmptyTableRow } from '../ui/EmptyState';

interface CampanhasTabProps {
  sortedCampaigns: any[];
  campaignSort: { column: string; direction: 'asc' | 'desc' };
  toggleCampaignSort: (column: string) => void;
  expandedCampaigns: Record<string, boolean>;
  toggleCampaign: (name: string) => void;
  campaignTotals: any;
  metricsCampaignsCount: number;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
  formatPercent: (val: number) => string;
}

export const CampanhasTab: React.FC<CampanhasTabProps> = ({
  sortedCampaigns,
  campaignSort,
  toggleCampaignSort,
  expandedCampaigns,
  toggleCampaign,
  campaignTotals,
  metricsCampaignsCount,
  formatCurrency,
  formatNumber,
  formatPercent
}) => {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="table-panel overflow-hidden">
        <div className="table-scroll-region overflow-x-auto" tabIndex={0} aria-label="Tabela de campanhas. Deslize horizontalmente para ver todas as colunas.">
          <table className="w-full text-left text-sm whitespace-nowrap lg:whitespace-normal">
            <thead className="table-heading font-mono font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <SortableHeader column="name" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort}>Campanha / Conjunto</SortableHeader>
                <SortableHeader column="investimento" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">Gasto</SortableHeader>
                <SortableHeader column="impressoes" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">Impressões</SortableHeader>
                <SortableHeader column="cpm" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">CPM</SortableHeader>
                <SortableHeader column="cliques" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">Cliques</SortableHeader>
                <SortableHeader column="cpc" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">CPC</SortableHeader>
                <SortableHeader column="ctr" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">CTR</SortableHeader>
                <SortableHeader column="comprasTrafego" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">Livros vendidos</SortableHeader>
                <SortableHeader column="cpa" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">CPA</SortableHeader>
                <SortableHeader column="roas" activeColumn={campaignSort.column} direction={campaignSort.direction} onSort={toggleCampaignSort} align="right">ROAS</SortableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-zinc-300 font-mono text-xs">
              {sortedCampaigns.map((camp: any) => (
                <React.Fragment key={camp.name}>
                  <tr className="hover:bg-white/[0.045] transition-colors group bg-transparent">
                    <td className="px-3.5 py-3 font-sans font-bold text-zinc-100 flex items-center gap-2 max-w-[220px] xl:max-w-[320px]">
                      <button type="button" onClick={() => toggleCampaign(camp.name)} aria-expanded={Boolean(expandedCampaigns[camp.name])} className="min-h-11 min-w-11 -my-2 inline-flex shrink-0 items-center justify-center rounded-[6px] text-[var(--text-subtle)] hover:bg-white/[0.06] hover:text-[var(--brand-strategy)]" aria-label={`${expandedCampaigns[camp.name] ? 'Recolher' : 'Expandir'} ${camp.name}`}>
                        {expandedCampaigns[camp.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="truncate" title={camp.name}>{camp.name}</span>
                    </td>
                    <td className="px-3.5 py-3 text-right font-bold text-zinc-100">{formatCurrency(camp.investimento)}</td>
                    <td className="px-3.5 py-3 text-right text-zinc-300">{formatNumber(camp.impressoes)}</td>
                    <td className="px-3.5 py-3 text-right text-zinc-400">{formatCurrency(camp.cpm)}</td>
                    <td className="px-3.5 py-3 text-right text-zinc-200">{formatNumber(camp.cliques)}</td>
                    <td className="px-3.5 py-3 text-right text-zinc-400">{formatCurrency(camp.cpc)}</td>
                    <td className="px-3.5 py-3 text-right text-zinc-400">{formatPercent(camp.ctr)}</td>
                    <td className="px-3.5 py-3 text-right font-bold text-[var(--brand-strategy)] border-l border-[var(--border-hairline)]">{camp.comprasTrafego}</td>
                    <td className="px-3.5 py-3 text-right font-bold text-zinc-200">{formatCurrency(camp.cpa)}</td>
                    <td className="px-3.5 py-3 text-right font-black text-[var(--brand-strategy)]">{(camp.roas || 0).toFixed(2)}x</td>
                  </tr>
                  
                  {expandedCampaigns[camp.name] && camp.sets.map((set: any) => (
                    <tr key={`${camp.name}-${set.name}`} className="bg-black/10 hover:bg-white/[0.035] transition-colors">
                      <td className="px-3.5 py-2.5 pl-8 text-zinc-400 font-sans flex items-center gap-2 max-w-[220px] xl:max-w-[320px]">
                        <Layers size={13} className="text-zinc-500 shrink-0" />
                        <span className="truncate text-[11px]" title={set.name}>{set.name}</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-300">{formatCurrency(set.investimento)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-400">{formatNumber(set.impressoes)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-500">{formatCurrency(set.cpm)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-300">{formatNumber(set.cliques)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-500">{formatCurrency(set.cpc)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] text-zinc-500">{formatPercent(set.ctr)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] font-bold text-[var(--brand-strategy)] border-l border-[var(--border-hairline)]">{set.comprasTrafego}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] font-bold text-zinc-300">{formatCurrency(set.cpa)}</td>
                      <td className="px-3.5 py-2.5 text-right text-[11px] font-bold text-[var(--brand-strategy)]">{(set.roas || 0).toFixed(2)}x</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {metricsCampaignsCount === 0 && (
                <EmptyTableRow colSpan={10} title="Nenhuma campanha encontrada neste período." subtitle="Altere o período ou sincronize a planilha novamente." />
              )}
            </tbody>
            {metricsCampaignsCount > 0 && (
              <tfoot className="bg-white/[0.045] border-t border-white/10 font-mono font-bold text-zinc-100">
                <tr>
                  <td className="px-3.5 py-4 text-[11px] uppercase tracking-wider text-[var(--brand-strategy)] font-mono">Total do Período</td>
                  <td className="px-3.5 py-4 text-right">{formatCurrency(campaignTotals.investimento)}</td>
                  <td className="px-3.5 py-4 text-right">{formatNumber(campaignTotals.impressoes)}</td>
                  <td className="px-3.5 py-4 text-right">{formatCurrency(campaignTotals.impressoes > 0 ? (campaignTotals.investimento / campaignTotals.impressoes) * 1000 : 0)}</td>
                  <td className="px-3.5 py-4 text-right">{formatNumber(campaignTotals.cliques)}</td>
                  <td className="px-3.5 py-4 text-right">{formatCurrency(campaignTotals.cliques > 0 ? campaignTotals.investimento / campaignTotals.cliques : 0)}</td>
                  <td className="px-3.5 py-4 text-right">{formatPercent(campaignTotals.impressoes > 0 ? campaignTotals.cliques / campaignTotals.impressoes : 0)}</td>
                  <td className="px-3.5 py-4 text-right text-[var(--brand-strategy)]">{campaignTotals.compras}</td>
                  <td className="px-3.5 py-4 text-right">{formatCurrency(campaignTotals.compras > 0 ? campaignTotals.investimento / campaignTotals.compras : 0)}</td>
                  <td className="px-3.5 py-4 text-right text-[var(--brand-strategy)]">{campaignTotals.investimento > 0 ? (campaignTotals.faturamento / campaignTotals.investimento).toFixed(2) : '0.00'}x</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
