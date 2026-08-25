import React, { useMemo } from 'react';
import { Search, ExternalLink, Maximize2, ImageOff } from 'lucide-react';
import { SortableHeader } from '../ui/SortableHeader';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyTableRow } from '../ui/EmptyState';

interface CriativosTabProps {
  creativeFilter: string;
  setCreativeFilter: (val: string) => void;
  creativeSort: { column: string; direction: 'asc' | 'desc' };
  toggleCreativeSort: (column: string) => void;
  sortedCreatives: any[];
  getCreativeThumbnail: (name: string, thumb?: string) => string;
  setActiveLightboxImage: (img: any) => void;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
  formatPercent: (val: number) => string;
}

export const CriativosTab: React.FC<CriativosTabProps> = ({
  creativeFilter,
  setCreativeFilter,
  creativeSort,
  toggleCreativeSort,
  sortedCreatives,
  getCreativeThumbnail,
  setActiveLightboxImage,
  formatCurrency,
  formatNumber,
  formatPercent
}) => {
  const visibleCreatives = useMemo(
    () => sortedCreatives.filter((creative: any) => (creative.name || '').toLowerCase().includes(creativeFilter.toLowerCase())),
    [creativeFilter, sortedCreatives]
  );

  return (
    <div className="table-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 sm:p-6 border-b border-[var(--border-hairline)]">
        <SectionHeader
          title="Performance dos criativos"
          action={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
              <input
                type="text"
                aria-label="Filtrar criativos"
                placeholder="Filtrar criativo..."
                value={creativeFilter}
                onChange={e => setCreativeFilter(e.target.value)}
                className="pl-9 pr-4 py-2 bg-[var(--surface-3)] border border-[var(--border-hairline)] rounded-[var(--radius-control)] text-base sm:text-xs text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-[#00FFBB]/30 focus:border-[#00FFBB] transition-all w-full sm:w-64 shadow-inner"
              />
            </div>
          }
        />
      </div>
      <div className="table-scroll-region overflow-x-auto" tabIndex={0} aria-label="Tabela de criativos. Deslize horizontalmente para ver todas as colunas.">
        <table className="w-full text-left text-sm whitespace-nowrap lg:whitespace-normal">
            <thead className="table-heading font-mono font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-3.5 text-center">Prévia</th>
              <SortableHeader column="name" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort}>Criativo</SortableHeader>
              <th className="px-4 py-3.5 text-center">Link Meta</th>
              <SortableHeader column="investimento" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">Gasto</SortableHeader>
              <SortableHeader column="impressoes" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">Impressões</SortableHeader>
              <SortableHeader column="cliques" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">Cliques</SortableHeader>
              <SortableHeader column="ctr" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">CTR</SortableHeader>
              <SortableHeader column="vendas" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="center">Livros vendidos</SortableHeader>
              <SortableHeader column="cpa" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">CPA</SortableHeader>
              <SortableHeader column="roas" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">ROAS</SortableHeader>
              <SortableHeader column="conv" activeColumn={creativeSort.column} direction={creativeSort.direction} onSort={toggleCreativeSort} align="right">Conv.</SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)] text-zinc-300 font-mono text-xs">
            {visibleCreatives.map((c: any) => {
                const rawThumb = c.Thumb_Criativo || c.thumb || c.thumbnail || c.image;
                const thumbUrl = getCreativeThumbnail(c.name, rawThumb);
                return (
                  <tr key={c.name} className="hover:bg-white/[0.045] transition-colors">
                    <td className="px-3 py-3 text-center">
                      <button 
                        disabled={!thumbUrl}
                        onClick={() => setActiveLightboxImage({ name: c.name, url: thumbUrl, link: c.link, stats: c })}
                        className="relative group/thumb block mx-auto cursor-pointer disabled:cursor-default"
                        title={thumbUrl ? "Clique para ampliar prévia do criativo" : "Prévia indisponível para este criativo"}
                      >
                        <div className="w-12 h-9 rounded-[6px] bg-[var(--surface-3)] overflow-hidden border border-[var(--border-hairline)] group-hover/thumb:border-[#00FFBB] transition-all shadow-sm flex items-center justify-center relative">
                          {thumbUrl ? <img
                            src={thumbUrl} 
                            alt={c.name}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-300"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              if (rawThumb && !target.src.includes('/api/proxy-image')) {
                                target.src = `/api/proxy-image?url=${encodeURIComponent(rawThumb)}`;
                              }
                            }}
                          /> : <ImageOff size={15} className="text-zinc-500" aria-label="Prévia indisponível" />}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 size={12} className="text-[#00FFBB]" />
                          </div>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3.5 font-sans font-bold text-zinc-100 max-w-[200px] xl:max-w-[300px]">
                      <span className="truncate block" title={c.name}>{c.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {c.link ? (
                        <a 
                          href={c.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#00FFBB]/10 text-[#00FFBB] border border-[#00FFBB]/20 font-bold text-[10px] hover:bg-[#00FFBB]/20 transition-colors"
                        >
                          <ExternalLink size={11} />
                          Ver Ad
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-500 font-medium">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-zinc-200">{formatCurrency(c.investimento)}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-zinc-300">{formatNumber(c.impressoes)}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-zinc-300">{formatNumber(c.cliques)}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-zinc-300">{formatPercent(c.ctr)}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-[#00FFBB]">{c.vendas}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-rose-400">{formatCurrency(c.cpa)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-[#00FFBB]">{(c.roas || 0).toFixed(2)}x</td>
                    <td className="px-4 py-3.5 text-right font-bold text-[#00FFBB]">{formatPercent(c.conv)}</td>
                  </tr>
                );
            })}
            {visibleCreatives.length === 0 && (
              <EmptyTableRow
                colSpan={11}
                title={creativeFilter ? 'Nenhum criativo corresponde ao filtro.' : 'Nenhum criativo sincronizado neste período.'}
                subtitle={creativeFilter ? 'Revise a busca ou limpe o filtro.' : 'Altere o período ou sincronize a planilha novamente.'}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
