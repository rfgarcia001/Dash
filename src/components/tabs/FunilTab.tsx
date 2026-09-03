import React from 'react';
import { Eye, MousePointerClick, Monitor, ShoppingCart, Ticket, Plus, Equal, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyTableRow } from '../ui/EmptyState';

interface FunilTabProps {
  geral: any;
  metricsData: any;
  sortedCampaigns: any[];
  expandedCampaigns: Record<string, boolean>;
  toggleCampaign: (name: string) => void;
  campaignTotals: any;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
  formatPercent: (val: number) => string;
}

function FunnelStep({ label, icon, value, tone, formatNumber }: { label: string; icon: React.ReactNode; value: number; tone: 'brand' | 'management' | 'neutral'; formatNumber: (val: number) => string }) {
  const toneClasses = tone === 'brand'
    ? 'bg-[var(--brand-strategy)] text-[var(--allevo-text-on-action)]'
    : tone === 'management'
      ? 'bg-[var(--brand-management)] text-[var(--allevo-text-on-action)]'
      : 'bg-[var(--surface-3)] border border-[var(--border-hairline)] text-[var(--text-primary)]';
  return (
    <div className={`w-full rounded-[var(--radius-panel)] py-4 flex flex-col items-center justify-center shadow-md ${toneClasses}`}>
      <div className="flex items-center gap-2 text-[length:var(--type-caption)] font-bold uppercase tracking-widest mb-1 opacity-90">
        {icon} {label}
      </div>
      <div className="font-mono font-bold text-3xl tabular-nums">{formatNumber(value)}</div>
    </div>
  );
}

function ConnectorRate({ label, value, formatPercent }: { label: string; value: number; formatPercent: (val: number) => string }) {
  return (
    <div className="flex flex-col items-center my-1 relative h-12 w-full max-w-xs">
      <div className="w-px h-full bg-[var(--border-hairline)] absolute left-1/2 top-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--surface-2)] border border-[var(--border-hairline)] rounded-full px-4 py-1.5 shadow-md whitespace-nowrap z-10 flex flex-col items-center">
        <span className="text-[length:var(--type-caption)] font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono font-bold text-[var(--brand-strategy-ink)] tabular-nums">{formatPercent(value)}</span>
      </div>
    </div>
  );
}

export const FunilTab: React.FC<FunilTabProps> = ({
  geral,
  metricsData,
  sortedCampaigns,
  expandedCampaigns,
  toggleCampaign,
  campaignTotals,
  formatCurrency,
  formatNumber,
  formatPercent
}) => {
  const outrasVendas = metricsData.sources.filter((s: any) => s.name !== 'META' && s.count > 0);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Visual Funnel Card */}
      <Card className="flex flex-col items-center w-full min-h-[400px] p-6 sm:p-10">
        <div className="w-full max-w-3xl">
          <FunnelStep label="1. Impressões" icon={<Eye size={12} />} value={geral.impressoesTotal} tone="neutral" formatNumber={formatNumber} />
        </div>
        <ConnectorRate label="CTR (Cliques / Imp.)" value={geral.impressoesTotal > 0 ? geral.cliquesTotal / geral.impressoesTotal : 0} formatPercent={formatPercent} />

        <div className="w-full max-w-2xl">
          <FunnelStep label="2. Cliques no Link" icon={<MousePointerClick size={12} />} value={geral.cliquesTotal} tone="management" formatNumber={formatNumber} />
        </div>
        <ConnectorRate label="Views Pag / Clique" value={geral.cliquesTotal > 0 ? geral.pageViewsTotal / geral.cliquesTotal : 0} formatPercent={formatPercent} />

        <div className="w-full max-w-xl">
          <FunnelStep label="3. Page Views Destino" icon={<Monitor size={12} className="rotate-90" />} value={geral.pageViewsTotal} tone="management" formatNumber={formatNumber} />
        </div>
        <ConnectorRate label="Checkout / View" value={geral.pageViewsTotal > 0 ? geral.checkoutsTotal / geral.pageViewsTotal : 0} formatPercent={formatPercent} />

        <div className="w-full max-w-lg">
          <FunnelStep label="4. Initiate Checkout" icon={<ShoppingCart size={12} />} value={geral.checkoutsTotal} tone="management" formatNumber={formatNumber} />
        </div>
        <ConnectorRate label="Venda / Checkout" value={geral.checkoutsTotal > 0 ? geral.vendasTrafego / geral.checkoutsTotal : 0} formatPercent={formatPercent} />

        {/* Step 5: Vendas */}
        <div className="flex flex-col items-center gap-1 w-full max-w-md">
          <div className="w-full">
            <FunnelStep label="5. Vendas (Tráfego Meta)" icon={<Ticket size={12} />} value={geral.vendasTrafego} tone="brand" formatNumber={formatNumber} />
          </div>

          <div className="text-[var(--text-subtle)] font-bold"><Plus size={16} strokeWidth={3} /></div>

          <div className="w-full relative group">
            <button
              type="button"
              className="w-full bg-[var(--surface-3)] border border-[var(--border-hairline)] text-[var(--text-primary)] rounded-[var(--radius-panel)] py-2.5 flex flex-col items-center justify-center shadow-sm hover:border-[var(--brand-strategy)]/50 transition-colors focus-visible:border-[var(--brand-strategy-ink)]"
              aria-describedby="funil-outras-vendas-tooltip"
            >
              <span className="text-[length:var(--type-caption)] font-bold uppercase tracking-widest mb-0.5 text-[var(--text-muted)]">Vendas (Outras / Orgânicas)</span>
              <span className="font-mono font-bold text-3xl leading-none text-[var(--brand-strategy-ink)] tabular-nums">{formatNumber(geral.vendasIngressos - geral.vendasTrafego)}</span>
            </button>

            <div
              id="funil-outras-vendas-tooltip"
              role="tooltip"
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-[var(--surface-2)] border border-[var(--border-hairline)] text-[var(--text-primary)] text-xs rounded-[var(--radius-panel)] shadow-[var(--elevation-2)] opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 p-3 pointer-events-none"
            >
              <div className="font-bold border-b border-[var(--border-hairline)] pb-2 mb-2 text-[var(--brand-strategy-ink)]">Origens (Outras/Orgânicas)</div>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {outrasVendas.map((s: any) => (
                  <div key={s.name} className="flex justify-between items-center">
                    <span className="truncate pr-2 font-medium text-[var(--text-muted)]">{s.name === 'SEM ORIGEM' ? 'Desconhecida' : s.name}</span>
                    <span className="font-bold text-[var(--brand-strategy-ink)] font-mono tabular-nums">{s.count}</span>
                  </div>
                ))}
                {outrasVendas.length === 0 && (
                  <div className="text-[var(--text-subtle)] italic">Nenhuma venda encontrada</div>
                )}
              </div>
            </div>
          </div>

          <div className="text-[var(--text-subtle)] font-bold"><Equal size={16} strokeWidth={3} /></div>

          <div className="w-full">
            <FunnelStep label="Vendas (Totais Globais)" icon={<></>} value={geral.vendasIngressos} tone="neutral" formatNumber={formatNumber} />
          </div>
        </div>
      </Card>

      {/* Tabela de Campanhas - Funil */}
      <div className="flex flex-col gap-3">
        <SectionHeader title="Funil separado por campanhas" className="justify-center text-center" />
        <div className="table-panel overflow-hidden">
          <div className="table-scroll-region overflow-x-auto" tabIndex={0} aria-label="Tabela de funil por campanha. Deslize horizontalmente para ver todas as colunas.">
            <table className="w-full text-left text-sm whitespace-nowrap lg:whitespace-normal">
              <thead className="table-heading font-mono font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3.5 py-3.5">Campanha / Conjunto</th>
                  <th className="px-3.5 py-3.5 text-center">Impressões</th>
                  <th className="px-2 py-3.5 text-center text-[var(--text-subtle)]">&rarr;</th>
                  <th className="px-3.5 py-3.5 text-center">Cliques no Link</th>
                  <th className="px-2 py-3.5 text-center text-[var(--text-subtle)]">&rarr;</th>
                  <th className="px-3.5 py-3.5 text-center">Vz da Pag.<br/><span className="text-[10px] font-normal text-[var(--text-muted)]">Visualizações</span></th>
                  <th className="px-2 py-3.5 text-center text-[var(--text-subtle)]">&rarr;</th>
                  <th className="px-3.5 py-3.5 text-center">IC<br/><span className="text-[10px] font-normal text-[var(--text-muted)]">Initiate Checkout</span></th>
                  <th className="px-2 py-3.5 text-center text-[var(--text-subtle)]">&rarr;</th>
                  <th className="px-3.5 py-3.5 text-center">Livros Vendidos<br/><span className="text-[10px] font-normal text-[var(--text-muted)]">Tráfego Pago</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)] text-[var(--text-muted)] font-mono text-xs">
                {sortedCampaigns.map((camp: any) => (
                  <React.Fragment key={camp.name}>
                    <tr className="hover:bg-[var(--hover-wash)] transition-colors group bg-[var(--surface-1)]">
                      <td className="px-3.5 py-3 font-sans font-bold text-[var(--text-primary)] flex items-center gap-2 max-w-[220px] xl:max-w-[320px]">
                        <button
                          type="button"
                          onClick={() => toggleCampaign(camp.name)}
                          aria-expanded={Boolean(expandedCampaigns[camp.name])}
                          aria-label={`${expandedCampaigns[camp.name] ? 'Recolher' : 'Expandir'} ${camp.name}`}
                          className="min-h-11 min-w-11 -my-2 inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-subtle)] hover:bg-[var(--hover-wash-strong)] hover:text-[var(--brand-strategy-ink)]"
                        >
                          {expandedCampaigns[camp.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <span className="truncate" title={camp.name} aria-label={camp.name}>{camp.name}</span>
                      </td>
                      <td className="px-3.5 py-3 text-center font-medium tabular-nums bg-[var(--hover-wash)]">{formatNumber(camp.impressoes)}</td>
                      <td className="px-2 py-3 text-center text-xs text-[var(--text-subtle)] tabular-nums">{formatPercent(camp.ctr)}</td>
                      <td className="px-3.5 py-3 text-center font-medium tabular-nums bg-[var(--brand-strategy)]/10 text-[var(--brand-strategy-ink)]">{formatNumber(camp.cliques)}</td>
                      <td className="px-2 py-3 text-center text-xs text-[var(--text-subtle)] tabular-nums">{formatPercent(camp.cliques > 0 ? camp.landingPageViews / camp.cliques : 0)}</td>
                      <td className="px-3.5 py-3 text-center font-medium tabular-nums bg-[var(--brand-strategy)]/10 text-emerald-300">{formatNumber(camp.landingPageViews)}</td>
                      <td className="px-2 py-3 text-center text-xs text-[var(--text-subtle)] tabular-nums">{formatPercent(camp.landingPageViews > 0 ? camp.initiateCheckout / camp.landingPageViews : 0)}</td>
                      <td className="px-3.5 py-3 text-center font-bold tabular-nums bg-[var(--brand-management)]/10 text-[var(--brand-management)]">{formatNumber(camp.initiateCheckout)}</td>
                      <td className="px-2 py-3 text-center text-xs text-[var(--text-subtle)] tabular-nums">{formatPercent(camp.initiateCheckout > 0 ? camp.comprasTrafego / camp.initiateCheckout : 0)}</td>
                      <td className="px-3.5 py-3 text-center font-black tabular-nums bg-[var(--brand-strategy)]/20 text-[var(--brand-strategy-ink)]">{formatNumber(camp.comprasTrafego)}</td>
                    </tr>

                    {expandedCampaigns[camp.name] && camp.sets.map((set: any) => (
                      <tr key={`${camp.name}-${set.name}`} className="bg-black/10 hover:bg-[var(--hover-wash)] transition-colors">
                        <td className="px-3.5 py-2.5 pl-8 text-[var(--text-muted)] font-sans flex items-center gap-2 max-w-[220px] xl:max-w-[320px]">
                          <Layers size={13} className="text-[var(--text-subtle)] shrink-0" />
                          <span className="truncate text-[11px]" title={set.name} aria-label={set.name}>{set.name}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-[var(--text-muted)] tabular-nums">{formatNumber(set.impressoes)}</td>
                        <td className="px-2 py-2.5 text-center text-[10px] text-[var(--text-subtle)] tabular-nums">{formatPercent(set.ctr)}</td>
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-[var(--brand-strategy-ink)] font-medium tabular-nums">{formatNumber(set.cliques)}</td>
                        <td className="px-2 py-2.5 text-center text-[10px] text-[var(--text-subtle)] tabular-nums">{formatPercent(set.cliques > 0 ? set.landingPageViews / set.cliques : 0)}</td>
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-emerald-300 font-medium tabular-nums">{formatNumber(set.landingPageViews)}</td>
                        <td className="px-2 py-2.5 text-center text-[10px] text-[var(--text-subtle)] tabular-nums">{formatPercent(set.landingPageViews > 0 ? set.initiateCheckout / set.landingPageViews : 0)}</td>
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-[var(--brand-management)] font-bold tabular-nums">{formatNumber(set.initiateCheckout)}</td>
                        <td className="px-2 py-2.5 text-center text-[10px] text-[var(--text-subtle)] tabular-nums">{formatPercent(set.initiateCheckout > 0 ? set.comprasTrafego / set.initiateCheckout : 0)}</td>
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-[var(--brand-strategy-ink)] font-black tabular-nums">{formatNumber(set.comprasTrafego)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {metricsData.campaigns.length === 0 && (
                  <EmptyTableRow colSpan={10} title="Nenhuma campanha encontrada neste período." subtitle="Altere o período ou sincronize a planilha novamente." />
                )}
              </tbody>
              {metricsData.campaigns.length > 0 && (
                <tfoot className="bg-[var(--hover-wash)] border-t border-[var(--border-hairline)] font-mono font-bold text-[var(--text-primary)]">
                  <tr>
                    <td className="px-3.5 py-4 text-[11px] uppercase tracking-wider text-[var(--brand-strategy-ink)]">Total do Período</td>
                    <td className="px-3.5 py-4 text-center tabular-nums">{formatNumber(campaignTotals.impressoes)}</td>
                    <td className="px-2 py-4 text-center text-[var(--text-subtle)] tabular-nums">{formatPercent(campaignTotals.impressoes > 0 ? campaignTotals.cliques / campaignTotals.impressoes : 0)}</td>
                    <td className="px-3.5 py-4 text-center text-[var(--brand-strategy-ink)] tabular-nums">{formatNumber(campaignTotals.cliques)}</td>
                    <td className="px-2 py-4 text-center text-[var(--text-subtle)] tabular-nums">{formatPercent(campaignTotals.cliques > 0 ? campaignTotals.landingPageViews / campaignTotals.cliques : 0)}</td>
                    <td className="px-3.5 py-4 text-center text-emerald-300 tabular-nums">{formatNumber(campaignTotals.landingPageViews)}</td>
                    <td className="px-2 py-4 text-center text-[var(--text-subtle)] tabular-nums">{formatPercent(campaignTotals.landingPageViews > 0 ? campaignTotals.initiateCheckout / campaignTotals.landingPageViews : 0)}</td>
                    <td className="px-3.5 py-4 text-center text-[var(--brand-management)] tabular-nums">{formatNumber(campaignTotals.initiateCheckout)}</td>
                    <td className="px-2 py-4 text-center text-[var(--text-subtle)] tabular-nums">{formatPercent(campaignTotals.initiateCheckout > 0 ? campaignTotals.compras / campaignTotals.initiateCheckout : 0)}</td>
                    <td className="px-3.5 py-4 text-center text-[var(--brand-strategy-ink)] font-black tabular-nums">{formatNumber(campaignTotals.compras)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
