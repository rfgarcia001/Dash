import React from 'react';
import { Plus, Trash2, KeyRound, Check } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { DashboardApiToken } from '../../services/api';

interface ApiKeysTabProps {
  apiTokens: DashboardApiToken[];
  isLoadingApiTokens: boolean;
  apiTokensError: string | null;
  isAddTokenFormOpen: boolean;
  setIsAddTokenFormOpen: (open: boolean) => void;
  newTokenName: string;
  setNewTokenName: (val: string) => void;
  isCreatingToken: boolean;
  handleCreateToken: (event: React.FormEvent) => void;
  createdToken: { name: string; token: string } | null;
  dismissCreatedToken: () => void;
  tokenCopyState: 'idle' | 'copied' | 'error';
  handleCopyCreatedToken: () => void;
  revokingTokenId: number | null;
  handleRevokeToken: (id: number) => void;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString('pt-BR');
}

export const ApiKeysTab: React.FC<ApiKeysTabProps> = ({
  apiTokens,
  isLoadingApiTokens,
  apiTokensError,
  isAddTokenFormOpen,
  setIsAddTokenFormOpen,
  newTokenName,
  setNewTokenName,
  isCreatingToken,
  handleCreateToken,
  createdToken,
  dismissCreatedToken,
  tokenCopyState,
  handleCopyCreatedToken,
  revokingTokenId,
  handleRevokeToken
}) => {
  return (
    <div className="table-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 sm:p-6 border-b border-[var(--border-hairline)]">
        <SectionHeader
          title="API Keys"
          subtitle="Tokens pra automações externas (N8N, scripts) autenticarem na API de ingestão — header X-Ingest-Token."
          action={
            !isAddTokenFormOpen && !createdToken && (
              <Button type="button" variant="primary" size="sm" className="min-h-10 gap-1.5" onClick={() => setIsAddTokenFormOpen(true)}>
                <Plus size={16} /> Criar API Key
              </Button>
            )
          }
        />
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {apiTokensError && (
          <div className="rounded-[var(--radius-control)] border border-[var(--status-negative)]/25 bg-[var(--status-negative)]/[0.08] p-3 text-sm text-[var(--status-negative)]">
            {apiTokensError}
          </div>
        )}

        {createdToken && (
          <div className="rounded-[var(--radius-panel)] border border-[var(--brand-strategy-ink)]/25 bg-[var(--brand-strategy)]/[0.06] p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              API Key "{createdToken.name}" criada. Copie agora — <strong>ela não será mostrada de novo</strong>.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-h-11 flex-1 flex items-center rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--brand-strategy-ink)] font-mono select-all overflow-x-auto">
                {createdToken.token}
              </code>
              <Button type="button" variant="secondary" size="sm" className="min-h-11 shrink-0 gap-1.5" onClick={handleCopyCreatedToken}>
                {tokenCopyState === 'copied' ? <Check size={14} /> : null}
                <span role="status" aria-live="polite">
                  {tokenCopyState === 'copied' ? 'Copiado!' : tokenCopyState === 'error' ? 'Não foi possível copiar' : 'Copiar'}
                </span>
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={dismissCreatedToken}>Concluir</Button>
            </div>
          </div>
        )}

        {isAddTokenFormOpen && (
          <form onSubmit={handleCreateToken} className="rounded-[var(--radius-panel)] border border-[var(--brand-strategy-ink)]/25 bg-[var(--brand-strategy)]/[0.06] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="new-token-name" className="text-xs font-semibold text-[var(--text-muted)]">Nome da API Key</label>
                <input
                  id="new-token-name"
                  type="text"
                  autoFocus
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Ex.: N8N — Ingestão diária"
                  value={newTokenName}
                  onChange={(event) => setNewTokenName(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-strategy-ink)]"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => { setIsAddTokenFormOpen(false); setNewTokenName(''); }}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" className="min-h-11" disabled={isCreatingToken}>
                  {isCreatingToken ? 'Criando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {isLoadingApiTokens ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : apiTokens.length === 0 ? (
          <EmptyState title="Nenhuma API Key criada ainda" subtitle='Clique em "Criar API Key" pra gerar a primeira.' />
        ) : (
          <div className="space-y-2">
            {apiTokens.map((token) => {
              const isRevoked = Boolean(token.revoked_at);
              return (
                <div key={token.id} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-3)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--brand-strategy-ink)]/30 bg-[var(--brand-strategy)]/15 text-[var(--brand-strategy-ink)]">
                      <KeyRound size={16} />
                    </div>
                    <div className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-[var(--text-primary)]">{token.name}</span>
                      <span className="block break-words text-[11px] text-[var(--text-muted)]">
                        criada por {token.created_by || '—'} · {formatDate(token.created_at)}
                        {token.last_used_at && ` · último uso ${formatDate(token.last_used_at)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                    <Badge variant={isRevoked ? 'neutral' : 'brand'}>
                      {isRevoked ? 'Revogada' : 'Ativa'}
                    </Badge>
                    {!isRevoked && (
                      <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        className="w-9 h-9 min-h-9 min-w-9 text-[var(--status-negative)]"
                        disabled={revokingTokenId === token.id}
                        onClick={() => handleRevokeToken(token.id)}
                        aria-label={`Revogar ${token.name}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
