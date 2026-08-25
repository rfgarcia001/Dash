import "dotenv/config";
import express from "express";
import path from "path";
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
const CUSTOM_FUNNEL_COLORS = ["#F97316", "#E879F9", "#A3E635", "#38BDF8", "#C084FC"];

async function loadFunnels(): Promise<FunnelConfig[]> {
  try {
    const raw = await fs.readFile(FUNNEL_CONFIG_PATH, "utf8");
    const stored = JSON.parse(raw);
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
  } catch (error: any) {
    if (error?.code === "ENOENT") return DEFAULT_FUNNELS;
    throw new Error("Não foi possível ler a configuração de funis.");
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
  await fs.mkdir(path.dirname(FUNNEL_CONFIG_PATH), { recursive: true });
  await fs.writeFile(FUNNEL_CONFIG_PATH, `${JSON.stringify({ customFunnels, removedBuiltInIds, overrides }, null, 2)}\n`, "utf8");
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

function requireDashboardAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configuredAdmins = parseList(process.env.DASHBOARD_ADMIN_EMAILS);
  if (configuredAdmins.length === 0) {
    if (process.env.NODE_ENV !== "production") return next();
    return res.status(503).json({ error: "Cadastro de funis ainda não está habilitado. Configure DASHBOARD_ADMIN_EMAILS no servidor." });
  }
  if (!configuredAdmins.includes(dashboardAdminEmail(req))) {
    return res.status(403).json({ error: "Somente administradores podem adicionar funis." });
  }
  next();
}

function requireDashboardAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  const hasDomainRules = Boolean(process.env.DASHBOARD_ALLOWED_DOMAINS || process.env.DASHBOARD_ALLOWED_EMAILS);

  if (!expectedPassword || (!expectedUser && !hasDomainRules)) {
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) {
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

  app.use(express.json({ limit: "32kb" }));
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

  // API routes FIRST
  app.get("/api/funnels", async (_req, res) => {
    try {
      res.json({ funnels: await loadFunnels() });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Não foi possível carregar os funis." });
    }
  });

  app.post("/api/funnels", requireDashboardAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
      const sheetId = extractSpreadsheetId(req.body?.spreadsheetUrl);
      if (name.length < 3 || name.length > 80) {
        return res.status(400).json({ error: "Informe um nome de funil entre 3 e 80 caracteres." });
      }
      if (!sheetId) {
        return res.status(400).json({ error: "Cole um link válido do Google Sheets." });
      }

      const funnels = await loadFunnels();
      if (funnels.some((funnel) => funnel.sheetId === sheetId)) {
        return res.status(409).json({ error: "Essa planilha já está cadastrada em um funil." });
      }

      const sourceType = await validateFunnelSource(sheetId);

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
      res.status(201).json({ funnel });
    } catch (error: any) {
      const message = error.message || "Não foi possível validar a planilha.";
      const isPermissionError = /privada|permissão|compartilhar/i.test(message);
      res.status(isPermissionError ? 403 : 422).json({ error: message });
    }
  });

  app.put("/api/funnels/:funnelId", requireDashboardAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
      const sheetId = extractSpreadsheetId(req.body?.spreadsheetUrl);
      if (name.length < 3 || name.length > 80) {
        return res.status(400).json({ error: "Informe um nome de funil entre 3 e 80 caracteres." });
      }
      if (!sheetId) {
        return res.status(400).json({ error: "Cole um link válido do Google Sheets." });
      }

      const funnels = await loadFunnels();
      const funnel = funnels.find((item) => item.id === req.params.funnelId);
      if (!funnel) return res.status(404).json({ error: "Funil não encontrado." });
      if (funnels.some((item) => item.id !== funnel.id && item.sheetId === sheetId)) {
        return res.status(409).json({ error: "Essa planilha já está cadastrada em outro funil." });
      }

      const sourceType = await validateFunnelSource(sheetId);
      const updated: FunnelConfig = { ...funnel, name, sheetId, sourceType };
      await saveCustomFunnels(funnels.map((item) => item.id === funnel.id ? updated : item));
      res.json({ funnel: updated });
    } catch (error: any) {
      const message = error.message || "Não foi possível atualizar o funil.";
      const isPermissionError = /privada|permissão|compartilhar/i.test(message);
      res.status(isPermissionError ? 403 : 422).json({ error: message });
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

      const sources = await Promise.all(selectedFunnels.map(async (funnel) => {
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

      const data: any = {
        "Dados da Meta": sources.flatMap(({ funnel, metaItems }) => metaItems.map((item) => formatMeta(item, funnel.name))),
        "Dados dos Compradores": sources.flatMap(({ funnel, compradoresItems }) => compradoresItems.map((item) => formatBuyers(item, funnel))),
        "Dados dos Compradores - FGP": sources.flatMap(({ funnel, fgpItems }) => fgpItems.map((item) => formatBuyers(item, funnel))),
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
