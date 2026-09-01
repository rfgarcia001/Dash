#!/usr/bin/env node
// One-off/reusable backfill: reads current data from the live app's
// /api/spreadsheet endpoint (whichever backend it's using — Sheets today)
// and writes it into Postgres in the shape db/schema.sql expects. Reuses
// the app's own Sheets-parsing/formatting logic via HTTP instead of
// duplicating it, so date parsing, positional-column fallback, and row
// filtering all stay in sync with the live dashboard.
//
// Usage:
//   DASHBOARD_URL=http://localhost:3000 DATABASE_URL=postgres://... node db/backfill-postgres.mjs [funnelId ...]
// Against an env with Basic Auth on (prod/VPS), also set:
//   DASHBOARD_BASIC_AUTH=usuario:senha
//
// With no funnel ids given, backfills every funnel currently in the
// dashboard's /api/funnels list. Safe to re-run: each funnel's existing
// rows are deleted and reinserted (not appended), so re-running after a
// sheet update just refreshes it.

import pg from "pg";

const DASHBOARD_URL = (process.env.DASHBOARD_URL || "http://localhost:3000").replace(/\/$/, "");
const DATABASE_URL = process.env.DATABASE_URL;
// Prod tem Basic Auth ligado (DASHBOARD_PASSWORD) — sem isso o fetch abaixo
// toma 401. Formato: DASHBOARD_BASIC_AUTH="usuario:senha".
const [BASIC_AUTH_USER, ...basicAuthPasswordParts] = (process.env.DASHBOARD_BASIC_AUTH || "").split(":");
const BASIC_AUTH_PASSWORD = basicAuthPasswordParts.join(":");
const authHeaders = BASIC_AUTH_USER
  ? { Authorization: `Basic ${Buffer.from(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}`).toString("base64")}` }
  : {};

if (!DATABASE_URL) {
  console.error("DATABASE_URL não setada. Exemplo: postgres://allevo:allevo_dev_only@localhost:5432/allevo");
  process.exit(1);
}

// Pre-existing gap in the live app: formatBuyers' date parser
// (parseUtcToUtcMinus3, server.ts) only recognizes ISO and DD/MM/YYYY
// strings. Meta-tab dates go through normalizeMetaDate, which DOES handle
// raw Excel serials — buyer-tab dates never got the same treatment, so
// unconverted cells (e.g. "46255.53258101852") pass straight through as the
// literal string. Confirmed against the live /api/spreadsheet response:
// 1244 of 2068 buyer rows (mostly funnel "Lançamento Pago - Maio 2026") are
// affected today. Decode the same way normalizeMetaDate does so this
// backfill recovers the real purchase time instead of dropping/mis-dating
// these rows.
function excelSerialToDate(serial) {
  const days = Math.floor(serial);
  const fraction = serial - days;
  const localWallClockAsUtc = Date.UTC(1899, 11, 30) + days * 86_400_000 + Math.round(fraction * 86_400_000);
  return new Date(localWallClockAsUtc + 3 * 3600 * 1000); // serial's time-of-day is local (UTC-3) wall clock -> true UTC instant
}

function toPurchasedAt(row) {
  const original = String(row["Data_Original"] ?? "").trim();
  if (/^\d{4,6}(?:\.\d+)?$/.test(original)) {
    return excelSerialToDate(Number(original));
  }
  const m = String(row["Data_Hora_Formatada"] || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) {
    const [, d, mo, y, hh, mi] = m;
    const hour = hh ? Number(hh) : 12; // noon fallback for date-only rows — keeps the right calendar day
    const minute = mi ? Number(mi) : 0;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, 0) + 3 * 3600 * 1000);
  }
  const [y, mo, d] = String(row["Data"] || "1970-01-01").split("-").map(Number);
  if (Number.isFinite(y) && y > 1970 && y < 3000) {
    return new Date(Date.UTC(y, (mo || 1) - 1, d || 1, 12, 0, 0) + 3 * 3600 * 1000);
  }
  return null; // unrecoverable — caller skips the row instead of guessing a date
}

async function backfillFunnel(pool, funnelId) {
  const res = await fetch(`${DASHBOARD_URL}/api/spreadsheet?project=${encodeURIComponent(funnelId)}`, { headers: authHeaders });
  if (!res.ok) {
    console.error(`  ✗ ${funnelId}: HTTP ${res.status}`);
    return;
  }
  const { data } = await res.json();
  const meta = data["Dados da Meta"] || [];
  const standard = data["Dados dos Compradores"] || [];
  const fgp = data["Dados dos Compradores - FGP"] || [];
  const creatives = data["Link dos criativos"] || [];

  await pool.query("BEGIN");
  let metaInserted = 0;
  try {
    await pool.query("DELETE FROM meta_ads WHERE funnel_id = $1", [funnelId]);
    await pool.query("DELETE FROM buyers WHERE funnel_id = $1", [funnelId]);
    await pool.query("DELETE FROM creatives WHERE funnel_id = $1", [funnelId]);

    for (const row of meta) {
      if (!row["Data"]) continue; // trailing blank/formula rows some sheet tabs carry — ad_date is NOT NULL
      metaInserted++;
      await pool.query(
        `INSERT INTO meta_ads (funnel_id, ad_date, campaign_name, adset_name, ad_name, spend, impressions, link_clicks, landing_page_views, initiate_checkout, creative_thumb_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [funnelId, row["Data"], row["Nome da Campanha"], row["Nome do Conjunto"], row["Nome do Anúncio"],
         row["Gasto"], row["Impressões"], row["Cliques no Link"], row["Visualizações da Página de Destino"],
         row["Iniciate Checkout"], row["Thumb_Criativo"]]
      );
    }

    let buyersSkipped = 0;
    for (const [rows, bucket] of [[standard, "standard"], [fgp, "fgp"]]) {
      for (const row of rows) {
        const purchasedAt = toPurchasedAt(row);
        if (!purchasedAt) {
          buyersSkipped++;
          continue; // unrecoverable source date (corrupt sheet cell) — see toPurchasedAt
        }
        await pool.query(
          `INSERT INTO buyers (funnel_id, bucket, purchased_at, email, amount, utm_campaign, utm_source, utm_medium, utm_term, utm_content, product, order_bump)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [funnelId, bucket, purchasedAt, row["E-mail"], row["Valor"], row["utm_campaign"], row["utm_source"],
           row["utm_medium"], row["utm_term"], row["utm_content"], row["Produto"], row["Order Bump"]]
        );
      }
    }

    // Upsert por (funnelId, creativeName) — mesmo comportamento do
    // /api/ingest/criativos: nunca apaga, só adiciona/atualiza. Uma sheet
    // pode ter o mesmo nome de criativo repetido (mesmo anúncio reaproveitado
    // em campanhas diferentes), o que violaria o índice único se fosse INSERT
    // simples.
    for (const row of creatives) {
      if (!row["Criativos"]) continue;
      await pool.query(
        `INSERT INTO creatives (funnel_id, creative_name, link, thumb_url)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (funnel_id, creative_name)
         DO UPDATE SET link = EXCLUDED.link, thumb_url = EXCLUDED.thumb_url`,
        [funnelId, row["Criativos"], row["Link"] || "", row["Thumb_Criativo"] || ""]
      );
    }

    await pool.query("COMMIT");
    const metaSkipped = meta.length - metaInserted;
    const buyersTotal = standard.length + fgp.length;
    const buyersInserted = buyersTotal - buyersSkipped;
    console.log(`  ✓ ${funnelId}: ${metaInserted} meta${metaSkipped ? ` (${metaSkipped} sem data, ignoradas)` : ""}, ${buyersInserted} compradores${buyersSkipped ? ` (${buyersSkipped} com data corrompida na planilha, IGNORADAS — ver aviso)` : ""}, ${creatives.length} criativos`);
    if (buyersSkipped) {
      console.warn(`    ⚠ ${funnelId}: ${buyersSkipped} vendas não entraram no banco por data ilegível na planilha de origem. Precisa corrigir a fórmula/coluna de data nessa planilha e rodar o backfill de novo pra recuperar essas vendas.`);
    }
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(`  ✗ ${funnelId}:`, error.message);
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let funnelIds = process.argv.slice(2);
  if (funnelIds.length === 0) {
    const res = await fetch(`${DASHBOARD_URL}/api/funnels`, { headers: authHeaders });
    const { funnels } = await res.json();
    funnelIds = funnels.map((f) => f.id);
  }
  console.log(`Backfill: ${funnelIds.join(", ")}`);
  for (const id of funnelIds) {
    await backfillFunnel(pool, id);
  }
  await pool.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
