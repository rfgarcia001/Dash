import React from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { DashboardAdminUser } from '../../services/api';

interface UsuariosTabProps {
  adminUsers: DashboardAdminUser[];
  isLoadingAdminUsers: boolean;
  adminUsersError: string | null;
  isAddUserFormOpen: boolean;
  setIsAddUserFormOpen: (open: boolean) => void;
  newUserEmail: string;
  setNewUserEmail: (val: string) => void;
  newUserRole: 'admin' | 'member';
  setNewUserRole: (role: 'admin' | 'member') => void;
  isAddingUser: boolean;
  handleAddUser: (event: React.FormEvent) => void;
  removingUserEmail: string | null;
  handleRemoveUser: (email: string) => void;
}

export const UsuariosTab: React.FC<UsuariosTabProps> = ({
  adminUsers,
  isLoadingAdminUsers,
  adminUsersError,
  isAddUserFormOpen,
  setIsAddUserFormOpen,
  newUserEmail,
  setNewUserEmail,
  newUserRole,
  setNewUserRole,
  isAddingUser,
  handleAddUser,
  removingUserEmail,
  handleRemoveUser
}) => {
  return (
    <div className="table-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 sm:p-6 border-b border-[var(--border-hairline)]">
        <SectionHeader
          title="Gerenciar Acessos"
          subtitle='Quem está aqui consegue entrar com a conta Google corporativa — só clicar em "Entrar com Google". Basic Auth continua funcionando à parte, pra automação.'
          action={
            !isAddUserFormOpen && (
              <Button type="button" variant="primary" size="sm" className="min-h-10 gap-1.5" onClick={() => setIsAddUserFormOpen(true)}>
                <Plus size={16} /> Adicionar pessoa
              </Button>
            )
          }
        />
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {adminUsersError && (
          <div className="rounded-[var(--radius-control)] border border-[var(--status-negative)]/25 bg-[var(--status-negative)]/[0.08] p-3 text-sm text-[var(--status-negative)]">
            {adminUsersError}
          </div>
        )}

        {isAddUserFormOpen && (
          <form onSubmit={handleAddUser} className="rounded-[var(--radius-panel)] border border-[var(--brand-strategy-ink)]/25 bg-[var(--brand-strategy)]/[0.06] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="new-user-email" className="text-xs font-semibold text-[var(--text-muted)]">E-mail corporativo</label>
                <input
                  id="new-user-email"
                  type="email"
                  autoFocus
                  required
                  placeholder="pessoa@allevotech.com"
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-strategy-ink)]"
                />
              </div>
              <div>
                <label htmlFor="new-user-role" className="text-xs font-semibold text-[var(--text-muted)]">Perfil de acesso</label>
                <select
                  id="new-user-role"
                  value={newUserRole}
                  onChange={(event) => setNewUserRole(event.target.value === 'admin' ? 'admin' : 'member')}
                  className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-strategy-ink)] sm:w-auto"
                >
                  <option value="member">Colaborador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => { setIsAddUserFormOpen(false); setNewUserEmail(''); }}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" className="min-h-11" disabled={isAddingUser}>
                  {isAddingUser ? 'Adicionando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {isLoadingAdminUsers ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : adminUsers.length === 0 ? (
          <EmptyState title="Nenhum usuário cadastrado ainda" subtitle='Clique em "Adicionar pessoa" pra liberar o primeiro acesso.' />
        ) : (
          <div className="space-y-2">
            {adminUsers.map((user) => (
              <div key={user.email} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-3)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--brand-strategy-ink)]/30 bg-[var(--brand-strategy)]/15 font-mono text-sm font-bold text-[var(--brand-strategy-ink)]">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-[var(--text-primary)]">{user.email}</span>
                    <span className="block break-words text-[11px] text-[var(--text-muted)]">adicionado por {user.added_by || '—'}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                  <Badge variant={user.role === 'admin' ? 'brand' : 'neutral'}>
                    {user.role === 'admin' ? 'Admin' : 'Colaborador'}
                  </Badge>
                  <Button
                    type="button"
                    variant="icon"
                    size="icon"
                    className="w-9 h-9 min-h-9 min-w-9 text-[var(--status-negative)]"
                    disabled={removingUserEmail === user.email}
                    onClick={() => handleRemoveUser(user.email)}
                    aria-label={`Remover ${user.email}`}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
