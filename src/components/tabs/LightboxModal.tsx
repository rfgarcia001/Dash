import React from 'react';
import { Image, X, ExternalLink } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface LightboxModalProps {
  activeLightboxImage: {
    name: string;
    url: string;
    link?: string;
    stats?: any;
  } | null;
  setActiveLightboxImage: (val: any) => void;
  getCreativeThumbnail: (name: string, thumb?: string) => string;
  formatCurrency: (val: number) => string;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  activeLightboxImage,
  setActiveLightboxImage,
  getCreativeThumbnail,
  formatCurrency
}) => {
  return (
    <Dialog
      open={Boolean(activeLightboxImage)}
      onClose={() => setActiveLightboxImage(null)}
      labelledBy="creative-preview-title"
      className="max-w-lg p-0 overflow-hidden"
    >
      {activeLightboxImage && (
        <>
          <div className="p-4 bg-white/[0.045] border-b border-[var(--border-hairline)] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <Image size={18} className="text-[var(--brand-strategy)] shrink-0" />
              <h4 id="creative-preview-title" className="font-bold text-sm text-zinc-100 truncate">{activeLightboxImage.name}</h4>
            </div>
            <Button variant="icon" size="icon" className="w-9 h-9 min-h-9 min-w-9" onClick={() => setActiveLightboxImage(null)} aria-label="Fechar prévia do criativo">
              <X size={16} />
            </Button>
          </div>

          <div className="p-4 flex flex-col items-center gap-4">
            <div className="w-full aspect-video rounded-[var(--radius-panel)] overflow-hidden border border-[var(--border-hairline)] bg-black/40 shadow-inner relative group">
              <img
                src={activeLightboxImage.url}
                alt={activeLightboxImage.name}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (activeLightboxImage.url && !target.src.includes('/api/proxy-image') && !target.src.includes('unsplash.com')) {
                    target.src = `/api/proxy-image?url=${encodeURIComponent(activeLightboxImage.url)}`;
                  } else if (!target.src.includes('unsplash.com')) {
                    target.src = getCreativeThumbnail(activeLightboxImage.name);
                  }
                }}
              />
            </div>

            {activeLightboxImage.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full bg-[var(--surface-3)] p-3 rounded-[var(--radius-control)] border border-[var(--border-hairline)] text-center text-xs font-mono">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Gasto</span>
                  <span className="font-bold text-zinc-200 tabular-nums">{formatCurrency(activeLightboxImage.stats.investimento)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Vendas</span>
                  <span className="font-bold text-[var(--brand-strategy)] tabular-nums">{activeLightboxImage.stats.vendas}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">CPA</span>
                  <span className="font-bold text-rose-400 tabular-nums">{formatCurrency(activeLightboxImage.stats.cpa)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">ROAS</span>
                  <span className="font-bold text-[var(--brand-strategy)] tabular-nums">{(activeLightboxImage.stats.roas || 0).toFixed(2)}x</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 w-full pt-1">
              {activeLightboxImage.link && (
                <Button asChild variant="primary">
                  <a href={activeLightboxImage.link} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    <span>Abrir Link Meta</span>
                  </a>
                </Button>
              )}
              <Button variant="secondary" onClick={() => setActiveLightboxImage(null)}>Fechar</Button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
};
