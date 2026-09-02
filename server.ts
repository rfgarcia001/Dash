import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import { createServer as createViteServer } from "vite";
import Papa from "papaparse";
import JSZip from "jszip";

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// Sessão de login humano (Google OAuth) — cookie assinado com HMAC, sem
// dependência de session store: {email, exp} em base64url + assinatura,
// verificada em toda request. Basic Auth continua existindo em paralelo
// pra automação/scripts, essa sessão só cobre o login via navegador.
function signSession(email: string): string {
  const secret = process.env.SESSION_SECRET || "";
  const payload = JSON.stringify({ email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifySession(cookieValue: string): { email: string } | null {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || !cookieValue) return null;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqual(sig, expectedSig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function parseList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedDashboardUser(suppliedUser: string, expectedUser?: string) {
  const normalizedUser = suppliedUser.trim().toLowerCase();
  const allowedDomains = parseList(process.env.DASHBOARD_ALLOWED_DOMAINS);
  const allowedEmails = parseList(process.env.DASHBOARD_ALLOWED_EMAILS);

  if (allowedEmails.includes(normalizedUser)) {
    return true;
  }

  const emailDomain = normalizedUser.includes("@") ? normalizedUser.split("@").pop() : "";
  if (emailDomain && allowedDomains.includes(emailDomain)) {
    return true;
  }

  if (expectedUser) {
    return timingSafeEqual(suppliedUser, expectedUser);
  }

  return false;
}

type FunnelSourceType = "standard" | "perpetual-launch" | "paid-launch";

type FunnelConfig = {
  id: string;
  name: string;
  sheetId: string;
  color: string;
  builtIn?: boolean;
  sourceType?: FunnelSourceType;
};

const DEFAULT_FUNNELS: FunnelConfig[] = [
  {
    id: "estrategia",
    name: "Livro Estratégia em Ação",
    sheetId: "1fYoNt2OgXNFRsGg8-5xG8BkZHQJvKpUrHZA8nyeN6W8",
    color: "#00FFBB",
    builtIn: true
  },
  {
    id: "gestao-ia",
    name: "Livro Gestão de Projetos com IA",
    sheetId: "1qzE3zNFvUQwi_yIDcOrRy00wHxkhMTLzMeb9aCTRAbA",
    color: "#66BEFF",
    builtIn: true
  }
];

const FUNNEL_CONFIG_PATH = process.env.DASHBOARD_FUNNELS_PATH || path.join(process.cwd(), "data", "funnels.json");
const FUNNEL_SSM_PARAM = (process.env.DASHBOARD_FUNNELS_SSM_PARAM || "").trim();
const FUNNEL_SSM_MAX_BYTES = Number(process.env.DASHBOARD_FUNNELS_SSM_MAX_BYTES || 4096);
const FUNNEL_CACHE_TTL_MS = Number(process.env.DASHBOARD_FUNNELS_CACHE_TTL_MS || 30000);
const CUSTOM_FUNNEL_COLORS = ["#F97316", "#E879F9", "#A3E635", "#38BDF8", "#C084FC"];

type StoredFunnelConfig = {
  customFunnels: FunnelConfig[];
  removedBuiltInIds: string[];
  overrides: Record<string, Partial<FunnelConfig>>;
};

let ssmPromise: Promise<any> | null = null;

async function ssm() {
  if (!ssmPromise) {
    ssmPromise = import("@aws-sdk/client-ssm").then((mod) => ({
      client: new mod.SSMClient({}),
      GetParameterCommand: mod.GetParameterCommand,
      PutParameterCommand: mod.PutParameterCommand
    }));
  }
  return ssmPromise;
}

async function readFunnelConfigSource(): Promise<string | null> {
  if (FUNNEL_SSM_PARAM) {
    const { client, GetParameterCommand } = await ssm();
    try {
      const result = await client.send(new GetParameterCommand({ Name: FUNNEL_SSM_PARAM }));
      return result.Parameter?.Value ?? null;
    } catch (error: any) {
      if (error?.name === "ParameterNotFound") return null;
      console.error(`Falha ao ler ${FUNNEL_SSM_PARAM} no SSM:`, error);
      throw new Error("Não foi possível ler a configuração de funis no SSM.", { cause: error });
    }
  }

  try {
    return await fs.readFile(FUNNEL_CONFIG_PATH, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Não foi possível ler a configuração de funis.");
  }
}

async function writeFunnelConfigSource(serialized: string) {
  if (FUNNEL_SSM_PARAM) {
    const size = Buffer.byteLength(serialized, "utf8");
    if (size > FUNNEL_SSM_MAX_BYTES) {
      throw new Error(
        `O cadastro de funis ocupa ${size} bytes e ultrapassa o limite de ${FUNNEL_SSM_MAX_BYTES} bytes do parâmetro SSM. Remova algum funil para liberar espaço.`
      );
    }
    const { client, PutParameterCommand } = await ssm();
    await client.send(new PutParameterCommand({
      Name: FUNNEL_SSM_PARAM,
      Value: serialized,
      Type: "String",
      Overwrite: true
    }));
    return;
  }

  await fs.mkdir(path.dirname(FUNNEL_CONFIG_PATH), { recursive: true });
  await fs.writeFile(FUNNEL_CONFIG_PATH, serialized, "utf8");
}

let funnelCache: { funnels: FunnelConfig[]; expiresAt: number } | null = null;

function resolveFunnels(raw: string | null): FunnelConfig[] {
  if (raw === null) return DEFAULT_FUNNELS;

  let stored: any;
  try {
    stored = JSON.parse(raw);
  } catch {
    throw new Error("Não foi possível ler a configuração de funis.");
  }

  const customFunnels = Array.isArray(stored) ? stored : stored?.customFunnels;
  if (!Array.isArray(customFunnels)) return DEFAULT_FUNNELS;
  const removedBuiltInIds = new Set(Array.isArray(stored?.removedBuiltInIds) ? stored.removedBuiltInIds : []);
  const overrides = stored?.overrides && typeof stored.overrides === "object" ? stored.overrides : {};
  const valid = customFunnels.filter((funnel) =>
    funnel && typeof funnel.id === "string" && typeof funnel.name === "string" && typeof funnel.sheetId === "string"
  );
  const builtIns = DEFAULT_FUNNELS
    .filter((funnel) => !removedBuiltInIds.has(funnel.id))
    .map((funnel) => ({ ...funnel, ...(overrides[funnel.id] || {}), builtIn: true }));
  return [...builtIns, ...valid.map((funnel) => ({ ...funnel, builtIn: false }))];
}

async function loadFunnels(): Promise<FunnelConfig[]> {
  if (funnelCache && funnelCache.expiresAt > Date.now()) return funnelCache.funnels;
  const funnels = resolveFunnels(await readFunnelConfigSource());
  funnelCache = { funnels, expiresAt: Date.now() + FUNNEL_CACHE_TTL_MS };
  return funnels;
}

// Dual data source for /api/spreadsheet, same pattern as the funnel-config
// SSM/file split above: with DATABASE_URL set, ad/sale/creative data comes
// from Postgres (populated by the user's own external sync — this app only
// SELECTs) instead of parsing the Google Sheets XLSX export. Unset by
// default, so every environment that hasn't opted in keeps reading Sheets
// exactly as before. See db/schema.sql for the table definitions.
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

let pgPoolPromise: Promise<any> | null = null;

async function pgPool() {
  if (!pgPoolPromise) {
    pgPoolPromise = import("pg").then((mod) => new mod.Pool({ connectionString: DATABASE_URL }));
  }
  return pgPoolPromise;
}

type DbMetaRow = {
  "Data": string; "Nome da Campanha": string; "Nome do Conjunto": string; "Nome do Anúncio": string;
  "Gasto": number; "Impressões": number; "Cliques no Link": number;
  "Visualizações da Página de Destino": number; "Iniciate Checkout": number;
  "Thumb_Criativo": string; "Funil": string;
};

type DbBuyerRow = {
  "Data": string; "Data_Original": string; "Data_Hora_Formatada": string; "timestamp": number;
  "E-mail": string; "Valor": number;
  "utm_campaign": string; "utm_source": string; "utm_medium": string; "utm_term": string; "utm_content": string;
  "Produto": string; "Produto Principal": string; "Order Bump": string; "Funil": string;
};

type DbCreativeRow = { "Criativos": string; "Link": string; "Thumb_Criativo": string };

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

// purchased_at comes back from node-postgres as a real Date (UTC instant) —
// no ambiguous string parsing needed here, unlike the Sheets path. Shift by
// -3h same as parseUtcToUtcMinus3 does for the Sheets-sourced rows, so both
// backends agree on what "local day" a purchase falls into.
function formatPurchaseDate(purchasedAt: Date): { dateStr: string; formattedDisplay: string; timestamp: number } {
  const shifted = new Date(purchasedAt.getTime() - 3 * 60 * 60 * 1000);
  const dateStr = toIsoDate(shifted);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const [y, m, d] = dateStr.split("-");
  return { dateStr, formattedDisplay: `${d}/${m}/${y} ${hh}:${mm}`, timestamp: shifted.getTime() };
}

async function fetchMetaFromDb(funnelId: string, funnelName: string): Promise<DbMetaRow[]> {
  const pool = await pgPool();
  const { rows } = await pool.query(
    `SELECT ad_date, campaign_name, adset_name, ad_name, spend, impressions, link_clicks,
            landing_page_views, initiate_checkout, creative_thumb_url
     FROM meta_ads WHERE funnel_id = $1 ORDER BY ad_date`,
    [funnelId]
  );
  return rows.map((row: any) => ({
    "Data": toIsoDate(new Date(row.ad_date)),
    "Nome da Campanha": row.campaign_name || "",
    "Nome do Conjunto": row.adset_name || "",
    "Nome do Anúncio": row.ad_name || "",
    "Gasto": Number(row.spend) || 0,
    "Impressões": Number(row.impressions) || 0,
    "Cliques no Link": Number(row.link_clicks) || 0,
    "Visualizações da Página de Destino": Number(row.landing_page_views) || 0,
    "Iniciate Checkout": Number(row.initiate_checkout) || 0,
    "Thumb_Criativo": row.creative_thumb_url || "",
    "Funil": funnelName
  }));
}

async function fetchBuyersFromDb(funnelId: string, funnelName: string, bucket: "standard" | "fgp"): Promise<DbBuyerRow[]> {
  const pool = await pgPool();
  const { rows } = await pool.query(
    `SELECT purchased_at, email, amount, utm_campaign, utm_source, utm_medium, utm_term, utm_content,
            product, order_bump
     FROM buyers WHERE funnel_id = $1 AND bucket = $2 ORDER BY purchased_at`,
    [funnelId, bucket]
  );
  return rows.map((row: any) => {
    const parsedDate = formatPurchaseDate(new Date(row.purchased_at));
    return {
      "Data": parsedDate.dateStr,
      "Data_Original": new Date(row.purchased_at).toISOString(),
      "Data_Hora_Formatada": parsedDate.formattedDisplay,
      "timestamp": parsedDate.timestamp,
      "E-mail": row.email || "",
      "Valor": Number(row.amount) || 0,
      "utm_campaign": row.utm_campaign || "",
      "utm_source": row.utm_source || "",
      "utm_medium": row.utm_medium || "",
      "utm_term": row.utm_term || "",
      "utm_content": row.utm_content || "",
      "Produto": row.product || "",
      "Produto Principal": row.product || "",
      "Order Bump": row.order_bump || "",
      "Funil": funnelName
    };
  });
}

async function fetchCreativesFromDb(funnelId: string): Promise<DbCreativeRow[]> {
  const pool = await pgPool();
  const { rows } = await pool.query(
    `SELECT creative_name, link, thumb_url FROM creatives WHERE funnel_id = $1 ORDER BY id`,
    [funnelId]
  );
  return rows.map((row: any) => ({
    "Criativos": row.creative_name || "",
    "Link": row.link || "",
    "Thumb_Criativo": row.thumb_url || ""
  }));
}

async function fetchFunnelDataFromDb(funnel: FunnelConfig): Promise<{
  metaItems: DbMetaRow[]; compradoresItems: DbBuyerRow[]; fgpItems: DbBuyerRow[]; criativosItems: DbCreativeRow[];
}> {
  const [metaItems, compradoresItems, fgpItems, criativosItems] = await Promise.all([
    fetchMetaFromDb(funnel.id, funnel.name),
    fetchBuyersFromDb(funnel.id, funnel.name, "standard"),
    fetchBuyersFromDb(funnel.id, funnel.name, "fgp"),
    fetchCreativesFromDb(funnel.id)
  ]);
  return { metaItems, compradoresItems, fgpItems, criativosItems };
}

// Grava dados vindos de uma automação externa (N8N) direto no Postgres. Ver
// docs/ingest-api.md pro contrato completo de cada endpoint.
function requireIngestToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expectedToken = (process.env.INGEST_API_TOKEN || "").trim();
  if (!expectedToken) {
    return res.status(503).json({ error: "Ingestão via API não está habilitada. Configure INGEST_API_TOKEN no servidor." });
  }
  const suppliedToken = String(req.headers["x-ingest-token"] || "");
  if (!suppliedToken || !timingSafeEqual(suppliedToken, expectedToken)) {
    return res.status(401).json({ error: "Token de ingestão inválido ou ausente (header X-Ingest-Token)." });
  }
  next();
}

function registerIngestRoutes(app: express.Express) {
  // Consulta pra quem está montando a automação (N8N) descobrir os
  // funnelId válidos sem precisar da senha do dashboard (credencial de
  // humano, não de automação).
  app.get("/api/ingest/funnels", requireIngestToken, async (_req, res) => {
    try {
      const funnels = await loadFunnels();
      res.json({ funnels: funnels.map((f) => ({ id: f.id, name: f.name })) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Não foi possível carregar os funis." });
    }
  });

  // Cada envio substitui o dia inteiro daquele funil — evita duplicar linha
  // se o N8N reenviar o mesmo dia (ex.: Meta corrigiu números depois).
  app.post("/api/ingest/meta", requireIngestToken, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Ingestão via API requer DATABASE_URL configurada no servidor." });
    }
    try {
      const { funnelId, date, rows } = req.body || {};
      if (!funnelId || typeof funnelId !== "string") {
        return res.status(400).json({ error: "funnelId é obrigatório." });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
        return res.status(400).json({ error: "date é obrigatório, no formato YYYY-MM-DD." });
      }
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "rows deve ser uma lista." });
      }
      const funnels = await loadFunnels();
      if (!funnels.some((f) => f.id === funnelId)) {
        return res.status(404).json({ error: `Funil '${funnelId}' não encontrado. Cadastre-o no dashboard antes de enviar dados.` });
      }

      const pool = await pgPool();
      await pool.query("BEGIN");
      try {
        await pool.query("DELETE FROM meta_ads WHERE funnel_id = $1 AND ad_date = $2", [funnelId, date]);
        for (const row of rows) {
          const adId = row.adId != null ? String(row.adId).trim() : "";
          // Upsert por ad_id além do delete-do-dia acima: protege contra o
          // mesmo anúncio aparecer duas vezes dentro do mesmo lote (paginação
          // duplicada na origem), não só entre reenvios.
          await pool.query(
            `INSERT INTO meta_ads
               (funnel_id, ad_date, ad_id, campaign_name, adset_name, ad_name, spend, impressions, link_clicks, landing_page_views, initiate_checkout, creative_thumb_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (funnel_id, ad_date, ad_id) WHERE ad_id IS NOT NULL
             DO UPDATE SET
               campaign_name = EXCLUDED.campaign_name, adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
               spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, link_clicks = EXCLUDED.link_clicks,
               landing_page_views = EXCLUDED.landing_page_views, initiate_checkout = EXCLUDED.initiate_checkout,
               creative_thumb_url = EXCLUDED.creative_thumb_url`,
            [
              funnelId, date, adId || null,
              String(row.campaignName || ""), String(row.adsetName || ""), String(row.adName || ""),
              Number(row.spend) || 0, Number(row.impressions) || 0, Number(row.linkClicks) || 0,
              Number(row.landingPageViews) || 0, Number(row.initiateCheckout) || 0,
              String(row.creativeThumbUrl || "")
            ]
          );
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
      res.json({ ok: true, funnelId, date, processed: rows.length });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Falha ao gravar dados de Meta Ads." });
    }
  });

  // Upsert por (funnelId, orderId): reenviar o mesmo pedido atualiza a linha
  // em vez de duplicar a venda.
  app.post("/api/ingest/vendas", requireIngestToken, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Ingestão via API requer DATABASE_URL configurada no servidor." });
    }
    try {
      const { funnelId, bucket, rows } = req.body || {};
      if (!funnelId || typeof funnelId !== "string") {
        return res.status(400).json({ error: "funnelId é obrigatório." });
      }
      const resolvedBucket = bucket === "fgp" ? "fgp" : "standard";
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "rows deve ser uma lista." });
      }
      const funnels = await loadFunnels();
      if (!funnels.some((f) => f.id === funnelId)) {
        return res.status(404).json({ error: `Funil '${funnelId}' não encontrado. Cadastre-o no dashboard antes de enviar dados.` });
      }

      const pool = await pgPool();
      let processed = 0;
      await pool.query("BEGIN");
      try {
        for (const row of rows) {
          const orderId = row.orderId != null ? String(row.orderId).trim() : "";
          const purchasedAt = new Date(row.purchasedAt);
          if (!row.purchasedAt || Number.isNaN(purchasedAt.getTime())) {
            throw Object.assign(new Error(`purchasedAt inválido (orderId '${orderId || "sem id"}').`), { status: 400 });
          }
          if (!row.email) {
            throw Object.assign(new Error(`email é obrigatório (orderId '${orderId || "sem id"}').`), { status: 400 });
          }
          await pool.query(
            `INSERT INTO buyers
               (funnel_id, bucket, order_id, purchased_at, email, amount, utm_campaign, utm_source, utm_medium, utm_term, utm_content, product, order_bump)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (funnel_id, order_id) WHERE order_id IS NOT NULL
             DO UPDATE SET
               bucket = EXCLUDED.bucket, purchased_at = EXCLUDED.purchased_at, email = EXCLUDED.email,
               amount = EXCLUDED.amount, utm_campaign = EXCLUDED.utm_campaign, utm_source = EXCLUDED.utm_source,
               utm_medium = EXCLUDED.utm_medium, utm_term = EXCLUDED.utm_term, utm_content = EXCLUDED.utm_content,
               product = EXCLUDED.product, order_bump = EXCLUDED.order_bump`,
            [
              funnelId, resolvedBucket, orderId || null, purchasedAt.toISOString(),
              String(row.email).trim(), Number(row.amount) || 0,
              String(row.utmCampaign || ""), String(row.utmSource || ""), String(row.utmMedium || ""),
              String(row.utmTerm || ""), String(row.utmContent || ""),
              String(row.product || ""), String(row.orderBump || "")
            ]
          );
          processed++;
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
      res.json({ ok: true, funnelId, bucket: resolvedBucket, processed });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Falha ao gravar dados de vendas." });
    }
  });

  // Sem dimensão de data (criativo não muda por dia). Upsert por
  // (funnelId, creativeName) — cada rodada do N8N só enxerga os anúncios
  // ativos naquela janela (a origem aplica filtro de data), então um
  // full-replace apagaria criativos antigos ainda relevantes. Mesmo
  // comportamento do "Append or Update" por "Nome Criativo" que a planilha
  // já fazia: nunca some, só adiciona/atualiza.
  app.post("/api/ingest/criativos", requireIngestToken, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Ingestão via API requer DATABASE_URL configurada no servidor." });
    }
    try {
      const { funnelId, rows } = req.body || {};
      if (!funnelId || typeof funnelId !== "string") {
        return res.status(400).json({ error: "funnelId é obrigatório." });
      }
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "rows deve ser uma lista." });
      }
      const funnels = await loadFunnels();
      if (!funnels.some((f) => f.id === funnelId)) {
        return res.status(404).json({ error: `Funil '${funnelId}' não encontrado. Cadastre-o no dashboard antes de enviar dados.` });
      }

      const pool = await pgPool();
      let processed = 0;
      await pool.query("BEGIN");
      try {
        for (const row of rows) {
          if (!row.creativeName) continue;
          await pool.query(
            `INSERT INTO creatives (funnel_id, creative_name, link, thumb_url)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (funnel_id, creative_name)
             DO UPDATE SET link = EXCLUDED.link, thumb_url = EXCLUDED.thumb_url`,
            [funnelId, String(row.creativeName), String(row.link || ""), String(row.thumbUrl || "")]
          );
          processed++;
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
      res.json({ ok: true, funnelId, processed });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Falha ao gravar dados de criativos." });
    }
  });

  // Consulta somente-leitura pro MCP (Claude) enxergar o banco direto. Defesa
  // em profundidade: nega múltiplas instruções (sem ";"), exige SELECT/WITH
  // no início, e MESMO ASSIM roda dentro de uma transação com
  // SET TRANSACTION READ ONLY — o Postgres recusa qualquer escrita (mesmo
  // via CTE tipo "WITH x AS (DELETE ... RETURNING *) SELECT * FROM x") por
  // conta própria, não dependemos só do filtro de texto. Importante: é
  // "SET TRANSACTION READ ONLY" (afeta a transação atual), não
  // "SET default_transaction_read_only" (só afeta transações futuras) —
  // testado o ataque via CTE contra as duas formas antes de decidir.
  app.post("/api/ingest/query", requireIngestToken, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Ingestão via API requer DATABASE_URL configurada no servidor." });
    }
    try {
      const { sql, params } = req.body || {};
      if (!sql || typeof sql !== "string") {
        return res.status(400).json({ error: "sql é obrigatório." });
      }
      const trimmed = sql.trim();
      if (trimmed.includes(";")) {
        return res.status(400).json({ error: "Não use ';' — só uma instrução por chamada." });
      }
      if (!/^(select|with)\b/i.test(trimmed)) {
        return res.status(400).json({ error: "Só consultas SELECT (ou WITH ... SELECT) são permitidas." });
      }
      const queryParams = params == null ? [] : params;
      if (!Array.isArray(queryParams)) {
        return res.status(400).json({ error: "params deve ser uma lista." });
      }

      const pool = await pgPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout = '8000ms'");
        await client.query("SET TRANSACTION READ ONLY");
        const result = await client.query(trimmed, queryParams);
        await client.query("ROLLBACK");
        const MAX_ROWS = 1000;
        const truncated = result.rows.length > MAX_ROWS;
        res.json({
          ok: true,
          rowCount: result.rowCount,
          rows: truncated ? result.rows.slice(0, MAX_ROWS) : result.rows,
          truncated
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (error: any) {
      res.status(error.status || 400).json({ error: error.message || "Falha ao executar consulta." });
    }
  });
}

let googleOAuthClientPromise: Promise<any> | null = null;
async function googleOAuthClient() {
  if (!googleOAuthClientPromise) {
    googleOAuthClientPromise = import("google-auth-library").then(
      (mod) => new mod.OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    );
  }
  return googleOAuthClientPromise;
}

function loginPageHtml(errorMessage?: string): string {
  const errorBlock = errorMessage
    ? `<p style="color:#ff8a8a;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:8px;padding:10px 14px;margin:0 0 20px;font-size:14px;">${errorMessage}</p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Entrar — Allevo Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0b0f14; color:#e7edf3; font-family:ui-sans-serif,system-ui,sans-serif; }
  .card { background:#121820; border:1px solid rgba(148,163,184,.16); border-radius:14px; padding:40px; width:340px; text-align:center; }
  h1 { font-size:1.3rem; margin:0 0 8px; }
  p.sub { color:#8ca0b3; font-size:14px; margin:0 0 26px; }
  a.btn { display:flex; align-items:center; justify-content:center; gap:10px; background:#fff; color:#1f1f1f; text-decoration:none; padding:11px 16px; border-radius:8px; font-weight:600; font-size:14px; }
  a.btn:hover { background:#f1f1f1; }
</style>
</head>
<body>
  <div class="card">
    <h1>Allevo Dashboard</h1>
    <p class="sub">Entre com sua conta Google corporativa</p>
    ${errorBlock}
    <a class="btn" href="/auth/google">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.7 19 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3c-7.6 0-14.1 4.3-17.7 10.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.1-1.8 13.8-4.9l-6.4-5.4C29.3 36.4 26.8 37 24 37c-5.2 0-9.6-3.1-11.3-7.6l-6.5 5C9.8 40.6 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.4 5.4C41 35.8 45 30.4 45 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
      Entrar com Google
    </a>
  </div>
</body>
</html>`;
}

function registerAuthRoutes(app: express.Express) {
  app.get("/login", (_req, res) => {
    res.type("html").send(loginPageHtml());
  });

  app.get("/auth/google", async (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).type("html").send(loginPageHtml("Login com Google não está configurado."));
    }
    try {
      const client = await googleOAuthClient();
      const redirectUri = `${req.protocol}://${req.get("host")}/auth/google/callback`;
      const state = crypto.randomBytes(16).toString("hex");
      res.cookie("oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
      const url = client.generateAuthUrl({
        redirect_uri: redirectUri,
        scope: ["openid", "email", "profile"],
        state,
        prompt: "select_account"
      });
      res.redirect(url);
    } catch (error: any) {
      console.error("Erro ao iniciar login com Google:", error);
      res.status(500).type("html").send(loginPageHtml("Falha ao iniciar login com Google. Tente de novo."));
    }
  });

  app.get("/auth/google/callback", async (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).type("html").send(loginPageHtml("Login com Google não está configurado."));
      }
      const cookies = parseCookies(req.headers.cookie);
      const expectedState = cookies["oauth_state"];
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state || !expectedState || state !== expectedState) {
        return res.status(400).type("html").send(loginPageHtml("Falha na autenticação (sessão de login expirada). Tente de novo."));
      }
      res.clearCookie("oauth_state");

      const client = await googleOAuthClient();
      const redirectUri = `${req.protocol}://${req.get("host")}/auth/google/callback`;
      const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = String(payload?.email || "").toLowerCase().trim();

      if (!email || !payload?.email_verified) {
        return res.status(401).type("html").send(loginPageHtml("Não foi possível confirmar seu e-mail com o Google."));
      }
      if (!DATABASE_URL) {
        return res.status(503).type("html").send(loginPageHtml("Login com Google requer o banco de dados configurado no servidor."));
      }

      const pool = await pgPool();
      const { rows } = await pool.query("SELECT role FROM users WHERE email = $1", [email]);
      // Mesma regra de bootstrap do requireDashboardAuth/Admin: sem isso,
      // ninguém — nem o admin de emergência — conseguiria completar o
      // primeiro login pra popular a tabela vazia.
      const isEmergencyAdmin = parseList(process.env.DASHBOARD_ADMIN_EMAILS).includes(email);
      if (!rows[0] && !isEmergencyAdmin) {
        return res.status(403).type("html").send(loginPageHtml(`O e-mail ${email} ainda não foi liberado. Peça pra um administrador te adicionar.`));
      }

      res.cookie("allevo_session", signSession(email), {
        httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.redirect("/");
    } catch (error: any) {
      console.error("Erro no callback do Google OAuth:", error);
      res.status(500).type("html").send(loginPageHtml("Erro ao processar login com Google. Tente de novo."));
    }
  });

  app.get("/auth/logout", (_req, res) => {
    res.clearCookie("allevo_session");
    res.redirect("/login");
  });

  // Login sem passar pelo Google, só pra testar a tela localmente enquanto
  // a redirect URI do Google propaga (leva minutos a horas depois de salva
  // no Console). Mesma trava que requireDashboardAdmin já usa: nunca
  // funciona onde NODE_ENV=production (VPS e AWS sempre setam isso).
  if (process.env.NODE_ENV !== "production") {
    app.get("/auth/dev-login", (req, res) => {
      const email = String(req.query.email || "").toLowerCase().trim();
      if (!email || !email.includes("@")) {
        return res.status(400).send("Uso: /auth/dev-login?email=voce@allevotech.com");
      }
      res.cookie("allevo_session", signSession(email), {
        httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.redirect("/");
    });
  }
}

      const getField = (item: any, ...keys: string[]) => {
        for (const k of keys) {
          if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
            return String(item[k]).trim();
          }
        }
        const itemKeys = Object.keys(item || {});
        for (const k of keys) {
          const target = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          const foundKey = itemKeys.find(ik => ik.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
          if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null && String(item[foundKey]).trim() !== '') {
            return String(item[foundKey]).trim();
          }
        }
        return '';
      };

      const parseSheetNumber = (value: string) => {
        const normalized = value.replace(/[^0-9,.-]/g, "");
        if (!normalized) return 0;
        const canonical = normalized.includes(",")
          ? normalized.replace(/\./g, "").replace(",", ".")
          : normalized.replace(/,/g, "");
        const parsed = Number(canonical);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const normalizeMetaDate = (value: string) => {
        const trimmed = value.trim();
        // XLSX stores dates as an Excel serial number (for example, 45948).
        // Convert it before the client applies its selected-period filter.
        if (/^\d{4,5}(?:\.\d+)?$/.test(trimmed)) {
          const serial = Number(trimmed);
          const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
          if (!Number.isNaN(date.getTime())) {
            return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
          }
        }
        return trimmed;
      };

      const formatMeta = (item: any, funil: string) => ({
        "Data": normalizeMetaDate(getField(item, "Data", "Dia", "Data de início", "Data de inicio", "Data do relatório", "Data do relatorio")),
        "Nome da Campanha": getField(item, "Nome da Campanha", "Campanha"),
        "Nome do Conjunto": getField(item, "Nome do Conjunto", "Conjunto de anúncios", "Conjunto de anuncios", "Conjunto"),
        "Nome do Anúncio": getField(item, "Nome do Anúncio", "Nome do Anuncio", "Anúncio", "Anuncio"),
        "Gasto": parseSheetNumber(getField(item, "Gasto", "Valor gasto", "Valor gasto (BRL)", "Amount spent")),
        "Impressões": parseSheetNumber(getField(item, "Impressões", "Impressoes", "Impressions")),
        "Cliques no Link": parseSheetNumber(getField(item, "Cliques no Link", "Cliques no link", "Link clicks")),
        "Visualizações da Página de Destino": parseSheetNumber(getField(item, "Visualizações da Página de Destino", "Visualizacoes da Pagina de Destino", "Visualizações da página de destino", "Landing page views")),
        "Iniciate Checkout": parseSheetNumber(getField(item, "Iniciate Checkout", "Initiate Checkout", "Checkouts iniciados")),
        "Thumb_Criativo": getField(item, "Thumb_Criativo", "Thumb Criativo", "thumb_criativo", "Thumb_criativo", "Thumbnail", "Thumb", "Imagem", "Preview", "Prévia"),
        "Funil": funil
      });

function parseUtcToUtcMinus3(rawStr: any): { dateStr: string; formattedDisplay: string; timestamp: number } {
  if (!rawStr) return { dateStr: '', formattedDisplay: '', timestamp: 0 };
  const str = String(rawStr).trim();
  if (!str) return { dateStr: '', formattedDisplay: '', timestamp: 0 };

  // Match ISO pattern: 2026-08-04T15:41:25.000Z or 2026-08-04 15:41:25 or 2026-08-04
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  
  // Match DD/MM/YYYY pattern: 11/07/2026 - 20:00 or 11/07/2026 às 16:14 or 11/07/2026 20:00:00 or 11/07/2026
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:(?:\s*(?:-|às|at|\s)\s*)(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  // XLSX exports a date as a raw Excel serial number (days since
  // 1899-12-30, fractional part = time of day) whenever the cell isn't a
  // recognized ISO/DD-MM-YYYY string. normalizeMetaDate already converts
  // this for Meta Ads rows; buyer rows never got the same treatment, so a
  // bare serial like "46171" fell through to Date.parse(str) below — which
  // misreads a plain 4-6 digit number as a literal year instead of
  // rejecting it, silently corrupting the purchase date.
  const serialMatch = /^\d{4,6}(?:\.\d+)?$/.test(str) ? str : null;

  let utcMs = 0;
  let hasTime = false;

  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hours = isoMatch[4] !== undefined ? parseInt(isoMatch[4], 10) : 0;
    const minutes = isoMatch[5] !== undefined ? parseInt(isoMatch[5], 10) : 0;
    const seconds = isoMatch[6] !== undefined ? parseInt(isoMatch[6], 10) : 0;
    hasTime = isoMatch[4] !== undefined;

    if (hasTime) {
      utcMs = Date.UTC(year, month, day, hours, minutes, seconds);
    } else {
      const y = year;
      const m = String(month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        formattedDisplay: `${d}/${m}/${y}`,
        timestamp: Date.UTC(year, month, day, 12, 0, 0)
      };
    }
  } else if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;
    hasTime = dmyMatch[4] !== undefined;

    if (hasTime) {
      utcMs = Date.UTC(year, month, day, hours, minutes, seconds);
    } else {
      const y = year;
      const m = String(month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        formattedDisplay: `${d}/${m}/${y}`,
        timestamp: Date.UTC(year, month, day, 12, 0, 0)
      };
    }
  } else if (serialMatch) {
    const serial = Number(serialMatch);
    const days = Math.floor(serial);
    const fraction = serial - days;
    hasTime = fraction > 0;
    if (!hasTime) {
      const base = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
      const y = base.getUTCFullYear();
      const m = String(base.getUTCMonth() + 1).padStart(2, '0');
      const d = String(base.getUTCDate()).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        formattedDisplay: `${d}/${m}/${y}`,
        timestamp: Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0)
      };
    }
    // Fractional part is the time of day as entered locally (UTC-3) —
    // convert to a true UTC instant the same way the rest of this function
    // expects, then let the shared UTC-3 formatting below take over.
    const localAsUtc = Date.UTC(1899, 11, 30) + days * 86_400_000 + Math.round(fraction * 86_400_000);
    utcMs = localAsUtc + 3 * 60 * 60 * 1000;
  } else {
    const t = Date.parse(str);
    if (!isNaN(t)) {
      utcMs = t;
      hasTime = true;
    } else {
      return { dateStr: str, formattedDisplay: str, timestamp: 0 };
    }
  }

  // Converter de UTC para UTC-3 (subtrair 3 horas = 3 * 3600 * 1000 ms)
  const utcMinus3Ms = utcMs - 3 * 60 * 60 * 1000;
  const d = new Date(utcMinus3Ms);

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');

  const dateStr = `${y}-${m}-${day}`;
  const formattedDisplay = `${day}/${m}/${y} ${hh}:${mm}`;

  return {
    dateStr,
    formattedDisplay,
    timestamp: utcMinus3Ms
  };
}

      const normalizePerpetualProduct = (value: string) => {
        const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (normalized.includes("formacao gp")) return "Formação GP";
        if (normalized.includes("acesso vitalicio")) return "Acesso PDZ";
        if (normalized.includes("gravacao")) return "Gravação PDZ";
        if (normalized.includes("projeto do zero")) return "Projeto do Zero";
        return value;
      };

      const formatBuyers = (item: any, funnel: FunnelConfig) => {
        const isPerpetualLaunch = funnel.sourceType === "perpetual-launch" || funnel.sourceType === "paid-launch";
        // Standard sheets use B/C for timestamps. The perpetual-launch model
        // has a named Data column in A, which must remain a local calendar date.
        const buyerValues = Object.values(item || {});
        const rawPurchaseDate = isPerpetualLaunch
          ? getField(item, "Data", "Data da Compra", "Criado em")
          : String(buyerValues[1] || buyerValues[2] || "").trim();
        const rawProduct = isPerpetualLaunch
          ? getField(item, "Produto", "Produto Principal", "Oferta")
          : String(item["Produto Principal"] || item["Produto"] || buyerValues[11] || "").trim();
        const produtoPrincipal = isPerpetualLaunch ? normalizePerpetualProduct(rawProduct) : rawProduct;
        const orderBump = isPerpetualLaunch ? "" : String(item["Order Bump"] || item["Order bump"] || buyerValues[14] || "").trim();

        const parsedDate = parseUtcToUtcMinus3(rawPurchaseDate);

        return {
          "Data": parsedDate.dateStr,
          "Data_Original": rawPurchaseDate,
          "Data_Hora_Formatada": parsedDate.formattedDisplay,
          "timestamp": parsedDate.timestamp,
          "E-mail": getField(item, "E-mail", "Email", "E-mail do comprador", "Comprador"),
          "Valor": parseSheetNumber(getField(item, "Valor da Transação", "Valor", "Valor Líquido Estimado", "Faturado (Bruto)", "Faturamento", "Preço")),
          "utm_campaign": item["utm_campaign"] || item["Campanha"] || "",
          "utm_source": item["utm_source"] || item["Origem"] || "",
          "utm_medium": item["utm_medium"] || item["Medium"] || "",
          "utm_term": item["utm_term"] || "",
          "utm_content": item["utm_content"] || "",
          "Produto": produtoPrincipal,
          "Produto Principal": produtoPrincipal,
          "Order Bump": orderBump,
          "Funil": funnel.name
        };
      };

// One-time import from a sheet into Postgres, run right after a funnel is
// created/edited with both a spreadsheet link AND DATABASE_URL configured.
// After this the app never reads that sheet again for this funnel — see
// the dual-backend split in fetchFunnelDataFromDb/readFunnelStore above.
// Reuses the exact same fetch + row-shaping the Sheets-backed
// /api/spreadsheet path uses, so a fresh import matches what the dashboard
// would have shown from the sheet at that moment. Best-effort: failures are
// reported to the caller but never block the funnel itself from saving.
async function importFunnelFromSheet(funnel: FunnelConfig): Promise<{ metaRows: number; buyerRows: number; fgpRows: number; creativeRows: number }> {
  const pool = await pgPool();
  const [{ metaItems, buyerItems, fgpItems }, criativosItems] = await Promise.all([
    fetchFunnelSourceRows(funnel.sheetId),
    fetchCriativosWithThumbs(funnel.sheetId)
  ]);

  const metaRows = metaItems.map((item: any) => formatMeta(item, funnel.name)).filter((row: any) => row["Data"]);
  const standardRows = buyerItems.map((item: any) => formatBuyers(item, funnel));
  const fgpRows = fgpItems.map((item: any) => formatBuyers(item, funnel));

  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM meta_ads WHERE funnel_id = $1", [funnel.id]);
    await pool.query("DELETE FROM buyers WHERE funnel_id = $1", [funnel.id]);
    await pool.query("DELETE FROM creatives WHERE funnel_id = $1", [funnel.id]);

    for (const row of metaRows) {
      await pool.query(
        `INSERT INTO meta_ads (funnel_id, ad_date, campaign_name, adset_name, ad_name, spend, impressions, link_clicks, landing_page_views, initiate_checkout, creative_thumb_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [funnel.id, row["Data"], row["Nome da Campanha"], row["Nome do Conjunto"], row["Nome do Anúncio"],
         row["Gasto"], row["Impressões"], row["Cliques no Link"], row["Visualizações da Página de Destino"],
         row["Iniciate Checkout"], row["Thumb_Criativo"]]
      );
    }

    let buyersInserted = 0;
    for (const [rows, bucket] of [[standardRows, "standard"], [fgpRows, "fgp"]] as const) {
      for (const row of rows) {
        if (!row["Data"]) continue; // same unrecoverable-date guard as db/backfill-postgres.mjs
        // "timestamp" is already a true UTC instant now that
        // parseUtcToUtcMinus3 handles Excel serials — see purchased_at
        // comment in fetchBuyersFromDb for the -3h/+3h convention this mirrors.
        const purchasedAt = new Date(row["timestamp"] + 3 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO buyers (funnel_id, bucket, purchased_at, email, amount, utm_campaign, utm_source, utm_medium, utm_term, utm_content, product, order_bump)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [funnel.id, bucket, purchasedAt, row["E-mail"], row["Valor"], row["utm_campaign"], row["utm_source"],
           row["utm_medium"], row["utm_term"], row["utm_content"], row["Produto"], row["Order Bump"]]
        );
        buyersInserted++;
      }
    }

    for (const row of criativosItems) {
      await pool.query(
        `INSERT INTO creatives (funnel_id, creative_name, link, thumb_url) VALUES ($1,$2,$3,$4)`,
        [funnel.id, row["Criativos"], row["Link"], row["Thumb_Criativo"]]
      );
    }

    await pool.query("COMMIT");
    return { metaRows: metaRows.length, buyerRows: buyersInserted, fgpRows: fgpRows.length, creativeRows: criativosItems.length };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function saveCustomFunnels(funnels: FunnelConfig[]) {
  const customFunnels = funnels.filter((funnel) => !funnel.builtIn);
  const removedBuiltInIds = DEFAULT_FUNNELS
    .filter((defaultFunnel) => !funnels.some((funnel) => funnel.id === defaultFunnel.id))
    .map((funnel) => funnel.id);
  const overrides = Object.fromEntries(
    DEFAULT_FUNNELS.flatMap((defaultFunnel) => {
      const updated = funnels.find((funnel) => funnel.id === defaultFunnel.id);
      if (!updated) return [];
      const override = Object.fromEntries(
        (["name", "sheetId", "color", "sourceType"] as const)
          .filter((key) => updated[key] !== defaultFunnel[key])
          .map((key) => [key, updated[key]])
      );
      return Object.keys(override).length > 0 ? [[defaultFunnel.id, override]] : [];
    })
  );

  const stored: StoredFunnelConfig = { customFunnels, removedBuiltInIds, overrides };
  funnelCache = null;
  await writeFunnelConfigSource(`${JSON.stringify(stored, null, 2)}\n`);
  funnelCache = { funnels: resolveFunnels(JSON.stringify(stored)), expiresAt: Date.now() + FUNNEL_CACHE_TTL_MS };
}

function extractSpreadsheetId(value: unknown) {
  const input = String(value || "").trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || input.match(/^([a-zA-Z0-9_-]{20,})$/);
  return match?.[1] || "";
}

function buildFunnelId(name: string, existing: FunnelConfig[]) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "funil";
  const ids = new Set(existing.map((funnel) => funnel.id));
  let id = base;
  let suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function dashboardAdminEmail(req: express.Request) {
  return String(req.res?.locals.dashboardUser || "").trim().toLowerCase();
}

async function requireDashboardAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const email = dashboardAdminEmail(req);
  // Tabela users (login via Google) manda quando existe — fallback pro env
  // var é só pra ambiente sem Postgres (AWS hoje) ou login via Basic Auth.
  if (DATABASE_URL && email) {
    try {
      const pool = await pgPool();
      const { rows } = await pool.query("SELECT role FROM users WHERE email = $1", [email]);
      if (rows[0]?.role === "admin") return next();
    } catch (err) {
      console.error("requireDashboardAdmin: falha ao consultar tabela users, caindo pro fallback de env var:", err);
    }
  }
  const configuredAdmins = parseList(process.env.DASHBOARD_ADMIN_EMAILS);
  if (configuredAdmins.length === 0) {
    if (process.env.NODE_ENV !== "production") return next();
    return res.status(503).json({ error: "Cadastro de funis ainda não está habilitado. Configure DASHBOARD_ADMIN_EMAILS no servidor." });
  }
  if (!configuredAdmins.includes(email)) {
    return res.status(403).json({ error: "Somente administradores podem fazer essa ação." });
  }
  next();
}

async function requireDashboardAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.SESSION_SECRET);

  // Sessão do Google (cookie assinado) tem prioridade — se válida, nem olha
  // pro Basic Auth. Basic Auth continua funcionando em paralelo pra
  // automação/scripts que já usam DASHBOARD_USER/DASHBOARD_PASSWORD.
  if (googleEnabled) {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies["allevo_session"] || "");
    if (session) {
      // Confere na tabela a cada request (não só no login) — senão remover
      // alguém não tira o acesso até o cookie expirar sozinho em 30 dias.
      // Falha de DB não derruba quem já tinha cookie válido (defesa em
      // profundidade, não a única barreira).
      let stillAllowed = true;
      if (DATABASE_URL) {
        try {
          const pool = await pgPool();
          const { rows } = await pool.query("SELECT 1 FROM users WHERE email = $1", [session.email]);
          // DASHBOARD_ADMIN_EMAILS é acesso de emergência (só muda via
          // redeploy) — sempre passa, mesmo se a tabela estiver vazia ou
          // ainda não tiver esse e-mail. Resolve o bootstrap: sem isso,
          // ninguém consegue entrar a primeira vez pra popular a tabela.
          stillAllowed = Boolean(rows[0]) || parseList(process.env.DASHBOARD_ADMIN_EMAILS).includes(session.email);
        } catch (err) {
          console.error("requireDashboardAuth: falha ao validar sessão contra tabela users, mantendo acesso:", err);
        }
      }
      if (stillAllowed) {
        res.locals.dashboardUser = session.email;
        return next();
      }
      res.clearCookie("allevo_session");
      const looksLikeBrowserPageLoad = req.method === "GET" && !req.path.startsWith("/api/") && (req.headers.accept || "").includes("text/html");
      if (looksLikeBrowserPageLoad) {
        return res.redirect(302, "/login");
      }
      return res.status(401).json({ error: "Sua sessão expirou ou seu acesso foi removido." });
    }
  }

  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  const hasDomainRules = Boolean(process.env.DASHBOARD_ALLOWED_DOMAINS || process.env.DASHBOARD_ALLOWED_EMAILS);

  if (!expectedPassword || (!expectedUser && !hasDomainRules)) {
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) {
    // Requisição de navegador sem nenhuma credencial: manda pro login com
    // Google (melhor UX que o popup nativo do Basic Auth) em vez de 401.
    // Chamada de API/automação (sem Accept: text/html, ou sob /api/) segue
    // recebendo o 401 de sempre, sem quebrar nada existente.
    const looksLikeBrowserPageLoad = req.method === "GET" && !req.path.startsWith("/api/") && (req.headers.accept || "").includes("text/html");
    if (googleEnabled && looksLikeBrowserPageLoad) {
      return res.redirect(302, "/login");
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="AllevoTech Dashboard"');
    return res.status(401).send("Login obrigatório");
  }

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    res.setHeader("WWW-Authenticate", 'Basic realm="AllevoTech Dashboard"');
    return res.status(401).send("Login inválido");
  }

  const separatorIndex = decoded.indexOf(":");
  const suppliedUser = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const suppliedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  const validUser = isAllowedDashboardUser(suppliedUser, expectedUser);
  const validPassword = timingSafeEqual(suppliedPassword, expectedPassword);

  if (!validUser || !validPassword) {
    res.setHeader("WWW-Authenticate", 'Basic realm="AllevoTech Dashboard"');
    return res.status(401).send("Login inválido");
  }

  res.locals.dashboardUser = suppliedUser.trim().toLowerCase();
  next();
}

async function fetchCsv(gid: string, sheetId: string = "1fYoNt2OgXNFRsGg8-5xG8BkZHQJvKpUrHZA8nyeN6W8"): Promise<any[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`A planilha (ID: ${sheetId}) está privada. No Google Sheets, clique em 'Compartilhar' no canto superior direito e mude o acesso para 'Qualquer pessoa com o link pode ver'.`);
    }
    throw new Error(`Erro ao buscar dados da planilha (gid ${gid}): HTTP ${response.status}`);
  }
  const csvText = await response.text();
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`Não foi possível interpretar os dados da planilha: ${results.errors[0].message}`));
          return;
        }
        resolve(results.data);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

async function fetchCsvByTabName(tabName: string, sheetId: string): Promise<any[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`A planilha (ID: ${sheetId}) está privada. No Google Sheets, clique em 'Compartilhar' no canto superior direito e mude o acesso para 'Qualquer pessoa com o link pode ver'.`);
    }
    throw new Error(`Não foi possível localizar a aba ${tabName}: HTTP ${response.status}`);
  }
  const csvText = await response.text();
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`Não foi possível interpretar os dados da aba ${tabName}: ${results.errors[0].message}`));
          return;
        }
        resolve(results.data);
      },
      error: (error: any) => reject(error)
    });
  });
}

async function fetchCsvFromKnownTabs(sheetId: string, tabNames: string[], fallbackGid: string): Promise<any[]> {
  let lastError: unknown;
  for (const tabName of tabNames) {
    try {
      const rows = await fetchCsvByTabName(tabName, sheetId);
      if (rows.length > 0) return rows;
    } catch (error) {
      lastError = error;
    }
  }
  try {
    return await fetchCsv(fallbackGid, sheetId);
  } catch (fallbackError) {
    throw lastError || fallbackError;
  }
}

async function validateFunnelSource(sheetId: string) {
  // An empty, correctly structured sheet is a valid funnel waiting for its launch.
  // fetchFunnelSourceRows still rejects missing or inaccessible source tabs.
  const { sourceType } = await fetchFunnelSourceRows(sheetId);
  return sourceType;
}
// Cache bounded by time: previews must not block every dashboard sync.
const INSTAGRAM_THUMB_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_THUMB_REQUESTS_IN_FLIGHT = 4;
const MAX_THUMB_CACHE_ENTRIES = 300;
const instagramThumbCache = new Map<string, { value: string; expiresAt: number }>();

function cacheInstagramThumb(url: string, value: string) {
  if (!instagramThumbCache.has(url) && instagramThumbCache.size >= MAX_THUMB_CACHE_ENTRIES) {
    const oldestKey = instagramThumbCache.keys().next().value;
    if (oldestKey) instagramThumbCache.delete(oldestKey);
  }
  instagramThumbCache.set(url, { value, expiresAt: Date.now() + INSTAGRAM_THUMB_TTL_MS });
}
const ALLOWED_IMAGE_HOSTS = [
  "drive.google.com",
  "lh3.googleusercontent.com",
  "images.unsplash.com",
  "fbcdn.net",
  "cdninstagram.com",
  "instagram.com",
  "facebook.com"
];

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function getInstagramThumb(url: string): Promise<string> {
  if (!url || !/instagram\.com\/(?:p|reel|reels|tv)\//i.test(url)) return "";
  const cached = instagramThumbCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
      },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (match) {
        const imgUrl = match[1].replace(/&amp;/g, "&");
        cacheInstagramThumb(url, imgUrl);
        return imgUrl;
      }
    }
  } catch (e) {
    // Silencioso se der timeout
  }
  cacheInstagramThumb(url, "");
  return "";
}

async function hydrateCreativeThumbnails(items: any[]): Promise<any[]> {
  const pendingByLink = new Map<string, any[]>();
  items.filter((item) => !item["Thumb_Criativo"] && item["Link"]).forEach((item) => {
    const sameLinkItems = pendingByLink.get(item["Link"]) || [];
    sameLinkItems.push(item);
    pendingByLink.set(item["Link"], sameLinkItems);
  });
  const pending = [...pendingByLink.entries()];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pending.length) {
      const [link, linkedItems] = pending[nextIndex++];
      const thumbnail = await getInstagramThumb(link);
      linkedItems.forEach((item) => { item["Thumb_Criativo"] = thumbnail; });
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_THUMB_REQUESTS_IN_FLIGHT, pending.length) }, worker));
  return items;
}

function parseCellVal(rowXml: string, col: string, rowNum: number, strings: string[]): string {
  // Se célula for auto-fechada (<c r="A3" s="10"/>), não tem conteúdo
  const selfClosing = rowXml.match(new RegExp(`<c r="${col}${rowNum}"[^>]*/>`, "s"));
  if (selfClosing) return "";

  const cellMatch = rowXml.match(new RegExp(`<c r="${col}${rowNum}"([^>]*)>(.*?)</c>`, "s"));
  if (!cellMatch) return "";
  const attrs = cellMatch[1] || "";
  const body = cellMatch[2] || "";
  
  const fMatch = body.match(/<f[^>]*>(.*?)<\/f>/s);
  const vMatch = body.match(/<v[^>]*>(.*?)<\/v>/s);
  
  let val = vMatch ? vMatch[1] : "";
  if (attrs.includes('t="s"') && val !== "") {
    const idx = parseInt(val, 10);
    val = strings[idx] !== undefined ? strings[idx] : val;
  }
  
  if (fMatch) {
    let f = fMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const strMatches = [...f.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    if (strMatches.length > 0) {
      if (/IMAGE/i.test(f) || /http/i.test(f)) {
        return strMatches.join("");
      }
      if (!val || val === "#REF!" || val === "#N/A") {
        val = strMatches[strMatches.length - 1];
      }
    }
  }
  return (val || "").trim();
}

function normalizeTabName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parseWorksheetRows(sheetXml: string, strings: string[]): any[] {
  const rows = sheetXml.match(/<row\b[^>]*r="\d+"[^>]*>[\s\S]*?<\/row>/g) || [];
  const headerRow = rows.find((row) => /<row\b[^>]*r="1"/.test(row));
  if (!headerRow) return [];
  const columns = [...headerRow.matchAll(/<c r="([A-Z]+)1"/g)].map((match) => match[1]);
  const headers = columns.map((column) => parseCellVal(headerRow, column, 1, strings) || `Coluna ${column}`);

  return rows
    .map((row) => ({ row, rowNumber: Number(row.match(/<row\b[^>]*r="(\d+)"/)?.[1] || 0) }))
    .filter(({ rowNumber }) => rowNumber > 1)
    .map(({ row, rowNumber }) => Object.fromEntries(
      columns.map((column, index) => [headers[index], parseCellVal(row, column, rowNumber, strings)])
    ));
}

type FunnelSourceRows = {
  metaItems: any[];
  buyerItems: any[];
  fgpItems: any[];
  sourceType: FunnelSourceType;
};

function filterRealProductSales(rows: any[]) {
  const valueFor = (row: any, matcher: (header: string) => boolean) => {
    const entry = Object.entries(row || {}).find(([header]) => matcher(normalizeTabName(header)));
    return String(entry?.[1] || '').trim();
  };

  // Some launch workbooks prefill formulas through thousands of empty rows.
  // A product sale must have the four fields that identify an actual order.
  return rows.filter((row) => {
    const date = valueFor(row, (header) => header === 'data' || header.includes('data da compra'));
    const email = valueFor(row, (header) => header === 'email' || header.includes('e-mail'));
    const product = valueFor(row, (header) => header === 'produto' || header.includes('produto principal'));
    const value = valueFor(row, (header) => header === 'valor' || header.includes('faturamento') || header.includes('preco'));
    return Boolean(date && email && product && value);
  });
}

function filterRealBuyerSales(rows: any[]) {
  const valueFor = (row: any, matcher: (header: string) => boolean) => {
    const entry = Object.entries(row || {}).find(([header]) => matcher(normalizeTabName(header)));
    return String(entry?.[1] || '').trim();
  };

  // Exports XLSX can retain blank/formula rows after the actual sales. Those
  // rows must not reach period totals, even when a worksheet has formatting.
  return rows.filter((row) => {
    const values = Object.values(row || {}).map((value) => String(value || '').trim());
    const date = valueFor(row, (header) => header === 'data' || header.includes('data da compra') || header.includes('criado em')) || values[1] || values[2] || '';
    const email = valueFor(row, (header) => header === 'email' || header.includes('e-mail')) || values[4] || '';
    const product = valueFor(row, (header) => header === 'produto principal' || header === 'produto' || header.includes('oferta')) || values[11] || '';
    const transactionId = valueFor(row, (header) => header.includes('id da compra') || header.includes('id da transacao')) || values[0] || '';
    const value = valueFor(row, (header) => header.includes('valor da transacao') || header === 'valor' || header.includes('valor liquido') || header.includes('faturamento') || header.includes('preco')) || values[12] || '';
    return Boolean(date && product && (email || transactionId) && (transactionId || value));
  });
}

async function fetchFunnelSourceRows(sheetId: string): Promise<FunnelSourceRows> {
  try {
    // Historical funnels can contain thousands of Meta rows. Give the Google
    // export enough time to finish before falling back to the slower CSV path.
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text") || "";
    const strings = (sharedStringsXml.match(/<si>[\s\S]*?<\/si>/g) || []).map((entry) =>
      (entry.match(/<t[^>]*>(.*?)<\/t>/gs) || []).map((text) => text.replace(/<t[^>]*>|<\/t>/g, "")).join("")
    );
    const workbookXml = await zip.file("xl/workbook.xml")?.async("text") || "";
    const relationshipsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text") || "";
    const relationships = Object.fromEntries(
      [...relationshipsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
        .map((match) => [match[1], match[2].startsWith("/") ? match[2].slice(1) : `xl/${match[2]}`])
    );
    const sheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((match) => ({ name: match[1], file: relationships[match[2]] }));
    const perpetualFgpTabNames = ["Dados dos Compradores - FGP", "Compradores - FGP", "FGP"];
    const sourceType: FunnelSourceType = sheets.some((sheet) => perpetualFgpTabNames.includes(sheet.name))
      ? "paid-launch"
      : "standard";
    const findRows = async (names: string[], matchesSource?: (rows: any[]) => boolean) => {
      const wanted = new Set(names.map(normalizeTabName));
      const sheet = sheets.find((item) => wanted.has(normalizeTabName(item.name)) && item.file);
      if (sheet?.file) {
        const xml = await zip.file(sheet.file)?.async("text");
        if (!xml) throw new Error(`Não foi possível ler a aba ${sheet.name}`);
        return parseWorksheetRows(xml, strings);
      }

      // A spreadsheet copy can rename its tabs while retaining the expected
      // data layout. In that case, identify the source by its columns.
      if (matchesSource) {
        for (const candidate of sheets) {
          if (!candidate.file) continue;
          const xml = await zip.file(candidate.file)?.async("text");
          const rows = xml ? parseWorksheetRows(xml, strings) : [];
          if (rows.length > 0 && matchesSource(rows)) {
            console.info(`Aba ${names[0]} identificada pela estrutura: ${candidate.name}`);
            return rows;
          }
        }
      }

      throw new Error(`Aba não encontrada: ${names[0]}. Abas disponíveis: ${sheets.map((item) => item.name).join(", ")}`);
    };
    const hasHeader = (rows: any[], pattern: RegExp) => Object.keys(rows[0] || {}).some((header) => pattern.test(normalizeTabName(header)));
    const findOptionalRows = async (names: string[], matchesSource?: (rows: any[]) => boolean) => {
      try {
        return await findRows(names, matchesSource);
      } catch {
        return [];
      }
    };
    const [metaItems, buyerItems, fgpItems] = await Promise.all([
      findRows(
        ["Dados Meta Ads", "Meta Ads", "Dados da Meta"],
        (rows) => hasHeader(rows, /impressoes|nome do anuncio|nome da campanha|alcance/)
      ),
      findRows(
        ["Vendas", "Dados dos Compradores", "Compradores"],
        (rows) => hasHeader(rows, /produto|order bump|transacao|comprador|e-mail|email/)
      ),
      findOptionalRows(
        perpetualFgpTabNames,
        (rows) => hasHeader(rows, /produto|comprador|e-mail|email/) && hasHeader(rows, /plataforma|acesso a plataforma/)
      )
    ]);
    return { metaItems, buyerItems: filterRealBuyerSales(buyerItems), fgpItems: filterRealProductSales(fgpItems), sourceType };
  } catch (error) {
    console.warn("Leitura XLSX das abas de funil falhou; tentando exportação CSV:", error);
    const [metaItems, buyerItems, fgpResult] = await Promise.all([
      fetchCsvFromKnownTabs(sheetId, ["Dados Meta Ads", "Meta Ads", "Dados da Meta"], "57289144"),
      fetchCsvFromKnownTabs(sheetId, ["Vendas", "Dados dos Compradores", "Compradores"], "0"),
      fetchCsvByTabName("Dados dos Compradores - FGP", sheetId)
        .then((rows) => ({ rows, found: true }))
        .catch(() => ({ rows: [], found: false }))
    ]);
    return {
      metaItems,
      buyerItems: filterRealBuyerSales(buyerItems),
      fgpItems: filterRealProductSales(fgpResult.rows),
      sourceType: fgpResult.found ? "paid-launch" : "standard"
    };
  }
}

async function fetchCriativosWithThumbs(sheetId: string): Promise<any[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Shared strings
    const ssXml = await zip.file("xl/sharedStrings.xml")?.async("text");
    const strings: string[] = [];
    if (ssXml) {
      const siList = ssXml.split("</si>");
      for (const si of siList) {
        if (!si.trim()) continue;
        const tMatches = si.match(/<t[^>]*>(.*?)<\/t>/gs) || [];
        const text = tMatches.map(m => m.replace(/<t[^>]*>|<\/t>/g, '')).join('');
        strings.push(text);
      }
    }

    // Prefer the real tab name over a fixed worksheet position. Copies of a
    // spreadsheet can reorder worksheet files while retaining the same tabs.
    const workbookXml = await zip.file("xl/workbook.xml")?.async("text") || "";
    const relationshipsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text") || "";
    const relationships = Object.fromEntries(
      [...relationshipsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
        .map((match) => [match[1], match[2].startsWith("/") ? match[2].slice(1) : `xl/${match[2]}`])
    );
    const workbookSheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
      .map((match) => ({ name: match[1], file: relationships[match[2]] }));
    const creativeSheet = workbookSheets.find((sheet) => /criativo/i.test(sheet.name) && sheet.file);
    if (creativeSheet?.file) {
      const creativeXml = await zip.file(creativeSheet.file)?.async("text");
      const rowsFromNamedTab = creativeXml ? parseWorksheetRows(creativeXml, strings) : [];
      if (rowsFromNamedTab.length > 0) {
        return hydrateCreativeThumbnails(rowsFromNamedTab.map((item: any) => ({
          "Criativos": item["Nome Criativo"] || item["Criativos"] || item["Nome do Anúncio"] || item["Nome"] || "",
          "Link": item["Link Criativo"] || item["Link"] || item["Link dos criativos"] || "",
          "Thumb_Criativo": item["Thumb_Criativo"] || item["Thumb Criativo"] || item["thumb_criativo"] || item["Thumbnail"] || item["Thumb"] || item["Imagem"] || item["Preview"] || item["Prévia"] || ""
        })));
      }
    }

    // Workbook to map sheet name to sheet file
    const wbXml = workbookXml;
    const sheetMatches = [...wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*r:id="([^"]+)"/g)];
    
    const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text") || "";
    const relMatches = [...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)];
    const relMap: Record<string, string> = {};
    relMatches.forEach(m => {
      relMap[m[1]] = m[2].startsWith("/") ? m[2].substring(1) : "xl/" + m[2];
    });
    
    let metaSheetFile = "xl/worksheets/sheet2.xml";
    let targetSheetFile = "xl/worksheets/sheet3.xml";
    for (const s of sheetMatches) {
      const name = s[1];
      const rId = s[3];
      if (/meta/i.test(name) && relMap[rId]) {
        metaSheetFile = relMap[rId];
      }
      if (/criativo/i.test(name) && relMap[rId]) {
        targetSheetFile = relMap[rId];
      }
    }

    // Extrair lista ordenada e única de nomes de anúncios da aba Meta Ads (caso a aba Criativos use UNIQUE/FILTER dinâmico)
    const metaAdNames: string[] = [];
    const metaXml = await zip.file(metaSheetFile)?.async("text");
    if (metaXml) {
      const metaRows = metaXml.split("</row>");
      for (const r of metaRows) {
        const rMatch = r.match(/<row[^>]*r="(\d+)"/);
        const rowNum = rMatch ? parseInt(rMatch[1], 10) : 0;
        if (!rowNum || rowNum === 1) continue;
        const eVal = parseCellVal(r, "E", rowNum, strings);
        if (eVal && !metaAdNames.includes(eVal) && eVal !== "Nome do Anúncio") {
          metaAdNames.push(eVal);
        }
      }
    }
    
    const sheetXml = await zip.file(targetSheetFile)?.async("text");
    if (!sheetXml) {
      throw new Error("Sheet XML not found");
    }
    
    const rows = sheetXml.split("</row>");
    const items: any[] = [];

    // Detectar colunas dinamicamente a partir do cabeçalho (linha 1)
    let colName = "A";
    let colLink = "B";
    let colThumb = "D";

    for (const row of rows) {
      const rMatch = row.match(/<row[^>]*r="1"/);
      if (rMatch || rows.indexOf(row) === 0) {
        const cells = [...row.matchAll(/<c r="([A-Z]+)1"([^>]*)>(.*?)<\/c>/gs)];
        for (const c of cells) {
          const col = c[1];
          const attrs = c[2];
          const body = c[3];
          const vMatch = body.match(/<v[^>]*>(.*?)<\/v>/);
          let val = vMatch ? vMatch[1] : "";
          if (attrs.includes('t="s"')) {
            val = strings[parseInt(val, 10)] || "";
          }
          const lower = val.toLowerCase().trim();
          if ((lower.includes("nome") || lower.includes("criativo") || lower.includes("anúncio") || lower.includes("anuncio")) && !lower.includes("link") && !lower.includes("thumb")) {
            colName = col;
          }
          if (lower.includes("link") && !lower.includes("instagram") && !lower.includes("thumb")) {
            colLink = col;
          }
          if (lower.includes("thumb") || lower.includes("imagem") || lower.includes("preview") || lower.includes("foto") || lower.includes("capa")) {
            colThumb = col;
          }
        }
      }
    }
    
    for (const row of rows) {
      if (!row.trim()) continue;
      const rMatch = row.match(/<row[^>]*r="(\d+)"/);
      const rowNum = rMatch ? parseInt(rMatch[1], 10) : 0;
      if (!rowNum || rowNum === 1) continue; // Pular cabeçalho
      
      let nameVal = parseCellVal(row, colName, rowNum, strings) || parseCellVal(row, "A", rowNum, strings);
      // Se o nome for vazio ou #REF! gerado por fórmula ARRAY/UNIQUE não renderizada no XLSX, usar o nome correspondente do Meta Ads
      if (!nameVal || nameVal.startsWith("#REF") || nameVal.startsWith("#N/A")) {
        nameVal = metaAdNames[rowNum - 2] || "";
      }

      const linkVal = parseCellVal(row, colLink, rowNum, strings) || parseCellVal(row, "B", rowNum, strings);
      let thumbVal = parseCellVal(row, colThumb, rowNum, strings) || parseCellVal(row, "D", rowNum, strings);

      // Se a thumb não estiver na coluna D, checar se alguma outra célula da linha contém uma imagem/IMAGE()
      if (!thumbVal) {
        const allCells = [...row.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/gs)];
        for (const c of allCells) {
          const body = c[3];
          if (body.includes("IMAGE(") || body.includes("fbcdn.net") || body.includes("googleusercontent.com") || body.includes("drive.google.com") || body.includes(".jpg") || body.includes(".png")) {
            const fMatch = body.match(/<f[^>]*>(.*?)<\/f>/);
            if (fMatch) {
              let f = fMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
              const strMatches = [...f.matchAll(/"([^"]+)"/g)].map(m => m[1]);
              if (strMatches.length > 0) {
                thumbVal = strMatches.join('');
                break;
              }
            }
          }
        }
      }
      
      if (nameVal || linkVal || thumbVal) {
        items.push({
          "Criativos": nameVal,
          "Link": linkVal,
          "Thumb_Criativo": thumbVal
        });
      }
    }

    // Para itens com link do Instagram e sem thumb explícita, tentar resolver a thumb via OpenGraph
    await hydrateCreativeThumbnails(items);
    
    if (items.length > 0) {
      return items;
    }
  } catch (err) {
    console.warn("XLSX parsing failed or empty, falling back to CSV for criativos:", err);
  }

  // Fallback to CSV
  const csvRows = await fetchCsvFromKnownTabs(sheetId, ["Link Criativos", "Criativos"], "1468046400");
  return csvRows.map((item: any) => ({
    "Criativos": item["Nome Criativo"] || item["Criativos"] || item["Nome do Anúncio"] || item["Nome"] || "",
    "Link": item["Link Criativo"] || item["Link"] || "",
    "Thumb_Criativo": item["Thumb_Criativo"] || item["Thumb Criativo"] || item["thumb_criativo"] || item["Thumbnail"] || item["Thumb"] || item["Imagem"] || item["Preview"] || item["Prévia"] || ""
  }));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Atrás do Traefik (TLS termina lá) — sem isso req.protocol sempre vem
  // "http", quebrando a redirect_uri do Google OAuth (que exige https).
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "1mb" }));

  // Health check para as probes do Kubernetes. Precisa ficar antes de
  // requireDashboardAuth: com Basic Auth ativo qualquer outra rota responde 401
  // e o pod nunca ficaria Ready.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", version: process.env.APP_VERSION || "dev" });
  });

  // Ingestão via automação externa (N8N): autentica por token próprio, não por
  // Basic Auth (quem chama é uma automação, não uma pessoa no navegador), por
  // isso fica registrada antes de requireDashboardAuth, igual /healthz.
  registerIngestRoutes(app);

  // Login (/login, /auth/google, /auth/google/callback, /auth/logout)
  // também fica antes do requireDashboardAuth — sem isso ninguém consegue
  // nem chegar na tela de login.
  registerAuthRoutes(app);

  app.use(requireDashboardAuth);

  // Endpoint de proxy de imagem para evitar bloqueios de CORS/Referer
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
        return res.status(400).send("URL inválida");
      }
      
      const imgRes = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(7000)
      });
      
      if (!imgRes.ok) {
        return res.status(imgRes.status).send("Falha ao buscar imagem externa");
      }
      
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const contentLength = Number(imgRes.headers.get("content-length") || "0");
      if (!contentType.startsWith("image/") || contentLength > 8 * 1024 * 1024) {
        return res.status(415).send("Imagem externa não suportada");
      }
      const buffer = await imgRes.arrayBuffer();
      if (buffer.byteLength > 8 * 1024 * 1024) {
        return res.status(413).send("Imagem externa muito grande");
      }
      
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send(err.message || "Erro no proxy de imagem");
    }
  });

  // Identidade de quem está logado (Google OAuth ou Basic Auth) + se é
  // admin — o frontend usa isso pra mostrar/esconder a tela de gerenciar
  // usuários.
  app.get("/api/me", async (req, res) => {
    const email = dashboardAdminEmail(req);
    let role = "member";
    if (DATABASE_URL && email) {
      try {
        const pool = await pgPool();
        const { rows } = await pool.query("SELECT role FROM users WHERE email = $1", [email]);
        if (rows[0]) role = rows[0].role;
      } catch (err) {
        console.error("/api/me: falha ao consultar tabela users:", err);
      }
    }
    if (role !== "admin") {
      const configuredAdmins = parseList(process.env.DASHBOARD_ADMIN_EMAILS);
      if (configuredAdmins.includes(email)) role = "admin";
      // Mesmo bypass de conveniência que requireDashboardAdmin já tem: sem
      // nenhum admin configurado e fora de produção, todo mundo é admin
      // (dev local sem precisar configurar nada). Sem isso o frontend
      // esconderia os botões de criar/editar/apagar funil mesmo quando o
      // backend deixaria passar.
      else if (configuredAdmins.length === 0 && process.env.NODE_ENV !== "production") role = "admin";
    }
    res.json({ email, role, googleLoginEnabled: Boolean(process.env.GOOGLE_CLIENT_ID) });
  });

  // Gerenciar quem pode logar via Google — só admin. Requer Postgres (a
  // tabela users só existe lá); em ambiente sem DATABASE_URL (AWS hoje)
  // essas rotas respondem 503, e o login continua sendo só Basic Auth.
  app.get("/api/admin/users", requireDashboardAdmin, async (_req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Gerenciar usuários requer DATABASE_URL configurada no servidor." });
    }
    try {
      const pool = await pgPool();
      const { rows } = await pool.query("SELECT email, role, added_by, created_at FROM users ORDER BY created_at");
      res.json({ users: rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Falha ao listar usuários." });
    }
  });

  app.post("/api/admin/users", requireDashboardAdmin, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Gerenciar usuários requer DATABASE_URL configurada no servidor." });
    }
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      const role = req.body?.role === "admin" ? "admin" : "member";
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "E-mail inválido." });
      }
      const pool = await pgPool();
      await pool.query(
        `INSERT INTO users (email, role, added_by) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
        [email, role, dashboardAdminEmail(req)]
      );
      res.json({ ok: true, email, role });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Falha ao adicionar usuário." });
    }
  });

  app.delete("/api/admin/users/:email", requireDashboardAdmin, async (req, res) => {
    if (!DATABASE_URL) {
      return res.status(503).json({ error: "Gerenciar usuários requer DATABASE_URL configurada no servidor." });
    }
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase().trim();
      const pool = await pgPool();
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Falha ao remover usuário." });
    }
  });

  // API routes FIRST
  app.get("/api/funnels", async (_req, res) => {
    try {
      res.json({ funnels: await loadFunnels() });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Não foi possível carregar os funis." });
    }
  });

  const ALLOWED_SOURCE_TYPES: FunnelSourceType[] = ["standard", "perpetual-launch", "paid-launch"];

  // Sheet-backed funnels (DATABASE_URL unset) still need a real, readable
  // sheet: sourceType is auto-detected by fetching it, same as always. Once
  // Postgres is the source of truth, this app never reads the sheet at all,
  // so a link is optional (kept only as the user's own backup reference) and
  // sourceType is picked by whoever creates the funnel instead of detected.
  async function resolveSourceType(spreadsheetUrl: unknown, sheetId: string, requestedSourceType: unknown): Promise<FunnelSourceType> {
    if (DATABASE_URL) {
      return ALLOWED_SOURCE_TYPES.includes(requestedSourceType as FunnelSourceType)
        ? (requestedSourceType as FunnelSourceType)
        : "standard";
    }
    if (!sheetId) {
      throw Object.assign(new Error("Cole um link válido do Google Sheets."), { status: 400 });
    }
    return validateFunnelSource(sheetId);
  }

  app.post("/api/funnels", requireDashboardAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
      const sheetId = extractSpreadsheetId(req.body?.spreadsheetUrl);
      if (name.length < 3 || name.length > 80) {
        return res.status(400).json({ error: "Informe um nome de funil entre 3 e 80 caracteres." });
      }
      if (!DATABASE_URL && !sheetId) {
        return res.status(400).json({ error: "Cole um link válido do Google Sheets." });
      }

      const funnels = await loadFunnels();
      if (sheetId && funnels.some((funnel) => funnel.sheetId === sheetId)) {
        return res.status(409).json({ error: "Essa planilha já está cadastrada em um funil." });
      }

      const sourceType = await resolveSourceType(req.body?.spreadsheetUrl, sheetId, req.body?.sourceType);

      const customFunnels = funnels.filter((funnel) => !funnel.builtIn);
      const funnel: FunnelConfig = {
        id: buildFunnelId(name, funnels),
        name,
        sheetId,
        color: CUSTOM_FUNNEL_COLORS[customFunnels.length % CUSTOM_FUNNEL_COLORS.length],
        sourceType,
        builtIn: false
      };
      await saveCustomFunnels([...funnels, funnel]);

      let importResult: any = undefined;
      let importError: string | undefined;
      if (DATABASE_URL && sheetId) {
        try {
          importResult = await importFunnelFromSheet(funnel);
        } catch (error: any) {
          importError = error?.message || "Não foi possível importar os dados da planilha agora.";
          console.error(`Erro ao importar planilha do funil ${funnel.id} pro Postgres:`, error);
        }
      }
      res.status(201).json({ funnel, import: importResult, importError });
    } catch (error: any) {
      const message = error.message || "Não foi possível validar a planilha.";
      const isPermissionError = /privada|permissão|compartilhar/i.test(message);
      res.status(error.status || (isPermissionError ? 403 : 422)).json({ error: message });
    }
  });

  app.put("/api/funnels/:funnelId", requireDashboardAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
      const sheetId = extractSpreadsheetId(req.body?.spreadsheetUrl);
      if (name.length < 3 || name.length > 80) {
        return res.status(400).json({ error: "Informe um nome de funil entre 3 e 80 caracteres." });
      }
      if (!DATABASE_URL && !sheetId) {
        return res.status(400).json({ error: "Cole um link válido do Google Sheets." });
      }

      const funnels = await loadFunnels();
      const funnel = funnels.find((item) => item.id === req.params.funnelId);
      if (!funnel) return res.status(404).json({ error: "Funil não encontrado." });
      if (sheetId && funnels.some((item) => item.id !== funnel.id && item.sheetId === sheetId)) {
        return res.status(409).json({ error: "Essa planilha já está cadastrada em outro funil." });
      }

      const sourceType = await resolveSourceType(req.body?.spreadsheetUrl, sheetId, req.body?.sourceType);
      const updated: FunnelConfig = { ...funnel, name, sheetId, sourceType };
      await saveCustomFunnels(funnels.map((item) => item.id === funnel.id ? updated : item));

      let importResult: any = undefined;
      let importError: string | undefined;
      if (DATABASE_URL && sheetId) {
        try {
          importResult = await importFunnelFromSheet(updated);
        } catch (error: any) {
          importError = error?.message || "Não foi possível importar os dados da planilha agora.";
          console.error(`Erro ao importar planilha do funil ${updated.id} pro Postgres:`, error);
        }
      }
      res.json({ funnel: updated, import: importResult, importError });
    } catch (error: any) {
      const message = error.message || "Não foi possível atualizar o funil.";
      const isPermissionError = /privada|permissão|compartilhar/i.test(message);
      res.status(error.status || (isPermissionError ? 403 : 422)).json({ error: message });
    }
  });

  app.delete("/api/funnels/:funnelId", requireDashboardAdmin, async (req, res) => {
    try {
      const funnels = await loadFunnels();
      const funnel = funnels.find((item) => item.id === req.params.funnelId);
      if (!funnel) return res.status(404).json({ error: "Funil não encontrado." });
      if (funnels.length <= 1) {
        return res.status(422).json({ error: "Mantenha pelo menos um funil cadastrado no dashboard." });
      }
      await saveCustomFunnels(funnels.filter((item) => item.id !== funnel.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Não foi possível remover o funil." });
    }
  });

  app.get("/api/spreadsheet", async (req, res) => {
    try {
      const requestedProject = String(req.query.project || "estrategia");
      const funnels = await loadFunnels();
      const aliases: Record<string, string> = { "1": "estrategia", "2": "gestao-ia" };
      const requestedIds = requestedProject === "all" || requestedProject === "consolidado" || requestedProject === "both"
        ? funnels.map((funnel) => funnel.id)
        : requestedProject.split(",").map((id) => aliases[id] || id).filter(Boolean);
      const selectedFunnels = funnels.filter((funnel) => requestedIds.includes(funnel.id));

      if (selectedFunnels.length === 0 || selectedFunnels.length !== new Set(requestedIds).size) {
        return res.status(400).json({ error: "Funil inválido. Selecione um funil disponível e tente novamente." });
      }


      const sources = await Promise.all(selectedFunnels.map(async (funnel) => {
        if (DATABASE_URL) {
          try {
            const { metaItems, compradoresItems, fgpItems, criativosItems } = await fetchFunnelDataFromDb(funnel);
            return {
              funnel,
              fromDb: true as const,
              metaItems,
              compradoresItems,
              fgpItems,
              criativosItems,
              diagnostics: {
                metaRows: metaItems.length,
                buyerRows: compradoresItems.length,
                fgpRows: fgpItems.length,
                creativeRows: criativosItems.length,
                sourceError: null as string | null,
                creativeError: null as string | null
              }
            };
          } catch (error: any) {
            console.error(`Erro ao ler dados do Postgres para o funil ${funnel.id}:`, error);
            const message = error?.message || "Não foi possível ler os dados do banco.";
            return {
              funnel,
              fromDb: true as const,
              metaItems: [], compradoresItems: [], fgpItems: [], criativosItems: [],
              diagnostics: { metaRows: 0, buyerRows: 0, fgpRows: 0, creativeRows: 0, sourceError: message, creativeError: null }
            };
          }
        }

        const [funnelSourceResult, criativosResult] = await Promise.allSettled([
          fetchFunnelSourceRows(funnel.sheetId),
          fetchCriativosWithThumbs(funnel.sheetId)
        ]);

        const sourceError = funnelSourceResult.status === "rejected"
          ? (funnelSourceResult.reason?.message || "Não foi possível ler os dados de Meta e Compradores.")
          : null;
        const creativeError = criativosResult.status === "rejected"
          ? (criativosResult.reason?.message || "Não foi possível ler a aba de Criativos.")
          : null;
        const { metaItems, buyerItems: compradoresItems, fgpItems } = funnelSourceResult.status === "fulfilled"
          ? funnelSourceResult.value
          : { metaItems: [], buyerItems: [], fgpItems: [] };
        const criativosItems = criativosResult.status === "fulfilled" ? criativosResult.value : [];

        return {
          funnel,
          fromDb: false as const,
          metaItems,
          compradoresItems,
          fgpItems,
          criativosItems,
          diagnostics: {
            metaRows: metaItems.length,
            buyerRows: compradoresItems.length,
            fgpRows: fgpItems.length,
            creativeRows: criativosItems.length,
            sourceError,
            creativeError
          }
        };
      }));

      // DB rows come back already in final response shape (fetchFunnelDataFromDb
      // does the formatting itself — formatMeta/formatBuyers are Sheets-XLSX
      // normalizers and don't apply to already-clean DB rows). Sheets rows still
      // need the existing formatting step.
      const data: any = {
        "Dados da Meta": sources.flatMap(({ funnel, metaItems, fromDb }) =>
          fromDb ? metaItems : metaItems.map((item: any) => formatMeta(item, funnel.name))),
        "Dados dos Compradores": sources.flatMap(({ funnel, compradoresItems, fromDb }) =>
          fromDb ? compradoresItems : compradoresItems.map((item: any) => formatBuyers(item, funnel))),
        "Dados dos Compradores - FGP": sources.flatMap(({ funnel, fgpItems, fromDb }) =>
          fromDb ? fgpItems : fgpItems.map((item: any) => formatBuyers(item, funnel))),
        "Link dos criativos": sources.flatMap(({ criativosItems }) => criativosItems)
      };

      res.json({
        data,
        project: selectedFunnels.map((funnel) => funnel.id).join(","),
        funnels: selectedFunnels,
        diagnostics: sources.map(({ funnel, diagnostics }) => ({ funnelId: funnel.id, funnelName: funnel.name, ...diagnostics }))
      });
    } catch (error: any) {
      console.error("Erro ao buscar dados da planilha:", error);
      const message = error.message || "Erro interno no servidor ao processar os dados";
      const isPermissionError = /privada|permissão|compartilhar/i.test(message);
      const isTimeout = error?.name === 'TimeoutError' || /timed out|timeout/i.test(message);
      res.status(isPermissionError ? 403 : isTimeout ? 504 : 502).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
