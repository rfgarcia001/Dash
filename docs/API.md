# API de Ingestão — Allevo Dashboard

Documentação de referência da API que automações externas (hoje, N8N) usam
pra alimentar o Postgres que serve o dashboard na VPS. O dashboard só faz
`SELECT` nessas tabelas — quem escreve é sempre uma automação, nunca o app.

> Escopo: só o ambiente da VPS (`rfgarcia001/Dash`). O ambiente AWS
> (`quero-edu/Allevo-Dashboard`) continua lendo do Google Sheets e não usa
> essa API — ver roadmap interno pra planos de convergência futura.

## Por que essa API existe

Antes, o dashboard lia tudo direto do Google Sheets a cada carregamento —
frágil (parsing manual de XML, rate limit do Google, nomes de aba por
heurística) e sempre um pouco atrasado (dependia de uma automação separada
escrever na planilha primeiro). Migramos a fonte de dados pra Postgres e
criamos esta API pra que a mesma automação que já existe (N8N) escreva
direto no banco — sem a planilha no meio do caminho pro dashboard, e com
dado quase em tempo real em vez de esperar o próximo carregamento.

## Autenticação

Todo endpoint desta API espera um header:

```
X-Ingest-Token: <token>
```

Esse token é **diferente** do usuário/senha do dashboard — aquele é
credencial de humano navegando no browser (Basic Auth), este é credencial
de automação. Guarde como credencial no N8N (Header Auth), nunca em texto
puro no workflow.

Duas formas de gerar esse token, em paralelo:

- **API Key pela tela do dashboard** (recomendado): "Gerenciar Acessos" →
  aba "API Keys" → "Criar API Key". Só aparece uma vez, na criação; revoga
  individualmente sem precisar reiniciar o servidor.
- **`INGEST_API_TOKEN`** (env var, legado): token único fixo configurado
  no servidor, acesso de emergência/fallback.

Sem o header certo: `401`. Sem nenhum token configurado (nem
`INGEST_API_TOKEN` nem uma API Key ativa) e sem `DATABASE_URL`: `503`.

## `funnelId`

Todo endpoint (exceto a listagem) precisa de um `funnelId` — o identificador
do funil já cadastrado no dashboard. Descubra o valor certo com:

```
GET /api/ingest/funnels
```

Se o funil ainda não existe, cadastre primeiro pela tela "Novo funil" no
dashboard (pode ser sem link de planilha — a fonte agora é o banco) antes
de configurar a automação.

---

## Endpoints

| Método | Caminho | Pra quê |
|---|---|---|
| `GET` | `/api/ingest/funnels` | Listar `funnelId` válidos |
| `POST` | `/api/ingest/meta` | Gravar gasto/métricas de anúncio de um dia |
| `POST` | `/api/ingest/vendas` | Gravar uma venda |
| `POST` | `/api/ingest/criativos` | Gravar nome/link/thumbnail de um criativo |

---

### `GET /api/ingest/funnels`

**Caso de uso:** antes de configurar uma automação nova, descobrir o
`funnelId` exato sem precisar abrir o dashboard ou pedir pra outra pessoa.

**Request:** sem corpo, só o header de autenticação.

**Response:**
```json
{
  "funnels": [
    { "id": "estrategia", "name": "Livro Estratégia em Ação" },
    { "id": "gestao-ia", "name": "Livro Gestão de Projetos com IA" }
  ]
}
```

**Erros:** `401` token inválido/ausente · `503` ingestão desligada no
servidor.

---

### `POST /api/ingest/meta`

**Caso de uso:** a automação do N8N roda a cada 30 minutos, puxa
gasto/impressões/cliques do dia atual direto da API do Meta Ads, e
sincroniza com o Postgres. O dashboard mostra o gasto de hoje quase em
tempo real, sem depender de uma rotina de planilha rodando à noite.

**Comportamento:** cada chamada **substitui o dia inteiro** daquele funil
(apaga e regrava as linhas de `date`) — reenviar o mesmo dia não duplica.
Dentro do lote, cada linha faz upsert por `adId` — o mesmo anúncio
aparecendo duas vezes na mesma chamada não vira duas linhas.

**Request:**
```json
{
  "funnelId": "estrategia",
  "date": "2026-09-01",
  "rows": [
    {
      "adId": "120248842417980056",
      "campaignName": "[MARIO][PERPÉTUO][LIVRO][ESTRATÉGIA EM AÇÃO][PMO&VMO] [1]",
      "adsetName": "[AD026-030] [ADV+Aberto]",
      "adName": "[AD029] [IMG] [VD] [PMO&VMO] [PERPÉTUO]",
      "spend": 48.49,
      "impressions": 2019,
      "linkClicks": 26,
      "landingPageViews": 23,
      "initiateCheckout": 0,
      "creativeThumbUrl": ""
    }
  ]
}
```

| Campo | Tipo | Obrigatório | Se ausente |
|---|---|---|---|
| `funnelId` | string | sim | — |
| `date` | string `YYYY-MM-DD` | sim | — |
| `rows` | array (pode ser `[]`) | sim | — |
| `rows[].adId` | string | recomendado (chave de dedup) | sem proteção contra duplicata no lote |
| `rows[].campaignName` / `adsetName` / `adName` | string | não | `""` |
| `rows[].spend` / `impressions` / `linkClicks` / `landingPageViews` / `initiateCheckout` | number | não | `0` |
| `rows[].creativeThumbUrl` | string | não | `""` |

**Response:**
```json
{ "ok": true, "funnelId": "estrategia", "date": "2026-09-01", "processed": 1 }
```
`processed` é quanto veio no lote, não necessariamente quanto ficou
gravado (linhas com `adId` repetido se sobrescrevem).

**Erros:** `400` campo inválido · `401` · `404` funil não cadastrado ·
`503`.

---

### `POST /api/ingest/vendas`

**Caso de uso:** toda vez que uma venda é aprovada numa plataforma de
checkout (Eduzz, hoje), um webhook dispara na hora — a venda aparece no
dashboard segundos depois, sem esperar a próxima sincronização em lote.

**Comportamento:** upsert por `(funnelId, orderId)` — reenviar o mesmo
`orderId` **atualiza** a linha, nunca duplica a venda.

**Request:**
```json
{
  "funnelId": "estrategia",
  "bucket": "standard",
  "rows": [
    {
      "orderId": "102130424",
      "purchasedAt": "2026-09-01T22:22:51.000Z",
      "email": "compradora@example.com",
      "amount": 47.00,
      "utmCampaign": "[MARIO][PERPÉTUO][LIVRO][ESTRATÉGIA EM AÇÃO]",
      "utmSource": "trafego",
      "utmMedium": "[AD046-048] [ADV MixIG]",
      "utmTerm": "120248843144460056",
      "utmContent": "[AD048] [VDO] [VD] [PMO&VMO] [PERPÉTUO]",
      "product": "Livro Digital Estratégia em Ação: PMOs & VMOs",
      "orderBump": ""
    }
  ]
}
```

| Campo | Tipo | Obrigatório | Se ausente |
|---|---|---|---|
| `funnelId` | string | sim | — |
| `bucket` | `"standard"` \| `"fgp"` | não | `"standard"` |
| `rows` | array (pode ser `[]`) | sim | — |
| `rows[].orderId` | string | recomendado (chave de dedup) | sem proteção contra duplicata |
| `rows[].purchasedAt` | ISO 8601 **com timezone** | **sim** | — |
| `rows[].email` | string | **sim** | — |
| `rows[].amount` | number | não | `0` |
| `rows[].utmCampaign` / `utmSource` / `utmMedium` / `utmTerm` / `utmContent` | string | não | `""` |
| `rows[].product` / `orderBump` | string | não | `""` |

**Response:**
```json
{ "ok": true, "funnelId": "estrategia", "bucket": "standard", "processed": 1 }
```

**Erros:** `400` (mensagem cita o `orderId` da linha problemática) · `401`
· `404` · `503`.

---

### `POST /api/ingest/criativos`

**Caso de uso:** depois que um criativo novo entra no ar no Meta Ads
Manager, a automação detecta e envia nome/link/thumbnail pro banco — a aba
de criativos do dashboard atualiza sozinha, sem copiar link do Instagram
manualmente.

**Comportamento:** upsert por `(funnelId, creativeName)` — nunca apaga,
só adiciona/atualiza. Sem dimensão de data (criativo não muda por dia); a
origem (Meta Ads) só devolve os anúncios ativos numa janela recente, então
um "substituir tudo" apagaria criativos antigos ainda relevantes.

**Request:**
```json
{
  "funnelId": "estrategia",
  "rows": [
    {
      "creativeName": "AD029",
      "link": "https://instagram.com/p/xyz",
      "thumbUrl": "https://scontent.xx.fbcdn.net/.../thumb.jpg"
    }
  ]
}
```

| Campo | Tipo | Obrigatório | Se ausente |
|---|---|---|---|
| `funnelId` | string | sim | — |
| `rows` | array (pode ser `[]`) | sim | — |
| `rows[].creativeName` | string | **sim** (linha sem ele é ignorada) | — |
| `rows[].link` / `thumbUrl` | string | não | `""` |

**Response:**
```json
{ "ok": true, "funnelId": "estrategia", "processed": 1 }
```

**Erros:** `400` · `401` · `404` · `503`.

---

## Fluxo completo (exemplo: Meta Ads)

```
Schedule Trigger (N8N, a cada 30 min)
  → Meta Ads Insights API (busca dados do dia)
  → Code node: agrupa por anúncio, calcula métricas
  → POST /api/ingest/meta (esta API)
  → Postgres (meta_ads)
  → Dashboard lê via SELECT, mostra gasto quase em tempo real
```

O mesmo padrão se repete pras vendas (webhook em vez de schedule) e pros
criativos (schedule diário).

## Testando com curl

```bash
curl -X POST https://<host>/api/ingest/meta \
  -H "X-Ingest-Token: $INGEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"funnelId":"estrategia","date":"2026-09-01","rows":[{"adId":"TESTE-1","campaignName":"Teste","spend":10}]}'
```

## Ver também

- `docs/ingest-api.md` — contrato técnico enxuto (mesma informação, formato
  mais direto pra consulta rápida durante o desenvolvimento).
- `docs/ingest-api-vps.local.md` (não versionado) — valores reais da VPS
  (URL, token, IDs de funil) pra colar direto no N8N.
