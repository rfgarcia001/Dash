# API de ingestão (N8N → Postgres)

Três endpoints: Meta Ads, Vendas e Criativos. Cada um grava direto nas
tabelas do Postgres (`db/schema.sql`) — o dashboard só faz `SELECT` nelas,
nunca escreve.

Só funcionam quando o servidor tem `DATABASE_URL` **e** `INGEST_API_TOKEN`
configuradas (ver `.env.example`). Sem isso, ambos respondem `503`.

## Autenticação

Header em toda requisição:

```
X-Ingest-Token: <valor de INGEST_API_TOKEN>
```

Não é o usuário/senha do dashboard (`DASHBOARD_PASSWORD`) — é um token
separado, só pra automação. Guardar como credencial no N8N (não em texto
puro no workflow).

## `funnelId`

Todo envio precisa do `funnelId` do funil já cadastrado no dashboard. Se o
funil ainda não existe, cadastre primeiro pela tela "Novo funil" (pode ser
sem link de planilha, já que a fonte agora é o banco) e pegue o `id` gerado
ali antes de configurar a automação no N8N.

---

## `GET /api/ingest/funnels`

Lista os `funnelId` válidos — pra quem está montando a automação consultar
sem precisar da senha do dashboard (aquela é credencial de humano, essa é
de automação, mesmo `X-Ingest-Token` dos outros endpoints).

### Response

```json
{
  "funnels": [
    { "id": "estrategia", "name": "Livro Estratégia em Ação" },
    { "id": "gestao-ia", "name": "Livro Gestão de Projetos com IA" }
  ]
}
```

Erros: `401` (token inválido/ausente), `503` (ingestão desabilitada no
servidor).

---

## `POST /api/ingest/meta`

Cada requisição substitui **o dia inteiro** daquele funil — se reenviar o
mesmo `date`, apaga e regrava as linhas desse dia. Além disso, cada linha
faz upsert por `adId`: se o mesmo anúncio aparecer duas vezes no mesmo lote
(ex.: paginação duplicada na origem), a segunda atualiza a primeira em vez
de duplicar. Sempre mande `adId` (o ID numérico do anúncio na Meta) — é a
chave que garante isso.

### Request

```json
{
  "funnelId": "iadz",
  "date": "2026-08-26",
  "rows": [
    {
      "adId": "120211234567890123",
      "campaignName": "IADZ - Prospecção",
      "adsetName": "Interesses - IA",
      "adName": "Criativo 03 - Depoimento",
      "spend": 452.30,
      "impressions": 18200,
      "linkClicks": 340,
      "landingPageViews": 290,
      "initiateCheckout": 12,
      "creativeThumbUrl": "https://.../thumb.jpg"
    }
  ]
}
```

`adId` é fortemente recomendado (ver acima); os demais campos de `rows[]`
são opcionais individualmente (viram `0`/`""` se ausentes), mas `funnelId`,
`date` e `rows` (mesmo vazio, `[]`) são obrigatórios.

### Response

```json
{ "ok": true, "funnelId": "iadz", "date": "2026-08-26", "processed": 1 }
```

`processed` é quantas linhas vieram no request, não quantas linhas ficaram
gravadas — se duas linhas do lote tiverem o mesmo `adId`, uma sobrescreve a
outra e o total gravado é menor que `processed`.

Erros: `400` (funnelId/date/rows inválido), `404` (funil não cadastrado),
`503` (ingestão desabilitada no servidor).

---

## `POST /api/ingest/vendas`

Upsert por `(funnelId, orderId)` — reenviar o mesmo `orderId` **atualiza**
a linha em vez de duplicar a venda. Linhas sem `orderId` são só inseridas
(sem proteção contra duplicata); pra automação nova, sempre mande o
`orderId` do pedido/transação da plataforma de checkout.

### Request

```json
{
  "funnelId": "iadz",
  "bucket": "standard",
  "rows": [
    {
      "orderId": "TXN-88213",
      "purchasedAt": "2026-08-26T18:41:00-03:00",
      "email": "compradora@example.com",
      "amount": 197.00,
      "utmCampaign": "iadz-prospeccao",
      "utmSource": "facebook",
      "utmMedium": "cpc",
      "utmTerm": "",
      "utmContent": "criativo-03",
      "product": "IADZ - Ingresso",
      "orderBump": "Bônus Acelerador"
    }
  ]
}
```

- `bucket`: `"standard"` (padrão, se omitido) ou `"fgp"` — bate com as duas
  abas de compradores que o dashboard já mostra hoje
  ("Dados dos Compradores" / "Dados dos Compradores - FGP"). Funis
  `paid-launch`/`perpetual-launch` normalmente só usam `"fgp"`; funis padrão
  usam `"standard"`.
- `purchasedAt`: qualquer string ISO 8601 que o `Date` do JS reconheça
  (`"2026-08-26T18:41:00-03:00"` ou `"2026-08-26T21:41:00Z"`) — mandar com
  timezone explícito, não confiar em horário "sem fuso".
- `email` e `purchasedAt` são obrigatórios por linha; `orderId` é fortemente
  recomendado (ver acima).

### Response

```json
{ "ok": true, "funnelId": "iadz", "bucket": "standard", "processed": 1 }
```

Erros: `400` (funnelId/rows/email/purchasedAt inválido — a mensagem cita o
`orderId` da linha problemática, se houver), `404` (funil não cadastrado),
`503` (ingestão desabilitada no servidor).

---

## `POST /api/ingest/criativos`

Sem dimensão de data — criativo não muda por dia. Upsert por
`(funnelId, creativeName)`: reenviar o mesmo nome atualiza `link`/`thumbUrl`,
nunca apaga. Igual ao "Append or Update" por nome que a aba "Link Criativos"
já faz hoje na planilha — importante porque a origem (Meta Ads) normalmente
só retorna os anúncios ativos numa janela recente, então um "substituir
tudo" apagaria criativos antigos ainda relevantes.

### Request

```json
{
  "funnelId": "iadz",
  "rows": [
    {
      "creativeName": "AD029",
      "link": "https://instagram.com/p/xyz",
      "thumbUrl": "https://scontent.xx.fbcdn.net/.../thumb.jpg"
    }
  ]
}
```

`creativeName` é obrigatório por linha (linha sem ele é ignorada); `link` e
`thumbUrl` são opcionais (viram `""` se ausentes).

### Response

```json
{ "ok": true, "funnelId": "iadz", "processed": 1 }
```

Erros: `400` (funnelId/rows inválido), `404` (funil não cadastrado), `503`
(ingestão desabilitada no servidor).

---

## `POST /api/ingest/query`

Consulta somente-leitura no Postgres — pensada pro MCP server em
`mcp-server/` (Claude conversando direto com o banco), mas qualquer cliente
com o token pode usar.

**Segurança:** roda dentro de uma transação com `SET TRANSACTION READ ONLY`
— o Postgres recusa qualquer escrita por conta própria (mesmo uma
disfarçada de CTE, tipo `WITH x AS (DELETE ... RETURNING *) SELECT * FROM x`),
não depende só do filtro de texto (`;` proibido, precisa começar com
`SELECT`/`WITH`).

### Request

```json
{
  "sql": "SELECT funnel_id, sum(spend) FROM meta_ads WHERE ad_date >= $1 GROUP BY funnel_id",
  "params": ["2026-08-25"]
}
```

- `sql`: uma instrução só, sem `;`, começando com `SELECT` ou `WITH`.
- `params`: opcional, parâmetros posicionais (`$1`, `$2`...).

### Response

```json
{ "ok": true, "rowCount": 4, "rows": [ { "funnel_id": "estrategia", "sum": "327.64" } ], "truncated": false }
```

`rows` corta em 1000 linhas (`truncated: true` se cortou).

**Erros:** `400` (sql inválido/ausente, `;` usado, ou tentativa de escrita
— o Postgres rejeita e a mensagem vem dele) · `401` · `503`.

---

## Testando com curl

```bash
curl -X POST https://<host>/api/ingest/meta \
  -H "X-Ingest-Token: $INGEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"funnelId":"iadz","date":"2026-08-26","rows":[{"campaignName":"Teste","spend":10}]}'

curl -X POST https://<host>/api/ingest/vendas \
  -H "X-Ingest-Token: $INGEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"funnelId":"iadz","rows":[{"orderId":"TESTE-1","purchasedAt":"2026-08-26T12:00:00-03:00","email":"teste@example.com","amount":1}]}'

curl -X POST https://<host>/api/ingest/criativos \
  -H "X-Ingest-Token: $INGEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"funnelId":"iadz","rows":[{"creativeName":"AD029","link":"https://instagram.com/p/xyz","thumbUrl":"https://example.com/thumb.jpg"}]}'
```
