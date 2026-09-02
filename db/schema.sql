-- Allevo Dashboard — schema Postgres
--
-- Fonte de verdade pros dados de campanha/venda quando DATABASE_URL está
-- setada (ver server.ts). A automação externa do usuário é responsável por
-- popular estas tabelas (mantém planilha e banco sincronizados); este app só
-- faz SELECT. NOT NULL nas colunas essenciais faz o papel que
-- filterRealProductSales/filterRealBuyerSales fazem hoje em JS pro Sheets —
-- não insere linha incompleta, não precisa filtrar de novo na leitura.
--
-- Rodar uma vez por ambiente: psql -f db/schema.sql
-- (ou: docker exec -i <container-postgres> psql -U allevo -d allevo < db/schema.sql)

CREATE TABLE IF NOT EXISTS meta_ads (
  id BIGSERIAL PRIMARY KEY,
  funnel_id TEXT NOT NULL,                 -- bate com o id do funil em data/funnels.json / SSM
  ad_date DATE NOT NULL,
  ad_id TEXT,                              -- ID numérico do anúncio na Meta, usado pra cruzar/evitar duplicar linha no reenvio via N8N; nulo pra linhas antigas migradas da planilha
  campaign_name TEXT NOT NULL DEFAULT '',
  adset_name TEXT NOT NULL DEFAULT '',
  ad_name TEXT NOT NULL DEFAULT '',
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0,
  landing_page_views INTEGER NOT NULL DEFAULT 0,
  initiate_checkout INTEGER NOT NULL DEFAULT 0,
  creative_thumb_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotente pra bancos que já tinham a tabela sem essa coluna (dev local).
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS ad_id TEXT;
CREATE INDEX IF NOT EXISTS meta_ads_funnel_date_idx ON meta_ads (funnel_id, ad_date);
-- Parcial: só exige unicidade quando ad_id vem preenchido (ingestão via API).
-- Protege contra duplicar o mesmo anúncio se o N8N reenviar/paginar duas vezes
-- dentro do mesmo lote, além da substituição do dia inteiro feita na ingestão.
CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_funnel_date_ad_uidx ON meta_ads (funnel_id, ad_date, ad_id) WHERE ad_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS buyers (
  id BIGSERIAL PRIMARY KEY,
  funnel_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('standard', 'fgp')),  -- 'fgp' -> "Dados dos Compradores - FGP" na resposta
  order_id TEXT,                           -- ID do pedido/transação na plataforma de checkout, usado pra evitar duplicar venda no reenvio via N8N; nulo pra linhas antigas migradas da planilha
  purchased_at TIMESTAMPTZ NOT NULL,       -- substitui Data/Data_Original/Data_Hora_Formatada/timestamp — derivados na leitura
  email TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  order_bump TEXT NOT NULL DEFAULT '',     -- '' pra funis fgp/paid-launch, igual comportamento atual
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotente pra bancos que já tinham a tabela sem essa coluna (dev local).
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS order_id TEXT;
CREATE INDEX IF NOT EXISTS buyers_funnel_date_idx ON buyers (funnel_id, purchased_at);
-- Parcial: só exige unicidade quando order_id vem preenchido (ingestão via API).
-- Linhas migradas da planilha sem order_id não competem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS buyers_funnel_order_uidx ON buyers (funnel_id, order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creatives (
  id BIGSERIAL PRIMARY KEY,
  funnel_id TEXT NOT NULL,
  creative_name TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  thumb_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creatives_funnel_idx ON creatives (funnel_id);
-- Idempotente: descarta duplicatas (funnel_id, creative_name) de antes desta
-- constraint existir, mantendo a linha mais recente — senão o índice único
-- abaixo falha ao criar.
DELETE FROM creatives a USING creatives b
WHERE a.funnel_id = b.funnel_id AND a.creative_name = b.creative_name AND a.id < b.id;
-- Upsert por nome na ingestão via API: cada rodada do N8N só enxerga os
-- anúncios ativos naquela janela, então nunca pode apagar criativos vistos
-- em rodadas anteriores — mesmo comportamento do "Append or Update" por
-- "Nome Criativo" que a planilha já fazia.
CREATE UNIQUE INDEX IF NOT EXISTS creatives_funnel_name_uidx ON creatives (funnel_id, creative_name);

-- Login via Google OAuth (ver GOOGLE_CLIENT_ID em server.ts): quem pode
-- entrar no dashboard, gerenciado pela tela de admin (não mais editando
-- DASHBOARD_ALLOWED_EMAILS/DOMAINS na mão). Basic Auth continua existindo em
-- paralelo pra automação/scripts — essa tabela só afeta o login humano via
-- Google.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  added_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
