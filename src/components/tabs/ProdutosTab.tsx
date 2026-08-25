import React, { useMemo } from 'react';
import { Package, ReceiptText, ShoppingBag, TrendingUp } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface ProdutosTabProps {
  productBuyers: any[];
  ticketBuyers: any[];
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

const SOURCE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)'
];

function parseValue(value: unknown) {
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  if (!normalized) return 0;
  const canonical = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized.replace(/,/g, '');
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const ProdutosTab: React.FC<ProdutosTabProps> = ({ productBuyers, ticketBuyers, formatCurrency, formatNumber }) => {
  const { products, daily, totalSales, totalRevenue, attribution, attributedSales } = useMemo(() => {
    const byProduct = new Map<string, { name: string; sales: number; revenue: number }>();
    const byDay = new Map<string, { date: string; sales: number; revenue: number }>();
    const ticketsByEmail = new Map<string, Array<{ timestamp: number; source: string }>>();
    const bySource = new Map<string, { name: string; sales: number; revenue: number }>();

    const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
    const timestampOf = (row: any) => {
      const value = Number(row.timestamp);
      if (Number.isFinite(value) && value > 0) return value;
      const parsed = Date.parse(String(row['Data'] || row['Data da Compra'] || row['Criado em'] || ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    ticketBuyers.forEach((row) => {
      const email = emailKey(row['E-mail'] || row['Email'] || row['Comprador']);
      if (!email) return;
      const tickets = ticketsByEmail.get(email) || [];
      tickets.push({
        timestamp: timestampOf(row),
        source: String(row['utm_source'] || row['Origem'] || row['Source'] || '').trim()
      });
      ticketsByEmail.set(email, tickets);
    });
    ticketsByEmail.forEach((tickets) => tickets.sort((a, b) => a.timestamp - b.timestamp));

    let attributedSales = 0;
    productBuyers.forEach((row) => {
      const name = String(row['Produto Principal'] || row['Produto'] || 'Produto não identificado').trim() || 'Produto não identificado';
      const revenue = parseValue(row['Valor'] || row['Valor Bruto'] || row['Preço'] || row['Faturamento'] || row['Valor Pago']);
      const date = String(row['Data'] || row['Data da Compra'] || row['Criado em'] || 'Sem data');

      const product = byProduct.get(name) || { name, sales: 0, revenue: 0 };
      product.sales += 1;
      product.revenue += revenue;
      byProduct.set(name, product);

      const day = byDay.get(date) || { date, sales: 0, revenue: 0 };
      day.sales += 1;
      day.revenue += revenue;
      byDay.set(date, day);

      const productTimestamp = timestampOf(row);
      const tickets = ticketsByEmail.get(emailKey(row['E-mail'] || row['Email'] || row['Comprador'])) || [];
      const matchingTicket = tickets.filter((ticket) => ticket.timestamp > 0 && ticket.timestamp <= productTimestamp).at(-1);
      const sourceName = matchingTicket?.source || 'Sem atribuição';
      if (matchingTicket?.source) attributedSales += 1;
      const source = bySource.get(sourceName) || { name: sourceName, sales: 0, revenue: 0 };
      source.sales += 1;
      source.revenue += revenue;
      bySource.set(sourceName, source);
    });

    const products = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);
    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const totalSales = products.reduce((total, product) => total + product.sales, 0);
    const totalRevenue = products.reduce((total, product) => total + product.revenue, 0);
    const attribution = [...bySource.values()].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);
    return { products, daily, totalSales, totalRevenue, attribution, attributedSales };
  }, [productBuyers, ticketBuyers]);

  const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[#A855F7]">
          <Package size={20} strokeWidth={2.5} />
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.08em]">Produtos do lançamento</h2>
        </div>
        <p className="text-sm text-zinc-400">Vendas registradas na aba de produto principal. Não entram nos indicadores de ingresso.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)] p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono font-bold uppercase tracking-wider"><ShoppingBag size={15} className="text-[#A855F7]" /> Vendas de produto</div>
          <p className="mt-4 text-3xl font-mono font-bold text-zinc-100">{formatNumber(totalSales)}</p>
        </div>
        <div className="rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)] p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono font-bold uppercase tracking-wider"><TrendingUp size={15} className="text-[#A855F7]" /> Faturamento produto</div>
          <p className="mt-4 text-3xl font-mono font-bold text-[#A855F7]">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)] p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono font-bold uppercase tracking-wider"><ReceiptText size={15} className="text-[#A855F7]" /> Ticket médio produto</div>
          <p className="mt-4 text-3xl font-mono font-bold text-zinc-100">{formatCurrency(averageTicket)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6">
        <section className="xl:col-span-2 rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-zinc-100">Origem de tráfego</h3>
              <p className="mt-1 text-xs text-zinc-400">Atribuição via e-mail da compra de ingresso.</p>
            </div>
            <span className="shrink-0 rounded-[6px] bg-[#A855F7]/10 px-2 py-1 text-xs font-mono font-bold text-[#D8B4FE]">{formatNumber(attributedSales)}/{formatNumber(totalSales)}</span>
          </div>
          <div className="mt-3 h-[260px]">
            {attribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attribution} dataKey="sales" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">
                    {attribution.map((source, index) => <Cell key={source.name} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _name: string, item: any) => [`${formatNumber(value)} vendas · ${formatCurrency(item.payload.revenue)}`, item.payload.name]}
                    contentStyle={{ background: '#151922', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontFamily: 'monospace', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-sm text-zinc-500">Nenhuma venda de produto no período.</div>}
          </div>
        </section>

        <section className="xl:col-span-3 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-zinc-100">Receita por origem atribuída</h3>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {attribution.map((source, index) => (
              <div key={source.name} className="flex flex-col items-stretch gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }} /><span className="truncate font-medium text-zinc-100">{source.name}</span></div>
                <div className="shrink-0 text-left sm:text-right"><p className="font-mono text-xs font-bold text-zinc-100">{formatNumber(source.sales)} vendas</p><p className="font-mono text-xs text-[#D8B4FE]">{formatCurrency(source.revenue)}</p></div>
              </div>
            ))}
            {attribution.length === 0 && <p className="px-5 py-12 text-center text-sm text-zinc-500">Nenhuma atribuição encontrada.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-3 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-zinc-100">Performance por produto</h3>
          </div>
          <div className="table-scroll-region overflow-x-auto" tabIndex={0} aria-label="Tabela de performance por produto. Deslize horizontalmente para ver todas as colunas.">
            <table className="w-full text-left">
              <thead className="border-b border-[var(--border-hairline)] bg-white/[0.035] text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                <tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3 text-right">Vendas</th><th className="px-5 py-3 text-right">Faturamento</th><th className="px-5 py-3 text-right">Ticket</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {products.map((product) => (
                  <tr key={product.name} className="hover:bg-white/[0.035]">
                    <td className="px-5 py-4 font-medium text-zinc-100">{product.name}</td>
                    <td className="px-5 py-4 text-right font-mono text-zinc-200">{formatNumber(product.sales)}</td>
                    <td className="px-5 py-4 text-right font-mono font-bold text-[#A855F7]">{formatCurrency(product.revenue)}</td>
                    <td className="px-5 py-4 text-right font-mono text-zinc-400">{formatCurrency(product.sales ? product.revenue / product.sales : 0)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-zinc-500">Nenhuma venda de produto no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="xl:col-span-2 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-hairline)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-zinc-100">Histórico de produtos</h3>
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.06]">
            {daily.map((day) => (
              <div key={day.date} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="font-mono text-xs text-zinc-400">{day.date}</span>
                <div className="text-right"><p className="font-mono text-xs font-bold text-zinc-100">{formatNumber(day.sales)} vendas</p><p className="font-mono text-xs text-[#A855F7]">{formatCurrency(day.revenue)}</p></div>
              </div>
            ))}
            {daily.length === 0 && <p className="px-5 py-12 text-center text-sm text-zinc-500">Nenhuma venda de produto no período.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};
