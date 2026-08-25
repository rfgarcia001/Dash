---
target: /impeccable critique
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-12T21-15-38Z
slug: src-components-dashboard-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Sincronização e carregamento estão visíveis, mas falta dizer qual métrica exige ação. |
| 2 | Match System / Real World | 3 | A linguagem é de tráfego pago, porém siglas como CPA, ROAS e IC não recebem contexto. |
| 3 | User Control and Freedom | 2 | Há limpar seleção do gráfico, mas os controles analíticos se repetem e não há um reset de visão claro. |
| 4 | Consistency and Standards | 2 | Média móvel aparece no cabeçalho e no gráfico; verde significa ação, seleção e desempenho positivo. |
| 5 | Error Prevention | 2 | O estado de erro instrui a tornar a planilha pública; intervalo de datas inválido não é prevenido. |
| 6 | Recognition Rather Than Recall | 3 | Rótulos e contexto de período estão presentes no desktop; no mobile os controles viram ícones. |
| 7 | Flexibility and Efficiency | 2 | Não há views salvas/atalhos; ordenação e expansão de tabelas não funcionam por teclado. |
| 8 | Aesthetic and Minimalist Design | 2 | O visual é coerente, mas nove cards e muitos controles competem antes de responder o que fazer. |
| 9 | Error Recovery | 2 | Há retry e explicação, mas a recuperação indicada enfraquece a privacidade dos dados. |
| 10 | Help and Documentation | 1 | Tooltips existem, porém não há ajuda contextual para métricas e critérios de leitura. |
| **Total** | | **22/40** | **Funcional, mas precisa de foco operacional** |

## Design Specificity Verdict

**LLM assessment:** a linguagem visual - marca Allevo, contraste escuro, verde de ação, dados de funil e livros - é reconhecível. A composição, porém, ainda é um template de dashboard: muitos cards de mesma importância e sparklines decorativos poderiam servir a qualquer operação de mídia. Falta uma camada que transforme a leitura em decisão de negócio.

**Deterministic scan:** detector sem achados no alvo `src/components/Dashboard.tsx` e também no escopo de layout `src` + `index.html`. Isso não contradiz a crítica: o problema não é uma infração de estilo detectável; é prioridade, semântica e fluxo de decisão.

**Visual overlays:** não há overlay confiável. A automação disponível permite apenas avaliação de leitura; não há injeção mutável de script. A página local carregou e apresentou os dados reais, então a leitura manual foi usada como sinal de fallback.

## Overall Impression

O painel parece profissional e transmite domínio dos dados, mas chega ao operador como uma parede de indicadores. Com ROAS de 0,71x, prejuízo e queda de receita já presentes, a primeira tela deveria conduzir para uma decisão, não pedir que a pessoa descubra onde está o incêndio.

## What's Working

- Contexto de projeto, período e última sincronização estão sempre próximos dos dados; isso reduz ambiguidade de leitura.
- O vocabulário de negócio é específico: investimento, CPA, ROAS, funil, criativos e fontes de venda fazem sentido para quem opera tráfego.
- Estados selecionados estão fortes e legíveis; o texto preto sobre o verde de ação resolveu o principal problema de contraste.

## Priority Issues

### [P1] A primeira tela não prioriza uma decisão

**Why it matters:** investimento, faturamento, CPA, ticket, lucro, vendas e ROAS recebem peso visual parecido. O usuário vê uma queda grande, mas não recebe uma hipótese ou próxima ação.

**Fix:** substituir a abertura genérica por um bloco compacto de situação operacional: por exemplo, "ROAS abaixo do equilíbrio" + as 2 causas mais prováveis, com links para Campanhas ou Criativos relevantes. Manter os cards como detalhe, não como resposta principal.

**Suggested command:** `$impeccable shape`

### [P1] Cabeçalho concentra escolhas demais e repete controle

**Why it matters:** três projetos, média móvel, comparação, período e sync competem no mesmo plano. A média móvel ainda reaparece em `DailyChartSection`, quebrando a expectativa de onde uma configuração vive.

**Fix:** deixar no topo apenas projeto, período e sync. Mover média móvel e comparação para uma barra de análise ao lado do gráfico, com estado explícito e sem duplicação.

**Suggested command:** `$impeccable distill`

### [P1] Tabelas de campanhas e criativos falham para teclado e comprimem a leitura no mobile

**Why it matters:** os cabeçalhos ordenáveis são `th` clicáveis e a linha expansível da campanha é um `tr` clicável. Isso não é acessível por teclado, não comunica ordenação e as 10+ colunas exigem rolagem lateral sem uma visão resumida.

**Fix:** usar botões reais dentro dos cabeçalhos com `aria-sort`; fazer a expansão por botão dedicado. Em telas pequenas, oferecer uma visão em cards ou seletor de colunas priorizando gasto, vendas, CPA e ROAS.

**Suggested command:** `$impeccable adapt`

### [P1] Recuperação de erro incentiva abrir a planilha ao público

**Why it matters:** o fluxo de erro sugere "Qualquer pessoa com o link". Isso contradiz a necessidade de controlar acesso ao dashboard e pode expor dados de negócio.

**Fix:** trocar a mensagem por um caminho administrativo seguro: conta de serviço/integração autorizada ou compartilhamento a um usuário técnico específico. Mostrar uma mensagem de indisponibilidade sem instruir a publicação.

**Suggested command:** `$impeccable harden`

### [P2] Semântica do verde e excesso de sinais visuais reduzem a leitura rápida

**Why it matters:** verde indica ação, aba selecionada, comparação ativa, ROAS e diversos badges; sparklines em quase todos os cards adicionam movimento visual, mas não ajudam a escolher onde agir.

**Fix:** reservar verde para ação e condição positiva. Usar uma cor neutra de seleção e manter sparklines apenas para métricas que ganham significado temporal imediato.

**Suggested command:** `$impeccable colorize`

## Persona Red Flags

**Alex (operador avançado):** para comparar rapidamente uma mudança de período e investigar o motivo, ele passa por controles duplicados e não pode salvar uma visão nem usar atalhos. O gráfico aceita apenas duas métricas selecionadas, mas o painel não explica por que essas duas foram escolhidas.

**Sam (usuário de teclado):** nas tabelas de Campanhas e Criativos, ordenação e expansão dependem de clique em `th` e `tr`; isso elimina uma parte do fluxo operacional. O modal de prévia também não declara um foco contido no código.

**Casey (usuário móvel):** projetos longos, filtros, comparação e sync disputam a faixa superior. Ao chegar às tabelas com muitas colunas, a informação mais importante fica distante numa rolagem horizontal.

## Minor Observations

- Validar `data final >= data inicial` antes de aplicar período personalizado.
- Explicar CPA, ROAS e IC por tooltip ou ajuda contextual curta.
- Mostrar versão/data de deploy discretamente para diferenciar cache antigo de tela atual.
- Os avisos do Recharts sobre largura/altura `-1` na inicialização merecem investigação, mesmo sem afetar a renderização final observada.

## Questions to Consider

- Qual decisão precisa sair da primeira tela em menos de 15 segundos: pausar gasto, realocar orçamento ou revisar criativo?
- Os usuários realmente precisam ver nove métricas antes de abrir o gráfico, ou quatro indicadores e uma recomendação bastam?
- O dashboard deve parecer uma central operacional com alertas, ou um relatório detalhado para análise posterior?
