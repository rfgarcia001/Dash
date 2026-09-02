#!/usr/bin/env node
// MCP server pro Allevo Dashboard: expõe consulta somente-leitura ao
// Postgres da VPS via os endpoints /api/ingest/* já existentes no server.ts
// (mesmo token de autenticação, sem credencial de banco na máquina local,
// sem SSH). O servidor real garante o "somente-leitura" via
// SET TRANSACTION READ ONLY dentro da transação — este MCP não precisa
// reforçar nada, só repassar sql/params.
//
// Config via env vars:
//   ALLEVO_API_URL     — ex.: http://148.230.79.62:8088 (obrigatório)
//   ALLEVO_INGEST_TOKEN — o mesmo INGEST_API_TOKEN do servidor (obrigatório)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.ALLEVO_API_URL || "").replace(/\/$/, "");
const TOKEN = process.env.ALLEVO_INGEST_TOKEN || "";

if (!API_URL || !TOKEN) {
  console.error("ALLEVO_API_URL e ALLEVO_INGEST_TOKEN são obrigatórias (env vars).");
  process.exit(1);
}

async function callApi(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "X-Ingest-Token": TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

const SCHEMA_TEXT = `Três tabelas no Postgres do Allevo Dashboard (schema completo em db/schema.sql):

meta_ads — uma linha por anúncio, por dia
  funnel_id TEXT, ad_date DATE, ad_id TEXT, campaign_name TEXT, adset_name TEXT,
  ad_name TEXT, spend NUMERIC, impressions INT, link_clicks INT,
  landing_page_views INT, initiate_checkout INT, creative_thumb_url TEXT

buyers — uma linha por venda
  funnel_id TEXT, bucket TEXT ('standard'|'fgp'), order_id TEXT,
  purchased_at TIMESTAMPTZ, email TEXT, amount NUMERIC,
  utm_campaign/utm_source/utm_medium/utm_term/utm_content TEXT,
  product TEXT, order_bump TEXT

creatives — uma linha por criativo (sem dimensão de data)
  funnel_id TEXT, creative_name TEXT, link TEXT, thumb_url TEXT

funnelId conhecidos hoje: estrategia, gestao-ia, ia-jeito-certo,
lancamento-perpetuo-maio-2026, clube-da-virada (confirme sempre com a
ferramenta list_funnels, essa lista pode mudar).`;

const server = new McpServer({
  name: "allevo-dashboard",
  version: "1.0.0"
});

server.registerTool(
  "list_funnels",
  {
    title: "Listar funis",
    description: "Lista os funnelId válidos cadastrados no dashboard, com nome."
  },
  async () => {
    const data = await callApi("/api/ingest/funnels");
    return { content: [{ type: "text", text: JSON.stringify(data.funnels, null, 2) }] };
  }
);

server.registerTool(
  "get_schema",
  {
    title: "Ver schema do banco",
    description: "Descreve as tabelas (meta_ads, buyers, creatives) e seus campos, pra montar consultas SQL corretas."
  },
  async () => {
    return { content: [{ type: "text", text: SCHEMA_TEXT }] };
  }
);

server.registerTool(
  "query_sql",
  {
    title: "Consultar o banco (SELECT)",
    description:
      "Roda uma consulta SELECT (ou WITH ... SELECT) somente-leitura no Postgres do dashboard. " +
      "Sem ';', uma instrução por chamada. Use get_schema antes se não souber os nomes de coluna. " +
      "Datas ficam em UTC no banco (purchased_at/ad_date) — o dashboard mostra tudo em UTC-3, " +
      "então pra bater com o que a pessoa vê na tela, subtraia 3 horas ou filtre com margem.",
    inputSchema: {
      sql: z.string().describe("Consulta SQL, ex.: \"SELECT funnel_id, sum(spend) FROM meta_ads WHERE ad_date >= CURRENT_DATE - 7 GROUP BY funnel_id\""),
      params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
        .describe("Parâmetros posicionais ($1, $2, ...), se a query usar.")
    }
  },
  async ({ sql, params }) => {
    const data = await callApi("/api/ingest/query", {
      method: "POST",
      body: JSON.stringify({ sql, params: params || [] })
    });
    const summary = data.truncated
      ? `(mostrando os primeiros 1000 de ${data.rowCount} resultados)\n`
      : `(${data.rowCount} linha${data.rowCount === 1 ? "" : "s"})\n`;
    return { content: [{ type: "text", text: summary + JSON.stringify(data.rows, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
