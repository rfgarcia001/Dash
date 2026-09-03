import React, { useEffect, useState, useMemo, useRef, useTransition } from 'react';
import { 
  Calendar, RotateCcw, LayoutDashboard, Layers, Disc, MousePointer2, Package, 
  DollarSign, TrendingUp, TrendingDown, Zap, Ticket, ShoppingCart, Target, Megaphone, ChevronDown, PieChart, Eye, MousePointerClick, Monitor, Plus, Equal, Image, ExternalLink, Search, Bell, AlertTriangle, Check, X, Pencil, Trash2,
  ShieldCheck, LogOut, UserCheck, Shield, Maximize2, PanelLeftClose, PanelLeftOpen, History, Sun, Moon, ArrowLeft, KeyRound
} from 'lucide-react';
import { createDashboardFunnel, DashboardFunnel, deleteDashboardFunnel, fetchDashboardFunnels, fetchSpreadsheetData, FunnelImportResult, updateDashboardFunnel, DashboardAdminUser, fetchAdminUsers, addAdminUser, removeAdminUser, DashboardApiToken, fetchApiTokens, createApiToken, revokeApiToken } from '../services/api';
import { cn } from '../lib/utils';
import { filterByDate, buildDateFilter, buildPreviousDateFilter, getPreviousPeriodLabel, calculateComparison, parseValue, formatCurrency, formatPercent, formatNumber, parseUtcToUtcMinus3, decodeHtmlEntities } from '../lib/metrics';
import { useSortState } from '../lib/hooks';
import type { AuthUser } from '../types/auth';
import { LightboxModal } from './tabs/LightboxModal';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { PopoverPanel } from './ui/PopoverPanel';
import { MetricCard } from './ui/MetricCard';
import { Badge } from './ui/Badge';
const DailyChartSection = React.lazy(() => import('./tabs/DailyChartSection').then(({ DailyChartSection }) => ({ default: DailyChartSection })));
const CampanhasTab = React.lazy(() => import('./tabs/CampanhasTab').then(({ CampanhasTab }) => ({ default: CampanhasTab })));
const FunilTab = React.lazy(() => import('./tabs/FunilTab').then(({ FunilTab }) => ({ default: FunilTab })));
const CriativosTab = React.lazy(() => import('./tabs/CriativosTab').then(({ CriativosTab }) => ({ default: CriativosTab })));
const FontesTab = React.lazy(() => import('./tabs/FontesTab').then(({ FontesTab }) => ({ default: FontesTab })));
const ProdutosTab = React.lazy(() => import('./tabs/ProdutosTab').then(({ ProdutosTab }) => ({ default: ProdutosTab })));
const UsuariosTab = React.lazy(() => import('./tabs/UsuariosTab').then(({ UsuariosTab }) => ({ default: UsuariosTab })));
const ApiKeysTab = React.lazy(() => import('./tabs/ApiKeysTab').then(({ ApiKeysTab }) => ({ default: ApiKeysTab })));
const DEFAULT_DASHBOARD_FUNNELS: DashboardFunnel[] = [
  { id: 'estrategia', name: 'Livro Estratégia em Ação', sheetId: '', color: '#00FFBB', builtIn: true },
  { id: 'gestao-ia', name: 'Livro Gestão de Projetos com IA', sheetId: '', color: '#66BEFF', builtIn: true }
];
// Same validated categorical palette as index.css's --chart-1..8 — kept as a
// JS array too so a funnel's swatch (tag, checkbox, product-chart family)
// can be derived from its stable position in `funnels`, not from whatever
// arbitrary `color` the funnel record carries. Assigned by index, never by
// name matching, so "same funnel" always means "same color" everywhere.
const FUNNEL_PALETTE = ['#1885c4', '#bf7d23', '#7b68ee', '#a28b08', '#b8538c', '#59ac44', '#bd5446', '#028ba3'];
function getFunnelColor(funnels: DashboardFunnel[], funnelId: string) {
  const index = funnels.findIndex((f) => f.id === funnelId);
  return FUNNEL_PALETTE[(index < 0 ? 0 : index) % FUNNEL_PALETTE.length];
}
function PanelLoadingState() {
  return (
    <div role="status" className="min-h-64 flex items-center justify-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-1)] text-sm font-medium text-[var(--text-muted)]">
      Carregando painel...
    </div>
  );
}
function getCreativeThumbnail(creativeName: string, customImage?: string) {
  if (customImage && typeof customImage === 'string' && customImage.trim() !== '') {
    let trimmed = customImage.trim();
    // Normalizar links de visualização do Google Drive para links de imagem direta
    if (trimmed.includes('drive.google.com/file/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `/api/proxy-image?url=${encodeURIComponent(`https://drive.google.com/uc?export=view&id=${match[1]}`)}`;
      }
    } else if (trimmed.includes('drive.google.com/open?id=')) {
      const match = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `/api/proxy-image?url=${encodeURIComponent(`https://drive.google.com/uc?export=view&id=${match[1]}`)}`;
      }
    } else if (trimmed.includes('drive.google.com/uc?')) {
      return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
    } else if (trimmed.includes('fbcdn.net') || trimmed.includes('cdninstagram.com') || trimmed.includes('facebook.com') || trimmed.includes('instagram.com')) {
      return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
    } else if (trimmed.startsWith('http')) {
      return trimmed;
    }
    return trimmed;
  }
  return '';
}
// Colors pull from the validated categorical palette (--chart-1..8, see
// index.css); each metric keeps the same slot everywhere it appears so
// identity never shifts when the selection changes. With 10 metrics sharing
// 8 CVD-safe hues, a couple of pairs (lucro/faturamento, cpaTotal/cpaTrafego,
// roas/conversaoOrderBump) sit closer than ideal — DailyChartSection adds a
// distinct line-dash pattern per series as a second channel for exactly
// those cases, on top of the legend/tooltip labels.
const METRIC_CONFIG: Record<string, { label: string, color: string, type: 'currency' | 'number' | 'percent', renderType: 'bar' | 'line' }> = {
  investimentoTotal: { label: 'Investimento Total', color: '#bf7d23', type: 'currency', renderType: 'line' },
  vendasTrafego: { label: 'Livros via Tráfego', color: '#1885c4', type: 'number', renderType: 'bar' },
  faturamentoTotal: { label: 'Faturamento Total', color: '#59ac44', type: 'currency', renderType: 'line' },
  lucroTotal: { label: 'Lucro Total', color: '#b8538c', type: 'currency', renderType: 'line' },
  ticketMedio: { label: 'Ticket Médio', color: '#7b68ee', type: 'currency', renderType: 'line' },
  vendasIngressos: { label: 'Livros Vendidos (Geral)', color: '#028ba3', type: 'number', renderType: 'bar' },
  cpaTrafego: { label: 'CPA (Tráfego)', color: '#a28b08', type: 'currency', renderType: 'line' },
  cpaTotal: { label: 'CPA (Total)', color: '#bd5446', type: 'currency', renderType: 'line' },
  roas: { label: 'ROAS', color: '#a28b08', type: 'number', renderType: 'line' },
  conversaoOrderBump: { label: 'Conversão de Order Bump', color: '#bd5446', type: 'percent', renderType: 'line' }
};
function getLabelForDateRange(range: string, custom: { start: string; end: string }) {
  if (range.startsWith('CUSTOM:')) {
    const parts = range.split(':')[1]?.split('|');
    if (parts && parts.length === 2 && parts[0] && parts[1]) {
      const formatD = (s: string) => s.split('-').reverse().join('/');
      return `${formatD(parts[0])} - ${formatD(parts[1])}`;
    }
    return 'Personalizado';
  }
  const labels: Record<string, string> = {
    'HOJE': 'Hoje',
    'ONTEM': 'Ontem',
    'ONTEM+HOJE': 'Ontem + Hoje',
    '3D': 'Últimos 3 dias',
    '7D': 'Últimos 7 dias',
    '14D': 'Últimos 14 dias',
    '30D': 'Últimos 30 dias',
    'MES_ATUAL': 'Mês Atual',
    'MÁXIMO': 'Período Total'
  };
  return labels[range] || range;
}
interface DashboardProps {
  authUser?: AuthUser | null;
  isAdmin?: boolean;
  onLogout?: () => void;
}
export default function Dashboard({ authUser, isAdmin = false, onLogout }: DashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('Geral');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Read synchronously so the very first render already matches what the
  // inline script in index.html stamped on <html> — avoids a flash where
  // React re-renders dark-first before catching up to a saved light theme.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light') return 'light';
    return 'dark';
  });
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('allevo-theme', next); } catch { /* private mode etc — theme just won't persist */ }
      return next;
    });
  };
  const [dateRange, setDateRange] = useState('7D');
  const [includeProductRevenue, setIncludeProductRevenue] = useState(false);
  // includeProductRevenue is a dependency of the big metricsData useMemo
  // (it's threaded through per-day loops, not just a final total), so
  // toggling it re-runs that full aggregation over every selected funnel's
  // entire history — with "Período Total" across 4 funis that's 8000+ rows
  // and was reading as "frozen/bugged" rather than "recalculating". A
  // transition keeps the checkbox and rest of the UI responsive while React
  // deprioritizes the resulting re-render instead of blocking on it.
  const [isRecalculatingRevenue, startRevenueTransition] = useTransition();
  const [comparePrevious, setComparePrevious] = useState(true);
  const [showMovingAverage, setShowMovingAverage] = useState(false);
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [pageSort, togglePageSort] = useSortState({column: 'salesMeta', direction: 'desc'});
  const [creativeSort, toggleCreativeSort] = useSortState({column: 'investimento', direction: 'desc'});
  const [campaignSort, toggleCampaignSort] = useSortState({column: 'investimento', direction: 'desc'});
  const [fgpSort, toggleFgpSort] = useSortState({column: 'data', direction: 'desc'});
  const [creativeFilter, setCreativeFilter] = useState('');
  const [fgpFilter, setFgpFilter] = useState('');
  // Expanded Campaign rows
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [selectedSourceIndices, setSelectedSourceIndices] = useState<number[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['investimentoTotal', 'faturamentoTotal', 'roas', 'vendasIngressos']);
  const [funnels, setFunnels] = useState<DashboardFunnel[]>(DEFAULT_DASHBOARD_FUNNELS);
  const [selectedFunnelIds, setSelectedFunnelIds] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAddFunnelConfirmOpen, setIsAddFunnelConfirmOpen] = useState(false);
  const [isAddFunnelModalOpen, setIsAddFunnelModalOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState('');
  const [newFunnelUrl, setNewFunnelUrl] = useState('');
  const [newFunnelSourceType, setNewFunnelSourceType] = useState('standard');
  const [newFunnelError, setNewFunnelError] = useState<string | null>(null);
  const [isCreatingFunnel, setIsCreatingFunnel] = useState(false);
  // Set right after a successful create, so the modal can show the funnel's
  // id before closing — that id is what an external pipeline (e.g. n8n)
  // needs as funnel_id when writing rows straight into Postgres.
  const [createdFunnel, setCreatedFunnel] = useState<DashboardFunnel | null>(null);
  const [createdFunnelImport, setCreatedFunnelImport] = useState<{ result?: FunnelImportResult; error?: string } | null>(null);
  const [funnelIdCopyState, setFunnelIdCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [editingFunnel, setEditingFunnel] = useState<DashboardFunnel | null>(null);
  const [funnelPendingDelete, setFunnelPendingDelete] = useState<DashboardFunnel | null>(null);
  const [isDeletingFunnel, setIsDeletingFunnel] = useState(false);
  // Tela "Gerenciar Acessos" — deliberadamente fora da navegação por abas de
  // funil (Geral/Funil/Criativos/...): é configuração de conta, não um jeito
  // de olhar dado de performance, então vira uma view própria em tela
  // cheia com "Voltar", não mais um item perdido na barra lateral.
  const [view, setView] = useState<'dashboard' | 'usuarios'>('dashboard');
  const [accessTab, setAccessTab] = useState<'usuarios' | 'apiKeys'>('usuarios');
  const [isAddUserFormOpen, setIsAddUserFormOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<DashboardAdminUser[]>([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'member'>('member');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [removingUserEmail, setRemovingUserEmail] = useState<string | null>(null);
  const [isAddTokenFormOpen, setIsAddTokenFormOpen] = useState(false);
  const [apiTokens, setApiTokens] = useState<DashboardApiToken[]>([]);
  const [isLoadingApiTokens, setIsLoadingApiTokens] = useState(false);
  const [apiTokensError, setApiTokensError] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);
  const [tokenCopyState, setTokenCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);

  const loadAdminUsers = () => {
    setIsLoadingAdminUsers(true);
    setAdminUsersError(null);
    fetchAdminUsers()
      .then(setAdminUsers)
      .catch((err) => setAdminUsersError(err.message))
      .finally(() => setIsLoadingAdminUsers(false));
  };

  const loadApiTokens = () => {
    setIsLoadingApiTokens(true);
    setApiTokensError(null);
    fetchApiTokens()
      .then(setApiTokens)
      .catch((err) => setApiTokensError(err.message))
      .finally(() => setIsLoadingApiTokens(false));
  };

  useEffect(() => {
    if (view !== 'usuarios') return;
    setAccessTab('usuarios');
    setIsAddUserFormOpen(false);
    setIsAddTokenFormOpen(false);
    setCreatedToken(null);
    loadAdminUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view !== 'usuarios' || accessTab !== 'apiKeys') return;
    loadApiTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, accessTab]);

  const handleCreateToken = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newTokenName.trim();
    if (name.length < 3) return;
    setIsCreatingToken(true);
    try {
      const result = await createApiToken(name);
      setCreatedToken({ name: result.name, token: result.token });
      setNewTokenName('');
      setIsAddTokenFormOpen(false);
      loadApiTokens();
    } catch (err: any) {
      setApiTokensError(err.message);
    } finally {
      setIsCreatingToken(false);
    }
  };

  const dismissCreatedToken = () => {
    setCreatedToken(null);
    setTokenCopyState('idle');
  };

  const handleCopyCreatedToken = () => {
    if (!createdToken) return;
    navigator.clipboard?.writeText(createdToken.token)
      .then(() => {
        setTokenCopyState('copied');
        setTimeout(() => setTokenCopyState('idle'), 2000);
      })
      .catch(() => {
        setTokenCopyState('error');
        setTimeout(() => setTokenCopyState('idle'), 2000);
      });
  };

  const handleRevokeToken = async (id: number) => {
    setRevokingTokenId(id);
    try {
      await revokeApiToken(id);
      loadApiTokens();
    } catch (err: any) {
      setApiTokensError(err.message);
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = newUserEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    setIsAddingUser(true);
    try {
      await addAdminUser(email, newUserRole);
      setNewUserEmail('');
      setNewUserRole('member');
      setIsAddUserFormOpen(false);
      loadAdminUsers();
    } catch (err: any) {
      setAdminUsersError(err.message);
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleRemoveUser = async (email: string) => {
    setRemovingUserEmail(email);
    try {
      await removeAdminUser(email);
      loadAdminUsers();
    } catch (err: any) {
      setAdminUsersError(err.message);
    } finally {
      setRemovingUserEmail(null);
    }
  };

  // Profile dropdown menu state, Date picker popover state, & Mobile Nav Tab Dropdown
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [isFunnelMenuOpen, setIsFunnelMenuOpen] = useState(false);
  const funnelMenuRef = useRef<HTMLDivElement>(null);
  const funnelMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const tabMenuButtonRef = useRef<HTMLButtonElement>(null);
  // Lightbox Zoom State
  const [activeLightboxImage, setActiveLightboxImage] = useState<{ name: string; url: string; link?: string; stats?: any } | null>(null);
  const activeLoadId = useRef(0);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target as Node)) {
        setIsDateMenuOpen(false);
      }
      if (funnelMenuRef.current && !funnelMenuRef.current.contains(event.target as Node)) {
        setIsFunnelMenuOpen(false);
      }
      if (tabMenuRef.current && !tabMenuRef.current.contains(event.target as Node)) {
        setIsTabMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    const closeOpenMenus = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
        profileMenuButtonRef.current?.focus();
      } else if (isFunnelMenuOpen) {
        setIsFunnelMenuOpen(false);
        funnelMenuButtonRef.current?.focus();
      } else if (isDateMenuOpen) {
        setIsDateMenuOpen(false);
        dateMenuButtonRef.current?.focus();
      } else if (isTabMenuOpen) {
        setIsTabMenuOpen(false);
        tabMenuButtonRef.current?.focus();
      } else {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener('keydown', closeOpenMenus);
    return () => document.removeEventListener('keydown', closeOpenMenus);
  }, [isProfileMenuOpen, isFunnelMenuOpen, isDateMenuOpen, isTabMenuOpen]);
  // Each modal below renders through <Dialog>, which owns its own focus
  // trap/Escape/backdrop handling — no shared modal effect needed here.
  const selectedProject = selectedFunnelIds.join(',');
  const loadData = async (proj?: string) => {
    const targetProj = proj || selectedProject;
    const loadId = activeLoadId.current + 1;
    activeLoadId.current = loadId;
    setLoading(true);
    setFetchError(null);
    try {
      const result = await fetchSpreadsheetData(targetProj);
      if (loadId !== activeLoadId.current) return;
      setData(result);
      setLastUpdated(new Date());
    } catch (error: any) {
      if (loadId !== activeLoadId.current) return;
      console.error(error);
      setFetchError(error.message || "Erro ao carregar os dados da planilha");
    } finally {
      if (loadId === activeLoadId.current) setLoading(false);
    }
  };
  const toggleFunnel = (funnelId: string) => {
    setSelectedFunnelIds((current) => {
      if (current.includes(funnelId)) {
        return current.length === 1 ? current : current.filter((id) => id !== funnelId);
      }
      return [...current, funnelId];
    });
  };
  useEffect(() => {
    fetchDashboardFunnels()
      .then((items) => {
        if (items.length === 0) {
          throw new Error('O catálogo de funis retornou vazio.');
        }
        setFunnels(items);
        setSelectedFunnelIds((current) => {
          const available = current.filter((id) => items.some((funnel) => funnel.id === id));
          // Default is "all funnels" on first load; a returning user's saved
          // selection (if still valid) is preserved instead of being reset.
          return available.length > 0 ? available : items.map((funnel) => funnel.id);
        });
      })
      .catch((error) => {
        console.warn('Não foi possível carregar o catálogo de funis; mantendo os funis-base:', error);
        setFunnels((current) => current.length > 0 ? current : DEFAULT_DASHBOARD_FUNNELS);
        setSelectedFunnelIds((current) => current.length > 0 ? current : DEFAULT_DASHBOARD_FUNNELS.map((funnel) => funnel.id));
      });
  }, []);
  const openFunnelEditor = (funnel: DashboardFunnel) => {
    setEditingFunnel(funnel);
    setNewFunnelName(funnel.name);
    setNewFunnelUrl(funnel.sheetId ? `https://docs.google.com/spreadsheets/d/${funnel.sheetId}/edit` : '');
    setNewFunnelSourceType(funnel.sourceType || 'standard');
    setNewFunnelError(null);
    setIsFunnelMenuOpen(false);
    setIsAddFunnelModalOpen(true);
  };
  const closeFunnelEditor = (force = false) => {
    if (isCreatingFunnel && !force) return;
    setIsAddFunnelModalOpen(false);
    setEditingFunnel(null);
    setNewFunnelName('');
    setNewFunnelUrl('');
    setNewFunnelSourceType('standard');
    setNewFunnelError(null);
    setCreatedFunnel(null);
    setCreatedFunnelImport(null);
    setFunnelIdCopyState('idle');
  };
  const handleSaveFunnel = async (event: React.FormEvent) => {
    event.preventDefault();
    setNewFunnelError(null);
    setIsCreatingFunnel(true);
    try {
      const { funnel, import: importResult, importError } = editingFunnel
        ? await updateDashboardFunnel(editingFunnel.id, newFunnelName, newFunnelUrl, newFunnelSourceType)
        : await createDashboardFunnel(newFunnelName, newFunnelUrl, newFunnelSourceType);
      setFunnels((current) => editingFunnel
        ? current.map((item) => item.id === funnel.id ? funnel : item)
        : [...current, funnel]);
      setSelectedFunnelIds((current) => current.includes(funnel.id) ? current : [...current, funnel.id]);
      setIsFunnelMenuOpen(false);
      if (editingFunnel && !importResult && !importError) {
        closeFunnelEditor(true);
      } else {
        // Show the new funnel's id before closing — it's what an external
        // pipeline writing straight to Postgres needs as funnel_id. Also
        // surface the one-time sheet import outcome when a link was given.
        setCreatedFunnel(funnel);
        if (importResult || importError) setCreatedFunnelImport({ result: importResult, error: importError });
      }
    } catch (error: any) {
      setNewFunnelError(error.message || 'Não foi possível salvar o funil.');
    } finally {
      setIsCreatingFunnel(false);
    }
  };
  const handleDeleteFunnel = async () => {
    if (!funnelPendingDelete) return;
    setIsDeletingFunnel(true);
    try {
      await deleteDashboardFunnel(funnelPendingDelete.id);
      setFunnels((current) => current.filter((item) => item.id !== funnelPendingDelete.id));
      setSelectedFunnelIds((current) => current.filter((id) => id !== funnelPendingDelete.id));
      setFunnelPendingDelete(null);
      setIsFunnelMenuOpen(false);
    } catch (error: any) {
      setNewFunnelError(error.message || 'Não foi possível remover o funil.');
      setIsAddFunnelModalOpen(true);
      setFunnelPendingDelete(null);
    } finally {
      setIsDeletingFunnel(false);
    }
  };
  useEffect(() => {
    loadData(selectedProject);
    // Keep data fresh without interrupting someone working in another tab.
    const intervalId = setInterval(() => {
      if (!document.hidden) loadData(selectedProject);
    }, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [selectedProject]);
  const hasPaidLaunchSelected = selectedFunnelIds.some((id) => {
    const sourceType = funnels.find((funnel) => funnel.id === id)?.sourceType;
    return sourceType === 'paid-launch' || sourceType === 'perpetual-launch';
  });
  const tabs = [
    { name: 'Geral', icon: LayoutDashboard },
    { name: 'Fontes das Vendas', icon: PieChart },
    { name: 'Funil', icon: Layers },
    { name: 'Campanhas', icon: Megaphone },
    { name: 'Criativos', icon: Image },
    ...(hasPaidLaunchSelected ? [{ name: 'Lançamento', icon: Package }] : [])
  ];
  useEffect(() => {
    if (activeTab === 'Lançamento' && !hasPaidLaunchSelected) setActiveTab('Geral');
  }, [activeTab, hasPaidLaunchSelected]);
  useEffect(() => {
    if (!hasPaidLaunchSelected) setIncludeProductRevenue(false);
  }, [hasPaidLaunchSelected]);
  // Grouped instead of one flat 9-option list — each group stays within the
  // ~4-item working-memory guideline, so picking a period is a two-step
  // narrowing (which group, then which option) instead of one long scan.
  const dateOptionGroups: { label: string; options: string[] }[] = [
    { label: 'Dias específicos', options: ['HOJE', 'ONTEM', 'ONTEM+HOJE'] },
    { label: 'Janelas móveis', options: ['3D', '7D', '14D', '30D'] },
    { label: 'Outros', options: ['MES_ATUAL', 'MÁXIMO'] },
  ];
  const metricsData = useMemo(() => {
    const defaultMetrics = {
      geral: {
        investimentoTotal: 0,
        faturamentoTotal: 0,
        lucroTotal: 0,
        ticketMedio: 0,
        vendasIngressos: 0,
        vendasTrafego: 0,
        cpaTrafego: 0,
        cpaTotal: 0, roas: 0,
        impressoesTotal: 0,
        cliquesTotal: 0,
        pageViewsTotal: 0,
        checkoutsTotal: 0,
        vendasOrderBump: 0,
        conversaoOrderBump: 0,
      },
      geralPorFunil: {} as Record<string, {
        investimentoTotal: number; faturamentoTotal: number; lucroTotal: number; ticketMedio: number;
        vendasIngressos: number; vendasTrafego: number; cpaTrafego: number; cpaTotal: number; roas: number;
        vendasOrderBump: number; conversaoOrderBump: number;
      }>,
      campaigns: [] as any[],
      creatives: [] as any[],
      sources: [] as any[],
      totalSalesWithSource: 0,
      totalRevenueWithSource: 0,
      pagesList: [] as any[],
      dailyMetrics: [] as any[],
      ticketBuyers: [] as any[],
      fgpBuyers: [] as any[],
      fgpResume: { totalVendas: 0, faturamentoFgp: 0, ticketMedioFgp: 0 }
    };
    if (!data || !data.data) return defaultMetrics;
    const rawMetaData = data.data["Dados da Meta"] || [];
    const rawBuyersData = data.data["Dados dos Compradores"] || [];
    const rawFgpBuyers = data.data["Dados dos Compradores - FGP"] || [];
    const dateFilterPredicate = buildDateFilter(dateRange);
    // Filter by date
    const metaData = rawMetaData.filter((row: any) => {
      const date = row['Data'];
      return dateFilterPredicate(date);
    });
    const buyersByDate = rawBuyersData.filter((row: any) => {
      const date = row['Data'] || row['Data da Compra'] || row['Criado em'];
      if (!date) return false;
      return dateFilterPredicate(date);
    });
    const fgpBuyersByDate = rawFgpBuyers.filter((row: any) => {
      const date = row['Data'] || row['Data da Compra'] || row['Criado em'];
      if (!date) return false;
      return dateFilterPredicate(date);
    });
    let faturamentoFgp = 0;
    let vendasFgpConfirmadas = 0;
    const fgpPlataformasMap: Record<string, any> = {};
    const fgpOrigensMap: Record<string, any> = {};
    const fgpDailyMap: Record<string, any> = {};
    let faturamentoReembolsado = 0;
    const fgpReembolsosList: any[] = [];
    fgpBuyersByDate.forEach((row: any) => {
      const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
      const valor = parseValue(valStr);
      const obs = String(row['Obs'] || row['obs'] || '').toLowerCase().trim();
      const isReembolso = obs.includes('reembolso') || obs.includes('reembolsado');
      const email = row['E-mail'] || row['Email'] || row['Comprador'] || (Object.values(row)[1] as string) || 'Email Não Identificado';
      // Extract day
      const dataStr = row['Data'] || row['Data da Compra'] || row['Criado em'] || '';
      let dateKey = 'Sem Data';
      if (dataStr) {
        const { dateStr: utcMinus3Date } = parseUtcToUtcMinus3(dataStr);
        dateKey = utcMinus3Date || dataStr.split(' ')[0];
      }
      if (!fgpDailyMap[dateKey]) {
        fgpDailyMap[dateKey] = { date: dateKey, Vendas: 0, Faturamento: 0, Reembolsadas: 0, ValorReembolsado: 0 };
      }
      if (isReembolso) {
        faturamentoReembolsado += valor;
        fgpReembolsosList.push({ email, valor, date: dateKey });
        fgpDailyMap[dateKey].Reembolsadas += 1;
        fgpDailyMap[dateKey].ValorReembolsado += valor;
      } else {
        faturamentoFgp += valor;
        vendasFgpConfirmadas += 1;
        fgpDailyMap[dateKey].Vendas += 1;
        fgpDailyMap[dateKey].Faturamento += valor;
        // Plataforma
        const plat = row['Plataforma'] || row['plataforma'] || row['Platform'] || 'Sem Identificação';
        if (!fgpPlataformasMap[plat]) fgpPlataformasMap[plat] = { name: plat, value: 0, faturamento: 0 };
        fgpPlataformasMap[plat].value += 1;
        fgpPlataformasMap[plat].faturamento += valor;
        // Origem
        const orig = row['utm_source'] || row['Origem'] || row['Source'] || row['src'] || 'Sem Identificação';
        if (!fgpOrigensMap[orig]) fgpOrigensMap[orig] = { name: orig, value: 0, faturamento: 0 };
        fgpOrigensMap[orig].value += 1;
        fgpOrigensMap[orig].faturamento += valor;
      }
    });
    const totalVendasFgp = vendasFgpConfirmadas;
    const fgpResume = {
      totalVendas: totalVendasFgp,
      faturamentoFgp,
      faturamentoReembolsado,
      totalReembolsos: fgpReembolsosList.length,
      reembolsosList: fgpReembolsosList,
      ticketMedioFgp: totalVendasFgp > 0 ? faturamentoFgp / totalVendasFgp : 0,
      plataformas: Object.values(fgpPlataformasMap).sort((a,b) => b.value - a.value),
      origens: Object.values(fgpOrigensMap).sort((a,b) => b.value - a.value),
      daily: Object.values(fgpDailyMap).sort((a: any, b: any) => {
        const parseD = (d: string) => {
          if (d === 'Sem Data') return 0;
          const parts = d.split('/');
          if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`).getTime();
          return new Date(d).getTime();
        };
        return parseD(a.date) - parseD(b.date);
      })
    };
    const filteredBuyers = buyersByDate;
    // 2. Geral - Investimento
    const investimentoCru = metaData.reduce((acc: number, row: any) => acc + parseValue(row['Gasto']), 0);
    const investimentoTotal = investimentoCru * 1.1215;
    // 3. Geral - Faturamento
    const faturamentoIngressos = filteredBuyers.reduce((acc: number, row: any) => {
      const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
      return acc + parseValue(valStr);
    }, 0);
    const faturamentoTotal = faturamentoIngressos + (includeProductRevenue ? faturamentoFgp : 0);
    // 4. Geral - Lucro e Ticket Médio
    const lucroTotal = faturamentoTotal - investimentoTotal;
    const vendasIngressos = filteredBuyers.length;
    const ticketMedio = vendasIngressos > 0 ? faturamentoTotal / vendasIngressos : 0;
    const vendasOrderBump = filteredBuyers.filter((row: any) => String(row['Order Bump'] || '').trim() !== '').length;
    const conversaoOrderBump = vendasIngressos > 0 ? vendasOrderBump / vendasIngressos : 0;
    // Funnel Meta Totals
    const impressoesTotal = metaData.reduce((acc: number, row: any) => acc + parseValue(row['Impressões']), 0);
    const cliquesTotal = metaData.reduce((acc: number, row: any) => acc + parseValue(row['Cliques no Link']), 0);
    const pageViewsTotal = metaData.reduce((acc: number, row: any) => acc + parseValue(row['Visualizações da Página de Destino']), 0);
    const checkoutsTotal = metaData.reduce((acc: number, row: any) => acc + parseValue(row['Iniciate Checkout']), 0);
    // --- NORMALIZATION & MATCHING HELPERS ---
    const normalizeStr = (s: any) => {
      if (!s) return '';
      let str = String(s);
      try { str = decodeURIComponent(str.replace(/\+/g, ' ')); } catch (e) { str = str.replace(/\+/g, ' '); }
      return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    };
    const extractAdId = (s: any) => {
      if (!s) return null;
      const str = normalizeStr(s);
      const m = str.match(/\bad\s*0*(\d+)\b/) || str.match(/\[ad\s*0*(\d+)\]/);
      return m ? parseInt(m[1], 10) : null;
    };
    const extractAdRange = (s: any) => {
      if (!s) return [];
      const text = normalizeStr(s);
      const m = text.match(/ad\s*0*(\d+)\s*(?:a|-)\s*ad?\s*0*(\d+)/i) || text.match(/ad0*(\d+)-0*(\d+)/i);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        const res: number[] = [];
        for (let i = start; i <= end; i++) res.push(i);
        return res;
      }
      return [];
    };
    const isFuzzyMatch = (str1: string, str2: string) => {
      if (!str1 || !str2) return false;
      const n1 = normalizeStr(str1);
      const n2 = normalizeStr(str2);
      const s1 = n1.replace(/[^a-z0-9]/g, '');
      const s2 = n2.replace(/[^a-z0-9]/g, '');
      if (!s1 || !s2) return false;
      if (s1 === s2) return true;
      if (s1.includes(s2) || s2.includes(s1)) return true;
      if (s1.length > 8 && s2.length > 8 && (s1.startsWith(s2.slice(0, 10)) || s2.startsWith(s1.slice(0, 10)))) return true;
      return false;
    };
    const isAdMatch = (metaAdName: string, buyerUtm: string) => {
      if (!metaAdName || !buyerUtm) return false;
      const nMeta = normalizeStr(metaAdName);
      const nUtm = normalizeStr(buyerUtm);
      const cMeta = nMeta.replace(/[^a-z0-9]/g, '');
      const cUtm = nUtm.replace(/[^a-z0-9]/g, '');
      if (cMeta === cUtm) return true;
      const metaId = extractAdId(metaAdName);
      const utmId = extractAdId(buyerUtm);
      // Whenever EITHER side's name encodes a numeric ad ID (e.g. "[AD021]"
      // — most ads in this account do), an exact ID match is the only
      // signal specific enough to tell apart near-identical sibling ads
      // that share the same family name and differ only by number. Falling
      // through to substring matching whenever just one side lacked an ID
      // let a single generic, ID-less UTM (shared by a whole ad set) match
      // *every* sibling ad and pile all of its sales onto whichever one
      // happened to be first in iteration order — producing >100%
      // "conversion" rates on that one ad while starving the others.
      if (metaId !== null || utmId !== null) {
        return metaId !== null && utmId !== null && metaId === utmId;
      }
      // Neither name carries an extractable ID at all — substring matching
      // is the only signal left, for genuinely ID-less ad names only.
      return cMeta.length > 6 && cUtm.length > 6 && (cMeta.includes(cUtm) || cUtm.includes(cMeta));
    };
    const isSetMatch = (metaSetName: string, buyerMed: string, buyerCont: string, buyerTerm: string) => {
      if (!metaSetName) return false;
      const nMeta = normalizeStr(metaSetName);
      const cMeta = nMeta.replace(/[^a-z0-9]/g, '');
      const metaRange = extractAdRange(metaSetName);
      for (const utm of [buyerMed, buyerCont, buyerTerm]) {
        if (!utm) continue;
        const nUtm = normalizeStr(utm);
        const cUtm = nUtm.replace(/[^a-z0-9]/g, '');
        if (cMeta === cUtm) return true;
        const utmRange = extractAdRange(utm);
        if (metaRange.length > 0 && utmRange.length > 0) {
          if (metaRange[0] === utmRange[0] && metaRange[metaRange.length - 1] === utmRange[utmRange.length - 1]) {
            return true;
          }
        }
        const singleAd = extractAdId(utm);
        if (singleAd !== null && metaRange.length > 0) {
          if (metaRange.includes(singleAd)) {
            const metaIsDynamic = nMeta.includes('dinamico') || nMeta.includes('dinamica');
            const utmIsDynamic = nUtm.includes('dinamico') || nUtm.includes('dinamica');
            if (metaIsDynamic === utmIsDynamic) {
              return true;
            }
          }
        }
        if (cMeta.length > 8 && cUtm.length > 8 && (cMeta.includes(cUtm) || cUtm.includes(cMeta))) {
          return true;
        }
      }
      return false;
    };
    // 5. TRÁFEGO origin check
    const isTrafficSale = (b: any) => {
      const src = (b['utm_source'] || b['Source'] || b['Origem'] || b['Origem / utm_source'] || '').toString().trim().toLowerCase();
      const camp = (b['utm_campaign'] || b['Campanha'] || b['UTM Campaign'] || '').toString().trim().toLowerCase();
      const med = (b['utm_medium'] || b['Medium'] || b['utm_medium (D)'] || '').toString().trim().toLowerCase();
      const cont = (b['utm_content'] || '').toString().trim().toLowerCase();
      const term = (b['utm_term'] || '').toString().trim().toLowerCase();
      // Desconsidera disparos/email/orgânico quando explicitamente marcados sem utm de tráfego
      if (src === 'eduzz_rvp_email' || src.includes('sendflow') || src === 'ig_linkbio' || src === 'ig_stories') {
        return false;
      }
      if (src === 'meta' || src === 'trafego' || src === 'tráfego' || src === 'paid' || src === 'facebook' || src === 'instagram' || src === 'ads') {
        return true;
      }
      if (med === 'paid' || med.includes('conv') || med.includes('adv') || /ad\d+/i.test(med)) {
        return true;
      }
      if (camp.includes('mario') || camp.includes('perpetuo') || camp.includes('perpétuo') || camp.includes('gpcomia') || camp.includes('pmo') || camp.includes('testeads') || camp.includes('livro')) {
        return true;
      }
      if (/\[ad\d+\]|ad\s*\d+/i.test(cont) || /\[ad\d+\]|ad\s*\d+/i.test(term) || /\[ad\d+\]|ad\s*\d+/i.test(med)) {
        return true;
      }
      return false;
    };
    const vendasTrafego = buyersByDate.filter(isTrafficSale).length;
    const cpaTrafego = vendasTrafego > 0 ? investimentoTotal / vendasTrafego : 0;
    const cpaTotal = vendasIngressos > 0 ? investimentoTotal / vendasIngressos : 0;
    const roas = investimentoTotal > 0 ? faturamentoTotal / investimentoTotal : 0;
    // Per-funnel breakdown for the KPI cards (shown when 2-3 funnels are
    // selected). Grouped by each row's own `Funil` column — which already
    // matches the funnel catalog's `name` exactly — rather than by touching
    // the combined `geral` math above, so the already-correct combined
    // numbers can never regress. Does not replicate the FGP/paid-launch
    // revenue overlay (`includeProductRevenue`); it's the base ticket sales
    // per funnel.
    const geralPorFunil: Record<string, {
      investimentoTotal: number; faturamentoTotal: number; lucroTotal: number; ticketMedio: number;
      vendasIngressos: number; vendasTrafego: number; cpaTrafego: number; cpaTotal: number; roas: number;
      vendasOrderBump: number; conversaoOrderBump: number;
    }> = {};
    {
      const funnelNames = new Set<string>();
      metaData.forEach((row: any) => { const f = String(row['Funil'] || '').trim(); if (f) funnelNames.add(f); });
      filteredBuyers.forEach((row: any) => { const f = String(row['Funil'] || '').trim(); if (f) funnelNames.add(f); });
      funnelNames.forEach((funnelName) => {
        const fMeta = metaData.filter((row: any) => String(row['Funil'] || '').trim() === funnelName);
        const fBuyers = filteredBuyers.filter((row: any) => String(row['Funil'] || '').trim() === funnelName);
        const fInvestimentoTotal = fMeta.reduce((acc: number, row: any) => acc + parseValue(row['Gasto']), 0) * 1.1215;
        const fFaturamentoTotal = fBuyers.reduce((acc: number, row: any) => {
          const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
          return acc + parseValue(valStr);
        }, 0);
        const fVendasIngressos = fBuyers.length;
        const fVendasOrderBump = fBuyers.filter((row: any) => String(row['Order Bump'] || '').trim() !== '').length;
        const fVendasTrafego = fBuyers.filter(isTrafficSale).length;
        geralPorFunil[funnelName] = {
          investimentoTotal: fInvestimentoTotal,
          faturamentoTotal: fFaturamentoTotal,
          lucroTotal: fFaturamentoTotal - fInvestimentoTotal,
          ticketMedio: fVendasIngressos > 0 ? fFaturamentoTotal / fVendasIngressos : 0,
          vendasIngressos: fVendasIngressos,
          vendasTrafego: fVendasTrafego,
          cpaTrafego: fVendasTrafego > 0 ? fInvestimentoTotal / fVendasTrafego : 0,
          cpaTotal: fVendasIngressos > 0 ? fInvestimentoTotal / fVendasIngressos : 0,
          roas: fInvestimentoTotal > 0 ? fFaturamentoTotal / fInvestimentoTotal : 0,
          vendasOrderBump: fVendasOrderBump,
          conversaoOrderBump: fVendasIngressos > 0 ? fVendasOrderBump / fVendasIngressos : 0,
        };
      });
    }
    // --- CÁLCULO DE COMPARAÇÃO COM PERÍODO ANTERIOR ---
    let prevGeral: any = null;
    let comparison: Record<string, any> = {};
    if (comparePrevious && dateRange !== 'MÁXIMO') {
      const prevDateFilterPredicate = buildPreviousDateFilter(dateRange);
      const prevMetaData = rawMetaData.filter((row: any) => prevDateFilterPredicate(row['Data']));
      const prevBuyersByDate = rawBuyersData.filter((row: any) => {
        const date = row['Data'] || row['Data da Compra'] || row['Criado em'];
        if (!date) return false;
        return prevDateFilterPredicate(date);
      });
      const prevInvestimentoCru = prevMetaData.reduce((acc: number, row: any) => acc + parseValue(row['Gasto']), 0);
      const prevInvestimentoTotal = prevInvestimentoCru * 1.1215;
      const prevFaturamentoIngressos = prevBuyersByDate.reduce((acc: number, row: any) => {
        const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
        return acc + parseValue(valStr);
      }, 0);
      const prevFaturamentoProdutos = rawFgpBuyers
        .filter((row: any) => {
          const date = row['Data'] || row['Data da Compra'] || row['Criado em'];
          return Boolean(date) && prevDateFilterPredicate(date);
        })
        .reduce((acc: number, row: any) => acc + parseValue(row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0'), 0);
      const prevFaturamentoTotal = prevFaturamentoIngressos + (includeProductRevenue ? prevFaturamentoProdutos : 0);
      const prevLucroTotal = prevFaturamentoTotal - prevInvestimentoTotal;
      const prevVendasIngressos = prevBuyersByDate.length;
      const prevTicketMedio = prevVendasIngressos > 0 ? prevFaturamentoTotal / prevVendasIngressos : 0;
      const prevVendasOrderBump = prevBuyersByDate.filter((row: any) => String(row['Order Bump'] || '').trim() !== '').length;
      const prevConversaoOrderBump = prevVendasIngressos > 0 ? prevVendasOrderBump / prevVendasIngressos : 0;
      const prevImpressoesTotal = prevMetaData.reduce((acc: number, row: any) => acc + parseValue(row['Impressões']), 0);
      const prevCliquesTotal = prevMetaData.reduce((acc: number, row: any) => acc + parseValue(row['Cliques no Link']), 0);
      const prevPageViewsTotal = prevMetaData.reduce((acc: number, row: any) => acc + parseValue(row['Visualizações da Página de Destino']), 0);
      const prevCheckoutsTotal = prevMetaData.reduce((acc: number, row: any) => acc + parseValue(row['Iniciate Checkout']), 0);
      const prevVendasTrafego = prevBuyersByDate.filter(isTrafficSale).length;
      const prevCpaTrafego = prevVendasTrafego > 0 ? prevInvestimentoTotal / prevVendasTrafego : 0;
      const prevCpaTotal = prevVendasIngressos > 0 ? prevInvestimentoTotal / prevVendasIngressos : 0;
      const prevRoas = prevInvestimentoTotal > 0 ? prevFaturamentoTotal / prevInvestimentoTotal : 0;
      prevGeral = {
        investimentoTotal: prevInvestimentoTotal,
        faturamentoTotal: prevFaturamentoTotal,
        lucroTotal: prevLucroTotal,
        ticketMedio: prevTicketMedio,
        vendasIngressos: prevVendasIngressos,
        vendasTrafego: prevVendasTrafego,
        cpaTrafego: prevCpaTrafego,
        cpaTotal: prevCpaTotal,
        roas: prevRoas,
        impressoesTotal: prevImpressoesTotal,
        cliquesTotal: prevCliquesTotal,
        pageViewsTotal: prevPageViewsTotal,
        checkoutsTotal: prevCheckoutsTotal,
        vendasOrderBump: prevVendasOrderBump,
        conversaoOrderBump: prevConversaoOrderBump,
      };
      comparison = {
        investimentoTotal: calculateComparison(investimentoTotal, prevInvestimentoTotal, false, 'currency'),
        faturamentoTotal: calculateComparison(faturamentoTotal, prevFaturamentoTotal, false, 'currency'),
        lucroTotal: calculateComparison(lucroTotal, prevLucroTotal, false, 'currency'),
        ticketMedio: calculateComparison(ticketMedio, prevTicketMedio, false, 'currency'),
        vendasIngressos: calculateComparison(vendasIngressos, prevVendasIngressos, false, 'number'),
        vendasTrafego: calculateComparison(vendasTrafego, prevVendasTrafego, false, 'number'),
        cpaTrafego: calculateComparison(cpaTrafego, prevCpaTrafego, true, 'currency'),
        cpaTotal: calculateComparison(cpaTotal, prevCpaTotal, true, 'currency'),
        roas: calculateComparison(roas, prevRoas, false, 'roas'),
        impressoesTotal: calculateComparison(impressoesTotal, prevImpressoesTotal, false, 'number'),
        cliquesTotal: calculateComparison(cliquesTotal, prevCliquesTotal, false, 'number'),
        pageViewsTotal: calculateComparison(pageViewsTotal, prevPageViewsTotal, false, 'number'),
        checkoutsTotal: calculateComparison(checkoutsTotal, prevCheckoutsTotal, false, 'number'),
        conversaoOrderBump: calculateComparison(conversaoOrderBump, prevConversaoOrderBump, false, 'percent'),
      };
    }

    // --- AGRUPAMENTO DE CAMPANHAS E CONJUNTOS ---
    const campaignsMap: Record<string, any> = {};
    metaData.forEach((row: any) => {
      const campName = decodeHtmlEntities(row['Nome da Campanha'] || '') || 'Desconhecida';
      const setName = decodeHtmlEntities(row['Nome do Conjunto'] || '') || 'Desconhecido';
      if (!campaignsMap[campName]) {
        campaignsMap[campName] = {
          name: campName,
          gastoBruto: 0,
          impressoes: 0,
          cliques: 0,
          landingPageViews: 0,
          initiateCheckout: 0,
          comprasTrafego: 0, // Vendas atreladas à campanha
          faturamentoTrafego: 0,
          setsMap: {} as Record<string, any>
        };
      }
      const camp = campaignsMap[campName];
      if (!camp.setsMap[setName]) {
        camp.setsMap[setName] = {
          name: setName,
          gastoBruto: 0,
          impressoes: 0,
          cliques: 0,
          landingPageViews: 0,
          initiateCheckout: 0,
        };
      }
      const cs = camp.setsMap[setName];
      const g = parseValue(row['Gasto']);
      const imp = parseValue(row['Impressões']);
      const clq = parseValue(row['Cliques no Link']);
      const lpv = parseValue(row['Visualizações da Página de Destino']);
      const ic = parseValue(row['Iniciate Checkout']);
      // Sum for Camp
      camp.gastoBruto += g;
      camp.impressoes += imp;
      camp.cliques += clq;
      camp.landingPageViews += lpv;
      camp.initiateCheckout += ic;
      // Sum for Set
      cs.gastoBruto += g;
      cs.impressoes += imp;
      cs.cliques += clq;
      cs.landingPageViews += lpv;
      cs.initiateCheckout += ic;
    });
    
    // Mapeamento de vendas por campanha e conjunto
    buyersByDate.filter(isTrafficSale).forEach((b: any) => {
      const campUtm = (b['utm_campaign'] || b['Campanha'] || b['UTM Campaign'] || '').toString();
      const medUtm = (b['utm_medium'] || '').toString();
      const contUtm = (b['utm_content'] || '').toString();
      const termUtm = (b['utm_term'] || '').toString();
      const valStr = b['Valor'] || b['Valor Bruto'] || b['Preço'] || b['Faturamento'] || b['Valor Pago'] || '0';
      const valNum = parseValue(valStr);
      let matchedCampKey = Object.keys(campaignsMap).find(k => isFuzzyMatch(k, campUtm));
      if (!matchedCampKey && Object.keys(campaignsMap).length === 1) {
        matchedCampKey = Object.keys(campaignsMap)[0];
      }
      if (matchedCampKey) {
        campaignsMap[matchedCampKey].comprasTrafego += 1;
        campaignsMap[matchedCampKey].faturamentoTrafego += valNum;
        const setsKeys = Object.keys(campaignsMap[matchedCampKey].setsMap);
        const matchedSetKey = setsKeys.find(k => isSetMatch(k, medUtm, contUtm, termUtm));
        if (matchedSetKey) {
           if (!campaignsMap[matchedCampKey].setsMap[matchedSetKey].comprasTrafego) campaignsMap[matchedCampKey].setsMap[matchedSetKey].comprasTrafego = 0;
           if (!campaignsMap[matchedCampKey].setsMap[matchedSetKey].faturamentoTrafego) campaignsMap[matchedCampKey].setsMap[matchedSetKey].faturamentoTrafego = 0;
           campaignsMap[matchedCampKey].setsMap[matchedSetKey].comprasTrafego += 1;
           campaignsMap[matchedCampKey].setsMap[matchedSetKey].faturamentoTrafego += valNum;
        }
      }
    });
    // Convert map to array
    const campaigns = Object.values(campaignsMap).map((c: any) => {
      const cInvestimento = c.gastoBruto * 1.1215;
      return {
        ...c,
        investimento: cInvestimento,
        cpm: c.impressoes > 0 ? (cInvestimento / c.impressoes) * 1000 : 0,
        cpc: c.cliques > 0 ? cInvestimento / c.cliques : 0,
        ctr: c.impressoes > 0 ? c.cliques / c.impressoes : 0,
        cpa: c.comprasTrafego > 0 ? cInvestimento / c.comprasTrafego : 0,
        roas: cInvestimento > 0 ? c.faturamentoTrafego / cInvestimento : 0,
        sets: Object.values(c.setsMap).map((s: any) => {
          const sInvestimento = s.gastoBruto * 1.1215;
          const comprasTrafego = s.comprasTrafego || 0;
          const faturamentoTrafego = s.faturamentoTrafego || 0;
          return {
            ...s,
            investimento: sInvestimento,
            cpm: s.impressoes > 0 ? (sInvestimento / s.impressoes) * 1000 : 0,
            cpc: s.cliques > 0 ? sInvestimento / s.cliques : 0,
            ctr: s.impressoes > 0 ? s.cliques / s.impressoes : 0,
            comprasTrafego,
            cpa: comprasTrafego > 0 ? sInvestimento / comprasTrafego : 0,
            faturamentoTrafego,
            roas: sInvestimento > 0 ? faturamentoTrafego / sInvestimento : 0,
          };
        }).sort((a: any, b: any) => b.investimento - a.investimento)
      };
    }).sort((a: any, b: any) => b.investimento - a.investimento);
    // --- AGRUPAMENTO DE FONTES DE VENDAS ---
    const sourcesMap: Record<string, any> = {
      'META': { name: 'META', category: 'Tráfego Pago', count: 0, revenue: 0 },
      'IG_STORIES': { name: 'IG_STORIES', category: 'Orgânico', count: 0, revenue: 0 },
      'IG_LINKBIO': { name: 'IG_LINKBIO', category: 'Orgânico', count: 0, revenue: 0 },
      'SENDFLOW': { name: 'SENDFLOW', category: 'Disparos', count: 0, revenue: 0 },
      'SENDFLOWMBA': { name: 'SENDFLOWMBA', category: 'Disparos', count: 0, revenue: 0 },
      'SEM ORIGEM IDENTIFICADA': { name: 'SEM ORIGEM IDENTIFICADA', category: 'Sem Origem', count: 0, revenue: 0 }
    };
    let totalSalesWithSource = 0;
    let totalRevenueWithSource = 0;
    const fillSourceMap = (row: any, increment: boolean) => {
      const colDStr = (row['utm_medium'] || row['Medium'] || row['utm_medium (D)'] || '').toString().toLowerCase().trim();
      const colFOrig = (row['utm_source'] || row['Source'] || row['Origem'] || row['Origem / utm_source'] || '').toString().trim();
      let sourceName = colFOrig || "Sem Origem Identificada";
      let category = "Indefinida";
      if (!colFOrig || sourceName.toUpperCase() === 'SEM ORIGEM IDENTIFICADA') {
        sourceName = "Sem Origem Identificada";
        category = "Sem Origem";
      } else if (isTrafficSale(row)) {
        const rawUpper = colFOrig.toUpperCase();
        sourceName = (rawUpper === 'TRAFEGO' || rawUpper === 'TRÁFEGO' || rawUpper === 'META') ? 'META' : rawUpper;
        category = "Tráfego Pago";
      } else if (!colDStr) {
        sourceName = colFOrig;
        category = "Outros"; 
      } else {
        sourceName = colFOrig;
        if (colDStr.includes('conv')) {
          category = "Tráfego Pago";
        } else if (colDStr.includes('organic') || sourceName.toUpperCase().includes('IG_') || sourceName.toUpperCase().includes('INSTAGRAM')) {
          category = "Orgânico";
        } else if (colDStr.includes('disparos') || sourceName.toUpperCase().includes('SENDFLOW') || sourceName.toUpperCase().includes('EMAIL')) {
          category = "Disparos";
        } else {
          category = "Outros";
        }
      }
      const key = `${sourceName.toUpperCase()}`;
      if (!sourcesMap[key]) {
        sourcesMap[key] = {
          name: sourceName.toUpperCase(),
          category,
          count: 0,
          revenue: 0
        };
      }
      if (increment) {
        sourcesMap[key].count += 1;
        const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
        const rawValor = parseValue(valStr);
        sourcesMap[key].revenue += rawValor;
        totalSalesWithSource += 1;
        totalRevenueWithSource += rawValor;
      }
    };
    // Primeiro cadastra todas as chaves (inclusive de dias que podem não estar no filtro atual)
    rawBuyersData.forEach((row: any) => fillSourceMap(row, false));
    // Depois incementa apenas os dados do filtro de data atual
    buyersByDate.forEach((row: any) => fillSourceMap(row, true));
    const sourcesRaw = Object.values(sourcesMap).sort((a: any, b: any) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name); // Desempate por nome para manter ordem
    });
    // Fixed hue order from the validated categorical palette (dataviz skill) —
    // never reassign a slot to a different hue, only cycle through them.
    const COLOR_HEX = ['#1885c4', '#bf7d23', '#7b68ee', '#a28b08', '#b8538c', '#59ac44', '#bd5446', '#028ba3'];
    const COLOR_BG = ['bg-[var(--chart-1)]', 'bg-[var(--chart-2)]', 'bg-[var(--chart-3)]', 'bg-[var(--chart-4)]', 'bg-[var(--chart-5)]', 'bg-[var(--chart-6)]', 'bg-[var(--chart-7)]', 'bg-[var(--chart-8)]'];
    const sources = sourcesRaw.map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      originalIndex: i,
      hex: COLOR_HEX[i % COLOR_HEX.length],
      bg: COLOR_BG[i % COLOR_BG.length]
    }));
    // --- ANALISE DE PAGINAS ---
    const pagesMap: Record<string, { url: string, slug: string, pageViews: number, checkouts: number, salesMeta: number, salesOther: number }> = {};
    const getSlug = (url: string) => {
      try {
        const urlStr = url.startsWith('http') ? url : 'https://' + url;
        const u = new URL(urlStr);
        const path = u.pathname.replace(/\/$/, "");
        return path.substring(path.lastIndexOf('/') + 1) || u.hostname;
      } catch(e) {
        let parts = url.split('/').filter(Boolean);
        return parts[parts.length - 1] || url;
      }
    };
    const adToUrl: Record<string, string> = {};
    rawBuyersData.forEach((row: any) => {
      if (row.utm_content) {
        try {
          const parsed = JSON.parse(row.utm_content);
          if (parsed.co && parsed.url) {
             const cleanUrl = parsed.url.trim();
             adToUrl[parsed.co] = cleanUrl;
             if (!pagesMap[cleanUrl]) {
               pagesMap[cleanUrl] = { url: cleanUrl, slug: getSlug(cleanUrl), pageViews: 0, checkouts: 0, salesMeta: 0, salesOther: 0 };
             }
          }
        } catch(e) {}
      }
    });
    metaData.forEach((row: any) => {
      const adName = row['Nome do Anúncio'];
      if (adName && adToUrl[adName]) {
         const url = adToUrl[adName];
         pagesMap[url].pageViews += parseValue(row['Visualizações da Página de Destino']);
         pagesMap[url].checkouts += parseValue(row['Iniciate Checkout']);
      }
    });
    buyersByDate.forEach((row: any) => {
      if (row.utm_content) {
        try {
          const parsed = JSON.parse(row.utm_content);
          if (parsed.url) {
            const cleanUrl = parsed.url.trim();
            if (!pagesMap[cleanUrl]) {
               pagesMap[cleanUrl] = { url: cleanUrl, slug: getSlug(cleanUrl), pageViews: 0, checkouts: 0, salesMeta: 0, salesOther: 0 };
            }
            if (isTrafficSale(row)) {
               pagesMap[cleanUrl].salesMeta += 1;
            } else {
               pagesMap[cleanUrl].salesOther += 1;
            }
          }
        } catch(e) {}
      }
    });
    // --- AGRUPAMENTO DE CRIATIVOS ---
    const creativesMap: Record<string, any> = {};
    const rawCreativesLinks = data.data["Link dos criativos"] || [];
    const creativeLinks: Record<string, string> = {};
    const creativeThumbs: Record<string, string> = {};
    rawCreativesLinks.forEach((row: any) => {
       const adName = (row['Criativos'] || row['Criativo'] || row['Nome do Anúncio'] || row['Nome'] || '').toString().trim().toUpperCase();
       const link = row['Link'] || row['Link dos criativos'] || row['Link Criativo'] || '';
       const thumb = row['Thumb_Criativo'] || row['Thumb Criativo'] || row['thumb_criativo'] || row['Thumb'] || row['Thumbnail'] || row['Imagem'] || row['Preview'] || row['Prévia'] || '';
       if (adName) {
           if (link) creativeLinks[adName] = link;
           if (thumb) creativeThumbs[adName] = thumb;
       }
    });
    metaData.forEach((row: any) => {
      const adName = (row['Nome do Anúncio'] || 'Desconhecido').toString().trim();
      const key = adName.toUpperCase();
      const metaThumb = row['Thumb_Criativo'] || row['Thumb Criativo'] || row['thumb_criativo'] || row['Thumb'] || row['Thumbnail'] || '';
      if (!creativesMap[key]) {
        let foundLink = creativeLinks[key] || '';
        let foundThumb = creativeThumbs[key] || metaThumb || '';
        if (!foundLink || !foundThumb) {
          const matchedLinkKey = Object.keys(creativeLinks).find(k => isFuzzyMatch(k, key));
          if (matchedLinkKey && !foundLink) foundLink = creativeLinks[matchedLinkKey];
          const matchedThumbKey = Object.keys(creativeThumbs).find(k => isFuzzyMatch(k, key));
          if (matchedThumbKey && !foundThumb) foundThumb = creativeThumbs[matchedThumbKey];
        }
        creativesMap[key] = {
           name: decodeHtmlEntities(adName) || adName,
           link: foundLink,
           thumb: foundThumb,
           Thumb_Criativo: foundThumb,
           gastoBruto: 0,
           impressoes: 0,
           cliques: 0,
           vendas: 0,
           faturamento: 0,
        };
      } else if (!creativesMap[key].thumb && (creativeThumbs[key] || metaThumb)) {
        const t = creativeThumbs[key] || metaThumb;
        creativesMap[key].thumb = t;
        creativesMap[key].Thumb_Criativo = t;
      }
      creativesMap[key].gastoBruto += parseValue(row['Gasto']);
      creativesMap[key].impressoes += parseValue(row['Impressões']);
      creativesMap[key].cliques += parseValue(row['Cliques no Link']);
    });
    
    buyersByDate.filter(isTrafficSale).forEach((b: any) => {
      const termUtm = (b['utm_term'] || '').toString().trim();
      const contUtm = (b['utm_content'] || '').toString().trim();
      const medUtm = (b['utm_medium'] || '').toString().trim();
      const valStr = b['Valor'] || b['Valor Bruto'] || b['Preço'] || b['Faturamento'] || b['Valor Pago'] || '0';
      const valNum = parseValue(valStr);
      const creativeKeys = Object.keys(creativesMap);
      let matchedCreativeKey = creativeKeys.find(k => (
        isAdMatch(k, contUtm) ||
        isAdMatch(k, termUtm) ||
        isAdMatch(k, medUtm)
      ));
      if (!matchedCreativeKey && b.utm_content && b.utm_content.startsWith('{')) {
        try {
          const parsed = JSON.parse(b.utm_content);
          if (parsed.co) {
            matchedCreativeKey = creativeKeys.find(k => isAdMatch(k, parsed.co));
          }
        } catch (e) {}
      }
      if (matchedCreativeKey) {
        creativesMap[matchedCreativeKey].vendas += 1;
        creativesMap[matchedCreativeKey].faturamento += valNum;
      }
    });
    const creatives = Object.values(creativesMap).map((c: any) => {
      const cInvestimento = c.gastoBruto * 1.1215;
      return {
        ...c,
        investimento: cInvestimento,
        ctr: c.impressoes > 0 ? c.cliques / c.impressoes : 0,
        cpa: c.vendas > 0 ? cInvestimento / c.vendas : 0,
        conv: c.cliques > 0 ? c.vendas / c.cliques : 0,
        roas: cInvestimento > 0 ? c.faturamento / cInvestimento : 0
      };
    }).sort((a: any, b: any) => b.investimento - a.investimento);
    // --- DAILY DATA ---
    const allDailyMap: Record<string, any> = {};
    const processDaily = (dateStr: string) => {
      let dayKey = '';
      try {
        const { dateStr: utcMinus3Date } = parseUtcToUtcMinus3(dateStr);
        const parts = utcMinus3Date.split('-');
        if (parts.length === 3) {
          dayKey = `${parts[2]}/${parts[1]}`;
        }
      } catch (e) {}
      // Ignora dados com datas inválidas ou textos que vieram da planilha como "Nwe"
      if (!/^\d{2}\/\d{2}$/.test(dayKey)) return null;
      if (!allDailyMap[dayKey]) {
        allDailyMap[dayKey] = {
          date: dayKey,
          rawDate: dateStr,
          investimentoTotal: 0,
          faturamentoTotal: 0,
          vendasIngressos: 0,
          vendasTrafego: 0,
          impressoesTotal: 0,
          cliquesTotal: 0,
          pageViewsTotal: 0,
          checkoutsTotal: 0,
          productSales: {},
          vendasOrderBump: 0,
          conversaoOrderBump: 0,
        };
      }
      return allDailyMap[dayKey];
    };
    rawMetaData.forEach((row: any) => {
      const d = row['Data'];
      if (!d) return;
      const dayData = processDaily(String(d));
      if (!dayData) return;
      const gasto = parseValue(row['Gasto']);
      dayData.investimentoTotal += gasto * 1.1215;
      dayData.impressoesTotal += parseValue(row['Impressões']);
      dayData.cliquesTotal += parseValue(row['Cliques no Link']);
      dayData.pageViewsTotal += parseValue(row['Visualizações da Página de Destino']);
      dayData.checkoutsTotal += parseValue(row['Iniciate Checkout']);
    });
    rawBuyersData.forEach((row: any) => {
      const d = row['Data'] || row['Data da Compra'] || row['Criado em'];
      if (!d) return;
      const dayData = processDaily(String(d));
      if (!dayData) return;
      const valStr = row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0';
      dayData.faturamentoTotal += parseValue(valStr);
      dayData.vendasIngressos += 1;
      const product = decodeHtmlEntities(String(row['Produto Principal'] || row['Produto'] || 'Produto não identificado').trim()) || 'Produto não identificado';
      // New funnels retain their full name in the source rows. Normalize the two
      // built-in funnels so their product series keep their established palettes.
      const funnelSource = String(row['Funil'] || row['funil'] || '').trim();
      const funnel = /estrat(é|e)gia/i.test(funnelSource)
        ? 'Estratégia'
        : /gest(ã|a)o|projetos\s+com\s+ia/i.test(funnelSource)
          ? 'Gestão IA'
          : funnelSource || 'Sem origem';
      const productLabel = `${funnel}::main::${product}`;
      dayData.productSales[productLabel] = (dayData.productSales[productLabel] || 0) + 1;
      const orderBump = String(row['Order Bump'] || '').trim();
      if (orderBump) {
        dayData.vendasOrderBump += 1;
        const orderBumpLabel = `${funnel}::ob::${orderBump}`;
        dayData.productSales[orderBumpLabel] = (dayData.productSales[orderBumpLabel] || 0) + 1;
      }
      if (isTrafficSale(row)) {
        dayData.vendasTrafego += 1;
      }
    });
    if (includeProductRevenue) {
      rawFgpBuyers.forEach((row: any) => {
        const d = row['Data'] || row['Data da Compra'] || row['Criado em'];
        if (!d) return;
        const dayData = processDaily(String(d));
        if (!dayData) return;
        dayData.faturamentoTotal += parseValue(row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago'] || '0');
      });
    }
    // Compute derived single-day values
    let allDailyList = Object.values(allDailyMap).map((d: any) => {
      d.lucroTotal = d.faturamentoTotal - d.investimentoTotal;
      d.ticketMedio = d.vendasIngressos > 0 ? d.faturamentoTotal / d.vendasIngressos : 0;
      d.cpaTrafego = d.vendasTrafego > 0 ? d.investimentoTotal / d.vendasTrafego : 0;
      d.cpaTotal = d.vendasIngressos > 0 ? d.investimentoTotal / d.vendasIngressos : 0;
      d.roas = d.investimentoTotal > 0 ? d.faturamentoTotal / d.investimentoTotal : 0;
      d.conversaoOrderBump = d.vendasIngressos > 0 ? d.vendasOrderBump / d.vendasIngressos : 0;
      return d;
    });
    // Sort by chronological order
    allDailyList.sort((a: any, b: any) => {
      const aVal = a.date.split('/').reverse().join('');
      const bVal = b.date.split('/').reverse().join('');
      return aVal.localeCompare(bVal);
    });
    // Every distinct product/order-bump series key seen across the full
    // history, so the moving average can be computed for each one below.
    const allProductKeys = new Set<string>();
    allDailyList.forEach((d: any) => Object.keys(d.productSales || {}).forEach((k) => allProductKeys.add(k)));
    // Compute 7-day Moving Average across full history
    allDailyList.forEach((day: any, idx: number) => {
      const windowStart = Math.max(0, idx - 6);
      const windowDays = allDailyList.slice(windowStart, idx + 1);
      const windowLen = windowDays.length;
      const productSalesMM7: Record<string, number> = {};
      allProductKeys.forEach((key) => {
        const sum = windowDays.reduce((acc, d: any) => acc + (d.productSales?.[key] || 0), 0);
        productSalesMM7[key] = windowLen > 0 ? sum / windowLen : 0;
      });
      day.productSalesMM7 = productSalesMM7;
      const sumInvestimento = windowDays.reduce((acc, d) => acc + d.investimentoTotal, 0);
      const sumFaturamento = windowDays.reduce((acc, d) => acc + d.faturamentoTotal, 0);
      const sumVendasIngressos = windowDays.reduce((acc, d) => acc + d.vendasIngressos, 0);
      const sumVendasTrafego = windowDays.reduce((acc, d) => acc + d.vendasTrafego, 0);
      const sumImpressoes = windowDays.reduce((acc, d) => acc + d.impressoesTotal, 0);
      const sumCliques = windowDays.reduce((acc, d) => acc + d.cliquesTotal, 0);
      const sumPageViews = windowDays.reduce((acc, d) => acc + d.pageViewsTotal, 0);
      const sumCheckouts = windowDays.reduce((acc, d) => acc + d.checkoutsTotal, 0);
      // Volume totals (average per day in 7-day window)
      day.investimentoTotal_mm7 = windowLen > 0 ? sumInvestimento / windowLen : 0;
      day.faturamentoTotal_mm7 = windowLen > 0 ? sumFaturamento / windowLen : 0;
      day.lucroTotal_mm7 = windowLen > 0 ? (sumFaturamento - sumInvestimento) / windowLen : 0;
      day.vendasIngressos_mm7 = windowLen > 0 ? sumVendasIngressos / windowLen : 0;
      day.vendasTrafego_mm7 = windowLen > 0 ? sumVendasTrafego / windowLen : 0;
      day.impressoesTotal_mm7 = windowLen > 0 ? sumImpressoes / windowLen : 0;
      day.cliquesTotal_mm7 = windowLen > 0 ? sumCliques / windowLen : 0;
      day.pageViewsTotal_mm7 = windowLen > 0 ? sumPageViews / windowLen : 0;
      day.checkoutsTotal_mm7 = windowLen > 0 ? sumCheckouts / windowLen : 0;
      // Ratio metrics (weighted 7-day totals ratio)
      day.cpaTotal_mm7 = sumVendasIngressos > 0 ? sumInvestimento / sumVendasIngressos : 0;
      day.cpaTrafego_mm7 = sumVendasTrafego > 0 ? sumInvestimento / sumVendasTrafego : 0;
      day.roas_mm7 = sumInvestimento > 0 ? sumFaturamento / sumInvestimento : 0;
      day.ticketMedio_mm7 = sumVendasIngressos > 0 ? sumFaturamento / sumVendasIngressos : 0;
    });
    // Filter daily metrics for selected date range
    const dailyMetricsList = allDailyList.filter((d: any) => dateFilterPredicate(d.rawDate));
    const pagesList = Object.values(pagesMap)
      .sort((a, b) => b.salesMeta - a.salesMeta);
    return {
      geral: {
        investimentoTotal, faturamentoTotal, lucroTotal, ticketMedio, vendasIngressos, vendasTrafego, cpaTrafego, cpaTotal, roas, impressoesTotal, cliquesTotal, pageViewsTotal, checkoutsTotal, vendasOrderBump, conversaoOrderBump
      },
      geralPorFunil,
      prevGeral,
      comparison,
      campaigns,
      creatives,
      sources,
      totalSalesWithSource,
      totalRevenueWithSource,
      pagesList,
      dailyMetrics: dailyMetricsList,
      ticketBuyers: rawBuyersData,
      fgpBuyers: fgpBuyersByDate,
      fgpResume
    };
  }, [data, dateRange, comparePrevious, includeProductRevenue]);
  const { geral } = metricsData;
  const toggleCampaign = (campName: string) => {
    setExpandedCampaigns(prev => ({ ...prev, [campName]: !prev[campName] }));
  };
  const toggleMetric = (id: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(id)) {
        return prev.filter(m => m !== id);
      }
      return prev.length < 5 ? [...prev, id] : prev;
    });
  };
  const sortedCreatives = useMemo(() => {
    return [...metricsData.creatives].sort((a: any, b: any) => {
      let valA = a[creativeSort.column] || 0;
      let valB = b[creativeSort.column] || 0;
      if (creativeSort.column === 'name') {
        return creativeSort.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return creativeSort.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [metricsData.creatives, creativeSort]);
  const sortedCampaigns = useMemo(() => {
    return [...metricsData.campaigns]
      .map((camp: any) => ({
        ...camp,
        sets: [...camp.sets].sort((a: any, b: any) => {
          let valA = a[campaignSort.column] || 0;
          let valB = b[campaignSort.column] || 0;
          if (campaignSort.column === 'name') {
            return campaignSort.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          }
          return campaignSort.direction === 'asc' ? valA - valB : valB - valA;
        })
      }))
      .sort((a: any, b: any) => {
      let valA = a[campaignSort.column] || 0;
      let valB = b[campaignSort.column] || 0;
      if (campaignSort.column === 'name') {
        return campaignSort.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return campaignSort.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [metricsData.campaigns, campaignSort]);
  const sortedPages = useMemo(() => {
    return [...metricsData.pagesList].sort((a: any, b: any) => {
      let valA = a[pageSort.column] || 0;
      let valB = b[pageSort.column] || 0;
      if (pageSort.column === 'taxIC') {
        valA = a.pageViews > 0 ? a.checkouts / a.pageViews : 0;
        valB = b.pageViews > 0 ? b.checkouts / b.pageViews : 0;
      } else if (pageSort.column === 'taxVenda') {
        valA = a.checkouts > 0 ? a.salesMeta / a.checkouts : 0;
        valB = b.checkouts > 0 ? b.salesMeta / b.checkouts : 0;
      } else if (pageSort.column === 'url') {
        return pageSort.direction === 'asc' ? a.slug.localeCompare(b.slug) : b.slug.localeCompare(a.slug);
      }
      return pageSort.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [metricsData.pagesList, pageSort]);
  const sortedFgpBuyers = useMemo(() => {
    return [...metricsData.fgpBuyers].sort((a: any, b: any) => {
      const getVal = (row: any, col: string) => {
         if (col === 'valor') return parseValue(row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || '0');
         if (col === 'data') return new Date(row['Data'] || row['Data da Compra'] || row['Criado em'] || 0).getTime();
         return (row[col] || '').toString().toLowerCase();
      };
      const valA = getVal(a, fgpSort.column);
      const valB = getVal(b, fgpSort.column);
      if (typeof valA === 'string' && typeof valB === 'string') {
        return fgpSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return fgpSort.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [metricsData.fgpBuyers, fgpSort]);
  const campaignTotals = useMemo(() => {
    return metricsData.campaigns.reduce((acc, c: any) => {
      acc.investimento += c.investimento || 0;
      acc.impressoes += c.impressoes || 0;
      acc.cliques += c.cliques || 0;
      acc.compras += c.comprasTrafego || 0;
      acc.faturamento += c.faturamentoTrafego || 0;
      acc.landingPageViews += c.landingPageViews || 0;
      acc.initiateCheckout += c.initiateCheckout || 0;
      return acc;
    }, { investimento: 0, impressoes: 0, cliques: 0, compras: 0, faturamento: 0, landingPageViews: 0, initiateCheckout: 0 });
  }, [metricsData.campaigns]);
  const comparisonLabel = getPreviousPeriodLabel(dateRange, customDates);
  const comp = metricsData.comparison || {};
  const selectedFunnelTags = funnels.filter((funnel) => selectedFunnelIds.includes(funnel.id));
  const funnelColors = Object.fromEntries(funnels.map((funnel) => [funnel.name, getFunnelColor(funnels, funnel.id)]));
  // The daily product-sales series key the two built-in funnels down to short
  // aliases ("Estratégia" / "Gestão IA") instead of their full catalog name —
  // mirror that here so DailyChartSection's lookup still finds their color.
  const estrategiaFunnel = funnels.find((f) => f.id === 'estrategia' || /estrat(é|e)gia/i.test(f.name));
  const gestaoFunnel = funnels.find((f) => f.id === 'gestao-ia' || /gest(ã|a)o|projetos\s+com\s+ia/i.test(f.name));
  if (estrategiaFunnel) funnelColors['Estratégia'] = getFunnelColor(funnels, estrategiaFunnel.id);
  if (gestaoFunnel) funnelColors['Gestão IA'] = getFunnelColor(funnels, gestaoFunnel.id);
  // Per-funnel legend rows for the KPI cards — only worth showing when there's
  // more than one funnel to compare and few enough to fit (2-3). The card's
  // big number stays the combined total regardless.
  const buildBreakdown = (metricKey: keyof (typeof metricsData)['geral'], formatter: (val: number) => string) => {
    if (selectedFunnelTags.length <= 1 || selectedFunnelTags.length > 3) return undefined;
    return selectedFunnelTags.map((funnel) => ({
      name: funnel.name,
      color: getFunnelColor(funnels, funnel.id),
      value: formatter(metricsData.geralPorFunil[funnel.name]?.[metricKey] ?? 0),
    }));
  };
  const sourceWarnings = useMemo(() => {
    const diagnostics = Array.isArray(data?.diagnostics) ? data.diagnostics : [];
    return diagnostics.flatMap((item: any) => {
      const warnings: string[] = [];
      if (item.sourceError) warnings.push(`${item.funnelName}: Meta e Compradores não puderam ser lidos.`);
      else if (!item.metaRows || !item.buyerRows) warnings.push(`${item.funnelName}: Meta ou Compradores está sem dados.`);
      if (item.creativeError) warnings.push(`${item.funnelName}: Criativos não puderam ser lidos.`);
      else if (!item.creativeRows) warnings.push(`${item.funnelName}: Criativos está sem dados.`);
      return warnings;
    });
  }, [data]);
  const isPermissionError = Boolean(fetchError && /privada|permissão|compartilhar|acesso/i.test(fetchError));
  const hasInvalidCustomDateRange = Boolean(customDates.start && customDates.end && customDates.start > customDates.end);
  // Every non-MÁXIMO preset (and a custom range ending today or later) folds
  // today's still-accumulating totals into "current period", while the
  // previous-period comparison always uses whole, already-closed days — so
  // before today ends, the comparison is structurally guaranteed to look
  // like a drop even with normal performance. Surfaced as a caveat rather
  // than fixed by excluding today, since excluding it would make "Hoje"
  // itself meaningless and desync the KPI cards from the daily chart below.
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const comparisonIncludesPartialToday = comparePrevious
    && dateRange !== 'MÁXIMO'
    && (!dateRange.startsWith('CUSTOM:') || dateRange.split(':')[1]?.split('|')[1] >= todayIsoDate);

  if (view === 'usuarios') {
    return (
      <div className="dashboard-shell min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans">
        <header className="bg-[var(--header-bg)]/90 backdrop-blur-xl border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 sticky top-0 z-20 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
          <div className="flex flex-col items-start select-none">
            <img
              src={theme === 'light' ? '/allevotech-logo-light.svg' : '/allevotech-logo.svg'}
              alt="AllevoTech"
              className="h-9 sm:h-10 w-auto object-contain"
            />
            <span className="mt-0.5 pl-0.5 text-xs font-semibold text-[var(--text-muted)]">Dashboard de performance</span>
          </div>
          <Button variant="secondary" size="sm" className="min-h-10 gap-1.5 shrink-0" onClick={() => setView('dashboard')}>
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Voltar ao dashboard</span><span className="sm:hidden">Voltar</span>
          </Button>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-4 inline-flex rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-2)] p-1" role="tablist" aria-label="Gerenciar Acessos">
            <button
              type="button"
              role="tab"
              aria-selected={accessTab === 'usuarios'}
              onClick={() => setAccessTab('usuarios')}
              className={cn(
                'min-h-9 inline-flex items-center gap-1.5 rounded-[6px] px-3 text-sm font-semibold transition-colors',
                accessTab === 'usuarios' ? 'bg-[var(--selection-subtle)] text-[var(--selection-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <UserCheck size={15} /> Usuários
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={accessTab === 'apiKeys'}
              onClick={() => setAccessTab('apiKeys')}
              className={cn(
                'min-h-9 inline-flex items-center gap-1.5 rounded-[6px] px-3 text-sm font-semibold transition-colors',
                accessTab === 'apiKeys' ? 'bg-[var(--selection-subtle)] text-[var(--selection-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <KeyRound size={15} /> API Keys
            </button>
          </div>
          <React.Suspense fallback={<PanelLoadingState />}>
            {accessTab === 'usuarios' ? (
              <UsuariosTab
                adminUsers={adminUsers}
                isLoadingAdminUsers={isLoadingAdminUsers}
                adminUsersError={adminUsersError}
                isAddUserFormOpen={isAddUserFormOpen}
                setIsAddUserFormOpen={setIsAddUserFormOpen}
                newUserEmail={newUserEmail}
                setNewUserEmail={setNewUserEmail}
                newUserRole={newUserRole}
                setNewUserRole={setNewUserRole}
                isAddingUser={isAddingUser}
                handleAddUser={handleAddUser}
                removingUserEmail={removingUserEmail}
                handleRemoveUser={handleRemoveUser}
              />
            ) : (
              <ApiKeysTab
                apiTokens={apiTokens}
                isLoadingApiTokens={isLoadingApiTokens}
                apiTokensError={apiTokensError}
                isAddTokenFormOpen={isAddTokenFormOpen}
                setIsAddTokenFormOpen={setIsAddTokenFormOpen}
                newTokenName={newTokenName}
                setNewTokenName={setNewTokenName}
                isCreatingToken={isCreatingToken}
                handleCreateToken={handleCreateToken}
                createdToken={createdToken}
                dismissCreatedToken={dismissCreatedToken}
                tokenCopyState={tokenCopyState}
                handleCopyCreatedToken={handleCopyCreatedToken}
                revokingTokenId={revokingTokenId}
                handleRevokeToken={handleRevokeToken}
              />
            )}
          </React.Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-shell min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans pb-24 selection:bg-[var(--brand-strategy)]/30 selection:text-[var(--brand-strategy-ink)]">
      {/* HEADER */}
      <header className="bg-[var(--header-bg)]/90 backdrop-blur-xl border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sticky top-0 z-20 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
        <div className="flex items-center justify-between sm:justify-start gap-3 shrink-0">
          {/* Top Brand Logo & Profile Badge Row */}
          <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
            {/* Horizontal Brand Logo Image */}
            <div className="flex flex-col items-start cursor-pointer shrink-0 select-none">
              <img 
                src={theme === 'light' ? '/allevotech-logo-light.svg' : '/allevotech-logo.svg'}
                alt="AllevoTech" 
                className="h-9 sm:h-10 w-auto object-contain hover:opacity-90 transition-opacity"
              />
              <span className="mt-0.5 pl-0.5 text-xs font-semibold text-[var(--text-muted)]">Dashboard de performance</span>
            </div>
            {/* Corporate Profile & Access Menu (Positioned beside AllevoTech Logo) */}
            {authUser && (
              <div className="relative shrink-0" ref={profileMenuRef}>
                <button
                  ref={profileMenuButtonRef}
                  onClick={() => setIsProfileMenuOpen(prev => !prev)}
                  aria-label="Abrir menu da conta"
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-controls="profile-menu"
                  className="min-h-11 flex items-center gap-2 px-2.5 py-1.5 sm:py-2 bg-[var(--hover-wash)] hover:bg-[var(--hover-wash-strong)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-[8px] transition-all text-xs focus:outline-none shadow-sm group"
                  title="Sua Conta & Permissões Corporativas"
                >
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-[6px] bg-[var(--brand-strategy)]/15 text-[var(--brand-strategy-ink)] border border-[var(--brand-strategy-ink)]/30 flex items-center justify-center font-mono font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                    {authUser.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left max-w-[110px] sm:max-w-[140px]">
                    <span className="font-bold text-[var(--text-primary)] text-[10px] sm:text-[11px] leading-tight truncate">
                      {authUser.email.split('@')[0]}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-[var(--brand-strategy-ink)] font-mono font-bold flex items-center gap-0.5 sm:gap-1">
                      <ShieldCheck size={10} />
                      Verificado
                    </span>
                  </div>
                  <ChevronDown size={14} className={cn("text-[var(--text-muted)] transition-transform duration-200 ml-0.5", isProfileMenuOpen && "rotate-180 text-[var(--brand-strategy-ink)]")} />
                </button>
                {/* Collapsed Dropdown Menu */}
                <PopoverPanel open={isProfileMenuOpen} id="profile-menu" align="right" width="w-72" className="md:left-0 md:right-auto">
                    {/* Account Header */}
                    <div className="p-3 bg-[var(--surface-3)] border border-[var(--border-hairline)] rounded-[var(--radius-control)] flex items-center gap-3 mb-1">
                      <div className="w-9 h-9 rounded-[var(--radius-control)] bg-[var(--brand-strategy)]/15 text-[var(--brand-strategy-ink)] border border-[var(--brand-strategy-ink)]/30 flex items-center justify-center font-mono font-bold text-sm shrink-0">
                        {authUser.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold text-[var(--text-primary)] text-xs truncate">
                          {authUser.name || authUser.email.split('@')[0]}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                          {authUser.email}
                        </span>
                        <span className="text-[9px] text-[var(--brand-strategy-ink)] font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                          <ShieldCheck size={10} /> {authUser.provider === 'google' ? 'Google Workspace SSO' : 'E-mail Verificado'}
                        </span>
                      </div>
                    </div>
                    <div className="h-px bg-[var(--border-hairline)] my-2" />
                    {/* Actions */}
                    <div className="space-y-1">
                      {authUser.role === 'admin' && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setView('usuarios');
                          }}
                          className="min-h-11 w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-control)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] hover:text-[var(--brand-strategy-ink)] text-xs font-bold transition-colors text-left"
                        >
                          <Shield size={15} className="text-[var(--brand-strategy-ink)]" />
                          <div className="flex flex-col">
                            <span>Gerenciar Acessos</span>
                            <span className="text-[10px] text-[var(--text-muted)] font-normal">Domínios & Permissões Corporativas</span>
                          </div>
                        </button>
                      )}
                      {onLogout && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            onLogout();
                          }}
                          className="min-h-11 w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-control)] hover:bg-[var(--status-negative)]/10 text-[var(--status-negative)] hover:brightness-110 text-xs font-bold transition-colors text-left mt-1"
                        >
                          <LogOut size={15} className="text-[var(--status-negative)]" />
                          <span>Sair da Conta</span>
                        </button>
                      )}
                    </div>
                </PopoverPanel>
              </div>
            )}
          </div>
        </div>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 sm:flex sm:flex-wrap sm:gap-2.5 xl:w-auto">
          <div className="relative col-span-2 min-w-0 sm:col-auto sm:shrink-0" ref={funnelMenuRef}>
            <button
              ref={funnelMenuButtonRef}
              onClick={() => setIsFunnelMenuOpen(prev => !prev)}
              aria-expanded={isFunnelMenuOpen}
              aria-haspopup="menu"
              aria-controls="funnel-menu"
              className="min-h-11 flex w-full items-center gap-2 px-3 py-2 bg-[var(--hover-wash)] hover:bg-[var(--hover-wash-strong)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-[8px] transition-all text-sm font-semibold focus:outline-none shadow-sm sm:w-auto"
            >
              <Layers size={16} className="text-[var(--brand-strategy-ink)]" />
              <span className="text-[var(--text-muted)]">Funis</span>
              <span className="hidden min-w-0 truncate text-[var(--text-primary)] sm:inline sm:max-w-60">
                {selectedFunnelTags.length === funnels.length && funnels.length > 1
                  ? 'Todos os funis'
                  : selectedFunnelTags.length === 1
                    ? selectedFunnelTags[0].name
                    : `${selectedFunnelTags.length} funis selecionados`}
              </span>
              <ChevronDown size={15} className={cn("text-[var(--text-muted)] transition-transform", isFunnelMenuOpen && "rotate-180 text-[var(--brand-strategy-ink)]")} />
            </button>
            <PopoverPanel open={isFunnelMenuOpen} id="funnel-menu" width="w-[min(20rem,calc(100vw-1.5rem))]">
                <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">Selecione os funis para consolidar a análise.</p>
                <button
                  role="menuitemcheckbox"
                  aria-checked={selectedFunnelIds.length === funnels.length}
                  onClick={() => setSelectedFunnelIds(funnels.map((funnel) => funnel.id))}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left rounded-[6px] hover:bg-[var(--hover-wash-strong)] transition-colors"
                >
                  <span className={cn("w-4 h-4 border rounded-[4px] flex items-center justify-center shrink-0", selectedFunnelIds.length === funnels.length ? "bg-[var(--brand-strategy)] border-[var(--brand-strategy)] text-[var(--allevo-text-on-action)]" : "border-[var(--border-strong)]")}>{selectedFunnelIds.length === funnels.length && <Check size={12} strokeWidth={3} />}</span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">Todos os funis</span>
                </button>
                <div className="h-px bg-[var(--border-hairline)] my-1.5" />
                {funnels.map((funnel) => {
                  const isSelected = selectedFunnelIds.includes(funnel.id);
                  return (
                    <div key={funnel.id} className="flex items-center gap-1 rounded-[6px] hover:bg-[var(--hover-wash-strong)]">
                      <button
                        role="menuitemcheckbox"
                        aria-checked={isSelected}
                        onClick={() => toggleFunnel(funnel.id)}
                        className="min-w-0 flex-1 flex items-center gap-3 px-2.5 py-2.5 text-left transition-colors"
                      >
                        <span className={cn("w-4 h-4 border rounded-[4px] flex items-center justify-center shrink-0", isSelected ? "bg-[var(--brand-strategy)] border-[var(--brand-strategy)] text-[var(--allevo-text-on-action)]" : "border-[var(--border-strong)]")}>{isSelected && <Check size={12} strokeWidth={3} />}</span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getFunnelColor(funnels, funnel.id) }} />
                        <span className="text-sm font-medium text-[var(--text-primary)] min-w-0 truncate">{funnel.name}</span>
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" role="menuitem" onClick={() => openFunnelEditor(funnel)} title={`Editar ${funnel.name}`} aria-label={`Editar ${funnel.name}`} className="min-w-11 min-h-11 shrink-0 inline-flex items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--hover-wash-strong)] hover:text-[var(--text-primary)]">
                            <Pencil size={14} />
                          </button>
                          <button type="button" role="menuitem" onClick={() => { setIsFunnelMenuOpen(false); setFunnelPendingDelete(funnel); }} title={`Remover ${funnel.name}`} aria-label={`Remover ${funnel.name}`} className="min-w-11 min-h-11 shrink-0 inline-flex items-center justify-center rounded-[6px] text-[var(--status-negative)] hover:bg-[var(--status-negative)]/15 hover:brightness-110">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {isAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsFunnelMenuOpen(false);
                      setIsAddFunnelConfirmOpen(true);
                    }}
                    className="w-full mt-2 pt-3 border-t border-[var(--border-hairline)] flex items-center gap-2.5 px-2.5 py-2.5 rounded-[6px] text-[var(--brand-strategy-ink)] hover:bg-[var(--brand-strategy)]/10 text-left text-sm font-bold transition-colors"
                  >
                    <Plus size={16} /> Adicionar funil
                  </button>
                )}
            </PopoverPanel>
          </div>
          {/* Compact Popover Date Range Selector */}
          <div className="relative min-w-0 sm:shrink-0" ref={dateMenuRef}>
            <button
              ref={dateMenuButtonRef}
              onClick={() => setIsDateMenuOpen(prev => !prev)}
              aria-label="Abrir filtro de período"
              aria-expanded={isDateMenuOpen}
              aria-haspopup="dialog"
              aria-controls="date-range-menu"
              className="min-h-11 flex w-full min-w-0 items-center gap-2 px-3 py-2 bg-[var(--hover-wash)] hover:bg-[var(--hover-wash-strong)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-[8px] transition-all text-xs font-bold focus:outline-none shadow-sm group sm:w-auto"
              title="Filtrar Período de Análise"
            >
              <Calendar size={14} className="text-[var(--brand-strategy-ink)]" />
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-[var(--text-muted)] font-medium text-xs">Período:</span>
                <span className="max-w-36 truncate text-[var(--brand-strategy-ink)] font-mono font-bold sm:max-w-none">{getLabelForDateRange(dateRange, customDates)}</span>
              </div>
              <ChevronDown size={14} className={cn("text-[var(--text-muted)] transition-transform duration-200 ml-0.5", isDateMenuOpen && "rotate-180 text-[var(--brand-strategy-ink)]")} />
            </button>
            {/* Popover Dropdown */}
            <PopoverPanel open={isDateMenuOpen} id="date-range-menu" role="dialog" align="right" width="w-[min(20rem,calc(100vw-1.5rem))]" className="p-4" aria-label="Selecionar período">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--border-hairline)]">
                  <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} className="text-[var(--brand-strategy-ink)]" /> Selecionar Período
                  </span>
                  <button
                    onClick={() => setIsDateMenuOpen(false)}
                    aria-label="Fechar filtro de período"
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-[var(--radius-control)] text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Preset Options, grouped */}
                <div className="mb-3 space-y-3">
                  {dateOptionGroups.map((group) => (
                    <div key={group.label}>
                      <span className="text-[length:var(--type-caption)] font-mono font-bold text-[var(--text-subtle)] uppercase tracking-wider block mb-1.5">{group.label}</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.options.map(opt => {
                          const isSelected = dateRange === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => {
                                setDateRange(opt);
                                setCustomDates({ start: '', end: '' });
                                setIsDateMenuOpen(false);
                              }}
                              className={cn(
                                "px-3 py-2 text-xs font-bold rounded-[var(--radius-control)] transition-all text-left flex items-center justify-between border",
                                isSelected
                                  ? "bg-[var(--selection-subtle)] border-[var(--selection-ink)]/50 text-[var(--selection-ink)]"
                                  : "bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-4)] border-[var(--border-hairline)]"
                              )}
                            >
                              <span>{getLabelForDateRange(opt, { start: '', end: '' })}</span>
                              {isSelected && <Check size={14} strokeWidth={3} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Custom Date Range Picker */}
                <div className="pt-3 border-t border-[var(--chart-grid)] space-y-2 mb-3">
                  <span className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider block">Datas Personalizadas</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="dashboard-start-date" className="text-xs text-[var(--text-muted)] block mb-1 font-mono font-bold">Data Inicial</label>
                      <div className="relative flex items-center">
                        <input 
                          id="dashboard-start-date"
                          type="date" 
                          value={customDates.start}
                          onClick={(e) => {
                            if ('showPicker' in e.currentTarget) {
                              try { (e.currentTarget as any).showPicker(); } catch {}
                            }
                          }}
                          onChange={(e) => {
                            const start = e.target.value;
                            setCustomDates(prev => ({...prev, start}));
                            if (start && customDates.end && start <= customDates.end) {
                              setDateRange(`CUSTOM:${start}|${customDates.end}`);
                              setIsDateMenuOpen(false);
                            }
                          }}
                          className="w-full pl-3 pr-8 py-2 text-base sm:text-xs font-mono font-bold rounded-[8px] border border-[var(--overlay-border)] bg-[var(--control)] text-[var(--text-primary)] hover:bg-[var(--control-hover)] hover:border-[var(--brand-strategy-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-strategy-ink)] cursor-pointer shadow-inner"
                          aria-invalid={hasInvalidCustomDateRange}
                          aria-describedby={hasInvalidCustomDateRange ? 'dashboard-date-range-error' : undefined}
                        />
                        <Calendar size={14} className="absolute right-3 text-[var(--brand-strategy-ink)] pointer-events-none shrink-0 stroke-[2.5]" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="dashboard-end-date" className="text-xs text-[var(--text-muted)] block mb-1 font-mono font-bold">Data Final</label>
                      <div className="relative flex items-center">
                        <input 
                          id="dashboard-end-date"
                          type="date" 
                          value={customDates.end}
                          onClick={(e) => {
                            if ('showPicker' in e.currentTarget) {
                              try { (e.currentTarget as any).showPicker(); } catch {}
                            }
                          }}
                          onChange={(e) => {
                            const end = e.target.value;
                            setCustomDates(prev => ({...prev, end}));
                            if (customDates.start && end && customDates.start <= end) {
                              setDateRange(`CUSTOM:${customDates.start}|${end}`);
                              setIsDateMenuOpen(false);
                            }
                          }}
                          className="w-full pl-3 pr-8 py-2 text-base sm:text-xs font-mono font-bold rounded-[8px] border border-[var(--overlay-border)] bg-[var(--control)] text-[var(--text-primary)] hover:bg-[var(--control-hover)] hover:border-[var(--brand-strategy-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-strategy-ink)] cursor-pointer shadow-inner"
                          aria-invalid={hasInvalidCustomDateRange}
                          aria-describedby={hasInvalidCustomDateRange ? 'dashboard-date-range-error' : undefined}
                        />
                        <Calendar size={14} className="absolute right-3 text-[var(--brand-strategy-ink)] pointer-events-none shrink-0 stroke-[2.5]" />
                      </div>
                    </div>
                  </div>
                  {hasInvalidCustomDateRange && (
                    <p id="dashboard-date-range-error" className="text-xs text-[var(--status-negative)] font-medium" role="alert">
                      A data final precisa ser igual ou posterior à data inicial.
                    </p>
                  )}
                </div>
            </PopoverPanel>
          </div>
          {/* Sync Button & Last Updated Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {lastUpdated && (
              <span className="text-[11px] text-[var(--text-muted)] font-mono font-medium hidden xl:inline-block pr-1">
                Última sinc. às <strong className="text-[var(--text-primary)] font-bold">{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}h</strong>
              </span>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-wash)] transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Button
              variant="primary"
              size="icon"
              onClick={() => loadData(selectedProject)}
              disabled={loading}
              aria-busy={loading}
              title={lastUpdated ? `Última sincronização às ${lastUpdated.toLocaleTimeString()}` : "Sincronizar planilha"}
              aria-label="Sincronizar planilha"
              className="active:scale-95"
            >
              <RotateCcw size={18} className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-3 sm:p-6 lg:p-8">
        <h1 className="sr-only">Dashboard de performance AllevoTech</h1>
        <div className="flex items-start gap-4 xl:gap-6">
          <aside className={cn("hidden lg:block sticky top-24 shrink-0 transition-[width] duration-200", isSidebarCollapsed ? "w-[58px]" : "w-52")}>
            <div className="bg-[var(--surface-1)] border border-[var(--border-hairline)] rounded-[8px] p-2 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
              <div className={cn("flex items-center mb-2", isSidebarCollapsed ? "justify-center" : "justify-between px-2") }>
                {!isSidebarCollapsed && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Navegação</span>}
                <button
                  onClick={() => setIsSidebarCollapsed(prev => !prev)}
                  className="w-11 h-11 flex items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--brand-strategy-ink)] hover:bg-[var(--hover-wash-strong)] transition-colors"
                  title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                  aria-label={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                >
                  {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                </button>
              </div>
              <nav className="space-y-1" aria-label="Navegação principal">
                {tabs.map(tab => {
                  const isActive = activeTab === tab.name;
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.name}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setActiveTab(tab.name)}
                      title={isSidebarCollapsed ? tab.name : undefined}
                      aria-label={isSidebarCollapsed ? tab.name : undefined}
                      className={cn(
                        "w-full flex items-center rounded-[var(--radius-control)] text-sm font-semibold transition-colors border border-transparent",
                        isSidebarCollapsed ? "justify-center h-11" : "gap-3 px-3 py-2.5",
                        isActive ? "bg-[var(--selection-subtle)] border-[var(--selection-ink)]/30 text-[var(--selection-ink)] font-bold" : "text-[var(--text-muted)] hover:bg-[var(--hover-wash-strong)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      <TabIcon size={18} className="shrink-0" />
                      {!isSidebarCollapsed && <span>{tab.name}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
          <section className="min-w-0 flex-1">
        {fetchError && (
          <div role="alert" aria-live="assertive" className="mb-6 p-4 sm:p-6 bg-[var(--overlay-bg)] border border-[var(--brand-strategy-ink)]/50 rounded-[8px] shadow-lg text-[var(--text-primary)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-[var(--brand-strategy)]/15 text-[var(--brand-strategy-ink)] border border-[var(--brand-strategy-ink)]/30 rounded-[8px] shrink-0">
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--brand-strategy-ink)] mb-1">
                  {isPermissionError ? 'Permissão de acesso necessária na planilha' : 'Não foi possível atualizar os dados'}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-3xl mb-2">
                  {fetchError}
                  {data && ' Os últimos dados carregados continuam visíveis.'}
                </p>
                {isPermissionError && (
                  <div className="mt-3 text-xs bg-[var(--surface-3)] p-3.5 rounded-[var(--radius-control)] border border-[var(--border-hairline)]">
                    <p className="font-bold text-[var(--brand-strategy-ink)] mb-1">Como liberar a leitura da planilha:</p>
                    <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)]">
                      <li>Fale com quem administra a planilha antes de mudar o compartilhamento.</li>
                      <li>Clique em <strong>Compartilhar</strong> (canto superior direito) e, se possível, restrinja o acesso a <strong>pessoas do domínio da empresa</strong> com permissão <strong>Leitor</strong>.</li>
                      <li>Só use <strong>Qualquer pessoa com o link</strong> se o domínio não for uma opção — evite deixar a planilha acessível a qualquer pessoa da internet.</li>
                      <li>Depois que o acesso for corrigido, sincronize novamente.</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
            <Button variant="primary" onClick={() => loadData(selectedProject)} disabled={loading} className="shrink-0 self-stretch md:self-auto justify-center">
              <RotateCcw size={16} className={cn("shrink-0", loading && "animate-spin")} />
              <span>Tentar Novamente</span>
            </Button>
          </div>
        )}
            <div className="lg:hidden w-full relative mb-5" ref={tabMenuRef}>
              <button
                ref={tabMenuButtonRef}
                onClick={() => setIsTabMenuOpen(prev => !prev)}
                aria-label="Abrir navegação"
                aria-expanded={isTabMenuOpen}
                aria-haspopup="menu"
                aria-controls="mobile-navigation-menu"
                className="w-full flex items-center justify-between px-4 py-3 bg-[var(--overlay-bg)] border border-[var(--chart-grid)] hover:border-[var(--overlay-border)] rounded-[8px] text-[var(--text-primary)] font-bold text-sm shadow-lg focus:outline-none transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-[8px] bg-[var(--brand-strategy)]/10 text-[var(--brand-strategy-ink)] border border-[var(--brand-strategy-ink)]/20">
                    {(() => {
                      const CurrentTabIcon = tabs.find(t => t.name === activeTab)?.icon || LayoutDashboard;
                      return <CurrentTabIcon size={18} className="text-[var(--brand-strategy-ink)]" />;
                    })()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] text-[var(--text-muted)] font-mono font-bold uppercase tracking-widest leading-none">Navegação</span>
                    <span className="text-sm font-mono font-bold text-[var(--brand-strategy-ink)] leading-tight">{activeTab}</span>
                  </div>
                </div>
                <ChevronDown size={18} className={cn("text-[var(--text-muted)] transition-transform duration-200", isTabMenuOpen && "rotate-180 text-[var(--brand-strategy-ink)]")} />
              </button>
              <PopoverPanel open={isTabMenuOpen} id="mobile-navigation-menu" align="full" className="z-40 space-y-1">
                  {tabs.map(tab => {
                    const isActive = activeTab === tab.name;
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.name}
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => {
                          setActiveTab(tab.name);
                          setIsTabMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3.5 py-3 rounded-[var(--radius-control)] font-bold text-xs transition-all text-left border border-transparent",
                          isActive
                            ? "bg-[var(--selection-subtle)] border-[var(--selection-ink)]/30 text-[var(--selection-ink)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <TabIcon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                          <span>{tab.name}</span>
                        </div>
                        {isActive && <Check size={16} strokeWidth={3} />}
                      </button>
                    );
                  })}
              </PopoverPanel>
            </div>
        {loading && !data ? (
          <div role="status" aria-live="polite" className="flex flex-col justify-center items-center h-64 text-[var(--text-muted)] gap-4">
            <RotateCcw size={32} className="animate-spin text-[var(--brand-strategy-ink)]" />
            <span className="font-bold tracking-wide">Carregando dados...</span>
          </div>
        ) : (
          <>
            {sourceWarnings.length > 0 && (
              <div role="status" className="mb-5 flex items-start gap-3 rounded-[8px] border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <p className="font-semibold">Algumas fontes não entraram nesta sincronização.</p>
                  <p className="mt-1 text-amber-100/80">{sourceWarnings.join(' ')}</p>
                </div>
              </div>
            )}
            <React.Suspense fallback={<PanelLoadingState />}>
            {activeTab === 'Geral' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* TOP ROW: HERO METRICS HIGHLIGHTED */}
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Funis selecionados">
                    <span className="text-xs font-semibold text-[var(--text-subtle)]">Funis</span>
                    {selectedFunnelTags.map((funnel) => (
                      <Badge key={funnel.id} title={funnel.name} dotColor={getFunnelColor(funnels, funnel.id)}>
                        <span className="truncate">{funnel.name}</span>
                      </Badge>
                    ))}
                  </div>
                  {hasPaidLaunchSelected && (
                    <label className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] border border-[var(--accent-purple-ink)]/35 bg-[var(--accent-purple)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent-purple-ink)]/60">
                      <input
                        type="checkbox"
                        checked={includeProductRevenue}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          startRevenueTransition(() => setIncludeProductRevenue(checked));
                        }}
                        className="h-4 w-4 accent-[var(--accent-purple)]"
                      />
                      <span className="font-medium">Incluir faturamento dos produtos no total global</span>
                      {isRecalculatingRevenue && <span className="text-xs text-[var(--text-subtle)]">Recalculando...</span>}
                    </label>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--brand-strategy-ink)] flex items-center gap-1.5">
                      <Zap size={14} className="fill-[var(--brand-strategy-ink)]" /> Principais KPIs
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-[var(--text-muted)] font-medium hidden sm:inline">Clique em uma métrica para destacar no gráfico</span>
                      <button
                        type="button"
                        onClick={() => setComparePrevious((prev) => !prev)}
                        aria-pressed={comparePrevious}
                        className={cn(
                          "min-h-11 flex items-center gap-2 cursor-pointer select-none text-xs font-bold px-3 py-2 rounded-[var(--radius-control)] border transition-colors",
                          comparePrevious
                            ? "bg-[var(--selection-subtle)] border-[var(--selection-ink)]/50 text-[var(--selection-ink)]"
                            : "bg-[var(--hover-wash)] border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-all shrink-0",
                          comparePrevious
                            ? "bg-[var(--selection)] border-[var(--selection)] shadow-sm shadow-[var(--selection)]/30"
                            : "bg-[var(--overlay-bg)] border-[var(--overlay-border)]"
                        )}>
                          {comparePrevious && <Check size={10} className="text-[var(--text-primary)]" strokeWidth={3} />}
                        </div>
                        <span className="flex items-center gap-1.5">
                          <History size={13} className="text-[var(--selection-ink)]" /> Comparar período
                        </span>
                      </button>
                      {comparisonIncludesPartialToday && (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]" role="note">
                          <AlertTriangle size={13} />
                          Hoje ainda não terminou — quedas nesse comparativo podem só refletir isso.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-5">
                    <MetricCard 
                      id="investimentoTotal"
                      title="Investimento Total"
                      value={formatCurrency(geral.investimentoTotal)}
                      subtext="Valor com impostos"
                      icon={<DollarSign size={20} />}
                      isHero={true}
                      heroTag="Gasto Ad"
                      selected={selectedMetrics.includes('investimentoTotal')}
                      onClick={() => toggleMetric('investimentoTotal')}
                      comparison={comp.investimentoTotal}
                      comparisonLabel={comparisonLabel}
                      breakdown={buildBreakdown('investimentoTotal', formatCurrency)}
                    />
                    <MetricCard 
                      id="faturamentoTotal"
                      title="Faturamento Total"
                      value={formatCurrency(geral.faturamentoTotal)}
                      icon={<TrendingUp size={20} />}
                      isHero={true}
                      heroTag="Receita Bruta"
                      selected={selectedMetrics.includes('faturamentoTotal')}
                      onClick={() => toggleMetric('faturamentoTotal')}
                      comparison={comp.faturamentoTotal}
                      comparisonLabel={comparisonLabel}
                      breakdown={buildBreakdown('faturamentoTotal', formatCurrency)}
                    />
                    <MetricCard 
                      id="cpaTotal"
                      title="CPA (Total)"
                      value={formatCurrency(geral.cpaTotal)}
                      icon={<Layers size={20} />}
                      isHero={true}
                      heroTag="Custo / Venda"
                      selected={selectedMetrics.includes('cpaTotal')}
                      onClick={() => toggleMetric('cpaTotal')}
                      comparison={comp.cpaTotal}
                      comparisonLabel={comparisonLabel}
                      breakdown={buildBreakdown('cpaTotal', formatCurrency)}
                    />
                    <MetricCard 
                      id="ticketMedio"
                      title="Ticket Médio"
                      value={formatCurrency(geral.ticketMedio)}
                      icon={<Ticket size={20} />}
                      isHero={true}
                      heroTag="Valor Médio"
                      selected={selectedMetrics.includes('ticketMedio')}
                      onClick={() => toggleMetric('ticketMedio')}
                      comparison={comp.ticketMedio}
                      comparisonLabel={comparisonLabel}
                      breakdown={buildBreakdown('ticketMedio', formatCurrency)}
                    />
                  </div>
                </div>
                {/* SECOND ROW: SECONDARY METRICS — split into two ≤4-item groups
                    (volume/resultado vs. eficiência) instead of one flat row
                    of 6, so each group stays within the chunking guideline. */}
                <div className="space-y-6">
                <div>
                  <span className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3 block">
                    Resultado
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <MetricCard
                      id="lucroTotal"
                      title="Lucro Total"
                      value={formatCurrency(geral.lucroTotal)}
                      valueColor={geral.lucroTotal >= 0 ? "text-[var(--brand-strategy-ink)]" : "text-[var(--status-negative)]"}
                      icon={<Zap size={20} />}
                      selected={selectedMetrics.includes('lucroTotal')}
                      onClick={() => toggleMetric('lucroTotal')}
                      comparison={comp.lucroTotal}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('lucroTotal', formatCurrency)}
                    />
                    <MetricCard 
                      id="vendasIngressos"
                      title="Vendas (Todas)"
                      value={geral.vendasIngressos}
                      icon={<ShoppingCart size={20} />}
                      selected={selectedMetrics.includes('vendasIngressos')}
                      onClick={() => toggleMetric('vendasIngressos')}
                      comparison={comp.vendasIngressos}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('vendasIngressos', formatNumber)}
                    />
                    <MetricCard 
                      id="vendasTrafego"
                      title="Vendas (Tráfego)"
                      value={geral.vendasTrafego}
                      icon={<Target size={20} />}
                      selected={selectedMetrics.includes('vendasTrafego')}
                      onClick={() => toggleMetric('vendasTrafego')}
                      comparison={comp.vendasTrafego}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('vendasTrafego', formatNumber)}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3 block">
                    Eficiência
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <MetricCard
                      id="cpaTrafego"
                      title="CPA (Tráfego)"
                      value={formatCurrency(geral.cpaTrafego)}
                      icon={<Disc size={20} />}
                      selected={selectedMetrics.includes('cpaTrafego')}
                      onClick={() => toggleMetric('cpaTrafego')}
                      comparison={comp.cpaTrafego}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('cpaTrafego', formatCurrency)}
                    />
                    <MetricCard 
                      id="roas"
                      title="ROAS"
                      value={`${(geral.roas || 0).toFixed(2)}x`}
                      icon={<TrendingUp size={20} />}
                      selected={selectedMetrics.includes('roas')}
                      onClick={() => toggleMetric('roas')}
                      comparison={comp.roas}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('roas', (v) => `${v.toFixed(2)}x`)}
                    />
                    <MetricCard
                      id="conversaoOrderBump"
                      title="Conversão Order Bump"
                      value={formatPercent(geral.conversaoOrderBump)}
                      icon={<Package size={20} />}
                      selected={selectedMetrics.includes('conversaoOrderBump')}
                      onClick={() => toggleMetric('conversaoOrderBump')}
                      comparison={comp.conversaoOrderBump}
                      comparisonLabel={comparisonLabel}
                      className="metric-card--compact"
                      breakdown={buildBreakdown('conversaoOrderBump', formatPercent)}
                    />
                  </div>
                </div>
                </div>
                <DailyChartSection
                  dailyMetrics={metricsData.dailyMetrics}
                  selectedMetrics={selectedMetrics}
                  setSelectedMetrics={setSelectedMetrics}
                  showMovingAverage={showMovingAverage}
                  setShowMovingAverage={setShowMovingAverage}
                  METRIC_CONFIG={METRIC_CONFIG}
                  funnelColors={funnelColors}
                  formatCurrency={formatCurrency}
                  formatNumber={formatNumber}
                  theme={theme}
                />
              </div>
            )}
            {activeTab === 'Campanhas' && (
              <CampanhasTab
                sortedCampaigns={sortedCampaigns}
                campaignSort={campaignSort}
                toggleCampaignSort={toggleCampaignSort}
                expandedCampaigns={expandedCampaigns}
                toggleCampaign={toggleCampaign}
                campaignTotals={campaignTotals}
                metricsCampaignsCount={metricsData.campaigns.length}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
              />
            )}
            {activeTab === 'Funil' && (
              <FunilTab
                geral={geral}
                metricsData={metricsData}
                sortedCampaigns={sortedCampaigns}
                expandedCampaigns={expandedCampaigns}
                toggleCampaign={toggleCampaign}
                campaignTotals={campaignTotals}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
              />
            )}
            {activeTab === 'Criativos' && (
              <CriativosTab
                creativeFilter={creativeFilter}
                setCreativeFilter={setCreativeFilter}
                creativeSort={creativeSort}
                toggleCreativeSort={toggleCreativeSort}
                sortedCreatives={sortedCreatives}
                getCreativeThumbnail={getCreativeThumbnail}
                setActiveLightboxImage={setActiveLightboxImage}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
              />
            )}
            {activeTab === 'Fontes das Vendas' && (
              <FontesTab
                metricsData={metricsData}
                selectedSourceIndices={selectedSourceIndices}
                setSelectedSourceIndices={setSelectedSourceIndices}
                sortedPages={sortedPages}
                pageSort={pageSort}
                togglePageSort={togglePageSort}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
              />
            )}
            {activeTab === 'Lançamento' && hasPaidLaunchSelected && (
              <ProdutosTab
                productBuyers={metricsData.fgpBuyers}
                ticketBuyers={metricsData.ticketBuyers}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
              />
            )}
            </React.Suspense>
          </>
        )}
        <div className="mt-16 mb-8 flex flex-col items-center justify-center gap-2 text-center">
          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--text-subtle)]">
              <span className="w-2 h-2 rounded-full bg-[var(--brand-strategy)] animate-pulse"></span>
              Dados atualizados às {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
          </section>
        </div>
      </main>
      <LightboxModal
        activeLightboxImage={activeLightboxImage}
        setActiveLightboxImage={setActiveLightboxImage}
        getCreativeThumbnail={getCreativeThumbnail}
        formatCurrency={formatCurrency}
      />
      <Dialog open={isAddFunnelConfirmOpen} onClose={() => setIsAddFunnelConfirmOpen(false)} labelledBy="add-funnel-confirm-title">
        <h2 id="add-funnel-confirm-title" className="text-lg font-bold text-[var(--text-primary)]">Adicionar novo funil?</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          O dashboard vai validar a planilha e incluir o funil automaticamente na seleção e nos relatórios.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsAddFunnelConfirmOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { setIsAddFunnelConfirmOpen(false); setIsAddFunnelModalOpen(true); }}>Continuar</Button>
        </div>
      </Dialog>
      <Dialog open={isAddFunnelModalOpen} onClose={() => closeFunnelEditor()} labelledBy="add-funnel-title" as="form" onSubmit={handleSaveFunnel} className="max-w-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-funnel-title" className="text-lg font-bold text-[var(--text-primary)]">
              {createdFunnel ? (editingFunnel ? 'Funil atualizado' : 'Funil criado') : editingFunnel ? 'Editar funil' : 'Novo funil'}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {createdFunnel
                ? 'Use o ID abaixo pra apontar sua automação (ex.: n8n) pra esse funil no banco.'
                : 'A planilha é opcional — sem ela, os dados vêm direto do banco (Postgres). Se colar um link, importamos os dados dela pro banco uma única vez, agora; depois disso o dashboard nunca mais lê essa planilha.'}
            </p>
          </div>
          <Button variant="icon" size="icon" className="w-9 h-9 min-h-9 min-w-9" onClick={() => closeFunnelEditor()} aria-label="Fechar cadastro de funil">
            <X size={18} />
          </Button>
        </div>
        {createdFunnel ? (
          <div className="mt-5 space-y-4">
            <div>
              <span className="text-sm font-semibold text-[var(--text-primary)]">funnel_id</span>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-h-11 flex-1 flex items-center rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--brand-strategy-ink)] font-mono select-all overflow-x-auto">
                  {createdFunnel.id}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 shrink-0"
                  onClick={() => {
                    navigator.clipboard?.writeText(createdFunnel.id)
                      .then(() => {
                        setFunnelIdCopyState('copied');
                        setTimeout(() => setFunnelIdCopyState('idle'), 2000);
                      })
                      .catch(() => {
                        setFunnelIdCopyState('error');
                        setTimeout(() => setFunnelIdCopyState('idle'), 2000);
                      });
                  }}
                >
                  <span role="status" aria-live="polite">
                    {funnelIdCopyState === 'copied' ? 'Copiado!' : funnelIdCopyState === 'error' ? 'Não foi possível copiar' : 'Copiar'}
                  </span>
                </Button>
              </div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-[var(--brand-strategy-ink)]/20 bg-[var(--brand-strategy)]/[0.06] p-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Insira linhas em <code className="font-mono">meta_ads</code>, <code className="font-mono">buyers</code> e <code className="font-mono">creatives</code> com <code className="font-mono">funnel_id = '{createdFunnel.id}'</code> pra esse funil aparecer no dashboard.
            </div>
            {createdFunnelImport?.result && (
              <div className="rounded-[var(--radius-control)] border border-[var(--status-positive)]/25 bg-[var(--status-positive)]/[0.08] p-3 text-sm leading-relaxed text-[var(--text-muted)]">
                <strong className="text-[var(--status-positive)]">Importação da planilha concluída:</strong> {createdFunnelImport.result.metaRows} linhas de Meta Ads, {createdFunnelImport.result.buyerRows} compradores, {createdFunnelImport.result.creativeRows} criativos. A planilha não será lida de novo — qualquer venda nova precisa entrar direto no banco.
              </div>
            )}
            {createdFunnelImport?.error && (
              <div role="alert" className="rounded-[var(--radius-control)] border border-[var(--status-negative)]/30 bg-[var(--status-negative)]/10 p-3 text-sm text-[var(--status-negative)]">
                <strong>Funil salvo, mas a importação da planilha falhou:</strong> {createdFunnelImport.error}
              </div>
            )}
          </div>
        ) : (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Nome do funil
            <input value={newFunnelName} onChange={(event) => setNewFunnelName(event.target.value)} required minLength={3} maxLength={80} placeholder="Ex.: Livro Nova Oferta" className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--brand-strategy-ink)]" />
          </label>
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Tipo do funil
            <select value={newFunnelSourceType} onChange={(event) => setNewFunnelSourceType(event.target.value)} className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-strategy-ink)]">
              <option value="standard">Padrão (venda de ingresso, com Order Bump)</option>
              <option value="paid-launch">Lançamento pago/perpétuo (sem Order Bump)</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Link da planilha Google Sheets <span className="font-normal text-[var(--text-subtle)]">(opcional)</span>
            <input type="url" value={newFunnelUrl} onChange={(event) => setNewFunnelUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-black/20 px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--brand-strategy-ink)]" />
          </label>
          {newFunnelUrl && (
            <div className="rounded-[var(--radius-control)] border border-[var(--brand-strategy-ink)]/20 bg-[var(--brand-strategy)]/[0.06] p-3 text-sm leading-relaxed text-[var(--text-muted)]">
              <strong className="text-[var(--brand-strategy-ink)]">Antes de adicionar:</strong> na planilha, abra <strong>Compartilhar</strong> e, se possível, restrinja o acesso a <strong>pessoas do domínio da empresa</strong> com permissão <strong>Leitor</strong>. Use <strong>Qualquer pessoa com o link</strong> apenas se essa opção não existir na sua conta Google.
            </div>
          )}
          {newFunnelError && <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--status-negative)]/30 bg-[var(--status-negative)]/10 p-3 text-sm text-[var(--status-negative)]">{newFunnelError}</p>}
        </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          {createdFunnel ? (
            <Button type="button" variant="primary" size="sm" className="min-h-10" onClick={() => closeFunnelEditor(true)}>Concluir</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" className="min-h-10" disabled={isCreatingFunnel} onClick={() => closeFunnelEditor()}>Cancelar</Button>
              <Button variant="primary" size="sm" className="min-h-10" type="submit" disabled={isCreatingFunnel}>
                {isCreatingFunnel ? 'Salvando...' : editingFunnel ? 'Salvar' : 'Adicionar'}
              </Button>
            </>
          )}
        </div>
      </Dialog>
      <Dialog open={Boolean(funnelPendingDelete)} onClose={() => { if (!isDeletingFunnel) setFunnelPendingDelete(null); }} labelledBy="delete-funnel-title">
        <h2 id="delete-funnel-title" className="text-lg font-bold text-[var(--text-primary)]">Remover funil?</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          <strong>{funnelPendingDelete?.name}</strong> deixará de aparecer no dashboard. Essa ação não apaga a planilha de origem.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" className="min-h-10" disabled={isDeletingFunnel} onClick={() => setFunnelPendingDelete(null)}>Cancelar</Button>
          <Button variant="danger" size="sm" className="min-h-10" disabled={isDeletingFunnel} onClick={handleDeleteFunnel}>
            {isDeletingFunnel ? 'Removendo...' : 'Remover funil'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
