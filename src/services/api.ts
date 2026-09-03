class DashboardApiError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = 'DashboardApiError';
  }
}

export interface DashboardFunnel {
  id: string;
  name: string;
  sheetId: string;
  color: string;
  sourceType?: 'standard' | 'perpetual-launch' | 'paid-launch';
  builtIn?: boolean;
}

export interface FunnelImportResult {
  metaRows: number;
  buyerRows: number;
  fgpRows: number;
  creativeRows: number;
}

export interface FunnelMutationResult {
  funnel: DashboardFunnel;
  // Present only when a spreadsheet link was given while Postgres is the
  // active backend — a one-time import ran at save time. See
  // importFunnelFromSheet in server.ts: after this, the sheet is never read
  // again for this funnel.
  import?: FunnelImportResult;
  importError?: string;
}

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

export async function fetchSpreadsheetData(project: string = '1', sheetId?: string, retries = 2, delay = 1500): Promise<any> {
  let url = `/api/spreadsheet?project=${project}&t=` + Date.now();
  if (sheetId) {
    url += `&sheetId=${encodeURIComponent(sheetId)}`;
  }
  
  try {
    // A first sync of an archived launch can download a large workbook.
    // Keep this longer than the server-side Google Sheets export timeout.
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(75000) });
    
    // Check if the response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      await response.text();
      if (response.status === 401) {
        throw new DashboardApiError('Acesso não autorizado. Confirme seu e-mail e senha e tente novamente.');
      }
      if (response.status === 403) {
        throw new DashboardApiError('Você não tem permissão para acessar este dashboard.');
      }
      throw new DashboardApiError(
        response.status >= 500
          ? 'O servidor está temporariamente indisponível.'
          : `Não foi possível carregar os dados (HTTP ${response.status}).`,
        response.status >= 500
      );
    }

    const data = await response.json();

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new DashboardApiError(data.error || `Erro na rede: ${response.statusText}`, retryable);
    }

    return data;
  } catch (error: any) {
    console.error("Erro ao carregar os dados:", error);
    const retryable = error instanceof DashboardApiError
      ? error.retryable
      : error?.name === 'TimeoutError' || error?.name === 'AbortError' || error instanceof TypeError;
    if (retryable && retries > 0) {
      await wait(delay);
      return fetchSpreadsheetData(project, sheetId, retries - 1, Math.round(delay * 1.5));
    }
    if (retryable && (error?.name === 'TimeoutError' || error?.name === 'AbortError')) {
      throw new Error('A planilha demorou mais que o esperado para responder. Tente sincronizar novamente.');
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível conectar ao dashboard. Verifique sua internet e tente sincronizar novamente.');
    }
    throw error;
  }
}

export async function fetchDashboardFunnels(): Promise<DashboardFunnel[]> {
  const response = await fetch('/api/funnels', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.funnels)) {
    throw new Error(payload.error || 'Não foi possível carregar os funis cadastrados.');
  }
  return payload.funnels;
}

export async function createDashboardFunnel(name: string, spreadsheetUrl: string, sourceType?: string): Promise<FunnelMutationResult> {
  const response = await fetch('/api/funnels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, spreadsheetUrl, sourceType })
  });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok || !payload.funnel) {
    if (response.status === 404) {
      throw new Error('O servidor local ainda não foi reiniciado. Pare o npm run dev e inicie-o novamente antes de cadastrar um funil.');
    }
    if (response.status === 401) {
      throw new Error('Sua sessão de acesso expirou. Recarregue a página e entre novamente.');
    }
    throw new Error(payload.error || `Não foi possível adicionar o funil (HTTP ${response.status}).`);
  }
  return { funnel: payload.funnel, import: payload.import, importError: payload.importError };
}

async function parseFunnelMutation(response: Response, fallbackMessage: string): Promise<FunnelMutationResult> {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok || !payload.funnel) {
    throw new Error(payload.error || `${fallbackMessage} (HTTP ${response.status}).`);
  }
  return { funnel: payload.funnel, import: payload.import, importError: payload.importError };
}

export async function updateDashboardFunnel(id: string, name: string, spreadsheetUrl: string, sourceType?: string): Promise<FunnelMutationResult> {
  const response = await fetch(`/api/funnels/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, spreadsheetUrl, sourceType })
  });
  return parseFunnelMutation(response, 'Não foi possível atualizar o funil');
}

export async function deleteDashboardFunnel(id: string): Promise<void> {
  const response = await fetch(`/api/funnels/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Não foi possível remover o funil (HTTP ${response.status}).`);
  }
}

export interface DashboardMe {
  email: string;
  role: 'admin' | 'member';
  googleLoginEnabled: boolean;
}

export async function fetchMe(): Promise<DashboardMe> {
  const response = await fetch('/api/me', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.email) {
    throw new Error(payload.error || 'Não foi possível identificar o usuário logado.');
  }
  return payload;
}

export interface DashboardAdminUser {
  email: string;
  role: 'admin' | 'member';
  added_by: string;
  created_at: string;
}

export async function fetchAdminUsers(): Promise<DashboardAdminUser[]> {
  const response = await fetch('/api/admin/users', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.users)) {
    throw new Error(payload.error || 'Não foi possível carregar os usuários.');
  }
  return payload.users;
}

export async function addAdminUser(email: string, role: 'admin' | 'member'): Promise<void> {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Não foi possível adicionar o usuário (HTTP ${response.status}).`);
  }
}

export async function removeAdminUser(email: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Não foi possível remover o usuário (HTTP ${response.status}).`);
  }
}

export interface DashboardApiToken {
  id: number;
  name: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function fetchApiTokens(): Promise<DashboardApiToken[]> {
  const response = await fetch('/api/admin/tokens', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.tokens)) {
    throw new Error(payload.error || 'Não foi possível carregar as API Keys.');
  }
  return payload.tokens;
}

export async function createApiToken(name: string): Promise<{ id: number; name: string; token: string }> {
  const response = await fetch('/api/admin/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(payload.error || `Não foi possível criar a API Key (HTTP ${response.status}).`);
  }
  return payload;
}

export async function revokeApiToken(id: number): Promise<void> {
  const response = await fetch(`/api/admin/tokens/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Não foi possível revogar a API Key (HTTP ${response.status}).`);
  }
}
