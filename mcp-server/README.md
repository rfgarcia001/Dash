# allevo-dashboard-mcp

MCP server que expõe consulta somente-leitura ao Postgres do Allevo
Dashboard (VPS) direto no Claude Code, sem precisar de SSH nem credencial
de banco na máquina local.

Fala com o próprio app via os endpoints `/api/ingest/*` já existentes
(`server.ts`), usando o mesmo `X-Ingest-Token` — não guarda `DATABASE_URL`
nem nada de Postgres aqui.

## Ferramentas

- `list_funnels` — lista os `funnelId` válidos.
- `get_schema` — descreve as tabelas (`meta_ads`, `buyers`, `creatives`).
- `query_sql` — roda uma consulta `SELECT` (ou `WITH ... SELECT`) somente-
  leitura. O servidor garante isso com `SET TRANSACTION READ ONLY` dentro
  da transação — mesmo uma escrita disfarçada de CTE é recusada pelo
  Postgres, não só filtrada por texto.

## Instalar dependências

```bash
cd mcp-server
npm install
```

## Registrar no Claude Code

```bash
claude mcp add allevo-dashboard --scope user \
  -e ALLEVO_API_URL=http://<host-da-vps>:8088 \
  -e ALLEVO_INGEST_TOKEN=<mesmo INGEST_API_TOKEN do servidor> \
  -- node "$(pwd)/index.mjs"
```

Feche e abra uma sessão nova do Claude Code pra ele registrar.

## Rodar sozinho (debug)

```bash
ALLEVO_API_URL=http://localhost:3000 ALLEVO_INGEST_TOKEN=... node index.mjs
```

Fala stdio (protocolo MCP) — não é pra rodar direto no terminal esperando
output legível, é pra um cliente MCP (Claude Code, ou um script de teste
com `@modelcontextprotocol/sdk/client`) se conectar.
