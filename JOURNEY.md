# Jornada — do plano ao estado atual

Retrospectiva de como este projeto saiu de "3 specs herdadas + um protótipo HTML" para o estado atual. Não é changelog — é o porquê das principais mudanças de rumo, para quem chegar depois e se perguntar "por que não seguiram a spec original à risca".

## 1. Ponto de partida

A pasta tinha: um protótipo HTML de ~8500 linhas em uso real (`gerador_de_itens-2.html`), três specs (SPEC-01/02/03) desenhando uma reescrita em Java/Spring Boot + MongoDB + multi-tenant no backend e React/SVG manual no frontend, e um `CONTEXTO-E-ARQUITETURA.md` referenciado por todas as specs que nunca existiu.

Primeira decisão, antes de qualquer código: perguntar ao usuário sobre "grafiphy" (menção sem contexto) em vez de adivinhar. Virou pesquisa real — Graphify é um projeto open-source de knowledge graph para código, viável de integrar depois (§8 abaixo).

## 2. A virada de arquitetura

A pergunta certa não era "como implementamos SPEC-01/02/03", era "o que dessas specs continua certo se a stack mudar". Resposta, validada com o usuário: os **princípios de mecanismo** (config-driven, proveniência, prontidão, derivação determinística, falhar alto) são independentes de linguagem. A parte pesada (Spring, Mongo, multi-tenant) resolvia um problema — multi-tenancy de SaaS — que este projeto não tem, porque é uma ferramenta local com estado em git, não um serviço hospedado.

Isso permitiu TypeScript de ponta a ponta, o que por sua vez eliminou o maior risco estrutural do plano original: duas implementações do avaliador de condições (Java + TS) que precisavam ficar sincronizadas via fixture compartilhada. Com um runtime só, essa categoria inteira de bug deixou de poder existir.

## 3. MVP1–3: motor, canvas, derivação

Construídos na ordem do plano, sem surpresa grande — as fixtures compartilhadas (`fixtures/*.json`, herdadas das specs originais) validaram o engine sem precisar reinventar casos de teste. O ponto de atenção real foi a direção do grafo de dependências: o `caminho` de um ciclo reportado precisa seguir a referência **como declarada** (`a depende de b, que depende de c, que depende de a` → `[a,b,c,a]`), não a ordem de precedência de execução — são grafos diferentes por baixo (`grafoReferencia` vs `grafoPrecedencia` em `dependencias.ts`), e só a fixture de ciclo indireto de três expôs a diferença.

## 4. O primeiro pedido de correção de rumo

Depois do MVP2 rodando, três coisas vieram juntas do usuário:

1. "O original ainda tem mais especificidade" — o config de exemplo tinha ficado raso de propósito (provar a genericidade do mecanismo primeiro), mas isso significava perder riqueza real do protótipo.
2. **Ideia nova**: base de conhecimento de stack por time, para não reconfigurar "esse serviço é Java" toda vez.
3. Faltavam tipos de nó/aresta do protótipo (só tinha 3 tipos; o legado tinha 11) e conexão só de um lado do nó (o legado permitia os 4 lados).

A resposta a (2) foi reaproveitar o mecanismo de `default` que já existia (SPEC-05 §2) em vez de inventar um conceito novo — decisão que só ficou óbvia depois de mapear que "sugestão que precisa de um clique para virar valor real" já era exatamente o comportamento certo. (3) virou a expansão de `diagrama.example.json` para os 11 tipos com cores e handles nos 4 lados.

## 5. Testes: de "não consigo ver funcionando" a pegar bugs reais

Depois de reportar que não tinha como verificar visualmente (sem ferramenta de browser no ambiente), o usuário perguntou se dava pra construir testes. A resposta foi em duas camadas: componente (Vitest + Testing Library, rápido, sem browser) e E2E real (Playwright, que eu mesmo consigo rodar e tirar screenshot). As duas camadas pagaram a pena rápido:

- O primeiro E2E pegou um bug de verdade no primeiro try: `border` (shorthand) misturado com `borderLeft` (não-shorthand) no mesmo objeto de estilo — React avisa isso como conflito, e o teste falhou por causa do warning no console, não por asserção de UI.
- Meses (na verdade, iterações) depois, ao escrever o E2E do Kafka, apareceu um bug de produto real: **não existia como criar uma aresta do tipo "consome"** — toda conexão nascia com o tipo default da regra (`publica`), e não havia UI para trocar. O `definirTipoAresta` já existia no hook desde o início mas nunca tinha sido exposto em nenhum painel. Corrigido com um `EdgePanel` novo.
- O mesmo teste expôs nós se sobrepondo (posição de criação era aleatória) — trocado por layout em grade determinístico.

Isso é o argumento mais forte, feito na prática, para por que "escrever o teste" não é burocracia neste projeto: nenhuma leitura de código teria achado o bug do tipo de aresta — só tentar *usar* a conexão do jeito que um usuário real usaria (arrastar de um serviço até uma fila esperando modelar consumo) expôs que o caminho não existia.

## 6. Graphify: ferramenta real, mal-entendido resolvido cedo

Perguntado se o Graphify "roda sozinho" — não, é invocado (CLI ou skill), não observa arquivos. Instalado (Python + uv + `graphifyy`) e registrado como skill global nesta máquina. A extração `--code-only` (sem LLM, só AST) já rodou várias vezes ao longo da sessão para manter o grafo deste próprio repositório atualizado — mas isso é meta (o grafo *deste* projeto, útil pra navegação futura), diferente do MVP5 (usar Graphify para importar *outros* projetos), que continua desenhado e não implementado (SPEC-06 §5).

## 7. Escopo que cresceu por pedido explícito, não por iniciativa própria

Depois do MVP4 (CLI + skill), vieram em sequência: Docker (arquivos prontos, build não validado — sem Docker nesta máquina), o sistema de regras/refinamento técnico completo (achado ao investigar o protótipo legado mais a fundo — a aba `rules` que gerava "preview do prompt" por atividade, provavelmente o valor central da ferramenta original), e os 8 schemas de tecnologia restantes (Kafka, Mongo, SQL, Camunda, FICO, API Externa, Job, Regra). Cada um desses foi um pedido direto, não uma extrapolação — a disciplina de não "melhorar" além do pedido (SPEC-01 §14) foi mantida mesmo com o escopo crescendo rápido.

Um reforço de proteção veio junto: o validador ganhou checagem de `when.field` contra as chaves reais do spec (não existia antes) — investimento feito **antes** de escrever ~40 campos condicionais novos, porque um typo silencioso nessa escala seria caro de achar depois. Validou zero erros na primeira tentativa.

## 8. Estado no fim desta sessão

Feito: engine completo e testado (64 testes), canvas com os 11 tipos e handles nos 4 lados, painel de propriedades genérico com proveniência e N/A, derivação + revisão + export (.md/.csv, com refinamento técnico opcional), perfil de stack por time, CLI empacotado (incluindo `import-graphify`), skill do Claude Code funcional ponta a ponta, Docker validado, specs revisadas.

Aberto, na ordem que faz sentido atacar:
1. ~~UI do checklist de refinamento técnico dentro do `ReviewScreen`~~ — feito.
2. Validar `docker compose up --build` numa máquina com Docker — feito, funcionou de primeira.
3. ~~Rodar uma quebra real em pelo menos um dos 8 domínios novos~~ — feito para todos os 8, com quebras salvas em `exemplos/`.
4. ~~MVP5 — import do Graphify (SPEC-06 §5), agora com os schemas validados por uso real~~ — feito.
5. "Base de padrões" (SPEC-07) — deliberadamente adiado: seu próprio critério de gate pede um corpus maior de quebras reais do que os 3 salvos em `exemplos/` até agora.

## 9. O que a validação real (§8.3) encontrou — e por que isso valida o método

Rodar três quebras reais (Rabbit/pagamentos, Kafka/portabilidade, e um fluxo de crédito cobrindo Mongo/SQL/Camunda/FICO/API-Externa/Job/Regra de uma vez) achou **cinco bugs reais**, nenhum deles visível por leitura de código:

1. Exchange herdando checklist de fila (DLQ/idempotência não fazem sentido para uma exchange) — contexto compartilhado demais entre os dois tipos.
2. `specResumo` calculado e nunca exibido em lugar nenhum (`.md`, `.csv`, `ReviewScreen`).
3. Coluna "Times" ausente no `.md` exportado, presente só na UI.
4. **O mais sério**: `specResumo` estava hardcoded para os nomes de campo do Rabbit (`dlq`/`retries`/`ack`) dentro do `derive.ts` — Kafka, que não tem nenhum desses campos, sempre saía com resumo vazio. Corrigido movendo para `NodeTypeConfig.specResumo`/`specResumoPorAresta`, configurável por tipo.
5. **O maior de todos**: `derive.ts` só sabia gerar atividade para arestas `publishes`/`consumes`. Um fluxo real de orquestração (Camunda → FICO → API externa, com escrita em SQL/Mongo e uso de uma regra de negócio) tem *seis* relacionamentos reais entre nós — e nenhum deles é mensageria. Todos os seis desapareciam do backlog silenciosamente. Generalizado via `EdgeTypeConfig.verbo`/`tamanhoPadrao`/`gerarAtividade`, preservando a compatibilidade exata da fixture 01 (`e1::publish`, não `e1::publishes`) via um mapa de sufixo legado.

Também: `fico`, `external`, `job` e `rule` não tinham nenhuma pergunta sobre "isso já existe, o que muda" — diferente de rabbit/kafka/mongo/sql/camunda, que todos perguntam. Adicionado `migracao` aos quatro.

Nenhum desses bugs foi encontrado revisando o schema ou os testes unitários — todos exigiram montar uma quebra plausível e realmente rodar `derive`. É a confirmação mais direta possível de que o critério de SPEC-04 §8 ("rodar uma quebra real", não "revisar o JSON") era o critério certo desde o início.

## 10. MVP5 (import do Graphify): o desenho original não sobreviveu ao primeiro contato com dado real

SPEC-06 §5 desenhava o import do Graphify em cima de uma suposição nunca verificada: que o grafo do Graphify anota cada nó com um "tipo de entidade" semântico, mapeável para os `nodeTypes` do `diagrama.json`. Antes de escrever qualquer código, o `graphify-out/graph.json` real deste próprio repositório foi lido — e essa suposição era falsa. O Graphify produz grafo no formato node-link do NetworkX (`nodes`/`links`/`hyperedges`) sem campo de tipo de entidade nenhum; as arestas (`relation`) são relações de **estrutura de código** (`contains`, `extends`, `imports`, `imports_from`, `references`, `re_exports`, `calls`), não de arquitetura. Mapear isso para `publica`/`consome`/`chama` teria sido inventar uma correspondência inexistente nos dados — exatamente o tipo de "inferência silenciosa" que o resto do sistema (proveniência, N/A com motivo, `naoMapeados`) existe para evitar.

O desenho foi refeito antes de implementar: mapeamento por **padrão de caminho de arquivo** (regex ordenada, primeira que bate vence), gerando só nós `status: "existente"` — nunca arestas. Arquivo sem regra que bate vai para uma lista `naoMapeados` explícita, nunca vira nó com tipo chutado.

Validado contra o `graphify-out/graph.json` real deste repositório (562 nós de código via AST): das regras de exemplo (pensadas para repositórios de serviço com pastas `controllers/`, `rabbit/`, `migrations/`), só 1 de 68 arquivos casou — o repo é a própria ferramenta, não um serviço de domínio, então é o resultado esperado. O comando não travou nem adivinhou nada para os outros 67; listou todos. 6 testes novos de `importarGrafo.ts` mais a suíte inteira (64 do engine, 20 do web, 4 E2E do Playwright) seguem verdes.

Mesma lição do §9: verificar contra dado real antes de implementar — não só depois — evitou construir em cima de uma suposição errada sobre um formato de dado externo.

## 11. Onboarding, tour guiado, e "pacote de implementação" — fechando o ciclo até o dev

Pedido explícito: a ferramenta precisava deixar claro, na própria jornada, que é mais do que "gerar prompt" — e precisava de algo útil pra ajudar no desenvolvimento em si, não só no planejamento. Três entregas:

1. **Jornada + cenários prontos**: modal "Como funciona" com os 5 passos do mecanismo (diagrama → prontidão → derivar → revisão → saídas) e o "para que serve" de cada saída (`.md`, `.csv`, refinamento técnico), mais um seletor de 10 cenários prontos (um por tipo de nó restante — mongo/sql/camunda/fico/external/job/rule — além de rabbit/kafka/crédito-completo), todos validados via `derive` real antes de entrarem no repositório.
2. **Tour guiado de 1 clique**: em vez de um tutorial estático, um walkthrough de 8 passos que dirige o app de verdade (carrega um cenário, seleciona um nó, deriva) com spotlight sobre o elemento real da UI em cada passo. QA visual (screenshot real, não só asserção de texto) achou um bug que a suíte E2E original não pegava: o passo que deveria destacar o painel de propriedades caiu num fallback silencioso de tela cheia porque o atributo `data-tour` do painel principal nunca foi de fato aplicado (um `replace_all` anterior reportou sucesso mas só bateu 2 das 3 ocorrências no arquivo). Corrigido, e os testes E2E passaram a checar a existência do próprio seletor-alvo de cada passo, não só texto próximo — mesma lição de sempre: o que a suíte não verifica, ela não protege.
3. **Pacote de implementação** (`gerador implementar <quebra> <chave-ou-rótulo>`, e o mesmo botão na revisão do app web): a especificação completa dos nós de uma atividade — não só o `specResumo` resumido da tabela — mais o refinamento técnico, num único bloco de markdown pronto pra copiar. Para atividades de aresta, mostra origem e destino nessa ordem (a chave da atividade só guarda o nó de origem; o destino, que carrega o `specResumo` e normalmente é o dado mais rico, precisava ser resolvido explicitamente via a aresta). Construir isso expôs um bug latente e mais sério: `calcularProntidao` e a nova função liam `no.specNA[chave]` sem guarda — e o fixture mais antigo do repositório (`01-servico-novo-fila-consumo.json`, em uso desde o início do projeto) tem nós sem a chave `specNA` de jeito nenhum, não só vazia. Qualquer `quebra.json` editado à mão ou vindo de fora (import futuro, integração externa) sem essa chave quebraria a prontidão na cara do usuário. Corrigido com `no.specNA?.[chave]` nos dois lugares, com teste de regressão dedicado.

O achado do specNA reforça um padrão que já apareceu nesta jornada (§9, §10): a diferença entre "os testes passam" e "o código está correto" costuma estar exatamente nos dados que ninguém pensou em testar — um fixture antigo, um campo que a UI sempre preenche mas o schema não obriga.

## 12. Feedback de uso real: conexão errada, compor cenários, contrato de dados, config presa no bundle

Depois de usar a ferramenta de verdade (não só rodar testes), o usuário trouxe quatro problemas numa mensagem só — todos legítimos, nenhum cosmético.

**Conexão ainda errada nos exemplos prontos.** O conserto anterior (§ desta sessão, arestas criadas por drag) só cobria arestas que passavam pelo evento real do React Flow. Arestas *carregadas* de um `quebra.json` — inclusive todos os 10 cenários de demo — nunca tinham `sourceHandle`/`targetHandle` gravados, então caíam no mesmo bug de sempre ancorar no handle do topo. Corrigido generalizando: `Canvas.tsx` agora calcula um handle padrão a partir da posição relativa dos dois nós (direita/esquerda se o deslocamento horizontal for maior, cima/baixo caso contrário) sempre que a aresta não trouxer handle explícito — cobre dado estático e dado criado por drag com a mesma lógica.

**Config presa no bundle — a causa raiz de "não achei onde editar".** Investigando por que não havia como editar configuração, achamos algo mais fundamental: `packages/web` nunca carregava config em runtime — `diagrama.json`/`app.json` eram `import` estático, resolvido em build time. Isso significa que `gerador open`, rodado em qualquer outro projeto, sempre mostrava o config de *exemplo* deste repositório, nunca o do projeto real — e a imagem Docker tinha o mesmo problema, permanentemente. Não existia "onde editar" porque não existia "de onde carregar". Corrigido: `loadConfig.ts` agora busca `/config/*.json` via `fetch()` em runtime; o dev server do Vite, o `gerador open` da CLI, e a imagem Docker cada um passou a servir `/config/` — o dev server e o Docker a partir do config de exemplo deste repo (com fallback pro nome `.example.json`, já que este repo nunca teve um "projeto real"), a CLI a partir do diretório onde foi invocada. Um editor visual de config fica para depois — o pré-requisito (carregar dinamicamente) era o que faltava primeiro.

**Cenários prontos eram só "carregar" (substituir), nunca "compor".** Pedido explícito: montar um diagrama maior a partir de vários cenários prontos, não escolher um só. Adicionado `mesclarDiagrama()` (renumera IDs pra nunca colidir, desloca o bloco novo pra baixo do que já existe) e um botão "+ Adicionar ao canvas" por cenário, que não fecha o modal — dá pra adicionar vários em sequência. Validado via E2E real: mongo (4 atividades) + kafka (5 atividades) compostos = 9 atividades derivadas sem colisão de ID.

**Specs incompletas — falta contrato de dados, não só operação.** Pedido de pesquisa: por que a "pacote de implementação" ainda não bastava pra codar sem perguntar mais nada. Resposta: o schema de cada tipo de nó é rico em campos *operacionais* (retry, DLQ, índices como lista de nomes, tipo de auth) mas quase não pergunta o *contrato de dados* — formato da mensagem, schema do documento/tabela, corpo de request/response, lógica de uma decisão/regra. Adicionado um campo de texto livre por tipo (`contratoMensagem`, `schemaDocumento`, `schemaColunas`, `contratoApi`, `logicaDecisao`, `logicaRegra`, `passosProcesso`, `contratoEndpoints`) — opcional, sem bloquear prontidão, mesmo padrão do resto do sistema.

Nenhum desses quatro veio de teste automatizado — vieram de uso real, de novo confirmando o padrão do §9: rodar a ferramenta de verdade acha o que a suíte não cobre.

## 13. Da conversa sobre "bridge de IA" ao registro de cenários carregado em runtime

O usuário trouxe uma ideia maior: usar um agente de IA como intermediário pra transformar uso real (ou até entrevista sobre um projeto existente, com raciocínio de decisão capturado) em um repositório de padrões do time — de forma "orgânica mas controlada" — e perguntou sobre integrar isso ao Graphify, que ele valoriza por economizar token via grafo persistente. A arquitetura discutida (ainda não implementada, registrada aqui pra não se perder): captura determinística de observações → agente que agrupa e propõe promoção de padrão só com recorrência entre quebras independentes, sempre pedindo confirmação (nunca decidindo sozinho, mesma régua do revisor crítico já existente) → padrão confirmado populando `sugerido` (proveniência que já existe no engine, hoje só alimentada por `perfis-time.json`) → Graphify indexando o corpus de padrões (não código) pra consulta barata em token. Escopo deliberadamente adiado — é maior que uma sessão.

O que *foi* construído, como pré-requisito concreto pra essa visão: o registro de "cenários prontos" precisava parar de ser um `import` estático em `scenarios.ts` (mudar = mexer em código e rebuildar) e virar algo em que soltar um arquivo bastasse. Os 10 cenários (antes espalhados entre `scenarios.ts` e `packages/web/src/demo/scenarios/*.json`) viraram arquivos autocontidos em `config/cenarios/*.json` (metadado + quebra num só lugar), listados em `config/cenarios/index.json`, carregados via fetch — mesmo padrão do `loadConfig.ts`. Dois campos novos no schema, ainda vazios nos 10 originais mas prontos pra uso: `categoria` (`demo` | `padrao-arquitetural` | `aprendido-do-time`) e `designPatterns` (tags livres tipo "hexagonal", "ddd") — o "ter no repositório exemplos de hexagonal/DDD pra bootstrap de projeto novo" que o usuário pediu agora tem onde morar, sem esperar a automação de entrevista existir.

Um `Promise.all([carregarConfig(), carregarCenarios()])` compartilha o mesmo gate de carregamento do App — achado no meio do caminho: um projeto novo via `gerador init` não tem `config/cenarios/` (não faz sentido copiar os 10 exemplos deste repo pra todo projeto novo), então `/config/cenarios/index.json` responde 404. A primeira implementação tratava isso como erro fatal (tela de erro cobrindo o app inteiro) — testado manualmente com um projeto de verdade recém-criado via `gerador init`, não só em teste automatizado, e o problema apareceu na hora. Corrigido: 404 no índice degrada pra lista vazia (projeto sem cenários ainda, não é erro); qualquer outra falha (500, arquivo listado que não existe) continua falhando alto, porque isso é config incorreta de verdade.

Separadamente, o usuário notou que não achava `import-graphify` na interface — porque nunca esteve lá, era só CLI. Fechado: uma terceira aba no modal de jornada ("Importar do Graphify") que lê um `graph.json` pelo seletor de arquivo do browser, roda `importarGrafo()` (a mesma função pura do engine que a CLI usa) no próprio browser, e mostra o resultado — nós mapeados + lista de arquivos sem regra, igual ao comportamento da CLI, nunca aresta inferida. Validado com dado real: o próprio `graphify-out/graph.json` deste repositório, via E2E de verdade (upload de arquivo pelo Playwright), mapeando exatamente o mesmo nó (`rabbit.fixture.test`) que a validação da CLI já tinha encontrado (MVP5, §10) — mesma regra de mapeamento de exemplo, dois caminhos de entrada (CLI e UI) chegando ao mesmo resultado. `File.text()` não existe no ambiente de teste (jsdom) — trocado por `FileReader`, que também é a API mais amplamente suportada em browser real.

## 14. Correção: SPEC-07 é o sistema falando sozinho com o sistema

O usuário revisou a proposta do §13 e apontou algo mais fundamental que uma lacuna de escopo: **SPEC-07, lido de verdade** (não só resumido em conversa), só mina estatística de valor de campo sobre o histórico de `quebra.json` do próprio sistema — `Padrao` é `(nodeType, contextos, campo, valor, ocorrências)`, nada além disso. É o sistema referenciando a si mesmo de forma circular, sem nenhum ponto de contato com o código real que o desenvolvedor escreve. A correção pedida: a jornada certa é abrir um projeto de verdade, interagir com ele, e **decidir gravar uma referência** — idealmente selecionando classes/arquivos reais e guardando isso numa base de conhecimento, não inferindo padrão por repetição estatística de campos de formulário.

SPEC-07 ganhou uma nota de correção de escopo no topo do arquivo em vez de ser reescrito ou apagado — a mineração de valor de campo continua sendo uma peça pequena e legítima (reduz preenchimento repetido), só não é mais tratada como "a" base de padrões do time. A peça que falta — referências de código real, ancoradas na jornada de dev, provavelmente usando o Graphify pra apontar e selecionar classes existentes em vez de reimplementar extração de código — ainda não tem um SPEC próprio; fica como próximo desenho antes de qualquer implementação, mesma disciplina de SPEC-03/04 (registrar antes de codar quando o modelo de dados é caro de desfazer depois).

## 15. Cenário de integração interna, README, e demo com terminal simulado

Três pedidos concretos na mesma mensagem que trouxe a correção do §14:

1. **Faltava um cenário de integração interna.** Todos os 10 cenários anteriores modelavam serviço-contra-infraestrutura (fila, banco, API externa) ou serviço-contra-processo — nenhum modelava dois serviços do próprio time conversando via HTTP síncrono, apesar de `edgeRules.service` já aceitar `"http"` como aresta de entrada desde o início. Adicionado `config/cenarios/internal.json`: `srv-checkout` (novo) chamando `srv-fidelidade` (existente, ganhando um endpoint novo) — validado via `derive` real (4 atividades, incluindo a atividade de endpoint novo num serviço `existente`, caminho de código nunca exercitado antes por nenhum outro cenário).
2. **README.md não existia.** Criado cobrindo as três formas de rodar (Docker, dev local, CLI headless), tabela de comandos da CLI com "quando usar" cada um, e o que dá pra fazer na ferramenta — tudo verificado contra os scripts reais de `package.json`, não escrito de memória.
3. **A demo não mostrava o fluxo de CLI/skill, só o fluxo do app web.** Adicionada uma quarta aba "Linha de comando" no modal de jornada — um terminal simulado (texto fixo, não animação) com os 4 comandos principais e a saída real que cada um produz, mais a mesma tabela de comandos do README. A jornada agora mostra as duas formas de usar a ferramenta (interativa e headless), não só uma.

## 16. Campos de contrato eram inputs de uma linha só — sem onde caber um payload

Os 8 campos de "contrato de dados" adicionados no §12 (`contratoEndpoints`, `contratoMensagem`, `schemaDocumento`...) usavam `type: "text"`, que só existia como `<input>` de uma linha no `PropertiesPanel` — exatamente o tipo de conteúdo (exemplo de JSON, lista de colunas) que uma linha não comporta, e sem nenhuma forma de expandir pra ver melhor. Achado em uso real do próprio app, não em revisão de código.

Corrigido adicionando um tipo de campo novo ao `TipoCampo` do engine — `"textarea"` — que a UI renderiza como uma área de texto de várias linhas (fonte monoespaçada, redimensionável) com um botão "⤢" que abre um modal maior (`role="dialog"`) pra edição confortável, os dois sempre sincronizados com o mesmo valor. O engine não precisou de nenhuma mudança de lógica — `type` nunca é usado por `avaliarCondicao`/`resolverDefault`/`calcularProntidao`/`validateConfig`, é puramente uma decisão de UI, o que tornou a adição de baixo risco. Os 8 campos de contrato mudaram de `"text"` para `"textarea"` em `config/diagrama.example.json`; os 11 cenários prontos foram revalidados via `derive` real depois da mudança.

## 17. Fechando a lacuna do §14: dois pontos de entrada que só existiam como conversa

O usuário voltou com dois problemas concretos, um deles reabrindo diretamente o gap deixado em aberto no §14:

1. **"Onde eu configuro a stack do time?"** — pergunta literal, feita ao vivo. A resposta honesta era: em lugar nenhum da interface. `config/perfis-time.json` só era lido; a UI oferecia um campo de time no header com datalist (pra *selecionar* um time já cadastrado no arquivo), mas nenhuma tela gravava nada nele. Alguém só descobria que o mecanismo existia lendo o JSON à mão.
2. **"Não achei nenhum lugar onde eu possa colocar as classes de referência conforme foi solicitado nos últimos pedidos"** — o gap do §14 estava, de fato, só desenhado: a correção da SPEC-07 registrou a intenção ("selecionar classes reais e guardar numa base de conhecimento") mas nunca virou UI. O usuário pediu também um exemplo ilustrativo (não pequeno) de um arquivo do Graphify sendo processado, pra mostrar como a peça funcionaria na prática.

Os dois compartilham a mesma causa raiz — bases de conhecimento (`perfis-time.json`, e a que faltava pra referências) só existiam como arquivo, sem ponta de entrada no app — e ganharam o mesmo tipo de solução, sem inventar um backend que este projeto deliberadamente não tem:

- **Perfil de stack do time**: `PropertiesPanel` ganhou um botão "💾 salvar estes valores como padrão do time «X»", visível quando a quebra tem um time definido e o nó selecionado tem pelo menos um campo com `origem: manual`. Ao clicar, os valores manuais desse nó são mesclados no perfil do time em memória (sugestões passam a valer no resto da sessão, sem reload) *e* baixados como `perfis-time.json` atualizado, pra quem estiver usando revisar e commitar — mesmo padrão de "nada entra na config sem alguém olhar" que já regia cenários e o import do Graphify. Sem time definido, o painel mostra uma dica direta apontando pro campo do header, em vez de simplesmente não mostrar nada.
- **Referências de código**: nova aba "Referências de código" no modal de jornada, com `config/referencias/` carregado em runtime pelo mesmo padrão de `config/cenarios/` (índice + arquivos, 404 do índice degrada pra lista vazia). A aba lista referências existentes (título, racional, tags de design pattern, código expansível) e tem um formulário "+ Nova referência a partir de arquivos": seleciona um ou mais arquivos reais do disco (`<input type="file" multiple>` + `FileReader`), pede título e — deliberadamente separado do código — *por que* aquilo é uma referência, e baixa um rascunho `.json` pra mover manualmente pra `config/referencias/` e listar no índice. Nenhuma escrita silenciosa no repositório; a mesma disciplina revisável de sempre.
- **Exemplo ilustrativo**: `config/referencias/importador-graphify.json` usa o código real de `importarGrafo.ts` (o próprio adapter que traduz `graph.json` do Graphify em nós tipados) como referência, com racional explicando o padrão "tabela de regras com fallback explícito pra não mapeados" e por que vale a pena reaproveitar esse desenho em qualquer adapter de fonte externa — não um exemplo sintético de 3 linhas, o arquivo inteiro (95 linhas) com o motivo por trás da decisão.

Validado com o mesmo rigor de sempre: testes unitários novos pros dois fluxos (`PropertiesPanel.test.tsx`, `referencias.test.ts`, `ReferenciasTab.test.tsx`, `JourneyModal.test.tsx` atualizado), E2E real cobrindo o download do `perfis-time.json` (`page.waitForEvent("download")`) e a aba de referências com o exemplo real do Graphify visível e expansível, screenshot manual conferindo os dois em tela, rebuild + verificação do Docker (`config/referencias/` agora também é copiado na imagem, mesmo tratamento de `config/cenarios/`), e `graphify update .` pra manter o grafo deste repositório em dia com o código novo.

Nessa mesma revisão, um segundo check "o que ainda falta?" achou dois documentos desatualizados por conta própria, sem o usuário ter apontado: `CONTEXTO-E-ARQUITETURA.md` §3 e §5.2 ainda descreviam o import do Graphify (MVP5) como "não implementado", mesmo já entregue e testado há tempo — corrigido, junto com a árvore de pastas (faltavam `config/cenarios/` e `config/referencias/`) e o README (faltavam os dois entry points novos na lista "o que você pode fazer").

## 18. Ícones por tipo de nó — o protótipo legado tinha, a reescrita perdeu

Comparando com `gerador_de_itens-2.html`, o usuário notou que a parte visual regrediu: o legado desenhava cada tipo de nó com um ícone próprio (glyph SVG embutido, emoji, ou SVG customizado, com um `tint` de fundo por tipo — `icon:{kind:'glyph', value:'rabbit'}` por exemplo), enquanto o canvas atual só tem borda colorida e um ponto de prontidão. Checando o código: `NodeTypeConfig.icon?: string` já existia no engine desde o início, mas nunca foi populado em nenhum config nem lido por `NodeCard.tsx` — campo morto.

Em vez de portar o sistema completo de glyph SVG customizado do legado (biblioteca de ícones vetoriais, sanitização de SVG custom, editor de configuração visual — desproporcional ao pedido), a correção ficou no mesmo espírito config-driven do resto do projeto: `icon` vira um emoji simples por tipo, populado nos 11 tipos de `config/diagrama.example.json` (e espelhado em `packages/cli/templates/diagrama.json`, os dois arquivos sempre sincronizados) — 🧩 serviço, 📨 Kafka, 🐇 Rabbit (o próprio mascote do RabbitMQ), 🔀 exchange, 🍃 Mongo (o logo real da MongoDB é uma folha), 🗄️ SQL, 🔁 Camunda, 🧠 FICO, 🌐 API externa, ⏰ job, ⚖️ regra de negócio. `NodeCard.tsx` renderiza o emoji no cabeçalho do card e usa a cor do tipo como tint de fundo (`${cor}1a`, sufixo de alpha hex) em vez do cinza fixo de antes — tipo sem `icon` configurado cai num glifo genérico (🔷) em vez de ficar em branco. "Personalizar" continua sendo o mesmo mecanismo de sempre: editar `icon`/`color` no `diagrama.json` do projeto, sem UI de configuração nova — consistente com todo o resto de `NodeTypeConfig` (label, cor, campos), que também só é editável via config.

Validado com teste novo (`NodeCard.test.tsx`, cobrindo ícone configurado e o fallback genérico), regressão completa (80 testes web + engine + cli, lint, build, 3 E2E com screenshot), rebuild do Docker, e `graphify update .`.

## 18.1. `docker restart` não recria o container, e o browser cacheava config sem header nenhum dizer o contrário

Depois do rebuild dos ícones, o usuário reiniciou o container (via IntelliJ) e não viu nada mudar. Duas causas empilhadas, achadas em uso real:

1. **`docker restart`/o botão de restart do IntelliJ reusa a imagem com que o container foi criado** — não repuxa nem recria a partir de uma imagem nova. `docker compose ps` mostrou o container rodando numa imagem de 11 horas atrás, enquanto `docker compose build` já tinha produzido uma imagem nova minutos antes. Corrigido rodando `docker compose up -d --build` (rebuild + recria o container a partir da imagem nova, um comando só) — documentado no README/instrução ao usuário como o comando certo pra "rodar o que está no repo agora", não `restart`.
2. **Mesmo com o container certo, o ícone ainda não aparecia** — `nginx:alpine` serve `/config/*.json` com `Last-Modified`/`ETag` mas sem `Cache-Control` nenhum, o que deixa o browser livre pra aplicar cache heurístico e continuar mostrando a config de antes sem revalidar, mesmo depois de um reload normal (só um hard refresh contornava). Como `config/` deste projeto muda a cada iteração de desenvolvimento — é o ponto central do carregamento em runtime — isso ia continuar mordendo em todo ciclo futuro. Corrigido com um `nginx.conf` próprio (`location /config/ { add_header Cache-Control "no-cache"; }`) copiado pra dentro da imagem no lugar do config default do nginx, e o mesmo header replicado nos outros dois lugares que servem `/config/*.json` — o servidor headless do `gerador open` (CLI) e o middleware de dev do Vite — pra as três formas de rodar a ferramenta terem o mesmo comportamento, não só o Docker.

Verificado nos três: Docker (`Invoke-WebRequest` confirmando o header antes/depois do fix), `gerador open` (smoke test real: build da CLI, subir servidor num diretório temporário, curl no config), e Vite dev (mudança idêntica de uma linha, mesmo raciocínio). Sem teste automatizado novo pro `open.ts` — o arquivo nunca teve suíte própria, e o path relativo que ele usa pra achar `packages/web/dist` (calculado a partir de `import.meta.url`) só bate certo quando chamado a partir do `dist/cli.js` compilado, não da fonte TS direto por trás do vitest; resolver isso é uma melhoria de testabilidade separada, não bloqueante pra este fix.

## 18.2. Mesmo com tudo certo no servidor, o ícone continuava sumindo — a causa era o emoji, não o cache

Depois do fix de cache, o usuário ainda via o losango de fallback em vez do ícone novo. A investigação passou por três hipóteses erradas antes da certa, cada uma eliminada com uma verificação real, não suposição:

1. **"É cache do browser ainda"** — pedido de hard refresh, InPrivate, e até `http://127.0.0.1:8080` direto (bypassando qualquer resolução de nome). Nenhum mudou o resultado. Hipótese descartada por evidência direta do usuário, não por teoria.
2. **"Devo estar num daemon Docker diferente do que o browser do usuário alcança"** — motivada por Docker Desktop mostrar uma imagem chamada "gerado" (não "gerador-gerador"). Verificação com `docker context ls` + `docker info` + comparação de Image ID mostrou que era o **mesmo** daemon (`desktop-linux`, mesmo ID de imagem) — só a coluna "Name" da UI do Docker Desktop truncando o nome. Hipótese descartada, mas achou um problema real ao lado: o container tinha sido *parado* (`Containers: 0`) e nunca recriado — daí sim vinha a config velha.
3. Com o container certo rodando e a config certa confirmada byte a byte no servidor (`service.icon` presente), o ícone ainda não aparecia. Em vez de seguir supondo, três verificações independentes e reais foram feitas: `curl`-equivalente confirmando os bytes exatos servidos, um teste Playwright com Chromium contra o container real (`baseURL` apontado pra `localhost:8080`, sem nenhum mock), e o mesmo teste rodando com `channel: "msedge"` — o Edge de verdade, não o Chromium empacotado do Playwright. **Todas as três renderizaram o emoji 🧩 perfeitamente**, na mesma máquina, no mesmo daemon Docker do usuário.

Isso eliminou todo o resto da pilha (servidor, config, cache, container, e até o motor de renderização do próprio Edge nesta máquina) e apontou pro único elo que eu não conseguia reproduzir remotamente: **a fonte/composição de emoji colorido no ambiente específico do usuário** — algo que depende de versão do SO, fonte de emoji instalada, aceleração de GPU, ou perfil do browser, nenhum dos quais está acessível ou controlável a partir daqui.

Em vez de continuar depurando um problema que só existe numa máquina que não consigo tocar diretamente, a correção foi **eliminar a dependência inteira**: trocado emoji colorido por um badge de texto simples (1 caractere, ex.: "S" pra Serviço, "K" pra Kafka, "R" pra Rabbit — todos os 11 tipos com letra distinta e sem colisão entre si). Texto simples renderiza em qualquer fonte de qualquer SO, sem exceção — não depende de cobertura Unicode recente nem de composição de glifo colorido via GPU. `icon` no config continua sendo o mesmo mecanismo de personalização (edite a letra/texto no `diagrama.json`), só que agora garantidamente visível em qualquer máquina. Sem `icon` configurado, cai na primeira letra do `label` — nunca fica em branco, e nunca mais usa outro emoji como fallback (o fallback anterior, "🔷", tinha exatamente o mesmo risco que o problema original).

Lição pro método deste projeto: quando uma correção "funciona aqui" mas não pro usuário, e múltiplas camadas já foram verificadas com evidência real (não suposição), a pergunta certa não é "o que mais pode estar errado no ambiente dele" — é "que dependência dessa solução eu não controlo, e dá pra eliminar em vez de depurar".

## 18.3. O botão de capturar perfil de time existia, mas a jornada nunca falava dele

Ainda no mesmo fio: mesmo com o ícone resolvido, o usuário voltou dizendo que não achava onde configurar "a stack do time" dentro da jornada (modal "✦ Como funciona & cenários"). Fazia sentido — o §17 deu à ferramenta de captura de perfil um único ponto de entrada, um botão contextual no `PropertiesPanel` que só aparece com time definido e algum campo preenchido manualmente num nó. Quem não passasse exatamente por esse caminho não tinha como saber que o mecanismo existe, e a jornada (que já ganhou uma aba própria para "Referências de código", a peça irmã desta) nunca mencionava perfis de time em lugar nenhum.

Corrigido com o mesmo tratamento dado às referências: nova aba "Perfis de time" no modal, mostrando os times já cadastrados em `config/perfis-time.json` (lidos do mesmo `perfisTime` que já circulava em memória, sem fetch novo) com seus valores conhecidos por tipo de nó, e um parágrafo explicando explicitamente o mecanismo de captura — que não tem cadastro na própria aba (não existe formulário solto desconectado de um nó real, mesma disciplina da correção da SPEC-07 no §14) — e aponta pro botão certo no painel de propriedades.

## 18.4. "Como faço pra editar a stack de um time?" — a aba nova era só leitura

Mesma conversa, um passo adiante: o usuário perguntou como editar a stack de um time já carregado, deu o exemplo concreto "o time trabalha com Java" e disse explicitamente que não faz sentido reselecionar a tecnologia toda vez que desenhar um serviço novo — quer configurar isso uma vez, por time. A aba nova do §18.3 só exibia os valores: não tinha como editar nem declarar um valor direto, só via o fluxo indireto de criar um nó de verdade e usar o botão do painel.

Cogitei uma modal separada só pra isso (o usuário chegou a sugerir), mas optei por manter dentro do mesmo modal "Como funciona & cenários" — é onde cenários, referências e perfis de time já vivem, e uma modal nova só pra este caso fragmentaria o único lugar de gestão que a ferramenta já tem.

Implementado um formulário na própria aba "Perfis de time": time (texto com sugestão dos já conhecidos), tipo de nó (select vindo de `config.nodeTypes`), campo (select vindo do `spec` do tipo escolhido — nunca texto livre, só chaves que já existem de verdade num `FieldSpec`) e valor. Salvar chama a mesma função de baixo nível que já existia (`atualizarPerfisTime`, extraída do que antes só o botão do painel usava) — mescla em memória e baixa `perfis-time.json` atualizado, mesmo fluxo revisável de sempre. Cada valor já exibido na lista também ganhou um link "editar" que abre o mesmo formulário pré-preenchido, então corrigir um valor existente e declarar um novo usam exatamente o mesmo caminho.

O ponto que fecha o pedido original: isso não é só "salvar um JSON" — depois de declarar `time-checkout` → Serviço → `linguagem` → `Java`, um nó Serviço novo criado com esse time selecionado no topo da tela já aparece com "usar sugestão: Java" no painel de propriedades, mecanismo que já existia desde antes (`resolverDefault`/`perfilDoTime`) e que este formulário agora alimenta diretamente, sem precisar do rodeio de criar um nó só pra capturar o valor. Validado com um teste E2E que percorre o fluxo inteiro — declarar o valor pelo formulário, fechar o modal, criar um Serviço novo com o time preenchido, e confirmar que a sugestão aparece — não só que o formulário salva algo.

## 18.5. "Colocou no tour?" — não, e devia

O usuário perguntou se as abas novas (Perfis de time, Referências) apareciam no tour guiado de 1 clique. Não apareciam — o tour guiado e o modal "Como funciona & cenários" são dois caminhos de descoberta diferentes que só se cruzam no botão que inicia o tour, então quem seguia o tour nunca ficava sabendo que essas abas existem.

Corrigido com dois passos novos no tour, entre "Saídas" e "Fim do tour": um pra Perfis de time, um pra Referências de código. A parte não trivial foi técnica: o tour guiado sempre operou sobre elementos do app principal (`data-tour="..."` em canvas/painel/botões), nunca sobre o modal da jornada — que só abre/fecha por clique do usuário, com a aba interna (`aba`) como `useState` isolado dentro do próprio `JourneyModal`, sem nenhum jeito de o `App.tsx` controlar de fora.

Resolvido dando ao `JourneyModal` uma prop opcional `abaForcada` (com um `useEffect` que sincroniza pra dentro do `useState` interno sempre que ela muda) e um `data-tour="journey-modal-content"` no container da modal, pro spotlight ter o que apontar. `App.tsx` ganhou `abrirJornadaNaAba(aba)`, que abre a modal (ou só troca de aba, se já estiver aberta) — o tour usa isso pra reabrir a modal na aba "perfis", depois trocar pra "referencias" sem fechar e reabrir, e o passo final fecha a modal de novo antes de encerrar. `pular()` também passou a fechar a modal, pra nunca deixar o tour interrompido com ela presa aberta.

## 18.6. Ícones de verdade: emoji era seguro mas genérico, o legado tinha figuras (banco = ícone de banco)

Com o badge de letra do §18.2 funcionando, o usuário trouxe a comparação direta com o protótipo legado: lá, cada tipo de nó tinha uma figura própria (o exemplo dado foi literalmente "o banco tinha o componente com uma figura de banco de dados") — bem mais rico visualmente do que uma letra colorida, e ele queria essa experiência de volta.

A letra existia justamente para fugir do problema que o emoji colorido causou (dependência de fonte/GPU do SO, ver §18.2-18.3) — mas SVG vetorial de verdade não tem essa dependência nenhuma: renderiza via o próprio motor de SVG do browser, não via fonte, então resolve visual E robustez ao mesmo tempo (era a opção certa desde o início, não uma escolha entre as duas). Adicionada a dependência `lucide-react` (ícones MIT, tree-shakeable — só o que é importado explicitamente entra no bundle) e um catálogo curado em `packages/web/src/canvas/icones.ts` (20 ícones, cobrindo os 11 tipos deste repo e alguns genéricos a mais pra outros domínios). `icon` no config continua sendo uma string livre: se bate com um nome do catálogo (`"Database"`, `"Server"`...) vira ícone SVG de verdade; qualquer outro texto continua caindo no badge de texto de antes — nenhuma migração quebra, o fallback de segurança do §18.2 continua intacto.

Os 11 tipos deste repo ganharam ícones semânticos: `Server` (serviço), `Radio` (Kafka), `Rabbit` (Rabbit — o próprio mascote do RabbitMQ), `Split` (exchange), `Database` (Mongo — o exemplo literal do usuário), `Table` (SQL), `Workflow` (Camunda), `GitBranch` (FICO), `Globe` (API externa), `Clock` (job), `Scale` (regra de negócio). Validado com teste novo garantindo que um nome reconhecido renderiza SVG de verdade (não texto), regressão completa, screenshot real confirmando o cilindro de banco de dados no nó Mongo e o ícone de servidor no nó Serviço, rebuild do Docker, refresh do Graphify.

## 19. Pergunta arquitetural: Confluence como base de conhecimento pros agentes

O usuário levantou a ideia de configurar um link do Confluence nas settings do projeto, vincular isso aos desenhos/diagramas, e ter skills que sobem conteúdo pra lá durante o desenvolvimento — conectado ao "prompt de saída" (o pacote de implementação / backlog gerado). Resposta dada foi uma recomendação curta, não uma implementação: começar por um **push unidirecional** — `config/confluence.json` (URL base + espaço, token via variável de ambiente, nunca commitado) e uma ação de "publicar" reaproveitando o mecanismo de export que já existe (`.md`/`.csv`/pacote de implementação), em vez de um subsistema novo. Transformar o Confluence numa fonte *consultável* pelos agentes (pull/busca/RAG) é um passo maior e mais arriscado — autenticação, rate limit, chunking de conteúdo — que só valeria a pena depois de validar a direção de push com uso real. Ficou em aberto para o usuário decidir se quer um SPEC novo antes de qualquer código.

## 20. Fase A: de ferramenta local pra serviço multi-time — banco de verdade entra em cena

Ferramenta virou uso de time, não mais individual — o que reabriu, de propósito, decisões que a virada de arquitetura do §2 tinha cortado (banco, multi-tenant, auth). O usuário confirmou o escopo cheio: banco real pra quebras/perfis/referências, controle de acesso de verdade por time (login, não mais o campo de texto livre "Time"), referências de código viram só link do Confluence (o racional é escrito localmente, uma skill ajuda a refinar, gera um prompt, um subagente do Claude Code publica a página de verdade), e infraestrutura como código com deploy simples + CI/CD. Um plano de 5 fases foi desenhado e aprovado (`packages/server` novo + banco → deploy mínimo → auth OIDC → fluxo Confluence → hardening); esta seção documenta a Fase A.

**O que entrou:** `packages/server` (Fastify + Drizzle ORM + Postgres), reaproveitando `packages/engine` sem tocar uma linha nele — o server só importa `derivar`/`calcularProntidao`/`validateConfig`, os mesmos que `web` e `cli` já chamavam. Três tabelas (`quebras`, `perfis_time`, `referencias`) substituem o que antes era `config/perfis-time.json` local e arquivos soltos em `config/referencias/`. `packages/web` trocou toda a persistência (File System Access API) por um cliente HTTP fino (`src/api/client.ts`); `ReferenciasTab` perdeu de propósito a seleção de arquivo/trecho de código local — o schema do banco já nasceu sem campo de snippet, adiantando o design da Fase C (referência = racional + link do Confluence, nunca o código em si).

**`drizzle-kit generate` não funcionou nesta configuração** (erro "Please install latest version of drizzle-orm" persistente, mesmo depois de alinhar versões e forçar hoisting do pacote) — causa raiz não fechada, mas a migração `0000_init.sql` foi escrita à mão (schema + seed dos times/referência de exemplo) e validada rodando de verdade contra Postgres via `drizzle-orm/node-postgres/migrator`. Fica como dívida conhecida: mudanças futuras de schema também vão precisar de SQL manual até (ou a menos que) isso seja destravado.

**Dois bugs pegos só na suíte E2E completa**, ambos do mesmo tipo — `Locator.getByText` do Playwright faz correspondência de substring case-insensitive por padrão, então textos parecidos colidem: `"time-pagamentos"` batia tanto no `<strong>` do card quanto no `title` de um botão que citava o mesmo nome de time, e `"salvar"` batia tanto no botão maiúsculo do formulário quanto no botão minúsculo de "colar link" — corrigidos com `{ exact: true }` e escopo por container, não achados por leitura de código, só rodando o fluxo de verdade.

**O bug mais sério só apareceu ao reconstruir a stack Docker completa do zero** (não só rodar `db` isolado como vinha sendo feito durante o desenvolvimento) — disciplina que valeu a pena de novo, como em §9: `npm run build` local não pega isso porque roda em dev via `tsx`, não pelo bundle de produção.
1. `tsup` empacotando o server inteiro em ESM quebrava em runtime (`Dynamic require of "events" is not supported`) porque `fastify`/`avvio`/`pino` fazem `require()` dinâmico de módulos internos do Node — ESM bundlado não tem `require` de verdade. Trocado pra saída CJS (`dist/server.cjs`, extensão explícita porque o `package.json` do server declara `"type": "module"` pros scripts de dev).
2. Isso por sua vez esvaziou `import.meta.dirname` (usado pra achar a pasta de migrations) — CJS não tem `import.meta`. Resolvido com um fallback dual: `typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url))`, que funciona tanto no dev via `tsx` (ESM, `__dirname` indefinido) quanto no bundle de produção (CJS, `import.meta` vazio).
3. Mesmo com a imagem certa, o `server` ainda crashava no primeiro boot de um `docker compose up` do zero — `depends_on: [db]` sem condição só espera o container do Postgres *iniciar*, não aceitar conexões; a migração no boot do server tentava conectar antes do Postgres estar pronto. Corrigido com `healthcheck` (`pg_isready`) no serviço `db` e `depends_on: { db: { condition: service_healthy } }` no `server`.

Com os três corrigidos, `docker compose down -v && docker compose up -d --build` sobe as três peças (web/server/db) saudáveis sem nenhuma intervenção manual — a régua de "deploy simples" que a Fase D vai herdar. Regressão completa (71+88+10+10 = 179 testes unitários, 14 E2E, typecheck e lint dos quatro workspaces) ficou verde antes de fechar a fase.

## 21. Fase B: login real, isolamento por time, editor de campos, e remoção de `produto`

Usando a Fase A de verdade (não só em teoria), o usuário trouxe três problemas concretos numa única mensagem, com print de tela mostrando a aba "Perfis de time" apertada demais pra caber um editor de campos: (1) time A enxergava e editava configuração do time B — o campo "Time" do header ainda era texto livre; (2) os campos de formulário de cada tipo de nó só existiam estáticos em `config/diagrama.json`, sem CRUD nenhum; (3) `Quebra.produto`/`Atividade.produto` era "informação do épico vazando pro item". As decisões de escopo (adiantar login real em vez de remendo de UI; campos podendo variar por time) vieram de duas perguntas diretas ao usuário antes de desenhar a solução — registradas junto com o desenho completo em **SPEC-08-autenticacao-e-config-por-time.md**, seguindo a convenção (até então não seguida nesta rodada, até o usuário apontar) de que toda peça arquitetural nova ganha um SPEC próprio, não só código.

**Autenticação — dois modos, mesmo código de sessão.** Sem IdP corporativo acessível neste ambiente, `packages/server` ganhou `AUTH_MODE=dev` (default local/Docker/E2E — `POST /auth/login` aceita `{ email, timeId }` direto, validado contra a nova tabela `usuario_time`) e `AUTH_MODE=oidc` (produção, fluxo padrão via `openid-client`, nunca exercido aqui mas usando exatamente o mesmo código de sessão/cookie/middleware dos dois modos). Sessão é um JWT (`jose`) em cookie httpOnly, stateless. Um achado real ao implementar: o time escolhido na tela de login não virava automaticamente o "time ativo" do app — `AppComSessao` sempre caía em `sessao.timeIds[0]`, ignorando qual time a pessoa quis usar; corrigido propagando o `timeId` do login como estado inicial em vez de derivar só da lista.

**Campos por tipo de nó viraram tabela** (`campos_no`, sentinela `"__global__"` em vez de `NULL` — Postgres trata `NULL≠NULL` em índice único, então duas linhas globais do mesmo campo não seriam barradas). Mesma regra de override de `perfis_time`: campo do time sobrescreve o global de mesma chave. Nova tela `ConfigScreen.tsx` (overlay de tela cheia, mesmo padrão de `ReviewScreen.tsx` — não mais uma aba na `JourneyModal`) reúne Perfis de time, Campos por tipo de nó e Referências de código; a `JourneyModal` ficou só com onboarding/demo (jornada, cenários, importar Graphify, linha de comando).

**`produto` saiu do modelo inteiro** (engine, CLI, server, web, 11 arquivos de cenário) — mapeamento prévio mostrou que `Atividade.produto` era *write-only* (preenchido em 4 pontos de `derivar.ts`, nunca lido por `exportar.ts`/`gerarPacote.ts`), confirmando no próprio código a queixa do usuário. O identificador da lista "Abrir…" virou `time · atualizadoEm` em vez de inventar um campo de nome substituto.

**Dois bugs pegos só reconstruindo a stack Docker completa do zero** (de novo — mesma disciplina do §20, e de novo pagou a pena):
1. `Locator.getByText` do Playwright bate em `<option>` de `<select>` mesmo fechado — as novas asserções de "time-pagamentos"/"time-checkout" na tela de Configurações colidiam com as opções do `<select>` do header; corrigido escopando o locator ao container `[data-tour="config-screen-content"]`.
2. O bundle de produção do server (`tsup` → CJS, ver §20) crashava com `Cannot find module '@fastify/cookie'` — as libs novas de auth (`@fastify/cookie`, `jose`, `openid-client`) não tinham entrado no `noExternal` do `tsup.config.ts`, então ficaram de fora do bundle único que a imagem de runtime espera rodar sozinho, sem `node_modules`.

Regressão completa (71+86+10+20 = 187 testes unitários, 14 E2E, typecheck e lint dos quatro workspaces, `docker compose down -v && up -d --build` validado com login real de ponta a ponta) ficou verde antes de fechar a fase.

## 22. Fase B.1: Google OIDC, convite de time, hardening e landing page

Usando a Fase B de verdade pela primeira vez, o usuário apontou que "o processo de login e de conta não está maduro ainda" e sentiu falta de contexto antes da tela de login. Quatro perguntas diretas (Google agora ou depois; que medida anti-ataque; landing pública ou hub pós-login; auto-cadastro e/ou painel de admin) definiram o escopo antes de qualquer código — registrado em três specs novas (**SPEC-09-autenticacao-de-producao.md**, **SPEC-10-seguranca-de-producao.md**, **SPEC-11-landing-page.md**), seguindo a regra que o próprio usuário cobrou nesta rodada: toda peça arquitetural nova ganha um SPEC, não só código.

**Google como provedor OIDC de verdade** — primeira vez que `AUTH_MODE=oidc` (desenhado no SPEC-08, nunca exercido) ganhou checagens específicas de provedor real: `email_verified !== true` rejeita (genérico pra qualquer OIDC, não só Google — alguns provedores permitem e-mail não verificado), e `OIDC_DOMINIO_PERMITIDO` opcional restringe por domínio. O motivo do erro real nunca volta pro cliente (403 genérico) — devolver "seu e-mail não é verificado" ou "fora do domínio X" ajudaria mais um ataque de reconhecimento do que um usuário legítimo.

**Convite de time por link, não solicitação com aprovação** — decisão deliberada (SPEC-09 §3.1) por ser o padrão já conhecido (Slack/Discord/GitHub) sem precisar inventar um fluxo de aprovador. Isso expôs um problema de design real antes mesmo de chegar em código de convite: `emitirSessaoParaEmail` recusava (403) emitir sessão pra quem tinha zero times — o que quebra o próprio fluxo que estava sendo construído, porque alguém precisa de sessão válida pra *aceitar* um convite antes de pertencer a time nenhum. Corrigido removendo essa checagem (autorização por time já é responsabilidade de `exigirTime`, não do login) e tornando `timeId` opcional no corpo de `POST /auth/login` — sem ele, emite sessão só com os times que o e-mail já tem, mesmo que seja nenhum.

**Sem papel de admin novo** — mesma régua de `campos_no` (SPEC-08 §3.4): qualquer pessoa que já é de um time administra a lista de membros dele (adicionar, remover, gerar convite). Simplicidade sobre controle fino que ninguém pediu.

**Segurança adiantada (Fase E do plano original, virou SPEC-10):** rate limiting por IP, bem mais apertado em `/auth/login`/`/auth/callback` que no resto da API; `trustProxy` só em produção (senão o rate limit por IP confiaria em `X-Forwarded-For` vindo direto do cliente); `@fastify/helmet`; CORS com origem obrigatória quando `NODE_ENV=production` (falha alto no boot); log de auditoria simples (quem/quando, fire-and-forget, nunca derruba a escrita principal se falhar). Backup do Postgres continua bloqueado pela Fase D (precisa de VM pra rodar o cron).

**Landing page reaproveita `Jornada()`** — extraída de `JourneyModal.tsx` pra um módulo compartilhado (`demo/Jornada.tsx`) em vez de escrever uma segunda explicação da ferramenta que dessincronizaria da primeira com o tempo.

**Rate limiting quebrou a própria suíte que devia proteger** — achado só ao rodar o E2E completo: o limite de login (10/5min) e o limite global (100/min) são pensados pra uma pessoa, não pra 14 specs × 6 workers em paralelo batendo no mesmo processo de servidor. Os primeiros testes passavam, os de trás esbarravam em 429 e ficavam presos na tela de login — mascarado porque a asserção de "logou com sucesso" do helper de E2E checava só o texto "Gerador de Itens", que também aparece na própria tela de login. Corrigido em duas frentes: os dois limites viraram configuráveis por env var (`RATE_LIMIT_LOGIN_MAX`/`RATE_LIMIT_GLOBAL_MAX`), altos de propósito no `playwright.config.ts` e no `beforeAll` do `app.test.ts`; e a asserção do helper `entrar()` passou a esperar um elemento que só existe depois de autenticado de verdade (`+ Serviço`), não um texto ambíguo.

**Sessão não se atualiza sozinha — achado só testando contra o container real, não nos testes automatizados.** `POST /convites/:token/aceitar` gravava a nova associação no banco e devolvia sucesso, mas a sessão em uso (JWT assinado no login, SPEC-08 §2.2) continuava com o `timeIds` de antes de aceitar — o cookie nunca é reconsultado no banco a cada requisição, só verificado. `GET /auth/me` decodifica o cookie existente, não reconsulta nada; um `window.location.reload()` no cliente não ajudava porque o cookie *em si* estava desatualizado. Corrigido reemitindo o cookie de sessão na própria resposta de `aceitar`, com o `timeIds` já incluindo o time novo — validado batendo a sequência de verdade (logar sem time → aceitar convite → `/auth/me` já mostra o time novo, sem reload manual) contra o container Docker reconstruído, não só contra `app.inject()` do supertest.

Regressão completa (71+86+10+28 = 195 testes unitários, 14 E2E, typecheck e lint dos quatro workspaces, `docker compose down -v && up -d --build` validado com login Google-ready, convite de time de ponta a ponta, e headers de segurança) ficou verde antes de fechar a fase.

## 23. Correção pós-uso: login pedia time, mas não tem como saber qual antes de logar

Usando a própria tela de login, o usuário digitou um time errado e recebeu um erro tecnicamente correto mas ilegível. Ao investigar, apontou o problema de raiz: o formulário pedia `timeId` antes da pessoa estar autenticada — não tem como saber a quais times um e-mail pertence sem primeiro provar quem é, e um e-mail pode pertencer a mais de um (SPEC-09).

**Correção:** `POST /auth/login` (dev) e o callback OIDC recebem só a prova de identidade — nenhum pede/checa time. A sessão carrega todos os times que o e-mail já tem. Três telas em `packages/web/src/auth/` decidem depois: `SemTimeScreen.tsx` (zero times, cola convite), direto (um time), `EscolherTimeScreen.tsx` (mais de um). `requisitar()` parou de embrulhar erro em dump técnico. E-mail real liberado só localmente (`docker exec ... psql`), não commitado. Regressão (86+28 testes, 14 E2E) verde; Docker validado.

## 24. "Sair" não fazia nada — a causa real era mais funda que falta de try/catch

Usando a tela corrigida do §23, o usuário reportou que o botão "Sair" não mudava nada na tela. `useSessao.sair()` de fato não tinha tratamento de erro (`await apiAuth.sair()` sem try/catch — se a chamada rejeitasse, `setSessao(null)` nunca rodava e o clique parecia não fazer nada). Corrigido com try/finally, sempre limpando a sessão local mesmo se a chamada ao server falhar.

Mas testar contra o servidor real (`curl -i -X POST http://localhost:4000/auth/logout -H "Content-Type: application/json"`) revelou a causa raiz de verdade: **o servidor sempre respondia 400** (`FST_ERR_CTP_EMPTY_JSON_BODY`) — o Fastify rejeita por padrão qualquer requisição com `Content-Type: application/json` e corpo vazio, e `requisitar()` (`packages/web/src/api/client.ts`) setava esse header incondicionalmente, mesmo em chamadas sem `body`. Isso não afetava só o logout: **todo** POST/DELETE sem corpo tinha o mesmo problema — `POST /times/:timeId/convites` (gerar link de convite) e `POST /convites/:token/aceitar` (aceitar convite) também sempre 400avam pelo browser real. Nenhum teste automatizado pegou isso porque os testes de servidor usam `app.inject()` do Fastify (não seta esse header sem `payload`), e não existia E2E nenhum passando pelo `fetch()` de verdade pra esses três endpoints — o JOURNEY §22 registrou "convite de time de ponta a ponta" validado, mas via `app.inject()`/manual, nunca via browser real.

**Correção:** `requisitar()` só inclui `Content-Type: application/json` quando `opcoes.body !== undefined`. Dois E2E novos fecham o buraco de cobertura: "Sair" (login → sair → volta pra tela de login) e "gerar link de convite" (login → Configurações → Membros → gerar link → link aparece) — os dois exercitam o `fetch()` real do browser, não `app.inject()`.

Separadamente, um `eslint-disable-next-line react-hooks/exhaustive-deps` introduzido no §23 quebrava o lint (`packages/web/eslint.config.js` nunca registrou o plugin `react-hooks` — nenhuma regra dele está ativa neste projeto) — removido, sem substituto necessário.

## 25. SPEC-12: gerenciamento de segredos (Infisical self-hosted)

Antes mesmo de configurar o Google OAuth de verdade, o usuário perguntou como evitar colar `OIDC_CLIENT_SECRET` em texto plano por máquina — queria algo em container, que desse pra "baixar o projeto numa máquina nova, iniciar e inserir a chave lá". Via `AskUserQuestion`, escolheu Infisical self-hosted (não HashiCorp Vault — complexidade de `unseal`/políticas que essa escala não pede — nem só um `.env.example`, que não é vault de verdade). Desenho completo em **SPEC-12-gerenciamento-de-segredos.md** antes do código, mesma disciplina cobrada pelo usuário desde a Fase B.1.

Arquitetura: `infra/secrets/docker-compose.yml` — Infisical + Postgres + Redis próprios, deliberadamente separado do compose do projeto (não é do domínio do `gerador-de-itens`, é infra compartilhável entre projetos futuros; pode viver em qualquer outra pasta/máquina). Uma rede Docker externa (`gerador-secrets-net`, criada uma vez por máquina) liga os dois composes pelo nome do container, sem publicar a porta do vault pra fora. `docker-compose.secrets.yml` (overlay opt-in na raiz do projeto) adiciona ao serviço `server` a rede externa e as credenciais de uma Machine Identity do Infisical (`INFISICAL_CLIENT_ID`/`SECRET`/`PROJECT_ID`/`ENV`) — o segredo-zero que ainda sobra em texto plano local, mas escopado só a ler um projeto do vault, revogável pela UI, nunca o `OIDC_CLIENT_SECRET` em si.

Injeção sem tocar em código: `packages/server/docker-entrypoint.sh` roda `infisical run -- node dist/server.cjs` só quando `INFISICAL_CLIENT_ID` está setado — em `AUTH_MODE=dev` (dev/E2E, sem overlay) cai direto em `node dist/server.cjs`, sem depender do vault estar de pé. `packages/server/Dockerfile` trocou a base de runtime de `node:20-alpine` pra `node:20-slim` (Debian) só por causa do instalador oficial do CLI do Infisical — o instalador Alpine tem incompatibilidades de libc conhecidas (issue aberta no repo oficial), a via `apt` é a estável.

Validado: os três `docker-compose*.yml` passam em `docker compose config`; a imagem do server builda com o CLI instalado (`infisical` no PATH); `docker compose down -v && up -d --build` (sem o overlay, modo dev) sobe idêntico a antes — nenhuma regressão no fluxo padrão que não precisa de vault nenhum.

Regressão completa desta rodada (86 testes web + 28 server, 16 E2E incluindo os dois novos, typecheck e lint limpos, rebuild Docker completo) ficou verde antes de fechar.

## 26. Fase B.2: o botão do Google que nunca existiu, o redirect que não voltava, e Organização → Times → Membros

Primeira vez testando `AUTH_MODE=oidc` contra o Google de verdade (não só `dev`), três problemas em sequência, cada um só visível usando o fluxo real:

1. **`LoginScreen.tsx` nunca implementou o botão do Google.** O backend suportava os dois modos desde a Fase B (`GET /auth/login` redireciona pro provedor quando `AUTH_MODE=oidc`), mas o componente sempre renderizava o formulário de e-mail do modo `dev`, independente do modo real do servidor — o modo `oidc` nunca tinha sido exercido de ponta a ponta antes, então ninguém tinha notado. Corrigido com `GET /auth/modo` (rota pública nova, sem segredo nenhum) devolvendo `{ modo: "dev" | "oidc" }`; `LoginScreen` passou a receber esse `modo` (via `useSessao`, buscado em paralelo com `/auth/me`) e renderizar um botão "Continuar com Google" com o ícone oficial quando `oidc`, mantendo o formulário de e-mail intacto quando `dev`.
2. **O redirect de volta pro app não executava.** `emitirSessaoParaEmail()` (compartilhada entre `POST /auth/login` dev e `GET /auth/callback` oidc) sempre chamava `reply.send(...)` no final — certo pro caminho dev (o `fetch()` do cliente quer o JSON), errado pro callback oidc, que precisa só setar o cookie e deixar o `reply.redirect()` seguinte ser a resposta de verdade. Como o reply já tinha sido enviado, o navegador ficava preso mostrando o JSON cru na própria URL de `/auth/callback`, sem nunca voltar pro app. Corrigido: a função para de mandar resposta, só devolve `{email, timeIds}`; cada rota decide (dev manda o JSON, oidc segue pro redirect).
3. **Bootstrap de time ainda dependia de alguém já existir.** SPEC-09 §3.3 só permitia entrar num time por convite, sempre de quem já era membro — a primeira sessão logada via Google de verdade, com o banco limpo, caiu direto nesse buraco: ninguém tinha time pra convidar ninguém.

A correção do item 3 virou uma conversa mais longa sobre modelo de dados. A solução óbvia ("deixa criar um time novo, rejeita nome repetido") foi corrigida pelo usuário — "não tem isso de roubar time que já existe, vamos pensar melhor, talvez nível organização > times > membros". Perguntas de escopo resolvidas junto com ele: uma organização só por deploy (não multi-tenant de verdade agora), mas com **tabela `organizacoes` real no banco**, porque o projeto pode um dia servir mais de uma empresa — justificativa citada: Jira/Trello são um workspace por organização, não várias auto-servidas compartilhando a mesma configuração de login, então não faz sentido repetir o processo de credencial OAuth/Infisical por organização. Registrado em **SPEC-13-organizacao-times-membros.md** (corrige SPEC-09 §3.3).

Implementado: migração `0003_organizacoes_e_times.sql` cria `organizacoes` (uma linha semeada) e `times` (entidade de verdade — antes só existia implicitamente como string solta em `usuario_time.time_id`), faz backfill de todo `time_id` já em uso, e adiciona FK real em `usuario_time`/`convites_time`/`perfis_time` apontando pra `times.id`. Decisão deliberada: `times.id` continua sendo a mesma string de sempre (`"time-pagamentos"`) e continua **globalmente única**, não uma chave composta `(organizacao_id, id)` — com uma organização só isso já é o comportamento certo, e virar composta no futuro é uma migração pequena e isolada, não um redesenho das ~8 telas do `packages/web` que hoje mostram esse id direto como rótulo. `POST /times` (qualquer sessão, mesmo sem time nenhum) cria o time dentro da organização única, 409 se o nome já existe (mensagem de namespace, não de "roubo"), reemite a sessão já com o time novo — mesmo padrão do aceite de convite (JOURNEY §22). `SemTimeScreen.tsx` ganhou uma segunda seção, "ou crie um time novo", ao lado da já existente "colar link de convite".

**Achado colateral nos testes:** a FK nova em `usuario_time.time_id` quebrou os `beforeEach` de dois describes que inseriam direto na tabela pra times de teste (`time-teste-convite`, `time-teste-membros`) sem que esses times existissem em `times` primeiro — corrigido com um helper `garantirTime()` chamado antes de cada insert direto, nunca deletado (mesmo raciocínio das seeds da migração 0001).

Separado, nesta mesma rodada: usuário pediu deprioritizar `.csv` como saída por enquanto (a entrega final vai virar prompt estruturado — desenho ainda por vir, ver SPEC-14 quando escrito) — removido o botão "Exportar .csv" do `ReviewScreen`, a wiring em `App.tsx`, e as menções em `Jornada.tsx`/`useTour.ts`; `paraCsv()` continua no engine (não usado, barato de manter, fácil de reconectar). E, antes do push planejado pro GitHub no dia seguinte: auditoria manual do `.gitignore` (git não está instalado neste ambiente, não deu pra usar `git status`/`check-ignore`) achou `.idea/` (arquivos do IntelliJ, incluindo `workspace.xml`) presente no repo mas fora do `.gitignore` — adicionado, junto com `.vscode/` preventivamente. `.env`/`infra/secrets/.env` já estavam cobertos desde o SPEC-12.

Regressão completa (32 testes server + 86 web, 16 E2E, lint e typecheck dos dois workspaces tocados, rebuild Docker do zero com a migração nova aplicada limpa) ficou verde antes de fechar. Validação manual do fluxo Google real ficou parcialmente bloqueada por um limite de usos do Client Secret da Machine Identity do Infisical esgotado pelos vários rebuilds — não é um bug desta correção, só o secret precisando ser regerado; o usuário optou por seguir rodando local (`AUTH_MODE=dev`) por ora.

**Fechamento da validação, com o secret renovado:** o usuário gerou um novo Client Secret na UI do Infisical (a primeira tentativa de renovação disse "feito" mas o `.env` ainda tinha o valor antigo — pego relendo o arquivo antes de tentar outro rebuild) e confirmou login Google real funcionando. Direto no Postgres do container reconstruído: `silvioaltr@gmail.com` autenticou via Google, caiu em `SemTimeScreen` (zero times, conta nova), usou a seção "ou crie um time novo", e o time `teste` apareceu corretamente vinculado à única linha de `organizacoes` ("Organização padrão"), ao lado dos três times semeados pela migração — fechando a validação de ponta a ponta da Fase B.2 com conta real, não só teste automatizado. Fase B.2 encerrada.

## 27. Fase D: infraestrutura como código (GCP) — desenhada e escrita, `apply` real fica pra depois

Única decisão em aberto do plano mestre ("provedor de nuvem?") resolvida pelo usuário: **GCP**, depois de uma comparação direta com AWS/Azure/servidor interno (Terraform mais enxuto pra "uma VM só", free tier permanente, sem preferência corporativa prévia). Desenho completo em **SPEC-15-infraestrutura-deploy.md**.

**Terraform** (`infra/{main,variables,outputs}.tf`, `infra/cloud-init.yaml`): 1 VM (`e2-small`), 1 IP externo fixo (sobrevive a recriação — sem isso, todo restart trocaria o IP e quebraria DNS/`OIDC_REDIRECT_URI`), 1 disco de dados separado do disco de boot pro volume do Postgres (mesmo raciocínio — sobrevive a recriar a instância), firewall liberando só `22/80/443`. `allowed_ssh_cidr` tem uma `validation` que recusa `0.0.0.0/0` — decisão deliberada de falhar alto em vez de aceitar um default perigoso.

**Caddy roteia por path no mesmo domínio (`/api/*` → server, resto → web), não por subdomínio** — a decisão não é só estética: a sessão viaja em cookie `sameSite: "lax"` desde a Fase B, e domínios diferentes exigiriam `sameSite: "none"` + reabririam superfície de CSRF que `lax` evita hoje. Com Caddy same-origin, o browser nunca vê a API como cross-origin. Isso exigiu ensinar `packages/web` a saber `/api` em **build time** (Vite resolve `VITE_API_URL` no bundle, diferente de `config/*.json` que é runtime desde a Fase A) — `Dockerfile` da raiz ganhou `ARG VITE_API_URL` (default preserva o comportamento atual de dev/E2E). Validado com build real: `docker build --build-arg VITE_API_URL=/api` e grep no bundle gerado confirmando `const Zi="/api"` baked no lugar de `http://localhost:4000`.

**Achado ao desenhar isto, corrigido junto:** os quatro `reply.setCookie(...)` de sessão (`routes/auth.ts` x2, `routes/times.ts` x2) nunca setavam `secure` — inofensivo em dev (HTTP puro), errado atrás de HTTPS de verdade. Corrigido com `secure: process.env.NODE_ENV === "production"`, mesmo padrão de detecção de ambiente já usado em `app.ts` pro CORS obrigatório (SPEC-10).

**CI/CD:** `.github/workflows/ci.yml` (todo push/PR — testes + lint + build dos 4 workspaces; ganhou um serviço `postgres:16-alpine` no job, porque `app.test.ts` roda migração real contra Postgres de verdade, nunca mock) e `.github/workflows/deploy.yml` (só `main`, só depois do CI passar pro mesmo commit via `workflow_run` — builda e publica `web`/`server` no GHCR, depois SCP+SSH copia `docker-compose.prod.yml`/`Caddyfile`/`docker-compose.secrets.yml` pra `/opt/gerador` na VM e sobe). `docker-compose.prod.yml` é uma variante standalone (não overlay do compose de dev — merge de listas do Compose concatena em vez de substituir, então "tirar" as portas publicadas de dev não teria como funcionar como overlay) que reaproveita o overlay já existente do SPEC-12 pro Infisical, sem duplicar a integração com o vault.

Regressão completa (32 server + 86 web + 10 cli, lint e build limpos, YAML dos workflows e compose validados por parser real, rebuild do Dockerfile da raiz com o build-arg novo) ficou verde. **`terraform apply` não foi executado** — sem conta GCP nem `terraform`/`gcloud` instalados neste ambiente de desenvolvimento; o módulo foi escrito e revisado à mão, pronto pra `plan`/`apply` reais quando o usuário tiver credenciais GCP. Backup automatizado do Postgres (cron `pg_dump` na VM) ficou de fora deste SPEC — precisa da VM existindo primeiro pra agendar.

## 29. SPEC-14: auditoria do `.md` de saída, arquitetura de dois agentes, e o motor de prompt de entrega

Usuário pediu pra postergar a hospedagem (Fase D fica pavimentada, sem `apply`) e trouxe duas coisas na mesma mensagem: (1) revisar se o `.md` de saída carrega toda informação disponível, e (2) desenhar como integrar IA — um agente de review/refino e outro, conectado a MCP, pro upload.

**Auditoria (achado real, não suposição):** o único `.md` agregado (`paraMarkdown`) só mostra `specResumo` — um subconjunto curado por tipo de nó. Os campos de contrato ricos (`contratoMensagem`, `schemaDocumento`, `contratoGrpc`...) e os N/A com motivo só existiam na versão por-atividade (`gerarPacoteImplementacao`), nunca no `.md` agregado. Nada estava perdido de verdade, mas fragmentado — o `.md` que dá pra baixar de uma vez era raso, a versão completa só saía clicando atividade por atividade.

**Arquitetura de IA — decisão confirmada por pergunta direta:** nenhuma chamada a LLM entra em `packages/server`. O `gerador` continua motor determinístico, config-driven, zero I/O de IA; quem faz o trabalho de IA são dois subagentes do Claude Code **fora deste repositório** — um de revisão/refino (lê o prompt gerado, aplica linguagem de PO, completa Gherkin), outro de upload (já existe, do usuário, conectado a MCP). Mesmo raciocínio já usado pra Confluence (Fase C, plano mestre) e pro SPEC-14 §6 original: meter LLM dentro do server exigiria gerenciar chave de API, custo, erro de rede externa — infraestrutura nova pra resolver um problema que o ambiente de quem usa (uma sessão Claude Code) já resolve de graça.

**SPEC-14 fechado com as 5 perguntas em aberto todas respondidas** (reescrito por completo, não só emendado): 8 seções fixas no item final (título, contexto, história estilo PO, especificação técnica completa, refinamento técnico, critérios de aceite Gherkin, DoD, dependências); template **base global, personalizável por time** (mesmo padrão de override de `campos_no`); "gerar variações" = **um template por tipo de item** (História/Task/Débito Técnico + **Spike**, novo), não múltiplas versões de prosa geradas por LLM; validação de `{{variavel}}` desconhecida ao salvar.

**Achado ao verificar antes de implementar (evitou construir em cima de suposição errada, mesma disciplina de §10/§20):** não existe editor de `tipo`/`tamanho` na revisão — `atividade.tipo` é decidido só por `derivar.ts`, sempre read-only na UI. E `RegrasConfig.tipos` nunca foi lido por nenhum código, em lugar nenhum — campo do schema nunca consumido. Adicionar "Spike" ao `TipoItem` do engine teria sido inútil. Corrigido: "tipo do template" virou conceito independente de `Atividade.tipo` — `prompt_templates.tipoItem` é uma coluna própria (4 valores fixos via `z.enum`), escolhida por um `<select>` na revisão que decide só qual molde usar, sem reclassificar a atividade nem tocar no engine.

**Implementado:**
- `packages/engine/src/prompt/gerarPrompt.ts` — substitui `gerarPacoteImplementacao` (removida, não mantida em paralelo): `gerarPrompt(atividade, diagrama, config, opcoes)` monta as 8 variáveis (reaproveitando a mesma lógica de especificação completa por nó de antes) e substitui `{{placeholders}}` num template; `template` é opcional, cai em `TEMPLATE_PROMPT_PADRAO` (constante exportada) quando ausente — é o que deixa o CLI (`gerador implementar`, roda sem banco) funcionando sem precisar de infraestrutura de template nenhuma. `validarTemplate`/`extrairVariaveis`/`VARIAVEIS_PROMPT` exportados pra validação client-side e server-side reaproveitarem a mesma lista fechada.
- `packages/server`: tabela `prompt_templates` (migração `0004_prompt_templates.sql`, seed dos 4 globais com o texto de `TEMPLATE_PROMPT_PADRAO` — os dois "sempre sincronizados", mesmo raciocínio de `config/diagrama.json` vs `packages/cli/templates/diagrama.json`), rota `GET/PUT /prompt-templates` (upsert por chave natural `(timeId, tipoItem)`, `validarTemplate` do engine reaproveitado pra rejeitar variável desconhecida com 400).
- `packages/web`: nova aba "Prompt de entrega" em `ConfigScreen` (`PromptTemplatesTab.tsx` — editor por tipoItem, escopo global/time, validação em tempo real antes de bater no servidor); `ReviewScreen` troca o botão "pacote de implementação" por "gerar prompt", com um seletor de molde (`<select>` dos 4 tipoItem) ao lado do botão de copiar.
- CLI (`gerador implementar`) atualizado pra `gerarPrompt`, passando `quebra.demandInfo` pra seção de contexto.

Regressão completa (77 engine + 37 server + 86 web + 10 cli = 210 testes, lint e typecheck/build limpos nos 4 workspaces), rebuild Docker do zero (`down -v && up -d --build`, migração 0004 rodando limpa) com verificação real via HTTP dos 4 templates seedados batendo byte a byte com `TEMPLATE_PROMPT_PADRAO`, `graphify update .` (1366 nós, 2227 arestas, 111 comunidades).

## 30. SPEC-14 v3: "prompt" por atividade era o desenho errado — documento único por quebra

O §29 (v2) durou pouco: testado contra um cenário real (fluxo de aprovação de crédito, com orquestração/score/bureau externo/persistência/auditoria/reprocessamento), o resultado ficou ruim. Um documento por atividade atômica transformava "Setup inicial de srv-credito-api" — um passo técnico, não uma história de usuário — num "prompt" inteiro sozinho, com campos vazios e uma "História" degenerada ("Como \<papel\>, quero setup inicial de..."). O usuário apontou dois problemas ao mesmo tempo: **deveria ser um documento só pra quebra inteira**, e **"prompt" é o nome errado** — não é uma instrução de LLM, é um artefato estruturado que um subagente de refino consome depois.

Junto, uma observação que mudou a seção de fechamento do documento: **DoR/DoD são contextuais** — o motor pode *direcionar* com um baseline objetivo, mas a heurística fina de "o que realmente importa pra este fluxo" é trabalho do subagente de refino, não do engine determinístico. Isso valida (não corrige) a régua que já vinha sendo seguida pro resto do documento (Gherkin também é placeholder, não gerado) — só estava faltando aplicar a mesma régua ao DoD, e agora também ao DoR (novo).

**Duas perguntas resolvidas por `AskUserQuestion` antes de tocar em código** (mesma disciplina de sempre — não adivinhar escopo de novo depois de já ter adivinhado errado uma vez):
1. "Documento único" = um documento pra quebra inteira (não um por história/feature agrupando atividades relacionadas — essa segunda opção existia como alternativa, mas exigiria heurística de agrupamento que o engine não tem base pra fazer sozinho).
2. Os 4 templates por tipo de item (História/Task/Débito Técnico/Spike) viram **1 template só** — um documento que mistura tipos de atividade não tem um "tipo" único que faça sentido escolher o molde. A complexidade inteira do seletor de molde (que já tinha exigido uma correção de escopo dentro do próprio §29, ao descobrir que não existe editor de `tipo` na revisão) cai fora — nunca chegou a ser usada de verdade.

**Redesenho da estrutura do documento:** Contexto e "Visão geral" (a história PO) aparecem **uma vez**, no topo — não mais repetidos por atividade. Cada atividade vira uma seção numerada (`### N. rótulo — descrição`) dentro de "## Itens", carregando o que é legitimamente por-atividade (especificação técnica completa, refinamento técnico, critérios de aceite). Definition of Ready (nova) e Definition of Done fecham o documento, uma vez, cada uma com baseline objetivo + nota explícita "não é lista fechada, completar com base no contexto" — a forma escolhida de "direcionar sem decidir".

**Implementado:**
- `packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts` substitui `packages/engine/src/prompt/gerarPrompt.ts` (v2, removida) — assina `(atividades: Atividade[], diagrama, config, opcoes)` em vez de uma atividade só; 6 variáveis de topo (`titulo`, `contexto`, `historiaPo`, `itens`, `definitionOfReady`, `definitionOfDone`), a renderização de cada item dentro de `itens` não é template editável (só a estrutura de fora é).
- `packages/server`: tabela renomeada pra `especificacao_templates`, **um template por `timeId`** (não mais por `(timeId, tipoItem)`) — a migração `0004` foi **reescrita in-place**, não empilhada como `0005` (nunca rodou fora desta sessão de desenvolvimento, sem custo real de reescrever). **Achado real no processo**: o migrator do drizzle casa migração já aplicada pelo campo `when` (timestamp) do `_journal.json`, não pelo hash do conteúdo do arquivo — editar um arquivo de migração já aplicado sem bumping o `when` faz o novo SQL ser silenciosamente ignorado (a tabela nova nunca era criada, `GET` devolvia `undefined`, `PUT` 500 por relação inexistente). Descoberto rodando os testes de verdade contra o Postgres local (que já tinha a v2 aplicada) — corrigido bumping o timestamp, e confirmado com `docker compose down -v` (Postgres limpo) que a migração roda certo do zero também.
- `packages/web`: `PromptTemplatesTab.tsx` → `EspecificacaoTemplateTab.tsx` (editor único, sem cards por tipo); `ReviewScreen.tsx` perde o botão por linha — vira um botão no cabeçalho ("Especificação de entrega", ao lado de "Exportar .md") que abre um painel com o documento inteiro da quebra.
- CLI: `gerador implementar <quebra.json> [--out arquivo]` perde o argumento `<chave-ou-rótulo>` — não tem mais sentido pedir uma atividade específica quando a saída é o documento inteiro. Mesma forma de uso de `gerador derive` agora.
- Textos de UI/demo atualizados (`FakeTerminal.tsx`, `JourneyModal.tsx`, `README.md`) — "prompt de entrega"/"pacote de implementação" viraram "especificação de entrega" em todo lugar visível.

Regressão completa (77 engine + 37 server + 86 web + 8 cli = 208 testes — 2 a menos que o v2 porque o CLI perdeu os testes de "por chave" e "por rótulo", que não existem mais como conceito), lint e build limpos nos 4 workspaces, rebuild Docker do zero com a migração renomeada rodando limpa contra Postgres vazio, verificação real via HTTP do template global batendo byte a byte com `TEMPLATE_ESPECIFICACAO_PADRAO`, `graphify update .` (1361 nós, 2213 arestas, 111 comunidades).

Padrão que se repete pela terceira vez nesta sessão (SPEC-14 já foi corrigida em v1→v2→v3): a forma certa de uma entrega gerada por IA só aparece depois de testar contra um cenário de negócio real, não numa fixture sintética de 2 nós. As duas correções de escopo anteriores (Spike sem editor de tipo, RegrasConfig.tipos nunca lido) só apareceram ao verificar o código antes de implementar; esta terceira só apareceu ao *usar* o que foi implementado — reforça, de novo, a lição do §9: rodar de verdade encontra o que revisão de código não encontra.

## 28. Catálogo de tipos de nó: cache, storage, batch, gRPC, GraphQL

Usuário decidiu postergar o hospedar em nuvem (Fase D fica "com o caminho pavimentado", sem `apply`) e pediu mais tipos prontos no catálogo — Kafka já existia com bastante detalhe, então o pedido era por categorias novas, não mais profundidade nas existentes. Perguntado quais entravam nesta rodada (via `AskUserQuestion`, pra não adivinhar escopo de novo): **cache (Redis/Caffeine), storage de objeto (S3), serviço de batch (Spring Batch), gRPC, GraphQL**.

**Duas formas de modelar tecnologia nova, escolhidas por analogia com o que já existe:**
- **Recurso de dados novo** (cache, storage) — mesmo padrão de Mongo/SQL: um `nodeType` próprio, `derives` genérico (cai no caminho `default` de `derivarNo`, idêntico ao de `queue`/`datastore` — só "service" tem derivação especial), `edgeRules` aceitando `reads`/`writes`/`readwrite` como destino.
- **Serviço de processamento** (batch) — mesmo padrão de Job/Scheduler: `nodeType` com seus próprios campos (chunk size, skip/retry, restart de checkpoint — específicos de Spring Batch, não genéricos de "job"), `edgeRules` aceitando `triggers` como destino.
- **Protocolo de chamada síncrona interna** (gRPC, GraphQL) — **não** viraram `nodeType` novo. Modelados como mais dois `edgeType` (ao lado do `http` que já existia), válidos como conexão pra dentro de "Serviço" — o mesmo padrão do cenário `internal.json` (dois serviços, um `http` entre eles), só trocando o protocolo. Dois campos condicionais novos em "Serviço" (`contratoGrpc`, `contratoGraphql`, ambos `when: hasIncomingEdge`) guardam o contrato — mesma técnica já usada pelo Kafka pra campos que só aparecem quando há aresta de um tipo específico entrando no nó.

Essa segunda decisão evitou duplicar "Serviço" em variantes por protocolo — um serviço que expõe REST, gRPC e GraphQL ao mesmo tempo continua sendo um nó só, com os três contratos coexistindo como campos condicionais independentes.

**5 cenários novos** (`config/cenarios/{cache,storage,batch,grpc,graphql}.json`, registrados em `index.json`, catálogo salta de 11 pra 16): cache de cotação de frete (Redis, TTL curto), comprovante fiscal em storage de objeto (retenção de 5 anos), job de fatura mensal em lote (lê `tb_pedidos_pendentes`, escreve `tb_faturas`, chunk 200, restartável), recomendação chamando catálogo via gRPC (alto volume, overhead de REST seria caro), painel admin consultando pedidos via GraphQL (dado aninhado, evita múltiplas chamadas REST). Cada um validado rodando `derivar()` de verdade contra a config real antes de entrar no repositório (mesmo critério desde SPEC-04 §8) — achado no caminho: os três contextos novos (`Backend-cache`, `Backend-storage`, `Backend-processamento em lote`) precisavam estar na lista `app.json.contextos` também, não só no `nodeType` — `validateConfig` rejeita contexto usado e não declarado, pegou os três de primeira.

Refinamento técnico ganhou entradas pros três contextos novos (`config/regras.example.json`): estratégia de invalidação/fail-open pra cache, política de acesso/ciclo de vida pra storage, restart de checkpoint/skip-retry/chunk size pra batch — cada um com 1 teste automatizado sugerido também, mesmo padrão dos contextos já existentes.

`config/diagrama.example.json`, `config/app.example.json`, `config/regras.example.json` e os três espelhos em `packages/cli/templates/` mudaram em conjunto, como sempre (JOURNEY §18: "os dois arquivos sempre sincronizados"). Validado: `gerador init` num diretório novo já inclui os tipos novos no template copiado; rebuild completo do Docker do zero servindo os 5 tipos/2 edges novos em `/config/diagrama.json`; regressão dos 4 workspaces (71+86+10+32 = 199 testes) verde; `graphify update .` (1332 nós, 2144 arestas, 105 comunidades).

## 31. Critérios de aceite deixam de ser um placeholder único — boas práticas por tipo de integração, configuráveis

Usando a especificação de entrega contra o cenário real de aprovação de crédito (§30), o usuário reparou que todo item saía com o mesmo placeholder genérico de Gherkin (`Dado <contexto> / Quando <ação> / Então <resultado esperado>`), inclusive pra tipos com comportamento bem conhecido (chamada REST, mensageria). Pergunta certa: "é algo que falta, ou como podemos melhorar?"

Resposta: nem bug nem lacuna — é o design do SPEC-14 §3 funcionando como esperado (o motor nunca inventa lógica de negócio). Mas cenário de teste *técnico* (não de negócio) por tipo de integração é conhecimento genérico, replicável — REST sempre tem 2xx/4xx, Kafka sempre tem DLQ, SQL sempre tem constraint — e isso o motor pode direcionar sem alucinar. O usuário confirmou: manter o motor genérico/determinístico, mas encapsular essas boas práticas como scaffold configurável, editável pelo usuário se quiser (deu o exemplo concreto: status code explícito nas chamadas REST).

**Implementado, mesmo mecanismo de `specResumo`/`specResumoPorAresta` (nada novo inventado):** `NodeTypeConfig` ganhou `cenarioGherkinPadrao` (scaffold do tipo de nó) e `cenarioGherkinPorAresta` (override por tipo de aresta de entrada — ex.: Kafka "publica" e "consome" são cenários diferentes, não o mesmo texto). `gerarEspecificacaoEntrega` resolve por precedência (`porAresta` do nó alvo → `padrao` do nó alvo → placeholder genérico) via `resolverCenarioGherkin`, reaproveitando a mesma convenção de "o nó ALVO decide" já usada pelo resumo de spec.

Pesquisado e escrito scaffold de boas práticas pra todos os 14 tipos de nó (REST com status code explícito 2xx/4xx, gRPC com status code gRPC, GraphQL sem over/under-fetch, Kafka publish/consume/pubsub com schema registry e DLQ, Rabbit publish/consume/pubsub com routing key e DLQ, SQL/Mongo com constraint e transação, Camunda com compensação, FICO com fallback de timeout, API Externa com rate limit, Job com política de sobreposição, Regra com auditoria, Cache com invalidação, Storage com política de acesso, Batch com checkpoint/restart) — populados em `config/diagrama.example.json` e `packages/cli/templates/diagrama.json`, os dois sempre sincronizados.

Validado contra o mesmo cenário real que expôs o problema (`config/cenarios/credito-completo.json`, 14 atividades): antes, 14/14 itens caíam no placeholder genérico; depois, 14/14 saem com cenário de boas práticas específico do tipo — incluindo o item de API Externa (o "BFF" do print do usuário) agora com `Então a resposta retorna 2xx dentro do timeout configurado` / `4xx/5xx` explícitos. Regressão completa (80 engine + 37 server + 86 web + 8 cli = 211 testes) verde, 3 testes novos dedicados ao mecanismo de resolução (porAresta > padrão > genérico).

Isso reabre diretamente as ideias registradas em §13/§14/§19 (repositório de padrões, referências de código real, base de conhecimento pros agentes) — o usuário pediu na sequência pra planejar essa peça maior, integrada ao Graphify e usando Obsidian (em vez de Confluence) como armazenamento simples, cobrindo tanto o projeto quanto esses padrões default. Fica como o próximo SPEC a desenhar antes de codar, mesma disciplina de sempre.

## 32. SPEC-16: base de conhecimento via Obsidian + Graphify, `gerador export-vault`

Antes de codar, três perguntas de escopo resolvidas via `AskUserQuestion` (mesma disciplina desde a correção do SPEC-13): (1) `referencias` reganha vínculo com código real — "caminho de arquivo ou id de nó do grafo"; (2) `linkConfluence` vira `linkExterno`, genérico; (3) um comando novo orquestra a geração do vault, mas o que for natural na UI (criar/editar referência) continua na UI. Desenho completo registrado em SPEC-16 antes de tocar código.

**Decisão de arquitetura:** duas peças que escrevem no mesmo vault, nunca acopladas em código — o Graphify já sabe extrair e exportar o grafo de código como notas Obsidian (`graphify export obsidian`, comando externo, já existe); este projeto só *complementa* esse vault com o que só ele sabe (racional humano das referências, e os padrões default já configurados em `diagrama.json`/`regras.json`). Convenção de pasta (`<vault>/referencias/`, `<vault>/patterns/`), não integração de código.

**`referencias` ganha `codigoRelacionado: string[]`** (caminhos de arquivo, texto livre — nunca conteúdo/snippet, mesma disciplina da Fase A) e `linkConfluence` vira `linkExterno`. Migração nova (`0005_referencias_codigo_e_link_externo.sql`, não editada em cima da 0004 — Postgres já podia ter dado real do usuário nessa tabela). `packages/web/src/demo/ReferenciasTab.tsx` ganha o campo de código relacionado e a cópia introdutória passa a falar de Obsidian, não só Confluence.

**Achado real, só visível rodando `graphify export obsidian` de verdade contra este repo (não suposto durante o plano, como o próprio plano já sinalizava):** o nome de arquivo de cada nota **não é** o basename do arquivo-fonte — o Graphify tem seu próprio esquema de desambiguação pra colisão de nome entre pastas (ex.: `config/types.ts` e `model/types.ts` colidiriam como `types.ts.md`, então o Graphify usa `configtypes.ts.md`/`modeltypes.ts.md`). `gerador export-vault` nunca tenta reimplementar esse esquema — em vez disso, **indexa as notas que o Graphify já gerou** (lê o frontmatter `source_file` de cada `.md` do vault) e resolve o wikilink contra esse índice. Entre notas com o mesmo `source_file` (arquivo inteiro vs. símbolos dentro dele, que também carregam o mesmo `source_file`), a nota do arquivo é identificada como a que tem título igual ao basename do caminho.

**Novo comando `gerador export-vault [--dir <vault>] [--server-url <url>]`** (`packages/cli/src/commands/exportVault.ts`) — primeiro comando do CLI a chamar o server (`GET /referencias`, rota já pública, sem sessão nova pra inventar). Erro claro se o vault não existe ainda ("rode `graphify export obsidian` primeiro"). Pra cada referência: escreve `<vault>/referencias/<slug>.md` com o racional e uma seção "Código relacionado" — caminho resolvido vira wikilink `[[nota]]`, caminho não mapeado fica listado explicitamente, nunca inventa link (mesma disciplina de `naoMapeados` do `importarGrafo.ts`, MVP5, §10). Pra cada tipo de nó em `config/diagrama.json`: escreve `<vault>/patterns/<tipo>.md` com campos-chave, o cenário Gherkin já configurado (§31) e o refinamento técnico relevante (reaproveita `gerarChecklistTecnico`/`gerarCiclosDeTeste` do engine, sem duplicar lógica). Idempotente: nome de arquivo determinístico (slug), reescreve em vez de duplicar.

**Segundo achado real, este só apareceu na validação de ponta a ponta (não no `graphify export obsidian` isolado nem em teste sintético):** as notas do Graphify usam `\r\n` (CRLF), não `\n`. O regex inicial de extração de frontmatter (`/^---\n([\s\S]*?)\n---/`) exigia LF puro logo após `---` — contra um vault sintético de teste (escrito com `\n` pelo próprio teste) isso passava, mas contra o vault real gerado pelo Graphify o frontmatter nunca casava, e toda referência caía no ramo "não encontrado no vault", mesmo com a nota existindo. Corrigido pra `/^---\r?\n([\s\S]*?)\r?\n---/`; fixture do teste reescrita pra usar `\r\n` (reproduzindo o formato real), garantindo que a suíte pega essa regressão de novo se voltar.

**Validação real, mesmo padrão do resto do projeto:** rodou `graphify export obsidian` de verdade contra este repo (1472 notas), subiu a stack Docker com a migração 0005 aplicada, logou via `AUTH_MODE=dev`, criou uma referência de verdade via API apontando pra `packages/engine/src/derive/derivar.ts` (arquivo real, nó real no grafo) mais um caminho propositalmente inexistente, rodou `gerador export-vault --dir graphify-out/obsidian --server-url http://localhost:4000` contra o vault real — antes do fix de CRLF, o wikilink não resolvia (achado acima); depois do fix, `[[derivar.ts]]` aponta pra uma nota que o Graphify de fato gerou, e o caminho inexistente ficou listado como não encontrado, sem link inventado.

Regressão completa: 80 engine + 37 server (Postgres limpo, `docker compose down -v && up -d db`) + 86 web + 13 cli (5 novos de `exportVault`, cobrindo nota gerada, wikilink resolvido, caminho não mapeado, idempotência em duas execuções, erro claro sem vault/sem server) = 216 testes verdes. Build e lint do CLI limpos. Rebuild Docker completo do zero (`docker compose up -d --build`) validado com a migração 0005 aplicada sem erro.

## 33. Feedback de uso real: 500 faltando, coluna "Times" confusa, banco sem massa de dados fake

Usuário testou o backlog derivado contra o cenário real de crédito e trouxe três achados num só print/mensagem — cada um resolvido de forma diferente, sem misturar escopo.

**1. Cenário Gherkin padrão de "Serviço" só cobria 2xx/4xx, faltava 500.** `cenarioGherkinPadrao` (o scaffold do §31 pro nó "service") tinha só dois cenários (sucesso, erro de cliente); o terceiro cenário universal de qualquer endpoint REST — erro inesperado no processamento, resposta 500 sem vazar detalhe interno — não existia. Adicionado um terceiro bloco Gherkin em `config/diagrama.example.json` e no espelho `packages/cli/templates/diagrama.json` (os dois sempre sincronizados). Único lugar do catálogo com essa lacuna — "API Externa" e a aresta `http` de chamada síncrona já cobriam 5xx desde o §28/§31.

**2. Coluna "Times" no backlog.md parecia dado quebrado.** Investigação (não era bug): `timesEnvolvidos` (`derivar.ts`) só é populada quando uma atividade toca um nó **existente** cujo dono (`no.time`) é diferente do time da própria quebra — um alerta deliberado de "isso esbarra num sistema de outro time". Numa tabela de 13 linhas isso deixava a coluna vazia em 12 delas, lendo como quebrado em vez de intencional. Perguntado ao usuário via `AskUserQuestion` o que fazer com a coluna e o que "elegante" significava pro artefato — respostas: remover a coluna da tabela principal; "elegante" = melhorar o próprio markdown (não construir um visualizador novo no app agora). `paraMarkdown` (`packages/engine/src/export/exportar.ts`) mudou: tabela perde a coluna "Times"; quando existe pelo menos uma atividade cross-team, uma seção nova "## Atenção: toca sistemas de outros times" lista só essas, com o time. `paraCsv` não mudou — é dado pra consumo programático, a coluna ali continua fazendo sentido.

**3. Banco sem massa de dados fake — as features novas desta sessão inteira não tinham nenhum exemplo persistido.** Escopo confirmado via `AskUserQuestion`: dados seedados no Postgres (não cenários do canvas, que já cobrem os tipos novos desde o §28, e não geração antecipada de especificação/vault). Convenção já existente desde `0000_init.sql`/`0001_auth_e_campos_no.sql` (seed por `INSERT` direto na migração, com comentário explicando o "porquê", não script à parte) — seguida sem inventar mecanismo novo. Nova migração `0006_dados_demo.sql`:
- Uma `quebras` salva com 11 nós/6 arestas cobrindo os 5 tipos/edges novos do catálogo juntos (cache, storage, batch, gRPC, GraphQL) — nós e specs copiados literalmente dos cenários já validados em `config/cenarios/{cache,storage,batch,grpc,graphql}.json`, só renumerados pra caber num diagrama só, presa a `time-pagamentos` (time que `dev@gerador.local` já pertence, sem criar time novo só pra isso).
- Duas `referencias` novas com `codigoRelacionado`/`linkExterno` de verdade preenchidos (a única referência seedada antes, em `0000_init.sql`, é anterior a esses dois campos existirem) — uma com link publicado, outra sem, as duas variações que a UI precisa saber renderizar.

**Achado ao validar (não bug, erro de script):** a primeira tentativa de conferir a seed via API voltou 0 referências/0 quebras — não porque a migração falhou (`drizzle.__drizzle_migrations` confirmava as 7 aplicadas), mas porque a suíte `packages/server` tinha acabado de rodar contra esse mesmo Postgres, e seu `beforeEach` faz `TRUNCATE` em `quebras`/`referencias` (entre outras) antes de cada teste — a última truncagem da suíte fica sem nada depois pra repopular. Lição: validar seed de dados sempre num container que não rodou a suíte de testes depois da migração, não só "um Postgres limpo" (as duas coisas não são a mesma garantia).

**Validação real:** `docker compose down -v && up -d --build` (sem rodar a suíte depois), `GET /referencias` (3 linhas, as 2 novas com os campos certos) e `GET /quebras` (1 linha) confirmados via API; `POST /quebras/:id/derivar` na quebra seedada devolveu as 14 atividades esperadas, zero ciclos/conflitos, `podeDerivar: true` — inclusive o item de cache com `specResumo` (Redis/TTL/eviction), o de storage (política de acesso/criptografia), o de batch (chunk/skip/reiniciável), e as duas arestas gRPC/GraphQL.

Regressão completa: 82 engine (+2 novos em `exportar.test.ts` pro fim da coluna Times) + 37 server (Postgres limpo, migração 0006 aplicada) + 86 web + 13 cli = 218 testes verdes.

## 34. SPEC-17: pivô pra CLI local-first — o rumo do produto reaberto de propósito

Testando a Fase F na prática, o usuário achou a apresentação de links externos/documentos ruim — e em vez de pedir um ajuste visual, parou pra questionar o rumo maior: "precisamos tomar algumas decisões sobre o rumo do projeto". A ideia dele: o `gerador` funcionar como o Graphify — instalável na máquina com um comando, integrado ao Claude Code do mesmo jeito que `/graphify`, "se virando sozinho" sem servidor. Resolvido via `AskUserQuestion` (três perguntas, respostas sem ambiguidade): substituir o modelo hospedado (não coexistir com ele); dados do time em "pasta simples, com os markdowns" (não integração de git dentro da ferramenta); Obsidian vira dependência obrigatória, com redirect direto em vez de visualizador próprio.

Antes de planejar, dois agentes Explore em paralelo levantaram fatos concretos (não recomendações): o que já é 100% local hoje no `packages/cli` (tudo, exceto `export-vault`, que ainda chamava o server), o que no `packages/server`/`packages/web` é conceitualmente "config do time" vs. autenticação/multi-usuário, e — achado que mudou o tom do plano inteiro — **isso já é, em boa parte, reviver um modelo que existiu antes da Fase A**: o próprio `packages/server/src/db/schema.ts` documentava que `referencias` "substitui o armazenamento de trecho de código local (`config/referencias/*.json`)" e que `perfis_time` é "a mesma forma que antes vivia em `perfis-time.json` local" (§14/§18). Reverter não foi inventar design novo, foi voltar pro que já tinha sido validado, com os campos que a Fase F acrescentou.

**O que foi implementado (fatia 1, plano completo em SPEC-17):**

1. **`config/referencias/*.json` revivido**, agora com `codigoRelacionado`/`linkExterno`. Um arquivo por referência, texto editável à mão (mesma disciplina de `perfis-time.json`), todos os campos exceto `titulo`/`racional` opcionais. `gerador init` semeia dois exemplos (os mesmos textos ilustrativos já usados na seed do Postgres, reaproveitados em vez de inventados de novo).
2. **`gerador export-vault` fica 100% local** — removida a única chamada de rede que sobrava no CLI inteiro (`fetch(serverUrl + "/referencias")`). Lê `config/referencias/*.json` do diretório atual.
3. **Redirect direto pro Obsidian, não visualizador próprio.** Depois de materializar as notas, o comando imprime `obsidian://open?vault=<nome>&file=<primeira-referência>`; nova flag `--vault-nome` (o nome registrado no Obsidian pode divergir do nome da pasta) e `--abrir` (lança a URI via `start` no Windows). A resposta pro "visualização dos docs ficou ruim" não foi um visualizador melhor — foi não ter visualizador nenhum, abrir onde já é bonito.
4. **CLI empacotado pra instalação global de verdade.** `packages/cli/package.json` ganhou `files`/`README.md`; a dependência de `@gerador/engine` (workspace-only, já bundlada no `dist/cli.js` via `tsup.noExternal`) moveu de `dependencies` pra `devDependencies` — deixada em `dependencies` quebraria a instalação de um pacote empacotado fora do monorepo, tentando resolver do registry um pacote que só existe como link de workspace. `private: true` mantido de propósito (instalação é local via `npm pack`/`npm link`, não publicação num registry público).
5. **Skill do Claude Code corrigida — dois bugs reais achados na auditoria, não hipotéticos:** o exemplo de `quebra.json` na skill ainda tinha o campo `produto`, removido na Fase B (§21); a seção de `implementar` ainda documentava um segundo argumento `<chave-ou-rótulo>`, removido no redesenho SPEC-14 v3 (§30) — a skill descrevia um comando que não existe mais exatamente daquele jeito há duas fases. Corrigidos os dois, adicionada a seção de `export-vault` (ausente da skill desde que o comando foi criado no SPEC-16), e `scripts/gerador.ps1` simplificado pra preferir o `gerador` do PATH (instalação global) — só cai pro build de desenvolvimento do repositório como fallback, mesmo espírito de como a skill do Graphify só chama `graphify` já instalado.

**Achado durante a implementação, documentado com honestidade em vez de escondido:** `gerador open` resolve o build de `packages/web` por caminho relativo dentro do monorepo (`../../web/dist`) — uma instalação global de `@gerador/cli` fora do checkout não encontra esse build. Todos os outros comandos (`derive`, `implementar`, `init`, `import-graphify`, `export-vault`) não têm essa limitação. Registrado no `README.md` do pacote e em SPEC-17 §8/§9 como trabalho de Fase H, não escondido nem resolvido às pressas fora do escopo combinado.

**Fora de escopo desta rodada, registrado, não feito:** migrar o canvas web pra funcionar sem Postgres/login (Fase H — maior que esta rodada); o wire-up automático do Graphify que o usuário pediu no meio da conversa ("tem um comando pra deixar isso automático, não precisar ficar pedindo") fica bloqueado porque **este repositório não é um repositório git** — um hook de post-commit não tem onde pendurar, e `git init` é uma decisão do usuário, não algo pra assumir no meio de uma resposta a outro pedido.

**Validação real, de ponta a ponta:** `npm pack` gerou o tarball (`dist/` + `templates/`, incluindo a subpasta `referencias/` nova — conferido listando o `.tgz`), instalado globalmente (`npm install -g`), testado inteiramente **fora do repositório** (`$env:TEMP\gerador-validacao-real`): `gerador --help` funcionou sem nenhuma referência ao caminho do repo; `gerador init` criou `config/` completo incluindo os dois exemplos de referência; `gerador export-vault` contra um vault Obsidian mínimo fabricado no próprio diretório de teste materializou as notas certas, com o wikilink resolvendo pro `derivar.ts.md` presente e o caminho ausente listado como não encontrado (sem link inventado) — confirmando que o comando roda de fato sem o monorepo por perto. Pacote de teste desinstalado e artefatos temporários limpos depois da validação.

Regressão completa (nada mudou fora de `packages/cli` + a skill nesta rodada): 82 engine + 37 server + 86 web + 17 cli (9 testes reescritos/novos em `exportVault.test.ts` — fixtures locais em vez de mock de `fetch`, URI do Obsidian, `--vault-nome`, `--abrir` mockado) = 222 testes verdes. Build e lint do CLI limpos. `graphify update .` refeito depois de todo o código novo.

**Follow-up na mesma sessão: `git init` + hook automático do Graphify, com confirmação explícita do usuário.** O bloqueio registrado acima (repositório não era git) foi resolvido a pedido direto ("pode fazer"). Achado no caminho: **Git não estava instalado nesta máquina** (não em `Program Files`, não via `where.exe`, não via `winget list`) — em vez de assumir um jeito de instalar, perguntado ao usuário via `AskUserQuestion` (winget vs. instalação manual vs. pausar); confirmado winget, `winget install --id Git.Git -e` rodou limpo. `$env:PATH` de processo não persiste entre chamadas de ferramenta neste ambiente (cada `PowerShell` roda um processo novo) — cada comando git subsequente precisou reprefixar `C:\Program Files\Git\cmd` no `$env:PATH` daquela chamada.

Antes do primeiro commit, checagem de segredo (`git add -A -n` a seco, grep por `secret|credential|password|\.env$` na lista de arquivos que seriam adicionados) — só `.example`/templates apareceram; `.env` e `infra/secrets/.env` reais existem no disco mas o `.gitignore` já os exclui corretamente, confirmado que não apareciam nem no dry-run. Identidade git configurada só **local** ao repositório (`git config user.name/user.email`, sem `--global`) — não altera identidade de outros repositórios/ferramentas nesta máquina. Commit inicial (233 arquivos), depois `graphify hook install` (post-commit + post-checkout + driver de merge pro `graph.json`, evita conflito feio nesse arquivo gerado) e `graphify claude install` (escreve a seção `## graphify` em `CLAUDE.md` do projeto + registra hooks `PreToolUse` em `.claude/settings.json` — Claude Code passa a consultar o grafo antes de responder pergunta de código e a saber quando ele está desatualizado, sem precisar que o usuário peça). Segundo commit cobrindo os três arquivos novos da integração — o commit disparou o hook de verdade (`[graphify hook] launching background rebuild` apareceu no output), confirmando o mecanismo funcionando de ponta a ponta, não só instalado.

Nota: o hook vive em `.git/hooks/`, não versionado por git — é local a este clone, não algo que "vem junto" pra quem clonar o repositório depois. Quem quiser o mesmo comportamento automático no próprio checkout roda `graphify hook install` uma vez.

## 35. SPEC-17 fatia 2: publicação pública no npm — "gostaria que este projeto também funcionasse assim"

O usuário perguntou, especificamente, como a instalação do Graphify funciona de verdade — baixa o projeto do GitHub, ou um artefato pronto com as dependências? E deixou claro que queria o `gerador` funcionando do mesmo jeito. Pesquisa real em vez de suposição: `npm view graphifyy` e `npm view @sentropic/graphify` confirmaram que o Graphify publica nos dois ecossistemas (PyPI `graphifyy` e npm `@sentropic/graphify`) — `pip install`/`npm install -g` baixam um **artefato já compilado de um registry público**, com dependências resolvidas automaticamente; o GitHub é só onde o código-fonte mora, não o que a instalação de fato usa.

Isso expôs que a fatia 1 (§34) tinha ficado num meio-termo: `private: true` + `npm pack`/`npm link` local "funciona", mas exige clonar o repositório — não é realmente "funcionar como o Graphify". Antes de mudar isso, dois pontos exigiam decisão do usuário, não suposição:

1. **Visibilidade** — publicar no registry público torna o código (JS legível, sem como ofuscar de verdade) baixável e indexável por qualquer pessoa, e o npm restringe bastante despublicar depois de 72h. Perguntado via `AskUserQuestion`: público, igual ao Graphify — confirmado, sem ambiguidade.
2. **Nome do pacote** — `gerador` sozinho já está ocupado no npm por um pacote não relacionado ("Gerador de dados brasileiros", achado via `npm view gerador`). Perguntado entre escopo pessoal, escopo de organização (`@gerador/cli`, exigiria criar uma org no npm primeiro), ou nome sem escopo — escolhido **sem escopo**: `gerador-de-itens`, confirmado livre.

No meio da mesma conversa, um comentário à parte do usuário — "nesse contexto autenticação pode não fazer mais sentido" — apontou uma consequência lógica direta do pivô: um CLI que roda na máquina de cada pessoa não tem "quem logar" nele, então a Fase B/B.1/B.2 inteira (OIDC, organização, times, membros) perde a razão de existir por padrão nesse modelo. Registrado em SPEC-17 §3 como uma razão mais forte pra eventualmente descontinuar `packages/server` — mas **não implementado**: é código grande (três fases inteiras) e a observação foi uma reflexão em aberto, não uma instrução de remover. Fica marcado, não removido, mesma disciplina de sempre.

**Preparação concreta pro publish** (a publicação de verdade ainda não aconteceu — depende do usuário logar no npm, algo que esta sessão não roda de forma interativa e que não é apropriado eu fazer com credencial de conta pessoal):
- `packages/cli/package.json`: `name` → `gerador-de-itens`, `private: true` removido, `license: "MIT"` + `keywords` adicionados. Confirmado que nada mais no monorepo referenciava o pacote pelo nome antigo (`@gerador/cli`) antes de renomear.
- `packages/cli/LICENSE` (MIT) novo.
- `npm publish --dry-run` rodado duas vezes — a primeira apontou um bug real: `"bin": {"gerador": "./dist/cli.js"}` com o prefixo `./` é inválido pro publish do npm, que o **auto-corrige removendo o `bin` inteiro silenciosamente** (só um `npm warn`, fácil de não notar) — se publicado assim, o comando `gerador` simplesmente não existiria pra quem instalasse do registry. Corrigido pra `"dist/cli.js"` sem prefixo via `npm pkg fix`; segundo dry-run limpo, sem correção nenhuma.
- READMEs (raiz e `packages/cli`) atualizados pra `npm install -g gerador-de-itens` como caminho principal, mantendo a instalação a partir do código como opção pra quem for contribuir/testar mudança local.

Regressão: build + suíte do CLI (17/17) reconfirmados depois do rename do pacote, `npm install` na raiz pra regenerar o lockfile com o novo nome.

## 36. Fechando o pivô: GitHub real, CI/CD verde, repositório privado, e a publicação que quase não saiu por um motivo banal

**"Falta alguma coisa? Temos que rever demo... CI/CD fica mais simples também."** Levantamento honesto do que faltava (não uma lista genérica — investigação real: `FakeTerminal.tsx` lido, achado que não tinha o passo de instalação nem `export-vault`; `ReferenciasTab.tsx` lido, achado que já tinha sido atualizado na Fase F exceto uma linha de rodapé dizendo "grava direto no servidor" sem contexto): faltava o repositório nunca ter sido enviado pro GitHub (só existia `git init` local), CI/CD ainda desenhado pro modo hospedado (Docker/GCP), e esses dois furos na demo.

**Git e GitHub CLI não estavam instalados nesta máquina** (achado real via `Get-Command`/`where.exe`, não suposto) — instalados via `winget` com confirmação explícita do usuário antes de cada um. `gh auth login` é do usuário (OAuth, não automatizável); confirmado autenticado (`silvioAL`) só depois que o usuário disse "logado, pronto". Repositório criado público (`gh repo create --public`), push dos commits locais, confirmado via `gh repo view --json pushedAt,visibility`.

**CI quebrou nas duas primeiras tentativas no GitHub** (Ubuntu, ambiente real, diferente desta máquina Windows) — achado real, não hipotético: o teste `--abrir chama o launcher do SO` assumia `process.platform === "win32"` implicitamente (rodava só nesta máquina de dev), e no Ubuntu do CI o ramo "não suportado" nunca chama `exec`, fazendo o teste falhar. Corrigido forçando `process.platform` via `Object.defineProperty` nos dois cenários (Windows chama exec, outros SOs só avisam) — determinístico em qualquer SO, não só "passa na minha máquina". Terceiro push: CI verde de verdade.

**CI/CD atualizado pro modelo novo:** `deploy.yml` (Docker/GCP) virou `workflow_dispatch` manual — disparar automático a cada push contra uma VM que talvez nem exista (`terraform apply` nunca rodou) só gerava execução inútil. `publish.yml` novo, disparando em tag `v*`, builda e publica `packages/cli`.

**Demo atualizada** pros dois furos achados: `FakeTerminal.tsx` ganhou o passo `npm install -g gerador-de-itens` e o comando `export-vault`; a tabela de comandos em `JourneyModal.tsx` ganhou a mesma entrada; `ReferenciasTab.tsx` teve a linha "grava direto no servidor" reescrita pra deixar claro que é o modo hospedado (dormente), com o caminho padrão (`config/referencias/*.json`) mencionado ao lado — sem reescrever o componente inteiro, que já estava majoritariamente certo desde a Fase F.

**Decisão reaberta em seguida: repositório privado.** Depois de ver o repositório público de verdade no GitHub, o usuário decidiu trocar — só o GitHub (código-fonte, `JOURNEY.md`, SPECs — "o processo"), mantendo o pacote público no npm ("o artefato"). Não é incoerência: são dois registros com propósitos diferentes. Consequência técnica real, corrigida antes de virar erro em produção: `--provenance` no `publish.yml` (adicionado pensando em repo público) exige repositório público — removido, junto da permissão `id-token: write` que só existia por causa dele.

**A pergunta que evitou um problema real: "esse token não é temporário? vou ter que trocar toda hora?"** Puxou uma pesquisa que revelou que a resposta original (token de automação clássico) **já não existe mais** — o npm revogou todos os tokens sem expiração em dez/2025, e qualquer token novo com escrita tem no máximo 90 dias. A resposta certa, confirmada na documentação oficial (não assumida de memória, que estava desatualizada): **Trusted Publishing via OIDC**, GA desde jul/2025, funciona com repositório privado, nunca expira, nunca precisa trocar. `publish.yml` reescrito: `node-version: "22"` (Trusted Publishing exige npm ≥ 11.5.1), `id-token: write` de volta (motivo diferente da vez anterior — agora é OIDC, não provenance), `--no-provenance` explícito (Trusted Publishing liga provenance por padrão, que falharia em repo privado).

**A publicação real travou três vezes seguidas com o mesmo erro genérico** (`403`, "2FA ou token com bypass é necessário") — com OTP digitado à mão, e depois com dois tokens granulares diferentes configurados exatamente como a documentação recomenda (`Read and write`, `All packages`, `Bypass two-factor authentication` marcado, confirmado via screenshot). A hipótese trabalhada foi que era um bug conhecido do npm CLI (`npm/cli#9268`, pesquisado e citado com a issue real, sintomas batendo — primeira publicação de pacote novo, token com bypass corretamente configurado, mesmo erro) — pesquisa legítima, não desperdiçada, só superada por uma causa mais simples e real: checando `Account Settings` → `Two-Factor Authentication` no site do npm, o botão dizia **"Enable 2FA"**, não "Manage" — a conta nunca tinha 2FA configurado. O "código OTP" fornecido não podia ser válido porque não existia autenticador nenhum gerando código pra essa conta; o token de bypass provavelmente é rejeitado por bypassar um fator que nunca existiu. Usuário ativou 2FA de verdade (QR code); `npm publish` sem nenhuma flag caiu então num fluxo diferente e correto (`EOTP`, URL de autorização via browser) — que veio mascarada em qualquer saída não interativa, então precisou ser o usuário rodando no próprio terminal pra ver e abrir o link real. Publicou de primeira depois disso.

**Validação real, mesmo padrão de sempre — não bastou "o comando não deu erro":** `npm view gerador-de-itens` confirmou `0.1.0` no registry público; `npm install -g gerador-de-itens` rodado de um diretório temporário fora do repositório, `gerador --help` funcionando — comando publicado de verdade, baixado do registry, não de um tarball local. Pacote de teste desinstalado, diretório temporário limpo.

Fica em aberto, registrado, não implementado: configurar o Trusted Publisher em `npmjs.com` (agora possível, já que `v0.1.0` existe) — depois disso, `git tag vX.Y.Z && git push --tags` publica sozinho, sem OTP, pra sempre.

## 37. Trusted Publisher configurado — e testado de verdade, não só confiado

Usuário configurou o Trusted Publisher no site do npm e pediu explicitamente pra testar, não assumir que ia funcionar — mesma disciplina de sempre, aplicada a uma peça de infra em vez de código de produto. Bump de versão real (`v0.1.1`), tag, push: **falhou**, com um erro enganoso — `404 'gerador-de-itens@0.1.1' is not in this registry`, parecendo um problema de configuração do Trusted Publisher em si, não de autenticação.

Investigação do log completo (não só a última linha de erro) achou a causa real: `actions/setup-node@v4` com `node-version: "22"` instala Node 22.23.1, que vem com **npm 10.9.8** — abaixo do 11.5.1 que o Trusted Publishing exige. Sem OIDC suportado nessa versão, `npm publish` virou uma chamada sem autenticação nenhuma; o registry devolveu 404 (não confirma existência de pacote pra quem não está autenticado) em vez de um erro mais direto — por isso o sintoma não apontava pra causa óbvia.

Corrigido com `npm install -g npm@latest` explícito logo após o `setup-node` (a versão do Node não garante a versão do npm bundled ser recente o bastante). Testado de novo com `v0.1.2`: sucesso — `npm view gerador-de-itens version` confirmou `0.1.2`, `dist-tags` confirmou `latest: 0.1.2`. Publicado inteiramente por `git tag v0.1.2 && git push origin v0.1.2`, zero intervenção manual, zero OTP, zero token.

Terceira vez nesta sessão que "parece que devia funcionar" não bastou como validação (SPEC-14 v1→v2→v3, `gerador export-vault` com o CRLF do Graphify, agora o pipeline de CI/CD) — só rodar de verdade contra o ambiente real (aqui, o runner do GitHub Actions, que não é a máquina de dev) encontrou o gap. SPEC-17 fecha completo: `gerador-de-itens` publicado, instalável por qualquer pessoa com `npm install -g gerador-de-itens`, e toda versão futura publica sozinha numa tag.

## 38. Fase I: documentação + `gerador open`/skill empacotados de verdade — achado real numa máquina corporativa

Pedido do usuário: melhorar o README (mais claro, com instruções de deploy agora que o repo é privado) e melhorar a demo dentro do app (autoplay, cobrindo CLI/skill que hoje faltavam). No meio da investigação, uma pergunta simples — "mas como que a pessoa vai rodar esse binário e usar o sistema?" — expôs um problema real que a documentação sozinha não resolvia: `gerador open` (o editor visual) só funcionava rodando de dentro do monorepo clonado (`packages/cli/README.md` já documentava isso como "limitação conhecida"), e a skill do Claude Code só existia no repositório, que é privado — quem só tinha o pacote npm não tinha como pegar nenhum dos dois.

**Corrigido, não só documentado:**
- `packages/cli/scripts/copy-web-dist.mjs`, rodado no `build` da CLI, copia `packages/web/dist` pra `packages/cli/web-dist` — incluído em `files`, vai junto no pacote publicado. `open.ts` procura ali primeiro, caindo pro caminho de monorepo só como fallback de dev. Cogitou-se resolver com Docker (volumes) — descartado: não existe container guardando estado nesse modo, `config/*.json` já vive direto no disco do usuário, então Docker só adicionaria uma dependência pesada sem necessidade real.
- `gerador skill-install [destino]` (novo comando): copia uma variante distribuível do `SKILL.md` (empacotada em `packages/cli/templates/skill/`, chamando `gerador` direto em vez do wrapper `.ps1` de dev deste monorepo) pro projeto atual.
- Validado rodando `dist/cli.js` a partir de um diretório temporário fora do repositório: `gerador open` e `gerador skill-install` funcionam de ponta a ponta, sem o repositório em lugar nenhum.

**Preocupação levantada pelo usuário, resolvida sem infra nova:** "vou precisar publicar e o firewall corporativo pode bloquear um domínio novo, já aconteceu antes." A resposta não é nova infra — é a mesma decisão da Fase G, agora com motivo explícito documentado no README: o CLI local não sai do `localhost`, só faz `npm install` contra `registry.npmjs.org` (já confiável na maioria dos ambientes); o modo hospedado (VM+domínio próprio) é onde mora esse risco, e continua existindo só pra quem não tem essa restrição.

**Achado real, só visível rodando numa máquina de fato fora deste ambiente de dev:** o usuário instalou `gerador-de-itens` numa máquina corporativa e rodou `gerador open` — funcionou (após ajuste de `PATH`, a instalação em si estava correta), mas caiu no erro antigo, porque a versão publicada no npm (`0.1.2`) era anterior a essa correção. A mensagem de erro também mandava rodar `npm run build --workspace=packages/web` — instrução impossível de seguir fora do monorepo (`ENOENT`, sem `package.json` na pasta do usuário). Corrigido: a mensagem de erro agora distingue os dois contextos (dica de build só aparece rodando de dentro do monorepo; fora dele, sugere atualizar o pacote). Confirma de novo a régua da sessão inteira: só publicar/documentar não basta, testar contra o ambiente real de quem vai usar é o que evidencia o gap.

Publicado `v0.1.3` (`git tag v0.1.3 && git push origin v0.1.3`, Trusted Publishing, zero token/OTP) com as três correções (canvas empacotado, `skill-install`, mensagem de erro melhor) — ver `packages/cli/CHANGELOG` não existe ainda; registro fica aqui e no `package.json`.

## 39. `v0.1.3` publicado quebrado — bundlar arquivo estático não é o mesmo que bundlar funcionalidade

Minutos depois de publicar `v0.1.3`, o usuário testou de verdade numa máquina (a própria, não a corporativa dessa vez — "instalei nessa máquina mesmo") e mandou print: `gerador open` sobe, mas fica preso em "Verificando sessão..." e cai numa tela de login sem nenhum jeito de logar.

**Causa real:** o `packages/web/dist` empacotado no §37/§38 é o build do **modo hospedado** — exige sessão (`useSessao` chama `/auth/me`) e fala com `packages/server`/Postgres pra tudo. `gerador open` só serve arquivo estático + `/config/*.json`, sem rota de auth nenhuma. A "validação de ponta a ponta" do §38 só confirmou que os arquivos respondiam 200 — nunca abri o app de verdade pra ver se ele funcionava depois de carregar. Erro meu, e uma instância exata do que a diretriz da sessão já dizia: type-check e "arquivo responde HTTP 200" verificam entrega, não funcionalidade.

Isso era exatamente a "Fase H" que SPEC-17 §9 tinha registrado como fora de escopo ("Canvas web sem Postgres/login... maior que esta rodada"). Ofereci duas saídas ao usuário (fazer funcionar de verdade agora, ou reverter pra um aviso honesto de limitação) — o usuário lembrou de uma decisão já registrada nesta mesma sessão ("autenticação pode não fazer mais sentido no modelo CLI") e propôs a resposta certa: manter o mesmo build, mas com login desabilitado — um "feature toggle", não uma reescrita.

**Implementado:** `packages/cli/src/commands/openApiLocal.ts` — API mínima, mesmo formato que `packages/web` já chama, sem tocar no código do app. Sessão sempre fixa (`{email:"local", timeIds:["local"]}`); dados que no modo hospedado moram no Postgres viram arquivo local reaproveitando formatos que já existiam: `quebra.json` na raiz (o mesmo arquivo que `gerador derive`/`implementar` já esperam — fecha o ciclo canvas↔terminal), `config/perfis-time.json`, `config/referencias/*.json`. Campos customizados por time e múltiplos times (conceitos só do modo hospedado) devolvem `[]`/501 com mensagem explicando por quê, em vez de fingir suportar.

Achado ao implementar: `especificacaoTemplate.conteudo` vazio (`""`) não cai no template padrão do engine, porque `??` só trata `null`/`undefined` como ausente, não string vazia — a API local tem que devolver o `TEMPLATE_ESPECIFICACAO_PADRAO` de verdade, não uma string vazia "pra simplificar".

Segunda peça, menos óbvia: o Vite resolve `VITE_API_URL` em **build time** — o build genérico aponta pra `http://localhost:4000` fixo no bundle, mesmo servido via `gerador open` numa porta qualquer. `copy-web-dist.mjs` passou a buildar sua própria variante (`VITE_API_URL=""`, mesma origem) usando a API JS do Vite direto — achado real no caminho: `spawnSync("npx.cmd", ...)` sem `shell:true` dá `EINVAL` no Windows, e adicionar `shell:true` com array de args é exatamente o padrão que o próprio Node desaconselha (risco de injeção).

Cogitou-se resolver com Docker de novo no meio da conversa — descartado pela mesma razão do §38: nenhum problema que Docker resolve (persistência entre recriações de container) existe aqui.

**Validado via HTTP real** (não só "200 de novo"): 17 testes novos em `openApiLocal.test.ts` batendo num servidor real numa porta efêmera, e uma rodada manual fora do repositório — `POST /quebras` grava `quebra.json` no formato exato que `gerador derive` lê de volta, `/perfis-time`/`/referencias` fazem round-trip completo, o bundle JS não contém mais `localhost:4000`. **Sem confirmar visualmente no browser** (ferramenta não disponível neste ambiente) — pendente o usuário confirmar que o canvas renderiza de verdade. Regressão completa (engine 81, web 93 — incluindo os 6 `useAutoDemo`/9 `JourneyModal` novos, cli 38) verde. Publicado `v0.1.4`.

## 40. Feedback rápido: "Cenários prontos" vazio num projeto novo

Segundo apontamento do usuário depois de testar `v0.1.4`: a aba "Cenários prontos" aparecia vazia. Causa: `carregarCenarios()` (`packages/web/src/demo/scenarios.ts`) busca `/config/cenarios/index.json` — mas `gerador init` nunca escreveu `config/cenarios/` nenhuma, só `app.json`/`diagrama.json`/`regras.json`/`perfis-time.json`/`graphify-mapping.json`/`referencias/`. Como `carregarCenarios()` degrada 404 pra lista vazia (comportamento certo pra "cenário é opcional"), não dava erro nenhum — só ficava silenciosamente vazio, o que parece bug mesmo sendo "funcionando conforme o código", porque a expectativa razoável é ver os mesmos exemplos que o app sempre mostrou.

Como `packages/cli/templates/{diagrama,regras}.json` já SÃO o config de exemplo deste repositório (14 tipos de nó — rabbit, kafka, mongo, camunda, fico...), os 17 arquivos de `config/cenarios/` deste repositório (16 cenários + `index.json`) fazem parte do mesmo pacote ilustrativo — só nunca tinham sido copiados pro template da CLI. Copiados pra `packages/cli/templates/cenarios/`, e `init.ts` generalizado pra escrever tanto `referencias/` quanto `cenarios/` com o mesmo loop (nunca sobrescreve). Validado rodando `gerador init` + `gerador open` num diretório temporário: `/config/cenarios/index.json` responde com os 16 nomes.

## 41. Skill removida — o rumo do produto muda de novo, pra dois subagentes com MCP

Terceiro apontamento na mesma rodada de feedback: testando `gerador skill-install` de verdade, o usuário reconsiderou o valor da skill em si — não é o fluxo certo pro objetivo final (itens publicados de verdade num sistema de tracking, ex. Jira), e não vale a pena manter uma peça que não serve pro destino real. Passou por uma tentativa de definir o desenho novo em detalhe (dois subagentes — um monta os itens a partir do markdown gerado, outro tem MCP habilitado e faz o upload de verdade, perguntando primeiro o link do épico de destino — mais um prompt de orquestrador entre os dois) e depois simplificou a decisão desta rodada: **cortar a skill inteira agora**, deixar o desenho dos subagentes registrado (SPEC-17 §11) pra quando for implementado.

Removido: `gerador skill-install` (`skillInstall.ts`/`.test.ts`), `packages/cli/templates/skill/`, `skill/gerador-de-itens/` inteiro (SKILL.md + `gerador.ps1`), toda menção em `README.md` (seção "Claude Code", linha da tabela de comandos, estrutura de pastas), `packages/cli/README.md`, `useTour.ts` (passo "Skill do Claude Code"), `JourneyModal.tsx`/`.test.tsx` (texto "ou como skill do Claude Code"), keyword `claude-code` do `package.json`. `SPEC-06-cli-skill-e-deploy.md` (a spec original que descrevia a skill) e `SPEC-17` §7/§8.2 ganharam nota de reversão apontando pra §11, em vez de reescrever a história.

Quarto apontamento, no mesmo lote: a aba "Referências de código" (`ReferenciasTab.tsx`) tinha um texto de rodapé desatualizado — "Grava direto no servidor (modo hospedado)... o caminho padrão agora é a CLI, edite o arquivo à mão" — que não refletia mais a realidade desde a correção do §38/39: `gerador open` local já implementa `POST/PATCH /referencias` (via `openApiLocal.ts`), gravando exatamente em `config/referencias/<slug>.json`. O formulário sempre funcionou nos dois modos desde aquela correção; só o texto continuava avisando que não funcionava. Corrigido pra descrever o que realmente acontece: salva no arquivo local em qualquer um dos dois modos, e também dá pra editar o arquivo direto se preferir.

O usuário também observou que a aba de Referências "não parece correlacionada com a edição dos formulários e regras dos componentes" — sinal de que pode existir um buraco maior na jornada (onde essa peça deveria viver em relação ao canvas). Registrado como observação a explorar, não resolvido nesta rodada — a correção de texto foi o item concreto e acionável; a pergunta de arquitetura de informação fica em aberto.

Regressão completa (cli 35, web 93) verde depois da remoção.

## 42. Mesma rodada de feedback, continuação: dados incompletos no cenário, campos por tipo de nó sem forma, time por item

Testando o cenário "aprovação de crédito" (`credito-completo.json`) de ponta a ponta pela primeira vez via `gerador open` local, mais dois apontamentos além da skill (§41).

**1. Cenário de exemplo incompleto.** `Linguagem/Stack`, `Framework`, contrato de endpoints, passos do processo Camunda, lógica de decisão do FICO, contrato da API do bureau, schema de colunas/documento (SQL/Mongo), lógica da regra de limite — todos campos opcionais (`permiteNA`) nunca preenchidos nem justificados com N/A, sobrando como `(não preenchido) | —` na especificação gerada. Pra um cenário marcado `destaque: true` ("o que uma jornada real parece"), isso lê como falha, não como "campo opcional deixado em branco". Preenchidos com conteúdo real e coerente com o domínio; validado rodando `gerador implementar` de novo e confirmando zero `(não preenchido)` restante. `packages/cli/templates/cenarios/credito-completo.json` resincronizado.

**2. "Campos por tipo de nó" sem forma nenhuma pra editar.** Print da tela mostrando "Campos por tipo de nó (0)" e "Nenhum campo customizado ainda" — a aba só listava campos vindos de `campos_no` (customizados), nunca os campos PADRÃO já definidos em `config/diagrama.json` (nome, tópico, dlq, dlx...). O usuário queria configurar convenção de nomenclatura (ex.: sufixo `.queue`, `.dlq`, `.dlx`) como parte da spec, editável — não como item de checklist genérico ("nome segue o padrão", removido de `regras.json`). `CamposNoTab.tsx` reescrito: lista os campos padrão de cada tipo (tag "padrão") ao lado dos customizados, com botão "sobrescrever" que pré-preenche o formulário com os dados do campo padrão (escopo já em "time ativo") — salvar cria um `campos_no` com a mesma `(tipoNo, key)`, que o merge já existente em `loadConfig.ts` resolve por cima do padrão. Mecanismo de override já existia (mesma regra de `perfis-time`); só faltava a UI pra descobrir e usar.

Achado ao implementar: `gerador open` local sempre devolvia `GET /campos-no` vazio e 501 em qualquer escrita ("não suportado no modo local") — decisão de simplificação de uma rodada anterior, mas incompatível com o que o usuário estava pedindo agora. Corrigido: `openApiLocal.ts` ganhou `config/campos-no.json` (mesma regra de merge global/por-time do modo hospedado — `packages/server/src/routes/camposNo.ts` — replicada local).

**3. `timesEnvolvidos` — o pêndulo voltou.** Rodada anterior (§33/§39) tinha decidido remover a coluna Times do `.md` porque "só um item aparecia, parecia dado quebrado". Usando de novo, o usuário reconsiderou: o problema não era mostrar o time, era mostrar SÓ NUM item — o certo é todo item ter um time por padrão (o da própria quebra), e permitir trocar item a item quando fizer sentido (ex.: um nó que outro time vai construir). `temposEnvolvidos()` (`derivar.ts`) agora sempre inclui `quebra.time`, mais qualquer `no.time` explícito e diferente — não mais restrito a nós `existente` (um nó `novo` que outro time implementa é válido do mesmo jeito). `paraMarkdown`/`gerarEspecificacaoEntrega` ganharam um `timeDaQuebra`/`time` opcional pra filtrar esse default óbvio das seções "Atenção: toca sistemas de outros times" — sem isso, a seção passaria a listar todo item, exatamente o problema que a rodada anterior tinha corrigido, só que ao contrário.

Tensão real com um princípio já estabelecido ("atividade derivada não é editável, só o diagrama") — resolvida sem quebrá-lo: a célula de Times na `ReviewScreen` virou um botão que leva pro nó de origem (mesmo padrão que clicar no rótulo já fazia), onde o campo "time responsável" (`PropertiesPanel`, antes só visível em nós `existente`) agora aparece pra qualquer nó. "Editar o time de um item" nunca mexe na atividade — sempre edita o nó, que a derivação recalcula.

Regressão completa (engine 81, web 100, cli 36) verde. Publicado `v0.1.7`.

## 43. "Se salvar 2 diagramas no mesmo dia o segundo sobrepõe o primeiro" — `quebra.json` fixo nunca devia ter sido singular

Apontamento curto do usuário, causa raiz óbvia assim que investigada: `openApiLocal.ts` (`tratarQuebras`, desde o fix do §39) sempre lia/escrevia um único arquivo fixo, `quebra.json`, com `id: "local"` hardcoded — qualquer "Nova quebra" seguida de salvar reescrevia esse mesmo arquivo, incondicionalmente. Não é "no mesmo dia" especificamente — é qualquer segunda quebra, sempre. O cliente web (`usePersistencia.ts`) já fazia a parte certa desde sempre: distingue criar (`POST`, sem id) de atualizar (`PUT`, com id conhecido), resetando o id ao clicar em "Nova quebra" — só o servidor local nunca honrava essa distinção.

Corrigido: `quebras/<id>.json`, um arquivo por quebra. `POST /quebras` gera um `id` novo (`randomUUID()`) e grava `quebras/<id>.json`; `PUT /quebras/:id` só sobrescreve o arquivo daquele id (404 se não existir); `GET /quebras` lista todo `quebras/*.json` (ordenado por `atualizadoEm`, mais recente primeiro); `GET /quebras/:id` lê um de volta. Mesmo tratamento que `campos-no`/`referencias` já tinham (um recurso, um arquivo por instância) — a inconsistência era só em `quebras`.

Validado com 4 testes novos em `openApiLocal.test.ts` (20 no total) — incluindo um que reproduz o bug relatado literalmente: duas quebras criadas em sequência via `POST`, confirma ids diferentes, confirma que a primeira continua intacta depois da segunda — mais uma rodada manual fora do repositório (`gerador init` → `gerador open` → dois `POST /quebras` reais via HTTP → dois arquivos distintos em `quebras/`, ambos listados e legíveis individualmente). Regressão completa (cli 38) verde. `packages/cli/README.md` atualizado pra descrever `quebras/<id>.json` em vez do arquivo único; `SPEC-17-cli-local-first.md` ganhou §12 fechando os dois ponteiros "revisado em §12" deixados no §8.1 (este fix + o de `campos-no` do §42). Publicado `v0.1.8`.

## 44. Terceira rodada de feedback: contrato de API sem request/response, faltavam cenários mobile, key técnica exposta demais no editor de campos

Testando o cenário de crédito de novo (agora publicado em `v0.1.8`), mais três apontamentos.

**1. Contrato da API externa não separava request de response.** O campo único `contratoApi` (`external.spec`) misturava "quais endpoints" com "o que entra" e "o que sai" num textarea só — o usuário pediu explicitamente que virassem campos separados. Dividido em três: `contratoEndpointsChamados`, `contratoRequest`, `contratoResponse` (`config/diagrama.example.json`, espelhado em `packages/cli/templates/diagrama.json`). O dado do cenário `credito-completo.json` (que antes tinha um blob único misturando os três) foi redistribuído nos três campos novos. Como a renderização da especificação de entrega é 100% genérica sobre `cfg.spec` (`descreverEspecificacaoNo` em `gerarEspecificacaoEntrega.ts` não conhece nomes de campo específicos), a divisão não exigiu nenhuma mudança de engine — só config e dado de cenário. Validado rodando `gerador implementar` de novo: zero `(não preenchido)`, os três campos aparecem separados na especificação gerada.

**2. Faltavam cenários prontos de mobile.** Nenhum dos 16 cenários existentes cobria app móvel consumindo backend — só serviço-contra-serviço/infra. Perguntado ao usuário (via `AskUserQuestion`) se um tipo de nó único "App Mobile" com campo Plataforma bastava, ou se Android e iOS mereciam tipos separados — resposta: **dois tipos separados**, porque cada plataforma tem convenções reais diferentes (SDK/API level vs. versão do iOS, FCM vs. APNs, Play Store vs. App Store/TestFlight, deep link vs. Universal Link). Adicionados `mobile-android` e `mobile-ios` em `config/diagrama.example.json` — `derives: "mobile"` (cai no caminho de derivação genérico, o mesmo que `external`/`job`/`cache` já usam; só `service` e `queue` têm regra própria em `derivar.ts`), `techs: ["Mobile"]` (já estava na whitelist de `app.example.json`, não usado por nenhum tipo até agora), contextos `Mobile-android`/`Mobile-ios` novos em `app.example.json`, ícone `Smartphone` novo em `icones.ts`, e `edgeRules` permitindo `http` como saída dos dois. `regras.example.json` ganhou `porTech.Mobile` (dados sensíveis não persistidos em claro, comportamento offline, permissões em runtime, compatibilidade com a versão mínima, guidelines da App Store) — sem isso o refinamento técnico das atividades mobile sairia vazio, mesmo problema que motivou os campos de contrato de dados lá no §12. Dois cenários novos, `mobile-android.json` (app consultando extrato de fidelidade) e `mobile-ios.json` (app solicitando aumento de limite via Face ID), cada um com um nó mobile `novo` chamando via `http` um serviço `existente` — mesmo padrão de `internal.json`. Validados rodando `implementar` de verdade nos dois.

**3. Editor de campos por tipo de nó expunha "key" como conceito técnico demais.** Criar um campo novo (`+ Adicionar campo`) sempre mostrava um input "Chave (key)" ao lado do Rótulo — o usuário viu isso e apontou que soa mais pra programador que pra quem só quer nomear um campo (`topic` como exemplo). Pergunta feita via `AskUserQuestion` (junto com uma opção de confirmação antes de excluir, que o usuário **não** escolheu — só a de esconder a key): a `key` agora é **gerada sozinha a partir do Rótulo** (`gerarChaveDoRotulo()`, camelCase sem acento — "Motor padrão" → `motorPadrao`) e o input de key some do caminho comum, atrás de um link "avançado: ver/editar a chave técnica". Editar/sobrescrever um campo já existente continua com a key travada (é o que liga o registro ao original — mudar quebraria o merge com o campo padrão), só que agora escondida atrás do mesmo toggle em vez de sempre visível e desabilitada. `CamposNoTab.test.tsx` ganhou 2 testes novos (key gerada automaticamente ao salvar; modo avançado revela e permite editar manualmente) e um ajuste no teste que antes esperava a key sempre visível.

Regressão completa (engine 81, web 102, cli 38) verde. Publicado `v0.1.9`.

## 45. "Quebra sem nome, sem busca" — título obrigatório e uma tela pra abrir de verdade

Apontamento à parte, sobre um problema estrutural: `Quebra` nunca teve um nome curto — só `demandInfo` (parágrafo livre) e `time`. O "Abrir…" do header era um `<select>` nativo mostrando `time · data`, sem nada pra reconhecer uma quebra específica numa lista que só cresce. O usuário nomeou o risco direto: "com o tempo, os usuários não vão encontrar quebras antigas".

Perguntado via `AskUserQuestion` (duas questões): título vira **campo obrigatório antes de salvar** (não opcional com fallback); e pra "Abrir…", a resposta não foi nenhuma das duas opções oferecidas — foi uma correção: **tela nova, mantendo a consistência visual do resto do app**, letras grandes, campo de busca com lista filtrada, **mais um filtro por data de criação**, explicitamente distinto de data de última edição ("precisa ser considerado no modelo de dados"). Pedido explícito de rodar `graphify update` antes de mexer no código, pela quantidade de mudança recente no repositório — feito antes de qualquer edição.

**Modelo de dados: `Quebra.titulo?: string`** (`packages/engine/src/model/types.ts`) — curto, não é chave (duas quebras podem ter o mesmo título, cada uma com seu próprio id). Investigação prévia confirmou que `criadoEm` já existia separado de `atualizadoEm` nos dois backends (`packages/server`'s `quebras` table desde a Fase A; `openApiLocal.ts`'s `comoQuebraSalva` já computava os dois a partir de `stat()` do arquivo) — só a *listagem* (`GET /quebras`) descartava `criadoEm` e nunca teve `titulo`, em ambos os lados.

**Persistência, nos dois backends** (mesmo tratamento que `time` já tem — nullable, sem enforcement de obrigatoriedade no banco, a régua fica na UI):
- `packages/server`: migração `0007_quebras_titulo.sql` (`ALTER TABLE quebras ADD COLUMN titulo text`), coluna em `schema.ts`, `corpoQuebra` (zod) e os três handlers (`GET`/`POST`/`PUT`) passam a ler/escrever `titulo`; `GET /quebras` também ganhou `ORDER BY atualizadoEm DESC` (nunca tinha ordenação nenhuma) e voltou a incluir `criadoEm` na listagem.
- `packages/cli` (`openApiLocal.ts`): `comoQuebraSalva()` lê `quebra?.titulo` do arquivo; a listagem (que antes só devolvia `{id, time, atualizadoEm}`, descartando o resto do objeto já calculado) passa a devolver `titulo` e `criadoEm` também.

**UI**: campo "Título" novo no header (`App.tsx`, ao lado do seletor de time), controlado, mesmo padrão de `setQuebra((q) => ({ ...q, titulo }))` que `time` já usa. Botão "Salvar" fica desabilitado sem título (com tooltip explicando por quê) — e `usePersistencia.salvar()` ganhou o mesmo guard internamente (novo status `"sem-titulo"`), pra proteger tanto o clique manual quanto o autosave, não só a UI. `abrirPorId` passou a restaurar `titulo` ao reabrir uma quebra (antes só restaurava `time`/`diagrama` — `demandInfo` continua não sendo restaurado, isso já era assim antes desta rodada e não fazia parte do pedido).

**`AbrirQuebraScreen.tsx` (novo)**: tela cheia no mesmo padrão visual de `ConfigScreen.tsx` (`position: fixed, inset: 0`, header com "Voltar ao canvas"), substituindo o `<select>`. Busca (`título` + `time`, client-side sobre a lista já carregada — mesma disciplina do resto do app, sem inventar paginação/busca de servidor pra uma escala que não existe) e dois campos de data (`<input type="date">`, "Criada de" / "até") filtrando por `criadoEm.slice(0,10)` — nunca por `atualizadoEm`, exatamente a distinção que o usuário pediu. Fonte de 16-17px nas linhas da lista, bem maior que o resto da UI (12-13px), atendendo "letras grandes". Quebra sem título ainda (dado legado, de antes desta mudança) aparece como "(sem título)", nunca quebra a lista.

Validado: 20 testes de `openApiLocal.test.ts` (título/criadoEm round-trip), 7 testes novos de `AbrirQuebraScreen.test.tsx` (busca por título, busca por time, filtro de data usando `criadoEm` e não `atualizadoEm`, clique abre a quebra certa, lista vazia vs. busca sem resultado — mensagens distintas), `packages/server` typechecado limpo (`tsc --noEmit`) mas **não roda nesta sessão** — sem Postgres neste ambiente de dev, mesma limitação já registrada em rodadas anteriores; testes novos (`titulo` round-trip, `titulo` opcional na criação) ficam prontos pra quando o usuário rodar `docker compose` de teste. Regressão completa dos pacotes que rodam aqui (engine 81, web 109, cli 38) verde.

Publicado `v0.1.10`.

## 46. "Referências de código" sai de vez, demo automática cortava no meio, Membros vaza pro modo local, e "backlog" vira linguagem agnóstica

Uma rodada de feedback com quatro pontos, entregues juntos: (1) "vamos remover completamente a parte de referências de código, é muito melhor que o usuário apenas crie suas próprias skills e afins no claude code"; (2) a demonstração automática "termina muito rápido... corta antes de demonstrar", e faltava cobrir as configurações mais recentes; (3) a aba "Membros" (times/convites, coisa de modo hospedado) aparecia mesmo no modo local (CLI), onde não faz sentido nenhum; (4) o sistema "meio que assume que as coisas vão para o backlog", quando deveria ser agnóstico de sistema de tracking — e a experiência de revisar+copiar markdown "não faz sentido, não precisa copiar, apenas revisar as especificações... e depois se o usuário quiser ele gera o markdown que deve conter TUDO". No meio da execução, dois esclarecimentos do próprio usuário fecharam decisões que ficariam em aberto: o motivo do ponto 4 ("é esse markdown que será usado como input para o agente que faz o analítico dos itens") e o nome do novo conceito unificado — **"especificação de solução"**, escolhido pelo próprio usuário. O usuário então autorizou execução autônoma até o fim ("não faça mais perguntas por hora... amanhã gostaria de ver a versão nova logo cedo"), então as decisões de design daqui em diante (abaixo) foram tomadas sem consulta adicional.

**1. Referências de código removidas por completo — e junto, `gerador export-vault`.** A primeira leitura do pedido só cobria a tabela/rota/aba `referencias`; investigando o próprio comando `export-vault` (SPEC-16/17, a única peça do CLI que ainda dependia de rede) ficou claro que ele perdia o sentido sozinho, sem o que exportar. Perguntado via `AskUserQuestion` — resposta: "Remover completamente". Saiu tudo: `packages/server/src/routes/referencias.ts`, a tabela `referencias` (`schema.ts`, migração nova `0008_remove_referencias.sql` — `DROP TABLE IF EXISTS`, nunca edita as migrações 0000-0007 já aplicadas), `packages/web/src/demo/ReferenciasTab.tsx`, `packages/cli/src/commands/exportVault.ts`, `config/referencias/*.json` e `packages/cli/templates/referencias/*.json`. SPEC-16 (base de conhecimento via Obsidian) e SPEC-17 §1.3/§4 ganharam nota de reversão em vez de reescrita — ficam como registro histórico de uma decisão tomada e depois revertida, não apagadas. Uma ideia adjacente do usuário — visualização com "algum gráfico animado enquanto ainda estamos na ferramenta" — foi perguntada via `AskUserQuestion` e explicitamente adiada: "Guardar como ideia futura", registrada aqui, não implementada.

**2. Demo automática: achado real era duas fontes de duração desincronizadas.** `useAutoDemo.ts` calculava o tempo de cada passo só pelo tamanho do texto (`calcularAtraso`); o passo "Linha de comando" tem sua própria animação (`TerminalAnimado.tsx`, digitando caractere a caractere) com duração independente — nada impedia o timer do passo vencer antes do terminal terminar de digitar, cortando a demonstração no meio, exatamente o sintoma relatado. Corrigido com `duracaoMinima?: number` novo em `PassoTour` (`useTour.ts`): quando presente, o piso do passo nunca é encurtado pelo teto padrão, só o cálculo por texto é. `TerminalAnimado.tsx` exporta `DURACAO_TOTAL_TERMINAL_MS`, somado a partir da mesma lista `COMANDOS` que o componente renderiza (uma fonte só, não duas constantes que podem desincronizar de novo no futuro) — o passo "Linha de comando" usa isso como `duracaoMinima`. `ATRASO_MAXIMO_MS` (teto por texto) subiu de 8000 para 13000ms, atendendo "faltava tempo pra ver". Dois passos novos no tour (`useTour.ts`, 12 no total agora): "Campos por tipo de nó" e "Modelo da especificação de solução", cada um abrindo a aba certa da `ConfigScreen` (`abrirConfigNaAba`) — cobrindo configurações que existiam há tempo mas nunca apareciam na demonstração.

**3. Membros oculto no modo local.** `mostrarMembros` (boolean) threading de `App()` → `AppComSessao` → `AppCarregado` → `ConfigScreen`, computado como `modo !== "local"` (o mesmo `modo` que `/auth/modo` já expõe pro CLI local, usado desde a correção do botão Google). A aba e seu conteúdo (`MembrosTab`) só renderizam quando `mostrarMembros` é verdadeiro — no modo CLI local, que não tem conceito de convite/membro de time, ela simplesmente não existe mais na tela.

**4. "Backlog" vira "itens"; revisão e exportação viram uma coisa só.** Rename de terminologia em engine/cli/web (títulos default, mensagens de console, labels de UI, testes) — "backlog"/"backlog derivado" → "itens"/"itens derivados"; "Especificação de entrega" → **"Especificação de solução"** (nome escolhido pelo usuário). Deliberadamente **não** tocado: JOURNEY.md, corpo de SPECs, `CONTEXTO-E-ARQUITETURA.md`, `graphify-out/`, `exemplos/backlog-*.md` — histórico não se reescreve. `paraMarkdown`/`gerador derive` continuam existindo como via CLI-only separada (lista tabular rápida), só deixou de estar duplicado no `ReviewScreen` web.

A mudança maior é o `ReviewScreen.tsx`, reescrito de tabela pra cards expansíveis: cada atividade é um card com um cabeçalho (rótulo, tipo·tamanho·dependências, times) e um botão de expandir/recolher; expandido, mostra a especificação técnica completa daquele item via `renderizarItemEspecificacao` — função nova, extraída do renderizador interno de `gerarEspecificacaoEntrega.ts` (era `renderizarItem` privado, virou export), reaproveitada tanto pelo documento completo quanto por este painel — uma fonte só de verdade pro conteúdo, nunca duas implementações da mesma renderização. Sumiu o botão "copiar"; sumiu a segunda tela de "visualizar documento inteiro"; sobrou **um único botão**, "Gerar especificação de solução", que baixa o markdown completo (`gerarEspecificacaoEntrega` + `baixarArquivoTexto`). A expansão usa montagem condicional (`{expandido && <div>...}`) com uma animação CSS (`@keyframes expandir-item`, `styles.css`) — não a técnica de `grid-template-rows: 0fr→1fr` tentada primeiro, que falhou nos testes porque jsdom não calcula layout de grid de verdade (`toBeVisible()` não distinguia o estado recolhido); montagem condicional é testável por presença/ausência no DOM, além de mais simples.

**Achado incidental, corrigido de passagem:** `JourneyModal.test.tsx` tinha uma asserção que nunca disparava de verdade — `expect(screen.getByText(/mecanismo determinístico/))` contra um texto que sempre disse "motor determinístico" (bug latente de uma rodada anterior, não relacionado a este pedido). Corrigido o regex enquanto o mesmo bloco de teste já estava sendo atualizado pelo rename de terminologia.

Regressão completa: engine 81, web 107, cli 24 — verde. `packages/server` typecheca limpo (`tsc --noEmit`); os testes de fato não rodam nesta sessão por falta de Postgres local, mesma limitação de sempre — não é regressão introduzida aqui.

Publicado `v0.1.11`.

## 47. Import-graphify quase não achava nada num projeto Camunda real — matching só por caminho era o gargalo

Usando `gerador import-graphify` de verdade contra um projeto Camunda real (não este repositório), quase nenhum nó apareceu: só 1 Mongo e algumas classes de teste Kafka (`*KafkaTest`). O usuário pediu pra avaliar como melhorar o matching com o Graphify, cogitando "uma camada proxy" pra identificar papéis (producer, consumer, repository, delegate no caso Camunda) — e, antes de eu implementar qualquer coisa, fez questão de deixar explícito: "obviamente editável essa camada" (config, não hardcoded no código).

**Achado real, investigando o `graph.json` de verdade antes de desenhar qualquer coisa:** `importarGrafo.ts` (`packages/engine/src/adapters/graphify/importarGrafo.ts`) só testava regex contra `source_file` (o caminho) — nunca contra `label` (o nome da classe). E o schema do nó do Graphify não carrega nenhum campo semântico tipo "kind" (classe/interface) ou anotação, só `label`/`source_file`/`source_location`. Isso bate exatamente com o sintoma: um projeto Camunda real tem classes como `AprovacaoDelegate.java`, `PedidoProducer.java`, `ClienteRepository.java` — nenhuma tem "kafka"/"rabbit"/"mongo"/"controllers/" no caminho, e a lógica de negócio de verdade do Camunda (a classe que implementa `JavaDelegate`) é `.java`, não `.bpmn` — só o `.bpmn$` tinha regra.

**Correção proposta e confirmada com o usuário antes de codar:** `RegraMapeamentoGraphify` ganhou dois campos opcionais além do já existente `padrao` (caminho): **`padraoLabel`** (regex contra o nome da classe — pega `*Producer`, `*Repository`, `*Delegate` em qualquer pasta) e **`padraoImporta`** (regex contra o que a classe importa/estende/implementa — lido das arestas `imports`/`imports_from`/`extends`/`implements` que o Graphify já extrai, agregando todos os nós daquele arquivo, não só o "representante" escolhido pra virar o `No` do canvas). `calls` foi deixado de fora de propósito — chamada de método é granularidade fina demais, vira ruído, não é referência a um tipo/símbolo que identifique tecnologia. Dentro de uma mesma regra, qualquer um dos três sinais definidos já é suficiente (**OR, não AND** — exigir os três juntos voltaria a perder caso real, já que um arquivo raramente segue todas as convenções ao mesmo tempo); continua "primeira regra que bate vence", só testando mais sinais por regra. `GraphifyGraph` ganhou `links?: GraphifyEdge[]` (opcional — grafo sem essa chave continua funcionando, só sem o sinal extra). Tudo isso é **regex em JSON editável pelo usuário**, nunca hardcoded — a mesma disciplina de sempre, só com mais sinais disponíveis.

**Revisão geral dos padrões, não só Camunda** (pedido explícito do usuário: "vc vai ter que fazer uma revisão em padrões existentes no geral para não ficar restritor"). `config/graphify-mapping.example.json` cobria só 7 dos 16 tipos de nó existentes em `diagrama.example.json` (camunda, rabbit, kafka, mongo, sql, job, service) — `cache`, `storage`, `batch`, `external`, `rule`, `fico`, `mobile-android`, `mobile-ios` nunca tiveram regra nenhuma, mesmo já sendo tipos de nó válidos há várias rodadas. Reescrito com regra pra cada um (ordem pensada pra evitar colisão: sinais específicos de biblioteca antes de sinais genéricos — ex. `MongoRepository`/`padraoImporta` de Mongo vem antes do `Repository$` genérico de SQL, senão um repositório Mongo cairia no tipo errado por default). Alguns exemplos do resultado: `cache` via `RedisTemplate|Caffeine|Jedis|Lettuce`; `storage` via `AmazonS3|S3Client|BlobServiceClient`; `batch` via `org.springframework.batch|ItemReader|ItemWriter|ItemProcessor|Tasklet` (o node type já documenta "Spring Batch" explicitamente); `external` via `RestTemplate|WebClient|Retrofit|FeignClient` ou sufixo de classe `*Client$|*Gateway$`; `rule` via Drools (`org.kie|KieSession|drools`); `mobile-android`/`mobile-ios` via extensão de arquivo (`.kt$`/`.swift$`) — únicos dois tipos novos que usam só `padrao`, já que linguagem de arquivo é sinal suficiente e inequívoco. `fico` ficou deliberadamente conservador (`padraoLabel: "Fico$|BlazeAdvisor$"`, `padraoImporta: "[Bb]laze"`) — é um produto vendor (FICO Blaze Advisor) e não há confiança suficiente no namespace real do SDK pra inventar um pacote Java específico sem ver código de verdade; comentado como ponto de ajuste esperado, não fingido como certeza. `rabbit-exchange` ficou de fora de propósito — raramente é uma classe 1:1, mais fácil modelar à mão do que arriscar uma regra ruim. `packages/cli/templates/graphify-mapping.json` mantido byte-idêntico ao exemplo, mesma disciplina de sempre.

Validado com 6 testes novos em `importarGrafo.test.ts`: match só por `padraoLabel` (nome de classe, ignorando caminho totalmente fora de convenção); match só por `padraoImporta` (via aresta `implements`); agregação de referências de todos os nós do arquivo, não só o representante; `calls` explicitamente ignorado; os três sinais como OR dentro da mesma regra; grafo sem `links` (formato mais antigo) continua funcionando sem quebrar. `CONTEXTO-E-ARQUITETURA.md` (doc vivo) atualizado pra descrever os três sinais; `SPEC-06-cli-skill-e-deploy.md` ganhou nota de correção (§5.4) em vez de reescrita do §5.2 original.

Regressão completa: engine, web, cli — verde; `server` (não tocado nesta rodada) typecheca limpo.

Publicado `v0.1.12`.

## 48. Modo local com time travado, "nome" sugerido pelo time (inútil), e o editor de Endpoints que nunca foi portado do protótipo

Rodada com três apontamentos do usuário, o último puxando a maior mudança de arquitetura do engine desde a Fase B.

**1. Modo local (CLI) travava o seletor de time em "local".** `App.tsx`'s campo "Time" montava as opções a partir de `sessao.timeIds` — no modo hospedado isso é o isolamento certo, mas no CLI local a sessão é sempre uma só, falsa e fixa (`SESSAO_LOCAL = { email: "local", timeIds: ["local"] }`, `openApiLocal.ts`). Resultado: mesmo com `config/perfis-time.json` cheio de times reais com dados, era impossível selecionar qualquer um deles como ativo. Corrigido: no modo local, o campo vira `<input>` de texto livre com `<datalist>` sugerindo os times já conhecidos em `perfisTime` — volta ao comportamento de antes da Fase B, só que sem duplicar isso no modo hospedado (que continua com `<select>` restrito à sessão). De passagem, corrigido um tipo mentiroso: `apiAuth.modo()`/`useSessao.ts` diziam `Promise<"dev"|"oidc">`, nunca incluindo `"local"` (o valor real que `openApiLocal.ts` devolve) — `AppComSessao` já esperava os três, só a fonte é que mentia.

**2. "Nome do serviço" nunca deveria ter sido sugerível por time.** Investigado por que editar/salvar um valor em "Perfis de time" parecia "não fazer nada de útil": `PerfisTimeTab.abrirNovoValor()` sempre defaultava pro primeiro campo do primeiro tipo de nó — e checando os 16 tipos, **o primeiro campo de todo tipo é sempre um campo de identidade** (`nome`, `topic`, `collection`, `tabela`...). Sugerir um valor fixo de "nome" pra todo serviço novo do time não faz sentido — cada instância precisa do seu próprio nome único. `FieldSpec` ganhou `identificador?: boolean`, marcado no primeiro campo dos 16 tipos em `diagrama.example.json`; `PerfisTimeTab` (formulário de adicionar/editar) e `PropertiesPanel` (captura "salvar como padrão do time") passaram a excluir esses campos da lista de sugeríveis — sem afetar exibição/edição de valores já salvos.

**3. O pedido que virou SPEC-18: reviver o editor de Endpoints do protótipo, mas genérico.** Ao investigar o `gerador_de_itens-2.html` original (JOURNEY §1) por outro motivo, achado: ele tinha um editor "Endpoints" de verdade (lista repetível, "+ endpoint", method/path/ação por linha) que **nunca foi portado** pro rewrite React — o modelo (`No.endpoints`) e a derivação (`derivar.ts`, uma atividade por endpoint) sempre existiram, só a UI ficou pra trás, e request/response viviam soltos num textarea único (`contratoEndpoints`) sem saber a qual endpoint pertenciam. O usuário então generalizou o pedido: "poder editar facilmente esse form" — não só recriar Endpoints, mas tornar esse tipo de formulário repetível **autorável pela própria ferramenta**, pra qualquer tipo de nó.

Resposta arquitetural (detalhe completo em SPEC-18-campo-tipo-lista.md): `TipoCampo` ganha `"lista"`, `FieldSpec` ganha `itemSpec?: FieldSpec[]` — um mecanismo genérico, não um componente hardcoded de Endpoints (evitando repetir o padrão que o protótipo original tinha pra cada lista — Endpoints, stages do Camunda, motores do FICO, cada um com seu próprio HTML/JS). `No.endpoints` (array especial no topo do nó) foi removido; endpoints agora é só mais um campo de `service.spec`, com `valor: Record<string,unknown>[]` — ganha de graça tudo que campo normal já tem (`when`, N/A, proveniência). `PropertiesPanel.tsx` ganhou `ListaControl`, renderer genérico reaproveitando `FieldControl` recursivamente por sub-campo (achado ao implementar: precisou de um `ariaLabel` override, senão todo item repete o mesmo aria-label do sub-campo e vira ambíguo pra teste/leitor de tela). `CamposNoTab.tsx` ganhou `"lista"` como tipo autorável, com sub-editor pra montar o `itemSpec` — a peça que faz "editar facilmente" ser real, não só pra Endpoints. Persistência estendida nos três backends (web `api/client.ts`, server — migração `0009_campos_no_item_spec.sql` — e CLI local `openApiLocal.ts`). `gerarEspecificacaoEntrega.ts` passou a renderizar campo lista como bloco próprio (item numerado, sub-campo textarea em linha indentada), já que não cabe na tabela de campos escalares. Migrados: `config/diagrama.example.json` (`service.contratoEndpoints` → `endpoints` lista), 16 cenários (a maioria só tinha `endpoints: []` vazio, 4 com dado real onde texto livre virou request/response estruturados), e o fixture `01-servico-novo-fila-consumo.json` do engine.

Regressão completa dos 4 workspaces verde (114 web, engine com 5 testes novos de renderização de lista no documento, 5 novos entre PropertiesPanel/CamposNoTab pro editor); `server` typecheca limpo. Publicado `v0.1.13`.

## 49. Alinhando com o agente que valida os itens do outro lado — sem copiar tudo

O usuário compartilhou o conteúdo de uma página de Confluence que documenta o formato exigido pelo agente de IA que valida os itens que esta ferramenta gera — um contrato de fora, não uma preferência interna. Comparado contra `gerarRefinamento.ts` real, achou três descompassos mecânicos e dois pontos de escopo maior; o usuário resolveu os cinco de forma diferenciada, não em bloco.

**Implementado (achados 1-3, confirmados sem ressalva):** o motor escrevia `<- especificar`; faltava o emoji (`<- ✍️ especificar`, exigido em toda linha, sem exceção). Requisitos `tipo: "checklist"` viravam `- [ ] texto` (caixa de seleção) e só os `fill-now` ganhavam o marcador — inconsistente com o Confluence, que não tem esse conceito. `Requisito.tipo` foi removido (não tinha mais efeito que fizesse sentido manter); toda linha renderiza igual agora. E faltava o bloco "Requisitos de volumetria" (Response time/Max error/RPS/Test duration, sempre em branco) — `RegrasPorTech` ganhou `volumetria?: { contextos: string[] }`, nova função `gerarVolumetria()` reaproveitando o mesmo casamento parcial de contexto que requisitos já usa, ativado por padrão só em `Backend`/`Backend-chamadas http` (o único exemplo concreto documentado).

**Recusado (achado 4 — seção "Resolução Técnica" pra Débito Técnico):** nas palavras do usuário, "podemos interpretar como tipo de demanda... nossa ferramenta é agnóstica a isso, vamos ignorar." Problema/Impacto/Solução/Benefícios é conteúdo que quem refina escreve, não algo derivável do diagrama — fora do nível de abstração desta ferramenta.

**Recusado, com a razão registrada pra não ser re-litigada (achado 5 — taxonomia genérica do Confluence substituindo a granularidade por contexto):** o usuário explicou o porquê, não só o "não": "um dos objetivos é reduzir a fricção entre mapear a solução técnica e fazer especificações x organizar essa demanda em histórias/tarefas... criar mocks é uma visão sobre o que deve ser feito (provável item de checklist), não algo do desenho da solução per se." Esta ferramenta mapeia solução técnica; "Setup - Mocks"/"Configuração Base de Parâmetros" são categorias de processo/checklist de execução, uma camada diferente. A granularidade por contexto que o motor já tem (`Backend-mensagens`, `Backend-dados`, `Backend-chamadas http`...) é mais precisa que a lista genérica do Confluence pra esse propósito — não foi trocada por uma lista mais pobre só pra bater com o formato externo.

Detalhe completo em SPEC-19-alinhamento-agente-validador.md — inclusive os dois itens não implementados, com a razão do usuário registrada, não só "decidiu não fazer". `config/regras.example.json` (+ mirror `packages/cli/templates/regras.json`): removidas 31 ocorrências de `tipo` nos requisitos, adicionado `volumetria` em Backend. Testes novos em `gerarRefinamento.test.ts` (marcador exato, ausência de `- [ ]`, `gerarVolumetria` em 3 casos) e `gerarEspecificacaoEntrega.test.ts` (bloco de volumetria aparecendo/não aparecendo no documento). Regressão completa dos 4 workspaces verde; `server`/`cli` typecheca limpo.

## 50. "Vc conferiu se estão na configuração?" — a dimensão de habilitação de teste que faltava inteira

O usuário questionou a minha avaliação do item 5 da rodada anterior e mandou o `tabelaRegras` que estava em uso no protótipo HTML original. Conferi de verdade desta vez: `mock`, `massa`, `curl`, `laiaute`, `apontamento` — **zero ocorrências** em qualquer requisito nosso. Minha comparação anterior tinha olhado o eixo errado.

**O achado:** a diferença não era de taxonomia, era de dimensão. Nossos requisitos eram todos de **correção arquitetural** (idempotência, DLQ, circuit breaker, índices, TTL) — "o desenho está certo?". Os do original eram quase todos de **habilitação de execução/teste** (curl da chamada, mockoon configurado, massa DEV, massa HLG, serviços a repontar durante o teste, layout do arquivo) — "dá pra executar e testar isso?". Sobreposição praticamente nula. Não era uma versão pobre da nossa; era uma dimensão inteira ausente — exatamente a fricção que o usuário nomeou entre "mapear a solução técnica e fazer especificações" e "organizar essa demanda em histórias/tarefas e o trabalho dos times".

Escopo escolhido via `AskUserQuestion` entre três opções: **só requisitos por contexto**, sem mecanismo novo no engine. Entraram os itens de habilitação (massa HLG, mock com cenários de sucesso/erro, curl, serviços a repontar), os específicos de Camunda (descrever alterações no processo, curl de inicialização) e FICO (motores/rulesets modificados, documentação das políticas), configuração de filas/exchanges/tópicos por ambiente, layout de arquivo em lote, um ciclo de teste novo ("Teste funcional do processo"), e a volumetria expandida de só `Backend-chamadas http` pra também mensagens/orquestração/lote — a cobertura que o original já tinha.

**Passada de redação, motivada por um ponto preciso do usuário sobre índices:** "nessa altura do desenho não se sabe quais os índices serão criados, mas é um item de checklist de implementação verificar (se aplicável) se vai envolver índices". Nossa redação era assertiva ("Índices criados para as queries novas"), que lê como afirmação de feito — errado pra um item que ainda vai ser especificado. Todos passaram pra voz imperativa (a mesma do Confluence) com "— se aplicável" onde o desenho legitimamente ainda não sabe.

**Duas correções ao meu próprio plano, decididas durante a implementação:** (1) **não** criei o contexto `Backend-processamento de arquivos` que eu tinha proposto — nenhum tipo de nó usaria, viraria a mesma declaração órfã que eu tinha acabado de criticar no `Frontend`, e `validateRegras()` falha alto se o contexto não existir em `app.json`; o layout de arquivo foi pra `Backend-processamento em lote` com "se aplicável". (2) Itens compartilhados entre contextos viraram **uma entrada só com múltiplos contextos** em vez de entradas duplicadas — `contextoBate()` usa `.some()`, então duplicar produziria linha repetida numa atividade que tem os dois contextos.

**Escopo mantido fora, com a razão:** o usuário perguntou por "precisa de mocks?" como *pergunta durante a especificação*. Isso hoje não é expressável — `requisitosRelevantes()` filtra só por contexto, um requisito não pode depender da resposta de um campo do nó. Exigiria `Requisito.when` + decidir como avaliar a condição numa atividade de aresta (source e target são dois nós). Ficou registrado como opção não escolhida.

Validado com dado real, não só suíte: `gerador init` num projeto temporário (valida o template junto) + `gerador implementar` sobre `credito-completo` (14 itens), lendo a saída — item HTTP com curl/mock/repontar/volumetria, item Camunda com os do processo, item de setup só com os sem contexto, e **zero linhas duplicadas**. Engine 98 verdes, regressão completa dos workspaces. Detalhe em SPEC-19 §6-§7.

**Primeira rodada trabalhada em branch** (`refinamento-habilitacao-de-teste`), a pedido do usuário: "a partir de agora sempre trabalhe versionando branches no git".

## 51. Dois checklists — e a violação de contrato que eu mesmo tinha criado na rodada anterior

O usuário nomeou o incômodo de fundo: *"falta um nível de abstração no sistema, a parte de configurações hoje é a que mais me incomoda, algo como checklists de processo e checklists técnicos (mais ou menos o que já existe, mas de forma mal expressa)... no checklist de processo também seria possível vincular a uma condição (ex: se componente é serviço — ou até mais de uma, como alteração de endpoint ou novo endpoint)."*

**O "mal expressa" tinha uma causa dura, e a causa era minha.** Na §50 eu tinha colocado "Configurar mock", "Levantar massa de teste" e "Especificar serviços a repontar" dentro de `requisitos`, que renderiza como **"Requisitos de refinamento técnico"**. Só que o próprio padrão do agente validador (§49) lista, sob "O QUE NÃO SÃO": *"❌ Atividades de teste"*. Eu tinha resolvido a falta de uma dimensão criando uma violação do contrato externo. Separar os dois checklists não é organização estética — é o que deixa a seção "Requisitos de refinamento" **correta**.

`requisitos` virou `checklistTecnico` (rename puro, pra ficar simétrico e auto-descritivo) e nasceu `checklistProcesso`. Formatos diferentes de propósito: técnico mantém `- texto <- ✍️ especificar` (contrato externo); processo usa `- [ ]`, que é justamente o formato que a §49 tinha removido do técnico por proibição do Confluence — cada um no seu lugar, sem conflito.

**Dois operadores de condição novos, dos sete originais para nove.** `{ nodeType: [...] }` porque "se componente é serviço" não era expressável: num `FieldSpec.when` o tipo de nó é implícito (o campo vive dentro dele), num item de processo não é — e não dava pra usar contexto, já que `service` tem `contextos: []`. `{ listaContem: { field, sub, equals } }` pra olhar dentro de um campo `type: "lista"` (§48) e distinguir "endpoint novo" de "alteração de endpoint" — trabalho diferente (publicar contrato novo vs. avisar consumidores atuais). O *"ou até mais de uma"* do pedido não precisou de nada: `allOf`/`anyOf` já existiam.

**A decisão que tinha travado isso na §50:** uma atividade de aresta tem *dois* nós de origem, então "avalie o `when` contra o nó" era ambíguo. Regra escolhida: **satisfaz se algum deles satisfizer** (`.some()`, mesma régua do casamento de contexto). Exigir os dois perderia caso legítimo — numa aresta `service → external`, "confirmar ambiente de teste do provedor" importa por causa do `external`. Trade-off aceito e visível na validação real: a atividade "srv-credito-api usa a validação de regra-limite-endividamento" recebeu itens dos dois nós, e um deles é discutível ali. Num checklist, super-incluir é mais seguro que sub-incluir — dá pra desmarcar o que apareceu, não dá pra agir no que nunca apareceu. Sem nó de origem, item condicionado não aparece: condição que não dá pra avaliar não é assumida verdadeira.

Os 4 itens condicionados do config cobrem os exemplos do pedido e mais a pergunta *"será possível fazer testes integrados?"* que tinha ficado sem resposta na §50: contrato do endpoint novo (`service` + `action: "novo"`), avisar consumidores (`service` + `action: "alterar"`), ambiente de teste do provedor (`external`), demanda de configuração de parâmetro (`rule`/`fico`).

Validado com dado real (`gerador init` + `implementar` sobre `credito-completo`): "Requisitos de refinamento técnico" ficou só com decisões de desenho, "Checklist de processo" saiu como seção própria com `- [ ]`, e cada condicionado disparou exatamente onde devia. Engine 105 verdes, 7 testes novos. Detalhe em SPEC-20.

**Identificado e não feito:** `edgeTypes` não tem `spec` — uma conexão não pode carregar campo nenhum, diferente de `nodeTypes`, e o `EdgePanel` só deixa escolher o tipo. É a outra metade do "configurar forms das conexões" que o usuário citou; mecanismo à parte, do tamanho que a §48 foi pra campos de nó.

## 52. Forms de conexão + diagrama animado — protótipo antes de código, dois pedidos, um do outro lado

Continuação direta da §51: o usuário confirmou dois pedidos que já tinham aparecido meio soltos — "forms de conexão" (a lacuna de `edgeTypes` sem `spec`, identificada e adiada na §51) e uma reformulação grande da especificação final: "preciso de uma jornada simples e clara para os forms" (conexão) e, pra especificação, "um diagrama bonito que pode sair junto, podemos exibir animado, e depois no markdown ter todas as informações completas".

Minha primeira leitura do segundo pedido estava errada: entendi como "autoplay de revisão dos itens", parecido com a demo automática do app. O usuário corrigiu: "a animação é para facilitar a compreensão das pessoas, não para fazer review dos itens... se conseguirmos fazer com que a animação demonstre fluxo informacional... seria interessante o html com isso, pois podemos ver o geral, e depois ao interagir ver cada task/história gerada". Ou seja: o alvo é entender a ARQUITETURA (o fluxo de dados entre os nós), e só depois, interagindo, ver os itens — não uma sequência de review.

Antes de tocar em código real, o usuário sugeriu (e eu adotei) construir um protótipo com dados mockados — `_prototipos/diagrama-animado-mock.html`, fora da árvore rastreada (`_prototipos/` foi pro `.gitignore`). Isso poupou pelo menos duas rodadas de retrabalho: o usuário reagiu ao protótipo com ajustes concretos que só apareceram vendo a coisa de verdade —
1. "por ali deve ser possível ver todas informações especificadas ou pendentes de especificação" → os cards de item ganharam status por campo (verde/amarelo/vermelho), não só valor.
2. "não consigo movimentar como no nosso canvas" → pan/zoom completo (arrastar, rolar, botões +/−/reset), transform num `<g>` de viewport, igual ao React Flow.
3. Depois de ver a animação rodando, um terceiro pedido: "seria importante poder ver essa animação de forma sequencial... roda automático, ou vai avançando/voltando com next/previous" — virou um modo inteiro (barra ⏮/▶‖/⏭, escurece tudo menos o passo atual, seleciona os dois nós no painel), reaproveitando o mesmo conceito da demo automática do app (§Fase I do plano), mas dentro do diagrama exportado.
4. "Mudou muito rápido" → intervalo dobrado.
5. Uma pergunta genuína sobre a conexão `readwrite` "vai e voltar" — se era request/response. Não era (é leitura+escrita simultâneas); expliquei a diferença e registrei "request-response sequencial" como um terceiro tipo de fluxo não implementado (SPEC-21 §5), pra não expandir escopo sem necessidade.

Só depois de "no mais, execute, está aprovado" a implementação real começou — pra não pular a etapa de alinhamento visual antes do código, disciplina que o usuário pediu explicitamente e que valeu a pena (os 3 ajustes acima teriam sido retrabalho em código real, não só num protótipo descartável).

**Forms de conexão** (`EdgeTypeConfig.spec`, `Aresta.spec`/`specNA`, `EdgePanel` reusando o dispatcher de campo já exportado de `PropertiesPanel`, nova aba `CamposArestaTab` mirror de `CamposNoTab` sem o editor de lista, persistência só local em `config/campos-aresta.json`) e o **diagrama animado real** (`gerarDiagramaHtml()` no engine — mesmo princípio de `gerarEspecificacaoEntrega`, string pura, sem framework; `EdgeTypeConfig.fluxo` configurável em vez de hardcoded por verbo; `ReviewScreen` com iframe `srcDoc` + botão de export; CLI sempre emite `.html` pareado com `--out`) — detalhe completo em SPEC-21.

Validado com dado real: `gerador implementar` sobre `credito-completo` (8 nós, 6 arestas, 14 atividades) gerando um `diagrama-real.html` de verdade, aberto no navegador — pan/zoom, clique em nó, modo sequencial, tudo conferido contra o cenário real, não só teste automatizado. Regressão completa: 270 testes verdes (engine 115, web 126, cli 29).

## 53. Dois bugs reais na v0.1.16, achados só usando de verdade — e uma pergunta que reabre "campos abertos" na configuração

Publicada a v0.1.16, o usuário reportou: "quando clico no ícone de play para expandir um item depois de derivar ele vai para uma página em branco." Nenhum teste automatizado tinha pego isso — os dois bugs só apareceram rodando a feature de ponta a ponta contra dado/ambiente real, disciplina que este projeto já vem seguindo mas que essa rodada reforçou com força: **testes verdes não é a mesma coisa que a feature funcionar**.

**Bug 1 — modo hospedado quebrava a config inteira.** Rodei `packages/web/e2e/derivar-e-revisar.spec.ts` (já existente) contra o `packages/server` de verdade (Postgres via Docker) pra tentar reproduzir, e ele quebrou sozinho antes mesmo do login terminar — tela "Não foi possível carregar a configuração". Causa: `apiCamposAresta.listar(timeAtivo)` virou uma chamada incondicional em `loadConfig.ts`/`App.tsx`, mas `packages/server` nunca ganhou a rota `/campos-aresta` (decisão deliberada da §52 — server dormente). O 404 rejeitava o `Promise.all` inteiro. Corrigido com `.catch(() => [])` nos dois pontos (ausência = "sem campos custom", nunca erro fatal) + `mostrarCamposAresta={modo === "local"}` escondendo a aba que sempre falharia ao salvar no hospedado.

**Bug 2 — o de verdade que o usuário reportou.** Com o modo local funcionando, reproduzi via um script Playwright avulso contra `gerador open` de verdade: carregar `credito-completo`, derivar, abrir "Ver diagrama animado", clicar "▶ Reproduzir em sequência" (o "ícone de play" do relato). O HTML gerado tinha um `viewBox` **fixo** (`"0 0 1000 700"`) — mas `No.x`/`No.y` são livres, o usuário arrasta sem limite no canvas. Os nós do `credito-completo` iam até x=1000 (mais a largura do card, ~220px), ficando parcial ou totalmente fora da caixa fixa: SVG tecnicamente correto (dados certos, zero erro de JS), mas **visualmente vazio** — exatamente uma "página em branco", sem pista nenhuma de que havia conteúdo fora da vista. Corrigido calculando o `viewBox` a partir do bounding box real de todos os nós (+80px de margem). Validado com screenshot real (não só teste): os 8 nós aparecem, o modo sequencial funciona ponta a ponta, painel lateral mostra os itens com prontidão.

**A pergunta que ficou em aberto, pra próxima rodada:** o usuário generalizou a queixa — "a parte de configurações ainda precisa evoluir muito quanto à experiência, a impressão que dá é que são campos abertos, quando na realidade deveria ser possível, por exemplo, abrir o nó de rabbit e editar o formulário correlacionado" — e deu um exemplo concreto: "como eu edito de forma fácil os requisitos de refinamento de uma demanda que envolve Kafka (ou qualquer outro)?" Investigando: **não existe nenhuma UI pra `checklistTecnico`/`checklistProcesso`** (`config/regras.json`) — diferente de `nodeTypes[tipo].spec` (`CamposNoTab`) e `edgeTypes[tipo].spec` (`CamposArestaTab`, §52), as regras de refinamento por tech+contexto são só JSON editado à mão, sem ligação nenhuma com o nó no canvas. Fica registrado como o próximo ponto de discussão de design, não implementado ainda nesta rodada.

## 54. Duas queixas pequenas de UX em "Campos por tipo de conexão" — e um vazio que não era bug

Duas observações do usuário sobre a aba nova de `CamposArestaTab` (§52): um print mostrando o campo "Ajuda (opcional)" com a pergunta "é o rótulo de campo? onde configurar os valores padrão?", e "ao clicar em sobrescrever a tela não sobe para o formulário do topo, usuário fica com a sensação de que o botão não está funcionando".

**As duas eram achados de UX reais, não pedido de feature nova.** (1) "Ajuda" e "Rótulo" são coisas diferentes — o rótulo é o nome do campo (`FieldSpec.label`), a ajuda é um texto pequeno que aparece *abaixo* do rótulo na hora de preencher (`campo.ajuda` em `PropertiesPanel.tsx:169`) — e "Valor padrão" já é exatamente onde se configura o valor padrão, só que sem nenhuma explicação ao lado, então passava despercebido bem ao lado do campo que a pergunta procurava. Corrigido com uma legenda curta abaixo de cada rótulo, em `CamposNoTab.tsx` e `CamposArestaTab.tsx`. (2) O formulário de criar/editar/sobrescrever sempre abre no topo da aba, mas os botões "sobrescrever"/"editar" ficam na lista de tipos, mais abaixo — se a pessoa já tinha rolado a tela, o clique abria o formulário fora da área visível: parecia inerte, mas funcionava. Corrigido com `scrollIntoView` no container do formulário, disparado nos três pontos de abertura (`abrirNovo`/`abrirEdicao`/`abrirSobrescrita`).

**Um terceiro ponto, olhando o mesmo print:** todo tipo de conexão aparecia "Nenhum campo ainda." — nem HTTP, que já tinha ganhado `timeoutMs` como exemplo na §52. Investigando: não era regressão, era o config real do projeto sendo testado ainda não ter sido re-inicializado depois da §52 (config antigo, sem `edgeTypes[tipo].spec`). Mas o usuário perguntou se fazia sentido "colocar algo" ali — e fazia: só `http` tinha exemplo, os outros 12 tipos ficavam sempre vazios até alguém adicionar o primeiro campo à mão, inclusive na própria demo deste repositório. Adicionados exemplos ilustrativos nos tipos mais comuns de mensageria/RPC — `grpc.timeoutMs` (mesmo padrão de `http`), `publishes.chaveRoteamento` e `pubsub.chaveRoteamento` (routing key/tópico), `consumes.sincrono` (booleano) — em `config/diagrama.example.json` e no mirror byte-idêntico `packages/cli/templates/diagrama.json`. Isso também resolve a demo: quem abre "Campos por tipo de conexão" pela primeira vez agora vê o padrão "sobrescrever" funcionando em vários tipos, não só um.

Regressão completa: engine 117, web 129, cli 29 — sem mudança de schema/API, só UI e config de exemplo.

## 55. Checklist técnico ignorava se o recurso já existe — achado de funcionalidade central

O usuário reportou algo mais sério que UX: "ao construir o diagrama e colocar que um mongo já existe, ainda consta as mesmas especificações que aparecem com um [mongo novo] — isso não faz sentido, o mesmo é aplicado aos outros itens... a ideia da ferramenta é acelerar o processo." Pedido explícito de análise geral, não só o caso do Mongo — usei plan mode pra investigar antes de mexer em código (mudança de tipo do engine + assinatura de função + conteúdo de domínio, não um ajuste trivial).

**A causa não era falta de mecanismo — era um mecanismo que não tinha sido estendido.** Todo `No` já tem `status: "novo"/"existente"`, e o operador `nodeStatus` já era usado extensivamente em `FieldSpec.when` de `config/diagrama.example.json`: praticamente todo tipo de recurso (mongo, sql, kafka, rabbit, cache, storage, batch, camunda, rule/fico, job, mobile) já tem um campo "Plano de migração"/"Estratégia para instâncias em voo" que só aparece quando `existente`. O buraco estava no **checklist técnico** (`Requisito`, "Requisitos de refinamento técnico"): o tipo não tinha `when`, e `gerarChecklistTecnico()` nem recebia os nós da atividade — diferente do checklist de **processo** (`ItemProcesso`, SPEC-20), que já tinha exatamente esse mecanismo desde a separação dos dois checklists.

Investigação achou uma duplicação concreta, não uma impressão vaga: três itens de `checklistTecnico` repetiam em texto solto exatamente a mesma decisão que um `FieldSpec` já-existente-only já cobria — "Definir plano de migração e rollback do schema" (`Backend-dados`, duplica o campo `migracao` de mongo/sql), "Definir o que acontece com instâncias em voo..." (`Backend-orquestracao`, duplica `estrategiaVersionamento` do camunda), "Definir versionamento das regras..." (`Backend-regras`, duplica `migracao` de rule/fico) — e apareciam pra todo nó do contexto, novo ou existente. Os demais itens (retry/DLQ, idempotência, índice, timeout, invalidação de cache...) não são duplicação — são decisão de integração que vale nos dois casos, e ficaram intocados: gatear eles removeria checklist ainda necessário.

Correção: `Requisito` ganhou `when?: Condicao` (mesma semântica de `ItemProcesso.when`); `gerarChecklistTecnico()` ganhou `nos`/`arestas` e passou a filtrar via `condicaoBate()` (extraída pra aceitar os dois tipos de item — a lógica era idêntica); os dois call sites (`gerarEspecificacaoEntrega.ts`, `exportar.ts`/`paraMarkdown` usado por `gerador derive`) atualizados; os três itens duplicados ganharam `when: { nodeStatus: "existente" }` em `config/regras.example.json` + mirror.

Validado com dado real, não só teste: `gerador implementar` sobre `credito-completo` em dois estados — tudo "novo" (nenhum dos três itens aparece em lugar nenhum) e camunda/mongo/rule marcados "existente" (cada item aparece só na atividade certa — o SQL, que ficou "novo", não ganhou "plano de migração" nenhum, mesmo contexto `Backend-dados` do Mongo que ganhou). Regressão completa: engine 120, web 129, cli 29. Detalhe em SPEC-22.

## 56. Dois "bugs" que não reproduziram — e o achado real por trás: sem indicador de versão, o usuário não sabia se estava testando código velho

Publicada a v0.1.19, o usuário reportou dois novos problemas na tela de revisão: "ainda caiu na tela branca ao clicar em um item na revisão de quebra" e "nada acontece quando clico em gerar especificação da solução". No meio do relato, um comentário que mudou a prioridade da investigação: "eu estou rodando install pelo npm e open no terminal na mesma máquina aqui. Às vezes não tenho certeza se a versão que estou usando é a correta... não sei nem se os bugs realmente existem ou é algo antigo."

**Resolvido primeiro, antes de caçar os bugs**, porque sem isso a investigação seria cega: `GET /versao` novo em `openApiLocal.ts` (mesmo padrão de `GET /auth/modo`), lendo `package.json` do próprio pacote instalado em runtime — dois candidatos de caminho (`../package.json` cobre o layout bundlado, `../../package.json` cobre rodar direto de `src/commands/`, mesma dualidade que `DIST_WEB_BUNDLADO`/`DIST_WEB_MONOREPO` já tratava pro build web). Badge discreto no cabeçalho do app (`v0.1.19`), buscado uma vez no boot, com `.catch(() => undefined)` — modo hospedado/dev não têm a rota, e isso não pode quebrar nada.

**Investigação dos dois bugs relatados, com Playwright real (não achismo):** reproduzi passo a passo contra um `gerador open` recém-buildado — carregar `credito-completo`, derivar, expandir um item (`renderizarItemEspecificacao` inline), clicar no link do item, clicar em "Gerar especificação de solução" com `page.on("pageerror"/"console")` capturando qualquer erro. **Nenhum dos dois reproduziu.** Expandir item renderizou a especificação completa corretamente; "Gerar especificação de solução" disparou o download de `especificacao-de-solucao.md` normalmente. Zero erros de console, zero páginas em branco.

**O achado real, batendo com a suspeita do próprio usuário:** `open.ts` nunca setava `Cache-Control` nos arquivos estáticos servidos (`DIST_WEB`) — só `/config/*.json` tinha `no-cache` (achado de uma rodada bem anterior, mesmo motivo). Os assets em `/assets/*.js|css` têm hash de conteúdo no nome (`index-B7zUFPdk.js`) — cache normal aí é seguro e correto. Mas `index.html` **referencia esses nomes com hash**, e sem `Cache-Control`, o browser pode continuar servindo um `index.html` antigo depois de `npm install -g gerador-de-itens@latest` + reiniciar `gerador open` — apontando pra um arquivo JS que não existe mais no disco (hash mudou no rebuild). Isso é literalmente uma "tela em branco" sem erro nenhum visível: o browser tenta carregar um módulo ES que dá 404, e a página nunca monta. Corrigido: `index.html` (nas duas rotas que o serve — match direto e fallback de SPA) sempre ganha `Cache-Control: no-cache`; os assets com hash continuam cacheáveis como estavam.

**Conclusão comunicada ao usuário:** os dois bugs relatados muito provavelmente eram sintoma de cache de browser sobre uma versão anterior (`npm install` tinha rodado, mas a aba já estava aberta com o `index.html` velho em cache) — não uma regressão nova em v0.1.19. O indicador de versão visível deixa isso verificável na hora, e o `Cache-Control: no-cache` em `index.html` remove a causa raiz de qualquer futuro caso desse tipo, sem exigir hard-refresh manual do usuário depois de cada upgrade.

Testes novos: `openApiLocal.test.ts` (`GET /versao` devolve semver válido). Regressão completa: engine 120, web 129, cli 30.

## 57. A causa real da "tela branca": o app web nunca validava `regras.json`, e um tech incompleto derrubava o React inteiro

Com o indicador de versão em mãos (§56), o usuário confirmou versão certa e continuou testando — e desta vez trouxe o console real do navegador: `TypeError: Cannot read properties of undefined (reading 'filter')`, com a stack apontando pro bundle minificado publicado (`index-B7zUFPdk.js`).

**Diagnóstico direto, sem achismo:** o hash do bundle no erro batia exatamente com um build local já feito nesta sessão — dava pra abrir o arquivo minificado de verdade e ler a linha/coluna do stack trace. Achado: `T4` é `requisitosRelevantes()`, chamada de dentro de `I4` (`gerarChecklistTecnico`) como `T4(a.checklistTecnico, n)`, onde `a = regras.porTech[tech]`. `a.checklistTecnico` estava `undefined` — `.filter` num `undefined` é o `TypeError` relatado, ponto a ponto.

**A causa raiz, mais profunda que o `TypeError` em si:** `config/regras.json` é editado à mão (sem UI nenhuma, achado já registrado na §53) — e **`packages/web` nunca chamou `validateRegras()`/`validateConfig()`**, diferente de `packages/cli` (`derive.ts`/`implementar.ts`), que valida antes de gerar qualquer coisa. Um tech com `checklistTecnico` faltando (campo obrigatório no tipo TS, mas nada garante isso em runtime contra um arquivo editado à mão) carregava sem erro nenhum na hora do boot, e só explodia depois, ao expandir um item cujas `techs` incluíssem esse tech incompleto — momento em que **não havia nenhum `ErrorBoundary`** pra conter o crash, e o React inteiro desmontava pra uma tela branca.

**Correção em duas camadas, deliberadamente:**
1. **Pontual**: `gerarChecklistTecnico()`/`gerarCiclosDeTeste()` (`packages/engine/src/refinamento/gerarRefinamento.ts`) passam a tratar `checklistTecnico`/`testes` faltando como lista vazia (`?? []`) — resolve o crash relatado exatamente.
2. **Sistêmica**: novo `ErrorBoundary.tsx` (único componente de classe do app — `componentDidCatch`/`getDerivedStateFromError` não têm equivalente de hook) envolvendo `<App/>` em `main.tsx`. Qualquer exceção de render futura, desse tipo ou de qualquer outro, mostra uma tela de erro recuperável ("Algo deu errado" + botão Recarregar) em vez de branco sem explicação nenhuma — a proteção que devia ter existido desde o início, e que a investigação de uma rodada anterior (§56) já tinha sinalizado como ausente.

**Validação com o bug real reproduzido, não hipotético:** recriei o cenário exato — `gerador init`, removi `checklistTecnico` de `Backend` em `config/regras.json` de propósito, carreguei o mesmo cenário "Fluxo completo: aprovação de crédito", derivei, expandi o item 01. Antes da correção isso é exatamente o `TypeError` relatado; depois, o item expande normal, mostrando "_Nenhum requisito técnico específico para esta combinação de tech/contexto._" em vez de quebrar — zero erros de console, confirmado via Playwright com `page.on("pageerror"/"console")`.

Testes novos: `gerarRefinamento.test.ts` (dois casos — tech sem `checklistTecnico`, tech sem `testes` — nenhum lança), `ErrorBoundary.test.tsx` (captura erro e mostra fallback; sem erro, renderiza os filhos normalmente). Regressão completa: engine 122, web 131, cli 30.

## 58. Arquitetando LLM local + RAG — o achado de que a infraestrutura de "sugestão" já existia

O usuário pediu pra arquitetar (não implementar ainda) um LLM local + RAG cobrindo 5 fluxos: apoio conversacional no canvas, apoio a ajustes/configurações, construção dos itens completos, correção após mudança de requisitos, e configuração dos checklists de processo (nichados por contexto, hoje sem UI) via retrospectivas. Modelo sugerido: "Qwen 3 4B + llama" — confirmado via `AskUserQuestion` que "llama" era o motor llama.cpp, não um modelo Llama alternativo, e que esta rodada é só o documento de arquitetura, sem código.

Investigação (2 agentes Explore em paralelo + pesquisa externa) achou a peça mais importante do desenho inteiro **já pronta, testada, em produção**: `Origem` (`model/types.ts`) já inclui `"sugerido"` no union (`manual|extraido|inferido|sugerido`), e `calcularProntidao()` já trata esse valor sem `confirmado: true` como não-resolvido — um comentário no próprio código cita "§4.3 — nada sugerido conta até ser confirmado nó a nó". Ou seja: o mecanismo de "isso foi sugerido por algo não-humano, nunca vira verde sem alguém confirmar" já existia antes de qualquer LLM entrar na ferramenta — só nunca tinha sido usado. Isso muda o desenho inteiro dos fluxos 1-3: um valor sugerido pelo LLM é só mais um `ValorSpec` com `origem: "sugerido"`, reusando 100% do semáforo e da UI de confirmar/descartar já existente em `PropertiesPanel.tsx` — zero mecanismo de aprovação novo.

Achado inverso, um buraco real: **não existe hoje nenhuma noção de diff/regeneração** — `derivar()`/`gerarEspecificacaoEntrega()` são funções puras, sempre do zero. `no.spec` sobrevive a uma nova derivação (mora no nó), mas texto digitado nos marcadores `<- ✍️ especificar`/`historiaPo`/DoR/DoD não é persistido em lugar nenhum — é regenerado como markdown puro toda vez. Esse é o pré-requisito real pro fluxo 4 (corrigir após mudança), não só "chamar o LLM de novo": precisa de um lugar pra guardar a resposta primeiro.

Pesquisa externa confirmou a escolha do usuário: Qwen3-4B supera Llama 3.2 3B em instruction-following, `node-llama-cpp` roda embutido no mesmo processo do `gerador open` (sem instalar app separado tipo Ollama, mesma filosofia "um `npm install -g` e funciona" do SPEC-17) e suporta saída estruturada via GBNF/JSON Schema — resolve a fragilidade conhecida de modelos pequenos com JSON solto. Qwen3-Embedding-0.6B (mesma família, multilíngue) cobre a parte de embeddings sem precisar de uma segunda stack.

Arquitetura registrada em `SPEC-23-llm-local-e-rag.md`: pacote novo `packages/llm` (gestão de modelo, wrapper de chat/embeddings, índice de retrospectivas em arquivo plano — sem lib de vetor nova nesta v1), rotas novas em `openApiLocal.ts` (`/ia/status`, `/ia/chat` streaming, `/ia/sugerir`, `/ia/retrospectivas`, `/ia/checklist-sugerir`), `Quebra.respostasItens` novo pra fechar o buraco do fluxo 4, e um roteiro faseado (infra → fluxo 3 → fluxo 5 → fluxo 2 → fluxo 1 → fluxo 4, do menor risco pro maior). O usuário pediu explicitamente pra ir gradual — cada fase ganha sua própria especificação de detalhe antes de qualquer código, mesma disciplina que evitou retrabalho na rodada do diagrama animado (protótipo antes de código real, SPEC-21 §3.1) — registrado como regra de processo no próprio SPEC-23 §6.1.

**Nenhum código foi escrito nesta rodada** — só o documento de arquitetura + esta entrada.

## 59. Fase 0 do LLM local: infra implementada — pacote novo, dois modelos, download real validado

Com o `SPEC-23` aprovado, o usuário pediu pra começar a implementação seguindo a ordem do roteiro faseado, com uma condição explícita: "se você achar apropriado, pode especificar os fluxos antes de implementar os agentes e interfaces, aí vamos mais gradualmente" — confirmando o §6.1 do próprio SPEC (cada fase ganha detalhe antes de código).

Antes de escrever qualquer linha, uma decisão de produto real precisava ser tomada: `node-llama-cpp` baixa binários nativos pré-compilados no `npm install` — colocar `@gerador/llm` como dependência direta do `packages/cli` deixa TODO `npm install -g gerador-de-itens` mais pesado, mesmo pra quem nunca usa IA. Perguntado via `AskUserQuestion`: confirmado dependência direta por enquanto (mais simples de implementar/testar agora — não é decisão irreversível, um pacote separado com instalação sob demanda fica registrado como opção se o peso incomodar depois).

Pesquisa de API real antes de escrever código (não assumida): lidos os `.d.ts` do `node-llama-cpp` instalado de verdade — confirmou `getLlama()`, `model.createContext()`/`createEmbeddingContext()`, `LlamaChatSession`, e principalmente `llama.createGrammarForJsonSchema(schema)` + `grammar.parse(resposta)` pra saída JSON restrita via GBNF — exatamente o mecanismo que resolve a fragilidade de modelos pequenos gerando JSON solto, já previsto no SPEC-23.

Implementado: pacote `packages/llm` (`modelos.ts` — registro Qwen3-4B + Qwen3-Embedding-0.6B; `cache.ts` — `~/.gerador/models`; `download.ts` — download com `.part`/retomada e verificação por tamanho; `status.ts` — `verificarStatus()`; `motor.ts` — wrapper de chat/embeddings/GBNF), comando `gerador ia instalar`/`gerador ia status`, rota `GET /ia/status`. `node-llama-cpp` exige Node ≥20 — `packages/cli` teve `engines` atualizado de `>=18`.

**Achado real de build**: `packages/llm`, sendo workspace TS-fonte sem build próprio (mesma situação de `@gerador/engine`), precisou entrar no `noExternal` do `tsup.config.ts` do CLI pra ser bundlado — mas `node-llama-cpp` (dependência dele, com binário nativo) tinha que ficar de FORA do bundle, senão o `.node` nativo não seria resolvível em runtime. Confirmado com `npm run build --workspace=packages/cli` + `node dist/cli.js ia status` rodando de verdade contra o binário nativo instalado (`node_modules/@node-llama-cpp/win-x64`).

**Validação real, não só testes** — e não sem tropeço: a primeira tentativa de `gerador ia instalar` foi interrompida no meio do download do modelo de chat (terminal aberto interferindo, conforme o usuário identificou e resolveu fechando-o). Na tentativa seguinte, o download do modelo de embedding falhou de verdade com HTTP 404 — o nome de arquivo "óbvio" (`qwen3-embedding-0.6b-q8_0.gguf`, minúsculo, seguindo a convenção do Qwen3-4B-GGUF) não existe no repositório. Consultando a API real da Hugging Face (`huggingface.co/api/models/Qwen/Qwen3-Embedding-0.6B-GGUF`) achei o nome real: `Qwen3-Embedding-0.6B-Q8_0.gguf` (maiúsculas) — corrigido em `modelos.ts` com comentário explicando o achado. Exatamente o tipo de bug que só aparece com dado real, nunca com mock.

Depois da correção, os dois modelos (~3,15GB) baixaram com sucesso e `gerador ia status` confirmou os dois instalados. Fui além do status e validei o `motor.ts` ponta a ponta contra os modelos reais: completar texto livre (resposta correta em português sobre fila de mensagens), completar com JSON Schema obrigatório via GBNF (saída estruturada válida, `{"nome":"MessageBuffer","tipo":"fila"}`), e gerar embedding (vetor de 1024 dimensões). Os três caminhos do `motor.ts` — o único módulo sem teste automatizado do pacote — funcionaram de primeira contra o binário nativo real. Regressão completa: engine 122, llm 11 (novo pacote), web 131, cli 35.

**Nenhuma UI foi construída nesta rodada** — Fase 0 é só infra, sem nenhum dos 5 fluxos ainda visíveis pro usuário final. Próximo passo do roteiro: Fase 1 (fluxo 3 — construção dos itens completos), com sua própria especificação de detalhe antes de codar.

## 60. Fase 1 do LLM local: fluxo 3 (itens completos) — primeiro fluxo visível pro usuário

Usuário pediu pra seguir com "continuar, adiante". Antes de codar, escrevi o detalhamento da Fase 1 na própria SPEC-23 (§6.3, regra §6.1 que o usuário pediu na rodada anterior) — investigando o código real primeiro, não assumindo. Achado que corrigiu a investigação original do SPEC-23: os placeholders `<- ✍️ especificar` NÃO são um campo genérico uniforme — são três formas heterogêneas (checklist técnico por linha de `Requisito.texto`, volumetria com 4 campos fixos nomeados, e `historiaPo`/DoR/DoD como esqueleto de documento inteiro). Nenhuma delas passa por `calcularProntidao()` — reusar `ValorSpec`/`Origem` aqui é reuso de forma, não do semáforo em si. Escopo desta fase: só checklist técnico + volumetria (por-atividade, convergem no mesmo `renderizarItemEspecificacao`); `historiaPo`/DoR/DoD ficam pra uma extensão futura (não têm hoje nenhum widget na UI da revisão).

Implementado: `listarPlaceholders()` novo no engine (reusa a mesma filtragem tech/contexto/`when` já existente, sem duplicar lógica); `gerarChecklistTecnico`/`gerarVolumetria` ganharam parâmetro `respostas` opcional, interpolando a resposta na linha sem nunca remover o marcador (contrato do agente validador Confluence é imutável); `Quebra.respostasItens` novo, chaveado por `Atividade.chave` (sobrevive a uma nova derivação); rota `POST /ia/sugerir` (schema fixo `{valor: string}` via GBNF, motor de chat como singleton lazy por processo — carregar o modelo a cada request custaria segundos); painel novo em `ReviewScreen` com "✨ Sugerir" + confirmação manual, sugestão não confirmada nunca entra no documento final.

**Achado real fora do escopo de IA**, encontrado investigando a persistência antes de implementar: `comoQuebraSalva()` em `openApiLocal.ts` só devolvia `{id, titulo, time, diagrama, criadoEm, atualizadoEm}` pro `GET /quebras/:id` — qualquer campo novo em `Quebra`, incluindo `respostasItens`, seria persistido no arquivo mas nunca devolvido de volta ao recarregar a quebra. Corrigido antes de implementar o resto (senão a resposta salva "sumiria" silenciosamente ao reabrir), e validado com `curl` real contra o servidor rodando de verdade: POST com `respostasItens` → arquivo em disco → GET devolve o mesmo objeto de volta, intacto.

**Validação real, não só testes**: com `gerador open` rodando de verdade (build do CLI, modelos já instalados desde a Fase 0), `POST /ia/sugerir` com um requisito real (`"DLQ configurada e monitorada"`, tech Backend, contexto de uma fila Rabbit) devolveu uma sugestão coerente e específica em português, via GBNF, em poucos segundos — sem nenhum tropeço desta vez (diferente da Fase 0, onde um bug real de nome de arquivo apareceu). Regressão completa: engine 132 (+10), llm 11, web 135 (+4), cli 37 (+2).

Próximo passo do roteiro: Fase 2 (fluxo 5 — RAG de verdade pro checklist de processo), com sua própria especificação de detalhe antes de codar.

## 61. Correção pós-publicação: instalação sem `--allow-scripts` derrubava o `gerador open` inteiro

Usuário instalou a `v0.1.23` de verdade num Windows limpo (`npm install -g gerador-de-itens`, sem flag) e recebeu um aviso de segurança do Windows ("Parte deste aplicativo foi bloqueado") ao carregar `ggml-cpu-icelake.dll`. Investigação passo a passo, não assumida:

1. O próprio `npm install` já tinha avisado (`npm warn allow-scripts`) que o postinstall de `node-llama-cpp` foi pulado — versões recentes do `npm` bloqueiam postinstall de dependências não aprovadas por padrão. Sem esse postinstall, `node-llama-cpp` não roda o processo próprio dele de instalação do binário nativo, e o `.dll` resultante fica num estado que o Windows Defender não reconhece.
2. Antes de escrever no README que "o resto do app continua funcionando mesmo sem a flag", fui verificar essa afirmação no código — e achei um bug real: `tratarIaSugerir` (`openApiLocal.ts`) não tinha `try/catch`, e `open.ts` chama o roteador da API dentro de uma IIFE assíncrona sem `.catch()`. Uma falha em `carregarModeloChat`/`completarComSchema` (exatamente o caso do binário bloqueado) virava rejeição de promise não tratada — que em versões recentes do Node.js **derruba o processo Node inteiro**, não só aquela requisição. `gerador open` caía por completo na primeira tentativa de usar IA com o ambiente quebrado.

Corrigido: `try/catch` em `tratarIaSugerir`, devolvendo `500` tratado; o singleton do motor é descartado na falha, então uma tentativa seguinte (depois do usuário corrigir o ambiente) recarrega sem precisar reiniciar o servidor. Teste novo cobre a sequência completa: falha → 500 tratado → servidor continua respondendo → nova tentativa carrega e funciona. README raiz e do CLI atualizados com `npm install -g gerador-de-itens --allow-scripts=node-llama-cpp` e uma nota de solução de problemas. Regressão completa: engine 132, llm 11, web 135, cli 37 (+1 teste do bug).

Achado que vale generalizar: qualquer rota async nova em `openApiLocal.ts` que dependa de I/O externo (rede, binário nativo, arquivo) precisa de `try/catch` próprio — o request handler de `open.ts` não tem uma rede de segurança geral, então cada rota é responsável por nunca deixar uma exceção escapar sem tratamento.

## 62. Fase 1 do LLM local: feedback real derruba o desenho — fluxo 3 era outra coisa

Testando `v0.1.24` de verdade (já sem o crash), o usuário deu retorno direto: os botões "✨ Sugerir" por requisito não são o fluxo que ele pediu. O fluxo real — hoje praticado FORA da ferramenta, colando a especificação de solução gerada num chat de IA externo pra estruturar Histórias/Tasks — precisa acontecer DENTRO da ferramenta, sobre a quebra inteira, com feedback visual rico tipo conversar com um agente (streaming, cores, sensação de "está trabalhando"), não campo a campo.

Três achados adicionais nessa mesma rodada de teste real:

1. **Bug real de corrupção de encoding**: caracteres acentuados às vezes saem como `�` na saída do modelo. Investigado com dado real (não assumido): rodei o mesmo prompt 3x direto contra `motor.ts`, fora do HTTP — saiu limpo as 3 vezes. Não é bug no meu código, é um artefato raro e não-determinístico da amostragem restrita por gramática GBNF do llama.cpp/node-llama-cpp com UTF-8 multi-byte, mais provável em gerações longas. Mitigação real registrada na SPEC-23: detectar o caractere de substituição e tentar de novo automaticamente, já que a causa raiz é upstream.
2. **Sem lugar pro contexto do épico**: `demandInfo` existe mas é só texto simples, não alimenta o modelo, sem suporte a anexo. Usuário confirmou (via pergunta direta): precisa de uma tela ANTES do botão "Gerar" pra colar/anexar esse material.
3. **Pesquisa de UX generativa 2026** (sem skill de UX registrada neste ambiente — pesquisa via busca na web): confirma a direção — streaming token-a-token é o padrão esperado, "chat pra tarefa aberta, formulário pra dado com forma clara". Estruturar histórias/tasks é tarefa aberta.

O usuário então compartilhou um protótipo HTML de referência (`gerador-itens-prototipo-v2.html`, copiado pra `_prototipos/` — animação simulada, sem IA real) detalhando a experiência-alvo: barra de fase narrando o progresso, diagrama animado em sincronia com o item sendo escrito, itens "pousando" numa lista, ficha em abas (Especificação/Contrato/Refinamento/Testes) editável por clique, e um funil único de proposta (sugerir OU chat livre → diff → aprovar/descartar → confirmar) — generalizando a regra "nada sugerido conta até confirmado" que já existia, só que pontual demais.

Registrei o escopo revisado na SPEC-23 §6.5, quebrado em 5 sub-fases (1a dado estruturado no engine, 1b tela de contexto do épico, 1c streaming real, 1d tela de geração, 1e funil unificado de proposta) — nenhuma código ainda, por decisão deliberada: o trabalho já feito (`respostasItens`, `listarPlaceholders`, `/ia/sugerir`, painel na revisão) não é descartado, é absorvido pela ficha rica quando ela existir. Próximo passo: sub-fase 1a, com sua própria especificação de detalhe antes de codar (§6.1).

## 63. Fase 1a: dado estruturado por atividade no engine

Usuário confirmou (via pergunta direta) que o contexto do épico entra numa tela antes de "Gerar", e pediu pra seguir. Implementei a sub-fase 1a: `estruturarEspecificacaoNo()` resolve a especificação técnica de um nó como objeto (campos escalares/lista com dado bruto, não texto pré-formatado) em vez de markdown direto; `montarFichaItem()` agrega isso com o checklist técnico/volumetria (via `listarPlaceholders`, já reusado da Fase 1 anterior — nenhuma lógica de derivação duplicada) pra formar uma "ficha" por atividade, pronta pra uma UI futura consumir sem reparsear markdown.

Decisão deliberada de escopo, pra não especular: `checklistProcessoMarkdown`/`ciclosTesteMarkdown`/`criteriosAceiteMarkdown` ficam markdown puro dentro da ficha — são gerados por regra determinística, não por resposta humana/IA como o checklist técnico/volumetria, e não têm consumidor de UI ainda. Estruturá-los sem necessidade real seria abstração prematura.

`renderizarItemEspecificacao` foi refatorado pra usar `estruturarEspecificacaoNo` por dentro (formatador de markdown separado do dado) — texto final byte-idêntico ao anterior, confirmado pelos 22 testes de markdown existentes passando sem alteração nenhuma, mais 6 testes novos cobrindo o dado estruturado (campo escalar preenchido/N/A, tipo de nó desconhecido não lança, campo lista com itens brutos, agregação de checklist técnico/volumetria com e sem resposta). Regressão completa: engine 138 (+6), llm 11, web 135, cli 37 — tudo verde, nenhuma mudança de comportamento visível pro usuário nesta rodada (é infra pra Fase 1d).

Próximo passo do roteiro: sub-fase 1b (tela de contexto do épico — texto + anexos, antes de "Gerar"), com sua própria especificação de detalhe antes de codar.

## 64. Fase 1d-i: reestilizar a `ReviewScreen` — o usuário pediu pra inverter a ordem do roteiro

Publicada a Fase 1a, o usuário testou e reportou o esperado pra um trabalho de infra invisível: "instalei, mas não vi nada parecido com o protótipo". Perguntei se seguíamos a ordem original do roteiro (1a→1b→1c→1d→1e) ou pulávamos pra algo visível antes — resposta direta: primeiro arrumar a `ReviewScreen` seguindo o protótipo, **depois** plugar o contexto do épico. Ordem do §6.5 invertida por pedido explícito, não por iniciativa própria.

Reescrita a tela inteira: tema escuro (mesma paleta já usada em `gerarDiagramaHtml.ts`, pra manter identidade visual entre o diagrama animado e a tela ao redor — `--bg:#0f172a`, `--accent:#38bdf8` etc.), lista de itens à esquerda com indicador de status por cor, ficha à direita com 4 abas (Especificação/Contrato/Refinamento/Testes) consumindo `montarFichaItem()` da Fase 1a, contadores de status no cabeçalho. Duas reduções de escopo deliberadas em relação ao protótipo, registradas na SPEC-23 antes de codar: sem a animação de geração fake (não existe processo de geração real pra narrar ainda — `derivar()` é síncrono) e sem chat livre (isso é 1e); o diagrama continua atrás do botão de alternar em vez de embutido, porque `gerarDiagramaHtml` gera uma página própria completa e encaixar só o SVG cortaria esse chrome.

Validação real, não só suíte verde: com `gerador open` rodando de verdade, um cenário pronto carregado e derivado, naveguei pelas 4 abas via Playwright, cliquei "✨ Sugerir" de verdade contra o modelo local (resposta coerente em ~40s), confirmei, e vi o dot do item mudar de cor e o contador ir de "4 rascunho" pra "3 rascunho · 1 refinado" — o funil sugerir→confirmar→refletir no status funcionando de ponta a ponta com o modelo real. No caminho, achado incidental: o texto de onboarding (`Jornada.tsx`) ainda descrevia a interação antiga ("expanda cada item"), corrigido pra "selecione cada item... em abas". Regressão completa: engine 138, llm 11, web 140 (+5), cli 37 — só web mudou nesta rodada.

Próximo passo, na ordem que o usuário pediu: sub-fase 1b (contexto do épico), com sua própria especificação de detalhe antes de codar.

## 65. "Ainda parece que não rodou IA" — a animação depende de 1c, não é cosmética a adiantar; e a Fase 1b fecha um campo morto

Usuário testou `v0.1.26` e reportou: "está MUITO diferente do protótipo... parece que não rodou IA ainda". Esclarecido em seguida: faltam as animações — o protótipo descreve o processo de geração ao vivo pela IA, não só o layout. Perguntado como fechar isso rápido sem simular um processo que não existe, três opções foram postas (orquestrar em lote as chamadas reais já existentes, só enriquecer visualmente o botão individual, ou esperar 1c/streaming existir de verdade primeiro) — o usuário escolheu esperar 1c. Confirmada em seguida a ordem: 1b continua o próximo passo.

Investigando 1b antes de codar (§6.1), achado real: `Quebra.demandInfo` já existia no modelo desde muito antes — comentário dizendo que era "a descrição longa do contexto" — mas era campo morto: `factory.ts` inicializava como string vazia, nenhuma tela em lugar nenhum do app tinha UI de edição pra ele, e só era *lido* (nunca escrito) na seção "Contexto" do documento exportado. Pior: `comoQuebraSalva()` nem devolvia esse campo no `GET /quebras/:id` — mesma classe de bug já achada e corrigida pra `respostasItens` na Fase 1 (persiste no arquivo, some silenciosamente ao recarregar). `demandInfo` era exatamente o campo que faltava pro contexto do épico — reusado em vez de duplicado.

Implementado: `Quebra.anexosContexto` novo (anexos de texto, `FileReader.readAsText`, mesmo padrão de `ImportarGraphify.tsx`); fix do bug de round-trip em `comoQuebraSalva`; painel novo `ContextoEpicoPanel.tsx` (textarea + upload de anexos) acessível por um botão no header, ao lado de "Derivar Quebra" — decisão deliberada de não construir uma tela cheia dedicada ainda, já que não há geração de verdade por trás pra justificar essa navegação nova (isso é 1c/1e); `contextoDoPlaceholder()` na `ReviewScreen` passou a concatenar `demandInfo` + conteúdo dos anexos antes do contexto do nó, mandado de verdade pro `/ia/sugerir` real — o contexto do épico passou a alimentar a sugestão de hoje, não só o documento final.

Validado com dado real: `gerador open` de verdade, painel aberto, texto colado, arquivo `.md` anexado via upload real, salvo, reaberto (estado sobreviveu), quebra salva de verdade via `POST /quebras`, e `GET /quebras/:id` contra o servidor real confirmou `demandInfo`/`anexosContexto` voltando intactos — o fix do bug de round-trip provado contra o servidor real, não só a suíte. Regressão completa: engine 138, llm 11, web 145 (+5), cli 39 (+2).

Próximo passo do roteiro: 1c (streaming real) — pré-requisito que o próprio usuário definiu pra animação de geração ao vivo, adiada até existir de verdade.

## 66. 1c (streaming real) + 1d (geração ao vivo): o usuário viu o protótipo de novo e pediu fidelidade — a peça que faltava não era só streaming, era orquestração

Pedido pra escrever a especificação de 1c antes de codar, respondida com "sim". Investigando o schema de `/ia/sugerir` antes de desenhar: é só `{valor: string}`, um campo único — GBNF/JSON Schema (usado até então) faz sentido pra estrutura com múltiplos campos, mas pra um campo só a "estrutura" é decorativa, e streamar um JSON sendo montado mostraria pontuação aparecendo antes do texto de verdade. Decisão: trocar `completarComSchema()` por `completar()` (texto livre, já suportava `onTexto` desde a Fase 0, nunca usado) — resposta vira `text/plain` em pedaços em vez de JSON. Cliente ganhou implementação própria (sem passar pelo helper `requisitar()` genérico, que assume JSON) com `fetch()` + `ReadableStream` + callback de progresso.

Antes de eu terminar de escrever a spec de 1c, o usuário respondeu com um recorte de tela do próprio protótipo (barra de fase "Escrevendo história 5 de 8", diagrama compacto sempre visível no topo, item rail com chips, ficha com abas) e pediu "precisa ficar igual o protótipo... prossiga". Isso ia muito além do que 1c sozinho entregaria (só o texto de UM placeholder aparecendo em tempo real) — faltava a peça que orquestra a fila inteira. Registrada uma sub-fase nova, 1d ("Geração ao vivo"), com uma diferença deliberada do protótipo documentada antes de codar: no protótipo (mock, sem IA real) os itens "pousam" um a um porque a animação inteira é fake; aqui os itens já existem 100% de verdade assim que `derivar()` roda (síncrono, determinístico) — o que é real e vale animar é o preenchimento dos requisitos via IA, não a "descoberta" dos itens.

Implementado: `useGeracaoAoVivo` (hook novo) monta a fila de placeholders pendentes de todos os itens e processa em sequência real via `/ia/sugerir` streaming — nunca em paralelo (um modelo, uma sessão). Suporta pausar (sem cortar uma chamada em andamento) e "gerar de novo" (reinicia do zero, com um sistema de token que invalida qualquer execução anterior ainda em voo, provado por teste). Dispara sozinho ao montar a tela, só se o modelo já estiver instalado (`/ia/status`) — sem isso, cai no comportamento manual de sempre. `DiagramaCompacto` (componente novo, SVG simples, só leitura) fica sempre visível no topo, destacando o nó do item em processamento — decisão que substitui a da 1d-i (lá, manter atrás de um botão fazia sentido porque não existia processo real pra sincronizar; agora existe). O diagrama completo (`gerarDiagramaHtml`, interativo, com sequência guiada) continua acessível via "🔍 Ver diagrama completo". A ficha segue automaticamente o item em geração (badge "Seguindo a geração"), quebrando o auto-follow só quando o usuário clica manualmente noutro item.

Escopo cortado deliberadamente, registrado antes de codar: sem controle de velocidade "1x/2x" (no protótipo controla uma animação fake; aqui cada passo é uma chamada de rede real — fingir "2x mais rápido" seria voltar a fabricar comportamento); sem a caixa de texto livre "Peça uma alteração ao agente" (isso é o funil unificado de proposta, 1e — um campo sem o mecanismo de diff/aprovar por trás seria widget solto); sem faixa de legenda clicável por tipo de nó (nice-to-have visual, sem valor central pra "sensação de que está gerando de verdade").

Achados reais durante a implementação: (1) um teste de streaming que escrevia pedaços em sequência apertada via `res.write()` sem yield entre eles via os pedaços coalescendo num único read do lado do cliente em `localhost` — precisou de um pequeno delay artificial no mock pra provar múltiplos reads de verdade (achado de mecânica de teste, o código de produção já lida bem com qualquer chunking real); (2) `getByDisplayValue`/`getByText` do Testing Library normalizam (trim) o texto comparado — um teste que esperava um pedaço com espaço à direita nunca batia.

Validação real, ponta a ponta: com `gerador open` de verdade e o modelo já instalado, carreguei o cenário "Fila Rabbit" e cliquei "Derivar Quebra" — a orquestração disparou sozinha (18 requisitos na fila), a barra de fase mostrou "Escrevendo requisito 1 de 18 · 01", o diagrama compacto destacou `srv-checkout` com anel azul, o item 01 ficou auto-selecionado ("● Seguindo a geração"), e a aba Refinamento mostrou o texto crescendo de "..." pra uma resposta técnica completa e coerente em português ao longo de 3 capturas em sequência — prova de streaming e orquestração reais, não um estado fixo nem uma animação decorativa. Regressão completa: engine 138, llm 11, web 160 (+15 nesta rodada, 1c+1d juntas), cli 40 (+1).

Próximo passo do roteiro: 1e (funil unificado de proposta — "Sugerir" + chat livre convergindo pro mesmo componente de diff/aprovar/confirmar), quando o usuário pedir.

## 67. 1d-ii: correção de rumo — a fila era placeholder por placeholder, faltava história e teste contextual; e um novo protótipo redesenha o próximo passo

Usuário testou `v0.1.28` contra um cenário real (aprovação de crédito, 13 itens) e reportou, com frustração visível ("eu já disse"): a tela pulou direto pra "13 itens · 0 rascunho, 0 revisar, 13 refinado" sem nenhuma animação, e — o ponto mais grave — mesmo que a orquestração tivesse rodado, o mecanismo nunca gerava história de usuário nem cenário de teste contextual, só respostas soltas de checklist técnico. Esse é o pedido original desde a Fase 1 (§6.5): a IA deveria gerar o item completo mais ou menos como o usuário fazia manualmente colando a especificação num chat externo, só que automaticamente, com a IA já embarcada.

Investigado antes de corrigir: (1) `statusDoItem()` marcava "refinado" trivialmente quando a atividade não tinha NENHUM placeholder aplicável (regra de checklist técnico sem match de tech/contexto) — combinado com o guard `if (filaInicial.length > 0)` do auto-start, isso explicava a tela pulando direto pro estado final sem barra de fase nenhuma. (2) confirmado o achado mais sério: `historiaPo` é texto fixo hardcoded por-quebra (não por-item), e o conteúdo por-item que o usuário queria contextualizado — `atividade.descricao` (frase mecânica de `derivar()`) e `criteriosAceiteMarkdown` (scaffold Gherkin determinístico por tipo de nó) — nunca passava por IA nenhuma. A infraestrutura de streaming+orquestração da Fase 1c/1d estava funcionando, só nunca tinha conteúdo real pra mostrar.

Pedido do usuário, direto: um pipeline simples — a IA recebe todo o contexto do épico + todas as informações do item, devolve num formato padrão, disparado automaticamente após "Derivar"; só depois disso existir, uma segunda camada ("editar com IA" em chat, individual ou em lote) entra por cima. A segunda camada é exatamente a 1e já planejada — confirmada como próximo passo, não descartada.

Dado o padrão de frustração com perguntas repetidas de escopo, uma correção de leitura explícita foi comunicada ao usuário antes de agir: parar de pedir confirmação e implementar a correção de rumo diretamente. Decisão de arquitetura registrada na SPEC-23 antes de codar (§6.1): a fila deixa de ser por *placeholder* e vira por **item** — cada passo faz UMA chamada que devolve história de usuário + critérios de aceite contextuais + todo o checklist técnico/volumetria pendente daquele item, via schema JSON dinâmico (chaves geradas por item a partir de `listarPlaceholders()`, sem mudança nenhuma em `completarComSchema()` — já suportava schema em runtime). Reversão deliberada da escolha de streaming livre da Fase 1c: pra um call multi-campo, a garantia de shape do GBNF vale mais que o crescimento caractere-a-caractere; o botão manual "✨ Sugerir" (`/ia/sugerir`, streaming, um campo) continua exatamente como estava.

Mudanças: `historiaUsuario`/`criteriosAceiteContextual` viram placeholders **sempre presentes** (chaves fixas `_historiaUsuario`/`_criteriosAceite`, independentes de `regras.porTech` — toda atividade tem história, não só as que batem regra técnica), reusando 100% do mecanismo `respostasItens`/`origem: "sugerido"`/"nada conta até confirmado" que já existia. Rota nova `POST /ia/sugerir-item` no CLI (schema dinâmico + GBNF). `apiIa.sugerirItem` no client. `useGeracaoAoVivo` redesenhado: fila vira uma entrada por atividade, sem mais `textoParcial` (não tem streaming campo a campo pra mostrar). `ReviewScreen`: fase bar passa a contar "item N de M" (não mais "requisito"), `montarFila` bundla os placeholders pendentes por atividade inteira, `AbaRefinamento` mostra "✨ gerando a ficha inteira…" nos campos ainda sem resposta enquanto a chamada única está em voo.

Achado colateral confirmado durante a implementação: como história/critérios agora são placeholders sempre presentes, o bug "0 rascunho imediatamente" fica estruturalmente fechado de graça — nenhuma atividade pode mais chegar a zero placeholders pendentes sem a IA ter rodado, então `statusDoItem()` nunca mais pula trivialmente pra "refinado".

Validação real, não só suíte verde: `gerador open` com o modelo Qwen3-4B de verdade instalado, cenário "Mensageria RabbitMQ" (6 itens) carregado via Jornada, "Derivar Quebra" disparou a orquestração sozinha — fase bar "Escrevendo item 1 de 6 · 01", os três placeholders da ficha mostrando "✨ gerando a ficha inteira…" simultaneamente. Depois do primeiro item concluir, o conteúdo real na tela: história "Como membro do time de antifraude, quero receber uma notificação assíncrona quando um pagamento for aprovado..." e critério "Ao receber um pagamento aprovado, o sistema deve enviar uma mensagem para o time de antifraude via DLQ..." — citando nomes reais dos nós do diagrama, prova de que o gap está fechado de verdade, não só na estrutura de dados. Achado de desempenho registrado, não bloqueante: o call multi-campo via GBNF é mais lento que o streaming de campo único (~1-1.5min por item nesta máquina) — numa quebra de 13 itens como a do relato original, a geração ao vivo pode passar de 15 minutos; aceitável pra v1 (a fila roda ao fundo, o usuário pode navegar/editar enquanto isso), candidato a otimização futura se virar fricção. Regressão completa: engine 142 (+4), llm 11, web 160 (contagem de testes redistribuída dentro do mesmo total — placeholders novos cobertos pelos testes existentes reescritos), cli 43 (+3).

No meio da rodada, antes da publicação, o usuário compartilhou um novo protótipo (`gerador-itens-prototipo-v3.html`) com uma spec de comportamento bem mais ampla: uma esteira de **4 agentes** em sequência fixa (PO → Arquiteto → Especialista técnico → QA, cada um consumindo o artefato completo do anterior, não item a item), um funil único de propostas com dois passos (Aprovar → Confirmar), roteamento de conversa por conteúdo do pedido, canvas read-only que filtra por item selecionado, e — fora de escopo da tela, mas relevante — uma config futura pra editar prompts/ordem dos agentes. Perguntado como sequenciar (terminar 1d-ii primeiro ou pivotar direto pro desenho novo), o usuário escolheu terminar e publicar 1d-ii primeiro, confirmando que a esteira de 4 agentes vira uma SPEC nova — e adicionou um detalhe importante: o pipeline de 4 papéis é o *default*, mas o usuário poderá editar o pipeline e os prompts, e escolher agentes contextuais por um canvas dentro das configurações (não é uma esteira fixa hardcoded).

Próximo passo: publicar 1d-ii (esta rodada), depois abrir uma SPEC nova pra esteira de agentes configurável (PO/Arquiteto/Especialista/QA como default editável), com sua própria especificação de detalhe antes de codar (§6.1).

## 68. SPEC-24: arquitetura da esteira de 4 agentes — documento, sem código

`v0.1.29` publicada (Fase 1d-ii de ponta a ponta). Na sequência já confirmada no §67, escrita a `SPEC-24-esteira-de-agentes.md`: arquitetura completa da esteira PO→Arquiteto→Especialista técnico→QA descrita pelo protótipo v3, mapeada contra o código atual antes de desenhar (não especulada) — achado central: o papel "Especialista técnico" já É o mecanismo existente de `RegrasConfig`/`listarPlaceholders()` (a fórmula `aplica(regra)` do protótipo bate 1:1 com `contextoBate()`, já implementada), então esse papel não precisa de schema novo, só vira uma etapa nomeada da esteira. Contrato de arquitetura (request/response/erros) e regras de teste/cenário Gherkin, por outro lado, não cabem em `ValorSpec` (escalar + proveniência) — precisam de modelo de dados novo no engine, decisão de forma exata (chave dentro de `respostasItens` serializada vs. campo top-level novo) adiada pra Fase A.

Decisão de eixo registrada como a mudança mais estrutural: 1d-ii processa um **item** por vez, do início ao fim; a esteira processa um **papel** por vez, em todos os itens — cada papel só começa quando o anterior terminou tudo. `useGeracaoAoVivo` vai precisar de reescrita nesse eixo (Fase C do roteiro), não só extensão.

Roteiro faseado registrado (A: modelo de dados · B: rotas por papel no CLI · C: orquestração por papel-x-todos-os-itens · D: canvas somente-leitura com filtro por nó, estendendo `DiagramaCompacto` · E: funil unificado de proposta — absorve formalmente a 1e do SPEC-23, que fica encerrada por esta spec · F: configurabilidade — prompts/ordem editáveis + canvas de mapeamento papel→contexto nas Configurações · G: rastreabilidade com horário) — nenhuma fase implementada nesta rodada, mesma disciplina do SPEC-23 original (documento primeiro, revisão do usuário, só depois código, fase por fase).

## 69. SPEC-24 Fase A (modelo de dados) + achados de um teste real do usuário na v0.1.29

Usuário confirmou "vamos avançar", pedindo pra seguir com o SPEC-24. Antes de codar, fechei a decisão que tinha ficado em aberto no documento (§4.2): descartei a ideia original de serializar `ContratoItem`/`RegraTeste`/`CenarioFeature` como objeto dentro de `ValorSpec.valor: unknown` — quebraria toda suposição de `valor: string` já espalhada pela UI (`typeof p.resposta?.valor === "string"`, `String(p.resposta?.valor)`) e exigiria um editor de sub-campo novo. Decisão fechada: cada sub-campo do contrato (nó vinculado/request/response/erros/dependências) e as duas saídas do QA (regras de teste, cenário Gherkin) viram 7 chaves fixas novas em `respostasItens`, cada uma um `ValorSpec` escalar comum — mesmo padrão de `_historiaUsuario`/`_criteriosAceite`, reusando 100% do mecanismo existente sem exceção.

Implementado: as 7 chaves sempre presentes em `listarPlaceholders()` (engine), `FichaItem`/`montarFichaItem()` expondo `contrato: {noVinculado,request,response,erros,dependencias}`/`regrasTeste`/`cenarioFeature`, seções novas em `renderizarItemEspecificacao()` (só aparecem no documento quando confirmadas, mesma régua "nada sugerido conta até confirmado"). Engine: 142→145 testes.

**Correção de escopo durante a implementação**: o roteiro original da Fase A também previa generalizar `statusDoItem()` pra contar os 7 campos novos como pendência. Decidi NÃO fazer isso agora — sem uma rota/orquestração (Fase B/C) capaz de preenchê-los, contá-los como pendência faria todo item regredir pra "rascunho" permanentemente, sem nenhuma ferramenta (nem manual) pra resolver isso. `statusDoItem()`, `montarFila()` e `AbaRefinamento` continuam ignorando os 7 campos novos de propósito — a Fase A entrega só o modelo de dados, de fato invisível, até a Fase B/C ligarem isso na UI.

**Enquanto isso, o usuário testou a v0.1.29 real** contra o cenário de "aprovação de crédito" (13 itens) e reportou, em tempo real: (1) a primeira geração demorou mais de 1 minuto — confirma o achado de desempenho já registrado no SPEC-23 (call multi-campo via GBNF é mais lento que streaming de campo único); (2) pedido concreto, ainda não atendido nesta rodada: o cenário de demonstração de crédito devia vir com o contexto do épico (`demandInfo`/anexos) já preenchido como massa de dados, pra testar a geração com informação completa sem digitar nada toda vez; (3) depois de confirmar que a geração de fato avançou ("agora avançou, está funcionando"), o ponto real ficou claro: "não tem os mesmos feedback visuais do protótipo" — confirma que o que falta é exatamente o handoff visual entre papéis e os pips por item que as Fases C/D do SPEC-24 vão entregar, não um bug na 1d-ii.

**Achado real de UX, corrigido na hora**: história de usuário/critérios de aceite (texto tipicamente longo, uma frase inteira) apareciam num `<input>` de uma linha só — ilegível, cortado. Trocado por `<textarea rows={3}>` (mesmo `whiteSpace: pre-wrap` que o texto confirmado já usa em `<pre>`), botões "Sugerir"/"Confirmar" movidos pra uma linha abaixo do campo em vez de ao lado — também serve de graça os campos de contrato/regras de teste que a Fase C vai popular (todos são texto potencialmente longo). `inputEstilo` (não usado em mais nenhum lugar) removido.

Regressão completa desta rodada: engine 145, web 160 (textarea não quebrou nenhum teste — `getByPlaceholderText`/`getByDisplayValue` funcionam igual em `<textarea>`), cli 43, llm 11. Build/lint limpos nos três pacotes tocados.

Pendente pra próxima rodada: massa de dados do cenário de crédito com épico pronto (pedido do usuário, não crítico); Fase B (rotas por papel no CLI) e Fase C (orquestração por papel×todos-os-itens, que traz o handoff visual que o usuário está esperando ver).

## 70. SPEC-24 Fases B+C: a esteira real, com handoff visual — o usuário testou ao vivo enquanto eu implementava

Usuário confirmou "continuar" logo depois da Fase A publicada, e — no meio da implementação das Fases B/C — testou a `v0.1.30` real contra o cenário de "aprovação de crédito" (13 itens), reportando em tempo real: (1) a primeira geração demorou mais de 1 minuto (confirma o achado de desempenho já registrado); (2) depois de confirmar que "agora avançou, está funcionando", o ponto central: "não tem os mesmos feedback visuais do protótipo" — exatamente o que Fase B/C (ainda em implementação nesse momento) se propõe a resolver; (3) achado de UX à parte, corrigido na hora: história de usuário/critérios de aceite apareciam num `<input>` de uma linha, ilegível — virou `<textarea>`.

Implementadas as duas fases juntas (interdependentes — rota sem orquestração não muda nada visível, por isso não faria sentido publicá-las separadas):

**Fase B (cli)**: uma rota só, `POST /ia/pipeline/:papel`, não 4 rotas nomeadas — o schema já é sempre o mesmo formato dinâmico de `placeholders[]` (mecanismo herdado de 1d-ii); só o preâmbulo do prompt muda por papel (`PREAMBULO_PADRAO_POR_PAPEL`). Papel desconhecido cai num preâmbulo genérico em vez de 400 — decisão pensando já na Fase F (papel custom, configurável). `/ia/sugerir-item` (o mecanismo de item-inteiro-numa-chamada da Fase 1d-ii) foi **removida** — sem consumidor depois da esteira existir, junto com `apiIa.sugerirItem`/`useGeracaoAoVivo.ts` no web (código morto, achado ao verificar quem ainda referenciava esses símbolos antes de apagar).

**Fase C (web)**: `useEsteiraDeAgentes` (hook novo, substitui `useGeracaoAoVivo`) — muda o eixo de "um item, do início ao fim" pra "um papel, em todos os itens, antes do próximo começar". Cada papel só recebe os placeholders da sua própria seção (`placeholdersPorPapel()`, função central usada tanto pra montar a fila quanto pros pips quanto pra `AbaRefinamento` — nunca uma segunda lista hardcoded de "quais campos existem"). Fase bar ganhou o handoff visual: os 4 papéis em sequência com setas entre eles, o atual destacado (`aria-current="step"`, testável sem ambiguidade de texto). Lista de itens ganhou 4 pips por card (um por papel, preenchido quando aquele papel já tem resposta em todos os placeholders dele). `AbaRefinamento` reorganizada em seções por papel (antes era uma lista plana). `statusDoItem()`/fila de geração generalizados pra contar os 9 placeholders agora que existe orquestração real capaz de preenchê-los — decisão da Fase A revertida como já estava planejado.

Achado real durante os testes do hook: um teste que verificava o handoff PO→Arquiteto falhava de forma intermitente porque, com o mock resolvendo o PO instantaneamente pra todos os 6 itens, a esteira avançava pro Arquiteto rápido demais pro `waitFor` capturar o estado intermediário "PO ativo" — corrigido segurando a primeira chamada do PO manualmente até o teste confirmar o estado, só então liberando.

**Validação real, com Playwright contra o modelo Qwen3-4B de verdade** (cenário "Mensageria RabbitMQ", 6 itens): a esteira disparou sozinha, mostrou o handoff "PO → Arquiteto → Especialista técnico → QA" com PO destacado, os campos do PO com "PO gerando…" enquanto pendentes. Depois dos 6 itens do PO completarem (contadores foram de "6 rascunho" pra "6 revisar"), o handoff avançou pro Arquiteto de verdade — confirmando que o eixo "papel × todos os itens" funciona como desenhado, não é decoração. Conteúdo real e específico, citando nomes reais do diagrama: história "Como um membro do time de antifraude, quero ser notificado assim que um pagamento for aprovado, para que possamos monitorar e auditar as transações de forma assíncrona..." e critérios mencionando `srv-pagamentos-aprovacao`, DLQ, timeout de 5 segundos, retries. 24 pips renderizados (4 papéis × 6 itens), confirmando o indicador visual funcionando.

Regressão completa: engine 145, cli 45 (-3 dos testes obsoletos de `/ia/sugerir-item` removidos, +6 da rota nova), web 162 (+2, hook novo com 7 testes próprios substituindo os 8 do hook antigo removido — net -1 mas cobertura equivalente), llm 11. Build/lint limpos nos quatro pacotes tocados.

Próximo passo do roteiro: Fase D (canvas somente-leitura com filtro por nó) e Fase E (funil unificado de proposta, absorvendo a 1e do SPEC-23) — ainda sem pedido explícito do usuário pra seguir, aguardando.

## 71. SPEC-24 Fase D: canvas somente-leitura com filtro por nó

Usuário deu "pode seguir" pra continuar o roteiro; no meio da implementação, fez uma ressalva importante mas já coberta: "eu já disse que o funil é configurável, pode escolher e configurar os agentes e ordem, criar agentes contextuais, etc" — reafirmando o que já está registrado em SPEC-24 §4.6 como Fase F (prompts/ordem/agentes contextuais editáveis via canvas em Configurações). Fase D não toca nisso — é só filtro de visualização na tela de revisão, ortogonal à configurabilidade do pipeline.

Implementação: `DiagramaCompacto.tsx` ganhou duas props novas e opcionais, `onClickNo`/`noFiltradoId` — clique num `<g>` de nó dispara o callback; nós fora do filtro ficam com `opacity: 0.35`. `ReviewScreen.tsx` ganhou estado `filtroNoId`: clique num nó do diagrama filtra `resultado.atividades` (reusando `chaveParaNodeId`, já existente desde a Fase 1d) pra só os itens daquele nó; segundo clique no mesmo nó limpa (toggle); um indicador textual "N de M itens · rótulo do nó" com botão "× limpar filtro" complementa o toggle por clique, pra não depender de acertar o mesmo nó de novo. `noAtivoId` (que já destacava o nó em geração da esteira) ganhou um segundo uso: fora da esteira rodando, destaca o nó do item selecionado manualmente na lista — reaproveitamento direto do mecanismo existente, sem estado novo, exatamente como o §4.5 da spec previa.

Testes novos: `DiagramaCompacto.test.tsx` (clique chama `onClickNo`, opacidade correta com/sem filtro) e `ReviewScreen.test.tsx` (filtro reduz a lista e o segundo clique restaura, botão "limpar filtro" funciona, seleção de item destaca o nó). Usei `data-testid="contagem-itens"` no indicador pra evitar a mesma armadilha de matching de texto ambíguo já corrigida na rodada anterior (texto quebrado por múltiplos nós/filhos faz `getByText` casar mais de um elemento).

Validação real: rebuild do CLI local, `gerador open` com o modelo Qwen3-4B já instalado nesta máquina (a esteira dispara sozinha), cenário "Mensageria RabbitMQ" (4 nós, 6 itens). Script Playwright clicou no último nó do diagrama compacto (`srv-antifraude`): lista caiu de 6 pra 1 item, os outros 3 nós ficaram visivelmente esmaecidos no screenshot, o nó filtrado manteve opacidade plena. Segundo clique restaurou os 6 itens. Confirmado que o filtro convive sem conflito com a esteira rodando ao vivo (handoff na fase bar continuou normal durante o teste) — não é um modo exclusivo.

Regressão completa: engine 145, web 167 (+5: 2 no `DiagramaCompacto`, 3 no `ReviewScreen`), cli 45, llm 11 (server segue precisando de Postgres local pra rodar, falha pré-existente e não relacionada a esta rodada).

Próximo passo do roteiro: Fase E (funil unificado de proposta, absorvendo a 1e do SPEC-23) — ainda sem pedido explícito do usuário pra seguir, aguardando.

## 72. SPEC-24 Fase E: "pode avançar" virou uma sequência de correções de rumo ao vivo — configuração de confirmação + riqueza visual, não o funil de proposta original

"Pode avançar, por hora a experiência ainda está bem diferente do protótipo" (com link pro `gerador-itens-prototipo-v3.html`) deu início à Fase E como desenhada em SPEC-24 §4.4 (funil de 2 passos Aprovar/Confirmar + chat livre com roteamento por conteúdo). No meio da implementação do backend desse funil (rota `/ia/perguntar` sendo desenhada), o usuário interrompeu com a correção real: **"essa parte do confirmar precisa ser uma configuração do sistema, se não estiver habilitada vai gerando conforme o protótipo, o usuário poderá revisar, alterar e aí roda de novo o ciclo a partir daquela alteração"**. Confirmei o entendimento perguntando implicitamente via minha própria interpretação registrada, e o usuário fechou a ambiguidade: **"essencialmente é a mesma experiência do protótipo, a diferença é que pode avançar sozinho até o fim, ou ir parando conforme está hoje"** — não era um funil de aprovação por sugestão que faltava, era um **toggle de sistema** entre dois modos que a infraestrutura já sustenta.

Descartei o desenho original (funil 2 passos + chat livre) e implementei o que foi pedido de fato:

**Confirmação configurável**: `config/pipeline-agentes.json` (`GET`/`PUT` em `openApiLocal.ts`), default `{ confirmacaoObrigatoria: true }` — preserva o comportamento de hoje. `useEsteiraDeAgentes` ganhou o parâmetro `confirmacaoObrigatoria`; quando `false`, cada resposta chega já `confirmado: true` (aplica direto, sem pausa — "vai gerando conforme o protótipo"). Achado real durante a implementação: o efeito de auto-start em `ReviewScreen` chama `esteira.iniciar` só na montagem (deps `[]`, intencional), então ficava preso ao `confirmacaoObrigatoria` da primeira renderização mesmo depois do config real carregar (a config chega por uma segunda chamada assíncrona) — corrigido lendo o valor por um `ref` sempre atualizado dentro do laço async, em vez de fechar sobre o parâmetro direto; um teste de integração via `ReviewScreen` (não só do hook isolado) pegou essa race de verdade. UI: nova aba "Pipeline de IA" em `ConfigScreen` com um checkbox só — mesmo arquivo que a Fase F (ainda não implementada) vai estender com prompts/ordem/agentes contextuais.

**Riqueza visual da esteira**: o pedido mais recorrente do usuário (repetido em 3 mensagens seguidas, com 2 screenshots comparando lado a lado) — "tem aquelas animações, com o fluxo de agentes acima do diagrama onde sinaliza com feedback visual onde os agentes estão trabalhando... efeitos de alternância conforme os itens vão sendo preenchidos, animações das conexões". A barra de handoff, que antes era só texto com destaque de cor, ganhou: tick circular numerado por papel (`①②③④`) — check verde quando terminou, anel girando via `@keyframes` CSS puro enquanto ativo, número apagado se ainda não chegou; um token que desliza sobre a seta a cada handoff (remontado via `key`, retriggerando a animação, mostrando o rótulo do item entregue); pip do papel/item em processamento agora pulsa, distinto do pip só "já passou". `DiagramaCompacto` ganhou nó ativo com opacidade pulsando e as arestas que tocam esse nó destacadas com um traço tracejado fluindo (`stroke-dashoffset` animado). Tudo em `packages/web/src/styles.css` (mesmo padrão já usado por `expandir-item`), sem lib de animação nova.

A parte "roda de novo o ciclo a partir daquela alteração" (editar um campo já confirmado deveria re-disparar os papéis seguintes daquele item) fica **registrada, não implementada** — precisa de rastreamento de dependência entre papéis por item que não existe hoje; próximo passo natural depois que o usuário validar o toggle ao vivo.

Validação real: rebuild do CLI local, `gerador open` com o modelo Qwen3-4B já instalado, cenário "Mensageria RabbitMQ". Screenshot do header confirma os 4 ticks numerados com PO girando e os demais pendentes, aresta entre os dois nós do item em processamento destacada em azul tracejado, nó ativo com borda azul — a barra de handoff agora se parece de fato com o protótipo. `confirmacaoObrigatoria: false` validado só via testes automatizados nesta rodada (CLI + hook + `ReviewScreen` end-to-end com mock), não manualmente com o modelo real — fica pendente pra próxima sessão de teste do usuário.

Regressão completa: engine 145, web 169 (+2: hook e `ReviewScreen`), cli 47 (+2: rota `pipeline-agentes`), llm 11.

Próximo passo do roteiro: usuário validar `confirmacaoObrigatoria: false` ao vivo; depois, Fase F (configurabilidade real de prompts/ordem/agentes contextuais) ou o "roda de novo a partir da alteração" — ainda sem pedido explícito de qual vem primeiro.

## 73. SPEC-24 Fase E (continuação): o usuário abriu o protótipo lado a lado e apontou 4 diferenças estruturais que ainda sobravam

Depois da rodada anterior (v0.1.33), o usuário testou de novo com o protótipo aberto ao lado e mandou um print do estado atual junto com a lista do que ainda destoava: **"a barra dos agentes é menor, localização dos textos, timeline que vai sendo gerada à esquerda dos cards dos itens (canto inferior esquerdo), as animações das conexões também"** — e, no meio da implementação, **"a scroll bar também está diferente do protótipo"**. Diferente das rodadas anteriores (que eram "falta feedback visual"), aqui o pedido já vinha decomposto em diferenças concretas e verificáveis. Implementei as quatro.

**A barra de agentes virou componente próprio** (`EsteiraAgentes.tsx`). O erro da rodada anterior foi tratá-la como mais um item do header: sobrou espremida entre título e botões, com os nomes dos papéis reduzidos a chips. No protótipo ela é uma **faixa de 62px de largura inteira** logo abaixo do header, com 4 células iguais, cada uma com número, nome, subtítulo e tick. O subtítulo era a peça que faltava e que dá a leitura de "onde os agentes estão trabalhando": papel que ainda não chegou a vez mostra **o que ele faz** ("Amarra o item ao nó e escreve o contrato"), papel ativo mostra **o que está fazendo agora** ("item 3 de 14 · 03"). Adicionei `DESCRICAO_PAPEL` ao lado de `ROTULO_PAPEL` no hook — fonte única, mesma disciplina do `placeholdersPorPapel`. O header ficou enxuto: título, trilho fino de progresso, contadores, botões.

**Timeline vertical na lista** (`.review-rail`): linha com gradiente à esquerda dos cards, galho horizontal e ponto por item, com uma barra brilhante que cresce conforme os itens saem do rascunho. O ponto reflete o estado real (pulsando quando a esteira escreve nele, verde quando refinado, azul com halo quando selecionado). A altura do brilho vem do mesmo `statusDoItem()` que pinta os cards — de propósito, pra não existir um "progresso visual" paralelo capaz de divergir do que a lista mostra.

**Cometa nas conexões** e **scrollbar**: o cometa percorre a aresta do nó de origem ao de destino em laço enquanto aquele nó está ativo. Detalhe que vale registrar: usei `pathLength="100"` no `<line>` — com isso `stroke-dasharray`/`dashoffset` viram porcentagem do comprimento, então a mesma animação serve pra arestas curtas e longas sem cálculo por aresta. A scrollbar nativa do Windows (larga, clara) destoava do tema escuro; virou fina, polegar escuro arredondado com borda da cor do fundo.

Achado real nos testes (meu próprio erro, corrigido na hora): a faixa numera os papéis "01".."04" e os rótulos dos itens da fixture também são "01".."06" — `getByText("01")` passou a casar dois elementos, quebrando 3 testes que não tinham nada a ver com a mudança. Além disso, a faixa é uma segunda região `role="status"` (anuncia qual papel trabalha), o que tornou `getByRole("status")` ambíguo. Corrigi apontando os testes pro elemento específico (`getByTestId("item-…")`, `getByTestId("contadores")`) em vez de texto/role genérico — terceira vez nesta sequência que a lição "matching por texto vira ambíguo quando a tela ganha densidade" aparece.

Validação real: rebuild do CLI, `gerador open` com Qwen3-4B, cenário de crédito (14 itens — o mesmo do print do usuário). Screenshots confirmam a faixa de largura inteira com PO ativo (anel girando, subtítulo "item 1 de 14 · 01") e os outros três mostrando suas descrições, conectores com seta entre as células, cometa visível nas conexões do nó ativo, e a timeline com linha, pontos e o item 01 destacado com halo.

Regressão: engine 145, web 174 (+5: 4 do `EsteiraAgentes.test.tsx` novo, 1 do cometa), cli 47, llm 11.

Próximo passo: o mesmo de antes — usuário validar `confirmacaoObrigatoria: false` ao vivo, e então Fase F (configurabilidade de prompts/ordem/agentes contextuais) ou o "roda de novo o ciclo a partir da alteração".

## 74. SPEC-24 Fase E (terceira rodada): "abra o protótipo, rode, tire prints, entenda o código" — o DiagramaCompacto refeito com o protótipo como referência executável

O usuário mandou um zoom das conexões do protótipo e nomeou o que ainda destoava — conexões retas em vez de curvas coloridas e animadas, falta do halo nos componentes sendo construídos, falta da "barra do fluxo informacional abaixo do diagrama" — e, achando difícil transmitir a referência visual por prints, deu a instrução que destravou a rodada: **"como nos testes web, abra ele, rode, tire mais prints, entenda o código"** (com o caminho do arquivo), seguida de **"as proporções têm que ser iguais, o mais semelhante possível com o protótipo"**. Mudança de método: em vez de interpretar descrições, abri o `gerador-itens-prototipo-v3.html` no Playwright, deixei a animação rodar, capturei o palco em 4 momentos, e li o `buildDiagram()`/CSS — o protótipo virou referência executável, não imagem estática.

O `DiagramaCompacto` foi refeito do zero com o que saiu daí:

- **Proporções**: palco de 30vh (não mais 150px fixos) com fundo pontilhado (pattern SVG de 26px, o mesmo passo do protótipo) e brilho radial no topo; cards de 200×64 (razão do protótipo) com **tipo em caps na cor do tipo + nome em mono + badge de contagem** de itens derivados (`contagemPorNo`, novo prop, derivado em `ReviewScreen` do mesmo `origem.nodeId` do filtro — nenhuma contagem paralela) e a marca `EXISTENTE` quando o nó tem esse status.
- **Conexões**: viraram paths — reta borda-a-borda entre nós da mesma linha, curva cúbica entre linhas (a vertical média como par de pontos de controle), sempre **na cor do nó de origem** ("a aresta pertence a quem inicia a comunicação", como no protótipo), com o **rótulo da conexão em caps** ("ORQUESTRA", "ESCREVE"...) ancorado no ponto médio real do path (B(0.5) da cúbica, calculado analiticamente) sobre um retângulo escuro. Desenham-se na entrada (`stroke-dashoffset` animado com `pathLength=100`) e o cometa da rodada anterior passou a percorrer o path curvo.
- **Nós "pousando"**: entrada em cascata (`animation-delay` por índice). Armadilha de CSS que vale registrar: `fill-mode: both` manteria `opacity: 1` aplicado pra sempre depois da entrada — e CSS vence atributo, então o esmaecimento do filtro (que é atributo `opacity` no `<g>`) nunca mais funcionaria. `backwards` segura o estado inicial durante o delay e **solta** a propriedade ao terminar.
- **Halo**: o nó ativo ganha `drop-shadow` na **cor do próprio tipo** (o teal do JOB/SCHEDULER no print do usuário era isso), não mais um anel azul fixo.
- **Barra do fluxo informacional**: a legenda do protótipo — um traço na cor de cada tipo presente no diagrama, pill escura com blur no canto inferior esquerdo — mais a dica "Clique num nó pra filtrar os itens" à direita. O viewBox ganhou 90px de respiro embaixo pra legenda não cobrir a última linha de cards (defeito pego no primeiro screenshot da validação).

Testes: os asserts de stroke azul fixo viraram asserts da cor do tipo; a legenda repete os nomes dos tipos dos cards, então os testes novos escopam por `within(getByTestId(...))` — quarta aparição da lição "texto solto vira ambíguo quando a tela ganha densidade". Regressão: engine 145, web 178 (+4), cli 47, llm 11. Validação lado a lado: screenshot do app real (cenário de crédito, esteira rodando) contra os prints do protótipo — curvas coloridas com rótulos, halo com cometa no nó ativo, badges, legenda e dica presentes, proporções equivalentes.

Próximo passo: o mesmo — validar `confirmacaoObrigatoria: false` ao vivo; Fase F ou o "roda de novo a partir da alteração".

## 75. SPEC-24 Fase E (quarta rodada): o modelo escrevendo ao vivo nos campos, divisória arrastável e pan/zoom no diagrama

Três pedidos do usuário na mesma mensagem: **"nesses campos de resposta hoje fica só esse ícone de gerando e 3 pontos, é um tanto pobre... talvez mostrar o que está rodando no modelo seria a melhor coisa, tal como a experiência que existe com o Claude"**; a divisória entre o diagrama e a metade de baixo **"ajustável, usuário pode clicar e arrastar pra cima e pra baixo"**; e o diagrama compacto **"movimentável, tal como no outro canvas do projeto (também ampliar, reduzir, etc)"**.

**Streaming de verdade no pipeline** — a descoberta que destravou: a grammar GBNF restringe O QUE o modelo escreve, não COMO sai — `node-llama-cpp` aceita `onTextChunk` junto com `grammar`, então o JSON restrito pode ser streamado token a token. `completarComSchema` ganhou `onTexto`; `/ia/pipeline/:papel` virou text/plain chunked (mesmo padrão do `/ia/sugerir` da 1c); e como o corpo completo é sempre JSON válido (a grammar garante), o cliente acumula, mostra ao vivo e faz um `JSON.parse` no final — os testes existentes do CLI nem precisaram mudar de forma, porque `r.json()` parseia o corpo acumulado igual. No web, `extrairRespostasParciais()` quebra o JSON parcial em pares chave→valor (tolerante ao último valor ainda sem aspa de fechamento — não é parser geral, é só exibição; o parse de verdade vem no final) e `useEsteiraDeAgentes` expõe `respostasAoVivo`. O campo em geração na `AbaRefinamento` mostra o texto do modelo digitando com caret piscando; antes do primeiro token, pontinhos respirando. "PO gerando…" virou "PO escrevendo…".

**Divisória e pan/zoom**: faixa de 10px com grip entre o diagrama e o split (altura clampada em 120px–70vh, `DiagramaCompacto` ganhou o prop `altura`); no diagrama, a vista virou um viewBox alternativo — arrastar o fundo move (limiar de 4px separa arrasto de clique, o soltar de um pan não vira filtro por nó), roda amplia/reduz ancorado no cursor, duplo clique recentra.

Achado real de infra de teste (custou 3 iterações): **jsdom 25 não implementa `PointerEvent`** — `fireEvent.pointerDown` cai num `Event` genérico que descarta `clientX`/`button` do init, e o guard `e.button !== 0` do pan engolia o evento silenciosamente (button `undefined`). Dupla correção: o código passou a tolerar eventos sem essas propriedades (inofensivo no browser real), e os testes despacham `Event` com as propriedades coladas via `Object.assign` (helper `eventoPonteiro`). O `setPointerCapture`, que jsdom também não tem, ganhou try/catch nos dois lugares.

Regressão: engine 145, web 187 (+9), cli 47, llm 11. Validação real com o Qwen3-4B: streaming visível campo a campo (texto crescendo entre duas medições), divisória mudando a altura do palco, pan/zoom/recentrar funcionando — detalhes na verificação do SPEC-24 §10.

Próximo passo: o mesmo — validar `confirmacaoObrigatoria: false` ao vivo; Fase F ou o "roda de novo a partir da alteração".

## 76. SPEC-24 (quinta rodada): lote por agente — a pergunta "os itens são gerados com chamadas individuais?" respondida com sim, e corrigida

O usuário pediu pra rodar o graphify e explicar o pipeline, com a hipótese certa: "os itens são gerados com chamadas individuais ao modelo? acredito que sim, pois está muito lento". Era exatamente isso — **1 chamada por item por papel** (4×N: 13 itens = até 52 chamadas, cada uma pagando prompt+prefill inteiro de novo). A direção que ele deu virou o desenho: "passe todo material em uma chamada única para cada agente... com 20-30 itens rode em grupos de 5-10 com recuperação do contexto, depois o usuário pode revisar e arrumar individualmente".

O que mudou (detalhe em SPEC-24 §6, quinta rodada):

- **`/ia/pipeline/:papel` virou rota de LOTE**: recebe `{contextoEpico?, itens: [{chave, rotulo, contextoNo, placeholders}]}`, devolve JSON aninhado `{itemChave: {placeholderChave: valor}}` garantido por schema GBNF aninhado — continua streamando o texto cru (a grammar restringe O QUE sai, não impede streaming, achado da quarta rodada que aqui pagou de novo).
- **`useEsteiraDeAgentes` fatia em `TAM_LOTE_ESTEIRA = 5`** — 5, não 10, porque a resposta do lote precisa caber na janela de saída do modelo local sem truncar (os campos longos do Especialista estouram fácil). Cada lote re-envia o prompt completo — a "recuperação do contexto" pedida. 4×⌈N/5⌉: 13 itens caem de 52 pra 12 chamadas. A revisão individual não muda: as respostas continuam aterrissando placeholder a placeholder via `onResponderItem`.
- **Streaming aninhado**: `extrairRespostasParciaisAninhadas()` (mesmo mini-scanner, dois níveis fixos) alimenta `respostasAoVivoPorItem`; o item destacado (`atual`/auto-follow) é derivado da última chave de item aberta no JSON parcial — o destaque acompanha o item que o modelo está literalmente escrevendo dentro do lote; `escrevendoChaves` marca o lote inteiro nos pips/rail, e a faixa de agentes mostra "itens 1–5 de 13".

Duas correções na mesma rodada, ambas achados reais do usuário:

- **Confirmar sem ação**: o handler lia só o rascunho digitado — resposta vinda da esteira sem edição era `undefined` e o clique era um no-op silencioso, com botão habilitado (o textarea usava o fallback pra `p.resposta.valor`; o handler, não). Mesmo fallback no handler + teste de regressão do cenário exato.
- **Animações rodando com a aplicação encerrada**: pulso/cometa/fluxo eram chaveados só em `noAtivoId`, que tem fallback pro item selecionado — a tela "trabalhava" pra sempre. `DiagramaCompacto` ganhou `animado` (= `esteira.rodando`); parado, o nó selecionado mantém só o destaque estático.

Regressão: engine 145, llm 11, cli 47 (rota de lote coberta por 5 testes reescritos, incluindo "recebe um LOTE numa chamada só"), web 190 (hook reescrito pro formato aninhado + testes novos de lote/Confirmar/animado). Validação real com Qwen3-4B contra `gerador open` — ver SPEC-24 §10.

Próximo passo: os mesmos pendentes — validar `confirmacaoObrigatoria: false` ao vivo; Fase F (configurabilidade) ou o "roda de novo o ciclo a partir da alteração" (precisa de rastreio de dependência entre papéis, registrado e não implementado).

## 77. Épicos de verdade na massa de exemplo + tema escuro único (a tela inicial deixou de parecer OUTRO sistema)

Dois pedidos do usuário nesta rodada:

**1. "Nosso épico de exemplo contém apenas 2 linhas — precisamos de algo mais parecido com um épico real (~1500 caracteres)."** Os `demandInfo` dos cenários eram uma frase (60–200 chars). Os 3 cenários que servem de massa de teste ganharam épicos completos com contexto de negócio, escopo da entrega, decisões já tomadas e restrições conhecidas — o formato que um épico real tem quando chega pro time: `credito-completo` (1692 chars — fila de backoffice de 26h, meta de resposta em 2 min, BACEN Res. 4.949, limite de 2 consultas/CPF/dia no bureau), `internal` (1561 — resgate de pontos no checkout, orçamento de latência de 150ms, degradação graciosa) e `rabbit` (1690 — antifraude com janela de contestação, PCI-DSS, Black Friday 40x). Achado de estrutura no caminho: o `gerador init` copia os cenários de `packages/cli/templates/cenarios/`, NÃO da `config/cenarios/` da raiz (que é só a config de dev do repo) — a primeira validação pegou o texto antigo por isso; os dois lugares foram atualizados juntos.

**2. "Harmonizar visualmente a tela inicial com essa que construímos (está branco, muito diferente, parecem 2 sistemas)."** A paleta escura da tela de revisão (extraída dos hexes reais da `ReviewScreen`/`DiagramaCompacto`) virou **variáveis CSS em `:root`** (`--fundo #0C111A`, `--painel #101823`, `--painel-alto #15202D`, `--borda #1B2533`/`#263344`, `--texto #E8EEF8` e a escala de cinzas, `--acento #38bdf8`, `--acento-indigo`, verde/vermelho/amarelo) — fonte única, os componentes referenciam `var(--...)` em vez de hex solto. Aplicado por codemod property-aware (fundos claros → painéis/tinturas translúcidas da mesma cor; textos escuros → variáveis claras; `color: "#fff"` de botão colorido intocado) em 24 componentes: App (header/botões/inputs), NodeCard (agora no visual dos cards do DiagramaCompacto — tipo em caps colorido, nome em mono, badge), Canvas (React Flow com fundo pontilhado IGUAL ao da revisão — cor e gap —, MiniMap/Controls escuros via CSS override), painéis, ConfigScreen+abas, JourneyModal/Jornada/Landing, telas de auth, AbrirQuebra, ContextoEpico. Regra global de `input/textarea/select` no CSS cobre campos sem estilo inline (o textarea do épico ficava branco — herdava o default do browser) com `color-scheme: dark`.

Regressão: engine 145, llm 11, cli 47, web 190 — verde sem tocar em teste nenhum (nenhum teste assertava cor, uma boa surpresa). Validação real com Playwright contra `gerador open`: home vazia, cenário de crédito carregado (canvas com cards escuros e arestas rotuladas), painel do épico exibindo os 1692 chars novos, JourneyModal e Configurações escuros e coesos com a revisão.

Próximo passo: pendentes de antes (validar `confirmacaoObrigatoria: false` ao vivo; Fase F ou "roda de novo o ciclo a partir da alteração").

## 78. SPEC-24 Fase F: o funil configurável que o usuário pediu desde o início — ordem, papéis, prompts e agentes contextuais

"Eu já disse que o funil é configurável, pode escolher e configurar os agentes e ordem, criar agentes contextuais, etc" — registrado desde a Fase E, entregue agora. `config/pipeline-agentes.json` ganhou `papeis[]`: lista ordenada de `{id, nome, descricao, grupo, preambulo, ativo, contextos}`.

A fronteira que segura o desenho inteiro: as 4 SEÇÕES da ficha (história/critérios, contrato, checklist/volumetria, testes — `GrupoFicha`) continuam FIXAS, porque são dado do engine; o que é configurável é QUEM escreve nelas. A esteira tem N papéis, cada um preso a um grupo; um **agente contextual** é um papel custom com `contextos` (ex.: "Backend-mensagens", casamento parcial idêntico ao `contextoBate()` do engine) que rouba os itens do contexto dele do papel geral — basta vir antes na ordem (`papelDoGrupo()`: o primeiro papel ativo do grupo que casar leva o item). O prompt de cada papel é editável (`preambulo`, resolvido no servidor: custom → padrão do grupo → genérico), papéis desativam sem sumir da config, e a aba "Pipeline de IA" virou o editor completo (↑↓, checkbox, campos, "+ Agente contextual").

Dois achados reais no caminho:

- **Corrida no auto-start**: a esteira de montagem largava com os 4 papéis de fábrica se a config resolvesse DEPOIS do `/ia/status` — papel desativado rodava mesmo assim. Mesma família do stale-closure do `confirmacaoObrigatoria` (§72): a correção foi esperar os dois fetches juntos (`Promise.allSettled`) e passar os papéis recém-resolvidos EXPLICITAMENTE pra fila e pro `iniciar` (o estado ainda não re-renderizou naquele instante). Pego por teste de integração, de novo — o teste do hook isolado não pegaria.
- **Input controlado que come vírgula**: normalizar o campo de contextos (split/trim/join) a cada tecla apagava a vírgula recém-digitada. O input mostra o texto CRU; o parse alimenta só o estado canônico.

Validação real (Playwright + Qwen3-4B + `gerador open`): config com QA desativado, PO renomeado ("PO do squad") com preâmbulo custom e `confirmacaoObrigatoria: false` — faixa renderizou os 3 papéis com o nome custom, nenhuma chamada `/ia/pipeline/qa`, e as respostas aplicadas direto (✓ sem revisão manual) — o que também fecha a pendência antiga de validar o modo sem confirmação ao vivo. Regressão: engine 145, llm 11, cli 49 (+2), web 197 (+7).

Pendente que sobra da SPEC-24: "roda de novo o ciclo a partir da alteração" (precisa de dependência entre papéis — os prompts de papéis posteriores hoje não recebem as respostas dos anteriores) e o canvas visual de papel→contexto (a semântica já existe via config).

## 79. SPEC-24: o encadeamento que faltava ("a ideia de pipeline é justamente essa") + re-rodar a partir da alteração + agentes menos rasos

Três correções de rumo do usuário na mesma conversa:

**1. "Deveriam responder, pois está preenchido — a ideia de pipeline é justamente essa."** Achado incômodo e verdadeiro: a esteira tinha o VISUAL de pipeline (handoff, token atravessando a seta), mas os prompts de papéis posteriores não recebiam as respostas dos anteriores — o Arquiteto nunca lia a história que o PO tinha acabado de escrever; eram 4 geradores independentes com cerimônia de esteira. Agora: `ItemPedidoPipelineIa.respostasAnteriores[{rotulo, valor}]` — o hook acumula por item tudo que os papéis anteriores geraram NA corrida + tudo que já existia antes dela (`respostasExistentes`, montado pela ReviewScreen: respostas confirmadas, edições manuais), e o prompt de cada papel ganha a seção "O que os papéis anteriores já definiram pra este item (construa em cima disso, sem contradizer)". Valores cortados em 600 chars só por defesa de janela. Detalhe de implementação que virou teste: o pedido leva um SNAPSHOT do acumulador, não a referência viva (o array continua crescendo depois da chamada).

**2. Re-rodar o ciclo a partir da alteração** — pendente desde a Fase E ("o usuário poderá revisar, alterar e aí roda de novo o ciclo a partir daquela alteração"), possível agora que existe dependência real entre papéis. Botão "↻ Re-rodar papéis seguintes" em cada seção da ficha que tenha resposta e papéis depois: regenera, SÓ daquele item, os papéis posteriores ao dono da seção (tudo deles, mesmo confirmado — a montante mudou), com a alteração entrando como insumo via `respostasAnteriores`. Escondido enquanto a esteira roda.

**3. "As respostas do PO têm 2-3 linhas, muito distante da necessidade real (~3-7 critérios de aceite)"** — diagnóstico: os preâmbulos padrão eram rasos ("Escreva a história e os critérios de aceite") e modelo pequeno responde o mínimo quando ninguém prescreve estrutura. Os 4 preâmbulos padrão ganharam formato e profundidade explícitos: PO com "Como <persona>, quero <capacidade>, para <benefício>" + lista NUMERADA de 3 a 7 critérios cobrindo caminho feliz, erro e limite/regra do épico; Arquiteto com tipos/códigos de erro; Especialista com decisão+valor+porquê; QA com 3-6 regras numeradas + Gherkin completo. Continuam sendo só o PISO — a Fase F permite sobrescrever qualquer um. O teto de capacidade do modelo 4B em si virou a SPEC-25 (abaixo).

Regressão: engine 145, llm 11, cli 51 (+2), web 199 (+2). Validação real no §10 do SPEC-24.

## 80. SPEC-25: seleção de modelo e provedores — design registrado a pedido ("parece ser prioridade")

"Se necessário podemos usar o DeepSeek como modelo, mesmo demorando mais... poder escolher entre os 2 modelos ou conectar (ao Claude, por exemplo), precisamos criar spec e planejar." Registrado em `SPEC-25-selecao-de-modelo-e-provedores.md` — design-only, implementação faseada: Fase 0 (interface `ProvedorIa` embrulhando o motor atual, refactor puro), Fase 1 (DeepSeek R1 distill local no mesmo node-llama-cpp — com o risco do `<think>` × GBNF documentado: grammar desde o 1º token mataria o raciocínio que é justamente o motivo de usar DeepSeek), Fase 2 (Anthropic via tool use forçado — a MESMA garantia de "JSON válido no final" que a GBNF dá localmente, só que pelo schema do tool; chave SEMPRE fora do projeto, aviso de privacidade explícito), Fase 3 (provedor POR PAPEL — `papeis[].provedor` na config da Fase F: PO/QA no Claude, Especialista no local). Local-first continua o default de fábrica.

## 81. SPEC-25: a jornada de conexão planejada com o usuário — e a correção honesta sobre "login com Google"

O usuário propôs a jornada: "escolher um modelo local, ou conectar-se via login do Google no DeepSeek ou, se quiser, no Claude para usar integrado via API". Direção aceita, com UMA correção de mecanismo registrada em §5.2: **não existe OAuth de terceiros pras APIs de DeepSeek/Anthropic** — o "login com Google" acontece no SITE do provedor (o DeepSeek aceita conta Google lá), e o que chega pro nosso app é sempre uma chave de API. A jornada de "Conectar" embrulha isso num fluxo guiado (abrir o navegador na página de chaves → colar a chave → validar com chamada de teste → guardar em `~/.gerador/credenciais.json`, nunca em `config/`) — parece login, tem a segurança certa, e não promete um OAuth que não existe. Se o provedor um dia oferecer OAuth de verdade, só os passos do meio trocam.

Ganho que saiu da proposta: **DeepSeek via API** virou um 4º provedor (além do distill local) — R1/V3 completos hospedados, formato OpenAI, muito baratos; a garantia de estrutura é mais fraca que GBNF/tool-use (`json_object` + validação/retry), e o `reasoning_content` do R1 encaixa direto no estado "pensando…" que a UI já tem.

SPEC-25 atualizada: §5 (4 jornadas — A local, B DeepSeek API, C Claude, D por papel), §6 (tabela de trade-offs com 4 provedores), §8 (roteiro re-faseado: a infra de "Conectar" é UMA, instanciada duas vezes na Fase 2). Design-only — implementação começa pela Fase 0 quando o usuário der o sinal.

## 82. O fluxo real da empresa entra no desenho: wrapper unificado, prompt único como ponte — e a SPEC-26, que é o ponto do projeto

O usuário trouxe o fluxo que roda HOJE na empresa (`gerador_de_itens_2.html`): um prompt único gigante, com template Handlebars (`{{descricaoEpico}}`, `{{requisitosTecnicos}}`, `{{itensBreakDownContent}}`…), colado num **wrapper interno — interface unificada para vários modelos** que chama o DeepSeek e devolve o markdown de todas as histórias.

Dois efeitos no desenho (SPEC-25 atualizada):

- **§4.6 — o provedor que mais importa é o wrapper**: em vez de um `ProvedorDeepSeekApi` específico, a Fase 2 implementa `ProvedorCompativelOpenAI(baseUrl, chave, modelo)` genérico — o formato de-facto dos gateways. Uma implementação serve o wrapper da empresa, o DeepSeek oficial, Ollama, LiteLLM, OpenRouter. E com gateway interno os dados não saem da empresa, o que dissolve a objeção de privacidade. Virou a PRIORIDADE dentro da Fase 2.
- **§5.5 — modo prompt único como ponte, não como futuro**: "copiar prompt do breakdown" (renderiza o template com os itens derivados, zero integração) e, com provedor conectado, a chamada única guardando o markdown — sem parse de volta, porque reconstruir o parse seria reintroduzir a fragilidade que a esteira elimina. Observação que orienta o roadmap: ~metade do template atual é DEFESA contra alucinação (volumetria em branco, indicador `<- ✍️ especificar` literal, "NUNCA misturar teste com refinamento", item 8 quebrado) — tudo isso já é determinístico no motor, onde o modelo nem é consultado.

**E então o usuário nomeou o ponto do projeto**: *"a ideia é melhorar esse processo de refinamento, conseguir alterar as especificações no desenho e usar a IA para ajustar nos outros itens, ajudar a revisar, não esquecer coisas, fazer o processo ir melhorando gradualmente"* — com a dor concreta: *"mudou especificação na história X, aí preciso atualizar tudo manualmente depois"*.

Isso virou a **SPEC-26**. Diagnóstico registrado: a ferramenta é forte no PRIMEIRO passe e fraca no SEGUNDO; o custo do refinamento não está em escrever a primeira versão, está em manter o conjunto coerente depois de cada mudança. E é aí que conhecer o GRAFO vence o prompt único — `resolverDependencias()` já sabe quem depende de quem, então "o que ficou obsoleto quando X mudou?" deixa de ser memória e vira computação. Cinco blocos: (1) procedência de insumos + detecção determinística de obsolescência — primeiro porque não depende de modelo e sozinho já tira o "preciso lembrar"; (2) onda de impacto propagando pelo grafo só nos campos desatualizados; (3) revisão em diff, nunca sobrescrita silenciosa; (4) revisor em duas camadas, com as checagens determinísticas ANTES da IA; (5) aprendizado — few-shot dos próprios acertos e promoção de correção recorrente a regra em `regras.json`, migrando responsabilidade de "o modelo talvez lembre" para "o motor garante" (o caminho contrário ao do prompt único, que acumula instrução defensiva).

## 83. A interface do segundo passe é conversa, não botão — e por que aqui ela é mais barata que no Jira

Complemento do usuário logo depois da SPEC-26: *"hoje quando isso acontece eu vou tentando trabalhar no Jira direto com o Rovo, mas ainda dá muito trabalho; por isso, tendo todo material salvo, poderia alterar — mesmo que da mesma forma, conversando com um chat de IA com algum agente (melhor do que aqueles botões de sugerir que colocamos) + approve"*.

Duas comparações que entraram na spec como justificativa do desenho:

- **Contra os botões "✨ Sugerir"** (que nós mesmos construímos): o botão é campo a campo e exige que o usuário já saiba ONDE clicar. A conversa é no nível da intenção ("o timeout caiu pra 150ms, ajusta o que decorre") e quem descobre os campos é a ferramenta. Os botões sobrevivem para retoque pontual — deixam de ser o caminho principal.
- **Contra conversar no Jira com o Rovo**: lá o material é prosa espalhada em tickets, então a IA relê e INFERE o impacto a cada pedido. Aqui o material é estruturado e o impacto é COMPUTADO no grafo. É a mesma conversa custando muito menos e errando menos — a vantagem estrutural de ter o desenho, não só o texto.

Virou o **Bloco 5 da SPEC-26**: painel de chat com um conjunto FECHADO de ferramentas (`listarItens`, `lerItem`, `listarImpactados`, `proporAlteracao`, `proporQuebraDeItem`, `rodarChecagens`). O princípio que segura tudo: **o agente não escreve, o agente propõe** — toda saída cai no painel de diff do Bloco 3, e o "approve" é literalmente o mecanismo `origem: "sugerido"` → `confirmado: true` que existe desde o MVP.

Duas consequências registradas com honestidade: (a) o chat exige tool use encadeado confiável, o que **promove a SPEC-25 Fase 2 (wrapper/Claude) de "paralelo" a pré-requisito duro** — com Qwen 4B a experiência seria frustrante; (b) este é o "Fluxo 1 — canvas em conversa" da SPEC-23, adiado lá por ser o mais arriscado, voltando com o alvo trocado: conversa sobre os ITENS derivados (estruturados, impacto computável), não sobre o desenho do canvas. Menor risco, maior valor imediato, mesma ideia.

Sequência da SPEC-26 atualizada: Bloco 1 → SPEC-25 Fase 0+2 → Blocos 2+3 → **Bloco 5 (chat, montado sobre 2+3)** → 4a → 6/4b.

## 84. A restrição real reordena o plano: o endpoint da empresa existe, o token não — e eu tinha invertido a prioridade

*"Na empresa já tenho um endpoint, mas ainda não tenho o token para usá-lo; a ideia de embarcar um modelo é uma forma de contornar isso e poder validar a ferramenta no dia a dia."*

Correção de rumo sobre a rodada anterior, registrada com nome: eu tinha acabado de promover a SPEC-25 Fase 2 (conectar ao wrapper/Claude) a **"pré-requisito duro"** de toda a SPEC-26 — o que colocaria o roadmap inteiro refém de uma liberação que não está na mão de ninguém aqui. Regra que passa a valer nas duas specs: **nada que dependa do token entra no caminho crítico**.

O que mudou:

- **O modelo local deixa de ser plano B**: a Fase 1 (DeepSeek local) vira a única alavanca de qualidade acionável hoje.
- **A Fase 2 vira soquete dormente**: `ProvedorCompativelOpenAI` + card com base URL/chave/modelo, testado contra servidor falso na suíte. Quando o token sair, validar é colar e clicar — zero reescrita. (A Fase 0, a abstração, é justamente o que garante isso.)
- **O determinístico sobe na fila**: SPEC-26 Bloco 1 (procedência/obsolescência) e Bloco 4a (checagens do engine) entregam valor no dia a dia rodando com qualquer modelo — inclusive nenhum.
- **O chat ganha dois degraus** (SPEC-26 §Bloco 5): **5a com trilhos** — o app computa o impacto no grafo (determinístico) e o modelo só REDIGE o ajuste, o que funciona bem em modelo pequeno; **5b conversa livre** com tool use encadeado espera o provedor forte, sem bloquear nada antes.

Sequência final registrada: Fase 0+1 → Bloco 1 → Bloco 4a → Blocos 2+3 → Bloco 5a → (token) Fase 2 → 5b → 6/4b.

Complemento na mesma conversa, que reordena de novo: *"poder logar e usar você lá seria uma forma de agilizar meus testes na minha máquina (na empresa só vou poder usar o embarcado)"* — e, logo depois, *"por enquanto ao menos"*.

Isso separa **dois ambientes com papéis distintos** (SPEC-25 §8.2): a máquina pessoal é o **laboratório** (Claude conectado, chave obtível hoje, sem depender do token corporativo) e a empresa é a **produção** (embarcado). Três efeitos:

1. **A conexão ao Claude sobe para logo depois da Fase 0** — não por qualidade em produção, mas como acelerador do ciclo: cada validação real desta conversa custou 12-25 minutos esperando o Qwen local; com Claude, segundos. Tudo que vem depois fica mais barato de construir.
2. **O Claude vira a referência de qualidade** contra a qual se mede se o embarcado está aceitável — em vez de julgar "está raso?" no vácuo.
3. **Princípio novo: nunca assumir capacidade do modelo — mas também não otimizar para a limitação.** O "por enquanto ao menos" foi registrado com peso: a restrição do embarcado é temporária, então o desenho **degrada ATÉ** o modelo pequeno em vez de ser desenhado PARA ele; toda feature tem o caminho de qualidade e o de piso sobre a MESMA arquitetura, nunca duas implementações. E nenhuma feature é dada por pronta sem rodar no embarcado.

Sequência final: Fase 0 + Claude → Bloco 1 → Bloco 4a → Blocos 2+3 (validados nos dois) → Fase 1 (DeepSeek local, medido contra o Claude) → Bloco 5a → (token) Fase 2 → 5b → 6/4b.

Fecha a conversa o dado mais útil de todos, que calibra a barra: *"no meu uso da ferramenta o DeepSeek atendia bem (em alguns casos até o Rovo atende, que é mais fraco); posso tolerar que fique lento, desde que seja possível trabalhar sem toda essa limitação do modelo atual em termos de raciocínio"*.

- **O alvo não é fronteira — é "nível DeepSeek"**, com piso ainda mais baixo. O R1-distill embarcado deixa de ser piso tolerável e vira **a aposta principal** do ambiente da empresa; a Fase 1 sobe para logo depois da conexão ao Claude (que segue sendo o acelerador do ciclo de desenvolvimento, não o modelo de produção).
- **O gargalo tem nome: raciocínio, não estilo.** Encerra a linha de "calibrar mais o prompt do Qwen3-4B" — a rodada anterior já tirou o que dava com preâmbulos prescritivos; o resto é teto do modelo.
- **Lentidão tolerada muda uma decisão de desenho**: o `<think>` do R1 não é custo a minimizar, é o recurso a preservar — em nenhuma hipótese forçar a grammar desde o primeiro token (§4.3 da SPEC-25).
- **Fase 1 também desarrisca**: tudo que vier depois precisa rodar no embarcado; descobrir isso no fim custaria retrabalho.

Sequência definitiva desta rodada de planejamento: **Fase 0 + Claude → Fase 1 (DeepSeek local) → Bloco 1 → Bloco 4a → Blocos 2+3 → Bloco 5a → (token) Fase 2 → 5b → 6/4b.**

## 85. SPEC-25 Fases 0 e 1: a abstração de provedor e o DeepSeek R1 embarcado — com a briga entre grammar e raciocínio resolvida

Primeira rodada de CÓDIGO da SPEC-25, com o escopo que o usuário fechou: *"por enquanto vamos cortar a parte do Claude, vamos de R1-distill embarcado, tenho espaço sim"*.

**Fase 0 — abstração.** `ProvedorIa` (`completar`/`completarEstruturado`/`descartar`) virou a fronteira entre "de onde vem a inteligência" e o resto; `criarProvedorLocal(modelo)` é parametrizado pelo `ModeloRegistrado` (antes o caminho do Qwen era fixo no código da rota). `config/ia.json` (`{provedorPadrao}`) com `GET`/`PUT /config/ia`. Duas decisões pequenas que valem registro: **PUT com id desconhecido devolve 400** em vez de cair no padrão — cair em silêncio faria o usuário achar que trocou de modelo sem ter trocado; e trocar de provedor **descarta** o anterior, liberando os GB de RAM em vez de manter dois modelos carregados. `verificarStatus` agora lista os modelos de chat um a um, e `pronto` passou a ser uma afirmação sobre o modelo SELECIONADO (com DeepSeek escolhido e não baixado, a IA não está pronta mesmo com o Qwen no disco).

**Fase 1 — DeepSeek.** Registro do `unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF` com repo, nome de arquivo e tamanho (5.027.785.216 bytes) **confirmados na API da Hugging Face antes de escrever** — a lição do embedding, que estava registrada em comentário desde a SPEC-23, evitou repetir o 404 por nome "óbvio".

O problema central da fase, e a solução: **a grammar GBNF restringe a amostragem desde o primeiro token**, então aplicá-la junto com o prompt mataria o `<think>` — exatamente a capacidade pela qual o modelo foi escolhido. A geração estruturada virou **duas fases na mesma sessão**: (A) livre, o modelo raciocina e rascunha, e **nada daqui vai pro stream** (quem consome acumula os pedaços e faz `JSON.parse` no fim — prosa no meio quebraria o parse; a UI fica no "pensando…" que já existia); (B) com a grammar **e `budgets.thoughtTokens: 0`** — sem esse orçamento zerado o modelo tenta raciocinar de novo e colide com a grammar. Achado que simplificou o caminho livre: o node-llama-cpp 3.19 já separa segmentos `thought` nativamente (`onResponseChunk`), então `completar()` só encaminha o texto da resposta principal, com um strip defensivo de `<think>` no retorno caso um GGUF com template inesperado emita a marcação inline. Modelo não-raciocinador segue o caminho de fase única: **pro Qwen, a Fase 0 é refactor puro**.

CLI: `gerador ia instalar --modelo <id>` (sem argumento continua baixando só o par padrão — 5 GB não se baixa sem pedir), `gerador ia usar <id>` e `status` listando os dois com o selecionado marcado. Web: aba **"Modelo de IA"** com card por modelo (estado real do disco, selo "raciocinador", tamanho) e radio que grava a escolha.

**E a validação real achou um bug que a suíte jamais acharia.** Com o R1 selecionado, a esteira completa levou 1551s e o screenshot final mostrava **só o pip do PO aceso**: Arquiteto rodou 700s e falhou, Especialista e QA falharam em 4s cada — os três em silêncio, porque o `catch` por lote da esteira (deliberado: "falha isolada não trava a esteira") engole o erro e nenhum log existia. Só se descobriu porque o intervalo de 4 segundos entre duas chamadas era impossível pra um modelo que raciocina, e o screenshot confirmou.

Causa: a `LlamaChatSession` **acumula o histórico entre chamadas**, e o singleton do servidor vive o processo inteiro. Com o Qwen sem raciocínio isso passava despercebido (1 prompt curto por chamada); com raciocínio são 2 fases + `<think>` longo, então o contexto estourava logo no segundo papel. Correções: (a) `resetChatHistory()` no início de cada geração — nenhum fluxo aqui depende de memória entre chamadas, cada prompt já carrega todo o contexto de que precisa, então zerar é o comportamento CORRETO, não um remendo; (b) `console.error` no catch da rota — a falha era literalmente invisível, e o servidor é o único lugar que enxerga a causa.

E o (c) que eu tinha escrito aqui como correção era um **erro meu**: forçar `contextSize: { min: 16384 }` "pra dar espaço ao think" estourou a VRAM (*"a context size of 16384 is too large for the available VRAM"*) e derrubou as três chamadas. Quem denunciou foi justamente o `console.error` que eu tinha acabado de adicionar — a instrumentação pegou o autor primeiro. Voltou pro default do `createContext()`, com o motivo em comentário no código pra ninguém "melhorar" isso de novo. Fica o registro: o log que se adiciona pra caçar bug alheio é o mesmo que pega o próprio.

## 86. O modelo que já sabia pensar: a Fase 1 termina removendo o DeepSeek que ela tinha acabado de instalar

Com a sessão corrigida, o teste comparativo finalmente pôde rodar de verdade — e desmontou a premissa da fase inteira.

**O Qwen3-4B é um modelo híbrido raciocinador.** Ele pensa por padrão. A ferramenta usava esse modelo desde a SPEC-23 e nunca tinha visto um `<think>` — porque o nosso próprio código aplicava a grammar GBNF junto com o prompt, e GBNF restringe a amostragem desde o token zero. Estávamos rodando um raciocinador em modo mudo e concluindo, da saída rasa, que "modelo de 4B tem teto". O teto era nosso.

O diagnóstico que valia pro DeepSeek valia pro modelo que já estava no disco. Bastou marcar `raciocinador: true` no registro — a mesma flag, o mesmo caminho de duas fases do `motor.ts`. Medido na máquina real, mesmo prompt e mesmo lote:

| | Qwen3-4B com raciocínio | DeepSeek-R1 8B |
|---|---|---|
| 1ª chamada | **330s** | 1500s |
| 2ª chamada | **306s** | não terminou em 25 min |
| Disco | 2,5 GB (já baixado) | +5 GB |
| Conteúdo | critérios numerados citando latência de 150ms e status 200 | idem, quando terminava |

Cinco vezes mais rápido, com a profundidade que faltava, sem download novo. A decisão do usuário foi imediata: *"faz muito mais sentido termos SOMENTE o Qwen3-4B, essa é minha decisão, prossiga"*. `MODELOS_CHAT` voltou a ter um item; `MODELO_CHAT_DEEPSEEK`, o download de 5 GB e o `--modelo deepseek` saíram.

Um teto de 2000 tokens de raciocínio (`TETO_RACIOCINIO`) ficou: **sem limite, uma única chamada levou 2563s (~42 min)**. "Lentidão tolerada" tem fundo.

Três coisas que este episódio deixa registradas:

- **A abstração sobreviveu ao motivo que a criou.** `ProvedorIa` nasceu pra alternar entre dois modelos locais — alternativa que deixou de existir no mesmo dia. Ela continua, porque o valor real dela sempre foi a Fase 2 (o wrapper corporativo, §4.6 da SPEC-25). Uma abstração que só se justifica por um caso de uso vira dívida quando o caso some; esta tinha dois.
- **"O modelo é fraco" é uma hipótese, não um diagnóstico** — e é a hipótese mais cara de aceitar sem teste, porque a resposta natural (baixar um modelo maior) custa GB, horas e complexidade permanente. A pergunta barata era "o que o nosso código está impedindo o modelo de fazer?", e ela vinha antes.
- **Trabalho jogado fora não foi desperdício.** O DeepSeek instalado foi o que forçou a briga grammar × raciocínio, o `resetChatHistory()`, o `console.error` na rota e o caminho de duas fases. Tudo isso ficou — e é exatamente o que faz o Qwen render agora. O que saiu foi só o arquivo de 5 GB.

**Um ponto ficou em aberto, e vai registrado como aberto.** Na esteira completa de validação (4 papéis, 4× HTTP 200, 3647s), três dos quatro itens acenderam os quatro pips e um não acendeu nenhum: `n2::ep0`, o item do nó marcado como EXISTENTE, que tem 17 placeholders contra 10 dos demais. O que foi possível descartar sem gastar mais uma hora de modelo:

- **Não é a UI**: os quatro elementos de pip existem para esse item, e ele entra na fila (17 campos de refinamento renderizados).
- **Não é a distribuição**: um teste determinístico novo monta exatamente essa forma — item pesado no mesmo lote que itens leves, chaves com `::`, espaços e acentos (`Backend::volumetria::RPS (Requisições por segundo)`) — e todas as chaves chegam ao `onResponderItem`.
- **A tentativa de isolar o papel PO não concluiu**: passou de 1800s sem resposta e expirou.

Sobra a hipótese do lado do modelo (resposta incompleta para aquele item apesar da grammar). Em vez de chutar, apliquei a mesma lição do bug anterior: **perda parcial agora avisa**. Quando um lote volta com dados mas faltando campos de algum item, o hook loga papel, item e chaves ausentes. Na próxima execução real a resposta vem de graça, em vez de sair de novo de um pip apagado num screenshot.

## 87. Configurar com apoio de IA: a sugestão preenche o formulário, nunca o arquivo

Pedido do usuário no meio da rodada: *"lembro que haviam outras demandas como poder ajustar as configurações com apoio de IA... foque nesse tipo de task, que já está mapeada no nosso roadmap"*. É o fluxo 2 da SPEC-23, que estava como Fase 3 do roteiro — antecipado.

O desenho inteiro cabe numa frase: **a IA propõe o objeto, o formulário que já existe recebe, o usuário salva pelo caminho de sempre.** A rota `/ia/sugerir-config` devolve um objeto no schema do alvo e nada mais; não existe caminho em que ela escreva em `config/`.

Isso não é cautela genérica — é a lição do §41 aplicada de propósito. A skill do Claude Code foi removida naquela rodada porque tinha virado uma ferramenta paralela, produzindo material fora do pipeline real. Assistência de configuração que gravasse direto repetiria exatamente esse erro: dois caminhos de escrita, um deles sem a validação do outro.

Os alvos ficam numa **tabela declarativa** no servidor (`ALVOS_SUGESTAO_CONFIG`): descrição, schema GBNF e as regras que um modelo pequeno erra sem instrução explícita — `key` em camelCase, `opcoes` só faz sentido em `select`, o que é um preâmbulo. Adicionar alvo é acrescentar uma entrada; o roteador e o componente de UI não mudam. Já rendeu: o alvo `campo-aresta` nasceu com o enum sem `"lista"`, porque `CampoAresta` não aceita esse tipo — o schema impede o modelo de propor algo que o formulário rejeitaria, em vez de deixar a UI consertar depois (a guarda na UI ficou mesmo assim, para servidor mais antigo).

Dos três alvos, o que mais vale é `papel`: o preâmbulo do agente é o que separa uma resposta de três linhas de uma especificação de verdade — e é a parte mais chata de escrever à mão. Descrever "um agente de segurança que cobre LGPD e dados sensíveis" e receber o papel montado, pronto pra revisar, é o caso de uso inteiro.

Um detalhe de honestidade na UI: o JSON parcial aparece enquanto o modelo escreve. No modelo local a chamada leva minutos, e sem isso a espera parece travamento — o mesmo achado que já tinha aparecido na esteira ("fica só o ícone de gerando").

Regressão: engine 145, llm 18, cli 57 (+3), web 205 (+4).

## 88. O arquivo que mais muda era o único sem tela

`config/regras.json` decide quais requisitos de refinamento cada item gerado recebe, por tech e por contexto. É a peça que deveria acumular o aprendizado do time — cada "esquecemos de definir o timeout de novo" vira uma linha ali. E era o único arquivo de configuração sem rota e sem tela: só dava pra editar à mão, o que na prática significava que quase nunca era editado.

A rota (`GET`/`PUT /config/regras`) é de propósito burra: grava o arquivo inteiro sem normalizar nada. Quem valida a forma de uma regra é o engine, na carga. Repetir essa validação na rota criaria duas fontes de verdade sobre o que é uma regra válida — e a que discordasse do engine venceria calada. O único cuidado é rejeitar corpo sem `porTech`, pra um PUT torto não apagar o arquivo.

Três coisas que a tela deliberadamente NÃO faz, e vale registrar o porquê:

- **Não edita `checklistProcesso`, `testes` nem `volumetria`** — mas preserva os três no salvamento, com teste garantindo. A tela nunca é dona do arquivo inteiro. Juntar as quatro listas numa tela só recriaria exatamente a mistura que a SPEC-20 desfez no domínio (o que se *decide* no desenho versus o que se *faz* pra executar).
- **Não edita `when`** (a condição sobre os nós). É a parte mais sutil da configuração; uma UI ingênua pra ela produziria requisitos que aparecem na hora errada, sem ninguém perceber. Quem tem `when` ganha um selo "condicional" e passa intacto.
- **A IA também não propõe `when`** — o schema do alvo `regra-refinamento` tem só `texto` e `contextos`. Onde a decisão é sutil demais para uma tela, ela é sutil demais para o modelo.

O campo de sugestão da aba leva no prompt os requisitos que já existem para aquela tech. Sem isso, o modelo propõe de novo o que já está na lista — foi o primeiro detalhe que apareceu ao montar o teste.

Regressão: cli 59 (+2), web 210 (+5).

## 89. As outras três listas de regras ganham tela — em seções separadas, de propósito

A primeira versão da aba de regras editava só o checklist técnico e preservava o resto. Agora as quatro listas têm tela: **Técnico**, **Processo**, **Testes** e **Volumetria**.

A decisão de forma vale mais que o código: **seções separadas, não uma lista só.** A SPEC-20 já tinha desfeito exatamente essa mistura no domínio — o que se *decide* no desenho (`Requisito`) é outra coisa do que o time precisa *fazer* pra executar (`ItemProcesso`), e juntar as duas numa lista foi o que confundiu a configuração original. Reunir tudo numa tela só reintroduziria a confusão pela porta da UI.

Cada seção herdou a forma do seu tipo, sem forçar uma abstração comum onde não havia:

- **Técnico e Processo** compartilham o editor (`{texto, contextos}` nos dois), mas com rótulo, explicação e alvo de IA diferentes — a instrução do alvo `item-processo` diz explicitamente: *"se a frase pode ser respondida escrevendo uma decisão, ela é requisito técnico e não cabe aqui"*.
- **Testes** tem forma própria (tipo, o que o ciclo prova, e os ambientes dev/hlg como caixas).
- **Volumetria não é lista** — é um interruptor por contexto. O bloco (Response time / Max error / RPS / Test duration) é fixo, exigido pelo agente validador, e nunca foi inventado aqui; então não há o que editar além de *onde* ele aparece. Desligar remove a chave do arquivo, ligar devolve com os contextos.

`when` continua fora da edição e fora da sugestão, pelo mesmo motivo de antes.

Validação real contra o `regras.json` do projeto de teste: 27 requisitos técnicos, 11 de processo, 13 ciclos de teste e a volumetria com seus 4 contextos, todos renderizados; marcar `hlg` num ciclo gravou no arquivo mantendo o resto intacto.

Regressão: web 214 (+4).

## 90. A ferramenta passa a saber o que ficou para trás

A dor que abriu a SPEC-26, nas palavras do usuário: *"mudou especificação na história X, aí preciso atualizar tudo manualmente depois"*. Reler tudo a cada mudança de desenho é caro — mas o caro de verdade não é reescrever, é **lembrar** o que precisa ser reescrito.

Bloco 1 resolve exatamente essa metade, e resolve **sem modelo nenhum**: toda resposta gravada leva junto o carimbo dos insumos que a produziram (rótulo → hash). Comparar o carimbo com o desenho atual diz, a qualquer momento, quais respostas nasceram de algo que já mudou.

Três decisões que valem mais que o código:

- **Hash por insumo, não do conjunto.** Um hash único diria "algo mudou" — inútil. Por insumo, a tela diz `srv-checkout.endpoints`, e a pessoa sabe onde olhar.
- **Sem valor antigo.** Guardar antes/depois seria versionamento, que a §6 da própria spec tira de escopo. O aviso vira "escrito antes de mudar: X" em vez de "mudou de A para B" — mesma ação resultante, sem carregar histórico que ninguém pediu.
- **Sem `node:crypto`.** O engine roda no browser também; um hash que diferisse entre ambientes marcaria tudo como desatualizado sem nada ter mudado. FNV-1a de nove linhas resolve — não é criptografia, é detecção de mudança acidental.

E um limite consciente: as respostas encadeadas dos papéis anteriores ainda **não** entram como insumo. Fazer isso exige saber a ORDEM dos papéis, que mora na config do pipeline e não no engine — sem ela, toda resposta viraria "desatualizada" assim que o papel seguinte escrevesse. Ruído, não sinal. Fica para o Bloco 2, que já vai precisar do grafo de ordem.

Ausência de carimbo não acusa nada. Quem respondeu antes disto existir não tem o que comparar, e transformar isso em âmbar encheria a tela de alarme falso no primeiro uso.

Validação real, o ciclo inteiro: responder um campo à mão (nenhum aviso), voltar ao canvas, mudar `endpoints` do `srv-checkout`, voltar à revisão — "⚠ 1 campo desatualizado" no header, selo no item e, no campo, "escrito antes de mudar: srv-checkout.endpoints".

Regressão: engine 154 (+9), web 218 (+4).

## 91. O revisor que não usa IA — porque o que dá pra contar não se pergunta

Bloco 4a da SPEC-26 ataca o "não esquecer coisas" pela metade barata: **o que dá pra computar não deve depender de modelo.**

Item sem ciclo de teste aplicável, dependência apontando pra item que não existe mais, campo obrigatório em branco, volumetria exigida e vazia, item tamanho G não quebrado — nada disso é opinião. Perguntar isso ao LLM troca certeza por probabilidade de graça, e no modelo local troca também por minutos de espera. A camada semântica (critérios que não cobrem um erro do contrato, história que contradiz o épico) é outra coisa e vem depois, porque ali o modelo é a única ferramenta possível.

Duas decisões de comportamento importam tanto quanto as regras:

- **Sem `regras` configuradas, só as checagens estruturais rodam.** Não se inventa exigência que o time não tem — um projeto sem tabela de testes não deveria ser acusado de não ter ciclo de teste.
- **Quebra saudável não mostra botão nenhum.** Revisor que sempre fala vira ruído, e ruído é o mecanismo pelo qual avisos param de ser lidos.

E o revisor **aponta, não escreve**. Cada achado é um link pro item; nenhuma correção automática, nenhum texto sugerido. É a mesma disciplina do "nada sugerido conta até ser confirmado", aplicada a diagnóstico.

Validação real no cenário de crédito: 14 erros e 18 avisos, todos verdadeiros — `Plano de migração` em branco em três nós diferentes, `Estratégia para instâncias em voo` vazia no processo Camunda, volumetria exigida sem números, e uma tech sem nenhum ciclo de teste que a cubra. Nenhum desses aparecia em lugar algum antes.

Regressão: engine 163 (+9), web 220 (+2).

## 92. A correção que veio do fluxo real: propagar não é botão, é conversa — e falta a janela

Eu tinha começado a construir os Blocos 2+3 da SPEC-26 como estavam desenhados: um botão "Propagar mudança" e uma tela de diff. O usuário interrompeu com como ele **realmente** trabalha hoje:

> *"Hoje, para mudar, basicamente eu falo com o Rovo (janela de chat) e peço para ele alterar um item e depois para ele revisar os demais; ele me devolve as sugestões e vou confirmando. Acho até mais simples fazer assim. O ponto é que não temos uma feature importante (mesma janela, similar a chatbot), onde eu possa desenhar um diagrama passando as informações (atual botão contexto do épico) e um agente avaliar isso, as configurações, stack do time, etc, e construir o diagrama."*

Duas correções numa frase só, e as duas melhoram o produto:

1. **A propagação já tem interface, e não é a que eu ia construir.** O painel de diff não morre — ele vira o cartão de proposta dentro da conversa. Menos superfície nova, mesma garantia de que nada é escrito sem aprovação.
2. **A entrada do funil estava vazia.** O botão "Contexto do épico" só GUARDAVA texto; ninguém lia esse texto pra propor arquitetura. A ferramenta ajudava a especificar o que já tinha sido desenhado e não ajudava a desenhar — que é justamente a parte mais cara de começar do zero.

Virou a SPEC-27, com três decisões que vale registrar:

**A conversa é nossa, não do modelo.** O `motor.ts` já zera o histórico da sessão a cada chamada — aquilo que na Fase 1 da SPEC-25 tinha sido correção de bug (o contexto estourava no segundo papel) vira agora propriedade de arquitetura: **quem monta o histórico enviado é o app**. Então o que entra na janela é decisão de produto, não do runtime.

**Uma conversa por fase**, e o usuário chegou nisso sozinho: *"provavelmente, para não exceder janelas de conversa, depois do desenho ele teria que começar outra conversa sobre a especificação"*. Desenho e especificação carregam coisas diferentes (catálogo de tipos versus itens derivados), e no modelo local estourar contexto não dá erro claro — dá resposta pior, em silêncio. Já custou uma noite de diagnóstico uma vez.

**Trilhos, não tool-calling livre.** O caminho "óbvio" seria dar as funções de `useQuebra` como ferramentas e deixar o modelo encadear. Em vez disso, o `tipo` de cada nó e de cada conexão é um **enum montado a partir da configuração real do projeto** — o modelo não consegue propor um tipo que a ferramenta não sabe criar, que é o erro mais provável de um modelo de 4B. E aplicar a proposta passa pelo MESMO `mesclarDiagrama` que carregar um cenário pronto usa: os nós nascem comuns, editáveis, indistinguíveis de um criado no clique. Nenhum canal paralelo de escrita — a lição do §41 de novo.

O `motivo` de cada nó e conexão é obrigatório no schema. Não é enfeite: é o que a pessoa lê pra decidir se aceita. Proposta sem porquê é caixa-preta pedindo confiança cega.

## 93. O bug que só existia no fim: streaming visível, resultado perdido

Relato do usuário: *"quando o PO termina de escrever sua parte e o arquiteto começa, tudo que o PO escreveu some da tela"*. E, depois: *"abri vários itens, todos vazios, sendo que antes eu havia visto eles serem escritos"*, *"acontece quando termina de escrever e passa para os agentes seguintes, é algo no mecanismo"*.

**Duas tentativas de reprodução falharam** antes de eu entender: um teste com o estado no pai (igual ao App) e uma reprodução no bundle real com as rotas de IA interceptadas. Nos dois, o texto sobrevivia. O que faltava era reproduzir a FALHA, não o caminho feliz.

A pista estava nos dois fatos juntos: **ele viu o texto sendo escrito** e **depois não havia nada**. São duas fontes diferentes:

- o texto ao vivo vem de `extrairRespostasParciaisAninhadas`, um scanner que aceita JSON **incompleto** — é feito pra funcionar com o modelo ainda escrevendo;
- o texto que fica vem de um `JSON.parse` do corpo **inteiro**, no fim do lote.

Se a resposta chega truncada, o parse explode, e o `catch` do lote — deliberado desde a SPEC-24, para uma falha isolada não travar a esteira — engolia tudo **em silêncio**. O usuário via o streaming e perdia o resultado no handoff. O aviso que eu tinha adicionado dois dias antes não pegava esse caso: ele só dispara com `Object.keys(respostas).length > 0`, e num parse quebrado nunca se chega lá.

Duas correções, e a segunda é a que importa:

1. **A falha deixou de ser silenciosa** — `console.error` com papel e tamanho do lote. Sumir com o trabalho de um papel inteiro sem dizer nada é o pior sintoma que este projeto já teve, e já apareceu três vezes com roupas diferentes.
2. **O que streamou é aproveitado.** No catch, o mesmo parser parcial que alimenta o texto ao vivo recupera o que chegou e aplica. O que a pessoa viu na tela é exatamente o que se recupera — melhor um campo incompleto, visível e editável, do que a tela em branco. E o recuperado **nunca nasce confirmado**, mesmo com confirmação automática ligada: é texto possivelmente truncado, tem que passar pelo olho humano.

Os testes provam o bug antes de provar a correção: com a fonte revertida, dois deles falham com "expected 0 to be greater than 0" — zero campos aplicados, que é o sintoma relatado.

**O que ainda não sei**: POR QUE a resposta trunca. O `console.error` da próxima execução real vai dizer (um "Unexpected end of JSON input" aponta truncamento; outra mensagem aponta rede). A hipótese principal é a janela de saída do modelo local com lotes grandes — o próprio comentário do `TAM_LOTE_ESTEIRA` já previa isso ("com os campos do Especialista, 10 itens estouram fácil"). Não mexi no tamanho do lote sem medir: seria trocar um chute por outro.

## 94. A propagação aterrissa na conversa — e o app decide o escopo, não o modelo

Fase 2 da SPEC-27: o fluxo que o usuário já tem com outra ferramenta — *"peço para ele alterar um item e depois para ele revisar os demais; ele me devolve as sugestões e vou confirmando"* — agora existe aqui.

O que vale registrar não é a tela, é a divisão de trabalho: **quem escolhe QUAIS itens revisar é o app**. `itensImpactados` sai do grafo que a derivação já produz (dependências transitivas + itens da mesma origem). Pedir ao LLM que descubra as dependências seria dar a ele um trabalho que o app faz com certeza, e ainda somar a chance de errar nas duas etapas. O modelo só escreve o ajuste de cada item.

E a propagação é deliberadamente **para baixo**: quem depende do item alterado entra; quem o item alterado depende, não. Propagar para cima transformaria qualquer edição numa revisão da quebra inteira — o trabalho manual que se quer justamente evitar.

Uma chamada por item, e não um lote — decisão direta do §93: o lote grande foi o que truncou a resposta e apagou o trabalho de um papel inteiro. Aqui a resposta é pequena por construção, o progresso aparece item a item, e uma falha isolada só perde aquele item (com log).

O diff virou **cartão dentro da conversa**: antes riscado, depois, e o porquê, com Aceitar/Rejeitar por campo. O Bloco 3 da SPEC-26 existe — só não como tela própria, porque a conversa já era o lugar.

**Um bug meu, pego pelo teste que eu mesmo escrevi**: a primeira versão guardava o cartão *renderizado* dentro da mensagem no estado. Clicar em Aceitar mudava o estado, mas o JSX salvo continuava o antigo — a tela não refletia o clique. Guardar JSX em estado é guardar um retrato; o que se guarda é dado, e a tela se monta na renderização. O teste de "Rejeitar tira o botão" falhou na hora.

Regressão: engine 170 (+7), llm 18, cli 64 (+3), web 241 (+11).

## 95. O provedor que não dá pra testar de verdade — e como testá-lo mesmo assim

SPEC-25 Fase 2. O pedido é antigo: rodar a esteira pelo **wrapper corporativo** em vez do Qwen local. O impedimento também: o token da empresa não saiu. A tentação seria adiar até sair — e a spec (§8.1) já tinha decidido o contrário: implementar como **soquete dormente**, pronto e testado, para que no dia do token a validação seja colar três campos e clicar.

O achado que desenhou a fase veio antes, do próprio usuário: ele **já** fala com o DeepSeek por um wrapper interno. Um `ProvedorDeepSeekApi` específico teria nascido inútil. O que existe é `criarProvedorCompativelOpenAI({baseUrl, chave, modelo})` — `POST {baseUrl}/chat/completions`, que é o formato de-facto do wrapper corporativo, do DeepSeek oficial, do Ollama, do vLLM, do LiteLLM, do OpenRouter. Uma implementação, N destinos. E quando o gateway é interno, nada sai da empresa: a objeção de privacidade que travaria o uso real se resolve de graça.

**A parte difícil é o JSON.** No local, a GBNF torna JSON inválido *impossível*. Aqui não existe grammar, e fingir que existe seria mentira: a garantia passou a ser `response_format: json_object` + o schema no prompt + **validação contra o schema** + **um** retry mandando a tentativa errada de volta com o defeito nomeado (`falta a chave "valor"`, não "responda direito"). Um retry, não três: se o gateway erra duas vezes com o defeito apontado, o problema é dele, e insistir só gasta o tempo de quem espera. A diferença de força entre os dois caminhos está escrita no código, não escondida atrás da interface.

**Testar sem token.** A suíte sobe um `node:http` que responde SSE de verdade — e é aí que aparece o que um `fetch` mockado nunca mostraria: o gateway pode fechar o pacote TCP **no meio de um `data:`**. Sem buffer entre leituras, esse pedaço vira JSON inválido e o texto some em silêncio (o mesmo tipo de perda silenciosa do §93). O teste que corta a linha em dois `write()` existe por isso.

E um achado real que só o HTTP de verdade dava: `resposta.body` **sempre** existe no `fetch` do Node. O caminho "gateway que não streama" estava escrito atrás de `if (!leitor)` e era **inalcançável** — teria falhado na primeira vez que alguém apontasse para um Ollama sem streaming. A detecção passou a ser pelo que chegou: nenhum `data:` no corpo → tenta `choices[0].message.content`.

**A regra de segurança virou teste.** SPEC-25 §4.4 dizia "credenciais nunca em `config/`", porque `config/` é pasta do projeto e entra no git. Dizer não basta: agora um teste falha se o caminho contiver `config`, outro falha se a resposta HTTP contiver a chave, e o que a tela mostra é `sk-…7890`. A chave mora em `~/.gerador/credenciais.json` com modo `0600` e nunca volta pela rede — nem para a tela que acabou de enviá-la. Consequência prática disso: como o campo mostra a máscara, chave vazia significa "mantenha a que já está lá", senão trocar só a base URL exigiria redigitar o segredo.

Duas decisões pequenas que evitam confusão futura: o gateway entra no **mesmo espaço de ids** dos modelos locais (`config/ia.json` tem um campo só), mas **fora** de `MODELOS_CHAT` — essa lista é a do que se **baixa**, e gateway não se baixa. E `pronto`, para o gateway, não exige o modelo de embedding local: ele só serve ao RAG, e cobrar 650 MB de quem escolheu rodar tudo remoto travaria a esteira sem motivo.

Um teste ainda pegou uma fragilidade minha: `gerador ia usar` fazia `find(...)!` no status e estourava com `undefined` se o id não estivesse listado. O `!` era uma aposta; virou fallback para o próprio id.

**O que NÃO foi verificado, e fica dito**: o gateway real. Contra servidor falso está ponta a ponta; contra o wrapper da empresa, não — depende do token. A Fase 2 está pronta, não validada em produção.

Regressão: engine 170, llm 47 (+29), cli 77 (+13), web 252 (+11).

## 96. A saída que funciona hoje — o prompt único deixa de ser nota de rodapé

A SPEC-25 §5.5 estava escrita desde a arquitetura, marcada como "opcional, barata". Com o token corporativo ainda sem sair e o modelo local levando dezenas de minutos por esteira, ela virou a coisa mais valiosa do backlog: **o único caminho que entrega valor no ambiente real hoje**, sem depender de liberação nenhuma. A ferramenta monta o prompt; a pessoa cola onde já cola.

O template do protótipo legado estava no repo (`gerador_de_itens-2.html`), então dava para não inventar: as variáveis reais são `descricaoEpico`, `contextoadicional`, `itensBreakDownContent`, `requisitosTecnicos`, `ciclosTeste`, `tecnologiasEnvolvidas`, `contextosAplicaveis`, `timestamp`. Duas coisas mudaram, e as duas são sobre erro silencioso:

1. **O template era um arquivo subido a cada sessão**, trocado com `String.replace` solto. Uma variável digitada errada não dava erro nenhum — virava `{{tipoErrado}}` cru no meio do prompt já colado no chat. Agora ele é config do projeto e o `PUT` **valida contra um conjunto fechado**: erro aparece na edição, que é onde dá para corrigir.
2. **O padrão ficou mais curto que o legado, de propósito.** Boa parte daquele texto gigante existia para conter alucinação — "volumetria em branco", "NUNCA misturar teste com refinamento", indicador literal. Tudo isso **já é determinístico no motor**: o checklist técnico e os ciclos de teste entram prontos no prompt, não são pedidos ao modelo. O que sobra para ele é o que é de fato textual.

Três decisões pequenas com motivo:

- **Painel, não botão que copia direto.** O destino é um chat onde não existe desfazer. Ver antes de colar custa dois segundos; descobrir depois que era o prompt errado, não.
- **Dependência sai pelo número do item.** `n1::ep0` é chave interna: não diz nada a quem lê, nem ao modelo.
- **Nada sugerido e não confirmado entra no prompt.** Mandar palpite como se fosse decisão faria o modelo construir em cima do que ninguém aprovou — a mesma régua que vale no resto do produto desde a §4.3 da SPEC-23.

E uma que só apareceu escrevendo o teste: o prompt precisa ser **determinístico**. Se ele carregar `{{timestamp}}` por padrão, dois prompts da mesma quebra nunca são iguais e não dá para comparar o que mudou no desenho. A variável existe para quem quiser; o template padrão não a usa.

A comparação honesta da §5.5 continua valendo e está na spec: o prompt único não tem formato garantido, não tem revisão campo a campo dentro da ferramenta e não propaga mudança depois. Ele tem uma coisa só, e é a que importa agora — funciona.

Regressão: engine 189 (+19), llm 47, cli 80 (+3), web 259 (+7).

## 97. Três sintomas, um relato, e o revisor que contradizia o próprio produto

O usuário rodou uma quebra real de 20 itens e trouxe print de três coisas estranhas. As três eram reais, mas nenhuma era o que parecia.

**1. "Todos os nós verdes, tudo obrigatório preenchido — e 49 erros de campo obrigatório em branco."** Duas telas do mesmo produto se contradizendo, que é o pior tipo de defeito: destrói a confiança nas duas. A causa é minha, do Bloco 4a: `calcularProntidao` filtra os campos por `camposVisiveis()` (que avalia `when`), e o meu revisor iterava o spec **inteiro** do tipo de nó. O caso concreto:

```json
{ "key": "migracao", "label": "Plano de migração", "required": true,
  "when": { "not": { "nodeStatus": "novo" } } }
```

Num desenho só de nós **NOVOS** esse campo não existe — e era cobrado em todos eles. A correção é uma linha: usar a MESMA `camposVisiveis` que a prontidão usa. Não é só o menor diff; é o que torna a divergência **impossível** daqui pra frente, em vez de consertar este caso. O teste reproduz o cenário exato (nó novo com o campo `when`) e falha sem a correção.

**2. "Aparecem erros e avisos desde o início, enquanto a IA nem gerou o conteúdo — isso é certo?"** Não. Mas a resposta não é "não mostrar nada até o fim": há dois tipos de achado, e eles têm naturezas diferentes. Os que falam do **desenho** (dependência órfã, campo do nó, tech sem ciclo de teste configurado, item G) valem desde o primeiro segundo — a esteira não vai mudá-los, e escondê-los seria perder tempo de correção. Os que falam de **resposta** (volumetria sem valor) acusam algo que está sendo escrito naquele instante. Só estes ficam de fora enquanto a esteira roda.

**3. "O pipeline rodou por completo mas o penúltimo stage não foi preenchido."** Aqui o pipeline não falhou: o Especialista técnico **não tinha o que escrever**, porque a config de regras não cobria a tech/contexto daqueles itens — e o próprio revisor já dizia isso, em outra linha da mesma tela ("Nenhum ciclo de teste configurado cobre Backend"). O defeito era de comunicação:

```ts
const passou = placeholders.length > 0 && placeholders.every(...)
```

Zero placeholders dá `passou: false`, e o pip apagado ficava **idêntico** ao de um papel que devia escrever e não escreveu. Agora são três estados: feito, pendente e "sem trabalho" (pip vazado, com o motivo no `title`). **Ausência de trabalho não é trabalho não feito** — e uma interface que não distingue as duas coisas está afirmando a errada.

A lição que atravessa os três: nenhum era falha de geração. Um era o revisor contradizendo a prontidão, e dois eram a tela contando mal uma verdade que o sistema já sabia.

Regressão: engine 190 (+1), llm 47, cli 80, web 260 (+1).

## 98. Piscar e barra cinza: dois defeitos de acabamento que o teste consegue provar

Dois relatos de UI na mesma leva. Nenhum é "estético" no sentido de opinião — os dois têm causa mecânica e teste.

**O rótulo da conexão piscava a cada tecla digitada no painel do nó.** O React Flow decide repintar por **identidade** das props. O memo que monta as arestas dependia de `quebra.diagrama.nodes`; digitar num campo produz um array de nós novo (`atualizarNo` faz `nodes.map(...)`), o memo invalidava e devolvia objetos `Edge` novos — com `style` e `labelStyle` literais recriados. Nada tinha mudado nas arestas, e todas repintavam.

Das posições dos nós as arestas precisam de **uma** coisa: `x` e `y`, pro `handlesPadrao`. A dependência virou uma **string de geometria** (`id:x:y|...`) — valor primitivo, que só muda quando um nó de fato se move, entra ou sai. E os objetos de estilo saíram para constantes de módulo, com um cache de `{stroke}` por cor. Digitar spec agora não toca em aresta nenhuma.

O teste captura o que o `ReactFlow` **recebe** em cada render e compara referências — não dá pra ver "piscar" em jsdom, mas dá pra ver exatamente o que o causa. Ele falha com o código antigo. E tem um par: mover um nó **ainda** troca o handle, porque a correção não podia ser "congelar tudo".

Detalhe do próprio teste que valeu corrigir: a primeira versão montava um estado inteiramente novo a cada render, inclusive o array de arestas — e portanto falhava mesmo com a correção aplicada. Um fake que não espelha o que o app faz (`atualizarNo` preserva a referência de `edges`) testa outra coisa e dá o veredito errado.

**A barra de rolagem cinza do Windows.** A regra escura existia desde a rodada da timeline, mas presa a `.review-lista`. O usuário voltou apontando o óbvio: o painel de propriedades e as outras telas continuavam com a barra clara do sistema — o mesmo app com duas barras diferentes. Agora é global (seletor universal, não classe: qualquer contêiner com overflow herda sem precisar ser lembrado), com `border` transparente + `background-clip: padding-box` no lugar da borda pintada com a cor do fundo — assim o polegar afina sobre painel, modal e canvas sem moldura de cor errada.

Regressão: engine 190, llm 47, cli 80, web 262 (+2).

## 99. Sensibilidade do arrasto, seleção indesejada, e a persona que era o próprio time

Três ajustes pontuais vindos de uso real. Os dois primeiros no mesmo painel, o terceiro no prompt.

**"Preciso arrastar até muito distante para movimentar — efeito análogo a pouca sensibilidade."** A descrição é precisa e a causa é aritmética. O pan convertia pixels de tela em unidades do `viewBox` com `w / rect.width`. Mas o SVG usa `preserveAspectRatio="xMidYMid meet"`, que escala pelo fator que faz o conteúdo INTEIRO caber — o **maior** entre `w/largura` e `h/altura`. O painel do diagrama é largo e baixo (30vh) com conteúdo largo: quem dita a escala é a **altura**. Usando só a largura, o fator saía menor que o real e o desenho andava menos que o ponteiro. `Math.max` dos dois, e o arrasto passa a acompanhar o dedo.

Vale registrar o formato do teste: ele fixa um `getBoundingClientRect` de 900×200 (a proporção real do painel, não uma quadrada), arrasta 100px e exige que o deslocamento seja `100 × escala real` — e ainda assere que essa escala é **maior** que a fórmula antiga, que é exatamente a diferença que o usuário sentiu. Com a fórmula antiga, falha.

**"Ao clicar no fundo e arrastar, os textos são selecionados."** Faltava `user-select: none` no SVG. Num painel que se navega arrastando, seleção de texto nunca é o gesto pretendido — é ruído azul por cima do desenho.

**"Algumas histórias criadas pelo PO têm como persona o time de desenvolvimento."** O preâmbulo pedia `"Como <persona>, quero…"` e parava aí. Num item técnico ("Cache de CPF", "API Externa") o modelo pega o caminho fácil e escreve *"Como um desenvolvedor de sistemas, quero…"* — que não é história de usuário, é tarefa disfarçada: some o benefício de negócio e o critério de aceite nasce sobre a implementação em vez do resultado.

Proibir sozinho não resolveria (o modelo precisa de um lugar PARA ONDE ir), então o prompt agora faz as duas coisas: lista o que não pode ser persona (desenvolvedor, time, dev, engenheiro, arquiteto, QA) **e** diz onde achar a certa — quem recebe o valor: usuário final, cliente, analista/operador, área consumidora, ou o **sistema consumidor nomeado** quando o item é de infraestrutura e não tem gente diretamente. Com um exemplo que fecha o raciocínio: um cache existe para o cliente ter resposta rápida, não para o time "ter cache".

O teste verifica o prompt, não a saída do modelo — é o que dá pra afirmar deterministicamente. Se a persona continuar saindo errada com o prompt certo, o problema é do modelo local, e aí a alavanca é outra (gateway, SPEC-25 Fase 2).

Regressão: engine 190, llm 47, cli 80, web 264 (+2).

## 100. Três SPECs de uma vez — e a pesquisa que matou a ideia mais bonita

Rodada de planejamento, sem código: gestão de acessos, modelo por agente, e conversa com áudio/imagem. O padrão da SPEC-23 vale aqui — documento primeiro, implementação depois, faseada.

**A pergunta que precisou ser feita.** A gestão de acessos só faz sentido onde existe login, e o produto tem dois modos: o CLI local-first (sem autenticação nenhuma, por decisão da SPEC-17) e o hospedado. Perguntar foi barato e mudou tudo: **só no hospedado**. Permissão em arquivo local seria convenção, não segurança — qualquer pessoa edita o JSON —, e um produto que finge controlar o que não controla é pior que um que assume não controlar.

**O achado que reorientou a segunda SPEC.** O usuário sugeriu, com a ressalva de não ter certeza, autenticação externa: *"abre no navegador, usuário autentica na página do modelo e segue usando"* — e pediu para eu pesquisar. Pesquisei, e o caminho **não existe**:

- A **Anthropic** atualizou em fevereiro de 2026 a política de credenciais: OAuth (planos Free/Pro/Max) é **exclusivo do Claude Code e do claude.ai**, e usar esses tokens em ferramenta de terceiro **viola os Termos**. Para terceiro, só API key do Console.
- A **OpenAI** não tem `/oauth/authorize` na API de plataforma; o "Sign in with ChatGPT" é identidade, e só dentro do Codex.

Ou seja, a ideia mais elegante era também a única proibida — e implementá-la colocaria o usuário em violação de contrato com o provedor dele. Vale dizer o que isso ensina sobre a pesquisa: se eu tivesse "seguido o pedido" sem verificar, teria desenhado uma feature ilegal com a melhor das intenções.

O que sobra é chave — e aí a intuição do usuário sobre vault estava certa, só que no lugar exato. Infisical e Vault, como o projeto já os usa, guardam segredo **de infraestrutura**; segredo **de usuário** pede outra ferramenta: **envelope encryption**, onde o vault guarda a chave não-extraível e o *ciphertext* mora na nossa tabela. O **Infisical KMS** faz isso (AES-GCM, chaves não extraíveis, CMEK — a organização pode usar a própria chave no cloud dela), e já está no repositório desde a SPEC-12.

**A separação que evita um redesenho na terceira.** "Áudio e imagem" parece um problema só — "precisamos de um modelo multimodal". Não é. Áudio é **entrada de texto com outro teclado**: transcreve, e o texto entra na conversa como se tivesse sido digitado — nada no `ProvedorIa`, no prompt ou na esteira muda. Imagem é entrada que **só o modelo entende**, e aí o provedor muda mesmo. Separar permite entregar a metade mais usada (falar em vez de digitar) sem esperar nada da visão.

E a resposta à dúvida direta do usuário — *"não sei se nosso modelo atual faz isso"* — é **não, e nem o binding**: a documentação do `node-llama-cpp` não menciona multimodal. O llama.cpp por baixo tem (mmproj, `llama-mtmd-cli`), mas chegar lá exigiria subprocesso e mais 2 GB. Enquanto o caminho do gateway (SPEC-25 Fase 2) já aceita imagem no próprio `messages`, com uma mudança pequena. Fase 2 barata, Fase 3 condicional — só se aparecer necessidade de ver imagem **sem** rede.

Uma decisão de UI atravessa as três: **a interface tem que dizer a verdade sobre o que o sistema consegue**. Provedor sem visão não mostra botão de anexar imagem; recurso sem permissão não mostra botão de salvar. É a mesma lição do pip "sem trabalho" da §97, agora aplicada antes de o problema existir.

Entregue: `SPEC-28-gestao-de-acessos.md`, `SPEC-29-modelos-por-agente-e-credenciais.md`, `SPEC-30-conversa-multimodal.md`. Nenhuma linha de código — a implementação começa quando o usuário escolher por onde.

**Adendo (mesma rodada, lembrete do usuário): "não esqueça de prever onde fica o RAG em tudo isso."** Estava mesmo faltando, e o RAG atravessa as três — em cada uma pelo ângulo mais perigoso:

- **Acessos**: o corpus de retrospectivas é o material mais sensível que o produto vai guardar (nome de pessoa, conflito, decisão que deu errado). Ganha recursos próprios, com `ingerir` separado de `ler` — porque a regra da SPEC-23 de *citar o trecho de origem* significa que quem vê a sugestão vê o trecho. E a regra que impede o vazamento clássico de RAG multi-tenant: **o filtro de escopo vem antes da busca vetorial, nunca depois**. O teste que importa é o caso em que a busca "acerta" e o produto erra — o trecho do time B é o mais similar à pergunta do time A e ainda assim não pode aparecer.
- **Credenciais**: o RAG chama modelo em dois momentos com riscos assimétricos. Na consulta sai a pergunta; na **ingestão sai o corpus inteiro**, todo chunk, toda reindexação. Um seletor único de "provedor" trataria as duas como a mesma escolha. Decisão: **embedding local por padrão** — e o argumento que a fecha é que a opção segura já está pronta (o modelo de embedding está no registro desde a SPEC-23 Fase 0). Credencial ganha `usoPermitido`, e a pessoal não indexa corpus da organização: misturaria custo e custódia.
- **Multimodal**: retrospectiva **é uma reunião** — o material só existe hoje se alguém escrever depois, que é o motivo de nunca virar checklist. A transcrição da Fase 1 é a fonte natural do corpus, de graça. Com uma trava: **ingerir é ato deliberado**, nunca automático, senão a ferramenta vira arquivo permanente de conversa de time.

## 101. SPEC-28 Fase 1: o RBAC entra sem trancar ninguém para fora

Primeira fase da gestão de acessos implementada — schema, checagem e API, sem UI (que é a Fase 2).

**A decisão que mais importa não é técnica: como ligar isso sem quebrar quem já usa.** Um produto que hoje deixa qualquer membro editar tudo e amanhã exige permissão trava a base inteira no dia do deploy. A regra é: **organização sem nenhum papel criado se comporta exatamente como antes**; o RBAC passa a valer quando o primeiro papel nasce. Adotar vira decisão explícita de quem administra, e o caminho de volta (apagar os papéis) é óbvio enquanto a configuração está sendo desenhada. Tem teste próprio, e ele é o mais importante do conjunto: se quebrar, atualizar a versão tranca clientes existentes.

**O terceiro eixo custou um teste vermelho, e foi barato ter falhado.** O modelo é recurso × ação × **escopo**, e o escopo é o que responde "numa empresa é por área, noutra é por time". Na primeira versão eu registrei o `exigirPermissao` nas rotas **sem passar o resolvedor de time** — resultado: `resolverPermissoes` só enxergava papéis organizacionais, e quem tinha "Agilidade no time-pagamentos" era negado **até no próprio time**. O eixo existia no banco e não existia no caminho da requisição. O teste "o MESMO papel por time" pegou na hora.

**Um detalhe de teste que era armadilha maior que o código.** Os primeiros testes criavam campo num time ao qual o usuário não pertencia, e recebiam 403 — mas do `exigirTime`, não da permissão. Passariam pelo motivo errado. Agora o padrão é campo **global** (onde `exigirTime` devolve `null` e o único portão é a permissão), e só os casos que medem escopo passam `timeId` explícito. Teste de autorização que não isola qual portão fechou não prova nada.

Três decisões que ficaram no código com o porquê:

- **Recursos são enum fechado**, validado com `z.enum` na porta: recurso inventado é 400. Permissão sobre recurso que nenhuma rota checa é permissão que falha **aberta** e em silêncio — o pior modo de falha numa camada de autorização.
- **`editar` não implica `ler`.** As duas são concedidas explicitamente. "Pode editar mas não pode ver" é bug, e o jeito de garantir que ele não apareça é não esconder a implicação no código.
- **O 403 diz qual recurso e qual ação faltaram.** Erro de permissão que não diz o que falta vira chamado de suporte, não correção.

Também precisei incluir as três tabelas novas no `truncate` do `beforeEach`: um papel deixado para trás liga o RBAC da organização e faz **todos** os outros testes — que assumem o modo aberto — falharem com 403. Isso teria sido um mistério caro de depurar.

Rodou contra Postgres de verdade (o `db` do docker-compose do próprio projeto), não mock. Regressão: engine 190, llm 47, cli 80, web 264, **server 45 (+10)**.

## 102. SPEC-28 Fase 2: a aba que torna o RBAC configurável

A Fase 1 entregou a checagem e a API; sem tela, só existia para quem sabe fazer POST. A aba **Acessos** fecha isso.

A tela é o modelo: um papel é uma **matriz recurso × ação** mais uma lista de pessoas, **cada uma com escopo**. Os três eixos aparecem na mesma ordem em que existem no banco, porque foi assim que o problema foi descrito — *"agilidade pode editar os agentes… em outra empresa isso ocorre por time"*.

Três decisões que valem registro:

**O catálogo de recursos vem do servidor.** Copiar a lista para o front seria mais rápido de escrever e envelheceria em silêncio: um recurso novo nasceria no enum do servidor e simplesmente **não apareceria** na tela — permissão que ninguém consegue conceder porque não existe onde clicar. `GET /acessos/catalogo` resolve, e o teste percorre recurso × ação do catálogo para provar que a matriz é montada a partir dele.

**O estado vazio é informação, não ausência.** Sem papel nenhum, a tela poderia sugerir que ninguém pode nada — quando é exatamente o oposto: o modo aberto está valendo e todo membro edita tudo. O aviso diz isso com todas as letras, e diz também o que muda quando o primeiro papel nascer. Estado vazio que não explica o que está acontecendo é a mesma falha do pip apagado da §97.

**A coluna `aprovar` existe, com um selo "fase 3".** A permissão é guardada desde a Fase 1, mas o fluxo de proposta→aprovação ainda não existe. Mostrar a coluna sem o selo prometeria uma aprovação que não acontece; escondê-la esconderia uma permissão que já é gravada. O selo é a única saída honesta.

E um detalhe de teste que ia passando pelo motivo errado: a asserção do escopo procurava "organização inteira", que **também** aparece no texto de introdução da aba. Passava por casar com a intro, não com o escopo da pessoa. Buscar pelo travessão junto (`— organização inteira`) resolve — a mesma lição do teste de permissão da Fase 1, onde o 403 vinha do portão errado.

Regressão: web 273 (+9), server 45, engine 190, llm 47, cli 80.

## 103. "Nenhuma regra cobre Backend" era verdade — e a culpa era da config padrão

O usuário rodou o produto e estranhou, com razão: *"achei estranho 'nenhuma regra cobre Backend' — no especialista, sendo que estamos falando de integrações http, rabbit, kafka; precisamos revisar as configurações default."*

A resposta que eu tinha dado na §97 estava certa mas incompleta: eu disse que o aviso era legítimo e que a config dele não cobria aquelas combinações. Só que a config em questão **é a que o produto entrega**. Não era o time dele que tinha deixado buraco; era o exemplo padrão.

O diagnóstico não foi o óbvio. A tech `Backend` **tem** regras — 13 testes, 27 itens de checklist. O que faltava era casamento por **contexto**, em três lugares:

1. **`Serviço` e `Job/Scheduler` têm `contextos: []`**, e nenhum teste usava `contextos: []`. O padrão "sem contexto = aplica sempre" existia no checklist (um item, sobre logs) e **não existia nos testes**. Resultado: os dois tipos mais genéricos do catálogo — justamente os que aparecem em qualquer desenho — ficavam sem ciclo de teste algum.
2. **`Backend-topologia-mensageria`** (Exchange Rabbit) não era declarado por teste nenhum.
3. **`Job/Scheduler` não tinha contexto próprio**, então tampouco recebia checklist ou volumetria específicos — e um job tem preocupações bem concretas (reexecução idempotente, sobreposição de execuções, de onde retomar após falha) que nenhuma regra endereçava.

Corrigido nos dois lados que precisam andar juntos (`config/*.example.json` e `packages/cli/templates/*.json`, que são cópias por decisão registrada — corrigir só um deixaria o `gerador open`, que usa os templates, com o problema). Novo contexto `Backend-agendamento`, testes que valem para qualquer componente Backend (unitário e smoke de subida), testes de roteamento/mensagem-não-roteada para topologia, e testes + checklist de agendamento.

**O teste que fecha isso é o que mais importa**, porque o defeito era invisível: um tipo de nó novo nasce, ninguém escreve regra para o contexto dele, e o Especialista fica sem trabalho — que na tela parece **agente quebrado**, não configuração incompleta. O teste roda o **revisor de verdade** (`revisarQuebra`) sobre a config real, com um diagrama contendo os 16 tipos, e falha nomeando quais ficaram descobertos. Rodado contra a config antiga, ele acusa exatamente `service`, `rabbit-exchange` e `job`.

Mais dois testes de coerência que nasceram junto, porque a mesma classe de erro tem dois irmãos: **contexto órfão** (declarado em `app.json` e usado por regra nenhuma — opção que não faz nada) e **contexto fantasma** (usado por um tipo de nó e ausente da lista do app — não aparece como opção em lugar algum).

A lição vale além deste caso: o produto tinha **conteúdo** de configuração e não tinha **verificação de cobertura** dele. Configuração de exemplo é código de produto — e como código, precisa de teste dizendo que está inteira.

Regressão: engine 193 (+3), llm 47, cli 80, web 273, server 45.

## 104. Subir o modo hospedado achou três defeitos que nenhum teste pegava

Pedido do usuário: *"depois derrube o processo da porta e vou rodar o outro modo (suba os containeres)"*. Uma tarefa de operação — que virou a rodada mais reveladora em muito tempo, porque **nada disso aparece rodando `npm test`**.

**1. A imagem Docker não buildava desde a remoção do export-vault (§41).** O `Dockerfile` copiava `config/referencias` pra dentro de `packages/web/dist/config`; a pasta foi apagada junto com a feature do Obsidian e o `cp` passou a falhar. O modo hospedado estava sem build havia semanas e a CI seguia verde: ela roda build de TypeScript e testes, **não constrói a imagem**. Lição registrada: `Dockerfile` referencia caminhos que só existem por convenção — quando um diretório de config morre, ele é um dos lugares a visitar.

**2. A suíte do server truncava o banco de desenvolvimento.** `DATABASE_URL ?? "…/gerador"` — o mesmo banco do `docker-compose.yml`. Cada `npm test` apagava as tabelas do ambiente de uso, e o último teste deixava para trás o que tinha criado. O estrago concreto foi pior do que "perdi a massa de demo": sobrou um papel `Administrador` da suíte de acessos, e **papel existindo LIGA o RBAC da organização** (SPEC-28 §4.3). O banco de trabalho ficou com controle de acesso ativo, um único papel podendo só `acessos:editar` — ou seja, a edição de tudo o mais negada — e a massa de demonstração apagada. A suíte esteve verde o tempo todo: o dano é no ambiente ao lado, não no teste.

Duas defesas, e a segunda é a que importa: banco próprio (`gerador_test`, criado sob demanda) e uma **trava que recusa rodar contra banco cujo nome não termine em `_test`**, com escape explícito via `PERMITIR_BANCO_NAO_TESTE=1`. O padrão pode ser quebrado de novo por engano; a trava faz a suíte parar com uma mensagem que diz o que fazer, em vez de truncar o banco de alguém. Cinco testes cobrem a própria trava.

**3. O teste instável do gateway era um bug de verdade.** `ModeloIaTab.test.tsx > "Salvar só habilita com os três preenchidos"` falhou num run da CI e passou noutro, mesmo commit. O efeito que preenche os campos com a credencial vinda de `/ia/status` sobrescrevia o estado local **sempre** — então qualquer status chegando enquanto alguém digita apagava o texto no meio da digitação. O teste estava certo; a corrida era real. Agora o efeito só sobrescreve o campo que ainda está exatamente como o servidor mandou, e existe um teste que provoca a corrida de propósito (a suíte rodou seis vezes seguidas, verde).

Fora isso, a linha `<AcessosTab>` duplicada na `ConfigScreen` (renderizava a aba duas vezes) e a validação do modo hospedado ponta a ponta com Playwright: login, escolha de time, e a aba **Acessos contra o servidor de verdade pela primeira vez** — catálogo de recursos carregando do `/acessos/catalogo`, matriz montada, zero erro de rede.

O padrão que se repete: **rodar o produto encontra o que a suíte não encontra**. Build de imagem, isolamento de banco e corrida de renderização não são coisas que um teste unitário vê.

## 105. A esteira parada em silêncio: o modo hospedado não tem IA, e a tela não dizia

Relato com print: *"carreguei o cenário de aprovação de crédito, cliquei em derivar quebra, e na tela de revisão não aconteceu nada além do desenho do diagrama"*. Os quatro agentes desenhados, as bolinhas vazias, 14 itens em rascunho, nada acontecendo.

A causa é uma linha, `ReviewScreen.tsx`:

```ts
if (status.status !== "fulfilled" || !status.value.pronto) return;
```

**`packages/server` não registra rota `/ia/*` nenhuma.** Elas existem só no `openApiLocal.ts` do `gerador open`. No modo hospedado, `/ia/status` dá 404, a promessa rejeita, e o efeito de montagem faz `return` — mudo. A esteira fica desenhada e parada, que é indistinguível de produto quebrado.

O buraco é maior que a linha: `/ia/sugerir`, `/ia/sugerir-item`, `/ia/pipeline/:papel`, `/ia/alterar-item`, `/ia/propor-diagrama`, `/ia/sugerir-config`, `/ia/credencial` — **nenhuma existe no servidor**. "Refinar conversando", "Desenhar conversando", "✨ Sugerir" e a aba Modelo de IA são todos botões vivos numa tela onde não têm backend. Nunca foi decidido; foi acumulando: a IA nasceu no caminho local (SPEC-23) e cada fase seguinte continuou ali, enquanto o hospedado seguia sendo persistência + auth.

Esta rodada não fecha o buraco — fecha o **silêncio**, que é o que fazia parecer defeito. A tela agora distingue dois motivos, porque pedem ações opostas de quem lê:

- **`sem-rota`**: "os agentes não rodam neste modo", apontando o `gerador open`, e dizendo que derivação, revisão determinística e especificação continuam funcionando aqui.
- **`sem-modelo`**: "rode `gerador ia instalar`", com o "✨ Sugerir" manual ainda disponível.

Confundir os dois manda a pessoa pro lugar errado — daí serem estados separados e não uma mensagem genérica.

Validado no hospedado de verdade, repetindo o caminho do relato: login, cenário de crédito carregado, Derivar Quebra, e a faixa aparece com o texto certo. Os 404s medidos no caminho: `/ia/status` e `/config/pipeline-agentes`.

Fica registrado como pergunta em aberto: **IA no modo hospedado** é trabalho de verdade, e o caminho natural não é embarcar 3GB de GGUF no container — é o `ProvedorCompativelOpenAI` da SPEC-25 Fase 2, que já existe dormente exatamente pra isso, com a custódia de credencial da SPEC-29.

## 106. Claude na ferramenta: o soquete dormente serviu pra exatamente isto

Depois de descobrir que o modo hospedado não tem IA, o usuário escolheu o caminho: *"vamos começar simples, se eu conseguir usar o claude integrado a ferramenta já é ótimo"*.

**Nenhum provedor novo foi escrito.** A Anthropic publica uma camada compatível com a API da OpenAI — `https://api.anthropic.com/v1/`, `Authorization: Bearer`, `POST /chat/completions`, streaming — que é literalmente o que o `ProvedorCompativelOpenAI` da SPEC-25 Fase 2 já falava. Confirmei antes de escrever qualquer linha: um `curl` com chave falsa no endpoint real devolveu 401 no formato de erro da OpenAI, ou seja a camada de compatibilidade respondendo.

A Fase 2 tinha sido entregue como "soquete dormente" e ficou registrado no código que *"wrapper corporativo e Claude viram entradas novas, sem mexer em quem consome"*. Foi o que aconteceu.

O trabalho real foi tudo menos transporte, e saiu da documentação da Anthropic:

**`max_tokens` explícito.** O provedor nunca mandava esse campo. A API nativa da Anthropic **exige** `max_tokens`, então a camada de compatibilidade arbitra um valor que não está documentado — e um lote de 5 itens da esteira bate nesse teto e volta cortado. Essa é a falha silenciosa mais cara deste projeto (resposta truncada = trabalho perdido sem aviso, ver §270 do backlog). Agora o teto é nosso: 8192 por padrão, configurável.

**A garantia de JSON fica mais fraca, e a tela diz.** A Anthropic **ignora** `response_format` (documentado por eles). Onde isso vale, quem garante estrutura é `validarContraSchema` + um retry — a degradação que a Fase 2 já previa, agora escrita na aba em vez de escondida no código. O preset carrega `jsonNativo: false` e o aviso aparece antes de salvar, não depois de uma resposta estranha.

**Presets vêm do servidor.** `PRESETS_GATEWAY` mora em `packages/llm` e chega ao front por `/ia/status`. Não é preciosismo: `packages/web` **não pode** importar `@gerador/llm` — o pacote arrasta `node-llama-cpp`, binário nativo, pro bundle do navegador. E uma cópia no front envelheceria em silêncio, o mesmo argumento do catálogo de acessos da SPEC-28.

Um erro meu que os testes pegaram: a primeira versão de "trocar de destino" preservava o modelo digitado **sempre**, então ir de Claude pro DeepSeek deixava `claude-sonnet-5` apontando pro endpoint errado — erro que só apareceria na primeira chamada. Agora troca quando o valor veio de algum preset e preserva só o que foi digitado à mão (o caso do gateway interno com nome próprio).

Verificado contra o endpoint real, não só com mock: `/ia/credencial/testar` com chave inválida responde *"Credencial recusada pelo gateway (HTTP 401)"* e com base URL errada responde *"Endpoint não encontrado — confira a base URL (HTTP 404)"*. A cadeia rota → provedor → `api.anthropic.com` está fechada. O que **não** dá pra verificar sem uma chave paga é uma resposta completa de verdade — e isso está dito, não escondido.

Custo é decisão de quem usa: chave do console da Anthropic é cobrança por uso, separada da assinatura do Claude.ai ou do Claude Code. Não há caminho por OAuth — credenciais do Claude Code são exclusivas dele (ToS), o que já estava registrado na SPEC-25 §4.5.

## 107. A chave de verdade desmentiu a documentação (e a minha §106)

O usuário mandou uma chave da Anthropic pra fechar a validação que eu tinha declarado impossível. Em minutos, três defeitos que **nenhum mock pegaria**.

**1. `response_format: json_object` é rejeitado, não ignorado.** A tabela oficial da Anthropic lista o campo como *"Ignored"*. A API responde `HTTP 400: response_format.type: Input should be 'json_schema'`. A §106 dizia, com todas as letras, que a garantia com Claude seria mais fraca — **estava errado**, e errado na direção oposta: medindo as quatro variantes, `json_schema` + `strict: true` + `additionalProperties: false` em todo nível volta 200 com JSON limpo. É **Structured Outputs**, garantia mais forte que `json_object`. Sem o campo, o Claude devolve o JSON embrulhado em cerca de markdown.

Cada exigência foi descoberta por um 400 diferente: sem `strict`, "Field required"; sem `additionalProperties: false`, a mensagem apontando o objeto. Nenhuma das duas estava na tabela.

**2. O teto de tokens não era teórico.** Uma sonda com `max_tokens: 800` voltou com a string cortada no meio do critério de aceite. A §106 tinha argumentado que o teto explícito importava; aqui deu pra ver acontecendo.

**3. Falha de gateway virava HTTP 200 com corpo vazio.** As rotas de streaming escreviam `writeHead(200)` **antes** de chamar o modelo. Quando a chamada falhava antes do primeiro token — que é exatamente o caso do 400 acima — o cliente recebia 200 e nada. Os `catch` já sabiam mandar 500 quando `!res.headersSent`; o ramo simplesmente nunca rodava. Na tela: a esteira "rodando" sem escrever nada, o mesmo silêncio do §105 vindo de outro lugar. Agora o cabeçalho sai no primeiro pedaço, e resposta vazia sem erro virou erro explícito.

Corrigidos os três, o lote real: **5 de 5 itens completos, 39s, JSON válido**, com conteúdo específico do contexto (endpoint citado, HTTP 201, validação de CPF). O mesmo pedido que minutos antes voltava vazio.

O dialeto de JSON virou `formatoJson`, **deduzido da base URL** em vez de campo que a tela manda: `gerador ia conectar` no terminal acerta igual, e ninguém precisa saber que a Anthropic é diferente pra configurar o Claude.

A lição não é sobre a Anthropic. É que **documentação de API é uma hipótese**, e este projeto já tem uma seção inteira (§104) sobre defeitos que só aparecem rodando. Duas rodadas seguidas, a mesma conclusão por caminhos diferentes.

## 108. As quatro abas da ficha viram uma, dirigida pela configuração

Relato: *"a IA vai preenchendo as informações ali na tab Refinamento, e são as mesmas informações repetidas nessas outras tabs, não faz sentido"*.

Mapeada, a duplicação era total — **os quatro grupos** tinham sombra em outra aba:

| A IA escrevia em Refinamento | E o mesmo assunto aparecia em |
| --- | --- |
| Arquiteto: `Request`, `Response`, `Erros` | **Contrato** → campo do nó "Contrato dos endpoints novos" |
| Arquiteto: `Nó vinculado`, `Dependências` | **Contrato** (cabeçalho) e a lista de itens |
| QA: `Cenário Gherkin` | **Especificação** → "Critérios de aceite (Gherkin)" |
| QA: `Regras de teste` | **Testes** → "Ciclos de teste" |

E o efeito era pior que repetição: o Arquiteto escrevia o contrato e a aba Contrato seguia dizendo **"(não preenchido)"** para o mesmo assunto. A tela se contradizia.

A causa foi acúmulo: as abas nasceram como leitura do determinístico (campos do nó, tabela de regras); o Refinamento nasceu depois, como onde os placeholders são respondidos. Quando a esteira passou a preencher tudo, ninguém reconciliou os dois.

**A escolha do usuário foi melhor que a minha proposta.** Eu sugeri distribuir cada agente na aba do assunto; ele respondeu: *"remover as outras abas e manter a Refinamento… se amanhã o usuário quiser configurar outro agente ou mudar a ordem, os outputs devem aparecer ali na ordem que o fluxo foi configurado, assim o sistema fica genérico e flexível"*.

Isso expôs uma incoerência que eu não tinha visto: a esteira já rodava pela config (`pipeline-agentes.json`, Fase F), mas a ficha iterava `PAPEIS_PIPELINE`, **uma lista fixa no código**. Renomear um papel mudava quem escrevia e não mudava onde aparecia. Duas verdades sobre o mesmo fluxo.

Agora as duas leem a mesma fonte. Renomear, reordenar ou desativar um papel muda a esteira **e** a ficha — com teste que reordena QA antes de PO e confirma títulos e ordem.

O determinístico não sumiu: virou **"Insumos — o que os agentes receberam"**, fechado por padrão. Ele não era duplicata, era ponto de partida; lado a lado com a resposta do agente, um campo vazio do nó lia-se como contradição em vez de insumo.

De brinde, o mistério do §107: papel configurado sem placeholder **some** da tela — o que é indistinguível de falhar. Agora diz "nada a escrever neste item", nomeando a tech × contexto que a tabela de regras não cobre. Foi exatamente o que fez o Especialista parecer quebrado.

E a origem daquele Especialista vazio, confirmada por bisect do `regras.example.json`: o `config/regras.json` do usuário é **0 checklist / 12 testes**, idêntico à config da v0.1.14 ou anterior — de quando `checklistTecnico` nem existia como conceito separado. Não era o casamento nem a config entregue: era um arquivo de outra era, que a ferramenta corretamente nunca sobrescreve e incorretamente nunca comenta.

## 109. Hexagonal: o refactor que a sessão inteira estava pedindo

Depois de discutirmos migrar de Postgres para Mongo, o usuário propôs algo maior: *"vamos aproveitar para fazer melhoria arquitetura para hexagonal com DDD, é um refactor grande, mas vai valer a pena"*.

Isso converge — arquitetura hexagonal **é** a fronteira de repositório que eu tinha recomendado contra a migração direta, levada à forma completa. E ela dissolve a discussão de banco: com portas, Mongo vira adaptador, escrito e descartado sem tocar no resto.

Medindo antes de planejar, o prêmio apareceu, e **não é o banco**:

```
openApiLocal.ts (local, arquivo)     1.598 linhas
routes/* + app.ts (hospedado, PG)      964 linhas
```

`quebras`, `campos-no`, `perfis-time` e `especificacao-template` estão implementados **duas vezes**. E essa duplicação é a causa documentada de tudo que doeu nesta sessão: o hospedado sem IA (§105), sem tabela de regras (§108), e as duas configs em eras diferentes. Não foi descuido — é o resultado inevitável de escrever o mesmo domínio em dois lugares. Um dos dois sempre fica para trás.

Duas descobertas que mudaram o risco do plano, ambas a favor:

**O hexágono já está pela metade.** `packages/engine` é puro — zero `node:fs`, `http`, `fetch` ou `process.env` em 5.900 linhas — e `boundary.sanity.test.ts` guarda isso desde a Fase 1. O núcleo existe e está protegido há meses.

**E uma porta já roda em produção.** `ProvedorIa` tem dois adaptadores (llama local e gateway HTTP) e trocar de modelo já é trocar de adaptador. O refactor generaliza um padrão que este código já provou, em vez de importar um paradigma novo.

Sobre DDD, a recomendação aceita foi **seletiva**: repositórios como portas, os dois contextos delimitados (especificação | acesso), e a linguagem ubíqua que já existe em português. Fora: agregados como classes, value objects encapsulados, eventos de domínio, CQRS. Envolver um núcleo funcional puro e testado em cerimônia de objeto custa reescrita e não compra invariante que falte.

Um detalhe de §6 que resolve a discussão original de banco sem precisar vencê-la: os dois contextos quase não se tocam, e o de acesso é genuinamente relacional (8 FKs). Se o Mongo entrar, entra pela especificação, onde o dado é documento; o relacional fica onde as chaves estrangeiras trabalham. A escolha deixa de ser "tudo ou nada".

SPEC-31 escrita, cinco fases por estrangulamento, cada uma um PR publicável. Nenhuma linha de refactor antes da SPEC — regra do projeto, e aqui especialmente necessária.

## 110. A primeira porta, e o que ela encontrou no banco

**SPEC-31 Fase 1.** A porta de Quebras existe: `RepositorioDeQuebras` em
`packages/aplicacao`, com dois adaptadores — arquivo (`packages/cli`) e Postgres
(`packages/server`) — e uma suíte de contrato única que os dois respondem.

O achado veio de graça, no primeiro `npm test` depois de escrever o adaptador
Postgres: **7 dos 8 casos falharam**, incluindo, com o nome exato do defeito,
`"o que a esteira escreveu SOBREVIVE ao salvar e voltar"`. A tabela `quebras`
tinha seis colunas. `respostasItens`, `demandInfo` e `anexosContexto` — o
trabalho inteiro dos agentes e o contexto do épico — não tinham onde morar. O
modo hospedado aceitava o `POST`, respondia 201, e descartava em silêncio:
o Zod da rota declarava três campos e jogava o resto fora sem reclamar.

Ninguém tinha reportado isso porque ninguém usava o modo hospedado a sério. Mas
a pergunta que o teste de contrato faz aos dois adaptadores é a mesma, e o de
arquivo já respondia certo desde a Fase 1b. A migração `0011` deu as três
colunas ao Postgres e os 8 casos passaram nos dois. Depois eu derrubei as
colunas de novo, só para ver: 7 falhas outra vez. A suíte não é decorativa.

O que mudou de forma:

- `packages/aplicacao` — portas e casos de uso, sem I/O. Guardado por
  `fronteira.sanity.test.ts`, irmão do `boundary.sanity.test.ts` do engine:
  proíbe `node:fs`, `node:http`, driver de banco, `fetch` e `process.env` na
  camada. Verifiquei o teste injetando um `process.env.DATABASE_URL` de verdade
  num caso de uso — reprovou; removi — passou.
- `routes/quebras.ts` e `openApiLocal.ts::tratarQuebras` viraram borda fina.
  Traduzem HTTP e delegam ao **mesmo** caso de uso. As duas implementações
  paralelas de listar/obter/criar/atualizar deixaram de existir.
- O corpo aceito pela rota hospedada foi de três campos para os nove da porta.

O que essa fase não resolve: o modo hospedado continua sem as rotas de `/ia/*` e
sem configuração. Isso é Fase 2 e 3 — mas agora tem por onde, porque a forma
já está escrita num lugar só.

## 111. Três portas de uma vez, e a validação que só um dos modos tinha

**SPEC-31 Fase 2** — campos-no, perfis-time e o template da especificação
ganharam porta, adaptador dos dois lados e suíte de contrato. A fase que a
SPEC descreveu como "repetitiva e rápida" foi as duas coisas, mas achou três
divergências que ninguém tinha visto.

**A primeira: `POST /campos-no` do mesmo campo devolvia 500 no hospedado.** A
tabela tem `campos_no_chave_unica` em (time_id, tipo_no, key) e a rota fazia
`insert` puro — regravar um campo violava a restrição e virava erro 500 sem
mensagem. No modo local o mesmo gesto sempre foi correção, porque o arquivo
fazia upsert por chave natural. Verifiquei contra o banco de verdade antes de
descrever: o segundo insert falha e a tabela fica com uma linha só. A porta
agora diz `salvar`, não `criar`, e os dois adaptadores fazem upsert.

**A segunda: o modo local aceitava `{{variavelInexistente}}` no template.** O
hospedado chamava `validarTemplate` antes de gravar e devolvia 400; o local
gravava calado. O custo era invisível na hora e alto depois — a variável
errada reaparece como texto cru no documento entregue, e só alguém lendo a
saída perceberia. A validação subiu para o caso de uso, que é de onde ela
nunca devia ter saído. Confirmado contra o servidor local: HTTP 400 com
`variável(is) desconhecida(s) no template: {{tipoErrado}}`.

**A terceira: `GET /perfis-time/:timeId` não existia no modo local.** A rota
estava só no hospedado. Agora existe nos dois.

Duas coisas que a Fase 2 ensinou sobre a própria suíte de contrato:

- **A chave estrangeira é do adaptador, não da porta.** `perfis_time` referencia
  `times`, e o de arquivo não tem tabela de times para referenciar. A porta não
  promete que qualquer string sirva de `timeId` — promete que time EXISTENTE
  funcione. A suíte publica `TIMES_DO_CONTRATO` e quem tem a restrição prepara
  o terreno, em vez de o contrato fingir que a restrição não existe.
- **Truncar tabela compartilhada quebrou um teste de outro arquivo.** Um teste
  de rota dependia da semente da migração — isto é, de nenhum outro arquivo ter
  tocado na tabela. Consertei o teste, não a suíte: quem precisa de um estado
  garante o estado.

`camposEfetivos` (a regra de "campo do time vence o global") era o último
pedaço de domínio escrito duas vezes palavra por palavra. Agora é uma função,
num lugar, chamada pelos dois.

## 112. A config passa a saber dizer que está velha

**SPEC-31 Fase 3.** `regras`, `pipeline-agentes` e `prompt-unico` ganharam
porta, adaptador dos dois lados e — a parte que importa — **voz**.

O modo hospedado não tinha nenhuma dessas rotas. Quem subia o Docker ficava com
o default compilado, sem tela nem API para mudar. Agora as duas metades falam
com o mesmo caso de uso, com a mesma coerção de entrada (`sanearPapeis` e a
exigência de `porTech` moravam só no `openApiLocal.ts`; o hospedado herdaria
zero validação ao ganhar rota).

**O diagnóstico é a resposta ao §108.** Lá a conclusão foi que a ferramenta
*"corretamente nunca sobrescreve e incorretamente nunca comenta"* uma config de
outra era. Isto é o comentário: `GET /config/:chave` devolve, junto do
documento, a comparação com o template desta versão. A régua é estreita de
propósito — só acusa **seção inteiramente vazia** contra uma que o padrão
preenche. Config enxuta é escolha de time; transformar escolha em alerta ensina
a ignorar alertas. Zero contra não-zero é outra coisa: é uma seção que a versão
inteira assume existir.

Reproduzido contra o servidor real, com um `regras.json` no formato do seu:

```
a sua   : { techs: 2, checklistTecnico:  0, checklistProcesso:  0, testes: 12 }
o padrão: { techs: 2, checklistTecnico: 39, checklistProcesso: 12, testes: 21 }
seções vazias: [checklistTecnico, checklistProcesso]
```

E a frase que a aba de Regras agora mostra em cima da tela, em vez de o
Especialista técnico simplesmente não escrever nada.

**A validação real pegou um defeito que os testes não pegariam.** Na primeira
execução, todas as contagens do template vieram zero: o caminho resolvia
`packages/` em vez de `packages/cli/`, porque compilado o módulo vira
`dist/cli.js` e fica um nível mais raso que em `src/commands/`. O diagnóstico
comparava contra o vazio e nunca acusaria nada — e **"não acusou" é
indistinguível de "está tudo em dia"**. Nenhum teste da suíte pegaria: eles
rodam sobre `src/`, onde o caminho antigo também resolvia. Quem pegou foi rodar
o `dist`. `raizDoPacote()` agora tenta os dois layouts e exige encontrar
`package.json` **e** `templates/` antes de aceitar um.

De brinde, o carimbo: gravar config anota a versão que gravou. Nulo continua
legítimo — é o caso da config anterior a esta fase, exatamente o que o
diagnóstico existe para atender.

## 113. A IA existe no modo hospedado — e o container não carrega o binário

**SPEC-31 Fase 4.** O modo hospedado ganhou `/ia/status`, `/ia/credencial`
(GET/PUT/testar) e `/ia/sugerir`. Antes o app servido pelo container pedia
`/ia/status` e recebia **404** — a esteira não rodava e a tela não dizia por
quê. Era o §105 visto de outro ângulo.

**A separação que fez a fase valer a pena.** `node-llama-cpp` é 200 MB de
binário nativo que, num container que só fala HTTP com um gateway, nunca
executa. Mas `provedor.ts` misturava a interface `ProvedorIa` com as fábricas
que carregam o modelo local, e `provedorOpenAI.ts` importava `GbnfJsonSchema` —
type-only, some na compilação, e ainda assim obriga o pacote a ser resolvível.

Agora há `EsquemaJson` (a forma que este projeto realmente usa), `tipos.ts` (só
o contrato) e `gateway.ts` (a porta de entrada sem nada nativo). A separação é
por **arquivo**, não por flag: um `if` em runtime não impede o bundler de
arrastar a dependência junto.

E tem teste com dentes: `gateway.fronteira.test.ts` caminha o grafo de imports
de verdade a partir de `gateway.ts` e falha se `node-llama-cpp` aparecer — mais
um caso que prova o oposto (o índice normal do pacote **alcança** o binário),
para o dia em que o primeiro virar decorativo sem ninguém perceber. Ele já
pegou um vazamento na primeira execução: `gateway.ts` reexportava de
`provedor.js`, que puxa `motor.js`.

**A credencial muda de dono entre os modos.** No local é da pessoa, em
`~/.gerador/credenciais.json`, fora do projeto e do git. No hospedado é da
organização, no banco, e é usada por terceiros — o que muda o risco. A porta
reflete isso: `resumir()` é o único caminho que a API expõe, e o teste afirma
que a chave não aparece na resposta do `PUT` **nem para quem acabou de
mandá-la**, nem no `GET`, nem no `/ia/status`.

O que esta fase **não** entregou, e é honesto dizer: `/ia/pipeline/:papel`,
`/ia/diagrama`, `/ia/alterar-item` e `/ia/sugerir-config` continuam só no modo
local. São ~900 linhas de montagem de prompt dentro do `openApiLocal.ts` que
precisam virar casos de uso antes de existirem dos dois lados — mesmo caminho
das fases anteriores, tamanho de uma fase inteira.

## 114. Fase 5: a avaliação que concluiu "ainda não"

A Fase 5 da SPEC-31 — o adaptador Mongo — sempre foi condicional: *"se ainda
fizer sentido depois de 1 a 4"*. Feita a avaliação, a resposta é não, e vale
registrar por quê, porque a proposta de Mongo foi minha e do usuário juntos.

**O motivo original era "os schemas não são muito estáveis até então".** Era
verdade: as quatro fases mudaram o schema três vezes. Mas as três migrações são
aditivas e as três guardam o que varia em `jsonb` — `respostas_itens`,
`anexos_contexto`, `config_documentos.documento`, `credenciais_ia.cabecalhos`.
**O que era instável já é documento.** O que virou coluna é exatamente o que se
estabilizou. E a parte relacional ganhou o seu: a chave estrangeira de
`perfis_time` para `times` pegou um caso real na Fase 2.

**O custo inverteu.** Na conversa original, trocar de banco parecia barato
porque não havia porta nenhuma — não havia nada a reescrever, só nada a
reaproveitar. Hoje um adaptador Mongo precisa implementar **seis portas**,
passar **43 casos de contrato**, e trazer Mongo para o `docker-compose`, para o
CI e para as dependências.

**E é justamente por isso que a decisão é barata.** A pergunta deixou de ser
arquitetural. Se amanhã aparecer volume, uma forma que o `jsonb` não sirva, ou
uma restrição de infraestrutura da empresa, são seis arquivos contra interfaces
que já existem, validados por uma suíte que já existe — meio dia, não um
refactor.

O melhor resultado possível para esta fase não era construí-la: era torná-la
opcional. A SPEC-31 fez isso nas quatro anteriores.

## 115. O hospedado fica completo — e a paridade passa a ser verificada

Reação do usuário ao meu relatório da Fase 4: *"preciso do modo hospedado
completo, não estou entendendo por que tanta diferença entre um e outro, a
ideia do hexagonal e DDD é justamente facilitar esse tipo de coisa"*.

Ele está certo, e a objeção é a correta. Eu tinha tratado como "fase nova" o
que era **dívida da Fase 4**: as ~900 linhas de montagem de prompt dentro do
`openApiLocal.ts` eram a última duplicação, e enquanto elas moravam lá o
hospedado não tinha como ter as rotas sem reescrevê-las. Chamar isso de escopo
futuro era descrever o problema como se fosse a solução.

**O que a extração revelou é que era mais simples do que eu disse.** Cada rota
de IA fazia três coisas: montar schema, montar prompt, chamar o provedor. As
duas primeiras são **puras** — entra dado, sai texto e schema. Extraídas para
`casos-de-uso/ia/pedidos.ts`, as quatro rotas locais viraram quatro linhas cada,
e as quatro do hospedado nasceram no mesmo dia. `openApiLocal.ts` foi de **1549
para 1060 linhas**.

O streaming veio junto: o hospedado usa `reply.raw` e transmite pedaço a pedaço,
porque a esteira mostra o texto aparecendo — a mesma tela com experiência pior
seria a divergência que esta fase existe para eliminar, só que disfarçada.

**A parte que importa mais que as rotas: a paridade virou teste.**
`paridade.sanity.test.ts` lê as DUAS bordas — o roteador `node:http` e as rotas
Fastify — e compara os conjuntos de caminho. Cada exceção precisa de uma linha
declarando o motivo (instalar GGUF não faz sentido em container; derivar roda no
navegador no modo local). Adicionar rota num lado só passa a **quebrar o build**.

Prometer paridade em documento não impediu a divergência quatro vezes. Verificar
impede.

Ele já achou três gaps que ninguém tinha visto, na primeira execução:

- **`/campos-aresta`** — SPEC-21 criou no local e nunca chegou ao hospedado.
  Nem rota, nem tabela (migração `0014`).
- **`/prompt-unico-template`** — o mesmo documento com dois nomes: `/config/prompt-unico`
  aqui, `/prompt-unico-template` lá. A `packages/web` teria que saber em qual
  modo está.
- **`/versao`** — trivial, e sem razão nenhuma para faltar.

E um efeito colateral instrutivo: corrigir um flake meu (inserir organização
nova a cada execução, porque `organizacoes` não tem restrição única em `nome`)
**expôs** um teste que dependia de não haver credencial gravada. O flake estava
escondendo a dependência: cada arquivo via uma organização diferente e nunca
enxergava a credencial do outro. Mesma lição da Fase 3, agora pela terceira vez:
quem precisa de um estado garante o estado.

## 116. "Esqueci com qual credencial logar" — não havia credencial

Relato: *"podemos fazer o login com google (abre outra janela), eu esqueci com
qual credencial logar"*. Somado ao relato anterior — *"o login com conta google
sumiu"* — parecia dois defeitos. **Não era nenhum.**

O código do Google está inteiro e correto: botão na `LoginScreen`, `GET
/auth/login` com PKCE, `/auth/callback`, verificação de `email_verified` e de
domínio permitido. O `docker-compose` repassa as cinco variáveis e o
`.env.example` documenta. O que faltava era **configuração**: sem `AUTH_MODE=oidc`
o servidor sobe em `dev`, e o botão do Google, por construção, não existe.

E o modo `dev` **aceita qualquer e-mail, sem senha**. Verificado contra o
servidor dele, no ar: `POST /auth/login` com o e-mail pessoal devolve 200. Não
havia credencial para lembrar.

Os dois relatos, então, eram a mesma coisa: **a tela não se explicava**. Pedia
"E-mail" com um botão "Entrar" — que é exatamente como se parece um login de
verdade, com uma senha que a pessoa acha que esqueceu.

A correção é uma frase na tela, em modo dev: *"Qualquer e-mail entra, sem senha
— não há credencial a lembrar. Para entrar com Google, suba o servidor com
`AUTH_MODE=oidc`"*. Mesma régua do diagnóstico de config da Fase 3: quando o
sistema sabe por que está se comportando assim, ele diz.

Vale registrar o padrão, porque é a terceira vez nesta sequência: os defeitos
mais caros deste projeto não foram código errado, foram **código certo em
silêncio** — a config de outra era que nunca era comentada, a esteira que não
escrevia nada sem dizer que não havia regra, e agora uma tela de login que não
diz que não pede senha.

## 117. O container não subia — e o teste de fronteira estava verde

*"Funcionou, mas ainda sem acesso aos modelos de IA."* O diagnóstico foi
imediato: a imagem do container era de **6 horas antes** da SPEC-31 inteira. As
rotas existiam no código e não na imagem. `docker compose build server` deveria
resolver — e falhou **quatro vezes**, cada uma por um motivo diferente e cada
uma ensinando algo.

**1. `node-llama-cpp` entrava pelo `package.json`, não pelo `import`.**
`gateway.fronteira.test.ts` caminha o grafo de imports e estava verde. O build
morreu assim mesmo:

```
npm error path /app/node_modules/node-llama-cpp
npm error [node-llama-cpp] Git is not installed, please install it first to build llama.cpp
```

Eu tinha guardado o grafo de IMPORTS e esquecido o grafo de DEPENDÊNCIAS.
`@gerador/llm` declarava `node-llama-cpp` em `dependencies`, então o `npm
install` tentava compilar llama.cpp num Alpine sem git nem make — antes de
qualquer linha rodar. Agora é peer **opcional**: quem usa o caminho local
(`packages/cli`) declara de verdade; quem usa só o gateway não paga. E existe
`gateway.pacote.test.ts`, que verifica o grafo que faltava.

**2. `--workspace` não impede o npm de materializar o lockfile.** O lockfile da
raiz descreve o monorepo inteiro. `--ignore-scripts` é a resposta certa aqui, e
não gambiarra: nenhuma dependência do server tem script de instalação, e o
estágio de runtime copia só `dist/` e `migrations/`.

**3. `@gerador/aplicacao` faltava no `noExternal` do tsup.** A imagem subiu e
morreu no primeiro require. Mesma classe do que já tinha acontecido no CLI —
workspace não publicado precisa ser embutido.

**4. E o app web também era da era anterior**, com o contrato de `/config/*` de
antes da Fase 3 (documento cru, não envelope). Rebuildado junto.

**Dois defeitos meus que só a configuração real revelou**, os dois no código da
Fase 4:

- `/ia/credencial/testar` lia só a credencial **gravada**. Mas a tela testa
  ANTES de salvar — é o ponto do botão. O primeiro teste da vida sempre
  responderia "nenhuma credencial configurada" com os campos preenchidos na
  frente. Agora o corpo vence.
- O **dialeto de JSON** não era deduzido. A Anthropic exige `json_schema` (§107:
  medido contra a API, contra o que a documentação diz), e a tela não manda esse
  campo. Sem a dedução, a esteira falharia com HTTP 400 no primeiro item —
  depois de a credencial ter sido "salva com sucesso". `formatoJsonPorBaseUrl`
  saiu de `modelos.ts` (que importa o binário) para `presets.ts`, e a rota
  deduz.

O padrão de novo, agora explícito: **fronteira verificada num eixo não é
fronteira.** O import estava guardado, o pacote não; o comportamento do teste
estava guardado, o da tela não.

## 118. A tela mandava rodar um comando que não existe naquele modo

Print da aba "Modelo de IA" no modo hospedado: nenhum formulário, e uma linha
amarela — *"O modelo de embedding não está instalado — a IA só fica pronta com
ele. Rode `gerador ia instalar`."*

`gerador ia instalar` baixa um GGUF para a máquina. Em container, esse comando
não existe e **nunca vai existir** — é a decisão da Fase 4. A tela estava
mandando o usuário fazer algo impossível.

O erro era meu, e é sutil. Meu `/ia/status` do hospedado devolvia
`modelosChat: []` e `embeddingInstalado: false`. **Os dois valores são
honestos**: não há modelo local, não há embedding. Mas a tela lê `modelosChat`
para renderizar os cards — lista vazia, nenhum card, nenhum formulário — e lê
`embeddingInstalado: false` como "falta instalar", que é a semântica do outro
modo.

**Valores honestos lidos com a semântica errada.**

A correção que NÃO fiz: dar um `if (modo === "hospedado")` para a tela. Isso
recria a divergência que a SPEC-31 inteira existiu para matar, agora dentro do
componente. A correção que fiz: o hospedado passa a falar a **mesma forma** —
um único modelo, `remoto: true`, `selecionado: true`, com `gateway` e
`presetsGateway` preenchidos. O componente que já sabia renderizar o card de
gateway renderiza, sem uma linha nova.

`embeddingInstalado` virou `true` porque a pergunta que a tela faz com esse
campo é *"falta instalar alguma coisa?"*, e a resposta aqui é não. Não é
mentira sobre o estado; é responder o que foi perguntado.

Terceira vez que a lição aparece nesta sequência, e a formulação mais precisa
até agora: **contrato não é só o formato dos campos, é o significado deles.**
Duas pontas podem concordar no tipo e discordar no sentido — e o teste de
paridade de rotas não pega isso. Este pega: afirma que o status traz um modelo
remoto selecionado e os presets, que é o que a tela precisa para funcionar.

## 119. O retry streamava por cima da primeira tentativa

Relato, com print: *"tudo estava normal até o PO responder, então as
informações sumiram, os indicadores de timeline sumiram por um tempo e começou
a rodar o arquiteto"*. Campos do PO vazios, tique verde do PO na esteira, e o
Arquiteto seguindo em frente como se nada tivesse acontecido.

**A causa está em `completarEstruturado`, do provedor de gateway.** Quando a
resposta não obedece ao schema, ele faz UM retry dizendo o que faltou — decisão
certa. Só que a segunda tentativa streamava no **mesmo canal** da primeira.
Quem acumula os pedaços para dar `JSON.parse` no fim — que é exatamente o que a
`packages/web` faz — recebia as duas concatenadas. O parse falhava, o lote
inteiro do papel era descartado, e a tela seguia para o próximo papel sem dizer
nada.

**Por que nunca apareceu antes:** com GBNF o modelo local devolve JSON válido na
primeira passada, e o retry nunca roda. No gateway, o retry É o caminho normal
de recuperação — o defeito nasceu junto com o Claude e só apareceu com um lote
grande o bastante para o schema ser violado.

A correção é um sinal no contrato, não um remendo numa ponta: `OpcoesGeracao`
ganhou `onReiniciar`, o provedor chama antes de repetir, as duas bordas emitem
um caractere NUL (U+0000, impossível em JSON válido) e o cliente descarta tudo
que veio antes dele. O efeito visível é o texto ao vivo recomeçar — em vez de
virar lixo silencioso.

O teste que fixa isso sobe um servidor HTTP que erra e depois acerta, e afirma
as duas coisas: que o sinal veio uma vez, e que **sem descartar, o acumulado não
é JSON válido**. É a prova do defeito, não só da correção.

Isto responde a pendência #270 — *"descobrir POR QUE o lote volta truncado"*.
Não voltava truncado: voltava **duplicado**.

## 120. Funcionava no curl e falhava no navegador: CORS pulado pelo reply.raw

Depois de corrigir o retry (§119), os campos continuaram vazios. Desta vez não
supus: reproduzi contra o servidor dele, com a credencial dele.

`POST /ia/pipeline/po` respondeu **HTTP 200, JSON válido, conteúdo correto em
português, sem retry**. O servidor estava certo. Então o problema era o caminho
até o navegador — e a comparação lado a lado deu a prova:

```
/ia/status        -> access-control-allow-origin: http://localhost:8080
/ia/pipeline/po   -> (nenhum cabeçalho CORS)
```

**Escrever direto em `reply.raw` pula os hooks do Fastify**, inclusive os
cabeçalhos que o `@fastify/cors` já tinha calculado. O navegador bloqueava a
LEITURA de uma resposta que estava perfeita: o `fetch` rejeitava e o lote se
perdia sem erro visível. `curl` passava porque `curl` não aplica CORS.

A correção é copiar `reply.getHeaders()` para o `writeHead` antes de assumir o
socket.

**O que isso diz sobre a Fase 4, e é desconfortável:** este é o QUARTO defeito
no código que escrevi para o modo hospedado, todos encontrados pelo uso real e
nenhum pela suíte — testar antes de salvar, deduzir o dialeto de JSON, a forma
do status para a tela, e agora CORS. A suíte estava verde nos quatro.

A causa comum não é distração: é que `app.inject()` do Fastify **não passa por
CORS, não roda no navegador e não tem tela**. Ele exercita o handler, não o
sistema. Tudo que mora entre o handler e o usuário — cabeçalhos de hook, o
formato que a UI lê, o momento em que o botão é clicado — estava fora do alcance
de todo teste que escrevi.

E um erro meu de método, no §119: encontrei um defeito real (o retry corrompendo
o stream), corrigi, e **apresentei como se fosse a causa** do que ele relatou.
Não reproduzi antes de concluir. Da segunda vez reproduzi primeiro, e o
diagnóstico veio em dois comandos.

## 121. Pendencia nao e defeito: o painel de avisos passa a distinguir

Observacao do usuario, com print: o canvas com as 8 bolinhas VERDES e o painel
vermelho com 20 avisos, ao mesmo tempo.

Investigado, nao havia contradicao — havia duas perguntas diferentes:

- **A bolinha verde** responde *"este no tem os campos preenchidos pra eu
  conseguir derivar itens dele?"*. Os 8 estavam completos.
- **Os avisos** respondem *"os itens derivados ja tem a volumetria
  respondida?"*. A checagem le `respostasDoItem`, preenchido pela ESTEIRA — e
  na tela dele a esteira ainda nao tinha rodado.

Os dois estavam certos. O que estava errado era a tela apresentar como erro
algo que e fila de trabalho, num painel vermelho chamado "Revisao automatica",
antes de existir qualquer chance de estar preenchido.

`Achado` ganhou `origem`, derivada da regra: `volumetria-sem-valor` e
`sem-ciclo-de-teste` sao da **esteira**; `dependencia-orfa`,
`campo-obrigatorio-vazio` e `item-grande` sao de **pessoa**. Regra desconhecida
cai em pessoa — o padrao e mostrar, nao esconder.

O painel separa os dois grupos, e o titulo do segundo muda conforme o estado:
*"N campo(s) que a esteira ainda vai preencher"* antes, *"a esteira rodou e N
campo(s) continuam em branco"* depois. O segundo caso merece atencao; o
primeiro e so a lista do que vem a seguir.

Vale notar o que NAO mudou: nenhuma checagem, nenhum calculo, nenhum
comportamento do revisor. So o significado ficou visivel — que e o mesmo tipo
de correcao do diagnostico de config (§112) e da tela de login (§116).

## 122. Separar os grupos nao bastou: a CONTAGEM continuava somando os dois

Depois do §121, o usuario voltou: *"essa diferenca entre pendencia e defeito nao
ficou muito clara"*. Estava certo, e o motivo e simples de ver depois de
apontado: o painel separava os grupos por dentro, mas **o botao do cabecalho
continuava dizendo "20 aviso(s)"** — o numero somado. Quem le o cabecalho e nao
abre o painel recebe exatamente a mesma informacao errada de antes. Separacao
que so existe depois de um clique nao e separacao; e nota de rodape.

Duas mudancas, as duas de texto:

- O botao passa a contar as duas coisas separadamente e a nomea-las:
  *"⚠ 3 a resolver · 17 na fila da esteira"*. A borda vermelha so acende se
  houver algo do lado de pessoa.
- Cada grupo ganhou **uma linha dizendo quem resolve aquilo**. "Precisa de
  voce" explica que nenhum agente resolve — depende de decisao no diagrama ou
  nos campos do no. O da esteira responde direto a pergunta do print: *"Nao e
  erro: e a lista do que os agentes vao escrever quando a esteira rodar. Some
  sozinho."*

### O achado de brinde: a suite estava mentindo em vermelho

Rodando a regressao, a suite do web falhava — e falhava com um conjunto
**diferente** de testes a cada rodada. `CamposArestaTab` numa, `AbrirQuebraScreen`
na outra, quatro da esteira na terceira. Nenhuma era regressao: rodando o
arquivo isolado, o mesmo teste passa em ~5,1s.

A causa e o teto padrao do vitest, 5000ms. Varios testes de `userEvent` (que
digita tecla a tecla, com timers de verdade, sobre arvores grandes) encostam
nele; com os arquivos rodando em paralelo, encostar vira estourar. `testTimeout`
e `hookTimeout` foram pra 20s e a suite ficou 291/291.

Registro isso porque o custo real nao era o tempo perdido nesta rodada: era
estar treinando a mim mesmo a olhar vermelho e pensar "deve ser flaky". Uma
suite que falha aleatoriamente ensina a ignorar o sinal que ela existe pra dar —
e a proxima falha, a de verdade, chega no meio desse ruido.

## 123. O teste de navegador existia. Estava morto ha meses e ninguem sabia

A tarefa era escrever um teste de Playwright contra a stack hospedada, com um
gateway de IA falso — a resposta pra pergunta da retrospectiva da Fase 4: *por
que a suite estava verde e quatro defeitos chegaram ao usuario?* Porque
`app.inject()` chama o handler, nao o sistema: sem CORS, sem navegador, sem
tela. Os quatro moravam nesse vao.

Escrevi `e2e/gatewayFalso.ts` (um servidor OpenAI-compativel, SSE de verdade,
resposta fixa, 401 pra chave errada) e `e2e/ia-hospedada.spec.ts`, quatro casos:
a aba mostra o formulario do gateway em vez do comando que nao existe; testar
ANTES de salvar funciona; a esteira roda no navegador e o texto chega nos
campos; credencial errada vira mensagem util. Nao ha mock: o Chromium fala com
o Fastify, que fala HTTP com o gateway falso. A unica mentira e o conteudo da
resposta.

Ai a primeira rodada mostrou o que importa nesta entrada.

### O helper de login estava quebrado — pra TODA a suite

`entrar()` esperava `getByRole("button", { name: "+ Serviço" })`. A paleta ganhou
"+ Serviço de Batch (Spring Batch)" em algum momento, o seletor passou a casar
com dois botoes, e o Playwright falha em modo estrito. **Toda spec que chama
`entrar()`** — quase todas — estava vermelha por um motivo que nao era o dela.

Puxando o fio: dos 19 testes, 9 falhavam. Paleta esperando 11 tipos quando ha
16. `"4 atividades"` quando a tela diz `"4 itens"` desde a SPEC-14. Um botao
`"expandir 01"` que deixou de existir quando a revisao virou lista-mais-ficha na
SPEC-24. Nada disso era bug de produto: era a suite descrevendo um app que nao
existe mais.

### Por que ninguem sabia: o CI nunca rodou o E2E

`.github/workflows/ci.yml` roda `npm test --workspaces`. O Playwright nao esta
em `npm test` de workspace nenhum — ele e `npm run test:e2e`, e nada o chamava.
A suite foi escrita, passou uma vez, e apodreceu em silencio por meses.

Isso fecha o circulo de um jeito incomodo: **existia um teste de navegador
quando os quatro defeitos da Fase 4 passaram.** Ele so estava vermelho, sem
ninguem olhando. A licao nao e "faltava teste de navegador" — e que teste que
nao roda em algum lugar automatico nao e teste, e um arquivo.

O job `e2e` entrou no CI (Postgres de servico, so Chromium, screenshot das
falhas como artefato). Os 9 specs foram consertados; 19/19 verdes.

### Dois defeitos de produto sairam de brinde

- `EsteiraAgentes.tsx` misturava `borderBottom` (shorthand) com
  `borderBottomColor` no mesmo elemento. O React descarta a cor e avisa a cada
  re-render — o realce do agente ativo dependia de um estilo que o React
  removia, com um warning por quadro no console. Achado porque o spec novo
  trata console sujo como falha.
- Recarregar a pagina perde o time ativo e cai em "Qual time?". Nao e o alvo
  desta rodada; virou tarefa propria em vez de ser escondida atras de um helper.

## 124. O Qwen no modo hospedado: a parte facil era o encanamento

Pedido do usuario, com um motivo concreto: *"chamadas ao claude podem ser
bloqueadas no ambiente corporativo atual e ficarei sem ter como usar no dia a
dia, mesmo tendo docker"*. Ou seja: o modo hospedado precisa de um caminho de
IA que **nao sai da rede**.

O encanamento saiu como esperado. Um servico `ollama` no `docker-compose.yml`
(atras de `profiles: ["ia"]`, pra quem so quer ver a ferramenta nao baixar 2,5
GB), um segundo servico que faz `ollama pull` uma vez e sai, e o servidor
falando com ele pela rede interna. `packages/server` continua sem
`node-llama-cpp`: quem carrega o GGUF e o container do Ollama, e o server so faz
HTTP — a mesma fronteira que a Fase 4 estabeleceu.

Uma correcao de verdade apareceu no caminho: ja existia um preset "Ollama"
apontando pra `http://localhost:11434/v1`, e ele **nunca funcionaria no modo
hospedado**. Quem faz a chamada ali e o container do server, e `localhost` e ele
mesmo — o pedido morre em "connection refused" sem nunca sair. Nao daria erro de
configuracao: daria falha na primeira geracao, com os tres campos preenchidos e
certos na tela. Dai `presetsDoModo(modo)`: cada lado oferece o destino que
consegue alcancar, e endereco na internet (Anthropic, DeepSeek) aparece nos
dois, porque e o mesmo endereco de qualquer lugar.

### O que a medicao mostrou, e que eu teria escrito errado sem medir

Eu ia recomendar `qwen3:4b` como padrao — foi o modelo que o usuario citou desde
a SPEC-23, e o registro local ja usa. Rodei contra a stack de verdade:

- `POST /ia/credencial/testar` (uma frase): **49 s**.
- `POST /ia/pipeline/po`, UM item com UM campo: **22 minutos**.

E pior: a primeira resposta veio **errada** — o modelo devolveu o *schema* em vez
de uma instancia dele (`{"type":"object","properties":{...}}`). A validacao
pegou, o retry disparou, a segunda veio certa. O mecanismo funcionou; o custo foi
dobrar uma espera que ja era absurda.

A causa nao e o tamanho, e o tipo: `qwen3` e um modelo **de raciocinio**. Na API
compativel do Ollama o pensamento vai pra `message.reasoning` e **consome o
mesmo orcamento de `max_tokens`**. Medido isolado, com `max_tokens: 80`:
`finish_reason: "length"`, 80 tokens gastos, `content` **vazio** — a resposta
inteira ficou dentro do raciocinio. Com o teto de 8192 do provedor ele termina,
mas gastando minutos por campo.

Comparativo, mesma maquina, CPU pura (sem GPU no container — `nvidia-smi` nao
existe la). Duas medicoes, e a diferenca entre elas importa:

| modelo | prompt curto, modelo quente | pipeline REAL (1 item, 2 campos) | JSON certo de primeira |
|---|---|---|---|
| `qwen2.5:3b` | 5,5 s | **1 min 48 s** | sim |
| `qwen2.5:7b` | 16,3 s | **3 min 42 s** | sim |
| `qwen3:4b` (raciocinio) | — | ~22 min | nao, so no retry |

O microbenchmark diz 16 s; o pedido de verdade diz 3m42. Nao e contradicao — o
prompt do pipeline carrega ficha do item, contexto do epico e preambulo do
papel, e em CPU processar a ENTRADA custa. Se eu tivesse publicado os 16 s no
README, o numero seria verdadeiro e a expectativa, falsa.

Padrao escolhido: `qwen2.5:7b`, com o 3b documentado como a troca honesta pra
quem nao tem GPU (2x mais rapido, texto um pouco pior).

### Uma medicao errada no meio, que quase virou conclusao errada

Numa das rodadas, o `qwen2.5:7b` devolveu o **schema** em vez de uma instancia —
o mesmo defeito do `qwen3`. Ia registrar "modelos pequenos confundem schema com
instancia". Antes disso, refiz com o prompt REAL do `completarEstruturado`
("...que obedeca exatamente a este schema:") em vez do meu texto de teste
("...no schema"). Acertou de primeira, em 19,4 s.

Ou seja: o erro era do meu prompt de teste, nao do modelo. Um teste que nao
reproduz o pedido real mede outra coisa — e nesse caso teria acusado o inocente
e escondido a variavel que importava.

### A licao

**"O usuario citou esse modelo" nao e evidencia de que ele serve pro uso.** A
diferenca entre 16 s e 22 minutos por campo e a diferenca entre uma ferramenta
que se usa no dia a dia e uma que se abandona nos primeiros cinco minutos.
Escrever "use qwen3:4b" no README sem rodar teria sido entregar a segunda
achando que era a primeira — e o usuario descobriria sozinho, no pior momento
possivel, que a coisa que ele pediu pra poder trabalhar nao da pra trabalhar.

## 125. A SPEC-30 revisada: o que a SPEC-31 fez com o plano multimodal

Antes de comecar a voz e a imagem, reli a SPEC-30 — escrita antes da SPEC-31 e
antes de duas frases do usuario. Tres coisas nela tinham deixado de valer:

**1. "Transcricao local" virou "transcricao, com dois adaptadores".** O usuario
disse: *"para registrar essa parte de imagem e voz tambem pode ser com o claude
ou api se o usuario quiser, afinal ele escolhe o modelo"*. A versao anterior
assumia `whisper.cpp` local obrigatorio. Agora `transcrever?` e capacidade
OPCIONAL do provedor, com adaptador local e adaptador de gateway
(`/audio/transcriptions`, o mesmo dialeto de-facto que o resto ja usa) — e o de
gateway reaproveita a credencial ja configurada, sem tela nem chave nova.

**2. O modo hospedado nao pode ter transcricao local.** Nao e limitacao a
contornar: e a mesma decisao da SPEC-31 Fase 4 que tirou o `node-llama-cpp` do
container. Escrever isso na SPEC agora evita a Fase 1 nascer com um caminho que
so funciona em metade do produto.

**3. A ordem das fases inverteu.** Era "local primeiro, gateway depois"; virou
"gateway primeiro". Mesmo motivo que fez o gateway vir antes do modelo local no
hospedado: **o caminho que nao precisa de download e o que da pra validar hoje**,
e ele valida a porta inteira — o adaptador local entra depois sem tocar em UI,
rota ou contrato.

Duas coisas novas que a revisao trouxe:

- **`capacidades.visao` nao pode ser deduzida da base URL.** O mesmo endereco
  serve modelo com e sem visao; a diferenca esta no nome do modelo. Fica
  declarada no preset, e marcavel a mao pra gateway interno — com padrao "nao",
  porque esconder um botao que funcionaria custa um clique, e oferecer um que
  falha custa uma conversa.
- **Audio de retrospectiva so transcreve localmente.** A SPEC ja previa a retro
  como fonte do corpus de RAG. Com dois adaptadores, isso vira uma escolha — e
  gravacao de retro e o material mais sensivel que esta ferramenta toca (avaliacao
  de trabalho de pessoas nomeadas). Ditar uma demanda pelo gateway e razoavel;
  mandar a retro do time pra um endpoint externo e outra conversa, e nao e uma
  que a ferramenta deva facilitar por descuido.

O ganho da revisao nao e o documento: e nao ter comecado a Fase 1 pelo caminho
que ia dar errado em metade dos casos, e descobrir isso na integracao.

## 126. Voz na conversa: a feature quase nasceu na janela errada

SPEC-30 Fase 1a implementada — falar em vez de digitar, com a transcricao indo
pelo gateway ja configurado. A porta (`transcrever?` em `ProvedorIa`) e
opcional de proposito: o provedor local nao faz, e a UI usa a AUSENCIA do
metodo pra nao desenhar o botao. Botao que grava 30s e falha depois e pior que
botao nenhum — desperdica o tempo E a fala.

A rota `POST /ia/transcrever` nasceu nos dois modos de uma vez, e o
`paridade.sanity.test.ts` confirmou. No hospedado so o gateway transcreve, pela
mesma decisao da Fase 4 que tirou o binario nativo do container.

### O achado: existem DUAS janelas de conversa

Plugei o botao na `JanelaConversa`, rodei o typecheck, verde. Antes de escrever
o E2E fui procurar como abrir "Desenhar conversando" na tela — e descobri que
essa janela e a `ConversaPanel.tsx`, que tem `<aside>` proprio e **nao reusa a
`JanelaConversa`**.

Ou seja: eu tinha acabado de entregar o botao de falar na conversa da
ESPECIFICACAO, quando o pedido era *"botão falar, com animações em Desenhar
conversando"*. Typecheck verde, teste de unidade verde, feature no lugar
errado. Nada teria acusado — os dois testes que eu tinha escrito eram sobre a
janela em que eu tinha mexido.

A correcao virou `useVozNaEntrada`: a decisao de mostrar, a gravacao e o "onde
o texto cai" num hook so, e cada janela gasta tres linhas. As duas ganharam o
botao, que era o certo desde o comeco.

O que me salvou nao foi teste nem tipo: foi ir procurar o seletor pro E2E. A
pergunta "por onde o usuario chega nisso?" e a que revela se a feature esta
onde ele vai olhar — e ela nao aparece sozinha em nenhuma suite.

### Dois detalhes que valem registro

- **A onda vem do microfone de verdade** (`AnalyserNode`, RMS do sinal), nao de
  um `setInterval` com numero aleatorio. Nao e capricho: uma animacao que se
  mexe sem ninguem falar mente sobre o estado do sistema — quem esta com o
  microfone mudo veria o mesmo de quem esta falando, e so descobriria no
  silencio da transcricao vazia.
- **13 testes quebraram** quando o hook entrou: specs que mockavam `apiIa` so
  com o metodo que usavam agora batiam em `apiIa.status is not a function`. Dava
  pra "consertar" com `apiIa.status?.()` no hook — e isso teria escondido um
  acoplamento real atras de uma guarda que so existe pro mock. Completei os
  mocks: o teste passa a descrever o contrato inteiro, que e o que ele deveria
  fazer.

## 127. O vocabulário valeu mais que o modelo

Pergunta do usuario: *"tem algo como whisper que podemos incluir como o nosso
modelo gratuito?"*, e logo depois: *"faria sentido fazer algum fine tunning
nesse modelo mais leve?"*.

Primeiro achado, antes de qualquer codigo: **o Ollama nao transcreve**. Ele
serve texto e visao; nao tem `/audio/transcriptions`. Entao "poe junto do Qwen"
significava um servico A MAIS, nao um modelo a mais. O `hwdsl2/whisper-server`
(faster-whisper) fala o dialeto compativel — o adaptador da Fase 1a conversa com
ele sem uma linha nova.

### A medicao que decidiu tudo

Gerei um WAV em portugues com a voz nativa do Windows (SAPI) ditando uma frase
com jargao real: *"criar uma fila do RabbitMQ … com dead letter queue e
idempotencia"*. Em CPU, 33 s de audio:

| modelo | tamanho | tempo | jargao |
|---|---|---|---|
| `base` | 145 MB | **1,1 s** | "rabitém IKEA", "dedileta arquil", "idem potência" |
| `small` | 465 MB | 3,5 s | "Habitamik", "Dead Leth, Arq" |
| `large-v3-turbo` | 1,6 GB | 11 s | "Habitmq", "dedileta arquivo" |

O portugues comum saiu perfeito nos tres. O que todos erravam era **exatamente
o jargao** — o vocabulario desta ferramenta. E **subir o modelo nao resolvia**:
custava 10x o tempo e continuava errando.

Ai testei o `initial_prompt` do Whisper (campo `prompt`, no mesmo endpoint), com
uma lista de termos. Mesmo modelo `base`, mesma maquina, 1,1 s:

```
sem: "fila do rabitém IKEA … com dedileta arquil e idem potência"
com: "fila do RabbitMQ … com dead letter queue e idempotência"
```

Transcricao perfeita. **O que faltava nao era modelo, era contexto.**

### Por que isso responde "fine-tuning?" com um nao

Fine-tuning custaria dataset de audio anotado, GPU, ciclo de treino e manutencao
eterna (termo novo = retreinar) — para resolver o que uma linha resolve. Mas o
argumento mais forte nao e o custo: **esta ferramenta ja sabe o vocabulario
dela.** Os rotulos dos tipos de no estao em `config/diagrama.json`, as techs e
contextos nas regras, os nomes dos sistemas no diagrama aberto.

Dai `montarVocabularioTranscricao` (no engine, funcao pura): monta a frase de
contexto a partir da config e do diagrama, do mais especifico pro mais generico,
com teto — porque passar do limite faz o Whisper descartar o comeco em silencio.
Um time de Camunda e FICO recebe um vocabulario; um de Kafka e Redis recebe
outro. Sem treinar nada, e melhorando sozinho conforme a config cresce.

E a mesma regra do resto do produto: nada adivinhado, tudo derivado de
configuracao explicita.

### O erro que so apareceu testando o caminho de verdade

Com o vocabulario derivado da config, o resultado melhorou mas **nao ficou
perfeito**: "rabitém IKEA" virou "RabbitMiki". Os outros dois termos acertaram.

O motivo: na config o rotulo e **"Fila Rabbit"** — e o que a pessoa FALA e
"RabbitMQ". Derivar da config cobre o que o TIME nomeou; nao cobre o que a
INDUSTRIA nomeou. Entrou uma lista curta de nomes de produto (RabbitMQ, Kafka,
MongoDB, Camunda…), antes do jargao generico na ordem de corte. Revalidado: a
transcricao saiu identica ao que foi dito.

Vale como licao geral: **o rotulo da tela nem sempre e a palavra dita.** E eu so
descobri porque rodei o caminho real do produto contra o servidor de verdade —
o teste manual anterior, feito com a lista "certa" escrita a mao, tinha passado.

## 128. Imagem na conversa: o teste de navegador achou o que a unidade nao via

SPEC-30 Fase 2 — anexar um print no "Desenhar conversando". O caminho e o mesmo
da voz: capacidade declarada, UI que so oferece o que existe, gateway
compativel. Mas os defeitos foram outros, e nenhum apareceu na suite de unidade.

### 1. O retry perdia a imagem

`completarEstruturado` tenta de novo quando a resposta nao obedece ao schema. A
segunda chamada montava as mensagens sem as imagens — ou seja, **respondia
sobre um print que nao viu**. Peguei escrevendo o teste "anexa so na ULTIMA
mensagem": ele falhou por um motivo diferente do que eu esperava, e o motivo
era um bug real.

### 2. `capacidades.visao` nao pode sair da base URL — e nem do preset sozinho

A SPEC ja dizia que a base URL nao serve (o mesmo endereco serve `gpt-4o` e
`whisper-1`; o mesmo Ollama serve `qwen2.5:7b` e `qwen2.5vl:7b`). Virou
`modelosComVisao` por preset.

O que a SPEC nao tinha resolvido: **gateway interno nao esta em preset nenhum**.
Sem uma marcacao manual, quem tem wrapper corporativo nunca teria visao — e o
proprio E2E, que usa um gateway falso, nao conseguia ligar a feature. Entrou o
checkbox "Este modelo enxerga imagem", desmarcado por padrao.

### 3. O campo novo nao chegava no banco

Adicionei `visao` e `baseUrlTranscricao` ao tipo `CredencialIa`, ao formulario,
ao zod da rota e ao resumo. **A suite de unidade passou inteira** — 300 testes.
O E2E falhou: o botao de anexar nao aparecia.

Motivo: o adaptador Postgres tem **colunas explicitas**, nao um `jsonb`
generico. Campo novo no tipo nao vira campo novo na tabela — o valor era
gravado no ar e lido como `undefined`. Faltava a migracao 0015.

Isso e a mesma familia do §123: **teste de unidade prova que o handler faz o que
o handler acha que faz.** A persistencia real, o navegador real e o formato real
sao outra pergunta — e e a pergunta que o usuario faz.

### 4. O dublê tambem precisou aprender o formato

Com imagem, `content` deixa de ser string e vira array de parts. O
`gatewayFalso` concatenava `m.content` direto: virava `"[object Object]"`, ele
nao achava o schema no prompt, caia no ramo de texto livre e devolvia algo que
nao era JSON. A tela mostrou `Unexpected token 'e'`.

Vale registrar porque e contraintuitivo: **o dublê de teste tem contrato
proprio**, e mudar o formato do pedido quebra ele igual quebraria o destino de
verdade. Um mock que aceitasse qualquer coisa teria escondido isso — e escondido
tambem se o produto tivesse montado as parts errado.

## 129. As limitações viraram texto na tela (correção do usuário)

Fechei a Fase 2 listando as limitações **para o usuário, no chat** — e deixei
todas invisíveis **no produto**. Ele respondeu: *"ok, porém vc precisa colocar
tratamentos para essas limitações para o usuário entender"*.

A contradição era minha e explícita: eu tinha escrito, no comentário do
`useVozNaEntrada`, que *"um botão que grava 30s e morre no envio desperdiça o
tempo E a fala"* — e entreguei exatamente isso, porque `capacidades.transcricao`
responde "o provedor tem o método", não "o serviço de voz está de pé". Com o
preset do Docker, o microfone aparece mesmo sem o container `whisper`.

Não dá pra consertar a causa: descobrir se um gateway compatível com a OpenAI
transcreve exigiria mandar áudio pra perguntar. O que dá é **a falha dizer o
próximo passo**. `erroDeGateway` passou a receber a operação e traduzir por
status:

- **404 em transcrição** → "o Ollama não transcreve — suba o serviço de voz com
  `docker compose --profile ia up -d`", em vez de "Endpoint não encontrado".
- **400 com "image"/"vision" no corpo** → "desmarque *Este modelo enxerga
  imagem*", que é o único botão que resolve.
- **401/403** → aponta a aba onde a chave mora.
- **413/429** → print menor / espere.

O pior caso não tinha status nenhum. Quando o gateway falha **depois** que o
streaming começou, o 200 já saiu: chega texto no lugar do JSON, e o
`JSON.parse` cru mostrava `Unexpected token 'e'` na tela de quem só queria
desenhar um diagrama — com a causa real presa no log do servidor, onde no modo
hospedado a pessoa não tem acesso. Os quatro pontos de parse agora passam por
`interpretarRespostaEstruturada`, que nomeia os três motivos prováveis e mostra
o começo do que veio (que costuma ser a mensagem do próprio gateway).

E a aba **Modelo de IA** ganhou `AvisosDoDestino`: avisa antes, não depois, e
só o que muda a decisão **daquele** destino — Ollama não transcreve, CPU leva
~3min40 por item, "enxerga imagem" não é verificado por ninguém. Um teste
garante que destino público sem visão marcada **não** mostra aviso nenhum:
aviso que aparece sempre deixa de ser lido.

O achado de processo veio do próprio fechamento: o teste novo passou no vitest e
**quebrou o `tsc`** (`.catch(e => e)` devolve `Error | T`, e ler `.message` ali
não compila). É a mesma lição de sempre — a suíte verde não é o que a CI checa.
Regressão: 847 testes nos 6 workspaces, 21/21 E2E, build limpo.

## 130. O modelo deixa de depender do Hugging Face (SPEC-32)

Pedido urgente: *"não é possível usar essa estratégia de não embutir o modelo
no artefato, vamos embutir para eu poder usar a ferramenta, melhor ter um build
maior e conseguir usar"*. O motivo apurado: a rede onde a ferramenta precisa
rodar **bloqueia o Hugging Face**.

Duas correções de premissa antes do desenho.

**A primeira, minha.** O usuário lembrava que *"já funcionava assim antes, vinha
no pacote"*. Não vinha: `git log -S"gguf"` e `-S"models"` em
`packages/cli/package.json` não retornam nada, e o `files` sempre foi
`dist`/`templates`/`web-dist`. O `gerador ia instalar` nasceu junto com os
modelos (SPEC-23 Fase 0), e a SPEC-23 já registrava a decisão de não embutir.
Isso não muda o que ele quer — muda só de onde a gente parte.

**A segunda, do npm.** "Embutir no pacote" no sentido literal **não existe**: um
pacote de 229,9 MB já levou `413 Payload Too Large` no npmjs.org, e o maior real
publicado que encontramos (`onnxruntime-node`) tem 258 MB. O teto não está
documentado em página nenhuma — ele aparece como 413 na hora do publish. Um
Qwen3-4B tem 2.497 MB.

Então o modelo ganhou **origem plugável**:

- `--de <caminho.gguf>` copia um arquivo que já existe. Destrava uma pessoa
  hoje, sem publicar nada e sem rede.
- `--origem npm` monta o modelo a partir de pacotes-parte de ~190 MB. Quem
  baixa é o **próprio `npm install`** num prefixo descartável — não um cliente
  HTTP nosso. Isso é o que faz o caminho funcionar numa rede corporativa: o npm
  já sabe ler `.npmrc`, proxy, registry espelhado e credencial.

E o hash deixou de ser opcional. A SPEC-23 tinha registrado integridade "só por
tamanho, hash como evolução futura"; com remontagem isso vira perigoso, porque
parte fora de ordem dá um arquivo **do tamanho certo e do conteúdo errado** — o
sintoma seria o modelo gerando lixo, longe da causa.

O achado da rodada foi o teste tentando provar exatamente isso. O fixture era
`"gguf-de-mentira-".repeat(64)`, e o teste de "parte fora de ordem" passava
verde: num buffer periódico, trocar as metades devolve os mesmos bytes, então o
hash batia e o teste não testava nada. A segunda tentativa, `(i*37+11)%256`,
parecia aleatória e caiu no mesmo buraco — período 256, quatro blocos iguais em
1 KB. Só com `randomBytes` o teste começou a falhar como devia. É o mesmo erro
que o código evita, cometido no teste que existe pra pegá-lo.

Um bug real saiu daí de graça: o `saida.end()` da remontagem não era aguardado
antes do hash. Com 1 KB o flush acontece a tempo e nada aparece; com 2,5 GB o
sintoma seria "chegou corrompido" num arquivo que estava certo.

Validado com dado real, não só com teste: `gerador ia instalar --modelo
embedding --de <caminho>` copiou os 639 MB em 2s; o `fatiar-modelo.mjs` gerou
4 pacotes e o `cat parte-*/parte.bin` remontou um arquivo com o sha256
**idêntico** ao original.

Fica registrado como custo, não como resolvido: publicar ~2,5 GB fatiados no
registry público é uso incomum do npm. O Qwen3-4B é Apache-2.0, então
redistribuir é permitido — mas se o npm tratar como abuso, a saída é registry
privado, e só a lista de pacotes muda.

## 131. O time ativo sobrevive ao F5 (#280)

`timeEscolhido` e `timeAtivo` eram `useState` puro. Recarregar zerava os dois:
quem tem mais de um time caía no "Qual time?" a cada F5, inclusive no meio do
trabalho.

A metade pior do defeito era a silenciosa. Cair na tela de escolha é chato mas
visível; quem tinha **trocado** de time e recarregava voltava calado pro
primeiro da lista — e a partir dali as sugestões e os campos customizados vinham
do time errado, sem nada na tela dizendo isso.

`timeLembrado.ts` guarda em `localStorage` com duas regras que valem mais que o
armazenamento em si:

- **Chave por e-mail.** Sem isso, trocar de conta na mesma máquina herdaria o
  time da conta anterior, e o sintoma seria "por que a config está errada?".
- **Sempre validado contra `sessao.timeIds`.** Perder acesso a um time é
  justamente o caso em que uma lembrança teimosa faria estrago: a pessoa
  ficaria presa numa tela pedindo dados de um time que o servidor recusa.

`localStorage` indisponível (modo privado) falha para "não lembro", que é
exatamente o comportamento antigo — não é motivo pra derrubar o app.

Este é um defeito que **só o navegador prova**: num teste de unidade
"recarregar" não existe, o componente é remontado com as mesmas props e passa.
Por isso os dois casos viraram E2E, incluindo o silencioso (trocar de time, dar
F5, e conferir que o seletor continua no time novo).

## 132. `fetch failed` não era bloqueio — era proxy (SPEC-32)

Três palavras conduziram a investigação inteira para o lado errado. O usuário
rodou `gerador ia instalar` na máquina do trabalho e recebeu **`fetch failed`**.
A leitura fácil foi "a rede bloqueia o Hugging Face", e ela levou a construir um
caminho de distribuição por npm inteiro antes de alguém olhar o `error.cause`.

Duas coisas estavam erradas ali, e as duas eram nossas:

**1. A mensagem escondia a causa.** `fetch failed` é o texto genérico do undici;
a causa real mora em `error.cause` — `ENOTFOUND`, `ECONNREFUSED`,
`UND_ERR_CONNECT_TIMEOUT`, `CERT_HAS_EXPIRED`. São diagnósticos diferentes, com
ações diferentes, e nenhum aparecia.

**2. O download não honrava proxy.** E isto explica o sintoma mais confuso de
todos — *"o npm funciona e o download não"*: o npm lê proxy do `.npmrc`/env, o
`fetch` do Node **ignora proxy por completo**. Mesma rede, mesmo destino, um
passa e o outro não. Não era bloqueio: era o cliente HTTP não configurado.

Agora o download passa por `buscarComProxy` (HTTPS_PROXY/HTTP_PROXY/
`npm_config_*`, respeitando NO_PROXY), e `gerador ia diagnosticar` testa o
caminho de verdade e imprime Node, proxy, NO_PROXY, NODE_EXTRA_CA_CERTS e o que
voltou.

Três achados saíram da validação real, nenhum dos testes:

- **`undici` não sobrevive ao bundle.** Empacotado pelo tsup, quebra na
  primeira chamada com stack trace apontando pro `dist`. Foi pra `external`,
  como o `node-llama-cpp`.
- **Dispatcher de um undici não serve pro `fetch` de outro.** Passar o
  `ProxyAgent` do `node_modules` pro `fetch` global (que usa o undici *interno*
  do Node) estoura com `UND_ERR_INVALID_ARG — invalid onRequestStart method`.
  Tem que ser o `fetch` do mesmo undici.
- **Com proxy, `ENOTFOUND` é do proxy, não do destino.** A mensagem dizia "não
  consegui resolver huggingface.co" quando quem não resolveu era o proxy — o
  que mandaria a pessoa investigar a caixa errada.

A lição que fica: **mensagem de erro ruim custa mais que bug.** O bug era uma
linha de configuração; o diagnóstico errado custou uma SPEC, um workflow e três
rodadas.

## 133. A causa era inspeção TLS — e só um comando descobriu

O `gerador ia diagnosticar` da §132 rodou na máquina do usuário e devolveu a
resposta em uma linha:

```
O certificado de huggingface.co não foi aceito (SELF_SIGNED_CERT_IN_CHAIN).
```

Não era bloqueio de conteúdo. Não era proxy. Era **inspeção TLS corporativa**:
a rede intercepta o HTTPS e reassina com uma CA da empresa, que o Node não
conhece. E é a explicação final do sintoma que confundiu tudo — *"o npm
funciona e o download não"*: o npm usa o repositório de certificados do
Windows; o Node, por padrão, não.

A correção para o usuário é uma variável: `NODE_OPTIONS=--use-system-ca` (Node
22.15+), que manda o Node usar a CA que **já está instalada** na máquina. A
mensagem passou a oferecer isso primeiro, com `NODE_EXTRA_CA_CERTS` como
alternativa — caçar e exportar um `.pem` é onde a maioria das pessoas desiste,
e a versão do Node decide qual das duas frases faz sentido.

O que vale registrar é a economia. Antes do comando existir, três palavras
(`fetch failed`) sustentaram uma conclusão errada por três rodadas e
produziram uma SPEC de distribuição por npm, um script de fatiamento e um
workflow de CI — trabalho legítimo, que continua útil como plano B, mas que
**não era o problema**. Com o diagnóstico, a causa apareceu na primeira
tentativa.

Fica também o registro de uma discordância que não foi resolvida por
argumento: o usuário lembrava de o modelo já ter vindo embarcado no pacote, e
o histórico (`git log -S"gguf"` vazio, `files` sempre `dist`/`templates`/
`web-dist`) não sustenta isso. Insistir teria consumido rodadas e não mudaria
nada — o que destravou foi medir. Com o certificado resolvido, a pergunta
"embarcar ou não" deixou de importar.

## 134. O diagnóstico passou a medir as origens, em vez de eu supor

Decisão do usuário, reafirmada quatro vezes: *"melhor embarcar como nas
primeiras versões"*. E a razão dele não é técnica — é que pedir liberação de
domínio à infraestrutura exige uma burocracia que não se justifica para algo
ainda não validado o bastante para apresentar. Uma ferramenta que só funciona
depois de um chamado não é usável naquele contexto.

Então parei de discutir o histórico e fiz o que dá pra fazer.

**O mecanismo do modelo embarcado está pronto** (`modeloEmbarcado.ts`): se as
partes vierem como dependência do pacote, `criarProvedorLocal` remonta o GGUF
no primeiro uso — sem `ia instalar`, sem `postinstall`. O `postinstall` foi
descartado de propósito: é justamente o que a política de `--allow-scripts`
desta ferramenta trata com desconfiança, e um script automático escrevendo
2,5 GB é o tipo de coisa que ambiente corporativo bloqueia. Remontar na
primeira leitura não pede permissão nenhuma. Falta só publicar as partes, o que
depende de um token da conta npm do usuário.

**E o `gerador ia diagnosticar` passou a testar TODAS as origens candidatas.**
Numa rede corporativa "tem internet" não é resposta: o filtro libera por
categoria, e o Hugging Face cai em "file sharing" enquanto o npm passa como
"developer tools". Qual delas passa é pergunta empírica, e a máquina que
responde é a de quem usa.

A própria validação achou dois erros meus, do mesmo tipo que venho consertando
há três rodadas:

- **404 não é bloqueio.** A primeira versão marcava ✗ pra tudo que não fosse
  200 — e um 404 virava "bloqueado", quando 404 é o host RESPONDENDO, ou seja,
  a rede deixou passar. O que caracteriza bloqueio é 403/407.
- **`cdn-lfs.huggingface.co` não existe.** Testar um domínio que inventei
  produzia um ✗ que não dizia nada sobre a rede, só sobre o meu palpite.

Fica a medição que contraria o que eu tinha assumido sobre o npm: o teto é
sobre o **tarball**, e `@qvac/llm-llamacpp` tem 518 MB descompactados em 172 MB
de tarball. Mas GGUF quase não comprime — pesos quantizados, alta entropia —
então pra este caso tarball ≈ arquivo, e as partes de 190 MB seguem certas.

## 135. O modelo mudou de casa — porque a medição disse onde

O `gerador ia diagnosticar` rodou na máquina do usuário e fechou a questão:

```
✗ Hugging Face             HTTP 403 — recusado pelo filtro
✗ CDN do Hugging Face      HTTP 403 — recusado pelo filtro
✓ npm (registry)           HTTP 200
✓ GitHub (arquivo binário) HTTP 404 (host respondeu: a rede passa)
```

O filtro classifica o Hugging Face como *file sharing* e libera o GitHub como
*developer tools*. Com isso, a escolha deixou de ser opinião.

Os pesos passaram a morar num **repositório público separado**
(`silvioAL/gerador-modelos`), contendo só os `.gguf` — o código do produto
continua privado. Qwen3-4B é Apache-2.0, redistribuir sem modificação é
permitido, com atribuição.

Vão em partes porque um asset de release do GitHub vai até 2 GiB e o modelo tem
2.382 MiB. A mesma restrição de tamanho da SPEC-32, origem diferente — por isso
a conferência de SHA-256 foi reusada inteira.

**O release virou o padrão, e o Hugging Face a reserva** — não o contrário. Os
dois arquivos são byte a byte idênticos (mesmo hash, conferido nos dois
caminhos), então preferir o que passa em mais redes não custa nada. A reserva
existe pro caso oposto: rede que libera o HF e bloqueia o GitHub. Nenhuma das
duas é universal, e o código não finge que é.

Validação real, não só teste: `gerador ia instalar --modelo embedding` num HOME
temporário baixou os 639 MB do release em 313s e o SHA-256 bateu. E o hash das
partes do chat, calculado aqui na hora de fatiar, bateu com o que a CI tinha
calculado numa rodada anterior a partir do download do Hugging Face — duas
origens independentes, mesmo arquivo.

O teste que fixava "instalar chama `baixarModelo` duas vezes" foi reescrito, e
não contornado: ele descrevia o padrão antigo. Ganhou dois irmãos — um pro
`--origem huggingface` e um pra queda do release cair na reserva.

## 136. O lote truncava e o gateway sempre disse por quê (#270)

A tarefa era "descobrir POR QUE o lote volta truncado". A resposta estava na
resposta HTTP desde sempre: toda API compatível com a OpenAI manda
`finish_reason`, e `"length"` significa exatamente *"parei porque bati no teto
de `max_tokens`; o que você tem está cortado"*.

Nós líamos só o `content` e descartávamos o motivo. Então a resposta chegava
pela metade, o `JSON.parse` falhava, e o sintoma virava "truncou" — uma
palavra que não distingue teto de tokens de queda de conexão, de gateway
recusando, de modelo respondendo prosa.

Os números explicam a intermitência. `MAX_TOKENS_PADRAO = 8192`, e ninguém
passa `maxTokens` explícito no caminho do lote. Um item traz `historiaUsuario`,
`criteriosAceite`, `contrato`, `regrasTeste` e `cenarioFeature`; cinco itens
disso ficam na casa de 7–8 mil tokens **de saída**. O teto não estava folgado:
estava encostado. Um teto que "quase sempre dá" é precisamente o que produz
falha às vezes.

A instrumentação muda a AÇÃO, que é o ponto. Truncamento por teto **não se
resolve com retry** — a segunda tentativa tem o mesmo teto e corta no mesmo
lugar, gastando o tempo da pessoa duas vezes pro mesmo resultado. Por isso a
mensagem diz isso com todas as letras e aponta as duas saídas reais: lote menor
ou teto maior.

Um teste garante que gateway que **não** manda `finish_reason` continua
funcionando — wrapper corporativo caseiro costuma omitir campos, e exigir o
campo quebraria destinos que hoje funcionam.

É a mesma lição da sequência de rede desta rodada, na terceira aparição
seguida: **o sistema já estava dizendo a causa, e a gente não estava lendo.**
Primeiro foi o `error.cause` do `fetch failed`; depois o corpo HTML do 403;
agora o `finish_reason`. Nos três, o trabalho não foi descobrir nada novo — foi
parar de descartar o que já chegava.

## 137. O item que ninguém assumiu (#261)

"Item `n2::ep0` sem pips depois da esteira completa." A leitura natural é que
algum agente falhou. Não falhou: **ninguém assumiu.**

`papelDoGrupo` só aceita um papel se ele casa com os contextos/techs do item —
ou se tem `contextos: []`, que casa com tudo. E a atividade de endpoint nasce
assim, em `derivar.ts`:

```ts
const contextoHttp = cfg.techs.length > 0 ? [`${cfg.techs[0]}-chamadas http`] : [];
```

Nó sem tech preenchida → `contextos: []` e `techs: []` → o array comparado é
vazio → nenhum `.some()` casa → só papéis de contexto vazio são aplicáveis. Com
todos os agentes contextuais, ninguém pega o item, e a esteira "completa"
deixando-o intocado.

Era invisível porque o pip apagado de "não assumido" é **idêntico** ao de "nada
a escrever" — o mesmo problema que a Fase F já tinha resolvido uma vez para
outro caso, reaparecendo num nível acima.

**A medição derrubou a primeira hipótese, e vale registrar.** Eu supus que o
item tivesse zero placeholders. Não tem: mesmo sem tech há **9 fixos**
(`_historiaUsuario`, `_criteriosAceite`, os 5 de contrato, `_regrasTeste`,
`_cenarioFeature`) — medido rodando `listarPlaceholders` com `techs: []`. Os
placeholders existem; quem os zera é o gate por papel, um nível acima. Sem
medir, eu teria "corrigido" o lugar errado.

Decisão do usuário entre três saídas: **avisar sem inventar dono.** As outras
duas — deixar o papel geral assumir o órfão, ou forçar contexto http na
derivação — produziriam texto plausível e errado (um agente de mensageria
escrevendo sobre um item HTTP) ou afirmariam uma tech que ninguém declarou.
Texto plausível e errado é pior que texto nenhum, porque não se revisa o que
não parece suspeito.

## 138. Ligar o typecheck achou um bug que estava em produção (#286)

O build do CLI rodava só `tsup`, que não typecheca. O `web` sempre rodou
`tsc --noEmit` antes do build; o CLI, nunca. Foi por isso que um
`explicarRespostaRecusada is not defined` — import que eu esqueci de gravar —
passou no build e explodiu na mão do usuário.

Ligar o portão custou 62 erros de dívida. Mas o primeiro deles não era dívida:
era um **defeito em produção**.

`CredencialProvedor` (o que o modo local persiste) não tinha
`baseUrlTranscricao`, embora o campo existisse na porta (`CredencialIa`), no
provedor (`OpcoesProvedorOpenAI`) e na tela. E `criarProvedorPorId` montava o
provedor sem ele. Efeito: no `gerador open`, com Ollama no chat e Whisper na
voz, **a transcrição ia para o endereço do CHAT** — batia no Ollama, que não
transcreve, e voltava 404. Exatamente o sintoma que a mensagem de erro da
SPEC-30 descreve, escrita nesta mesma rodada sem saber que havia um caminho
interno produzindo-o.

Mesma classe do bug da migração 0015 (campo existia na UI e sumia na
persistência), do outro lado da fronteira. E a divergência de tipos era o
apontador — que ninguém via porque o typecheck não rodava.

O teste que prende isso observa **para onde o áudio vai**, não se o método
existe: `transcrever` existe de qualquer jeito, e um teste que só checasse isso
passaria igual antes e depois. Verificado revertendo a correção — sem ela, a
URL é `http://ollama:11434/v1/audio/transcriptions`.

Dois registros de método:

- **Errei feio no meio.** Um regex de substituição em massa reescreveu o corpo
  do próprio helper (`corpoDe` passou a chamar `corpoDe`), criando recursão
  infinita. Rodar a suíte logo depois de cada passo mecânico é o que pegou.
- **Trade-off declarado:** o helper de leitura de JSON nos testes tem default
  `any`. O valor deste portão é pegar erro de CÓDIGO — identificador
  inexistente, import faltando —, não tipar ~50 corpos de resposta em teste.
  Quem precisa de garantia passa o tipo na chamada.

## 139. A SPEC-28 descrevia um mundo que não existia mais (#274)

O usuário cancelou o prompt único e disse: *"acho que já temos um schema de
permissões, precisamos revisitar essa spec e ver o código"*. Perguntei se ele
queria a cobertura das rotas ou a revisão da SPEC primeiro. Resposta: **"revise
primeiro"** — e foi a decisão certa, porque a leitura do código mudou o que a
próxima rodada precisa fazer.

### O que a SPEC dizia e o que o código diz

O §3 "Estado atual" afirmava: *"O que falta, e é exatamente o pedido: **não
existe papel**"*. Falso desde a Fase 1. Existem as tabelas (`0010_acessos.sql`),
`resolverPermissoes` com os três eixos, `exigirPermissao`, a rota `/acessos`, o
modo aberto, os 16 recursos. O mecanismo está inteiro e o desenho aguentou o
encontro com o código — nada a redesenhar.

O que **não** existe é cobertura. Medido, não estimado:

```
=== chamadas a exigirPermissao por arquivo:
packages/server/src/routes/acessos.ts:1
packages/server/src/routes/camposNo.ts:1
```

**2 recursos de 16.** Os outros 14 podem ser concedidos na tabela, aparecem na
UI, são resolvidos por `resolverPermissoes` — e nenhuma rota pergunta. O papel
"Agilidade" com permissão só em `regras.checklistProcesso` continua editando
`credenciais-ia`.

O próprio código já tinha nomeado isso, no comentário da lista de recursos:
*"permissão sobre recurso que nenhuma rota checa é permissão que falha ABERTA e
em silêncio — o pior modo de falha possível numa camada de autorização"*. Foi
escrito como justificativa para a lista ser fechada; virou o diagnóstico da
implementação que veio depois.

### O achado que a revisão produziu de brinde

Ao conferir se o "papel Administrador no onboarding" da Fase 1 existia (não
existe — só nos testes, criado à mão), apareceu uma **tranca inevitável** em
produção. Criar um papel são duas chamadas:

1. `POST /acessos/papeis` — passa, modo aberto, zero papéis.
2. `POST /acessos/papeis/:id/membros` — **403**.

Porque a chamada 1 cria o primeiro papel, e `resolverPermissoes` liga o RBAC
quando existe *qualquer* papel na organização (`papeisDaOrg.length === 0`),
independente de quem o tem. Na chamada 2 o criador ainda não está atribuído:
`atribuicoes.length === 0` → `porRecurso` vazio. Nem um papel que conceda
`acessos/editar` salva, porque não dá pra atribuí-lo a ninguém. Saída: acesso ao
banco.

Isso não é dedução — foi medido contra o Postgres, com um teste descartável:

```
POST /acessos/papeis             → 201  Administrador, permissoes:[acessos/editar]
POST /acessos/papeis/:id/membros → 403  sem permissão para "editar" em "acessos"
```

Ninguém tinha visto porque os testes criam papel e atribuição na mesma função de
apoio, com `insert` direto no banco, sem passar pelo `preHandler` da segunda
rota. O teste pulava exatamente a janela onde o produto quebra. Aliás, o dano
real já está registrado neste repositório: o comentário de
`test-support/bancoDeTeste.ts` conta que a suíte deixou um papel "Administrador"
no banco de desenvolvimento e *"o banco de trabalho ficou com controle de acesso
ativo, um único papel podendo só `acessos:editar`"*. Era esta tranca acontecendo
de verdade, e foi lida na época como sujeira de teste.

E medir também derrubou a correção que eu tinha escrito primeiro. "Auto-atribuir
o primeiro papel a quem o criou" parece a solução óbvia e não é: se o primeiro
papel for "Agilidade" com só `regras.checklistProcesso`, auto-atribuí-lo entrega
exatamente esse papel — e a pessoa segue trancada fora de `acessos`. Só funciona
no caso em que o primeiro papel por acaso já concede `acessos/editar`, que é o
caso fácil. O que fecha em todos os casos é garantir `acessos/editar` a alguém
**antes** que o RBAC possa ligar.

### A lição, que é a mesma de sempre com outra roupa

Fasear "mecanismo" e "cobertura" como uma coisa só permitiu marcar a Fase 1 como
concluída com um piloto (`campos-no`) no lugar da proteção. O erro não foi parar
no piloto — é uma decisão defensável provar o desenho numa rota antes de
espalhá-lo por catorze. O erro foi **não deixar registrado que faltava o resto**,
e a SPEC então descreveu o passado como presente por várias rodadas.

Daí o teste novo que o §10.1 pede: percorrer `RECURSOS` e exigir que cada um
seja checado por pelo menos uma rota. É o mesmo padrão do
`paridade.sanity.test.ts`, que compara as rotas dos dois modos lendo o
código-fonte — a diferença entre "confio que alguém lembrou" e "o teste não
deixa esquecer". Sem ele, acrescentar um recurso ao enum é gratuito e silencioso.

### O que fica pro usuário decidir

Duas perguntas de produto, registradas na Fase 1b em vez de decididas por mim:
`quebras` (trabalho do dia a dia, já tem escopo por time — travar por papel pode
atrapalhar mais do que proteger) e `credenciais-ia` (chave de API; talvez deva
exigir permissão *mesmo em modo aberto*, quebrando a regra de propósito).

## 140. A delegação cabia em quinze rotas e num documento que não cabia (#287, #288)

O usuário disse para que serve o RBAC, e a frase reorganizou o trabalho:

> *"a ideia de avançar com as permissões é poder delegar a gestão de padrões
> técnicos configuráveis (obrigatórios ou não), e checklists de processos e
> gestão do pipeline a setores específicos da empresa"*

Isso respondeu, de um jeito que eu não tinha antecipado, as duas perguntas que
eu havia deixado em aberto na rodada anterior — e me poupou de fazê-las de novo.

### O recorte que a frase decide

**`quebras` fica fora do RBAC.** Não por ser menos importante: por ser
trabalho, não padrão. Se `quebras` exigisse permissão, no instante em que a
empresa criasse o primeiro papel para delegar um checklist, todo mundo sem
papel pararia de conseguir criar quebra. A feature de delegar configuração
derrubaria a operação. Quem quer isolar quebra já tem o escopo por time.

**`credenciais-ia` entra como qualquer outro**, sem a exceção que eu tinha
cogitado (exigir permissão mesmo em modo aberto). Uma regra que vale "menos no
caso X" é uma regra que ninguém lembra na hora de depurar.

**"Obrigatórios ou não" já existia inteiro.** Fui conferir antes de planejar
qualquer coisa: `FieldSpec.required` é editável por checkbox nas duas abas de
campos e o engine bloqueia prontidão em `obrigatoriosEmAberto`
(`prontidao.ts:64`). Não havia mecanismo a construir — só faltava quem pode
mexer.

### O obstáculo que só aparece com o propósito na mão

"Agilidade cuida do processo, Arquitetura do técnico" parecia coberto: a
SPEC-28 §4.2 já tinha quebrado `regras` em quatro recursos, justamente por
isso. Mas a persistência é **um documento só**, salvo inteiro por
`PUT /config/regras`. E um `preHandler` decide antes de ler o corpo — ele não
tem como distinguir "mexeu no processo" de "mexeu no técnico".

Ou seja: o desenho de permissões e o desenho de persistência tinham sido
feitos em rodadas diferentes, cada um coerente sozinho, e a incompatibilidade
só ficou visível quando alguém disse para que a feature servia.

A saída foi conferir por **diferença**: comparar o documento recebido com o
gravado e exigir permissão só das seções que mudaram. O efeito prático é o que
importa — a tela manda o documento COMPLETO ao salvar uma aba, e sem isso quem
cuida do processo levaria 403 por causa das seções que nem tocou.

Dois detalhes que a implementação forçou a decidir:

- **Comparação canônica com chaves ordenadas.** `JSON.stringify` puro faria o
  mesmo conteúdo em outra ordem parecer alteração — 403 numa edição que não
  aconteceu. Tem teste só para isso.
- **`tipos`/`tamanhos` exigem as quatro permissões.** São taxonomia
  compartilhada; não pertencem a nenhuma das seções e afetam todas.

### A tranca, corrigida — e a correção que eu tinha escrito errado

`POST /acessos/papeis` agora cria também o papel Administrador (com
`acessos/editar`, atribuído a quem chamou) quando é o primeiro papel da
organização. Quem liga o controle de acesso continua podendo administrá-lo; o
teste verifica também que **ninguém mais herda isso** — o RBAC vale para os
demais desde o primeiro instante.

Vale registrar que a primeira correção que escrevi na SPEC estava errada, e foi
a medição que derrubou: "auto-atribuir o primeiro papel a quem o criou" só
funciona quando esse papel por acaso concede `acessos`. Um primeiro papel
"Agilidade" tranca igual. O teste que ficou usa exatamente esse caso.

### O teste-guarda, e a prova de que ele morde

`permissoes.cobertura.test.ts` lê o código-fonte das rotas e exige que todo
recurso do enum seja exigido em algum lugar — ou esteja em `RECURSOS_SEM_ROTA`
com motivo escrito. Três estão: `quebras` (decisão acima), `retrospectivas` (a
ingestão nunca foi construída no modo hospedado) e `modelo-ia` (no hospedado a
escolha do modelo viaja junto com a credencial, que já é protegida).

A omissão continua possível; ela deixou de ser silenciosa.

E, dada a história recente deste repositório com testes que passam pelo motivo
errado, não bastava vê-lo verde: esvaziei `RECURSOS_SEM_ROTA` e confirmei que
ele falha nomeando os três. Falha.

### Um teste meu que passou testando um quinto do que dizia testar

O teste das cinco rotas recém-cobertas nasceu com dois defeitos, e os dois são
instrutivos:

1. **Media o portão errado.** Usava `time-pagamentos`, e `EMAIL_OUTRO` não é
   desse time — o 403 vinha de `exigirTime`, antes de a permissão ser
   consultada. Verde, e sem ter exercido nada do que a rodada construiu. O
   `camposNo.ts` já documentava essa armadilha; eu caí nela mesmo assim.
2. **`expect` dentro do laço.** Ao falhar na primeira rota, as outras quatro
   nunca rodaram. Um teste de cinco rotas que na prática testava uma. Agora
   coleta os cinco resultados e compara de uma vez.

O primeiro só apareceu porque o teste falhou por acidente. Se eu tivesse usado
o time certo desde o começo, ele teria passado — testando uma rota e alegando
cinco.

## 141. Quatro defeitos empilhados, e o de baixo era o log desligado (#294)

O usuário, rodando o modo hospedado com Claude Haiku: *"não apareceu nada de
modo de voz e imagem em desenhar conversando"*. Depois: *"erro foi: Não
consegui: Unexpected end of JSON input"*.

Quatro causas independentes, e a ordem em que foram descascadas importa.

### 1. Duas imagens Docker mais velhas que os recursos

`GET /ia/status` da stack dele devolvia `capacidades: null`. A tela decide o
microfone e o anexo com `s.capacidades?.transcricao` e `?.visao` — com `null`,
os dois somem. O campo existe no código desde o commit `0612992`, de 11:10; a
imagem em execução tinha sido construída às 09:36. O bundle do web também era
anterior, e por isso o erro apareceu cru em vez da mensagem amigável que o
`client.ts:606` já produz.

Nada a corrigir no repositório. Vale o registro porque **1h30 de diferença
entre imagem e commit produziu um sintoma que parecia bug de produto**.

### 2. `logger: false` — o defeito que escondia os outros

Este é o central. `app.ts` construía o Fastify com `logger: false`, o que
tornava **todo `app.log.error` do projeto um no-op**. O `catch` de
`executarPedido` fazia exatamente a coisa certa — capturava o erro do gateway e
o registrava — e a linha ia para lugar nenhum. `docker logs` mostrava só a
linha de inicialização, com a rota falhando a cada chamada.

É pior do que não ter tratamento nenhum: havia um, parecia suficiente ao ler o
código, e não produzia nada. Diagnosticar virou adivinhação.

### 3. O `200` era comprometido antes do primeiro byte

`executarPedido` chamava `reply.raw.writeHead(200, ...)` antes de pedir
qualquer coisa ao provedor. Quando o gateway falhava — inclusive com um 400 e
mensagem explícita —, não sobrava status para trocar: a resposta ia como **200
com corpo vazio**. O navegador recebia zero byte, e o `JSON.parse("")` produzia
o "Unexpected end of JSON input" que o usuário viu, que não diz nada sobre a
causa.

Agora o cabeçalho só é escrito no primeiro pedaço que chega. Antes disso, falha
vira **502 com a mensagem**; depois, o comportamento é o de antes. O caso "sem
exceção e sem um único byte" também virou 502 — antes era indistinguível de
sucesso para quem olhava só o status.

### 4. A causa real, visível só depois de 2 e 3

```
HTTP 400 response_format.json_schema.schema:
  For 'array' type, property 'maxItems' is not supported
```

O schema do diagrama declara `maxItems`, e Structured Outputs recusa o pedido
INTEIRO. Não era uma restrição ignorada: era a chamada impossível. `maxItems`,
`minItems`, `maxLength` e `minLength` passam a ser removidos do schema enviado
— o limite continua no texto do prompt, que é onde ele sempre funcionou de
fato, e o schema fica com o que a decodificação restrita sabe impor.

### 5. De brinde, um quinto: a voz que se apagava sozinha

Configurada a voz para o Whisper do compose, `resumirCredencialIa` devolvia
`visao` mas **não** `baseUrlTranscricao`. O campo existia no formulário, no zod
da rota e na coluna do banco — e não voltava. A aba carregava em branco mesmo
com valor gravado, e o "Salvar" seguinte mandava `undefined`, apagando a
configuração de voz sem ninguém pedir.

Mesma classe do #286, que perdeu o MESMO campo do outro lado da fronteira: lá
sumia na ida, aqui na volta.

### A lição, que é a de sempre com uma inversão

As rodadas anteriores fecharam com "o sistema já estava dizendo a causa e nós
descartávamos" — `error.cause`, o HTML do 403, o `finish_reason`. Aqui o
sistema **tentava** dizer e o canal estava desligado. A diferença prática é
nenhuma; a diferença de diagnóstico é enorme, porque não havia nem sintoma de
que existia uma mensagem sendo perdida.

Vale o mesmo para o comentário no código: um `catch` que loga parece
tratamento. Só é tratamento se a linha chega em algum lugar.

### Correção minha, no meio do caminho

Cheguei a afirmar ao usuário que a causa era `strict` faltando no `json_schema`
— o 400 que eu tinha na mão dizia isso. Estava errado: o produto já manda
`strict: true` (`provedorOpenAI.ts:333`) e já checa `!resposta.ok`. O 400 era do
pedido que eu mesmo escrevi à mão para testar, sem `strict`. Refeito com o
payload real, passou — e o erro verdadeiro (`maxItems`) só apareceu depois.

## 142. Três defeitos de tela, e dois eram mais largos do que pareciam (#292, #293, #294)

Rodada de ajustes pedida pelo usuário depois de voltar a usar o modo hospedado.

### O que ele viu, e o que era

**"o botão cancelar nessa tela está preto, difícil visualizar"** (com print do
painel de contexto do épico). A linha culpada é `ContextoEpicoPanel.tsx:178`:
`background: var(--painel)` e nenhum `color`. Mas a causa não é do painel — o
navegador reseta `color` de `<button>` para `buttontext` (preto) em vez de
herdar do `body`. Uma varredura por botões escuros sem `color` achou o mesmo
padrão em cerca de vinte lugares: App, LoginScreen, SemTimeScreen,
EscolherTimeScreen, AcessosTab, CamposArestaTab, NodeCard.

Por isso a correção foi uma linha em `styles.css` (`button { color:
var(--texto) }`) e não vinte edições: um `color` por arquivo deixaria os outros
dezenove esperando alguém esbarrar neles.

**"ao selecionar um componente na tela, deveria perguntar se deseja excluir"**.
Havia TRÊS portas para a mesma exclusão: a tecla Delete sobre o nó selecionado
(`Canvas.onNodesChange`), o botão do `PropertiesPanel` e o do `EdgePanel`.
Minha primeira versão pôs a confirmação no Canvas — e teria deixado as outras
duas apagando em silêncio, inclusive a que o usuário de fato usa (ele seleciona
e clica em "Excluir nó" no painel). O estado foi para o `useQuebra`, onde as
três chegam.

O diálogo diz **quantas conexões vão junto**, que é a parte que não se vê
olhando o nó selecionado.

### O bug de verdade: `fitView` só enquadra uma vez

**"após o retorno da IA... clicar em aplicar ao canvas eles não aparecem a menos
que se clique em próximo pendente (1 por 1) e ficam imóveis; se previamente
existir outros componentes eles não aparecem nem assim."**

Investiguei na ordem errada e isso valeu a pena registrar. Suspeitei de:

1. `mesclarDiagrama` perdendo nós — está correto, renumera e concatena.
2. `criarNo` ignorando as posições — a assinatura bate, a grade é calculada.
3. `proximoId` gerando id duplicado (o que quebraria o React Flow e explicaria
   "imóveis") — é `max+1` sobre os existentes, sem colisão.
4. O Canvas não re-sincronizando — ele deriva por `useMemo`, corretamente.

Nada disso. A causa é que `fitView` está passado como **prop booleana** ao
`ReactFlow`, e nessa forma ela enquadra **apenas no primeiro render**. Os nós
sempre estiveram lá, com id único e posição válida — fora da área visível. E
com nós pré-existentes fica pior por construção: `mesclarDiagrama` empilha os
novos em `max(y) + 220`, cada lote mais longe. "Próximo pendente" centraliza a
viewport num nó, e por isso eles apareciam um a um.

Quatro hipóteses erradas antes da certa, todas plausíveis lendo o código. O que
as descartou rápido foi ler a função inteira em vez de deduzir pelo sintoma —
`mesclarDiagrama` e `proximoId` levaram trinta segundos cada.

A correção é um contador explícito (`pedirEnquadramento`) incrementado só por
quem insere em LOTE: conversa, cenário e import. Não por um nó avulso da
paleta, que a pessoa acabou de posicionar — enquadrar ali faria a viewport
pular no meio do desenho.

### Efeito colateral honesto num teste

`useReactFlow` exige `ReactFlowProvider` como ancestral, e o
`Canvas.piscar.test.tsx` renderizava o `Canvas` solto. Em produção o provider
sempre esteve lá (`App.tsx`), então o teste é que montava um cenário
inexistente. Embrulhar o teste aproximou-o do app em vez de afrouxar o código.

## 143. O prompt único quebrou, e a resposta certa foi removê-lo

> *"em configurações -> prompt único (algo que deveria ser removido) consta o
> erro: Cannot read properties of undefined (reading 'map')"*

### O defeito: as duas metades falavam formas diferentes

`PromptUnicoTab` fazia `setVariaveis(r.variaveis)` e depois `variaveis.map(...)`.
Medido contra a stack do usuário, o hospedado devolvia:

```json
{"documento":{"conteudo":""},"personalizado":false,"versaoTemplate":null,
 "atualizadoEm":null,"diagnostico":{...}}
```

Sem `conteudo` no topo e **sem `variaveis`** — que vira `undefined` e derruba a
tela no `.map`. O modo local devolvia `{conteudo, variaveis}`. Mesma rota, dois
formatos.

É a terceira vez que uma divergência de FORMA entre os modos aparece como bug de
tela: o `/ia/status` no #70, o `capacidades` da §141, e agora esta. O
`paridade.sanity.test.ts` compara quais rotas existem em cada modo, e isso não
alcança o que elas devolvem. Fica anotado como buraco de teste, não como
coincidência.

### Por que remover em vez de consertar

O usuário já tinha cancelado o prompt único uma vez ("prompt único vamos
cancelar") e agora o descreveu como *"algo que deveria ser removido"*. Perguntei
antes de agir, porque consertar e remover são trabalhos materialmente
diferentes e a segunda opção apaga uma feature da tela de revisão. Ele confirmou
a remoção.

Saíram: a aba de Configurações, o painel da revisão, `gerarPromptUnico` no
engine, a chave `prompt-unico` de `CHAVES_CONFIG`, o recurso
`prompt-unico-template` do RBAC, as rotas dos dois modos e o cliente. Cinco
arquivos apagados, oito editados.

### O que ficou no lugar

Um teste que afirma que `GET /config/prompt-unico` agora é **404**. Parece
óbvio, mas o ponto é outro: linha órfã em `config_documentos` com essa chave não
pode voltar a ser lida como configuração viva só porque o caminho da rota ainda
casa. `ehChaveConfig` rejeitar é o comportamento correto, e agora está escrito.

Não apaguei as linhas do banco. Elas são inertes — nenhum código as alcança — e
uma migração destrutiva por causa de dado que ninguém lê custa mais risco do que
resolve.

## 144. A tela esconde o que seria negado — e a delegação não tinha por onde acontecer (#289)

SPEC-28 Fase 2. O RBAC já negava de verdade desde a Fase 1b; faltava a tela
parar de oferecer o que o servidor recusa.

### O achado que mudou o escopo

A aba **Regras de refinamento** estava atrás de `mostrarCamposAresta`, que
significa **modo LOCAL**. E o RBAC só existe no modo **hospedado**.

Ou seja: a tela que edita os quatro `regras.*` só aparecia onde não há
permissão, e as permissões só existem onde a tela não aparecia. O pedido que
originou a SPEC-28 inteira — *"Agilidade cuida do checklist de processo,
Arquitetura do técnico"* — **não tinha por onde ser exercido**.

Não é bug de descuido: a aba nasceu na SPEC-23 fluxo 5, quando `regras` só
existia como arquivo local. A SPEC-31 Fase 3 criou `/config/regras` no
hospedado bem depois, e ninguém revisitou o gate. Medido antes de mexer:
`GET /config/regras` no hospedado devolve 200.

Vale como padrão: **flag de modo envelhece em silêncio**. `mostrarCamposAresta`
era um nome honesto para "modo local" em 2026-06 e virou uma condição errada
para outra coisa em 2026-08, sem nenhum teste reclamar.

### As duas decisões que parecem descuido e não são

**Falha ABERTA.** Se `/permissoes/minhas` não responde, o hook libera tudo.
Esconder é conveniência; a negação real está em cada rota. Falhar fechado
esconderia funcionalidade de quem TEM permissão por causa de um soluço de
rede — pior que o pior caso de falhar aberto, que é ver um botão devolvendo
403, exatamente como era antes desta rodada.

**A aba de regras não é escondida inteira.** Ela é uma tela com QUATRO
recursos. Esconder tudo quando falta um tiraria o checklist de processo de quem
cuida só dele — destruiria a delegação em nome de aplicá-la. O filtro é por
SEÇÃO, espelhando o `secoesDeRegrasAlteradas` que o servidor usa para decidir a
mesma coisa (§140).

E a seção que ABRE é uma que a pessoa pode, não a primeira do catálogo: sem
isso a tela abriria em "Técnico", que ela não vê, e o conteúdo viria vazio sem
explicação.

## 145. O E2E tinha a mesma armadilha que já tínhamos corrigido uma vez (#290)

O gatilho foi concreto: investigando por que a IA não respondia no modo
hospedado (§141), a credencial encontrada no banco de TRABALHO do usuário era a
do gateway falso — `127.0.0.1:4123`, `modelo-de-mentira`, chave terminando em
`-e2e`. Bate campo a campo com `packages/web/e2e/gatewayFalso.ts`.

### A linha

```ts
const DATABASE_URL_TESTE = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5432/gerador";
```

Em `playwright.config.ts` e, idêntica, em `globalSetup.ts`. O padrão era o banco
de **desenvolvimento**. A suíte truncava `quebras`, `perfis_time`, `campos_no` e
`credenciais_ia` do ambiente em uso a cada rodada, e ainda deixava para trás a
credencial falsa — porque o truncate acontece no INÍCIO, e nada limpa no fim.

O incomôdo é que isto **já tinha sido corrigido**. O comentário de
`test-support/bancoDeTeste.ts` descreve exatamente esta armadilha, com o mesmo
estrago, para a suíte do vitest. A trava criada lá exige nome de banco
terminando em `_test`. Só que o Playwright nunca passou por aquele arquivo: ele
fala HTTP com a stack que estiver de pé e monta sua própria conexão para o
`globalSetup`. A defesa existia e não alcançava o segundo caminho.

### A correção, na ordem em que importa

1. **Stack dedicada** (`docker-compose.e2e.yml`): porta 5433, banco
   `gerador_e2e_test`, **sem volume**. Decisão do usuário, e é a defesa de raiz —
   o E2E não tem como sujar o que não alcança, e some a necessidade de acertar
   um teardown.
2. **A trava, reusada**. `globalSetup` agora chama `exigirBancoDescartavel`
   antes de qualquer `TRUNCATE`. Importada por caminho relativo do
   `test-support` do servidor, **não copiada**: duplicar a regra é literalmente
   o que deixou o Playwright de fora dela.

O nome `gerador_e2e_test` termina em `_test` de propósito — assim a regra
continua sendo UMA, sem um segundo conceito de "banco descartável".

### Provado, não presumido

```
$ DATABASE_URL=postgres://...:5432/gerador npx tsx (globalSetup)
RESULTADO: RECUSOU — A suíte trunca tabelas e o banco "gerador" não termina
em "_test" — recusando rodar pra não apagar dados de um ambiente em uso.
```

Apontar o E2E para o banco de trabalho agora para com uma mensagem, em vez de
apagar em silêncio.

### O padrão que se repete

Duas vezes seguidas nesta semana a mesma forma: uma defesa existe, é boa, e não
cobre o segundo caminho que faz a mesma coisa. Foi assim com a permissão em
`campos-no` mas não nas outras catorze rotas (§140), com a confirmação de
exclusão que eu quase implementei só no canvas (§142), e agora com a trava de
banco que só cobria o vitest.

A pergunta que teria evitado as três: *quantos caminhos chegam aqui?*

## 146. O preset sabia que não transcreve, e não dizia onde transcrever (#291)

Sequência do §141. Com a IA já respondendo pelo gateway da Anthropic, o usuário
testou o microfone e levou:

> Este endereço não tem transcrição de áudio (HTTP 404).

A mensagem está certa e a causa é estrutural: nenhum preset de chat-only
(Anthropic, DeepSeek) traz `baseUrlTranscricao`, então a transcrição ia para o
endereço do CHAT. E os presets estão certos em não trazer — esses provedores
realmente não transcrevem.

O que faltava é que **a própria stack tem um Whisper**, no mesmo compose, com
endereço fixo e conhecido (`whisper:9000` de dentro, `localhost:9000` de fora).
A informação existia no repositório inteiro — nos presets do Ollama, no
`docker-compose.yml` — e não chegava a quem escolhia Anthropic.

Agora `presetsDoModo` preenche a voz com o Whisper do modo quando o preset não
traz um próprio. Sugerir, não impor: o campo continua editável.

### A contrapartida, assumida em vez de escondida

Quem sobe o hospedado **sem** o profile `ia` não tem Whisper, e o valor sugerido
aponta para um host inexistente. Vale mesmo assim, e a razão é sobre qual erro
ensina mais: "conexão recusada em whisper" nomeia o passo que falta
(`docker compose --profile ia up -d`); um 404 na API de chat não explica nada.

### O teste que não é óbvio

Além de conferir que o chat-only recebe o endereço, há um que afirma que **quem
já traz o seu não é sobrescrito**. Hoje daria no mesmo por acaso — os presets do
Ollama apontam justamente para esses endereços. Quebraria no dia em que um
preset trouxesse um serviço de voz diferente, que é exatamente quando ninguém
está olhando.


## 147. "Campos por tipo de nó (0)" era vocabulário nosso, e o zero mentia (#300)

O usuário olhou a aba e disse duas coisas numa frase só: *"é muito provável que
usuário não entenda para que essa parte serve"* e *"precisamos de outro nome
para a feature e rever a UX"*. Escolheu **"Padrões por componente"** entre as
alternativas, e delimitou o escopo: **só renomear e clarear** — a massa de
teste fica para depois (#301).

Duas coisas estavam erradas, e a segunda é a que importa.

**O nome era o do código.** "Nó" é jargão do canvas; "campos" não diz o que se
ganha. O nome novo é o do próprio usuário — ele fala "componente", e quando
explicou para que serve o RBAC chamou isto de *"padrões técnicos configuráveis
(obrigatórios ou não)"*. Não inventamos vocabulário: devolvemos o dele.

**O contador mentia.** `Campos por tipo de nó (0)` lê como "não existe nada
aqui" — e o usuário leu exatamente assim, perguntando *"parece zerado, isso
está correto?"*. Estava, e não estava. Aquele número conta só o que **este
time** personalizou; os campos padrão vindos do `diagrama.json` são dezenas, e
nunca apareceram em lugar nenhum da tela. Agora o rótulo diz `Padrões por
componente (N do time)` e o texto de abertura da aba abre com o total padrão —
zero passou a significar "ainda não personalizado", que é a verdade.

A lição não é sobre copy. Um número sem denominador é uma afirmação sem sujeito,
e quem lê preenche o sujeito sozinho — quase sempre errado.

## 148. A confirmação estava certa; faltava a tecla (#302)

O usuário voltou ao #294 (excluir componente pede confirmação) e reportou:
*"tentei deletar um item selecionando o componente e clicando em deletar (...)
deveria perguntar se realmente desejo excluir e então excluir caso seja
confirmado, mas não ocorreu"*. E pediu a ordem certa: *"avalie se é questão da
versão, ou não está funcionando"*.

**Primeiro a versão, porque é barato.** O bundle servido em `localhost:8080`
continha `confirmar-exclusao` e não continha `Padrões por componente` — ou seja,
o #294 estava no ar e o #300 ainda não. Não era versão.

**Depois o defeito — e aqui eu quase errei.** Escrevi um teste vitest compondo
`Canvas` + `PropertiesPanel` de verdade: **passou**. Rodei outro com o
`ReactFlow` real sob jsdom: o diálogo chegava ao DOM. Com dois verdes na mão a
conclusão tentadora era "renderiza mas fica invisível no navegador". Era
palpite. Fui ao navegador de verdade contra a stack do usuário — e o diálogo
aparecia, visível, centralizado, com o nó intacto atrás.

O que faltava era a **outra** porta. `Delete` não fazia absolutamente nada;
`Backspace` funcionava. O padrão do React Flow é `deleteKeyCode: "Backspace"` e
só — `Delete` nunca virava um `NodeChange` do tipo `remove`, então
`onNodesChange` não tinha o que pedir. A confirmação do #294 estava correta o
tempo todo. Um `deleteKeyCode={["Delete", "Backspace"]}` resolve.

**Por que os meus testes passaram com o defeito presente.** O vitest mocka
`@xyflow/react`, e é DENTRO do React Flow que a tecla vira mudança. Um dublê
nunca ia recusar `Delete`, porque não é ele quem escuta o teclado. O teste não
estava frouxo — estava do lado errado da fronteira. Então
`e2e/excluir-componente.spec.ts` cobre as duas teclas, os dois painéis (nó e
aresta) e o cancelar, no navegador; e o caso que sobrou no vitest afirma só o
que é honesto afirmar de um dublê: qual valor o `Canvas` mandou. Removi o
`deleteKeyCode` e rodei: o E2E fica vermelho. É ele que morde.

Isto é a §145 outra vez, num terceiro disfarce: **a defesa existe, é boa, e não
cobre o segundo caminho que faz a mesma coisa.** Permissão em `campos-no` mas
não nas outras catorze rotas. Confirmação no painel mas não na tecla. A pergunta
que teria evitado as três é sempre a mesma — *quantos caminhos chegam aqui?* —
e desta vez ela tem um par: *o meu teste está do mesmo lado da fronteira que o
defeito?*

## 149. O refatoramento hexagonal não falhou — os defeitos mudaram de endereço (#295)

O usuário guardou esta pergunta há semanas, quando três defeitos de tela saíram
em sequência: *"na teoria com arquitetura hexagonal e ddd não estaríamos
passando por esses problemas, foi a intenção do refacto que fizemos há algum
tempo, anote revisar isso"*. Era a terceira da fila. Chegou a vez.

A tentação era responder pela impressão — "é, o refatoramento não pegou" ou "é,
mas foi bom mesmo assim". Contei em vez de opinar.

**Dos ~19 defeitos registrados depois que as Fases 1–4 fecharam (§126 a §148),
exatamente UM caiu no território que a SPEC-31 governa.** Nove estão na UI. Três
na borda HTTP de entrada. Três no adaptador de saída. Quatro em teste, CI ou
ambiente. E o único da persistência — o `baseUrlTranscricao` sumindo em
`ResumoCredencial` — foi corrigido **na porta**, com teste de contrato, do jeito
que o desenho previa.

Então a resposta honesta é: **a premissa está certa sobre a intenção e errada
sobre o alcance.** Hexagonal não é apólice contra defeito; é apólice contra uma
classe específica — implementação duplicada que diverge sozinha. Essa classe
praticamente parou. `openApiLocal.ts` caiu de 1.598 para 1.118 linhas; as seis
portas têm 580 linhas de contrato rodando nos dois adaptadores; a fronteira da
camada de aplicação é verificada e passa. O que sobrou de defeito é
`fitView` que só enquadra no primeiro render, `<button>` que não herda `color`,
`deleteKeyCode` que ignora `Delete`. Nenhuma porta alcança isso.

**Três buracos concretos apareceram, e nenhum é "adotar mais DDD".**

O primeiro é embaraçoso de tão simples: **`campos-aresta` ficou de fora.** É o
irmão gêmeo de `campos-no`, que tem porta, contrato e adaptador dos dois lados.
O de aresta tem 4 rotas com SQL direto no Fastify, 4 com arquivo no roteador
local, e nada no meio. Sobreviveu porque a tabela da §5 nunca o listou — a
duplicação que a SPEC existia para matar, viva por omissão de uma linha.

O segundo: **a SPEC tratou o lado dirigido e nunca o condutor.** Portas de
persistência, sim; contrato de entrada, não. Nada obriga uma rota nova a passar
por caso de uso. Foi nessa faixa que nasceram o RBAC ausente em catorze rotas e
o `writeHead(200)` comprometido antes do primeiro byte.

O terceiro é o que mais me interessa, porque é o defeito de hoje outra vez:
**`paridade.sanity.test.ts` compara nomes de rota, não formas de resposta.**
Duas rotas homônimas devolvendo corpos diferentes passam. E o
`packages/web/src/api/client.ts` — 883 linhas — é um *terceiro* adaptador HTTP
escrito à mão, cujo teste valida contra `fetch` mockado: afirma o que o cliente
faz com uma resposta imaginada, nunca com a real.

É a mesma frase de manhã, quando o vitest com `@xyflow/react` mockado passou com
a tecla `Delete` quebrada: **o teste está do lado errado da fronteira que ele diz
proteger.** Um dublê não recusa `Delete` porque não é ele quem escuta o teclado;
um `fetch` mockado não diverge do servidor porque não é ele quem responde.

A recomendação saiu curta e sem paradigma novo: a porta de campos-aresta,
paridade por forma em vez de por nome, e cobertura do lado condutor pela mesma
mecânica que já funcionou no RBAC. Agregados, eventos de domínio e CQRS
continuam fora — nenhum dos 19 defeitos foi invariante de domínio violada, e
adotar cerimônia para resolver um problema que não se manifestou é como comprar
a apólice do sinistro que não aconteceu enquanto o telhado com goteira é outro.

## 150. O prompt estava lá; o campo é que estava em branco (#296)

O usuário mandou junto com um print: *"não consigo ver o conteúdo atual dos
prompts nessa parte dedicada a edição, deveriam estar disponíveis para edição,
os locais das variáveis também parecem não aparecer"*.

São dois defeitos numa frase só, e eu quase tratei como um.

**O primeiro: o campo mentia por omissão.** A aba tinha
`value={p.preambulo ?? ""}` — vazio pra todo papel não personalizado. Só que
`preambulo` ausente na config nunca significou "sem prompt": significa
*herda*. Na hora do pedido, `preambuloDoPapel` resolve pro padrão do grupo, e
o padrão do PO tem quinze linhas cuidadosamente escritas, incluindo a regra
sobre persona que nasceu de um achado do próprio usuário. Nada disso chegava à
tela, porque `PREAMBULO_PADRAO_POR_PAPEL` era `const` de módulo. A pessoa via
uma caixa em branco chamada "Prompt do papel" e concluía, com razão, que não
havia prompt nenhum.

É a irmã gêmea da §147: um valor herdado exibido como ausência. Lá era o
contador `(0)`; aqui é o campo vazio. Nos dois casos a tela mostrou o **delta**
e chamou de **total**.

**O segundo: o preâmbulo é só a cabeça.** Tudo o mais — épico, instrução do
lote, bloco por item, contexto dos nós, o que os papéis anteriores definiram,
os campos a responder — é montado por `montarPedidoPipeline` e era invisível.
Quem configura a esteira não tinha como saber onde entra o que preenche no
canvas. Não existem `{{variáveis}}` aqui como no template de especificação; a
pergunta do usuário sobre "os locais das variáveis" era sobre algo que
genuinamente não tinha representação nenhuma.

A resposta foi `ANATOMIA_DO_PROMPT_PIPELINE`: cada parte com rótulo, origem
(*você configura* / *vem da quebra* / *fixo do produto*) e onde se mexe nela.
Mora ao lado da função que monta, não numa lista à parte na UI — e
`pedidos.anatomia.test.ts` monta um prompt de verdade e exige que todo marcador
declarado apareça nele. Mudar a montagem sem mudar a tabela quebra o build. Sem
isso, a explicação vira a próxima coisa a envelhecer em silêncio.

**Herdado continua herdado.** O texto aparece em leitura e só vira campo
editável depois de um clique explícito. Salvar uma cópia do padrão sem querer
congelaria o papel numa versão que não acompanha as melhorias do produto — e
como esses preâmbulos já foram corrigidos duas vezes por achado do usuário, é
uma armadilha com histórico.

**E o teste achou um defeito no meu próprio desenho.** Eu tinha derivado
"mostrando editor" de `preambulo` não-vazio. Parecia limpo. O caso do agente
custom falhou: `clear()` seguido de `type()` não gravava nada — porque esvaziar
o campo desmontava o editor no meio da digitação, e é exatamente o que alguém
faz pra reescrever do zero. O estado "estou editando" é do usuário, não do
texto. Virou um `Set` explícito, que só o botão de voltar ao padrão encerra.

## 151. A massa que nunca existiu, e o motor de simular sem gastar (#301, #299)

O usuário saiu deixando quatro itens pré-aprovados. Estes dois saíram.

**#301 — `campos_no` nunca teve uma linha.** A tabela nasceu vazia em 0001 e
nenhuma migração jamais inseriu nada: por isso a aba mostrava "(0)" e ele
perguntou *"parece zerado, isso está correto?"*. A 0016 semeia seis padrões que
são o caso de uso que ele mesmo descreveu ao justificar o RBAC — runbook de
plantão, classificação de dado com PCI-DSS, schema registrado, retenção LGPD,
homologação de fornecedor e SLAs por operação.

E aí a medição corrigiu o meu palpite. Semeei em `time-pagamentos`, rodei o
E2E, e **quatro specs de cenário quebraram de uma vez**: campo obrigatório
deixa o nó vermelho, vermelho bloqueia "Derivar Quebra". A seed estava certa; o
time é que estava errado. Foi para `time-portabilidade` — `time-pagamentos`
segue sendo o time de demo cujos cenários derivam do zero.

O `globalSetup` do E2E trunca `campos_no`, então reaplica a seed **lendo o
arquivo da migração**. O bloco de `perfis_time` logo acima é uma cópia à mão do
0000_init e já é a segunda versão de uma verdade só; não fiz uma terceira.

**#299 — simular a esteira.** O risco da feature inteira é a simulação virar
uma segunda versão do prompt: aí ela responde *"o que eu acho que sairia"*, que
é pior do que não existir — dá confiança sem base.

Então não há segunda versão. `montarPedidoPipeline` é a mesma função que a
borda chama, e o corpo do lote saiu de dentro do hook para `corpoDoLote()`, que
os dois caminhos usam. Um dos testes lê o FONTE do hook e recusa a montagem
manual de volta — porque o defeito que isso previne não tem sintoma: os dois
prompts só divergem, e ninguém compara.

Uma coisa a simulação não sabe: o que o modelo responderia. O encadeamento
entre papéis entra com um marcador dizendo isso, em vez de um texto plausível
inventado — que faria a pessoa dimensionar a janela de contexto por um número
falso.

Ficou o motor com testes; a tela que expõe isso na esteira não entrou nesta
rodada, e está dito no PR.

## 152. A simulação ganhou tela, e o teste de navegador achou o próprio teste (#299)

O motor tinha saído na §151 sem interface. Esta rodada fecha o item: um botão
**"👁 Simular (sem gastar IA)"** ao lado do que gasta — de propósito, porque a
pergunta *"quanto isto custa e o que exatamente vai"* se faz no momento de
decidir, não numa tela de configuração à parte.

Numa quebra de quatro itens o painel responde: **4 chamadas, 20.431
caracteres**, com o prompt de cada lote aberto e copiável. Caracteres, e dito
na tela que não são tokens — um número que parece token e não é vira decisão
errada de janela de contexto.

**O E2E achou um defeito no próprio E2E.** Escrevi `page.route("**/ia/**")` pra
provar que nenhuma chamada de IA sai durante a simulação. O teste travou antes
do login, sem explicação óbvia. O glob casava com o caminho do MÓDULO que o
Vite serve em dev — `packages/aplicacao/src/casos-de-uso/ia/pedidos.ts` — e eu
estava abortando o carregamento da própria aplicação. Trocado por um predicado
sobre `pathname.startsWith("/ia/")`, que só casa com a API.

É a terceira vez nesta sequência que o instrumento de medição é que estava
errado, não o código medido: o dublê do React Flow que não recusava `Delete`, o
`fetch` mockado que não diverge do servidor, e agora um interceptador que
derruba o app que ele deveria observar. Vale como padrão próprio: **quando o
teste falha de um jeito que não corresponde a nenhuma hipótese sobre o código,
a hipótese seguinte é sobre o teste.**

## 153. A aba em branco, a medição de E2E que a previa, e a decisão de matar um modo

Três coisas nesta rodada, e a ordem delas importa.

**A aba abriu em branco.** O usuário mandou o print: "Regras de refinamento" no
modo hospedado, botão presente, conteúdo nenhum. O gate `mostrarCamposAresta`
(que significa *modo local*) tinha saído da DECLARAÇÃO da aba na rodada do #289
e continuado no corpo dela, oitenta linhas abaixo. Dois lugares decidem se uma
aba existe, e só um foi revisado — com o comentário explicando a correção
parado ao lado da metade corrigida.

É a §145 pela quarta vez. O teste novo, por isso, não pergunta pela aba de
Regras: clica TODAS as abas oferecidas, nos dois modos, e exige conteúdo. Um
teste específico teria fechado este caso e deixado o próximo aberto — que é
literalmente o que aconteceu da primeira vez.

**A medição de E2E previa exatamente esta aba.** O usuário pediu para avaliar se
faltavam testes de navegador. Contei por aba de Configurações:

```
Perfis de time              2 specs
Modelo de IA                2
Padrões por componente      1
Membros                     1
Especificação de solução    1
Campos por tipo de conexão  0
Acessos                     0
Regras de refinamento       0   <- a que quebrou
Pipeline de IA              0   <- alterada no #296, sem cobertura
```

Quatro das nove sem nenhum E2E. O defeito de hoje não foi azar: chegou ao
usuário porque nada clicava naquela aba num navegador. E "Acessos" sem
cobertura é pior — é a delegação de RBAC, o pedido que originou a SPEC-28
inteira.

**E a decisão que muda o resto:** o usuário anunciou que vai rodar **só o modo
hospedado** e excluir o local. Isso reescreve os três achados da revisão do
#295. `RepositorioDeCamposAresta` (#303) existia para unificar dois
adaptadores; com um só, ele deixa de ser sobre duplicação e passa a ser sobre
tirar SQL de dentro da rota. `paridade.sanity.test.ts` (#304) perde o objeto:
não há duas bordas para comparar. O que **sobrevive inteiro** é a metade do
#304 que trata do `client.ts` do web — 883 linhas de adaptador HTTP escrito à
mão, testado contra `fetch` mockado — e o #305.

Por isso tirei do repositório o esqueleto do #303 que tinha entrado por um
`git add -A`: nada o importava, e o que ficou foi uma quarta cópia da regra de
sobreposição sem dono. Volta quando for ligado, sob o desenho novo.

## 154. O cliente do web finalmente encontra o servidor de verdade (#308)

A revisão da SPEC-31 (§11) tinha apontado o buraco: `packages/web/src/api/client.ts`
são 883 linhas de adaptador HTTP escrito à mão, e o teste dele valida contra
`fetch` **mockado** — afirma o que o cliente faz com uma resposta imaginada,
nunca com a real. Nada no projeto comparava as duas pontas. O usuário mandou
priorizar exatamente isso, e é o único dos três achados que sobrevive à decisão
de remover o modo local.

`contratoDoClienteWeb.test.ts` sobe o servidor **de verdade** (Fastify +
Postgres + migrações) numa porta efêmera, stuba `VITE_API_URL` antes do import
(o `BASE_URL` do cliente é `const` de módulo) e importa o cliente **de verdade**
do `packages/web`. Oito casos cobrindo sessão, campos-no, os dois envelopes de
config, perfis de time, template e quebras.

Duas coisas que quase mataram o teste, e as duas são sobre honestidade do
instrumento:

**O cookie.** O cliente manda `credentials: "include"` e o `fetch` do Node não
guarda cookie — toda rota autenticada responderia 401 e o contrato cobriria só
o que não importa. Um pote de cookies de quinze linhas, **no teste**, emulando o
que o navegador faz. Nada mudou em produção para o teste passar.

**A ordem dos arquivos.** A primeira versão lia a seed da migração 0016 e
passava sozinha; na suíte inteira, quebrava — `app.test.ts` trunca `campos_no`.
Troquei por um insert próprio. Aí a escrita pelo cliente esbarrou no estado de
RBAC que o outro arquivo cria. **Um contrato que depende da ordem dos arquivos
de teste não é contrato, é acaso.** Ficou: insere pelo banco, lê pelo cliente —
porque o que se afirma é a FORMA DA RESPOSTA, e o caminho de leitura é o do
cliente.

O teste já valeu antes de ser commitado: três dos oito casos falharam com
`is not a function` e um com forma errada. `apiAuth.login` não existe (é
`entrarDev`), `apiAuth.eu` é `me`, `apiEspecificacaoTemplate.obter` é `buscar`,
e a sessão traz `timeIds`, não `times`. Eram os MEUS palpites errados, não
defeitos do produto — mas é precisamente essa a distância entre o que se supõe
e o que existe, e era ela que nada media.

## 155. A SPEC do modo único, e o número que trocou remover por depreciar (#307)

O usuário decidiu: só o modo hospedado, e o pacote sai do npm. A SPEC-33
registra isso — mas duas medições feitas antes de escrever mudaram o conteúdo
dela.

**8.576 downloads na última semana.** Eu ia executar `npm unpublish` porque
foi o que a autorização dizia. O número diz que o npm recusaria (política de
300/semana) e que, se aceitasse, quebraria quem já instalou. Levei o fato de
volta ao usuário antes de agir, com as opções; ele escolheu depreciar. Não era
re-litigar a decisão dele — era entregar um dado que ele não tinha e que
mudava qual comando executar.

**Nem o web nem o server dependem do `packages/cli`.** Isso transformou "quanto
risco tem essa remoção" de estimativa em fato: nenhum efeito cascata sobre o
produto hospedado.

E a seção que existe justamente para não ser óbvia daqui a um mês: **o modo
único reescreve a dívida hexagonal.** O #304 (paridade por forma de resposta)
perde o objeto — não haverá duas bordas para comparar. Sem isso escrito, alguém
retomaria o item construindo um teste para uma fronteira que deixou de existir.

O roteiro põe a **cobertura antes da remoção**: as quatro abas de Configurações
sem nenhum E2E se cobrem na Fase 2, e só depois se remove na Fase 3. Não é
zelo — é a lição de hoje. A aba de Regras abriu em branco em produção porque
nada a clicava num navegador; apagar um modo inteiro com quatro abas
descobertas repetiria isso em escala.

## 156. O modo local saiu, e o contrato de ontem quase virou teste instável (SPEC-33 Fase 3/4)

O usuário autorizou a remoção completa, incluindo os comandos headless. Saíram
`packages/cli` inteiro (1.118 linhas de `openApiLocal.ts`, 523 de adaptadores
em arquivo, os seis comandos), `paridade.sanity.test.ts` e o pacote dos
workspaces.

**Uma dependência real, e não era a que eu esperava.** O mapeamento mostrou onze
arquivos citando `packages/cli`; dez eram comentário em prosa. A única de código
era `gateway.pacote.test.ts`, que afirmava "o CLI declara `node-llama-cpp` de
verdade" como contraponto de "o gateway NÃO carrega binário nativo". Removi o
caso em vez de reescrevê-lo: **não sobrou quem afirmar**. O de cima passa a
valer sozinho, e é ele que protege a imagem do servidor de voltar a inchar.

**E o contrato do #308, escrito horas antes, quase virou lixo.** Na suíte
completa ele falhou — `app.test.ts` roda em paralelo e trunca `campos_no` no
meio da corrida dele. Tinha passado sozinho e passado na suíte do server; a
combinação nova é que expôs. Um teste que passa conforme o interleaving é pior
que nenhum: ensina a equipe a re-rodar até passar. Dei banco próprio a ele
(`gerador_contrato_test`). Passou local, **e a CI ficou vermelha de três jeitos
diferentes**: contagens erradas por um, `app.test.ts` vendo linhas que não eram
dele, e `duplicate key value violates unique constraint
"pg_database_datname_index"` — dois `CREATE DATABASE` concorrentes disputando o
catálogo do Postgres. Eu tinha mudado o LUGAR do problema, não a causa.

A causa é uma frase: **os testes do server compartilham um banco, e o vitest
roda arquivos em paralelo.** Enquanto `app.test.ts` era o único que escrevia, o
paralelismo era invisível. `fileParallelism: false` diz a verdade sobre esta
suíte — bancos não viram paralelizáveis por vontade. Custa segundos numa suíte
de ~8s; compra um teste que passa pelo mesmo motivo toda vez.

Vale como regra: **quando um teste novo entra num banco compartilhado, a
pergunta não é "ele passa", é "quem mais escreve aqui".**

**O README ficou com um aviso, não com uma reescrita.** Dez seções falam de
`npm install -g` e `gerador <comando>`. Reescrever isso com o resto do contexto
que eu tinha seria fazer mal a porta de entrada do projeto. Um banner no topo
diz que estão desatualizadas e aponta a SPEC-33; a reescrita virou tarefa
própria. Aviso honesto vale mais que documentação apressada — e mais que
documentação que manda instalar um pacote depreciado.

## 157. O README parou de mandar instalar o que não existe (#310)

O usuário adiou o `npm deprecate` e pediu o README primeiro. As duas coisas se
cruzam num detalhe que eu tinha errado: o banner provisório da §156 dizia que o
pacote **"está depreciado"**. Sem o comando executado, isso é falso. Trocado por
o que é verdade — as versões publicadas continuam lá, a última é a `0.1.81`, e
não haverá outras.

Documentação que descreve um estado que você pretendia atingir, e não o que
atingiu, é a mesma classe do teste que passa pelo motivo errado.

O resto foi corte: a seção "1. CLI local (recomendado)" com o `npm install -g`
e o parágrafo que vendia o CLI como caminho padrão; a tabela inteira de
"Comandos da CLI"; o bloco de instalação de GGUF na máquina (`gerador ia
instalar`, três subseções sobre rede corporativa bloqueando Hugging Face); e a
"Solução de problemas", que era **inteira** sobre instalar binário global no
Windows — `PATH`, `--allow-scripts`, Defender bloqueando binário nativo.

337 linhas viraram 240. E a Solução de problemas não ficou vazia: foi reescrita
com os três problemas que o modo hospedado de fato tem, sendo o primeiro
esquecer de `docker compose build gerador` e testar o bundle anterior — que é
literalmente o que gerou um reporte de defeito já corrigido nesta sessão.

## 158. As abas descobertas ganharam navegador, e uma delas provou o método (#306)

A medição da §153 tinha dito quais: das nove abas de Configurações, quatro sem
nenhum E2E. Sobraram três — "Campos por tipo de conexão" só existia no modo
local, que a SPEC-33 removeu.

O `ConfigScreen.test.tsx` já garante em jsdom que **nenhuma aba abre vazia**.
Estes vão além disso: afirmam que o CONTEÚDO chegou — o que depende de o
servidor responder, da rota existir e de a permissão não esconder tudo. Nenhuma
das três coisas o jsdom vê.

**E a prova de que mordem.** Reintroduzi o gate `mostrarCamposAresta` no corpo
da aba de Regras — o defeito exato que chegou ao usuário hoje de manhã. O teste
ficou vermelho e os outros dois seguiram verdes, isolando o problema na aba
certa.

Vale registrar por quê isso não é cerimônia: essa mesma verificação, feita
quatro vezes hoje (`Delete` no canvas, o `page.route` que derrubava o app, o
contrato que dependia do interleaving, e agora esta aba), mudou o que eu
entregaria em três delas. Um teste que nunca se viu falhar é uma hipótese, não
uma rede.

Fica um resíduo anotado: `modo === "local"` continua no `App.tsx`, e o servidor
nunca devolve esse valor — a aba "Campos por tipo de conexão" virou inalcançável
em vez de removida. É ramo morto, não defeito, mas é exatamente o tipo de
sobra que a SPEC-33 §8 avisou que ia aparecer.

## 159. O README dizia que o pacote estava depreciado, e não estava

O usuário decidiu não deprecar o pacote — e ao ir aplicar isso, achei um erro
meu de duas rodadas atrás.

O banner do README **ainda dizia "está depreciado"**. A substituição do PR #112
não tinha aplicado: o arquivo é CRLF, e o `.replace()` com `\n` não casou. Como
eu não tinha `assert` nenhum, falhou em silêncio — e eu relatei a correção como
feita. Confirmei conferindo só os resíduos de CLI, que era outra coisa.

Duas lições, e a segunda é a que importa:

**A primeira já estava na minha memória** ("arquivos CRLF quebram `.replace()`
com `\n`"). Reincidi. Desta vez o script tinha `assert antigo in b`, e por isso
o erro apareceu em vez de sumir. A diferença entre as duas tentativas não foi
saber da armadilha — foi a asserção.

**A segunda: eu verifiquei a coisa errada.** Depois do #112 rodei
`grep "npm install -g gerador"` e dei por bom. Nunca procurei por "depreciado",
que era justamente a afirmação nova que eu tinha acabado de escrever. Verificar
o que se removeu não é verificar o que se afirmou.

O texto agora diz o que é verdade: as versões publicadas continuam no npm, a
última é a `0.1.81`, não haverá outras. Sem promessa de deprecate, porque não
vai haver.

Saiu junto o `publicar-modelo.yml`, o último workflow que publicava alguma
coisa (os pacotes-parte do GGUF, `workflow_dispatch` manual). Com o modo local
removido, ele publicaria peças de um caminho que não existe mais. E a SPEC-33
§7 registra a reversão da Fase 1 em vez de deixá-la lá parecendo pendência —
que é o mesmo cuidado da §4 com o #304.

## 160. Dois overlays viraram um assistente no canto (#298)

O reescopo do item já dizia o essencial: *invólucro comum + gatilho, não
reescrever as conversas*. "Desenhar conversando" e "Contexto do épico" já
funcionavam — mas cada um com uma casca própria. A conversa era um painel
lateral fixo colado à direita; o contexto era um modal centrado com backdrop.
Duas portas com roupas diferentes para a mesma classe de coisa ("falar com a
ferramenta sobre a demanda"), ocupando dois botões num header que já quebra
linha.

O `AssistenteFlutuante` é exatamente as três coisas do reescopo: o botão
flutuante no canto inferior direito (✦ que vira × com rotação), a janela
ancorada acima dele, e as abas. Os painéis perderam SÓ a casca — o
posicionamento, o cabeçalho próprio, o backdrop — e passaram a preencher a
janela; nenhuma linha da lógica de conversa mudou. A lista `ABAS` é declarada
como o ponto de extensão de propósito: o #297 ("configurar conversando") nasce
como uma entrada nela, não como um terceiro botão solto — que é o motivo de o
invólucro vir antes dele na fila.

Abrir cai na conversa, a ação primária. E a razão de os dois morarem juntos
ficou testável: o contexto salvo numa aba pré-preenche a outra, atravessando o
estado real do App (`quebra.demandInfo`), não um estado interno de painel. O
teste novo de navegador afirma exatamente essa travessia — e mordeu quando
cortei o fio `contextoInicial` de propósito: vermelho na asserção certa, verde
de volta com o fio religado.

**E o instrumento errou primeiro, de novo.** Meu script de validação contra o
bundle de produção acusou "os botões antigos ainda estão no header" — com o
código certo. O seletor `page.locator("header")` casava com TODO header da
página, e a janela do assistente tem um header com abas que se chamam... "✦
Desenhar conversando" e "📎 Contexto do épico". O nome que os botões antigos
tinham. É a regra da §152 aplicada antes de abrir o código: quando o teste
falha de um jeito que não corresponde a nenhuma hipótese sobre o código, a
hipótese seguinte é sobre o teste. Desta vez custou minutos, não horas.

Um detalhe de acessibilidade que o teste unitário forçou: com a janela aberta,
o × interno e o botão flutuante teriam ambos `aria-label="Fechar assistente"`
— ambíguo pra leitor de tela e pra qualquer seletor. O botão ficou com rótulo
fixo "Assistente" + `aria-expanded`, que é o padrão correto pra um gatilho de
painel.

## 161. A SPEC do configurar conversando — e a medição que encolheu o item (#297)

O #297 é mudança global (rota nova de IA, tabela nova, recurso de RBAC saindo
de `RECURSOS_SEM_ROTA`), então SPEC antes de código. Escrever a SPEC-34 com as
medições na mão mudou o tamanho do item duas vezes — uma pra menos, uma pra
mais.

**Pra menos: a sugestão estruturada já existe no hospedado.** Eu teria jurado
que `/ia/sugerir-config` tinha morrido com o `openApiLocal.ts` da CLI — mas a
migração hexagonal levou a tabela `ALVOS_SUGESTAO_CONFIG` para
`packages/aplicacao` e a rota está viva em `routes/ia.ts` — e com SEIS alvos,
não os três da SPEC-23 §6.6: `item-processo` e `teste-automatizado` entraram
em rodadas que eu nem lembrava. Verificar o que se afirma, de novo: eu escrevi
"quatro alvos" nesta SPEC de memória e a tabela real me corrigiu.
O #297 não é "construir a sugestão de config"; é construir a CONVERSA
por cima dela: intenção → alvo → proposta → approve. O que o usuário pediu no
§83, aliás, era exatamente isso — "melhor do que aqueles botões de sugerir".

**Pra mais: as retrospectivas são do zero de verdade.** O comentário assinado
em `RECURSOS_SEM_ROTA` confirma: a ingestão do fluxo 5 nunca existiu no
hospedado. Mas a SPEC corta o RAG da v1 com a régua que a SPEC-23 §4 já tinha
usado — corpus de um time não justifica vetor; v1 nem embeddings tem, retro
entra como contexto do prompt e toda proposta nascida dela cita o trecho. A
Fase 3 registra a busca vetorial como "fora por enquanto" nomeadamente, pra
ninguém completar o RAG por zelo.

As decisões que a SPEC herda sem reabrir: a IA propõe e a rota existente
recebe (SPEC-23 §6.6), o agente não escreve (SPEC-26 Bloco 5), nada no caminho
crítico exige modelo forte (§84). E a que o #298 preparou: a conversa nasce
como terceira entrada em `ABAS`, não como overlay novo — que era o motivo de o
invólucro vir antes na fila.

## 162. A Fase 1 do configurar conversando — e o campo obrigatório que derrubou seis specs de novo (#297)

A implementação seguiu a SPEC-34 sem surpresa na mecânica: os dois passos com
schema fixo (`/ia/configurar` decide alvo e destila a instrução;
`/ia/sugerir-config` intocado materializa), a aba nova em `ABAS`, cartões com
select de destino, Aplicar chamando `criarCampoNo`/`criarCampoAresta`/
`salvarPipelineAgentes` — as funções que o formulário já usa. Dois testes
valem menção: o que trava o CONTRATO entre os passos (todo alvo que o passo 1
pode propor tem de ser aceito pelo passo 2 — se divergirem, o modelo propõe o
que a materialização recusa com 400); e o que afirma que aplicar um papel novo
preserva os quatro de fábrica, porque `papeis` ausente significa "os padrão", e
gravar só o novo apagaria a esteira inteira em silêncio.

**As surpresas foram as duas leis já registradas, cobrando de novo.**

A primeira é a §151 literal. O E2E novo aplica um campo que nasce
`required: true` (o gateway falso preenche boolean como `true`) — e campo
obrigatório deixa todo nó do tipo vermelho, vermelho desabilita "Derivar
Quebra". Seis specs caíram de uma vez, exatamente como quando a seed entrou em
`time-pagamentos`. Mesma solução: o teste conversa em `time-checkout`, que
nenhum outro spec usa.

A segunda é a da §156 ("quem mais escreve aqui"), na versão de estado global:
movido para spec próprio, o teste passou a salvar a CREDENCIAL do gateway — que
é da organização — no primeiro lote de workers, e `derivar-e-revisar` (que
afirma a revisão SEM IA) viu a esteira entrar em geração ao vivo no meio da
corrida. O invariante implícito da suíte era "credencial nasce quando
`ia-hospedada.spec.ts` roda", e o arquivo até dizia isso num comentário. O
teste foi morar lá, onde o dono do estado é o arquivo. A pergunta da §156 tem
agora uma irmã: *que estado global este teste cria, e quem corre em paralelo
com ele?*

A prova de mordida saiu como a SPEC pedia: com o fio proposta→rota cortado, o
E2E ficou vermelho na asserção exata (o campo não listado em Configurações) —
duas vezes, na suíte cheia e filtrado. 38/38 na rodada final.

Resíduo anotado: na stack de trabalho sem credencial, a conversa mostra "Não
consegui: Não foi possível responder." em vez do erro específico da rota — o
fallback genérico do cliente quando o corpo de erro não chega como JSON. É o
mesmo comportamento das outras conversas, não desta rodada; fica registrado
para uma rodada de mensagens de erro.

## 163. Retrospectivas saem de RECURSOS_SEM_ROTA — a Fase 2 do #297

O recurso `retrospectivas` esperou no enum de RBAC desde a SPEC-28, com o
motivo assinado: "a ingestão nunca foi construída no hospedado — o recurso
antecipa a feature". Esta rodada é a feature chegando: tabela, rotas com o
portão (`ler` para listar, `editar` para escrever — retro é material interno
do time, não config pública de formulário), e a linha saindo da lista de
exceções. O teste-guarda de cobertura, que exige recurso coberto ou
justificado, passou a cobrar exatamente isso sem precisar mudar.

**As retros moram na conversa, não numa tela própria.** É ali que elas são
usadas: com `timeId` no pedido, o SERVIDOR injeta as do time no prompt — lidas
do banco, não mandadas pela tela, porque a fonte de verdade do que o time
registrou é a tabela, não o estado de quem está conversando. E o prompt só
ganha a regra "proposta nascida de retro CITA o trecho" quando há retro de
verdade — prompt que promete contexto que não tem ensina o modelo a inventar.

**Os alvos de regras entraram pela forma, não pela lista.** A SPEC dizia "os
três alvos de regras na Fase 2"; a implementação corrigiu para dois —
`regra-refinamento` e `item-processo` têm exatamente a forma
`{texto, contextos}` das seções que os recebem, e o Aplicar lê o documento
inteiro, acrescenta na tech escolhida e grava tudo de volta (a UI nunca é dona
do arquivo, SPEC-23 §6.7 — e há teste que morde: salvar só a seção nova deixa
o caso de preservação vermelho). `teste-automatizado` ficou fora: o schema do
alvo não é a forma de `regras.testes`, e uma conversão inventada aplicaria
silenciosamente o objeto errado. A SPEC ganhou a correção anotada em vez de
reescrita — o "três" errado documentado vale mais que o histórico limpo.

O RBAC das seções veio de graça e certo por construção: quem decide a
permissão do PUT de regras é `secoesDeRegrasAlteradas`, sobre o diff real do
documento — a conversa que só acrescenta checklist técnico exige só
`regras.checklistTecnico`, sem uma linha nova de autorização.

Duas mordidas provadas, uma por camada: sem o `pode("editar")` no POST, o
teste do feito-quando (403 com RBAC ativo) fica vermelho; salvando só a seção
nova, o teste de preservação fica vermelho. 137 no server, 357 no web, 38/38
no navegador.

## 164. campos-aresta ganha a porta que a §5 esqueceu de listar (#303)

O item nasceu na revisão do #295 como "o irmão gêmeo de campos-no que ficou de
fora da SPEC-31 por omissão de uma linha na tabela", e foi reescopado pela
§153: com o modo local removido, não há dois adaptadores para unificar — é
tirar SQL de dentro de `routes/camposAresta.ts`. Feito exatamente na ordem que
o padrão de campos-no ensina: porta (com `camposArestaEfetivos` e a
normalização), caso de uso, adaptador Postgres — e a rota virou borda:
autentica, autoriza, audita, delega.

Duas coisas morreram junto com o SQL na rota. A **cópia inline da regra de
sobreposição** no GET — a "quarta cópia sem dono" que a §153 tinha tirado do
repositório quando o esqueleto do #303 entrou por engano num `git add -A`;
agora ela volta como a ÚNICA cópia, na porta, com dono e contrato. E o **500
para id fora do formato uuid** no PUT/DELETE: o adaptador responde ausência
(404 na borda) como o contrato manda, igual campos-no.

A suíte de contrato existe mesmo com um adaptador só — foi a ausência dela que
deixou campos-aresta invisível para a SPEC-31. Oito casos, rodando contra
Postgres de verdade, e a mordida provada no defeito histórico exato: trocando
o upsert por insert puro, "salvar a MESMA chave natural corrige, não duplica"
fica vermelho — o mesmo 500 que motivou a suíte de campos-no.

E um flake para o caderno: o teste de anexar print falhou uma vez na suíte
completa ("anexar-imagem" não visível em 5s) e passou isolado, no arquivo e na
suíte seguinte. Segunda aparição intermitente no mesmo arquivo hoje (a
primeira foi a voz) — se aparecer de novo, a rodada é sobre o /ia/status na
montagem do painel, não sobre quem estiver mexendo no código naquele dia.

## 165. Contexto vira clique, o bubble entra nas Configurações — e o flake confessa (#pedidos do usuário)

Dois pedidos na mesma mensagem, com um print: *"essa parte do contextos
separados por vírgula é de difícil configuração... nossa experiência deve ser
fácil"*, e o assistente flutuante presente na tela de Configurações, "mesmo
esquema, com bubble", abrindo direto no contexto de configuração.

**O campo de vírgula era pior do que difícil: era silencioso.** Os contextos
válidos SÃO uma lista conhecida (`appConfig.contextos`, treze valores como
"Backend-mensagens rabbitmq") — e um typo digitado nunca avisava: a regra só
nunca casava com item nenhum. O `SeletorDeContextos` troca digitação por
clique (chips + menu da lista conhecida), preserva valor legado fora da lista
como chip removível (sumir com ele em silêncio seria pior que o typo), e sem
lista nenhuma cai no input livre de antes. Entrou nos quatro pontos de
contexto: itens das duas listas de Regras, novo item, volumetria e o papel da
esteira — onde o estado de "texto cru pra vírgula não sumir a cada tecla"
morreu junto com a digitação. As "Opções" de campos select ficaram como estão:
lista livre de valores é digitação legítima.

**O bubble nas Configurações** é o `abaPrimaria`/`sobreposto` do invólucro: o
mesmo botão, elevado sobre a tela cheia (zIndex 58), abrindo direto no "⚙
Configurar" — o assistente é sensível a onde a pessoa está.

**E o flake do §164 confessou a causa — que não era a minha hipótese.** Eu
tinha apostado no `/ia/status`; a terceira ocorrência mostrou o padrão: as
três são pós-Fase-1, e `fullyParallel` roda testes DO MESMO ARQUIVO em workers
diferentes. Meu teste de configurar (e o de voz) regravam a credencial da
organização SEM visão; aterrissando entre o save do teste de anexar e o status
do painel dele, o botão de anexar some. §162 outra vez, dentro de um arquivo
só: a credencial é UMA por organização. Correção mínima: todo save de
credencial na suíte grava a mesma credencial (visão marcada) — indiferente
pra voz e configurar, essencial pro anexar.

Duas medições de percurso: num banco limpo o GET de regras devolve a forma
VAZIA e **a aba de Regras não tem como criar uma tech pela tela** — o teste
novo semeia a própria tech via API, e fica anotado como pedido de UX a fazer
(a instalação nova não tem por onde começar). E o meu instrumento errou DUAS
vezes na mesma rodada: contei as options do select antes do "Carregando
regras…" sumir e concluí "0 techs" numa stack que tem duas. A régua da §152
segue pagando o aluguel.

## 166. "Nem precisaria existir essa label" — o seletor de Tecnologia morre, e o vocabulário fica sem "retro"

Três mensagens do usuário na mesma conversa, e a terceira fechou a decisão:
*"remover referência a palavra retro"*, *"esse rótulo Tecnologia, é usado em
algo? avalie"*, e — quando eu ia responder com tooltip e filtro — *"a
impressão que tenho é que nem precisaria existir essa label... pois nós temos
padrão por componente"*.

**A avaliação primeiro, porque ele perguntou.** O eixo de tech É usado e é
estrutural: as regras vivem em `porTech[tech]`, e a tech de cada item derivado
vem do tipo do componente no diagrama. Remover o EIXO exigiria migração de
modelo (candidata a SPEC futura: regras por componente, unificando de vez com
"Padrões por componente"). Mas o argumento dele desmonta o CONTROLE: o resto
do produto fala por componente, e um seletor que a pessoa precisa operar para
ver metade das regras não paga o que custa. **Agrupamento se lê; seletor se
opera.** O select saiu; as techs aparecem empilhadas, e o cabeçalho de cada
grupo traduz o eixo para o vocabulário dele: "Mobile — vale para: App
Android, App iOS" (derivado de `nodeTypes[].techs`). Os contadores das
sub-abas passaram a somar todas as techs.

Junto foi a causa original da estranheza: o menu de contexto oferecia
"Backend-cache" numa regra Mobile — contexto de outra tech nunca casaria com
item nenhum (convenção de prefixo medida em todos os nodeTypes). O menu agora
filtra pela tech do grupo, com fallback pra lista completa quando a tech não
tem contexto próprio. Teste dedicado, mordido: sem o filtro, vermelho.

**E "retro" saiu da tela.** A seção virou "Anotações do time", com "Guardar"
e "Cole aqui o material do time" — na tela, o vocabulário é dele (§147); no
código e na API continua `retrospectivas`, o nome que o recurso de RBAC tem
desde a SPEC-28. Renomear a tabela por causa de um rótulo seria pagar
migração por cosmética.

E a memória do CRLF cobrou pedágio de novo — pela via boa: a reversão de uma
mordida via `.replace()` multi-linha não casou (âncora com `\n` num arquivo
CRLF), e desta vez o `assert` estava lá e gritou em vez de falhar em silêncio
— o defeito da mordida teria ido parar no commit. A diferença entre §159 e
hoje continua sendo a asserção, não a memória.

## 167. "Não deveria salvar, e sim alertar" — SPEC-35, e o 500 que ninguém tinha visto

O usuário pediu, com print do template de especificação: apagar variável
obrigatória não pode salvar — tem que dizer que é inválido e POR QUÊ. E que a
revisão cobrisse também os prompts do Pipeline de IA. Virou a SPEC-35, com o
princípio numa linha: **a borda recusa, a tela explica, e a regra mora numa
função só** — `problemasDoTemplate` no engine e `validarEscritaConfig` na
aplicação, importadas (nunca reimplementadas) pelos dois lados.

**As medições corrigiram o desenho duas vezes antes do código.** A primeira
versão da SPEC dizia "a rota do template aceita qualquer coisa" — errado: a
variável DESCONHECIDA já era recusada pelo caso de uso desde a SPEC-31 Fase 2
(eu tinha medido só o zod da rota — verificar o que se afirma, de novo). O que
faltava era a OBRIGATÓRIA ausente. E no meio do caminho apareceu um defeito
que ninguém tinha visto: **a rota de config nunca capturava `ConfigInvalida`**
— "regras sem `porTech`" virava 500 com o motivo morrendo no log, desde que a
validação nasceu.

As decisões de recorte: `{{itens}}` bloqueia (sem ele o documento sai sem o
corpo — não há leitura válida disso); as outras cinco variáveis AVISAM com a
consequência escrita ("sem {{contexto}}, o texto do Contexto do épico não
entra") — template enxuto é escolha legítima, mudo é que não pode. No
pipeline, o que `sanearPapeis` descartava em silêncio na escrita (papel sem
id, id duplicado, esteira apagada) virou 400 nomeando o papel e a posição; a
LEITURA continua tolerante, porque config antiga é problema pra relatar, não
pra explodir na exibição.

Os testes antigos denunciaram o portão funcionando: dois PUTs de template da
suíte usavam conteúdo sem `{{itens}}` e ficaram vermelhos — fixtures que hoje
representam gravações legitimamente inválidas, atualizadas. E o build do
server (tsup, sem typecheck) deixou passar um `ConfigInvalida` sem import que
só o teste pegou como 500 — mais um lembrete de que o verde do build não é o
verde do tsc em todo pacote.

Duas mordidas em dupla camada: obrigatórias zeradas → engine E HTTP vermelhos
no caso exato; portão do pipeline desligado → os dois 400s vermelhos. 149 no
server, 363 no web, 41/41 no navegador, e o bloqueio visto em produção com o
motivo na tela.

## 168. As anotações do time saem — construídas e removidas na mesma semana

O usuário olhou a seção e decidiu: *"eu quero remover isso, parece sequer
funcionar direito"*. A seção era a cara visível da SPEC-34 Fase 2
(retrospectivas), entregue dias antes.

A decisão de execução que importa: **remoção completa, não cosmética**. Tirar
só a tela deixaria as anotações gravadas entrando invisíveis no prompt da
conversa — material que ninguém vê influenciando propostas é pior que o
incômodo que motivou o pedido. Saíram juntos: a seção do painel, o
`apiRetrospectivas`, as rotas, a injeção no prompt (e a regra de citação que
só fazia sentido com ela), a tabela — via migração 0018 com DROP, porque
migração aplicada não se apaga, se desfaz — e o recurso `retrospectivas`
VOLTOU a `RECURSOS_SEM_ROTA`, com o motivo reescrito: construída e removida a
pedido; se voltar, que seja decisão nova, não resto de código. A SPEC-34
ganhou o bloco de reversão no lugar da Fase 2 — o mesmo cuidado da SPEC-33 §7
com a Fase 1 revertida, para ninguém "retomar a pendência" daqui a um mês.

O que a Fase 2 entregou e FICOU: os alvos de regras na conversa
(`regra-refinamento`, `item-processo`) e o RBAC por seção — nada disso
dependia das anotações.

Não diagnostiquei o "parece sequer funcionar direito" — com a decisão de
remover, a causa da má impressão perdeu o objeto. Fica só o registro honesto:
os testes todos passavam e a validação de produção também; o que quer que
tenha incomodado, os instrumentos não mediam. Feature verde que não convence
no uso é feedback tão real quanto defeito.

## 169. A demo para de vender uma CLI morta, e o refinar conversando vira bubble

Três pedidos numa mensagem: o fluxo do template de especificação constando em
E2E e na demonstração; uma revisão geral da demo (*"fala de CLI, que nem temos
mais"*); e o chat da revisão de quebra migrando do botão de header para o
mesmo bubble flutuante do resto do produto.

**A demo estava vendendo um produto que não existe.** Nove meses depois do
`npm install -g` sair do README (§157), a demonstração ainda ensinava:
a aba "Linha de comando" da jornada com tabela de cinco comandos da CLI, o
passo 11 do tour com o mesmo texto, o terminal animado que digitava
`npm install -g gerador-de-itens` na demo automática, a mensagem de erro do
`loadConfig` mandando rodar `gerador init`, e o passo 5 da jornada prometendo
"apoio de IA local". Tudo fora. O tour foi de 12 para 11 passos; os
componentes `TerminalAnimado` e `FakeTerminal` morreram sem órfãos. E o
pedido de "constar na demonstração" o template já estava atendido — o passo
"Modelo da especificação de solução" abre exatamente a aba do print; o que
faltava era o resto da demo não desmentir o produto.

**O E2E do template deixou de só bloquear.** O teste da SPEC-35 cancelava no
fim; agora salva de verdade, sai da tela, volta e confere a persistência —
restaurando o template vigente da organização no fim. E o template do teste
mantém `{{titulo}}` de propósito: o tour afirma essa variável nessa mesma aba
em outro worker, e um template global sem ela abriria a corrida da §162 pela
terceira vez. Prever a corrida antes de rodar já é o padrão pagando.

**O bubble chegou à revisão.** O botão "✦ Refinar conversando" saiu do header;
o gatilho é o mesmo bubble do #298 (zIndex acima da própria janela de
conversa, senão a janela aberta cobriria o botão que a fecha). Adaptação à
tela: a conversa é POR item — sem item selecionado, o clique seleciona o
primeiro, em vez do comportamento antigo de não abrir nada em silêncio.

Duas mordidas de uma tacada só, cada defeito no seu spec: o bubble sem a
seleção automática deixou o E2E da revisão vermelho; o salvar que não salva
deixou a persistência do template vermelha. 359 no web, 41/41 no navegador,
jornada validada em produção sem a aba de CLI.

## 170. A rodada das pendências: o grupo que nasce pela tela, o ramo morto que morre, e a aba presa que destrava

Três pendências do caderno, fechadas juntas a pedido ("vamos adiante com as
pendências").

**§165 — a instalação limpa ganhou por onde começar.** As techs canônicas do
produto que ainda não têm grupo de regras viram um clique ("Adicionar grupo de
regras: + Frontend"); tech inventada continua impossível — um grupo que nunca
casaria com item nenhum é o typo silencioso de novo. O E2E agora cria o grupo
PELA TELA em vez de semear via API — e a rodada ensinou uma lição de suíte na
prática: o restore do documento virou `finally`, porque um teste que falha no
meio deixava o grupo pra trás e a rodada SEGUINTE falhava no botão que não
existe mais. Estado sujo de run falho é a §162 no eixo do tempo.

**§158 — o ramo morto `modo === "local"` morreu de verdade.** O input de texto
livre do time saiu do header; as props `mostrarMembros`/`mostrarCamposAresta`
saíram da ConfigScreen; e a consequência boa: **a aba "Campos por tipo de
conexão" DESTRAVOU** — ela estava inalcançável atrás do gate de modo local
havia meses, com as rotas vivas no servidor desde a SPEC-31 e a porta desde o
#303. O produto tinha uma feature completa que nenhum clique alcançava.

**§162 — o erro sem corpo ganhou endereço.** Quando o servidor responde sem
JSON legível (proxy devolvendo HTML, socket caído), as conversas diziam só
"Não foi possível responder."; agora dizem o status ("HTTP 503, sem detalhe do
servidor") — não conserta o problema, mas diz onde olhar.

E o instrumento cobrou de novo, duas vezes: um python com `unicode_escape`
gravou mojibake REAL num spec (revertido via git e refeito com o Edit — a
ferramenta certa existia); e o replace multi-linha falhou em CRLF mais uma
vez, salvo pelo assert. A regra operacional que fica: em arquivo deste repo,
edição multi-linha é trabalho do Edit, não de script.

Mordida do grupo novo provada (clique sem gravar → vermelho no caso exato);
356 no web, 41/41 no navegador, e as duas telas conferidas em produção.

## 171. SPEC-36 — regras por componente: a medição que desinflou a migração

A última pendência do caderno era a candidata a SPEC da §166 (regras
organizadas por componente, unificando com "Padrões por componente"). O
desenho saiu — e a medição mudou a conclusão antes do primeiro rascunho de
código: **o modelo atual já tem as três granularidades** (tech, contexto por
prefixo, contexto exato — `contextoBate` casa "Backend-mensagens" com os dois
filhos), e uma regra de "Backend" alcança ~14 componentes de uma vez. Migrar
o arquivo para `porComponente` não adicionaria poder de expressão nenhum; só
mudaria onde a mesma informação mora, ao custo de motor, RBAC, diagnóstico e
migração de dados.

A recomendação registrada é a **Opção A — projeção por componente**: criar
regra escolhendo o COMPONENTE (que deriva tech+contexto sozinho, com o escopo
"só este / o grupo / todo Backend" em nomes legíveis) e mostrar em cada regra
os componentes que ela alcança. Custo de UI, risco baixo, vocabulário 100%
componente. A Opção B (migração com herança) fica escrita como o caminho para
uma necessidade que a projeção não cubra — e a SPEC já diz qual seria o
primeiro passo nesse dia (criar o contexto que falta, não migrar o arquivo).

Design-only de propósito: a decisão de implementar é do usuário, e agora tem
um desenho medido para decidir em cima.

## 172. SPEC-37 — o assistente aprende a perceber o momento (Fase 1)

O usuário pediu o desenho e o debate veio rápido: *"centro"*, três acréscimos
(o Derivar como CHIP de sugestão no assistente; dizer que as conversas são por
texto OU VOZ; a animação do bubble nos estágios), e *"pode seguir"*. A SPEC-37
saiu do "em debate" para implementada na Fase 1: **M1** (a esteira que o
usuário disparou terminou → o chat da revisão abre sozinho com a fala do
momento — a única conduta que abre sem clique, pela régua da §2) e **M9** (tudo
verde e nada derivado → bubble pulsando com balão e o chip "Derivar Quebra",
que executa a MESMA função do botão do header). E a voz, que existia desde a
SPEC-30 e ninguém descobria, agora está dita em todos os titles e primeiras
falas.

**A suíte cobrou o preço da proatividade — e a resposta foi declarar
pressupostos.** Com o M1 vivo, os specs de fluxo SEM IA (derivar-e-revisar,
jornada) ficaram reféns da corrida da credencial global: a esteira ligava ou
não conforme o interleaving, e o chat abrindo sozinho no meio do teste
quebrava asserções. O remédio não foi condicionar os testes (teste condicional
é fraqueza), foi cada arquivo declarar o próprio pressuposto: um `page.route`
em `/ia/status` respondendo "sem gateway" — o ambiente que aqueles fluxos
sempre assumiram. O M1 é coberto onde é determinístico, no ia-hospedada, que
possui o estado de credencial. E o chip com o MESMO rótulo do botão ("Derivar
Quebra", correto para o usuário) quebrou cinco seletores por ambiguidade — os
specs migraram para a âncora `data-tour` do header.

Um detalhe de fala que os testes pegaram: "os 1 itens foram gerados" — a
pluralização entrou junto com a correção dos asserts (`contagem-itens` em vez
de `getByText("N itens")`, que passou a casar com a própria fala do
assistente).

Duas mordidas numa tacada, cada uma no spec exato: M1 sem o abrir → vermelho
no ia-hospedada; chip sem o fio → vermelho no derivar. 358 no web, 41/41 no
navegador, e o balão do M9 conferido em produção.

## 173. SPEC-37 Fase 2 — a consistência oferecida na hora, e o ciclo fechado no balão

"Pode seguir com a fase 2" fechou M6 e M7, e a decisão 5 do debate
resolveu-se pelos dois caminhos ao mesmo tempo: **a fala do M6 JÁ nomeia os
dependentes** ("1 item depende deste (02)") **e o chip dispara** a revisão —
informar e executar sem passo extra. O chip reusa o `revisarOsDemais` que
existia desde a SPEC-27; a pergunta fala uma vez por conversa (eco não é
condução); e um detalhe de React que o desenho da conversa já tinha ensinado
(§ do "cartão congelado"): o chip é RENDERIZADO a cada render, não guardado na
mensagem — um ReactNode congelado no aceite levaria o closure daquele momento,
sem as mudanças aceitas depois.

**O M7 me corrigiu antes de nascer.** O teste que escrevi esperava o balão
"Tudo refinado" logo que a esteira terminasse — vermelho: `statusDoItem` só
diz "refinado" com as respostas CONFIRMADAS pelo humano; sugestão de esteira
não confirmada é "revisar". O produto estava certo e o teste assumiu errado —
o balão de fechar o ciclo só aparece quando a pessoa de fato revisou, que é o
sentido de "tudo refinado". O E2E agora confirma campo a campo, como a pessoa
faria, e só então o chip baixa a especificação (o MESMO handler do botão).

E o flake da voz reapareceu numa terceira variante (o `getUserMedia` do
microfone FALSO também paga latência sob 6 workers) — passa isolado, sempre.
Desta vez a correção foi proporcional: 15s na asserção do gravando, e ponto.

Duas mordidas nos testes exatos (a pergunta do M6 desligada → unit vermelho;
a condição do M7 zerada → E2E vermelho). 360 no web, 41/41 no navegador.

## 174. Cinco achados de uso real: o batch sobreposto, a timeline com pontas, o botão que explica, o bubble que sai do caminho e o nome antes de derivar

Uma sessão de uso de verdade rendeu cinco itens, do pixel ao fluxo:

1. **"Essa batch está com letra repetida"** — não era letra repetida: o TIPO
   ("SERVIÇO DE BATCH (SPRING BATCH)") corria por baixo do badge de contagem
   no diagrama compacto e o número parecia um caractere duplicado. A linha do
   tipo agora trunca com reticências num teto que encolhe quando o badge
   existe e quando há a marca EXISTENTE.
2. **A timeline da revisão ganhou pontas**: o primeiro card marca o início
   (▸), o último o fim (⚑), e com um item só as duas moram no mesmo card —
   classes `review-item-rail-inicio/-fim/-unico` sobre o rail que já existia.
3. **"Revisar os demais... quando eu clico nada aparece"** — o motivo morava
   só no `title`, que ninguém pausa pra ler. O botão agora PARECE desabilitado
   (opacidade, cursor) e a dica ficou visível ao lado: "aceite uma alteração
   primeiro — é ela que se propaga aos demais".
4. **O bubble virou arrastável** (`useArrastavel`): pointer events com captura,
   posição persistida em localStorage, limitada à viewport, e um arrasto de
   verdade (>6px) suprime o clique do soltar — sem isso todo arrasto abriria o
   assistente. A MESMA chave de storage nas duas telas (canvas e revisão),
   porque o bubble é um só conceito. Janela e balão continuam ancorados: é o
   gatilho que sai do caminho, não a conversa.
5. **O nome da demanda antes de derivar, e o auto-save depois** — derivar é o
   momento do compromisso: sem título, o balão do assistente pergunta o nome
   (input no próprio balão, novidade na anatomia do `balao`), com "Derivar e
   salvar" e "Derivar sem salvar" — porque rascunho não é obrigado a virar
   registro. O auto-save espera o RENDER com o título aplicado (setState é
   assíncrono; salvar no mesmo tick gravaria "sem-titulo"). O tour e a demo
   derivam direto, sem pergunta — demonstração não é demanda.

Cinco mordidas provadas (truncamento desligado, classes do rail removidas,
dica escondida, supressão de clique removida, trim/disabled do confirmar
desligados) — cada uma deixou vermelho exatamente o teste que a vigia.

## 175. SPEC-38 — a falha de abstração: time não é stack, membro não é admin, owner não tem corpo

O usuário olhou a aba "Perfis de time" e viu o modelo errado por três
ângulos de uma vez: **a stack é arquétipo e aberta** (time começa com
tecnologia A ou B quando quiser — e os owners dos papéis nem configuram por
stack, configuram por componente, como a SPEC-36 já tinha medido); **time é
grupo de usuários com níveis** (visualizar · operar · administrar as
configs), não um blob onde todo membro é admin implícito; e **participação
cross é comum** — o que o modelo já aceita, mas sem nível por vínculo.

A investigação confirmou as três no código: `perfis_time` pendura a escolha
técnica na identidade do time; `usuario_time` não tem coluna de nível e o
próprio comentário da tabela assume que "qualquer membro administra";
`usuario_papel` só aceita e-mail — o time de arquitetura não existe como
portador de papel, teria que receber permissão pessoa a pessoa.

Debate curto fechou quatro decisões: curadoria do catálogo é configurável
pelo admin via papel (D1); administrar ≠ operar — administrar é lidar com as
configs (D2); editar configuração exige owner ou permissão dada por owner
(D3); os perfis existentes podem ser zerados, sem migração de dados (D4).

A SPEC-38 desenha o alvo em três fases: níveis com teto no convite (quem
convida não escala privilégio — e os membros atuais viram owner, porque é o
poder que já têm de fato); stack vira catálogo de perfis nomeados que o time
APONTA (trocar de tecnologia é trocar ponteiro), com curadoria reusando o
RBAC da SPEC-28 (recurso novo `perfis-stack`, aberto até alguém ligar);
e `time_papel` — papéis portados por time, herdados pelos owners, que
entram e saem da permissão junto com a composição do time. Spec apenas;
implementação espera o aval, fase a fase.

## 176. SPEC-38 Fase 1 — visualizar · operar · owner, e a escrita ganhou dois eixos

"Pode seguir" — e a Fase 1 (níveis) entrou inteira. A migração 0019 dá a
`usuario_time` a coluna `nivel` (default `operar` — insert esquecido nunca
nasce com poder de configuração) e promove os membros EXISTENTES a `owner`,
que é o poder que já tinham de fato; rebaixar vira decisão humana, não
efeito colateral de migração.

O coração da fase é a mudança de semântica do `exigirPermissao` (e do
`primeiroRecursoNegado`, o caminho por-diferença das regras): escrita agora
tem DOIS eixos — **owner do escopo sempre pode** (D3: configuração é ato de
owner) e **quem não é owner precisa de grant RBAC explícito**. A falha-aberta
da SPEC-28 §4.3 continua valendo só no eixo RBAC; o eixo de nível é sempre
exigido. Isso inverteu cinco testes da SPEC-28 — os seeds, agora owners,
passavam onde o teste esperava 403 — e a adaptação foi rebaixá-los a
`operar` no próprio teste, porque o que aqueles testes medem é a DELEGAÇÃO,
não o poder de owner.

O resto seguiu o desenho: convite com teto (403, não clamp silencioso — um
convite rebaixado em silêncio surpreenderia os dois lados), aceite entrando
com o nível do convite, rota nova de mudar nível com a proteção do último
owner (400: a requisição é legítima, o estado que ela produziria é que é
inválido), escrita de quebra exigindo `operar` (quebra sem time usa o MAIOR
nível — quem é visualizar em tudo não opera em lugar nenhum), e o
`/permissoes/minhas` carregando o nível pro `usePermissoes` esconder o
Salvar de quem é `visualizar` (esconder é conveniência; o 403 mora na rota).

Seis mordidas provadas (teto desligado, gate de quebras rebaixado, owner-gate
removido do exigirPermissao, eixo de nível removido das regras, convite
ignorando o nível da UI, hook devolvendo nivel null) — cada uma acendeu
exatamente o teste que a vigia.

## 177. SPEC-38 Fase 2 — a stack solta do time: catálogo, ponteiro e curadoria

A tese da fase coube numa frase do teste: **trocar de tecnologia é trocar o
ponteiro**. `perfis_time` morreu (D4, sem migração de dados — migração 0020)
e nasceram `perfis_stack` (o catálogo nomeado da organização) e
`times.perfil_stack_id` (o ponteiro). O truque que conteve o raio da mudança:
a projeção `PerfisDeTimes` que as sugestões da web sempre consumiram
sobreviveu com o MESMO contrato — `GET /perfis-time` continua devolvendo
`Record<timeId, perfil>` — só que agora derivada (time → perfil apontado →
valores). PropertiesPanel, ConversaPanel e o motor de sugestões não mudaram
uma linha; o hexágono pagou a promessa: trocou-se a porta+adaptador
(`repositorioDePerfisStack`) e a borda ficou.

A captura ("salvar estes valores como padrão do time") também manteve rota e
um-clique: grava no perfil apontado, e sem ponteiro cria "stack de {time}" e
aponta — a segunda captura mescla, não duplica (teste conta os perfis).

A curadoria (D1) é a parte fina: `exigirEdicaoCurada` é a EXCEÇÃO deliberada
ao owner-bypass da Fase 1. Sem papel nenhum com `perfis-stack`, o catálogo é
aberto a owners; o admin liga a curadoria criando um papel com o recurso — e
a partir daí só o grant edita, inclusive por cima de owners (o teste faz o
owner levar 403 com a curadoria ligada, e o curador passar). Apontar o
próprio ponteiro nunca entra na curadoria: é ato de owner do time.

Mordidas: curadoria ignorada (owner criando com papel curador vivo →
vermelho), ponteiro sem efeito (projeção não segue → vermelho), aba sem
avisar o App (projeção velha na tela → vermelho).

## 178. SPEC-38 Fase 3 — o papel ganhou corpo: time_papel e a herança dos owners

A última perna do desenho: `time_papel` permite atribuir um papel de acesso
a um TIME, e os membros de nível owner o herdam com escopo organizacional —
entrar, sair ou mudar de nível atualiza a permissão sozinho, que é o que a
atribuição e-mail a e-mail nunca conseguiu.

O detalhe que fez o teste-âncora valer: com o owner-bypass da Fase 1, a
herança seria decorativa nas configs comuns (owner já pode). Onde ela tem
valor REAL é (a) na curadoria, que barra até owners, e (b) em escopo de time
alheio. O teste usa (a): papel Curadoria portado pelo time — o owner do time
portador cria perfil no catálogo com curadoria ligada; o operar do mesmo
time não herda; o owner de fora continua barrado; e o rebaixado perde a
herança na hora. Um truncate esquecido mordeu antes do teste: `time_papel`
referencia `papeis_acesso` e o truncate global quebrou em 87 testes até a
tabela entrar na lista — o tipo de vermelho em massa que aponta a causa
certa de uma vez.

Mordida da fase: herança removida da união do `resolverPermissoes` → o
teste-âncora vermelho. AcessosTab ganhou "times que portam este papel" com
atribuir/remover, coberto por unit.

## 179. SPEC-36 Opção A — criar regra falando componente, e o defeito que o E2E desenterrou

A projeção aprovada na §171 virou código: "adicionar regra para
[Fila Rabbit ▾] valendo para [só Fila Rabbit ▾]" — o select é de
COMPONENTES, e `escoposDoComponente` deriva tech + contexto sozinho (exato,
família por prefixo quando alarga de verdade, tech inteira), com a prévia
"alcança: …" dizendo ANTES de salvar quais componentes a regra atinge — a
defesa contra o defeito silencioso medido na SPEC, a regra que nunca casa
com item nenhum. O documento continua `porTech`: motor, RBAC por diferença e
diagnóstico intactos, exatamente como a Opção A prometia.

**O E2E do "feito quando" desenterrou um defeito real que nenhum teste
via**: a regra criada pela aba nunca chegava na ficha do item, porque o
`carregarConfig` lia `/config/regras.json` ESTÁTICO (o arquivo do bundle)
enquanto a RegrasTab gravava no documento do banco (`/config/regras`). Dois
donos para a mesma verdade, cada tela olhando um. O conserto: a revisão
passou a ler o documento editável, com o estático de fallback — e o spec
prova o ciclo inteiro (criar pela linguagem do componente → derivar uma
Fila Rabbit → a pergunta na ficha).

Mordida no mapeamento (contexto exato trocado por vazio → unit E teste de UI
vermelhos, cada um na sua camada).

## 180. SPEC-37 Fase 3 — o mapa de momentos completo, e a prioridade que virou módulo

M2 (canvas vazio convida pra conversa), M3 (proposta aplicada → "agora é
preencher os campos"), M4 (revisão sem credencial de IA, com chip pra aba
Modelo de IA), M5 (derivou sem Contexto do épico) e M8 (Configurações numa
instalação sem padrões do time). A decisão de QUAL momento fala agora mora
em `assistente/momentos.ts`, pura — porque a prioridade é exatamente onde um
bug seria silencioso: dois balões brigando, ou o mais bloqueante perdendo a
vez. M4 > M5 > M7 na revisão; M9 > M3 > M2 no canvas; esteira rodando ou
chat aberto silenciam tudo (quem fala é o trabalho).

O detalhe fino foi o M5: como aviso permanente, ele BLOQUEARIA o M7 pra
sempre em quebra sem contexto (o teste do M7 da Fase 2 teria quebrado). A
regra que resolve: M5 só com a revisão intocada — é um aviso de CHEGADA;
quando o trabalho começa, o momento dele passou.

E a suíte E2E pagou um flake de fundação que valeu registrar: os specs de
níveis criavam um time NOVO por rodada na mesma stack, e a lista da
EscolherTimeScreen cresceu até empurrar o time do seed pra fora do viewport
— três specs vermelhos por timeout de clique. Times de teste viraram fixos e
idempotentes (409 = já criado, segue).

Mordida da fase: prioridade M4/M5 invertida no módulo → o unit da prioridade
E o teste de UI do M4 vermelhos, cada camada acusando o mesmo defeito.

## 181. O campo Título morreu — o nome da demanda é conversa, não formulário

O input "Título (obrigatório pra salvar)" saiu do header. O nome da demanda
agora é mapeado SÓ pelo agente: a pergunta do balão (M10, §174) ganhou
INTENÇÃO — "derivar" (o fluxo que já existia, com auto-save) e "salvar" (o
botão Salvar sem título deixa de travar em cinza: pergunta o nome, aplica no
tick de render seguinte e grava). No header, o título virou texto de
leitura; o botão Salvar nunca mais nasce desabilitado.

O E2E novo prova o caminho do salvar de ponta a ponta — inclusive que a
intenção NÃO vaza (salvar não deriva: a revisão não abre). A mordida foi
exatamente essa: intenção ignorada (confirmar sempre derivando) → spec
vermelho. Os specs que digitavam o título migraram pra responder o balão,
que é como o produto funciona agora.

## 182. Tour e demo aprendem as autorizações

O tour guiado (e a demo automática, que usa a mesma lista de passos) ganhou
o passo "Níveis e acessos": abre a aba Membros e explica os três níveis, o
teto do convite e os papéis portados por time da SPEC-38. O passo "Perfis de
stack" teve o texto reescrito pro vocabulário novo (catálogo + ponteiro, não
mais "stack do time"). O E2E do tour passou a contar 12 passos e a asserir a
aba Membros aberta no passo novo.
## 183. SPEC-39 — o PDCA das configurações: a ferramenta pergunta o que ela mesma deveria perguntar

A rodada que fecha o lote pré-autorizado. A ideia do usuário: a configuração
(checklists, regras, campos) não é um artefato parado — é um ciclo, e o
agente é quem gira a manivela. A cada N usos (config do admin, default 5), o
balão pergunta no retorno ao canvas: "sentiu falta — ou sobra — de algum
item de checklist, regra ou campo?", citando as últimas quebras do TIME como
âncora de memória (M11). Owner responde abrindo a conversa de configuração;
quem não pode editar descreve o ajuste ali mesmo e o pedido vira
SOLICITAÇÃO.

A solicitação carrega a **versão-alvo** (`config_documentos.atualizadoEm` do
recurso no momento do pedido) — porque entre pedido e decisão a config pode
mudar, e a validade é checada NA decisão: aprovar por cima de um documento
que já é outro invalida o pedido (409, estado `invalida`, motivo no corpo).
Quem decide é quem tem a permissão do RECURSO pedido (os dois eixos da
SPEC-38), pela seção nova da aba Acessos.

O fim do fluxo também virou conversa: o botão "Gerar especificação de
solução" morreu — a geração sai pelo agente (M7 quando tudo refinado, M12
como porta nos demais casos), e a cada N gerações (default 3) o balão M13
coleta feedback livre ("o que faltou ou sobrou?") direto pro `pdca_feedback`.

Mordidas: validade desligada → teste da aprovação tardia vermelho; e a
cadência tinha um erro ARITMÉTICO meu no teste (6 % 2 = 0, não ≠) que o
próprio vermelho corrigiu antes de virar código errado. E2E do ciclo inteiro
com cadência 1: derivar → gerar pelo agente → feedback 201 → entrevista no
canvas. Fase 2 anotada na SPEC: a solicitação nascer do 403 do
ConfigurarPanel e a aplicação automática do aprovado.

## 184. A especificação vira registro: salva na quebra, e a demanda reaberta se reconhece

Dois pedidos do uso real. O pequeno: o "SKU" dos cenários de demo (mongo e
grpc) era SKU de estoque mesmo — virou `codigo`, vocabulário neutro.

O grande: **gerar a especificação é publicar uma versão, não só baixar um
arquivo**. O markdown gerado (com TODO o material do momento — inclusive as
respostas confirmadas, que o teste prova presentes no documento) agora sobe
pro App e fica salvo NA QUEBRA (`quebras.especificacao` +
`especificacao_gerada_em`, migração 0024). No caminho, dois vazamentos
reais: `normalizarDadosQuebra` descartava o campo novo (a MESMA armadilha da
SPEC-31, agora na porta — mordida provada), e o `abrirPorId` só devolvia
título/time/diagrama: as respostas da esteira, o contexto e os anexos se
PERDIAM ao reabrir qualquer demanda. Reabrir agora devolve o material
inteiro.

E o agente reconhece a demanda já especificada: no canvas, o M14 ("esta
demanda já tem a especificação completa — quer abrir a revisão?") ganha até
do M9; na revisão, o chat abre sozinho com a MESMA mecânica do M1 e a fala
adaptada ("…revise; se algo mudar, eu aplico, reviso a consistência e gero a
especificação de novo"). O detalhe fino veio do E2E: a fala é para quem
REABRE — congelada na chegada, senão gerar a especificação durante a sessão
reabria o chat por cima do que a pessoa estava fazendo (o clique de "Voltar
ao canvas" ficou interceptado até o teste denunciar).

## 185. A terceira janela sem microfone

Achado de uso real com print: a conversa de Configurações prometia "por
texto ou por voz (🎤)" na fala inicial — e o botão de falar não existia. O
comentário do próprio `useVozNaEntrada` (SPEC-30) descreve a armadilha:
"existem DUAS janelas de conversa; plugar o botão só na primeira teria
entregado a feature no lugar que ninguém pediu". O ConfigurarPanel é a
TERCEIRA janela, nascida depois do hook — e repetiu a armadilha que o hook
existia para evitar.

O conserto são as três linhas que o hook prometia: `useVozNaEntrada` +
`BotaoFalar` no rodapé, mesma regra de capacidade (`/ia/status` diz se o
provedor transcreve; sem transcrição, sem botão). Testes no padrão do
`JanelaConversa.voz.test` — aparece quando transcreve, some quando não —
com mordida provada (botão desligado → vermelho).

## 186. SPEC-40 — a navegação repensada: do contêiner de abas ao menu com telas de verdade

O pedido começou como "as transições entre as tabs parecem cruas — e o que
deveria aparecer pra cada perfil?", e a primeira análise (indicador
deslizante, fade, agrupamento) morreu com razão: superficial. A pergunta
certa, feita pelo usuário, era estrutural — "não valeria um menu hambúrguer
na tela anterior e telas específicas?".

A avaliação de UX confirmou com três medições no código: o header do canvas
tem a hierarquia de frequência INVERTIDA (paleta de 12 tipos disputando
espaço com tour e configurações — quebra em duas linhas nos prints reais);
Configurações não é um lugar, é um contêiner de 10 formulários trocados por
useState num app SEM ROTA nenhuma (F5 volta pro canvas, condutores navegam
por prop drilling); e o perfil não participa da exibição (operar vê dez
formulários que devolvem 403).

A SPEC-40 fecha o desenho: header enxuto (só o trabalho), drawer ☰ com
grupos por intenção FILTRADOS por nível+RBAC (o menu é a lista do que esta
pessoa pode fazer — cadeado com "pedir ajuste" do PDCA nos padrões, Acessos
some de quem não pode), e cada área vira TELA específica com rota hash,
reusando os componentes de aba atuais como corpo. O valor não está no
ícone: está nas telas com rota — F5 mantém o lugar, M4/M8/tour navegam por
link, e a "transição crua" desaparece porque troca de página substitui swap
de formulário. Spec apenas; implementação em 3 fases aguarda o aval.

## 187. SPEC-40 Fase 1 — o app ganhou endereços: menu ☰, rotas hash e o fim da régua de abas

A estrutura inteira de navegação mudou de uma vez, como a SPEC desenhou:
o header do canvas ficou só com o TRABALHO (☰ Menu · paleta · prontidão ·
Salvar · Derivar), e tudo que é administração foi pro menu lateral, agrupado
por intenção (Demanda / Padrões do time / Pessoas & acesso / IA, com o
rodapé de time e sessão). Cada área de configuração virou TELA específica
com rota hash (`#/config/membros`, `#/config/regras`…) — a ConfigScreen
perdeu a régua de abas e o estado interno; a área vem da rota, o corpo reusa
os componentes de aba que já existiam, e o título da tela diz onde se está.
F5 mantém o lugar; M4/M8/tour navegam pelo mesmo caminho; a cadência do
PDCA ganhou a tela que faltava (era só API).

A migração dos E2E pagou dividendos de design: o padrão antigo
("⚙ Configurações" → clicar a aba) virou ("☰ Menu" → clicar o item de MESMO
nome) — uma linha por spec. E os vermelhos do caminho ensinaram coisas
reais: `aria-label` sobrescreve o texto visível no nome acessível (o "☰
Menu" sumia dos seletores); dois ☰ no DOM com a tela aberta viram
strict-violation (o do canvas agora se esconde); o `reload` MANTER a tela
pela rota quebrou um spec que contava com o comportamento antigo — que é
exatamente o valor da mudança; e a modal da jornada reabria a cada troca de
time num spec sem o `jornada-vista` (o backdrop interceptava o mundo).

Mordida da fase: resolução de rota quebrada (hash desconhecido deixando de
cair no canvas) → teste vermelho. 413 unit; 47/47 E2E.

## 188. SPEC-41 — o documento parou de mentir, e os itens nasceram dentro da ferramenta

Dois movimentos numa rodada só, pré-aprovada. Primeiro o defeito de
fidelidade: o markdown da especificação descartava as sugestões da esteira
não confirmadas ("(sem história definida)" com a história ali do lado) e
imprimia "✍️ especificar" junto de respostas presentes. A causa era uma
função só servindo dois papéis: `respostaVisivel` é o gate de PRONTIDÃO
(manual/confirmado) e estava também decidindo o RENDER. Nasceu
`respostaParaDocumento`: confirmada sai limpa, sugerida sai com a marca
"_(sugerido pela esteira — confirmar)_", e o marcador de especificar só
aparece em campo realmente vazio. Seis testes do engine asseravam o
comportamento antigo — atualizados de propósito, com mordida no gate.

Depois a evolução: "Gerar itens de trabalho" nos balões M7/M12 materializa
cada atividade como item persistido (`itens_gerados`, migração 0025) com o
MESMO corpo que o documento renderiza — `gerarItensDeTrabalho` reusa
`renderizarItemEspecificacao`, nunca uma segunda renderização — e contagens
de completude (quantos ✍️ restam, quantas sugestões aguardam confirmação).
Gerar é REGERAR: o conjunto da quebra é substituído atomicamente, e a
`chave` estável preserva o rastro de exportação. A tela `#/itens` (rota no
padrão SPEC-40, item "Itens de trabalho" no menu ☰) mostra a régua do
conjunto ("N de M prontos pra exportar", com barra), cards com
tipo/tamanho/dependências e o corpo expansível, e um vazio que explica de
onde os itens nascem. A porta `ExportadorDeItens` nasceu junto, com o
contrato da Fase 2 (adaptador MCP → Jira/tracker) — falha parcial é
resposta por item, não exceção.

Aprendizados da rodada: a FK nova quebrou os `truncate table quebras` sem
CASCADE dos testes vizinhos (o contrato compartilhado pegou na hora); e o
"agora não" dos balões tem `aria-label="Dispensar sugestão"` — de novo o
nome acessível sobrescrevendo o texto visível num seletor de E2E. Mordidas:
gate do render (3 testes da marca), preservação do exportado no adaptador,
régua de completude da tela. 193 engine + 164 server + 419 web; 49/49 E2E.

## 189. SPEC-42 — time não é stack: a tela virou catálogo-primeiro

Achado do usuário, com print: "time não é a mesma coisa que stack, e aqui
está meio misturado". O MODELO estava certo desde a SPEC-38 F2 (stack é
perfil nomeado num catálogo; o time aponta), mas a UI ficou no paradigma
anterior: o menu rotulava o seletor de time como "Time (stack conhecida)",
e a tela de perfis renderizava cards POR TIME projetando o perfil apontado
— dois times compartilhando perfil viravam cards idênticos duplicados, e o
"editar" num card de time gravava no perfil compartilhado mudando a stack
dos outros em silêncio.

A revisão foi toda de frontend (o server já expunha tudo, até a rota
`PUT /perfis-stack/:id/valores` que o client nem usava): a
`demo/PerfisTimeTab` morreu e nasceu a `config/PerfisStackTab` —
cards por PERFIL, cada um uma vez, com o badge "usado por: time-a, time-b"
tornando o compartilhamento visível; editar/adicionar valor age no perfil
(select de perfil, sem campo "Time") e o formulário avisa o alcance ("vale
para os 2 times que apontam..."); o vínculo do time é uma seção própria e
pequena ("Stack do time ativo"). No menu, o rótulo virou só "Time", com a
stack como linha informativa derivada do ponteiro ("stack: Java + Spring
Boot" / "sem perfil apontado").

Mordida: reintroduzir o defeito antigo (definirValores recebendo o TIME em
vez do perfil) deixou vermelho exatamente o teste "editar age no PERFIL".
Quatro E2E asseravam a UI antiga e mudaram de propósito — o de "declarar
Java" agora percorre o fluxo novo inteiro: criar perfil no catálogo →
apontar o time → valor no perfil → sugestão no nó novo. 418 web unit;
49/49 E2E.

## 190. SPEC-43 — stacks conhecidas: catálogo global por componente, sem vínculo por time

A continuação natural do §189, guiada pelo usuário em dois passos: primeiro
"aparece Java + Spring Boot e tem outras coisas" — o perfil era um pacote
heterogêneo (Serviço + Camunda + FICO) com nome que mente; depois "isso se
é que faz sentido representar por time, poderia simplesmente ter tudo".
Decisão travada com AskUserQuestion: ter tudo, sem vínculo por time.

O modelo novo: `stacks` {tipo_no, nome} + `stack_valores` — "Java + Spring
Boot" é uma stack DO Serviço, "Camunda 7" é outra DO Processo; o nome fica
honesto porque o escopo é um componente só. A migração 0026 fatia cada
(perfil × componente) numa stack com nome derivado dos próprios valores
(string_agg DESC — "Java + Spring Boot", "Camunda 7", "FICO Blaze Advisor",
"Node", conferido contra o banco real do container) e derruba
`times.perfil_stack_id`, `perfis_stack` e `perfil_stack_valores`. Morreram
as rotas `/perfis-time/*` e o ponteiro; nasceram `GET/POST /stacks`,
`GET /stacks/sugestoes` (agregado tipo→campo→valores[]),
`PUT /stacks/:id/valores` e `POST /stacks/capturar` — a captura mescla na
stack de mesmo nome derivado (capturar duas vezes não duplica). O RBAC
continua o da SPEC-38 (`perfis-stack`, curadoria/owners).

Na UI: o painel do nó agora mostra UM CHIP POR VALOR conhecido ("usar
sugestão: Java" e "usar sugestão: Node" lado a lado) e o botão virou
"salvar estes valores como stack conhecida" — sem depender de time; a área
foi renomeada "Stacks conhecidas" (menu, tela, tour), agrupada por
componente; a linha "stack:" do menu (SPEC-42) morreu junto com o conceito
de stack-do-time; o chat de configuração descreve o catálogo inteiro como
contexto.

Mordidas: capturar sempre-criando → teste "não duplica" vermelho; chips
truncados a um → teste dos chips múltiplos vermelho. 193 engine + 163
server + 416 web; 49/49 E2E.

## 191. Salvar credencial sem redigitar a chave — e o rodapé parou de falar de git

Achado do usuário com o Qwen no Docker: "testei conexão e deu certo, mas
não consigo salvar". A causa era uma assimetria entre as duas rotas: o
`POST /ia/credencial/testar` tinha fallback pra credencial gravada quando a
chave faltava (por isso o teste passava), mas o `PUT /ia/credencial` exigia
`chave: min(1)` — e a tela promete "campo vazio = manter a chave atual" (o
placeholder mostra "chave atual: sk-…"). Trocar só o modelo devolvia 400,
que o client exibia como o genérico "Não foi possível completar a
operação".

Agora o PUT completa a chave vazia com a salva (e responde 400 legível —
"informe a chave" — só quando não há nenhuma pra manter), e o /testar
mescla o formulário com a chave gravada em vez de descartar o formulário
inteiro (antes, mudar o modelo e testar testava a config ANTIGA). O rodapé
da tela dizia "a chave vai pra ~/.gerador/credenciais.json, nunca pra
config/ — que entra no git" — texto do modo local morto; no hospedado a
chave mora no banco da organização e a API só devolve o resumo mascarado
(o usuário roda Infisical na stack; a observação sobre git não fazia
sentido nenhum). Mordida: fallback removido → teste do fluxo exato
vermelho. 165 server; 416 web.

## 192. SPEC-44 — a revisão pós-IA sem os 30 cliques: lote, fila guiada e uma régua só

Pedido do usuário (pré-aprovado, as duas fases): "a experiência de clicar
em confirmar/sugerir a item a item não está boa, e depois vai para a tela
onde aparece apenas uma lista". Medido: ~9 placeholders por item, cada um
com o seu Confirmar — ~30 cliques para a decisão mais comum ("está bom"),
nenhum agregado dizendo quantas sugestões aguardavam, e revisão e tela de
itens falando réguas diferentes.

O princípio da SPEC: aceitar deve ser barato e em lote; intervir é que
merece o clique. Nasceu `review/pendencias.ts` — a régua ÚNICA, pura:
"sugestão aguardando" (a esteira escreveu, ninguém assinou) x "campo vazio"
(ninguém escreveu), com `assinarSugestao` mantendo a procedência
(`origem: "sugerido"` fica; o humano só assina — editar é que vira
`manual`). Em cima dela: a barra de pendências no topo da revisão ("N
sugestões da esteira aguardando · M campos vazios", progresso, "Confirmar
todas" e "Revisar uma a uma"), o lote por seção ("✓ Confirmar seção" no
header de cada papel), o lote por item ("✓ confirmar item" no card) e a
fila guiada (Fase 2): overlay com UMA sugestão por vez, Confirmar
(Enter) · Pular · Descartar, snapshot das pendências na abertura, avanço
automático atravessando itens. Descartar REMOVE a resposta de verdade —
`responderItem` aceita `undefined` agora.

A régua única fecha o ciclo: o card da revisão diz a MESMA frase de
completude da tela de itens, e lá o chip de item não-pronto virou botão de
volta ("… ↩") que abre a revisão já naquele item (`itemInicial`). O teste
da frase mordeu um bug real de pluralização ("2 sugestãos") que já existia
na tela de itens — corrigido nos três pontos. Mordida da régua: confirmadas
contadas como pendentes → 2 testes vermelhos. 424 web unit; 50/50 E2E (o
novo percorre o ciclo inteiro com /ia/sugerir mockado).

## 193. O agente seguinte apagava o anterior — era timeout de 300 s, não bug de estado

Relato com print: "quando o agente seguinte começa a escrever, o que foi
escrito pelo anterior some da tela". Duas informações do usuário mataram a
investigação de UI pela raiz: **só acontece com o Qwen local; com o Sonnet,
não**. A evidência estava nos logs do próprio container:
`[ia/pipeline/arquiteto] falhou: fetch failed` **302 s** depois do POST, e
`[ia/pipeline/po] falhou` em **301 s**.

301 e 302 não são coincidência: é o `headersTimeout`/`bodyTimeout` padrão do
undici (300 s) no `fetch` global do Node. Um modelo local em CPU passa disso
só no *prompt eval* de um lote — a própria tela avisa "~3min40 para um item
com 2 campos" — e a conexão morria no meio da geração. O papel inteiro
voltava vazio, o texto que a pessoa tinha visto ao vivo (parser parcial) era
limpo no fim do lote, e o sintoma na tela parecia perda de estado do React.
Com um gateway remoto rápido a chamada nunca encosta no limite: por isso o
defeito era invisível no Sonnet.

Correção na raiz: `buscarDoModelo` (undici com dispatcher próprio,
`headersTimeout: 0, bodyTimeout: 0`, proxy corporativo honrado) passa a
servir a GERAÇÃO; a transcrição continua no `fetch` comum (áudio de segundos
não chega perto do limite, e é por lá que o dublê global do teste #286 mede
o destino). Quem limita a espera é a pessoa — pausar a esteira, fechar a
aba —, não um default pensado para APIs web.

Segunda metade, porque o modo de falhar importa: papel que morre no caminho
agora DIZ isso na tela (faixa com o papel, o motivo em português e quantos
campos foram salvos do texto parcial). Sumir trabalho em silêncio já foi o
pior sintoma deste projeto; um timeout com log só no servidor era a mesma
coisa com outra roupa.

Prova real, medida contra a stack: um gateway de laboratório que segura os
headers por 310 s — acima do limite que matava — devolveu
`{"ok":true,"duracaoMs":310038}`. Mordidas: timeouts de volta em 300 s →
testes das opções vermelhos; faixa de falhas desligada → teste do aviso
vermelho. 129 llm + 425 web + 165 server + 193 engine; 50/50 E2E.

## 194. SPEC-45 — a jornada do PDCA: do feedback à configuração mudada

Relato: "preenchi o feedback no agente e não vi nenhuma ação na aplicação
para avaliar/melhorar as configurações". Medido: `POST /pdca/feedback`
gravava e **não existia GET nenhum** — o texto entrava no banco e ninguém
via, nunca. O outro caminho (entrevista → `/ajustes`) morava escondido em
*Acessos* e terminava na aprovação: aprovar mudava um estado e mais nada,
alguém tinha que ir reescrever o documento à mão. O produto fazia o *Plan*
e o *Do* do ciclo e parava.

O pedido foi por jornada, não por tela: "onde aparecem os feedbacks e o
usuário consegue gerar sugestões, revisar e alterar configurações de forma
simples e com o apoio do assistente" — e, no meio da implementação, a peça
que mudou o desenho: "simular um item do mesmo tipo, gerando um item de
simulação com a IA e iterando até chegar no que o usuário deseja".

Isso obrigou o ajuste a deixar de ser texto e virar DADO
(`OperacaoDeAjuste` no engine: adicionar/remover item de checklist por
tech). Ser dado destravou as três coisas que faltavam: **prever** (o item
de exemplo é derivado e renderizado com a config proposta pelo MESMO
`renderizarItemEspecificacao` do documento real — prévia com outra lógica
seria promessa que a geração não cumpre), **aplicar** (aprovada + Aplicar
grava o documento pela mesma função pura, sem reescrita manual) e
**rastrear** (`aplicadaEm`/`aplicadaPor`, e o feedback marcado
`virou-ajuste` com o id da solicitação).

A tela `#/config/pdca` deixou de ser dois campos de cadência e virou a
jornada na ordem em que se anda: o que disseram → estúdio (proposta à
esquerda, prévia iterativa à direita, com ✨ redigindo o item a partir do
feedback e ✨ simulando a história com a IA) → revisar → aplicar →
cadência. As solicitações saíram de *Acessos* (que é permissão, não
melhoria) e o assistente ganhou o M15: com feedback parado, ele chama pra
tratar. Um detalhe que a prévia ensina sozinha: escolher uma tech que o
componente não usa mostra "nada muda neste item" — o erro mais fácil de
cometer aqui, visível antes de virar pedido.

Mordidas: `aplicarOperacao` mutando o documento original → 3 testes
vermelhos; aplicar sem gravar o documento → o teste do *Act* vermelho. Um
E2E vizinho caiu de brinde e ensinou algo real: o contador de usos do PDCA
é global do ambiente, então a suíte inteira empurra a cadência e o balão da
entrevista rouba o momento de outro spec — neutralizado com rota mockada,
que é o que torna aquele teste sobre o que ele mede. 199 engine + 170
server + 441 web; 51/51 E2E.

## 195. SPEC-46 — o ajuste vale para as quatro seções (e o dono de cada uma)

Continuação pedida na hora certa: "o mesmo deve ser aplicável aos
checklists de processo e requisitos de refinamento". A SPEC-45 tinha
coberto só o checklist técnico — e é justamente nas outras seções que boa
parte do feedback real mora ("sobrou o bloco de volumetria", "faltou
repontar massa").

`OperacaoDeAjuste` passou a cobrir as quatro: checklist técnico, checklist
de processo, ciclos de teste (com o que valida e os ambientes dev/hlg) e
volumetria (que é liga/desliga por tech, não lista). `secao` ausente
continua significando checklist técnico — solicitação gravada antes desta
fase segue válida e aplicável, sem migração de dado.

A extensão expôs um defeito que estava escondido enquanto só existia uma
seção: o gate de decidir/aplicar era FIXO em `regras.checklistTecnico`.
Com processo/testes/volumetria, todo pedido iria para o dono errado — e
barraria exatamente quem cuida daquela seção, que é o oposto da delegação
que a SPEC-28 existe para permitir. Agora o recurso RBAC vem da operação
(`secaoDaOperacao` → `SECOES_DE_REGRAS`). O teste que prova isso precisou
rebaixar o curador para `operar`: com owner o bypass passa por cima e o
teste mediria o portão errado — a mesma armadilha que o teste de delegação
da SPEC-28 já documentava.

Na tela, o estúdio ganhou "Onde (a seção das regras de refinamento)" e os
campos passaram a seguir a seção. Um achado de acessibilidade no caminho: o
rótulo visível virava "Tipo do ciclo de teste" enquanto o nome acessível
continuava "Texto do item" — leitor de tela ouviria a coisa errada; agora
os dois acompanham a seção. A prévia não precisou de código novo: o item
de exemplo já renderiza as quatro seções, então o efeito aparece no lugar
certo sozinho.

Mordida: gate de volta ao recurso fixo → o teste do dono da seção vermelho.
206 engine + 173 server + 444 web; 51/51 E2E.

## 196. SPEC-47 — o item escrito de verdade: template próprio e entrega final

Relato com dois prints: a tela de itens (títulos, chips e um "Ver corpo"
colapsado) e o editor do template da especificação. "Gostaria de ver os
itens estruturados com a escrita real... conforme um template configurado...
e esse template precisa ter a entrega final no fim de cada item."

Três coisas faltavam, e as três eram a mesma raiz: **só o documento era
template**. O corpo de cada item era estrutura fixa no código — mudar a
ordem das seções, renomear um título ou acrescentar uma seção exigia
recompilar. Agora o item tem template próprio (`tipo: "item"` na mesma
tabela, migração 0028), com as suas variáveis e a sua régua de validação;
`{{entregaFinal}}` é a que fechava o buraco: nenhum item dizia o que fica
pronto quando termina, e o texto acabava no cenário de teste.

A entrega final entrou como placeholder de refinamento (`_entregaFinal`),
igual a história e critérios: a esteira escreve, o humano confirma, e o
documento fecha cada item com o entregável. Consequência honesta e visível:
todo item passou a ter uma pendência a mais até alguém dizer o que entrega —
dois E2E caíram por isso e foram atualizados de propósito, porque o produto
mudou de opinião sobre o que é um item completo.

Na tela, a escrita passou a aparecer por padrão, lida como TEXTO (títulos
viram títulos, listas viram listas, negrito vira negrito, bloco de código
continua monoespaçado) em vez de markdown cru dentro de um `<pre>`;
recolher é que virou a ação sob demanda. E a área "Especificação de
solução" ganhou os dois templates lado a lado, cada um explicando o que é.

Detalhe de implementação que vale registrar: seção cujo conteúdo fica vazio
some INTEIRA, título junto — sem isso, um item sem contrato de arquitetura
sairia com um cabeçalho seguido de nada, exatamente o ruído que o §188
mandou tirar do documento.

Mordida: entrega final sem o marcador de pendência → dois testes do template
vermelhos. 211 engine + 175 server + 445 web; 51/51 E2E.

## 197. SPEC-48 — "Itens escritos", e o tour contando a história inteira

Dois pedidos curtos na sequência do §196: renomear a tela, e dar clareza na
demonstração automática/tour guiado.

**O nome.** "Itens de trabalho" descrevia a entidade, não o que a tela
entrega. Depois da SPEC-47 ela mostra a ESCRITA final de cada item — o
mesmo texto que entra no documento e, na próxima fase, vai pro tracker.
Virou **"Itens escritos"**, com o subtítulo dizendo isso ("o texto final de
cada item da demanda"), e o vazio deixou de falar em "item gerado" para
falar em item escrito.

**O tour.** Ele parou no tempo: terminava na especificação e nas telas de
configuração de antes, sem citar nada do que nasceu depois — a confirmação
em lote (SPEC-44), os itens escritos (SPEC-41/47) e a jornada do PDCA
(SPEC-45/46). Ganhou três passos, na ordem em que se anda: "Confirmar o que
a IA escreveu" (a barra de pendências, com o princípio dito em voz alta —
aceitar é barato, corrigir é que merece o clique), "Itens escritos" (a tela
nova, incluindo a entrega final) e "Melhoria contínua (PDCA)" (feedback →
sugestão com prévia → aprovar → configuração mudada). O passo dos modelos
passou a dizer que são DOIS (documento e item). E a abertura parou de
prometer "11 passos": o número mentia a cada rodada, e quem conta é o
contador do overlay.

Aprendizado que valeu mais que os passos: **o tour era validado por
número** ("PASSO 7 DE 13") no E2E e por índice fixo nos testes de unidade —
então todo passo novo quebrava testes sem que nada estivesse errado. Os dois
passaram a andar até o passo pelo TÍTULO. É a diferença entre um teste que
mede a etapa existir e um que mede a contagem não ter mudado.

E o smoke no bundle pegou um defeito de brinde: com a tela de itens aberta
havia DOIS botões ☰ no DOM (o do canvas não se escondia) — exatamente o que
a SPEC-40 corrigiu para a tela de config, repetido na tela nova. Corrigido,
com o E2E passando a exigir um ☰ só. 446 web unit; 51/51 E2E.

## 198. Duas portas de experimentar, fixas no topo

Pedido curto com print: trazer "✦ Como funciona & cenários" para o header
como DOIS botões separados, destacados dos botões de componente, em local
fixo — e separando o que estava junto: **cenários prontos** (material pra
carregar e brincar) de **demonstração e tour** (o produto se explicando).

Eram a mesma entrada, escondida atrás do menu ☰: quem chegava tinha que
abrir o menu, achar um item com dois assuntos no nome e só então escolher a
aba certa. Agora são "✦ Cenários prontos" e "▶ Demonstração & tour", lado a
lado, **antes** da paleta de componentes — que reflui em duas linhas
conforme a janela, e por isso não podia ser vizinha de quem precisa ficar
sempre no mesmo lugar. O estilo é deliberadamente outro (contorno de
acento, fundo tingido, cantos redondos): ao lado de quinze `+ Componente`
cinzas, um botão cinza a mais seria só mais um; o que distingue "isto me
ensina" de "isto adiciona um nó no desenho" é o contraste.

O menu perdeu o item — ele é a casa do que se ADMINISTRA, e experimentar
não é administrar. Cinco specs E2E entravam pelo menu e passaram a entrar
pelo botão, o que encurtou cada um em duas linhas (abrir menu → clicar item
→ clicar aba virou um clique só). Uma flutuação apareceu no caminho e vale
anotar: o spec de regras estourou o timeout no `finally` que restaura o
documento global — corrida entre specs que compartilham a mesma config, não
regressão; passou sozinho na re-rodada. 446 web unit; 51/51 E2E.

## 199. A entrega final ganhou dono — a pendência que eu criei sem ferramenta

Pergunta do usuário: "temos alguma implementação pendente?". O levantamento
achou fases adiadas de propósito (MCP→Jira, menu por perfil, aplicar
automático fora de `regras`) e um DEFEITO ativo, meu, da rodada anterior.

A SPEC-47 criou o placeholder `_entregaFinal` e o pôs no template do item —
mas não o ligou em `placeholdersPorPapel` (a lista que a esteira usa pra
montar o lote de cada papel) nem em `placeholdersDaFicha` (a régua da
SPEC-44). O efeito: o documento e o card do item COBRAVAM a entrega final
("✍️ especificar"), a esteira nunca a escrevia, não havia campo na tela pra
preencher à mão, e a barra da revisão dizia que não havia nada pendente
enquanto o card dizia que havia. Duas réguas de novo, e uma exigência sem
caminho pra cumprir — exatamente o defeito que este projeto mais combate.

A correção é de duas linhas: a entrega final é do **PO** (quem pede o item
é quem diz o valor entregue) e entra na régua junto dos outros campos. Com
isso a esteira passa a pedi-la ao PO no mesmo lote da história e dos
critérios, e o campo aparece na aba de refinamento pra edição manual.

A prova mais bonita veio do E2E que quebrou: o spec da revisão em lote
esperava que NENHUM item ficasse pronto (era o que acontecia — o campo
impreenchível travava todos), e passou a encontrar o primeiro item "Pronto
pra exportar". Nenhum teste tinha pegado o gap antes: os três escritos
agora mordem (esteira pedindo `_entregaFinal` ao PO, campo na tela, e a
contagem da régua). 449 web unit; 51/51 E2E.

## 200. SPEC-49 — os itens finalmente saem daqui: exportação pro tracker

A Fase 2 da SPEC-41, que a tela vinha prometendo ("a exportação pro seu
tracker chega na próxima fase"). A porta `ExportadorDeItens` estava lá desde
então, com contrato e teste; faltava quem a implementasse.

A decisão de fundo: **o gerador não fala Jira**. Implementar um tracker
seria escolher o tracker de todo mundo, e quem usa outro ficaria de fora. O
adaptador fala com um AGENTE — MCP bridge, n8n, função interna — no
endereço que a empresa configurar, com um contrato de três linhas: manda
`{ itens: [...] }`, recebe `{ resultados: [{ chave, linkExterno } | { chave,
erro }] }`. É a mesma disciplina do gateway de IA, que também é só um
endereço.

Três regras que definem o comportamento, todas testadas: **só item pronto
exporta** (a régua da SPEC-44/47 decide — item pela metade não vira issue
meia-boca); **falha é por item** (quem subiu fica `exportado` com link, quem
falhou continua `gerado` e o motivo aparece no card); e **ausência não é
sucesso** — item sobre o qual o agente não disse nada volta como erro
explícito, nunca como exportado silencioso.

Um defeito latente apareceu no caminho: `resumirConfig` (o diagnóstico de
config desatualizada) tinha um `switch` sem default, então a chave nova
`exportador` derrubava a rota inteira com "Cannot convert undefined or null
to object". Bomba armada para qualquer chave futura, desarmada agora.

A validação de ponta a ponta usou o `/health` do próprio servidor como
"agente": ele só aceita GET, o POST volta 404, e o motivo REAL do destino
atravessou até a tela por item — evidência melhor do que um mock cordato
daria. Mordida: item ignorado pelo agente virando sucesso → o teste do
sucesso silencioso vermelho. 211 engine + 177 server + 453 web; 52/52 E2E.

## 201. SPEC-50 — o ajuste alcança a esteira, e o alvo passa a mandar

A SPEC-46 espalhou o ajuste pelas quatro seções das REGRAS; o "aplicar
automático" continuava recusando qualquer outro documento com um 409
honesto ("ainda só existe para regras"). O pipeline de agentes é o próximo
que o feedback cita — "esse papel sobra nos meus itens" —, e agora ele
entra pelo mesmo caminho: `ativar-papel` / `desativar-papel`.

A mudança conceitual que isso forçou: com mais de um documento alvo, o
**rótulo do pedido deixou de mandar**. Nasceu `recursoAlvoDaOperacao(op)`, e
é ele que decide onde aplicar e quem aprova — um ajuste de papel vai pro
dono do `pipeline-agentes` mesmo que o pedido tenha nascido marcado como
"regras", e a validade da aprovação passa a comparar a versão do documento
CERTO. Sem isso, o gate mandaria metade dos pedidos pra pessoa errada, que
foi exatamente o defeito que a SPEC-46 corrigiu um nível acima.

A prévia precisou de outra pergunta. Para regras, ela mostra o item de
exemplo mudando; para a esteira, o texto do item não muda — muda quem o
escreve. Então a tela diz isso em vez de fingir um diff: "o papel X para de
escrever: a seção dele fica sem dono e os campos chegam em branco", com a
lista dos papéis marcando o que muda e o aviso de que vale da próxima
geração em diante. E o seletor de papel sugere o OPOSTO do estado atual —
quem abre um ajuste quer mudar, não confirmar o que já está.

Detalhe de tipagem que virou comentário no código: estreitar a união pelo
`recursoAlvoDaOperacao()` não convence o TypeScript; a checagem tem que ser
pelo `tipo` da operação, e é por isso que `aplicarOperacao` começa com um
no-op explícito para as operações de papel. Mordida: gate ignorando o alvo
→ o teste do dono do pipeline vermelho. 215 engine + 186 server + 455 web;
52/52 E2E.

## 202. SPEC-51 — cadeado no menu, e o pedido nascendo onde a permissão barra

As duas fases que sobraram do backlog eram a mesma ideia por dois ângulos —
a SPEC-40 F2 (cadeados no menu) e a SPEC-39 F2 (solicitação nascendo do
403) — e ficaram numa rodada só.

O defeito era silencioso e feio: o menu listava todas as áreas, a
`ConfigScreen` escondia as negadas e caía na PRIMEIRA VISÍVEL. Quem clicava
em "Modelo de IA" ia parar em "Membros" sem uma palavra. A pessoa não
conclui "falta permissão" — conclui "está quebrado".

Agora o menu marca com 🔒 o que ela não edita (e o item continua clicável de
propósito: é lá que se pede), a área negada DIZ que é permissão, e o pedido
nasce ali mesmo: uma caixa de texto vira solicitação de ajuste com o recurso
já preenchido, caindo na fila do PDCA com prévia e aprovação. O caminho
existia — a entrevista do agente — mas longe do momento em que a pessoa quer
a mudança, que é exatamente quando ela desiste.

Uma decisão que vale registrar: **nem tudo se pede**. Acessos, membros e
credenciais são decisão de quem administra, não ajuste de configuração — pra
essas a tela manda falar com um owner em vez de oferecer um botão que não
resolveria. Oferecer o pedido ali seria transformar uma conversa de
confiança num formulário.

Mordidas nas duas peças (área negada voltando a cair noutra tela; cadeado
desligado) → quatro testes vermelhos, nenhum deles existia antes. 461 web
unit; 52/52 E2E.

## 203. O caminho NEGADO exercido de verdade — e o setup que mentia em silêncio

A §202 entregou o cadeado e o pedido, mas com uma ressalva honesta: o
caminho negado nunca tinha sido percorrido com o RBAC LIGADO. Ligar o
controle de acesso é da organização inteira, e fazer isso no ambiente de
trabalho de alguém para "ver se funciona" é mudar o ambiente de alguém.

A stack de teste dedicada já existia (`docker-compose.e2e.yml`, banco
próprio na 5433), então o que faltava era um spec que ligasse o RBAC sem
contaminar os vizinhos. `playwright.config.ts` ganhou dois projetos: `app` e
`rbac`, o segundo dependendo do primeiro — o spec que liga o controle roda
sozinho, depois que todo o resto terminou. Ele entra como quem só pode mexer
em campos por componente (nível `operar`, porque owner passaria pelo bypass
da SPEC-38 e o teste mediria o portão errado) e afere as três coisas: o
cadeado no menu, a área negada explicando que é permissão, e o pedido
virando solicitação de verdade com o recurso certo e o solicitante certo.

Três defeitos apareceram no caminho, e os três eram de **silêncio**:

1. O helper `entrar()` sempre esperava a tela de escolha de time. Quem tem
   UM time só não passa por ela, então o clique esperava para sempre — e o
   relatório mostrava um erro do `finally`, não a causa. `actionTimeout`
   entrou na config: espera sem fim vira mensagem, não mistério.

2. O `globalSetup` truncava `quebras` sem CASCADE. A FK nova de
   `itens_gerados` (0025) fazia o TRUNCATE falhar, o `catch {}` engolia, e
   TODO o resto do setup virava no-op — seed dos padrões incluída. A suíte
   reportava 18 falhas espalhadas em vez de "o setup não rodou". Agora o
   `catch` só tolera tabela inexistente (banco novo); qualquer outro erro
   sobe.

3. Criar o primeiro papel faz o servidor criar junto o "Administrador" — a
   tranca que impede de trancar quem ligou o RBAC. Apagar só o papel que o
   teste criou deixava esse de pé, e papel existindo é o que MANTÉM o RBAC
   ligado: a corrida seguinte inteira levava 403 por um motivo nascido na
   anterior. A limpeza agora apaga todos e AFERE que sobrou zero, e o
   `globalSetup` repete a limpeza como rede de segurança.

A lição que fica dos três: limpeza presumida é limpeza que não aconteceu. O
que o teste arruma no `finally` precisa ser conferido no mesmo lugar, senão
o estrago aparece longe, noutro spec, sem pista nenhuma.

Mordidas: menu ignorando as permissões → asserção do cadeado vermelha; área
negada sempre falsa → asserção do aviso vermelha. 53/53 E2E, banco de teste
sem resíduo depois da corrida.

## 204. SPEC-52 — o ajuste também aplica na ficha, e a régua continua sendo uma só

O ciclo do PDCA fechava sozinho para as regras de refinamento e para a esteira
de agentes. Para os **campos por componente e por conexão** ele parava na
metade: o pedido nascia, alguém aprovava — e a solicitação ficava com um aviso
de "abra a configuração e edite à mão". Quem aprovou já tinha entendido e
concordado; o trabalho manual que sobrava era onde o ciclo perdia gente. E era
justamente o pedido mais comum ("falta um campo de SLA no serviço").

A razão de ter ficado para trás é boa: regras e pipeline são DOCUMENTOS num
JSON versionado, e uma função pura devolve documento novo — prévia, validade e
idempotência saem de graça disso. Campos são TABELA, com chave natural e
escopo global sobrescrevível por time. Não há documento para versionar nem
função pura para aplicar.

A saída foi manter a disciplina sem fingir que a tabela é documento:
`aplicarOperacaoNosCampos` é pura e devolve a ficha nova; a tela usa para a
prévia e **o servidor usa a mesma função** para decidir o que gravar. O que a
pessoa vê é literalmente o que acontece, e não duas implementações que
combinam por enquanto.

Três decisões que valem registro:

**Um pedido de time não apaga o campo de todo mundo.** O campo global aparece
na ficha do time (é o que a sobreposição faz), então sem checagem de escopo uma
solicitação que só um time discutiu apagaria o campo da organização inteira —
com o gate de permissão satisfeito, porque a permissão era do time. Agora a
aplicação recusa com o motivo, e o teste prova que o campo continua lá.

**`lista` fica de fora.** Uma lista carrega `itemSpec` (sub-campos com chave,
rótulo, tipo e opções): é estrutura para editar na tela de campos, não para
nascer de uma frase de feedback. Mesma régua da §202 sobre acessos — nem tudo
se aplica sozinho.

**Sem versão, a idempotência é que protege.** Adicionar o que já existe é
no-op, remover o que já saiu também. É mais fraco que a validade por versão, e
é escolha consciente: inventar uma versão sintética para a tabela seria um
mecanismo novo para um risco que a idempotência já cobre.

Dois defeitos que só o navegador contou, os dois de ficar **invisível**:

1. A prévia mostrava só os campos customizados. A ficha que a pessoa preenche é
   o `spec` do componente MAIS os customizados — omitir os primeiros era mentir
   por omissão sobre o que ela veria. Agora aparecem os dois, e o que vem do
   componente vem marcado (e não sai por ali: remover um campo do tipo é outra
   conversa, e a tela diz isso em vez de só não oferecer nada).
2. Aplicar funcionava no servidor e o campo não aparecia no painel. Recarregar
   a lista de campos não bastava: quem alimenta o painel é a config MESCLADA
   (global + time, resolvida pelo servidor). Sem isso, a pessoa aprovava,
   voltava ao canvas e não via nada até um F5 — o ciclo parecia não ter
   fechado.

Mordidas: recusa de escopo desligada → o pedido de time apagando o campo global
(vermelho); chave técnica sempre seguindo o rótulo → a edição à mão sendo
sobrescrita (vermelho); ficha da conexão usando os componentes → vocabulário
trocado (vermelho); config mesclada sem recarregar → o campo aprovado invisível
no painel (vermelho). 225 engine + 189 server + 468 web; 54/54 E2E.

## 205. SPEC-53 Fase 1 — o produto passa a existir (e por que não é o `produto` do §21)

O usuário perguntou se a estrutura de ajuste servia para os checklists de
processo. Serve — e isso não precisou de código nenhum: as quatro seções são
operação estruturada desde a SPEC-46, cada uma com dono próprio no RBAC
(`regras.checklistProcesso`), e o aplicar automático da §204 vale para todas.

A pergunta boa veio junto: **contexto do produto**. Levantando o que existe,
três coisas parecem contexto e nenhuma é: `demandInfo` (contexto DA DEMANDA,
recolado a cada épico e que morre com a quebra), `contextos` (tag técnica que
filtra checklist) e as stacks (tecnologia). Nada guarda o que o produto **é** —
objetivo, vocabulário, quem usa, regras que valem sempre, sistemas,
restrições. O efeito está em `montarPedidoPipeline`: o agente recebe só o texto
daquela demanda. Todo item nascia sem saber de que produto falava.

**Produto é entidade própria, não campo do time.** Um time atende vários
produtos e um produto atravessa times; fundir os dois repetiria a confusão que
a SPEC-42 desfez entre time e stack. E, por decisão explícita do usuário,
produto **não** se mistura com checklist de processo: são abstrações
diferentes. O produto pode *entrar* no checklist como eixo de aplicabilidade
(ao lado de `contextos`), nunca substituindo a costura existente — Fase 3.

**A pergunta que o próprio schema fez.** O comentário no topo de `schema.ts`
avisa: "não tem mais `produto` (§21) — era informação do épico, não do item".
Fui ler antes de reintroduzir o conceito. O que saiu lá era um TEXTO solto,
escrito em quatro pontos de `derivar.ts` e **nunca lido** por exportador
nenhum. O que entra agora é o oposto em todos os eixos: entidade com conteúdo,
fora da demanda, e cuja razão de existir é ser lida. Está escrito na SPEC que,
se a Fase 2 não acontecer, esta recria o defeito do §21 com outro nome.

Decisões da Fase 1 que valem registro:

- **Produto sem time amarrado aparece para todos.** É o estado em que ele
  nasce; sumir da tela de quem acabou de criá-lo seria o pior primeiro minuto
  possível. Amarrar times **restringe** — e a tela diz isso, porque "marcar"
  costuma sugerir o contrário.
- **O vínculo com a quebra é opcional.** Quem já usa a ferramenta não passa a
  precisar cadastrar produto para fazer o que fazia.
- **Seis seções fixas, uma estruturada.** Só o glossário tem forma (termo →
  definição), porque é onde estrutura paga: é a seção que mais muda a escrita
  de um item. Uma "configuração de quais seções o contexto tem" seria camada a
  mais para um problema que ninguém tem.
- **Ler exige sessão, escrever exige o recurso `produtos`.** Diferente de
  campos e stacks (leitura aberta): o que está aqui é vocabulário e regra de
  negócio da empresa, não configuração técnica que serve a todo mundo ver.

Um achado de processo: `npm run typecheck -w packages/web` **não** cobre o que
o `npm run build` cobre. Três erros reais (incluindo `produtoId` faltando no
tipo `Quebra` do engine) só apareceram no build — a mesma lição já anotada de
"checar o que a CI checa", agora com um caso concreto de tsc filtrado
escondendo erro.

Mordidas: `produtoId` fora de `normalizarDadosQuebra` → o vínculo voltando null
(o campo morrendo na borda, igual à SPEC-31); RBAC trocado por sessão → escrita
liberada para quem não tem o recurso; `onSalvar` sem o produto → o E2E pegando
`produtoId: null` no POST real. 35 aplicação + 197 server + 477 web; 55/55 E2E.

Fica na fila, e é onde o valor aparece: **Fase 2** — o contexto do produto
entrando no prompt dos agentes, na especificação e na tela.

## 206. SPEC-53 Fase 2 — o contexto do produto chega em quem escreve

A Fase 1 criou onde guardar. Sozinha, ela repetiria o defeito do §21 — um
`produto` que ninguém lê. Esta fase é a que a SPEC declarou não-opcional: o
contexto entra no prompt do pipeline, no `/ia/sugerir` campo a campo, na
conversa sobre o item e na especificação gerada.

**Separado, não concatenado.** O produto entra como bloco próprio, antes do
contexto da demanda, com rótulos que dizem o que é o quê: "Contexto do PRODUTO
(vale para todas as demandas dele, não só esta)" e "Contexto desta demanda/
épico especificamente". Fundir os dois ensinaria o modelo a tratar o glossário
como circunstância da entrega — quando ele é exatamente o que não muda. A ordem
também é decisão: o geral orienta a leitura do específico.

Três testes-guarda quebraram no caminho, e os três estavam certos:

1. `ANATOMIA_DO_PROMPT_PIPELINE` (#296) — a aba do pipeline EXPLICA de onde vem
   cada pedaço do prompt, e o teste exige que todo marcador declarado exista no
   prompt real. Mudar a montagem sem mudar a anatomia é a tela mentindo com
   convicção; o guarda cobrou na hora.
2. `lotesDaEsteira` (#299) — a simulação usa a MESMA função da corrida real, e
   um teste lê o código-fonte do hook para garantir que ninguém monte o corpo
   por fora. Assinatura nova → guarda vermelho.
3. O mesmo arquivo exige que o prompt simulado tenha todas as partes da
   anatomia: sem passar o contexto do produto para a simulação, ela mostraria
   um prompt que não é o que sai.

Um tropeço meu que vale registro: escrevi `\n` dentro de heredoc num teste e
ele virou quebra de linha real, produzindo string não terminada. O sintoma foi
pior que o erro — `npm test -- <filtro>` casou com OUTRO arquivo, reportou "9
passed" e eu quase segui em frente achando que os testes novos tinham rodado.
Arquivo que falha na COLETA não aparece como falha de teste; rodar pelo nome
exato do arquivo foi o que revelou.

O E2E prova o ciclo sem gastar modelo: cadastra produto com glossário, liga a
demanda a ele, escreve contexto próprio da demanda e abre a simulação da
esteira — que mostra o prompt real, com os dois blocos, na ordem certa.
Mordida: tirar o contexto do produto do corpo do lote → o prompt sem o bloco
(vermelho). 227 engine + 197 server + 477 web + 40 aplicação; 56/56 E2E.

## 207. SPEC-54 — a credencial de IA sai do banco e vai para o cofre

A chave do gateway estava numa coluna em texto plano: todo backup do Postgres
do app a carregava junto, e quem lia o banco lia a chave. O usuário já roda
Infisical self-hosted (SPEC-12) — a observação dele, na §191, foi direta: com
um cofre de pé, guardar segredo no banco do app não se sustenta.

**Por que a SPEC-12 não resolvia isto sozinha.** Ela decidiu, com razão, não
colocar SDK de vault no servidor: os segredos dela são de BOOT, e
`infisical run` os injeta como variáveis de ambiente antes do processo subir.
A credencial de IA não é de boot — nasce em runtime, quando alguém cola a
chave na tela, testa a conexão e salva. `infisical run` não escreve, e injeção
no boot não muda depois. Problema diferente, solução diferente.

**O que vai e o que fica.** Só a `chave` é segredo; endereço do gateway, modelo
e flags são configuração que a tela precisa ler para se desenhar. Mandá-los
para o vault faria a tela depender do cofre para mostrar um formulário. Então:
chave no cofre, resto no banco — e a porta `RepositorioDeCredenciais` não muda,
porque quem chama não deve saber de onde vem a chave. O que entrou foi uma
porta de três métodos (`CofreDeSegredos`), um adaptador HTTP e um decorator.

Três decisões que valem registro:

- **Sem `INFISICAL_*`, nada muda.** Dev, E2E e quem ainda não tem vault seguem
  no banco. O servidor loga qual caminho está ativo, porque "minha chave sumiu"
  e "o cofre não subiu" são a mesma tela para quem usa.
- **A chave que já estava no banco migra sozinha**, na primeira leitura: grava
  no cofre, apaga a coluna. Nessa ordem — falha no meio deixa a chave nos dois
  lugares (recuperável), nunca em nenhum.
- **Cofre fora do ar SOBE como erro.** Se virasse "não configurado", a tela
  pediria para configurar uma chave que existe, e o próximo salvar gravaria por
  cima. 404 é ausência; qualquer outro erro é falha, e a diferença está testada.

E o custo, escrito na SPEC em vez de descoberto depois: a identidade do
Infisical passa a precisar de ESCRITA, quando a SPEC-12 pedia só leitura.
A alternativa era a credencial virar segredo de boot — o que elimina a escrita
e elimina junto a configuração pela tela, que é como o produto funciona. Entre
perder a funcionalidade e ampliar o escopo de uma identidade revogável pela UI,
a escolha foi ampliar, com o motivo registrado.

O teste que fecha a conta sobe um **Infisical falso** (servidor HTTP que fala o
protocolo v3) e exercita a rota real: `PUT /ia/credencial` grava no cofre e a
coluna do banco fica `null`. Mordidas: rota ignorando o cofre → a chave não
chega lá (3 vermelhos); migração sem limpar a coluna → a chave ficando nos dois
lugares (1 vermelho). 227 engine + 211 server + 477 web + 48 aplicação; 56/56
E2E.

## 208. Revisão de cobertura — cinco E2E para o que só o navegador prova

Varredura das áreas do menu e das features entregáveis contra os specs
existentes. Quatro buracos apareceram, e nenhum deles era "falta um caso de
borda": eram features inteiras sem uma linha de teste de navegador.

**A demonstração automática.** O tour clicável tinha spec; a demo — a outra
metade do botão que a §198 separou — não tinha nenhuma. E é a única feature do
produto que depende de TEMPO: avança sozinha, pausa onde está, continua de onde
parou. Teste de unidade não alcança relógio. Ao escrever, descobri um detalhe
honesto: o cursor fantasma não existe no primeiro passo, porque ele é card
central e o componente só desenha o cursor quando há alvo. O teste passou a
esperar o cursor aparecer em ALGUM passo, em vez de exigir uma promessa que o
produto não faz.

**Baixar o diagrama (.html).** A SPEC-21 gera um artefato que sai da ferramenta
e vai parar num chat, num wiki, num anexo de ticket — e só o gerador tinha
teste. Nada provava que o BOTÃO produz arquivo. O spec confere o conteúdo, não
só o nome: um HTML vazio baixaria igual e passaria num teste preguiçoso (a
mordida foi exatamente essa, e ficou vermelha).

**Ajuste de PAPEL pela tela (SPEC-50).** O PDCA tinha E2E para regras e, desde
a §204, para a ficha. O terceiro alvo — o pipeline — nunca tinha sido
percorrido no navegador, apesar de ter a prévia mais diferente das três ("quem
deixa de escrever" em vez de "o que muda no texto").

**Administrar acessos pela tela.** O `rbac-cadeado-e-pedido` cobre quem é
barrado, mas monta o cenário pela API. Criar papel, marcar a matriz recurso ×
ação e colocar alguém dentro — o caminho que LIGA o RBAC da organização — só
existia em teste de unidade. Aqui o Playwright ensinou algo: `check()` exige
que o estado mude no clique, e esse checkbox só vira verdade quando o servidor
responde e a lista recarrega. Trocado por `click()` + asserção do estado final,
que é o que se quer provar mesmo.

Os cinco specs novos e as mordidas: demo que não avança → o passo congelado
(vermelho); download vazio → o HTML sem conteúdo (vermelho). 61/61 E2E
(eram 56).

## 209. O nível de acesso perto de quem ele descreve

Print do usuário na tela de Membros: o seletor de nível ("owner") jogado no
canto direito, a mais de mil pixels do e-mail da pessoa numa janela larga, e em
letra menor que o texto ao lado. A causa era um espaçador `flex: 1` entre os
dois, dentro de uma lista sem largura máxima — o seletor ia até onde a tela
fosse.

A linha virou cartão em **grid** com a coluna do e-mail limitada a 320px: o
nível encosta no nome (12px de distância, medidos), e com vários membros os
seletores ficam alinhados entre si em vez de dançarem conforme o tamanho de
cada e-mail. Fonte de 12 para 14 — é um controle que muda permissão, e estava
menor que o texto que ele qualifica.

Layout raramente merece asserção, mas aqui a distância **é** o defeito: o teste
mede o vão entre o fim do e-mail e o início do seletor numa janela de 1600px, e
confere o tamanho da fonte. Sem isso, o próximo `flex: 1` bem-intencionado
devolve o problema em silêncio. Mordida: espaçador de volta → "o seletor de
nível deve ficar ao lado do e-mail, não na borda da tela" (vermelho).

Validado no bundle de produção da stack local, não só no dev: medi 555px →
369px de posição do seletor e 14px de fonte com o navegador real em
`localhost:8080`.

## 210. Os itens de uma demanda aparecendo em outra

Relato do usuário: *"fui em abrir, escolhi uma demanda com 2 itens, depois abri
o menu e fui em itens escritos, e apareceu os itens escritos da demanda
anterior"*.

O item pertence a uma quebra — é o que a rota `/quebras/:id/itens` diz, e o
servidor sempre respondeu certo. O problema era o cliente: a lista vivia no
estado do App e só era recarregada ao **entrar** na tela, com uma porta de
saída (`if (!quebraId) return`) que, numa demanda ainda sem id, deixava
exatamente o que estava lá antes. Quem abre outra demanda e vê o trabalho da
anterior não conclui "a tela está velha" — conclui que a ferramenta misturou o
material de duas coisas diferentes, que é o pior que uma ferramenta de
especificação pode fazer.

**Onde a limpeza mora importa.** A primeira tentativa foi limpar no efeito de
carga quando não havia id — e ela quebrou o teste que existia desde a SPEC-41:
gerar itens numa demanda ainda não salva e cair na tela dos itens passou a
mostrar vazio, porque a limpeza apagava o que acabara de ser gerado. A limpeza
certa é em `aoAbrir`, que é o evento "troquei de demanda" (abrir uma salva ou
começar uma nova). Não em `quebraId`, que também muda quando ESTA demanda é
salva pela primeira vez — hora em que apagar seria perder trabalho à toa.

**O teste que quase não testou nada.** A primeira versão do E2E percorria o
caminho do relato e passava *antes* da correção: com `expect().toHaveCount(0)`,
o auto-retry esperava a resposta chegar e via a lista já corrigida — deixando
passar exatamente o instante que o usuário viu. Trocado por uma leitura
imediata (`count()`) com a busca atrasada de propósito, e aí morde. Um teste
que espera o defeito sumir não testa o defeito.

Dois specs novos, ambos vermelhos sem a correção: o caminho do relato (abrir
outra demanda, com a busca ainda no ar) e o mais grave (demanda nova, sem id,
herdando 16 itens da anterior).

## 211. Duas falhas de suíte que a minha pressa criou

O PR do §210 foi para a main com a CI de E2E **vermelha** — não há required
check no repositório, e o merge passou. Duas causas, as duas minhas:

**Rodei o arquivo, não a suíte.** Testei `-g "§210"` isolado e mandei o PR. A
CI roda tudo, em paralelo, numa máquina mais lenta — e ali o encadeamento de
dois "Voltar ao canvas" sem esperar cada tela sumir estourou em click timeout:
a revisão ainda estava por cima, interceptando o ☰. A régua de "checar o que a
CI checa" existe desde a §176 e eu a apliquei pela metade: rodei build e
unitários completos, e o E2E filtrado.

**Dois testes disputando o mesmo estado global.** O spec de administrar acessos
(§208) e o do cadeado (§203) mexem nos papéis da ORGANIZAÇÃO, e rodavam em
paralelo no mesmo projeto: o `finally` de um apagava os papéis que o outro
ainda usava, e o cadeado sumia no meio do vizinho. Passou na CI da §208 por
sorte de timing e falhou aqui. Os dois foram para o mesmo arquivo com
`test.describe.configure({ mode: "serial" })` — `fullyParallel: false` no
projeto não resolveria, porque o Playwright continua distribuindo ARQUIVOS
diferentes entre workers.

63/63 E2E, duas rodadas completas seguidas antes de abrir o PR desta vez.

## 212. Fora o importador do Graphify

Decisão do usuário: remover a feature "Importar do Graphify". Ela lia o
`graph.json` de outra ferramenta e rascunhava nós `existente`/`extraído` no
canvas a partir de `config/graphify-mapping.json` — um mapeamento
caminho→tipo que só quem conhecia o formato conseguia manter, e que na prática
ninguém mantinha. Uma porta de entrada que exigia configurar outra coisa antes
de servir para alguma coisa.

Saiu inteira, não só o botão: o adaptador do engine e seus testes, o
componente da tela, a aba da jornada, a prop que a atravessava, o E2E, a
fixture, o `config/graphify-mapping.example.json` e os exports do
`packages/engine`. Sobrou uma linha de dado semeado na migração 0000 (uma
"referência de código" apontando para o importador) — migração aplicada é
histórico, não se reescreve, e a tela que a exibia já não existe.

O teste da aba virou **guarda de remoção**: em vez de sumir com o resto, ele
agora exige que não haja nenhum botão nem texto de Graphify na jornada, e que
sobrem as duas abas certas. Feature removida sem guarda volta num merge
distraído, e ninguém percebe.

README e CONTEXTO-E-ARQUITETURA foram corrigidos junto — documentação que
descreve uma feature que não existe é pior que documentação faltando. 215
engine + 473 web; 62/62 E2E (um a menos, o da própria feature).

## 213. Varrendo a CLASSE do bug, não o bug

O §210 foi um estado que sobrevivia à troca de demanda. A pergunta certa
depois disso não é "consertei?" e sim "o que MAIS vive assim?". Varri o estado
do App atrás de tudo que descreve a demanda atual: a revisão derivada, o
diagrama, o contexto do épico, os rascunhos do assistente.

**Achado — o painel do assistente.** Com a aba "Contexto do épico" aberta,
trocar de demanda mantinha o texto da anterior no campo: o painel guarda o
rascunho num `useState(demandInfo)`, inicializado UMA vez, e ninguém o
desmontava. Pior que exibir errado — o próximo "Salvar" gravaria o contexto da
demanda velha na demanda nova. Corrigido fechando a aba do assistente no
`aoAbrir`: reabrir remonta o painel, que então lê o contexto de quem está
aberto agora. Vale para as três abas, e as três guardam rascunho.

**Não-achado, e por que ele importa.** A revisão derivada NÃO vaza, mas não
por cuidado: a tela de revisão é cheia e cobre o ☰, então não existe caminho
para trocar de demanda com ela aberta — e fechá-la já limpa o resultado. Meu
primeiro teste percorria exatamente esse caminho impossível e passava com
qualquer código. Troquei por um que pode falhar: os nós da demanda anterior
sumindo do canvas (mordido injetando um `aoAbrir` que não troca o diagrama).

Fica a régua: quando um teste passa de primeira num defeito que você está
caçando, desconfie do teste antes de comemorar o código. Nesta rodada isso
aconteceu duas vezes — aqui e no §210, onde o auto-retry esperava o defeito
sumir.

473 web unit; 64/64 E2E, duas rodadas completas seguidas.

## 214. As outras trocas de contexto: produto e pessoa

Fechando a varredura do §213 nas duas trocas que faltavam.

**Produto da demanda.** Trocar o produto tem que trocar o que o modelo lê. O
teste escolhe o produto A, olha o prompt real pela simulação (sem gastar
chamada), troca para o B e cobra que o glossário de A tenha SAÍDO e o de B
entrado. Mordida: fixar a dependência do efeito que recarrega o contexto →
prompt com o produto errado (vermelho). Este é o lugar onde o defeito custaria
mais caro: um contexto "pregado" faz o item ser escrito com o vocabulário do
produto errado, e ninguém desconfia lendo o resultado.

**Pessoa na sessão.** Sair e entrar com outro e-mail no mesmo navegador não
pode deixar nada da sessão anterior — aqui o vazamento não seria confusão,
seria material de uma pessoa aparecendo para outra.

Esse segundo é **rede, não descoberta**: hoje o `sair` faz `setSessao(null)` e
a árvore inteira desmonta, então o estado morre junto. Para não ficar um teste
que passa por construção, validei contra o defeito mais plausível que alguém
introduziria — "não perca seu trabalho": guardar a quebra no `localStorage` e
reidratar no boot. Com essa injeção, o teste fica vermelho. É o que ele existe
para pegar.

66/66 E2E, duas rodadas completas seguidas.

## 215. Avaliar a migração pro Forge antes de existir cliente

Rodada de pesquisa, não de código: ver se o Gerador cabe num app Forge do Jira
com o Rovo como única IA no MVP, e o que isso custa. Saída em
[`SPEC-55-avaliacao-migracao-forge.md`](SPEC-55-avaliacao-migracao-forge.md).

**O achado que muda a conversa:** existe a **Forge LLMs API** (`@forge/llm`,
Preview liberada pra produção e Marketplace) — Claude Opus 5 / Sonnet 5 / Haiku
hospedados pela própria Atlassian, com tool use e streaming, sem chave de API e
sem nada saindo da plataforma. Isso não "integra o Rovo": substitui o
`packages/llm` inteiro (4.329 linhas), o cofre de credenciais, os presets de
gateway e o container Ollama que o README ensina a subir. O problema que o
README resolve em três parágrafos ("se o seu ambiente bloqueia a API do
Claude — o caso comum em rede corporativa") deixa de existir.

**O que a arquitetura hexagonal comprou.** A SPEC-31 pagou pelas portas por
outro motivo — matar a divergência entre modo local e hospedado. O retorno
chega aqui: trocar Postgres por Forge SQL é escrever `*EmForgeSql.ts` ao lado
de `*EmPostgres.ts` com os mesmos testes de contrato apontando pros dois.
Engine + aplicação (10.914 linhas) atravessam sem edição, porque não sabem quem
os implementa. Sem as portas, esta avaliação teria terminado em "reescreve".

**O banco não era o problema.** Era a preocupação declarada no pedido e é o
item mais barato: sem dado em produção, é recriar 23 tabelas em TiDB (dialeto
MySQL) com o Drizzle que já usamos. Duas ressalvas reais: Forge SQL **não tem
chave estrangeira** — e o schema tem 18, várias com `onDelete: cascade`, que
viram exclusão explícita no adaptador (é ali que nasce item órfão de quebra
apagada); e a instalação do app vira o tenant, então `organizacoes`, `times`,
os quatro de RBAC e `credenciais_ia` provavelmente somem. De 23 tabelas para
~13–15.

**O problema de verdade são 25 segundos.** É o teto de uma invocação disparada
por usuário. A esteira de agentes é 4 agentes × N itens e o README mede ~3min40
por item em CPU. Não é adaptação: é a SPEC-24 reescrita para async events (teto
de 900 s) com progresso consultável e reentrância por item. Orçar como
reescrita, não como port.

**Duas features não cabem, e vale dizer o nome.** A Forge LLMs é **texto puro**
— sem visão, sem áudio. O 🎤 Falar (Whisper) e o 🖼 Anexar imagem saem do MVP
Rovo-only. As saídas existem (Forge Containers em Preview, egress declarado),
mas todas contradizem o "só Rovo" ou custam o selo *Runs on Atlassian*.

**O E2E é o que eu mais temo perder.** A tela passa a viver num iframe dentro
de um site Atlassian real — caro e frágil pros 66 casos. O §123 já ensinou o
preço de deixar essa suíte morrer (quatro defeitos no vão que só um navegador
enxerga). Plano em duas faixas: os 66 casos contra o bundle standalone com um
`@forge/bridge` falso — mesma técnica do `gatewayFalso.ts` que já está no
repositório — e meia dúzia de smoke contra site de desenvolvimento de verdade
no deploy de staging.

**O buraco que sobrou, e não escondi.** A franquia grátis de LLM do Forge é
**zero crédito**, e a conta é do desenvolvedor do app, não do cliente. Sem
medir uma quebra real contra `@forge/llm` não dá pra dizer se o app se sustenta
de graça. É a pergunta mais importante em aberto e é medível na fase 2 do
roteiro — junto com a única outra que documentação nenhuma responde: se o React
Flow se comporta dentro do iframe com a CSP do Forge.

Nada de produção mudou nesta rodada. 66/66 E2E permanecem verdes no `main`.

## 216. O app é interno — e isso derruba metade das preocupações do §215

Esclarecimento do usuário depois de ler a SPEC-55: *"essa é uma aplicação que
gostaria de pôr em um dev space da empresa onde trabalho, não publicar para
qualquer pessoa instalar (…) publisher e usuário seriam a mesma pessoa"*.

Isso não é um detalhe de distribuição. Reescreve quatro conclusões:

**A pergunta mais assustadora do §215 desinflou.** Eu tinha escrito que a
franquia grátis de LLM do Forge é zero crédito e que a conta é de quem publica
o app — tratando isso como risco de modelo de negócio ("o app não tem como
repassar isso sem ser pago"). Com publisher e usuário sendo a mesma empresa,
não há repasse a fazer: é a empresa pagando o próprio uso, como pagaria por
qualquer API de IA. Continua precisando ser medido, mas o risco muda de "o
produto é insustentável" para "a conta é maior ou menor que a alternativa".

**O selo *Runs on Atlassian* trocou de dono do argumento.** Eu o tinha vendido
como diferencial de Marketplace. Não serve mais pra isso — e ficou mais útil:
o README de hoje ensina, em três parágrafos, a subir um Ollama em container
"se o seu ambiente bloqueia a API do Claude — o caso comum em rede
corporativa". Ou seja, o produto contorna a política de segurança da empresa
que vai usá-lo. Com `@forge/llm` o modelo roda dentro de uma plataforma que a
empresa já aprovou, sem chave, sem egress, sem hostname novo pra liberar no
proxy. Num app interno isso vale mais que qualquer selo: é a diferença entre
"aprovado" e "em análise pela segurança há três meses".

**Voz e imagem deixaram de ser impossíveis e passaram a ser adiadas.** Sem
revisor de Marketplace, declarar egress externo ou subir um Whisper em Forge
Containers é decisão só da empresa. Mantive a recomendação de cortar, mas por
outro motivo: reintroduzir egress no dia 1 joga fora o argumento do parágrafo
anterior exatamente na conversa em que ele mais rende.

**Apareceu uma fase −1, e ela não é de engenharia.** A cobrança do Forge é por
Developer Space, numa conta ligada a ele. O espaço precisa ser **da empresa**,
com billing admin da empresa — não a conta pessoal de quem desenvolve. É a
única coisa desta migração que não se resolve escrevendo código, não depende de
nenhuma outra fase, leva o tempo que a burocracia levar, e bloqueia tudo depois
do ambiente de desenvolvimento. É o tipo de item que só se descobre estar no
caminho crítico quando já é tarde — por isso virou fase −1 e não um parágrafo
no fim.

Fica a régua da rodada: **"pra quem é" é pergunta de arquitetura, não de
go-to-market.** A SPEC-55 tinha sido escrita sem ela e chegou a conclusões
tecnicamente corretas com o peso todo errado.

Nada de produção mudou. Só a SPEC-55.

## 217. Deploy e instalação não são a mesma etapa

Pergunta do usuário sobre a SPEC-55: *"tem como instalar por interface?"*

Tem — e a pergunta expôs um erro de estrutura no §2.9, não uma lacuna de
pesquisa. Eu tinha listado "instalar pelo CLI" e "link de instalação" como dois
**caminhos alternativos**, quando são duas **etapas diferentes**:

- **Publicar é sempre CLI.** Não existe upload de app por tela; o código só
  chega na plataforma via `forge deploy`, rodado por alguém ou pela CI.
- **Instalar pode ser inteiramente por interface.** Developer Console →
  Distribution → Edit → Sharing gera um link; o admin do site abre no navegador,
  vê as permissões pedidas, escolhe site e produto num dropdown, confirma.
  Atualizações depois saem pela página Connected apps. Quem instala nunca toca
  no CLI.

O desenho que isso recomenda: **CI faz o deploy, admin instala pelo navegador.**
Ninguém no time precisa do CLI além de quem mexe no pipeline. O texto anterior
sugeria o oposto — que rodar CLI contra cada site fosse "o nosso caminho".

**Achado de brinde, que amenizou um risco que eu tinha exagerado:** existe
*rolling releases*, que separa o deploy do código da aprovação de escopo. O que
for compatível sobe enquanto o admin ainda não aprovou as permissões novas.
O major version upgrade que o módulo `llm` dispara continua exigindo aprovação,
mas não trava o release inteiro esperando um clique — que foi como eu descrevi
no §216. Corrigido no lugar em vez de virar nota de rodapé.

Régua: quando uma pergunta simples do usuário não tem resposta óbvia no
documento, desconfie da **organização** do documento antes de sair pesquisar
mais. Aqui os dois fatos já estavam na SPEC — arrumados de um jeito que
respondia a pergunta errada.

Nada de produção mudou. Só a SPEC-55.

## 218. Homologação: o que hoje custaria uma segunda VM é uma flag

Pergunta do usuário: *"precisaria de um ambiente de homologação"*.

Já vem de fábrica. `forge create` cria `development`, `staging` e `production`,
e dá pra criar mais com `forge environments create`. Homologar é
`forge deploy -e staging` — sem VM, sem DNS, sem segredo novo.

**Medi o contraste antes de escrever, e ele é maior do que eu esperava:** hoje
o projeto **não tem homologação nenhuma**. `deploy.yml`,
`docker-compose.prod.yml` e `infra/README.md` não mencionam staging em lugar
nenhum — é uma VM, um banco, um domínio. Montar homologação no desenho atual
seria segunda VM, segundo Postgres, segundo DNS, segundo conjunto de segredos
no Infisical e segundo alvo no Terraform. Isso reforça o §215 num ponto que eu
tinha tratado como economia de manutenção: não é só o que deixa de ser mantido,
é o que passa a existir sem ninguém construir.

Três fatos da plataforma que decidem o desenho:

- **Ambientes são firewalled entre si e não compartilham dado do app.**
- **Tetos diferentes por ambiente** — Forge SQL dá 1 GiB em produção mas
  **256 MiB em staging**. Homologa; não recebe cópia de produção.
- **`forge tunnel` e `forge logs` funcionam em staging e NÃO em produção.** Este
  é o argumento operacional que eu não tinha: homologação não é só onde se
  testa, é o único lugar onde se **observa** o app rodando.

**A armadilha, e ela tem nome.** Múltiplos ambientes podem ser instalados no
mesmo site Jira — o que é ótimo, porque homologa contra dado real. Mas o dado
do *app* é que é isolado; o *Jira* é o mesmo. Diagrama, derivação, esteira e
PDCA gravam só no storage do app e não vazam. **A exportação pro tracker
(SPEC-49) cria work items de verdade.** Homologar exportação contra o site de
produção é gerar lixo em backlog real. Saída barata: um projeto Jira dedicado à
homologação no mesmo site. Sandbox só se a empresa já tiver Premium/Enterprise
— e app Forge tem limitação conhecida ali (ECO-99), que sendo o nosso sem
licença provavelmente não pega, mas se confirma testando.

Régua da rodada: **"isso já existe hoje?" antes de "quanto custa lá?"**. Eu ia
descrever o staging do Forge como paridade com o que temos. Não é paridade — é
uma capacidade nova, e vender como empate teria escondido um dos melhores
argumentos da migração.

Nada de produção mudou. Só a SPEC-55.

## 219. Não vamos migrar — e o que travou não foi técnico

Decisão do usuário, textualmente: *"não vamos migrar, decidido"*.

> **Correção (§220).** A versão original desta entrada dizia que o motivo era a
> credencial `silvioaltr@gmail.com` não ser admin da Atlassian. Errei: a frase
> do usuário era sobre o **cadeado dentro do próprio Gerador**, defeito de RBAC
> na tela que não tem nada a ver com Forge. A decisão de não migrar continua
> valendo; a causa que atribuí a ela, não. Os dois parágrafos abaixo sobre
> "o que travou" estão, portanto, errados — ficam visíveis de propósito, porque
> apagar o raciocínio esconderia como se chega a uma conclusão plausível e
> falsa: o motivo real estava disponível, e eu preferi o que casava com a
> pesquisa que eu acabara de fazer.

Registrado no topo da SPEC-55 com data e citação, para o documento não virar um
plano fantasma. Quatro rodadas de pesquisa (§215–§218) produziram uma avaliação
que dizia "cabe, e aqui está o roteiro" — sem esse carimbo, alguém abre o
arquivo daqui a três meses e trata a §9 como fila de trabalho.

**O que travou é o que a própria avaliação já tinha nomeado.** O §216 criou uma
"fase −1" — Developer Space da empresa, com billing admin da empresa — e a
descreveu como *"a única coisa desta migração que não se resolve escrevendo
código (…) o tipo de item que só se descobre estar no caminho crítico quando já
é tarde"*. E a §2.9 registrou que um admin de site precisa instalar o app.

Não descobrimos tarde: descobrimos antes de escrever qualquer linha de código
Forge. Uma avaliação que custa quatro rodadas de leitura e mata a ideia antes da
fase 0 saiu mais barata que a fase 0 sozinha.

**Onde a avaliação errou o peso.** Eu tratei os três riscos técnicos — 25
segundos de invocação, ausência de multimodal, `@forge/llm` em Preview — como
as perguntas difíceis, e o acesso organizacional como item de checklist a
disparar em paralelo. Foi ao contrário. As três perguntas técnicas tinham
resposta na documentação; a de acesso não tinha resposta em documentação
nenhuma, e era a única capaz de encerrar o assunto sozinha.

A régua que fica: **num app que roda dentro da plataforma de outra empresa,
"quem tem qual permissão" é requisito de viabilidade, não pré-requisito de
deploy.** Vale checar antes de medir latência de LLM.

O produto segue no modo hospedado da SPEC-33, sem mudança. Nada de produção foi
tocado em nenhuma das cinco rodadas.

## 220. A tela trancava o que o servidor liberava

Relato do usuário: *"minha credencial para acessar todas features na aplicação,
quase tudo está com cadeado"*. Investiguei achando que era nível de time.
Não era.

**O que o banco de verdade disse.** `silvioaltr@gmail.com` é **owner** de
`time-silvio` — o nível mais alto. E `/permissoes/minhas` devolvia:

```
{"rbacAtivo":true,"porRecurso":{"acessos":["editar"]},"nivel":"owner"}
```

Dois papéis existiam na organização: "Administrador" (só `acessos:editar`) e
"Arquitetura" (**zero** permissões). Nenhum deles trancava nada de propósito —
mas **existir papel é o que LIGA o RBAC**, e a partir daí a tela passou a
esconder tudo que não fosse grant explícito.

**A prova de que era a tela, não o servidor.** `POST /campos-no` com corpo
vazio, com a sessão do usuário: **400 de validação, não 403**. O servidor
autorizava a escrita que a tela apresentava trancada.

**O defeito.** `usePermissoes.pode()` reimplementava metade da regra:

```ts
if (!hospedado || !rbacAtivo) return true;
return dados?.porRecurso?.[recurso]?.includes(acao) === true;  // só o eixo RBAC
```

O servidor tem **dois eixos** (SPEC-38 D3): `exigirPermissao` deixa o owner
escrever sempre, e quem não é owner precisa de grant; `exigirEdicaoCurada` é a
exceção — no recurso que algum papel carrega, o grant manda inclusive sobre
owner. A tela só conhecia o segundo pedaço do primeiro eixo.

**O comentário que previu o bug e ninguém foi conferir.** O spec
`rbac-cadeado-e-pedido` já dizia, na abertura: *"O usuário do teste entra com
nível `operar` — owner passaria pelo bypass da SPEC-38 e o teste mediria o
portão errado"*. Estava certo sobre o servidor. Ninguém escreveu o caso do
owner na TELA, que é onde o bypass não existia. Fica a régua: **comentário que
justifica NÃO testar um caminho é candidato a teste, não a documentação.**

**A correção.** O eixo que faltava não dava pra deduzir no cliente: `porRecurso`
diz o que EU tenho, nunca se OUTRO papel carrega o recurso — e é isso que liga
a curadoria. Então o servidor passou a contar: `/permissoes/minhas` ganhou
`curados`, alimentado por um `recursosCurados()` que é a mesma consulta que o
`exigirEdicaoCurada` já fazia. Com os dois eixos em mãos, `pode()` espelha a
regra inteira. `curados` ausente **fecha** o eixo em vez de chutar — abrir demais
mostraria botão que devolve 403, que é pior que cadeado porque promete e falha.

**Aferido, não presumido.** Antes de escrever teste, reproduzi contra o banco de
desenvolvimento e contra a stack rebuildada: menu aberto no navegador com o
usuário real, **12 áreas, zero cadeados** (era só "Acessos" antes). As duas
suítes novas foram mordidas: revertendo o `pode()`, 2 unitários e o E2E novo
ficam vermelhos — e o E2E prova os dois eixos na mesma tela, porque o recurso
curado por outro papel continua trancado até para o owner.

1.082 unitários, lint limpo, 67/67 E2E.

**Correção do §219 junto.** Eu tinha registrado que a decisão de não migrar pro
Forge veio desta credencial não ser admin da Atlassian. Era este cadeado aqui,
que não tem nada a ver com Forge. A decisão continua; a causa que atribuí a
ela, não. Deixei o raciocínio errado visível na entrada, porque apagá-lo
esconderia como se chega a uma conclusão plausível e falsa: o motivo real
estava disponível, e eu preferi o que casava com a pesquisa que eu acabara de
fazer.

## 221. O cadeado sai: o que ela não edita some do menu

Pedido do usuário: *"nesse cenário de não ter permissão não exibir o cadeado e
sim ocultar o botão do menu"*.

Mudança pequena de código, mas reverte uma decisão de produto da SPEC-51, e
vale registrar o que ela custava e o que ela comprava.

**O que a SPEC-51 tinha decidido.** O item continuava no menu, com 🔒, clicável
— e a tela de destino explicava a ausência de permissão e oferecia "pedir
ajuste". A justificativa era boa: o menu DIZ o que a pessoa pode, em vez de
levar a uma tela que não é a que ela clicou (o comportamento pré-SPEC-51 caía
na primeira área permitida). O cadeado era, ao mesmo tempo, sinal e porta.

**O que muda agora.** Menu é a lista do que se ADMINISTRA; listar o que não se
administra é ruído em toda abertura para ganhar um caminho usado raramente.
Item sem permissão some.

**O detalhe que quase virou defeito.** O grupo "Produto" tem um item só. Sem
filtrar no nível do GRUPO, negá-lo deixaria o título de pé apontando para o
nada. Filtrei antes de decidir se o grupo renderiza, e escrevi o teste do
cabeçalho órfão junto — é o tipo de coisa que ninguém percebe até ver a captura
de tela de um usuário.

**O que NÃO morreu junto, e por que verifiquei antes de afirmar.** Ocultar
remove a descoberta do pedido de ajuste pelo menu. Fui ver se o pedido morria
com ela: não morre. As áreas são deep-linkáveis por hash (`#/config/pipeline`,
`rota.ts`), então quem chega por link continua caindo na tela de "sem
permissão" com o pedido ali; e a condução do PDCA oferece "pedir ajuste" a quem
não é owner. O E2E foi reescrito para percorrer exatamente esse caminho — ele
cobria o pedido pelo cadeado, agora cobre pelo link, e a cobertura do pedido
não caiu por causa de uma mudança de menu.

**Uma armadilha de teste que valeu o tempo.** Navegar por hash NÃO remonta o
app: o menu aberto ficava na frente e interceptava o clique da tela de destino.
O Playwright reportou `<button>Exportação (tracker)</button> intercepts pointer
events` — sintoma que parece defeito do produto e é do teste. Fechar o menu
explicitamente antes de navegar, e afirmar que ele fechou.

Mordidas nos dois níveis: voltando a listar tudo, o unitário do menu e o E2E
ficam vermelhos. 7 testes no `MenuLateral`, 67/67 E2E.

## 222. A tela inicial vira "mesa de projeto"

Pedido do usuário: *"renomear a tela inicial para mesa de projeto"*.

O nome não existia num lugar só — existia como **jargão vazando**. "Canvas" é
o nome do componente React (`canvas/Canvas.tsx`), do tipo da rota
(`tela: "canvas"`) e do hook de momentos (`momentoDoCanvas`); em algum ponto
atravessou a fronteira e virou texto de botão. Quatro telas diferentes tinham
um "Voltar ao canvas", e a jornada, o modal de cenários e a conversa falavam a
mesma língua de implementação com quem usa.

**A régua que segui:** trocar onde é INTERFACE, não onde é código. Ficaram
`Canvas.tsx`, `tela: "canvas"`, `momentoDoCanvas` — renomeá-los seria churn sem
leitor. Saíram os 13 pontos de texto visível: "Voltar ao canvas" (×4),
"Aplicar ao canvas", "Carregar no canvas", "+ Adicionar ao canvas", o
`aria-label` dos cenários, "Campos preenchidos no canvas", a fala do assistente
e a descrição da jornada. E dois comentários que CITAVAM o nome do botão — se
não trocasse, o próximo a ler procuraria por um botão que não existe mais.

**Assert antes e depois de cada troca.** Cada substituição verifica que o texto
velho existia, que o novo entrou e que o velho não sobrou. Não é zelo
decorativo: um `replace` que não casa é silencioso, e o resultado é rename pela
metade — exatamente o estado que produz dois nomes para a mesma tela.

**A varredura pegou o que eu tinha esquecido.** Os testes usam o rótulo como
seletor, então o rename quebra a suíte se ela não for junto: 26 ocorrências em
14 arquivos de teste/E2E. Mesmo assim escapou uma — `jornada-e-cenarios.spec`
monta o `aria-label` com o título literal do cenário, não com template, e só o
E2E vermelho mostrou. Foi por isso que a varredura final passou a procurar por
`name:` e `getByText` com "canvas" dentro, em vez de confiar na lista de pares.

**Guarda de renome, no espírito da guarda de remoção do §212.** Um teste cobra
que o nome NOVO está lá e que o VELHO não voltou. Rename sem guarda volta num
merge distraído e passa a conviver com o novo — e dois nomes concorrentes para
a mesma tela são pior que um nome ruim sozinho.

README e CONTEXTO-E-ARQUITETURA foram junto onde nomeiam a TELA; onde "canvas"
é termo técnico (React Flow, canvas SVG do plano original) ficou como está.

479 unitários do web, 67/67 E2E, build e lint limpos.

## 223. SimArch: o que dá pra trazer sem trazer o motor

Pedido: avaliar o SimArch (github.com/wendelmax/SimArch) atrás de insights
sobre simulação, cenários, diagramas, configuração e construção de itens.
Saída em [`SPEC-56-avaliacao-simarch.md`](SPEC-56-avaliacao-simarch.md).

**A primeira coisa que achei não foi técnica.** O repositório **não tem arquivo
de licença** — sem `LICENSE`, e a API do GitHub devolve `licenseInfo: null`.
Sem licença o padrão é todos os direitos reservados: legível, não reutilizável.
Isso decidiu o formato da avaliação inteira antes de eu ler uma linha de C#:
avalio **ideias, não código**. Somos Apache-2.0 e dependemos de proveniência
limpa; um trecho traduzido de lá seria dívida que não aparece em teste nenhum.

**O que os dois projetos são, lado a lado.** O SimArch pergunta "esta
arquitetura aguenta?" e responde com simulação estocástica. Nós perguntamos "o
que precisa ser construído?" e respondemos com derivação determinística. São
complementares — e é por isso que a leitura rendeu.

**A recomendação que contraria a intuição do pedido: não trazer o motor.**
Quatro razões, e a primeira é a que importa. O CONTEXTO §2 diz que atividade só
nasce de `derivar()`, nunca de algo que interpretou. Não é estética: o produto
inteiro — proveniência, semáforo, falhar alto — existe contra valor sem origem
confiável. Um simulador produz número que depende de latência chutada e de um
`seed`. Pôr esse número ao lado de um item derivado é convidar a confundir os
dois. Somam-se: o que ele mede não é o que perguntamos; o motor de lá tem 228
linhas, simula **só o primeiro fluxo** e é laço de passo fixo apesar do nome
"DiscreteEvent"; e não pode ser copiado de qualquer forma.

**O caminho barato que existe no lugar dele.** Com política de resiliência
estruturada, dá pra dizer sem `Random` nenhum que três serviços em cadeia com
timeout de 300ms e retry 3x têm pior caso de 2,7s e estouram o SLA de 1s
declarado na entrada. Aritmética sobre o diagrama, função pura, mesma família
do `derivar()` — simulação de **pior caso**, não de amostra, e que sobrevive a
auditoria.

**O que vale trazer é vocabulário, não motor.** Cinco ideias, e a de maior
retorno é a mais chata: **políticas de resiliência como campo estruturado** em
vez de texto livre. Lá é `RetryPolicy { max, backoffMs, exponential }`; aqui é
um item de checklist perguntando "definiu retry?". A diferença aparece no item
derivado — com texto, produzimos *"definir política de retry"*, um item que
devolve a pergunta a quem a fez; com estrutura, produzimos *"retry 3x com
backoff exponencial de 100ms e DLQ ao esgotar"*, com o Gherkin saindo junto e os
números dentro. Isso ataca o coração do produto, e o CONTEXTO §5.2 já listava
campo estruturado como dívida aberta.

As outras: **restrição paramétrica** (`p95 < 200ms` como critério verificável e
rastreável, útil mesmo sem nada para avaliar contra), **rastreabilidade
requisito-elemento com gap analysis** (é prontidão de outro tipo — hoje o
vermelho diz "falta preencher", podia dizer "este requisito não tem componente
que o atenda"), **perfil do diagrama** ("isto é Black Friday" mudando as
perguntas do painel via as condições `when` que o engine já avalia) e **ADR
ancorado no nó**.

**A régua que apliquei em cada uma:** só entra se couber no mecanismo que já
existe, e se não abrir porta pra texto solto. Requisito sem link é gap a
mostrar, não item a gerar; ADR é de um nó, não caixa de texto no topo da quebra.
Foi essa régua que separou "ideia boa" de "ideia boa pra outro produto".

**Sobre o visual, que o usuário pediu para preservar:** os dois usam React +
ReactFlow, então a comparação é justa — e manter o nosso não é gosto. Nossa
camada visual carrega mecanismo: o semáforo por nó, a proveniência por campo, a
esteira animada e a conversa como interface são o produto se explicando
enquanto a pessoa trabalha. O único empréstimo que vale considerar é aditivo:
um painel inferior de linha do tempo.

Nada de produção mudou nesta rodada.

## 224. O nível de abstração errado, e o que apareceu no nível certo

Correção do usuário sobre o §223: *"faltou um pouco de abstração na análise, a
ideia seria evoluir a mesa de projeto de forma geral (…) quanto ao motor de
simulação especificamente talvez sequer nem seja tão útil, na minha opinião
praticamente tudo pode ser feito com cálculo aritmético"*.

Ele está certo em dois níveis, e o segundo é o que dói.

**Nível óbvio:** gastei o documento decidindo "copiar ou não copiar o motor",
que é uma pergunta de catálogo de peças. O pedido era sobre **evolução da mesa
de projeto**. E a conclusão sobre o motor — a única coisa que a v1 defendeu com
força — o usuário já tinha, sozinho, em uma frase.

**Nível que interessa:** ao listar feature por feature, eu tratei doze itens
como doze ideias independentes e ranqueei por "esforço × retorno". Errado. No
nível certo, **oito das doze são consequência de duas primitivas ausentes**, e
isso só aparece quando se pergunta o que elas têm em comum em vez de o que cada
uma custa.

**A tese, reescrita:** hoje a mesa modela COMPONENTES; falta o **percurso** e o
**número**. Trigger é o começo de um caminho; fallback é bifurcação de um
caminho; latência, volume e custo são grandezas que se acumulam ao longo de um
caminho; cenário é trocar as grandezas na entrada; A vs B é rodar o mesmo
caminho em dois desenhos; conflito arquitetural é regra sobre a forma do
caminho. `Diagrama { nodes, edges }` é grafo de coisas, não de caminhos.

**Duas medições que a v1 não tinha feito e que mudaram o texto:**

- `TipoCampo` já inclui `"number"` — e **nenhum cálculo no engine consome esse
  número como número**. Ele é preenchido, validado, renderizado; nunca somado
  nem comparado. Hoje `number` é um texto que só aceita dígitos. É por isso que
  a segunda primitiva não é "número", é **número com unidade e regra de
  composição**.
- `detectarConflitos()` existe, e detecta três coisas — todas sobre o **grafo
  de atividades derivadas**, nenhuma sobre o **desenho**. "Validação de
  conflito arquitetural" é gap de verdade, não feature parcial.

**E uma correção do que eu tinha afirmado na v1:** escrevi que campo
estruturado era dívida aberta, citando o CONTEXTO §5.2. Está desatualizado —
`TipoCampo` já tem `lista` com `itemSpec`, a SPEC-18 entregou. Citei
documentação em vez de conferir o código, e a documentação envelheceu.

**Dois achados colaterais, do tipo que este projeto normalmente não deixa
passar:** o `validateConfig` confere `when.field`, referências de `{{template}}`
e tipo de nó destino — e **nunca o `type` do campo**; um `"type": "lixo"` passa
em silêncio, mesma classe da "falha ABERTA" que o comentário do `RECURSOS`
nomeia no servidor. E o `config/diagrama.schema.json` declara só quatro dos seis
tipos (faltam `textarea` e `lista`, que o `diagrama.example.json` usa) e não é
referenciado por código nenhum — tooling de editor que hoje desinforma quem
escreve config à mão.

**A régua que fica:** quando uma avaliação vira lista ranqueada de features, é
sinal de que parei no nível errado. Feature é sintoma; a pergunta é qual
primitiva ausente produz aquele conjunto de sintomas. E antes de escrever "não
temos X", medir no código — duas das minhas afirmações da v1 vieram de
documentação, e uma estava errada.

Nada de produção mudou nesta rodada.

## 225. Monte Carlo: a pergunta certa não é matemática, é de proveniência

Pergunta do usuário depois de ler a §4 da SPEC-56: *"seria útil rodar algo como
Monte Carlo com esses dados? seria uma engine diferente da que existe no
projeto"*. Registrado em SPEC-56 §12.1.

**Primeiro tive que admitir um defeito do que eu mesmo propus.** A aritmética de
pior caso **grita lobo**: somar tetos ao longo de oito saltos de 300ms dá 2,4s,
número que por construção quase nunca acontece — exigiria todos os saltos
estourando na mesma requisição. Alerta que aparece em todo caminho com mais de
três nós é alerta que se aprende a ignorar. Pior caso é honesto e barato, e é
uma régua grosseira; eu tinha recomendado sem dizer isso.

**Onde Monte Carlo não é refinamento, é correção.** Três casos, e o segundo é o
forte:

1. cauda de uma cadeia — p99 de uma soma não é a soma dos p99, e a conta
   analítica pede convolução; amostrar é mais simples que resolver;
2. **fan-out** — um nó que chama N serviços em paralelo espera pelo MÁXIMO. Com
   p99 de 100ms cada, a chance de nenhuma passar disso é `0,99^N`: com N=100,
   **63% das requisições pegam pelo menos um salto lento**. O pior caso diz
   "300ms", a média diz "40ms", e as duas estão erradas sobre a experiência
   real;
3. probabilidade de completar dentro do orçamento com retry, backoff e fallback
   interagindo.

Nos três a aritmética não é conservadora — é **errada**, que é diferente de ser
grosseira.

**O portão, e é aqui que a resposta deixa de ser sobre matemática.** Monte Carlo
não cria informação: compõe as distribuições que recebe. Alimentado com chute,
devolve o chute com intervalo de confiança em volta — a aparência de rigor sem
ganho de conhecimento, que é exatamente a falsa precisão contra a qual a
proveniência deste projeto existe.

E o mecanismo para decidir isso **já está no modelo**: `Origem = manual |
extraido | inferido | sugerido`, com `evidencia` em cima do `extraido`. A regra
sai sozinha, na mesma forma do §6.4 do CONTEXTO: distribuição construída sobre
valor `manual` não produz número que o produto apresente como achado; onde a
entrada é chute, o produto diz "não tenho medição para este trecho".

Isso partiu o diagrama em dois territórios, e a divisão explica o produto melhor
do que eu esperava: para nó `novo`, o número é uma **decisão** (um teto que
alguém escolheu honrar) e pior caso é a régua certa; para nó `existente` com
observabilidade, o número pode ser uma **medição**, e aí a distribuição é real.
A ferramenta é sobre o que ainda vai ser construído — então o território
determinístico é o maior, e isso não é limitação, é o assunto.

**"É uma engine diferente?"** Como código, não: Monte Carlo com `seed` é
determinístico (mesma entrada + mesma semente = mesma saída) e cabe como função
pura ao lado do `derivar()`. Como epistemologia, sim: `derivar()` produz fatos
sobre o desenho, Monte Carlo produz estimativa sobre a realidade. A exigência
que isso cria é de interface, não de arquitetura — se as duas aparecerem com a
mesma tipografia, a estimativa pega emprestada a autoridade do fato.

**O custo real não é o amostrador.** É pedir distribuição a uma pessoa, que
ninguém sabe responder. Mitigação concreta: pedir p50 e p99 (que estão no
dashboard dela) e ajustar uma log-normal — duas perguntas respondíveis em vez de
uma impossível.

**Como decidir sem discutir:** depois de P1+P2, medir quantos nós de quebras
reais chegam com `origem: extraido`. Se forem poucos, não há o que compor e a
resposta é "não vale". A medição é barata e encerra o assunto — no espírito do
§190: construir o instrumento em vez de continuar argumentando.

Nada de produção mudou nesta rodada.

## 226. O objetivo, enfim dito — e o que ele invalida

Correção do usuário: *"esse projeto não serve para calcular orçamento, o nosso
objetivo é evoluir a mesa para poder tomar boas decisões de desenho e de
projeto e garantir padrões consistentes que chegam até os itens que vamos
gerar (no futuro vamos evoluir em termos de specs geradas)"*.

Terceira correção de rumo na mesma avaliação, e a mais útil das três. As duas
anteriores foram sobre nível de abstração; esta é sobre **para que serve**.

**O que eu estava fazendo sem perceber.** A §4 listava orçamento de latência,
propagação de volume e custo consolidado; a §12.1 desenvolvia Monte Carlo. Isso
não é a mesa de projeto — é uma ferramenta de capacity planning, que é um
produto diferente e mais divertido de projetar. Escorreguei para ele porque a
lista do SimArch tem gravidade nessa direção e eu não tinha o objetivo escrito
para me segurar.

**A cadeia, que é o eixo e é mais simples que as oito primitivas:**

```
PROPÓSITO ──► DECISÃO ──► ELEMENTO ──► ITEM ──► SPEC
(requisito)    (ADR)     (nó/aresta)  (derivado)  (gerada)
   falta        falta       temos       temos      temos
```

A cadeia **começa no meio**. Elemento existe, item nasce dele, spec sai do item
— essa metade é o produto e funciona. Faltam os dois elos da frente, e por isso
ninguém sabe para quê um componente existe nem por que ele é assim; e,
principalmente, **não há como conferir se o padrão foi aplicado**, porque
conferir exige saber qual padrão deveria valer ali — que é o elo "decisão".

"Padrões consistentes que chegam até os itens" é, mecanicamente, essa cadeia
ligada e verificável de ponta a ponta. Nada mais que isso.

**A aritmética sobrevive, com justificativa melhor.** Não é medir arquitetura:
**é o que torna um padrão conferível em vez de opinável**. "Chamada externa tem
que ter timeout curto" é opinião; `timeout ≤ 500ms` é padrão, e um nó com 800ms
viola de um jeito que função pura detecta e vira item. O conflito aritmético
(retry 3x sob timeout de chamador mais curto) deixa de ser capacity planning e
vira o que sempre foi: **decisão internamente inconsistente**, defeito de
desenho, exatamente o que a mesa deve pegar antes de virar código.

**A ordem virou de cabeça pra baixo.** Na §13 o percurso era o passo 1, porque
eu otimizava para habilitar cálculo. Com o objetivo declarado ele é o passo 4:
o que destrava é a cadeia de propósito e decisão — requisito/rastreabilidade,
padrão verificável, ADR — e nenhuma delas depende de caminho.

**Fora do escopo, dito com todas as letras:** FinOps e Monte Carlo. Deixei a
§12.1 inteira no documento com o veredito trocado no topo, em vez de apagar: a
análise está correta e a fronteira que ela traça é útil para a próxima vez que
alguém perguntar. Só que ela responde "vai aguentar em produção?", e a mesa
pergunta "esta decisão é boa e consistente com o nosso padrão?".

**A régua que fica, e é a mais cara das três:** nível de abstração errado se
corrige relendo; **objetivo não declarado se corrige tarde**. Três rodadas
sobre o mesmo documento, e o que teria evitado as três era uma frase minha no
começo — "para que serve isto?" — em vez de assumir que a lista de features do
projeto vizinho definia o assunto. Avaliação de ferramenta de terceiro puxa o
avaliador para o objetivo DELA; ancorar no nosso é trabalho ativo.

Nada de produção mudou nesta rodada.

## 227. Medir o desenho, e a dança com o agente

Três complementos do usuário sobre a SPEC-56, na mesma linha: *"de certa forma
também é medir arquitetura (…) o usuário vai poder fazer o desenho com o apoio
do assistente, medir como ele fica com interações incríveis entre a parte
determinística e o suporte que o agente vai dar"*; *"tudo com esse visual atual
que é bonito, mas incrementado"*; e *"na mesa de projeto mesmo, interagindo com
o agente, ele vai poder entender POR QUE aquela é a melhor decisão"*.

**Primeiro, corrigi um exagero meu.** No §226 empurrei "medir" inteiro para fora
do escopo. Errado: o que sai é medir **desempenho e custo**. Medir o **desenho**
não só está dentro como **já existe** — e eu podia ter percebido antes de
escrever, porque está no código: `calcularProntidao()` é função pura, por nó,
que conta obrigatórios em aberto e pendentes de confirmação, e **já embute
proveniência** (valor `sugerido` não confirmado não conta como resolvido). O
semáforo é isso em cor; o `VERMELHO 0 / AMARELO 0` é isso agregado.

Então não é criar medição, é **generalizar a que existe de uma dimensão para
várias**: completude (temos), conformidade a padrão, propósito (requisito
órfão), consistência (decisões que se contradizem), confiança (quanto do desenho
é decidido vs sugerido não confirmado) e forma (fan-out, profundidade, ponto
único de falha). Todas com a mesma assinatura do que já existe.

A dimensão **confiança** é a que mais me chamou atenção: o dado já está lá,
campo a campo, e ninguém agrega. "Este desenho está 40% apoiado em sugestão não
confirmada" é medida honesta, barata, e muda comportamento.

**A divisão de trabalho que faz o ciclo funcionar** — e esta é a tese de produto
mais forte da avaliação inteira, e não veio do SimArch, veio do usuário:

- **engine mede e acusa** (fatos), nunca opina;
- **agente explica, ensina o porquê e propõe**, nunca mede nem decide;
- **a pessoa decide**, e a decisão fica com proveniência.

O agente nunca produz a medida — ele a lê. É a linha que impede o LLM de virar
fonte de número. E é mútuo: a medição é o que torna o agente bom (ele para de
adivinhar o que está errado e passa a ler), e o agente é o que torna a medição
útil ("acoplamento 9" não ajuda ninguém; conversa sobre isso, sim).

**A interação que mais me animou, porque é quase de graça:** o agente propõe, e
o engine **mede a proposta como se aceita**, mostrando o delta antes de a pessoa
confirmar — *"vira 4 de fan-out em vez de 9, e resolve duas violações"*. A peça
que faz isso funcionar já está pronta: proposta entra como `origem: sugerido` e
a prontidão já a ignora até confirmar. Medir duas vezes — só o confirmado, e o
confirmado mais o sugerido — e mostrar a diferença é aritmética sobre mecanismo
existente.

**E o ADR deixou de ser documentação.** Quando o usuário disse "entender por que
aquela é a melhor decisão", o ADR encontrou sua função real: é **de onde o
agente tira a explicação**. Acusa-se a violação, e o agente responde por que o
padrão existe, citando a decisão que o originou. O ciclo se alimenta: decisão
nova vira ADR, ADR vira a explicação da próxima vez, a explicação forma quem
desenha.

Isso muda o que a mesa é: de lugar onde o padrão é **cobrado** para lugar onde
ele é **ensinado**. E é resposta melhor à pergunta do CONTEXTO §1 — forçar a
decisão sem explicar produz obediência; explicar produz critério.

**Com uma válvula obrigatória:** às vezes a resposta certa é violar o padrão.
O ciclo tem que aceitar e **registrar** — quem decidiu, por quê —, virando
emenda ao ADR. Sem essa saída, a pessoa aprende a ignorar o vermelho, e aí a
medição inteira morre. Isso não é concessão, é o que mantém o mecanismo vivo.

**Visual: incremento de dimensões, não de estética.** A linguagem já é a certa.
O semáforo do nó ganha mais razões no popover que já existe; o `VERMELHO/AMARELO`
do topo vira placar do desenho com o "Próximo pendente" navegando por qualquer
dimensão; a aresta ganha sinal próprio (padrão de caminho não cabe no nó); a
esteira animada serve à proposta sendo medida; e o painel inferior é onde a
conta se explica. O princípio: **a medida aparece onde a decisão é tomada**, não
numa aba de relatório — semáforo funciona porque está em cima do que se está
editando.

Nada de produção mudou nesta rodada.

## 228. O fluxo antes do código

Pedido do usuário: *"o fluxo de trabalho deve ficar claro antes de codarmos"*.
Saída em [`SPEC-57-fluxo-da-mesa-de-projeto.md`](SPEC-57-fluxo-da-mesa-de-projeto.md).

A SPEC-56 acumulou o **quê** ao longo de quatro correções — a cadeia
propósito→decisão→elemento→item→spec, as seis dimensões de medida, a divisão de
trabalho com o agente. Faltava o **como se trabalha**, e sem isso qualquer
código começaria pelo pedaço que parece mais divertido.

**O que apareceu ao escrever momento a momento, e que nenhuma das versões
anteriores tinha mostrado:**

**M4 acontece duas vezes.** Escrevi o passeio de um caso concreto (checkout com
pagamento externo) e o agente precisou falar de novo *depois* da decisão: a
pessoa escolheu fila em vez de chamada direta, e isso quebrou o requisito de
resposta em 2s. Medir → conversar → decidir → **remedir** é ciclo, não fila. A
tabela de momentos escondia isso; o passeio expôs. Foi por isso que o diagrama
do §2 desenhou M2→M5 como laço.

**A confiança piora quando se aceita sugestão — e isso é feature.** No delta que
a proposta do agente mostra antes de aceitar, o fan-out melhora, as violações
caem, e a **confiança do desenho cai** (porque aceitar sem conferir aumenta a
parcela de `sugerido`). Esse número é o que impede a interação de virar "aceitar
tudo": o preço de não olhar fica visível na mesma tela em que se aceita.

**A régua que evita ADR virar wiki.** ADR nasce de **escolha entre alternativas
ou de exceção consciente** — nunca de "preencher um campo". Sem isso, todo campo
vira ADR e o mecanismo morre de excesso. Os três casos de decisão do M5 existem
só para separar isso.

**A exceção registrada é dado de melhoria.** Se o mesmo padrão é violado por
cinco times, o padrão está errado, não os times — e isso cai direto no PDCA que
já existe. A válvula da regra 3 não é concessão; é instrumento.

**Cinco perguntas que precisam de resposta antes do primeiro commit**, e uma
delas é a que mais me incomoda: **padrão vive onde?** Já temos `regras.json`,
`camposNo` e `perfis-time.json`. Se "padrão verificável" virar um quarto lugar,
provavelmente está errado — e essa é a pergunta que decide se a fatia B é
extensão ou invenção.

**Fatiamento com um critério honesto:** cada fatia entrega um fluxo completo e
usável, não um pedaço de encanamento. Recomendei **A (propósito) primeiro** —
fecha a cadeia da frente, que é o objetivo declarado, e não depende de nada — e
**D (proposta medida) em seguida**, porque é a mais barata (o mecanismo de
`sugerido` já existe) e a que melhor demonstra a tese. Com a consequência dita
em voz alta: se D não encantar na prática, o resto do plano merece nova conversa
antes de continuar.

E três coisas que o documento **não** resolve, ditas como tal: a UI de cada
momento, o custo de token de um agente que fala a cada mudança, e o que
acontece com as quebras que já existem quando requisitos passarem a existir —
todas nascem com gap, e "todo mundo fica vermelho" não é resposta aceitável.

Nada de produção mudou nesta rodada.

## 229. Tokens e o fim da janela: as duas perguntas têm a mesma resposta

Perguntas do usuário: *"quanto a tokens é possível que ter um histórico ajude?
também precisamos tratar quando a janela de contexto da conversa acaba"*.
Registrado na SPEC-57 §8.

**O achado da rodada:** a medição, que a SPEC-56 §0.7 justificou por
**disciplina** (impedir que o LLM vire fonte de número), é também o principal
mecanismo de **economia de token** — e por margem grande. Sem ela, a única
forma de o agente ajudar é receber o desenho inteiro serializado e procurar o
que está errado. Com ela, recebe as três violações já apuradas. Ordens de
grandeza menor **e insumo melhor**: o agente para de procurar e passa a
explicar.

Duas razões independentes — uma epistêmica, uma econômica — apontando para o
mesmo desenho. Costuma ser sinal de que o desenho está certo, e é o tipo de
confirmação que não se consegue projetando para uma delas só.

**Sobre histórico ajudar: ajuda em três formas, e as três são de estrutura, não
de volume.** Prefixo estável primeiro (instrução, vocabulário da config,
catálogo de padrões, glossário) porque qualquer cache de prompt recompensa
prefixo invariante — e isso independe de provedor, o que importa aqui porque o
projeto fala com vários por gateway. Não refazer pergunta respondida — mas
lendo o **modelo**, não a transcrição. E histórico **entre** sessões, que é ADR
+ proveniência: "isso foi decidido no ADR-07, depois do incidente de cobrança
dupla" vale mais que quarenta turnos e custa uma fração.

Atrapalha em uma: a transcrição só cresce e é majoritariamente peso morto — e é
justamente a parte que não se comprime com segurança, porque resumir produz
`inferido`. Daí a régua: **preferir estado a transcrição**.

**A invariante nova, que é a resposta à segunda pergunta e virou a regra 4 do
fluxo:** *a conversa nunca pode ser o único lugar onde uma decisão existe*. A
regra 2 já força isso sem querer — confirmar é o que grava com proveniência.
Se vale, a transcrição é descartável, e o fim da janela deixa de ser perda: o
contexto se reconstrói do diagrama + placar + ADRs.

E isso não é doutrina nova. É o §213/§214 aplicado à conversa — lá o painel era
o assistente e a troca era de demanda; aqui o painel é a conversa e a troca é a
janela acabando. Mesmo defeito, mesma cura. Gostei de descobrir que o remédio
já estava escrito.

**O procedimento quando a janela chega perto do fim** não é truncar: é o agente
listar o que foi conversado e **não está no modelo** e perguntar se grava.
Transformar o fim da janela num convite a persistir, em vez de uma perda
administrada. E resumo, se houver, é `inferido` não confirmado — não fecha
semáforo, não vira item, não é fonte de verdade. É o que impede a falha clássica
de um resumo virar o registro, com os erros que ele introduziu.

**Três números a medir antes de construir**, e o terceiro é o que decide se a
invariante é fácil ou dolorosa: quantas decisões por sessão ficam hoje só na
transcrição. Se for alto, a regra 4 é mudança de hábito cara; se for baixo, já é
quase verdade e falta o produto garanti-la.

**E uma preocupação saiu da lista:** *"quanto as existentes não vamos nos
preocupar nem um pouco, não está em prd"*. Sem base instalada, requisito e
padrão podem nascer obrigatórios no primeiro dia — sem período de convivência,
sem migração, sem "todo mundo fica vermelho". É a mesma liberdade que a SPEC-55
§5.4 tinha apontado para o banco, e é o segundo lugar onde não ter usuário ainda
compra desenho melhor.

Nada de produção mudou nesta rodada.

## 230. Fatia A construída: o propósito entra na cadeia

Pedido: *"revise a spec e implemente"*. Construída a fatia A da SPEC-57 —
propósito declarado, ligado ao desenho, medido no placar e citado no documento.
As decisões que a §5 deixou em aberto estão respondidas na SPEC-57 §4.1.

**O primeiro problema foi de vocabulário, não de código.** `Requisito` já
existe neste projeto: é o item do checklist técnico de refinamento. Precisei do
conceito "o que a demanda precisa resolver" e a palavra estava ocupada. Chamei
de **`Necessidade`** — dois "requisito" com sentidos diferentes envenenam toda
conversa depois, e um `Requisito2` seria pior que escolher a palavra certa.

**A decisão que mais gostei: não cascatear.** Apagar o nó que respondia por uma
necessidade **não** limpa o vínculo — a necessidade volta a ser lacuna e o
vínculo aparece marcado como quebrado. É a mesma disciplina do
`ALVO_INEXISTENTE`: o vínculo órfão é exatamente o evento que precisa
REAPARECER. Um `delete` em cascata seria mais limpo no banco e esconderia o
buraco que a feature existe para mostrar. Tem teste no engine e E2E no
navegador, e a mordida (fazer o vínculo morto contar) derruba os dois.

**A regra 2 apareceu em quatro lugares, e em um deles quase escapou.** Nada
conta até ser confirmado — então necessidade `sugerido` não acusa lacuna, não é
citada no documento, e **também não dá o nó por atendido**. Esse terceiro caso
é o não-óbvio: se contasse como cobertura, o agente sugerindo um vínculo
fecharia o buraco que ele mesmo deveria expor. Está no teste com esse nome.

**Nada vira obrigação retroativa.** Sem necessidade declarada não há lacuna, o
indicador nem aparece no placar, e o documento gerado é byte a byte o de antes
(tem teste comparando os dois). Isso importa menos agora que o usuário disse
que não há base em produção — mas continua sendo o desenho certo: dimensão nova
que acusa quem nunca a usou é dimensão que se aprende a ignorar.

**Quatro camadas, quatro mordidas, uma surpresa.** Engine (11 testes),
persistência (contrato + rota), UI (11 + 4), E2E (2). A surpresa foi o
`VARIAVEIS_ITEM`: o template do item tem lista FECHADA de variáveis, e a
`{{necessidades}}` nova reprovou no validador até ser registrada. O mecanismo
funcionou exatamente como o §196 desenhou — falhou alto, num teste, antes de
alguém escrever um template com variável que o motor não sabe preencher.

**Duas quebras de assinatura que a suíte pegou na hora:** `onSalvar` do
ContextoEpicoPanel ganhou um quarto argumento, e cinco testes existentes
cobravam a antiga. Atualizados, não silenciados — e o quarto argumento vazio
neles é a asserção de que o painel não inventa necessidade nenhuma sozinho.

**Aferido contra a stack rebuildada, não só contra a suíte:** migração aplicada
no banco de dev, e no navegador com o usuário real — nó no canvas, necessidade
digitada, `data-lacuna=sim`, vínculo escolhido, `data-lacuna` some, placar vira
"🎯 propósito coberto". O visual saiu na linguagem que já existe: borda âmbar
na necessidade em lacuna, chip do componente vinculado, indicador na mesma
barra do VERMELHO/AMARELO.

226 engine · 217 server · 495 web · **69/69 E2E** (dois novos) · lint e build
limpos.

**O que deixei de fora, de propósito:** vincular a partir do painel do nó (o
lugar natural depois que a pessoa já sabe qual buraco está fechando) e a
necessidade proposta pelo agente — o modelo já aceita `origem: "sugerido"` e o
painel já sabe confirmá-la; falta só quem proponha. É a fatia D da SPEC-57, e
ela agora tem onde encostar.

## 231. Fatia D: o agente propõe, o engine mede antes de aceitar

Seguindo o fatiamento da SPEC-57 §7: A entregue no §230, **D agora**. O agente
propõe o propósito da demanda a partir do contexto que já existe, e a proposta
chega **medida** — o efeito de aceitar aparece antes do aceite.

**A peça já estava pronta, e foi o que fez a fatia sair barata.** Proposta entra
como `origem: "sugerido"` e a regra 2 já a ignora em tudo. Então o delta é só
rodar `analisarLacunas` duas vezes — como está, e como ficaria se tudo o que
está sugerido virasse real — e mostrar a diferença. Zero mecanismo novo.

**Uma correção do que eu tinha escrito na SPEC-57 §M4.** Lá o exemplo do delta
mostrava a **confiança piorando** ao aceitar. Aquilo vale para proposta de
DESENHO, que traz campos não conferidos junto. Aqui confirmar É a leitura, então
confiança só melhora — e o número que pode piorar é outro, mais útil: **aceitar
propósito que ninguém atende CRIA lacuna**. "lacunas 0 → 2, aceitar propósito
sem componente cria trabalho". É esse o trabalho que a pessoa precisa ver antes
de dizer sim, e é o que impede o "Confirmar todas" de virar botão automático.
Deixei a nota no código, no lugar onde alguém iria comparar com a spec.

**Duas disciplinas no pedido ao modelo, e as duas viraram teste:** `atendidaPor`
é enum FECHADO dos componentes desenhados (o agente não pode inventar nó), e o
campo **some do esquema** quando não há nó nenhum — esquema que pede campo
impossível é o jeito mais rápido de receber lixo. E o `motivo` é obrigatório:
proposta sem porquê é caixa-preta, e a pessoa aceita sem ler.

**A regra 2 é aplicada na FRONTEIRA, não confiando no modelo.** O que volta do
agente é remapeado no cliente para `sugerido`/`confirmado: false`, e os ids de
vínculo são filtrados contra os nós que existem de verdade. Se o modelo
devolver um nó inventado, ele não entra.

**Dois defeitos que só o E2E pegou — e o segundo é de produto.**

1. Eu li a resposta com `.text()` direto, sem o `soDepoisDoUltimoReinicio` que
   TODA rota de IA usa. Streaming SSE, JSON que nunca casava. As unidades
   passavam porque mockam o cliente; o dublê de gateway responde SSE de verdade,
   e é exatamente para isso que ele existe.
2. **O agente lia o contexto SALVO, não o que estava na tela.** A pessoa
   escrevia o contexto do épico, clicava em "propor", e recebia *"sem contexto
   da demanda"* — porque `quebra.demandInfo` só muda depois do Salvar. Defeito
   de produto legítimo, invisível para a unidade, e o painel ainda por cima
   reportou o erro no lugar certo, o que tornou o diagnóstico imediato.

O segundo me fez melhorar o próprio teste: em vez de `toBeVisible` mudo, ele
agora faz `expect.poll` sobre o texto do painel — quando falha, o relatório
mostra a mensagem de erro que a pessoa veria, não um "element not found".

506 web · 217 server · 232 aplicação · **70/70 E2E** · lint e build limpos.

**O que a fatia D deixa em aberto:** o agente propõe necessidade, não vínculo
para necessidade que já existe — "esta que você escreveu, quem responde por
ela?" é a pergunta seguinte, e ela usa o mesmo endpoint com outro recorte.

## 232. O elo final estava solto — e eu ia mandar testar assim

Ao escrever o roteiro de teste manual para o usuário, fui conferir a afirmação
"o documento gerado cita a necessidade" antes de mandá-lo clicar. **Não citava.**

`gerarEspecificacaoEntrega` aceita `necessidades` desde o §230, e tem teste de
unidade provando que cita. Mas quem chama a função na aplicação é o
`ReviewScreen.baixarEspecificacao`, e ele **não passava o campo**. Resultado: a
citação funcionava numa chamada direta ao engine e não no artefato que sai da
ferramenta — exatamente o elo M8 da SPEC-57, que é a razão da fatia existir.

**Por que a suíte não pegou.** O teste de unidade do gerador testa *o gerador*,
não *quem o chama*. O E2E ia até o placar e parava. Foi o mesmo vão do §123 em
miniatura: duas camadas verdes e o buraco entre elas.

**O que me salvou foi escrever o roteiro.** Ia dizer "derive e veja a citação no
markdown"; parei para conferir a frase antes de afirmá-la, e o buraco apareceu.
É a régua do §211 (verificar o que se afirmou) aplicada a uma instrução de uso,
e não a um commit — e valeu igual.

**Consertado e coberto onde deveria estar desde o começo:** o E2E agora vai até
o fim — deriva, baixa o markdown e lê o arquivo. A mordida (tirar `necessidades`
da chamada do `ReviewScreen`) o derruba.

Três coisas que o E2E completo me obrigou a acertar, e que valem como nota de
como este produto se comporta:

1. **O portão de prontidão bloqueia derivar**, então o teste precisa preencher
   os obrigatórios — troquei o Serviço por uma Fila Rabbit, cujos campos a
   suíte já conhecia.
2. **A janela do assistente fica por cima do header** e intercepta o clique de
   derivar. Mesma armadilha do §221 com o menu, segunda aparição: overlay
   flutuante e clique de header não convivem sem fechar antes.
3. **Os balões da condução proativa aparecem em SEQUÊNCIA** — o seguinte só
   nasce depois de o anterior ser dispensado. Meu laço checava os dois de uma
   vez, dispensava um e travava esperando o terceiro.

70/70 E2E, build e lint limpos.

## 233. O propósito entra no tour — e o tour cobrou o preço de dois atalhos

Pedido do usuário: *"seria interessante colocar isso na demonstração/tour
guiado"*. Passo novo entre "Prontidão" e "Proveniência", porque propósito é
**outra dimensão da mesma barra**, não uma tela à parte — e o tour narra isso.

O cenário do tour (`config/cenarios/mongo.json`) ganhou três necessidades:
duas cobertas e **uma em lacuna**. Escolhi mostrar o buraco de propósito porque
é o que a feature tem de mais instrutivo — e porque deixa o texto do passo dizer
a coisa que mais importa: *a lacuna avisa, não bloqueia derivar*. Cenário
impecável demais não ensina nada.

O passo abre a janela flutuante, e o passo seguinte **a fecha** — senão ela cobre
o painel de propriedades que a Proveniência mostra. Isso virou asserção, no
unitário e no E2E: é a terceira aparição da armadilha "overlay flutuante × o que
está embaixo" (§221 com o menu, §232 com o botão de derivar).

**Dois atalhos meus foram cobrados, e os dois estavam previstos por escrito.**

1. **Dois testes do tour andavam por CONTAGEM de passos** e quebraram quando o
   passo novo entrou no meio. O próprio arquivo tem um helper `andarAte(titulo)`
   com o comentário: *"passo novo no meio do tour (e eles entram a cada rodada)
   invalidava um índice fixo"*. A lição estava escrita, dois testes não a
   seguiam, e eles quebraram exatamente como previsto. Convertidos.

2. **O teste da fatia D passava isolado e falhava na corrida completa.** A
   credencial do gateway é **uma por organização**, e specs em workers
   diferentes a reescrevem — o `ia-hospedada.spec` já documenta esse flake com
   "três ocorrências". Eu tinha posto o teste noutro arquivo e virei a quarta.
   Movido para junto dos outros que dependem de credencial, com a nota do
   porquê. A régua: **estado global de teste define em que ARQUIVO o teste
   mora**, não o assunto dele.

O que fica: quando um comentário de teste descreve uma armadilha, ele é um aviso
para o próximo — e o próximo fui eu, duas vezes na mesma rodada.

507 web · 70/70 E2E · lint e build limpos.

## 234. O tour mentia em dois passos, e o teste dizia que estava tudo bem

Achado do usuário, com print: no passo 11 ("O menu") a demo mostrava a **tela de
revisão da quebra** — que não tem menu ☰ — e o passo anterior ("Itens escritos")
abria a tela dizendo que **ainda não existe nenhum item**.

Dois defeitos independentes, e a mesma causa raiz de teste.

**1. A tela de itens abria vazia.** `abrirItens` do tour era
`navegar({ tela: "itens" })` — só a navegação. Mas os itens só existem depois de
alguém apertar "Gerar itens" na revisão (`aoGerarItens`), ou de virem
persistidos de uma quebra salva. O tour não faz nem um nem outro: deriva sem
salvar, de propósito. Resultado: a tela abria no estado vazio enquanto o texto
do passo prometia *"cada card traz a escrita final, o que falta especificar e o
que fica pronto quando ele termina"*. Corrigido gerando os itens, com a mesma
chamada que o botão da revisão faz.

**2. Sair dos itens caía na revisão, não na mesa.** `fecharItens` navegava para
o canvas, mas `resultado` continuava setado — e a `ReviewScreen` é renderizada
sempre que há resultado, cobrindo o canvas. Então o passo seguinte falava do
menu ☰ numa tela que não tem menu ☰, e o holofote do tour caía no canto vazio
(é o que o print mostra). Corrigido limpando o resultado junto.

**Por que a suíte não pegou, e é a parte que interessa.** O E2E do tour tinha
esta linha:

```ts
await irAtePasso(page, "Itens escritos");
await expect(page.getByTestId("itens-screen")).toBeVisible();
```

A tela estava visível. **Vazia, mas visível.** A asserção media a existência do
contêiner, não o conteúdo dele — e passou verde por dez rodadas enquanto a demo
mostrava uma tela vazia para quem visse. Mesma família do §213 ("teste que passa
de primeira num defeito que você está caçando"), com outro disfarce: aqui o
teste nunca podia falhar, porque não afirmava nada que dependesse do defeito.

Agora ele cobra ausência do estado vazio, presença do resumo dos itens, e — no
passo do menu — que o botão ☰ esteja visível **e** que os nós do canvas estejam
lá. Mordida nos dois: revertendo qualquer um dos consertos, o E2E fica vermelho.

**A régua:** `toBeVisible()` numa tela inteira é quase sempre uma asserção fraca.
Tela visível não é tela útil, e o tour é justamente o lugar onde a diferença
entre as duas é o produto inteiro — é o que a pessoa vê antes de decidir se vale
usar.

507 web · 70/70 E2E · lint e build limpos.

## 235. Os três buracos de espinha do tour, com dado de demonstração

Depois de eu medir que o tour cobria 5 das 12 áreas (§234), o usuário mandou
fechar os três de espinha — e autorizou o que faltava para isso ser possível:
*"se preciso teremos dados mock exclusivos para o tour"*.

**Os três passos novos, na ordem de uso real:**

1. **"Começar conversando"**, ANTES do diagrama. O tour começava com o desenho
   pronto na mesa, pulando como ele nasce — que é a porta de entrada de verdade
   e provavelmente o que mais impressiona. Agora o passo abre a conversa com a
   troca que "produziu" aquele desenho.
2. **"Contexto do produto"**, antes das stacks. É o par do propósito: lá o
   *para quê*, aqui o *de que negócio*.
3. **"Do item à issue"**, antes do PDCA. A cadeia terminava no markdown baixado;
   o último elo — o item virando issue no tracker — não estava em lugar nenhum.

**O problema que o dado mock resolve, e por que a alternativa era pior.** As
três telas leem do servidor. Numa instalação nova estão vazias, e passo que
promete conteúdo sobre tela vazia é exatamente a mentira que o §234 acabou de
custar caro. A alternativa óbvia — semear pela API — seria **pior**: o tour
passaria a ESCREVER na configuração de quem só quis ver a ferramenta.

Então cada tela ganhou uma costura explícita (`demonstracao?`) que substitui o
fetch e **desliga a escrita**. E a regra que mantém isso honesto: **onde entra
dado de demonstração, entra a marca** — um selo visível dizendo "nada aqui está
salvo na sua configuração". Sem ele, alguém sai do tour achando que configurou
um produto.

**A invariante mais importante virou teste:** a demonstração **liga** no
primeiro passo que mostra dado falso e **desliga no fim do tour**. Dado de
demonstração que sobrevive ao tour vira configuração fantasma na tela de quem
for usar de verdade. Mordida: tirando o desligamento, o teste cai.

**Um tropeço meu, e ele tem lição.** Pus a asserção do produto entre dois
`irAtePasso("O menu")` — e o helper **só anda para a frente**. Pedir um passo já
passado faz o laço correr até o último, onde não existe mais "Próximo", e o erro
que aparece é um timeout esperando um botão, sem dizer o motivo real. Deixei o
comentário no spec: em teste de fluxo linear, a ordem das asserções É a ordem do
fluxo, e violá-la falha longe de onde está o erro.

Também tirei um `PASSO \d+ DE 13` cravado do teste de "pular tour" — mesma
doença do §233, e agora com 20 passos ele estava errado de qualquer jeito.

512 web · 70/70 E2E · lint e build limpos.

Falta o **tour de configuração** (Modelo de IA, Pipeline de IA, Regras de
refinamento, Campos por conexão) — a segunda metade da proposta, para o primeiro
tour continuar sendo "o que a ferramenta faz" em vez de virar 25 passos.

## 236. O segundo tour — e o comando morto que ele desenterrou

Fechando a proposta do §234: o tour do produto ficou com os três passos de
espinha (§235), e as quatro telas de configuração que sobravam viraram um
**tour próprio**, no mesmo modal.

**Por que separar em vez de somar.** O primeiro tour responde *"isto serve pra
quê?"* — é o que decide se alguém adota a ferramenta. O segundo responde *"como
eu molde pro meu time"* — só interessa a quem já decidiu. Somados dariam 25
passos, e a parte que convence ficaria no meio de tela de administração.

Tecnicamente foi barato: a lista de passos virou parâmetro
(`useTour(opts, passosDeConfiguracao)`), e `passosDoProduto`/`passosDeConfiguracao`
são duas funções exportadas. Tem teste cobrando que são listas **diferentes** e
não a mesma com filtro — se um passo do produto vazasse para o outro, quem só
quer configurar levaria a derivação inteira junto.

**E aí o E2E desenterrou um defeito de produto que não tem nada a ver com tour.**
Ao passar pela aba *Modelo de IA* sem credencial — o estado exato de quem acabou
de instalar, que é exatamente quem faz o tour — a tela dizia:

> *O modelo de embedding não está instalado — a IA só fica pronta com ele. Rode
> `gerador ia instalar`.*

A CLI foi removida na SPEC-33. O comando não existe há dezenas de rodadas, e a
condição que mostra a mensagem (`!embeddingInstalado` e nenhum modelo remoto
selecionado) é **sempre verdadeira no modo hospedado sem credencial** — ou seja,
é o que TODO usuário novo lê. Havia outra igual na revisão, e um terceiro texto
mandando rodar `gerador ia instalar --modelo X` por modelo.

Trocadas por instruções que dizem o que fazer **ali**: configurar o gateway.
E ficou guarda no E2E — `getByText(/gerador ia instalar/)` com `toHaveCount(0)`
na tela por onde o tour passa. Mordida: repondo a frase morta, o teste cai.

**O que isso diz sobre demonstração como instrumento.** Este é o segundo defeito
de produto que o tour encontra em duas rodadas (§234 foi a tela de itens vazia).
Faz sentido: o tour é o único teste que percorre o produto INTEIRO na ordem em
que uma pessoa nova o encontra — e é justamente aí que resíduo de feature
removida aparece. Construir a demonstração está saindo mais barato em defeito
encontrado do que em esforço.

515 web · 71/71 E2E · lint e build limpos.

**Cobertura, agora medida:** dos 12 itens do menu, os dois tours cobrem 11. Fica
de fora só "Campos por componente vs. por conexão" como par — o de componente
está no tour do produto e o de conexão no de configuração, de propósito.

## 237. As duas dívidas que eu mesmo anotei e não paguei

Perguntado "falta algo?", fui conferir no código em vez de responder de memória
— e as duas menores eram justamente as que eu tinha achado na SPEC-56 §14,
anotado, e seguido adiante.

**1. `validateConfig` nunca conferiu o `type` do campo.** Um `"type": "lixo"`
passava: o campo não renderizava, a prontidão não o cobrava, e nada apontava o
erro. É a "falha ABERTA e em silêncio" que o comentário do `RECURSOS` nomeia no
servidor — só que na config, que é o lugar onde este produto promete
explicitamente falhar alto.

`TipoCampo` era só um tipo, sem lista em runtime. Virou `TIPOS_CAMPO` (const) com
o tipo derivado dela — uma lista só, sem duas para divergir. A validação cobre
campo de nó, campo de aresta e o `itemSpec` de uma lista; esse último é onde
passaria despercebido por mais tempo, porque a lista em si renderiza.

**2. O `diagrama.schema.json` estava defasado em três pontos ao mesmo tempo:**
faltavam dois tipos (`textarea`, `lista`), faltavam duas propriedades
(`identificador`, `itemSpec`) e ele declara `additionalProperties: false` — o
que transforma cada ausência em **erro falso** no editor de quem escreve config
à mão. Documentação que desinforma é pior que documentação faltando: ela é
consultada com confiança.

**A parte que interessa não é o conserto, é a correia.** O arquivo é tooling de
editor: nenhum código o lê, então nada o obrigava a acompanhar o engine — e foi
exatamente por isso que ficou para trás sem ninguém notar. Agora há teste
comparando o enum do schema com `TIPOS_CAMPO` e varrendo a config de exemplo
atrás de propriedade usada e não declarada. Não valida JSON Schema de verdade
(isso pediria dependência nova para um arquivo que nenhum runtime lê); garante
que ele não **diverge**, que é o defeito real.

Mordida nas duas: desligando a validação, dois testes caem; devolvendo o enum
antigo ao schema, o teste da correia cai.

235 engine · 515 web · 217 server · lint e build limpos.

Régua: **"anotei no documento" não é o mesmo que "está resolvido"** — e as duas
dívidas mais baratas do backlog inteiro ficaram três rodadas paradas porque
anotá-las deu a sensação de tê-las tratado.

## 238. A fatia D entra no tour — a interação que existia e não aparecia

Ao inventariar o que faltava (§237), o buraco mais constrangedor era este: a
fatia D construiu a proposta MEDIDA — o agente propõe, o motor mede o efeito de
aceitar antes do aceite — e o tour mostrava só o *resultado* do propósito, não a
interação. Feature construída, testada, e invisível na demonstração.

**O que faltava era dado, não código.** O passo do delta só existe se houver
sugestão pendente na tela. O cenário do tour tinha três necessidades, todas
`manual` — então o quadro do delta nunca aparecia. Ganhou uma quarta,
`sugerido` e não confirmada, sem vínculo. Com ela a tela mostra exatamente a
regra inteira de uma vez:

- o delta diz *"1 sugerida, ainda sem efeito — se aceitar tudo: lacunas 1 → 2,
  aceitar propósito sem componente cria trabalho"*;
- e o placar do topo **continua marcando 1**, porque sugestão não conta.

Duas afirmações do produto na mesma tela, uma reforçando a outra. É a
demonstração mais econômica que consegui montar disso.

O texto do passo diz o porquê, que é o que o tour existe para transmitir: o
número que pode piorar não é enfeite, é o que impede o "confirmar todas" de
virar clique automático.

Mordida: tirando a sugerida do cenário, o E2E do tour cai — o passo fica sem o
que apontar, que é precisamente o defeito do §234 (tela visível, vazia).

515 web · 71/71 E2E · lint e build limpos.

## 239. Fatia B — o padrão vira régua, e onde ele vive

A pergunta que travava esta fatia desde a SPEC-57 §5 era *"padrão vive onde?"*,
com o alerta que eu mesmo escrevi: já existem `regras.json`, `camposNo` e
`perfis-time.json`, e **um quarto lugar provavelmente seria erro**. O usuário
mandou seguir duas vezes sem responder, então decidi — e deixo a decisão
explícita, para ser fácil de derrubar:

> **Não é lugar novo. É um campo a mais no requisito que já existe.**

Um `Requisito` do `checklistTecnico` já sabe a tech, os contextos e o `when`.
Só lhe faltava uma afirmação que a máquina consiga avaliar. Então ganhou
`checagem: { campo, operador, valor, unidade }`. O `texto` continua sendo o que
a pessoa lê; a checagem é o que o motor confere. *"Chamada externa tem que ter
timeout curto"* é opinião; `timeoutMs ≤ 500ms` é padrão.

**O que isso evitou:** uma tela nova, uma tabela nova e uma segunda régua de
"a qual nó esta regra se aplica" — que é a parte difícil e que o checklist já
resolve. `avaliarConformidade` **importa** `requisitosRelevantes` e
`condicaoBate` do refinamento em vez de reimplementá-los; duplicar faria as duas
divergirem, e o sintoma seria um requisito que aparece no documento e não é
conferido (ou o contrário).

**Quatro decisões de recorte, todas viraram teste:**

- **campo ausente no nó não vira violação.** A regra é por tech, e uma tech vale
  para tipos de nó com specs diferentes — acusar ali seria acusar o desenho por
  um descasamento de config.
- **campo vazio não vira violação de comparação.** Vazio é trabalho da
  prontidão; duas dimensões acusando a mesma coisa dobrariam o vermelho sem
  dobrar a informação.
- **amarelo, não vermelho.** Conformidade avisa; bloquear é decisão do portão.
- **não converte unidade.** `unidade` é texto de mensagem. Somar ms com s
  caladamente seria pior que não somar.

E `validateRegras` passou a recusar checagem com operador inventado ou sem valor
— regra conferível mal escrita nunca acusaria nada, e ninguém saberia que o
padrão declarado não está em vigor. **Falha aberta com cara de padrão em vigor é
pior que padrão nenhum.**

**Achado de brinde, e ele é de produto:** montando o E2E descobri que o cliente
web lê `/config/regras` **sem `timeId`** (`loadConfig.ts`), enquanto a API
suporta documento por time e o PUT aceita `timeId`. Ou seja: **override de
regras por time é config morta** — o que se grava para um time nunca chega à
tela. Não consertei nesta rodada (é decisão de produto: regras são globais por
desenho, ou o cliente é que está incompleto?), mas ficou registrado aqui e no
comentário do próprio spec, que é onde a próxima pessoa vai tropeçar.

O E2E custou quatro tentativas por causa disso: escrevi no documento do time,
depois no de um time criado só para o teste, e só então descobri que nada disso
é lido. Régua: **antes de semear estado num teste, confirme por onde o app o
lê** — a API suportar não significa que o cliente use.

244 engine · 517 web · 72/72 E2E · lint e build limpos.

**O que a fatia B ainda não faz:** violação não vira item derivado (§M7 propôs
"item, salvo se não-decidida"), não há conflito aritmético entre campos
(retry × timeout) e não há regra sobre topologia. Os três são incrementos sobre
o mesmo `Checagem`, não mecanismo novo.

## 240. O padrão chega ao item — a cadeia fechada de ponta a ponta

Fatia B parava no placar. Violação que só existe na tela morre ali: **quem
implementa lê o backlog, não o desenho**. Agora cada violação vira atividade,
com o esperado e o atual dentro da descrição — sem os dois números a pessoa
volta ao diagrama pra descobrir o que ajustar, e o item perde o motivo de
existir.

Com isso a cadeia da SPEC-57 §0.1 está inteira e verificável:

```
PROPÓSITO ──► DECISÃO ──► ELEMENTO ──► ITEM ──► SPEC
(necessidade)  (padrão)   (nó/aresta)  (derivado) (gerada)
    §230        §239/§240    já era      já era     §230/§232
```

O elo "decisão" ainda é o **padrão**, não o ADR (fatia C) — mas é decisão
registrada e conferível, que era o que faltava para o resto engatar.

**Duas escolhas de recorte que viraram teste:**

- **`Débito Técnico` só quando o nó já EXISTE.** Num nó novo o valor fora do
  padrão ainda não foi construído: é decisão a corrigir, não dívida herdada.
  Chamar tudo de débito esvazia a palavra e mistura duas conversas diferentes
  na hora de priorizar.
- **`independent`.** A correção não depende de nada declarado; inventar uma
  ordem que ninguém escreveu seria pior que não ter ordem nenhuma.

E a chave é `${noId}::padrao::${campo}` — estável, como toda chave de atividade
aqui: regerar não duplica nem renomeia, e o rastro de exportação sobrevive.

**Três tentativas de seletor no E2E, e a lição é sobre `::`.** A chave da
atividade contém `::`, e nem o CSS `[data-testid$="…"]` nem o `getByTestId` com
regex casaram com ela. O valor exato casa — e o id do primeiro nó de uma mesa
vazia é `n1`, determinístico como o resto da derivação. Perdi três ciclos
tentando ser genérico onde o valor exato é estável por construção.

Também troquei um `preencherRestante` que varria a tela por um
`preencherObrigatorios` que preenche **por nome**: campo obrigatório novo no
tipo deve QUEBRAR este teste, para alguém decidir o que ele vale ali — varrer
faria o teste se adaptar em silêncio a uma mudança de contrato.

249 engine · 517 web · 217 server · 72/72 E2E · lint e build limpos.

**O que sobra da fatia B:** conflito aritmético entre campos (retry × timeout) e
regra sobre topologia. Os dois são incrementos sobre o mesmo `Checagem` — o
primeiro precisa de uma checagem que leia DOIS campos, o segundo de uma que leia
arestas.

## 241. A contradição entre dois campos

Último incremento da fatia B que cabia no mesmo `Checagem`: o alvo da
comparação passou a poder ser **outro campo do nó**, opcionalmente
multiplicado por um terceiro.

**A classe de defeito que isso pega é a que nenhum campo isolado revela.** TTL
de 5s numa fila com 5 tentativas de 2s: cada campo parece sensato sozinho, e
juntos garantem que a mensagem morre antes da última tentativa. Ninguém percebe
olhando um campo de cada vez — é exatamente o tipo de coisa que a mesa deveria
pegar antes de virar código, e o exemplo que eu vinha citando desde a SPEC-56
§0.2 sem ter como conferir.

O requisito de retry/DLQ que já existia no `regras.example.json` **ganhou a
régua, sem linha nova no checklist**: é a mesma decisão, agora conferível. Foi
a mesma escolha do §239 com o timeout — padrão conferível é um atributo do
requisito, não um item a mais para a pessoa ler.

**A mensagem carrega os nomes E a conta:** `≥ backoffInicialMs × retries
(= 10000ms)`. Sem os nomes ninguém sabe o que mudar; sem o número, o quanto.

**Três invariantes que viraram teste:**

- alvo indeterminado (campo comparado ausente ou não numérico) **cala** a
  checagem, como já fazia com o campo ausente — acusar seria acusar o desenho
  por um campo que a regra pressupõe e o tipo não tem;
- a validação recusa checagem **sem alvo** (nunca acusaria nada), **com dois
  alvos** (`valor` e `valorDe` juntos — a regra significaria coisas diferentes
  conforme quem lê) e **multiplicando o nada**;
- e a mensagem antiga ("precisa de um valor") mudou, então o teste do §239 que
  a fixava mudou junto — teste que pina texto é contrato, e contrato se
  atualiza de propósito, não por acidente.

**Dois tropeços que valem mais que o código.**

O primeiro: quis usar o Rabbit no E2E, porque é onde a regra é real. Os campos
de retry dele só aparecem depois de DLQ + estratégia, que dependem de uma
**aresta de consumo** — montar isso pelo canvas testaria arrastar conexão, não
conformidade. Troquei por Kafka com uma regra declarada pelo próprio teste, e
disse no comentário que a regra é do teste. A alternativa seria inventar uma
regra de engenharia falsa só para o teste ficar conveniente.

O segundo: os dois testes do arquivo disputavam o **mesmo documento global** de
regras, e o `finally` de um restaurava enquanto o outro ainda dependia da regra
que escreveu. O sintoma foi uma violação que simplesmente não aparecia, sem
nada apontar a causa. Remédio: `test.describe.configure({ mode: "serial" })` —
o mesmo do `rbac-cadeado-e-pedido`, pelo mesmo motivo. **Terceira vez que
estado global compartilhado me morde nesta sequência** (credencial no §233,
regras aqui, e o próprio §239 antes).

254 engine · 517 web · 73/73 E2E · lint e build limpos.

**O que fica de fora da fatia B, e por quê:** regra sobre TOPOLOGIA (fila sem
consumidor, caminho sem alternativa). Não é extensão do `Checagem` — ela lê
arestas, não campos, e teria outra forma. Enfiá-la no mesmo tipo criaria uma
linguagem com duas gramáticas disfarçadas de uma. Ela pertence perto da fatia E
(percurso), que é quando "caminho" passa a existir como conceito.

## 242. O padrão que ensina, e que aceita ser contrariado

Pedido: avaliar e, se fizesse sentido, implementar. A avaliação achou algo mais
urgente que as fatias C e E: **eu entreguei a acusação sem as duas coisas que a
própria SPEC diz que a tornam sustentável.**

O §239 fez o padrão virar régua e o §240 fez a violação virar item. Nenhum dos
dois entregou:

1. **por que o padrão existe** — a SPEC-56 §0.7 é explícita: *"forçar a decisão
   sem explicar produz obediência; explicar produz critério"*;
2. **a saída legítima** — a regra 3 da SPEC-57: *"violar é permitido, e fica
   registrado. Sem essa saída, a pessoa aprende a ignorar o vermelho, e a
   medição inteira morre junto."*

Ou seja: eu tinha construído uma multa sem lei publicada e sem direito de
defesa. Corrigido nas duas pontas.

**O porquê.** `Requisito.porque` — uma frase, de preferência com a história.
*"Veio do incidente em que o parceiro travou e derrubou o checkout junto"*
convence de um jeito que *"é boa prática"* nunca vai convencer. Ele viaja com a
violação até a lista do placar.

**A válvula.** `ExcecaoDePadrao { noId, campo, motivo, autor, em }`, guardada na
quebra. Três decisões que a definem:

- **`motivo` e `autor` obrigatórios na borda.** Exceção sem justificativa é só o
  vermelho desligado — exatamente o que a regra 3 existe para impedir. O botão
  de confirmar fica desabilitado sem motivo, e o Zod recusa `min(1)`.
- **Sai do vermelho, não do histórico.** `avaliarConformidade` continua
  devolvendo a violação, agora *marcada*; quem conta o placar é
  `violacoesEmAberto`. Apagar faria a decisão desaparecer junto, e o que se quer
  é o oposto.
- **Não vira item.** Gerar trabalho para o que alguém resolveu conscientemente é
  o jeito mais rápido de ensinar a ignorar o backlog.

**O chip virou lista, e isso é a mudança de UX que importa.** Antes: um número
que levava ao nó. Agora: o que viola, o que se esperava, **por quê o padrão
existe**, e "aceitar de propósito…". Número sozinho cobra; a lista ensina.

**Efeito colateral que vale por si:** exceção repetida é dado de melhoria. Se
cinco times violam o mesmo padrão, o padrão está errado, não os times — e é
exatamente o que o PDCA já sabe processar. Deixei isso escrito na migração,
junto com o motivo de ser `jsonb` e não tabela: a consulta transversal que
justificaria a tabela ("quantas vezes este padrão foi violado?") ainda não
existe, e quando existir ela se paga.

**Correção de uma afirmação minha, duas vezes repetida.** Eu disse que "regras
por time é config morta". Não é: o template de especificação usa escopo por time
por outro caminho (`onSalvarEspecificacaoTemplate`, com toggle global/time na
tela). O que existe é que o helper `configDe` — usado por `regras`,
`pipeline-agentes` e `exportador` — nunca manda `timeId`. É decisão de produto
por chave, não capacidade morta. Conferi antes de repetir pela terceira vez.

258 engine · 520 web · 218 server · 74/74 E2E · lint e build limpos.

**O que continua aberto:** fatia C completa (ADR com opções e status — o
`porque` é a razão do padrão, não uma decisão de arquitetura), fatia E
(percurso, e a regra de topologia que depende dela), vincular necessidade pelo
painel do nó, e as três medições da SPEC-57 §8.6.

## 243. Duas portas para o mesmo conteúdo — a demonstração automática sai

Achado do usuário: *"notei que demonstração e tour fazem a mesma coisa, vamos
remover um deles"*. Está certo, e o próprio código admitia: o comentário do
`useAutoDemo` dizia **"aditiva ao tour clicável — mesma lista de passos, mesmos
`onEnter`, só avança sozinha em vez de esperar clique"**. Duas portas para o
mesmo conteúdo, com a única diferença sendo quem aperta "Próximo".

**Removi a automática, não o tour**, por três razões: o tour é estritamente
mais controlável com o mesmo conteúdo; a automática era a camada aditiva (por
definição própria); e o tour de configuração que nasceu no §236 só tem a forma
clicável — manter a automática deixaria os dois tours com modos diferentes sem
motivo.

Saíram `useAutoDemo.ts`, `CursorFantasma.tsx`, a spec de E2E, os controles de
pausar/continuar e o `duracaoMinima` do passo, que existia **só** para a
automática não cortar animação no meio (§46). Feature removida deixa campo
órfão no modelo se ninguém varrer atrás.

**Renomeei o que passou a mentir.** O botão do header dizia "▶ Demonstração &
tour", com o `title` prometendo "demonstração automática e tour guiado", e o
testid era `abrir-demonstracao`. Virou "▶ Como funciona" / `abrir-como-funciona`
— mesma disciplina do §222 com o "canvas": nome que descreve o que não existe
mais é pior que nome ruim.

**Guarda de remoção, no padrão do §212:** um teste cobra que o botão da
demonstração automática não voltou, **e** que os dois que ficaram continuam lá —
a guarda é sobre ausência, não sobre ter esvaziado o header. Mordida: repondo o
botão, ele cai.

**Um susto que virou lição de ferramenta.** Meu primeiro corte usou índice de
string entre a linha do hook e a última linha de `iniciarDemoAutomatica` — e
levou junto `iniciarTour` e `iniciarTourDeConfiguracao`, que estavam no meio. O
`tsc` pegou na hora (`Declaration or statement expected`), mas o certo era não
ter feito: **cortar por intervalo pressupõe que o intervalo é homogêneo**, e
código quase nunca é. Refiz removendo cada bloco por texto exato.

514 web · 72/72 E2E (dois a menos, os da spec removida) · lint e build limpos.

## 244. "Não vi nenhuma mudança" — a capacidade nascia dormente

Feedback do usuário depois de sete rodadas construindo em cima da avaliação do
SimArch: *"não entendi o que acabamos implementando, pois não vi nenhuma
mudança"*.

**Fui olhar o banco dele em vez de explicar.** 18 quebras, **zero** com
necessidade declarada; documento de regras com **zero** `checagem`. Ou seja:
tudo o que construí estava lá e invisível — e por decisão minha.

**A primeira metade é desenho, e continua certa.** Cada dimensão nova só
aparece quando é usada: sem necessidade declarada não há indicador de propósito;
sem padrão conferível não há indicador de conformidade. Isso existe para não
acusar quem nunca usou a régua (§230, §239). O preço é que quem não sabe que a
régua existe nunca a vê. Aceito para o propósito (declarar necessidade é ato
explícito de quem usa) — **inaceitável para a conformidade**, porque ali a régua
vem do produto, não do usuário.

**A segunda metade é defeito meu, e tem nome.** Eu adicionei a `checagem` ao
`config/regras.example.json` acreditando que a capacidade "nasceria viva". Só
que o documento de regras vive no BANCO desde a SPEC-36, e o arquivo só é
template de primeira carga: **instalação existente nunca lê o arquivo de novo**.
Então a fatia B inteira ficou dormente em toda instalação que já existia — que
é 100% delas.

O engraçado é que o produto **já tem** o mecanismo para exatamente isso: o
diagnóstico do §108, que compara a config em uso com o template desta versão e
**comenta sem sobrescrever**. Ele não pegou porque contava *entradas por seção*,
e o padrão conferível é um **atributo** de um requisito que já existia — o
`checklistTecnico` estava cheio, e o diagnóstico achou tudo em ordem.

Corrigido: o resumo passa a contar `requisitosConferiveis`, e o mecanismo
genérico faz o resto. Na stack do usuário, agora:

> *A sua configuração de "regras" não tem nenhuma entrada de padrão conferível
> (a régua que o motor avalia sozinho) (2 no padrão desta versão). Isso costuma
> indicar um arquivo de uma versão anterior…*

Aparece na aba **Regras de refinamento**, onde o alerta de config defasada já
morava.

**A régua que fica, e ela é maior que este conserto:** quando uma capacidade
nova depende de config que já existe no banco, *acrescentar ao template não
entrega nada*. Ou o diagnóstico acusa, ou a capacidade nasce morta — e ninguém
descobre, porque o sintoma é ausência. Vale reler esta régua antes da fatia C e
da E, que também vão querer campos novos em documentos já existentes.

55 aplicação · 514 web · 72/72 E2E · lint e build limpos.

---

## §245 — a régua que se vê funcionando (fatia B, no tour)

*"sim, precisa aparecer funcionando no tour guiado"*

O §244 explicou por que a conformidade estava invisível e ligou o diagnóstico
que avisa. Faltava a outra metade da mesma resposta: **quem nunca viu a
capacidade funcionando não sabe o que o diagnóstico está oferecendo.** Um aviso
dizendo "sua config não tem padrão conferível" só convence quem já sabe o que um
padrão conferível faz.

Então o tour passou a mostrar. Passo novo, entre *"O agente propõe, o motor
mede"* e *"Proveniência"*:

> **O padrão do time, conferido** — Um padrão escrito em texto é uma opinião que
> alguém precisa lembrar de conferir. Quando ele vira régua, o motor confere
> sozinho e diz onde o desenho sai da linha. Clique no ⚖: a lista mostra o que
> viola, o que se esperava e POR QUE o padrão existe. E aceita ser contrariada.

**A decisão de projeto que isso forçou:** o tour não pode depender da config de
quem está vendo — foi exatamente esse acoplamento que produziu o §244. Se o
passo lesse `regrasConfig`, ele mostraria "0 fora do padrão" em 100% das
instalações e ensinaria o oposto do que existe para ensinar. Então entrou
`REGRAS_DO_TOUR` em `dadosDoTour.tsx`, ao lado do produto e da conversa de
demonstração (§237): **o tour carrega o próprio mundo.**

A regra escolhida não distorce o cenário — ela já era verdade nele. O nó mongo
`n2` do diagrama do tour nunca teve `chaveDeSharding`, então a violação
*emerge* do desenho que já estava lá; nada foi plantado para o ⚖ ter o que
acusar. E o `porque` é o que separa ensinar de cobrar: *"coleção que cresce sem
chave declarada vira migração de madrugada — foi o que aconteceu com o
catálogo."*

**A armadilha, pela quarta vez** (§221, §232, §233): o passo aponta para um chip
no topo, e a janela flutuante do passo anterior o cobriria. `onEnter` fecha o
assistente. Quatro ocorrências do mesmo bug em cinco passos novos é padrão, não
azar — e o teste de unidade agora afirma o `fecharAssistente`, não só o
seletor.

**Verificado com dado real, não só no tour.** O `checagem` foi aplicado ao
documento de regras do banco de desenvolvimento do usuário — pela API, com
validação, não por SQL — sobre dois requisitos que já existiam ali ("timeout e
política de retry", "retry e DLQ"). O engine rodando contra as 18 quebras reais
acusa exatamente uma:

> `Avaliação automática de crédito` → `bureau-credito-nacional` · `timeoutMs`:
> esperado ≤ 500ms, atual 3000

Ou seja: a régua não só aparece no tour, ela encontra um problema de verdade num
desenho que já estava salvo. E o diagnóstico do §244 parou de reclamar, porque
agora não há mais o que reclamar.

**Mordida:** trocar `REGRAS_DO_TOUR` por `regrasConfig` no caminho do tour →
`Expected substring: "1 fora do padrão"`. Falha pelo motivo certo.

258 engine · 515 web · 72/72 E2E · build limpo em todos os workspaces.

---

## §246 — o porquê, ancorado no nó (SPEC-57 fatia C)

A fatia B ensinou o motor a apontar onde o desenho sai do padrão. Sozinha ela é
**cobrança**: o vermelho diz *o quê*, nunca *por quê*, e um vermelho sem porquê
é uma ordem. A SPEC-57 §7 já dizia isso ao classificar a fatia C como *"o que
transforma B de cobrança em ensino"*. Esta rodada é essa fatia.

**A régua que impede ADR de virar wiki**, e ela está no modelo, no formulário e
no texto do botão: decisão nasce de **escolha entre alternativas** ou de exceção
consciente — nunca de "preencher um campo". `timeout = 300ms` continua sendo
valor com proveniência. "Rabbit e não Kafka, porque X" é decisão. Sem essa
régua, todo campo vira ADR e o mecanismo morre de excesso, que é como a maioria
dos repositórios de ADR morre. O formulário exige **duas opções** para salvar.

**O que se guarda não é a escolha, é o leque.** Registrar só a escolhida
documenta o que foi feito e perde exatamente o que serve daqui a um ano: quem
reabre a decisão sem as descartadas refaz a análise inteira, ou troca por uma
opção que já tinha sido rejeitada por um motivo que ninguém escreveu. Por isso
`alternativas` carrega a `consequencia` de cada uma, e as descartadas aparecem
riscadas no painel, no placar e na spec gerada.

**Três decisões de modelagem, todas herdadas de rodadas anteriores:**

1. **Nada é limpo em cascata.** Apagar o nó sobre o qual se decidiu algo produz
   uma decisão *órfã*, que aparece com ⚠ — mesma disciplina do vínculo quebrado
   (§230) e do `ALVO_INEXISTENTE`. Ou a decisão está obsoleta e alguém a
   substitui, ou o nó voltou com outro id e alguém religa; as duas exigem uma
   pessoa, e o silêncio não resolve nenhuma.
2. **Decisão revista não se apaga** — vira `substituida`, com `substituidaPor`.
   Quem apaga a decisão revista faz o time repetir o ciclo que a produziu.
3. **A exceção de padrão (§242) NÃO virou uma `Decisao` persistida.** A SPEC-57
   chama o caso 3 de "emenda ao ADR do padrão", e a tentação era gravar as duas
   coisas. Seriam duas cópias da mesma verdade, e a editada depois mentiria
   sobre a outra. `excecoesComoDecisoes()` é **leitura derivada**: aparece na
   mesma lista de "por que este desenho é assim", sem existir duas vezes.

**O que o chip 🧭 conta, e o que ele recusa contar.** Não conta decisões — isso
é volume, e premiar volume é o caminho mais curto para o cemitério de ADRs. Ele
cobra duas coisas: **proposta pendente** (regra 2 — o agente propõe, a pessoa
decide) e **decisão vigente sem o porquê**, que é o formato que faz alguém ler
daqui a um ano e continuar sem saber se ainda faz sentido.

**A lição do §244/§245 aplicada de primeira, não depois.** A fatia entrou no
tour na mesma rodada, com `DECISOES_DO_TOUR`: uma decisão aceita (Mongo em vez
de Postgres, com o custo do índice GIN que o time não sabe operar) e uma
proposta do agente esperando alguém. As duas ancoradas nos nós que o cenário do
tour **já tinha** — a demonstração não inventou desenho para ter o que mostrar.
E elas se somam às reais em vez de substituí-las: quem registra uma decisão
durante o tour precisa ver a própria aparecer, senão a demonstração ensina que
o botão não funciona.

**Um achado do E2E que virou UI melhor.** O passo do tour promete *"clique no
🧭: cada decisão guarda a escolhida, o porquê, e o que foi descartado"* — e o
popover não mostrava o descartado, só o painel do nó mostrava. O teste falhou
com `Expected substring: "opere o índice GIN"`. A resposta certa não era ajustar
a asserção: era a UI que estava incompleta, porque **essa lista é onde se lê
"por que este desenho é assim" de uma vez só**, e resposta sem o rejeitado é
meia resposta. A promessa do texto estava certa antes da tela.

**A armadilha pela quinta vez** (§221, §232, §233, §245): passo que aponta chip
no topo precisa de `fecharAssistente` no `onEnter`. Cinco de seis passos novos.
Já não é azar, é característica do layout — a janela flutuante do assistente
cobre a faixa do placar, ponto.

**Mordida:** trocar `decisoesVigentes(decisoes)` por `decisoes` em
`decisoesDoElemento` → três testes vermelhos, em dois pacotes: a proposta passa
a valer sem aceite, a substituída volta à leitura de hoje, e a proposta do
agente chega à spec. Falha pelos motivos certos.

270 engine · 526 web · 55 aplicação · 219 server · 72/72 E2E · build limpo.

---

## §247 — o agente propõe decisões, lendo o desenho MEDIDO (fecha a fatia C)

O §246 deixou o modelo aceitando `status: "proposta"` e a UI sabendo recebê-la —
mas nada gerava proposta nenhuma. Este é o elo que faltava, e ele é a tese da
SPEC-56 §0.7 executando: **o motor mede, o agente explica, a pessoa decide.**

**O que vai no pedido é o ponto inteiro.** Além do diagrama, vão:

- as **violações de padrão** que o motor já apontou, cada uma com o `porque` do
  padrão que ela contraria;
- as **lacunas de propósito** (necessidade sem componente que responda por ela);
- o que **já foi decidido**, como proibição explícita.

Um agente que recebe só o desenho devolve arquitetura de referência — o mesmo
texto que devolveria para qualquer diagrama parecido. Um que recebe *o que está
fora da régua deste desenho* devolve decisão sobre este desenho. A diferença
entre as duas coisas é a diferença entre a mesa e um chat.

E o `jaDecididas` não é detalhe: agente que re-litiga decisão tomada ensina a
pessoa a ignorar as propostas, e aí a fatia inteira vira ruído.

**A régua das duas alternativas é do PRODUTO, não do modelo — e isso foi um
achado, não um plano.** O esquema declara `minItems: 2`, mas
`provedorOpenAI` **remove `minItems`/`maxItems` antes de enviar**: Structured
Outputs da OpenAI recusa esses campos (já documentado em §—, no teste do
provedor). Ou seja: o prompt pede duas opções e *nada garante*. Então o filtro
determinístico entrou no ponto onde a proposta vira `Decisao`:

```ts
const comAlternativaReal = decisoes.filter((p) => p.alternativas.length >= 2);
```

Proposta com uma opção só é a opinião do modelo vestida de decisão, e a pessoa
não teria contra o que pesar. **A régua não pode morar num lugar que o
transporte apaga.**

**O dublê de gateway estava errado, e o E2E provou.** `preencher` devolvia
sempre UM item por array, ignorando `minItems`. Com o filtro acima, a proposta
era descartada antes de chegar à tela e o teste falharia *por culpa do dublê*.
Corrigido: o dublê agora honra `minItems`, que é o mínimo que se espera de algo
que finge obedecer um schema. É a segunda vez que este dublê aprende algo real
(a primeira foi o `content` virando array de parts com imagem).

**O que o E2E prova, e as unidades não podiam:** o botão monta o pedido com a
medição, atravessa Fastify e gateway, o SSE volta pelo caminho de streaming
(§231), a proposta aparece com `⏳`, o placar diz *"1 a decidir"* em vez de
contar, **não existe nenhuma decisão vigente** — e só depois do aceite ela vira
uma. A regra 2 inteira, no navegador.

**Mordida:** devolver `minimo = 1` no dublê → a proposta é filtrada, nada chega
à tela, e o teste falha em `Expected substring: "escrito-pelo-gateway-falso"`.
Vermelho pelo motivo certo — o produto recusando a proposta malformada.

Uma falha isolada apareceu na primeira execução completa depois do rebuild; três
suítes completas seguidas passaram 73/73 sem tocar em nada, então era flake de
subida de container, não regressão.

270 engine · 528 web · 62 aplicação · 219 server · 73/73 E2E · build limpo.

**A fatia C está fechada.** Restam da SPEC-57 a fatia E (percurso + regras de
topologia) e as três medições do §8.6.

---

## §248 — o CAMINHO, que não cabe em nó nenhum (SPEC-57 fatia E)

Até aqui a mesa media **elementos**: este componente está completo, aquele viola
o padrão, esta necessidade não tem quem responda. Mas uma classe inteira de
defeito não mora em elemento nenhum — mora entre eles. **Cinco saltos de 400ms
são cinco componentes dentro do padrão e uma resposta de dois segundos**, e
nenhuma medida por nó vê isso. É literalmente o caso do §6 da SPEC-57: *"com
fila, R2 (2s) depende do consumo — o pior caso do caminho passa de 2s"*.

**Inferido, não declarado.** A pergunta 4 do §5 estava em aberto: *"declarar dá
precisão e custa trabalho; inferir do grafo é grátis e erra"*. A resposta é a
terceira opção que a própria SPEC sugeria — **inferir e pedir confirmação**, que
é o padrão de proveniência que a casa usa em todo o resto. O motor lê os
caminhos de entrada a saída a cada render (função pura, sem I/O) e **nada é
medido antes do aceite**.

Isso trouxe uma consequência que só apareceu escrevendo: o estado de confirmação
precisa de **três** valores, não dois. `undefined` = o motor inferiu e ninguém
olhou; `true` = confirmado; `false` = *a pessoa disse que não é caminho*. Sem o
terceiro, o botão "não é caminho" não faria nada — o inferidor devolveria o
mesmo caminho no render seguinte, para sempre. Achei isso revisando o próprio
código antes de testar.

**A decisão mais importante da fatia é o que ela se RECUSA a medir.** Se um nó
do caminho declara o campo no seu tipo e não o preencheu, a soma está
incompleta. Somar o que existe produziria um número menor que a verdade — um
**verde falso**, que é o pior resultado possível de uma medição, porque encerra
a pergunta. Então a apuração tem três respostas, não duas:

> dentro do padrão · fora do padrão · **"faltam estes campos para eu conseguir
> dizer"**

E o terceiro estado aparece no chip, com os ids dos nós clicáveis: "não deu para
medir" sem endereço é uma reclamação, não uma informação. A diferença entre *não
se aplica* (o tipo do nó nem tem o campo) e *aplica-se e está vazio* é o que
separa silêncio legítimo de omissão — e é a fatia inteira.

**Onde a régua de percurso mora.** Em `regras`, ao lado do checklist por tech —
e **não é um quarto lugar de padrão**, que o §5 pergunta 2 já avisava ser
provável erro. É o mesmo arquivo com um segundo *escopo*: o checklist vale por
tech, este vale por caminho. Um percurso cruza techs por definição, então
enfiá-lo dentro de `porTech` obrigaria a escolher arbitrariamente uma delas.

**Duas correções de honestidade encontradas no caminho:**

1. **`saltos` contava nós.** `a → b` é *um* salto, não dois. Um off-by-one num
   rótulo que a pessoa lê para calibrar a régua faria ela compensar um erro
   nosso. Agora conta arestas percorridas.
2. **O diagnóstico do §108 conta `regrasDePercurso` desde o primeiro commit.**
   `percursos` é lista nova no topo de `regras`, o documento vive no banco desde
   a SPEC-36, e instalação existente nunca relê o arquivo. Sem a contagem, a
   fatia nasceria dormente em 100% das instalações — exatamente o §244, de novo.
   Desta vez foi contada antes de doer.

**No tour, e sem inventar desenho.** O cenário do tour tem dois nós
(`srv-catalogo → produtos`), e forçar uma violação de caminho ali seria piorar o
exemplo para ter o que mostrar — o que o §245 criticou. Então o passo mostra o
que o cenário honestamente tem: **a confirmação**, que é a resposta central da
fatia, e explica no texto o que as réguas fazem depois dela.

**Armadilha pela sexta vez** (§221, §232, §233, §245, §246): passo que aponta
chip no topo precisa de `fecharAssistente`. Seis de sete passos novos. A janela
do assistente cobre a faixa do placar, e isso é característica do layout — não
azar.

**Mordida:** desligar a guarda de campo faltante → a soma vira `NaN`, o motor
acusa uma violação inventada, e o teste do verde falso fica vermelho.

292 engine · 536 web · 63 aplicação · 220 server · 73/73 E2E · build limpo.

**Ainda em aberto da fatia E:** o item derivado por violação de percurso (o
equivalente do §240 para caminho) e a citação do percurso na spec.

---

## §249 — o caminho chega ao backlog e à spec (fecha a fatia E)

O §248 deixou o percurso inferido, confirmado e medido — visível no placar e
parado ali. Esta rodada fecha os dois últimos elos da cadeia: **item derivado**
e **citação na spec**. É o equivalente do §240 e do §230, uma dimensão acima.

**Três decisões no item derivado, e cada uma foi escolha entre alternativas
defensáveis:**

1. **Um item por violação de caminho, não um por nó do caminho.** O percurso
   `a→b→c→d→e` estourar o orçamento é *um* problema — "este caminho é lento" —,
   não cinco. Espalhá-lo em cinco itens faria cinco pessoas cortarem 50ms cada
   uma sem ninguém olhar o total, que é exatamente o defeito que esta fatia
   existe para tornar visível.
2. **Sem `origem`.** Todo item deste projeto aponta para um nó ou uma aresta;
   este não aponta para nenhum, e **a ausência é a afirmação certa**. O defeito
   é do caminho, e fixá-lo num nó culparia um componente que está, ele mesmo,
   dentro do padrão. O rótulo do percurso na descrição é o endereço.
3. **`naoMedidos` NÃO vira item.** "Falta preencher `timeoutMs` em n2" já é
   vermelho de completude no próprio nó. Um segundo item para o mesmo campo
   seria a mesma cobrança duas vezes, em dois lugares — é assim que backlog
   derivado perde a confiança de quem o lê.

E nunca `Débito Técnico`, mesmo com nó existente: o caminho não é um artefato
que já foi construído, é uma propriedade do desenho de agora.

**Por que o caminho entra na spec e não fica só no placar.** Saber que um
serviço está num caminho síncrono com orçamento de 2s **muda como ele é
escrito** — e essa informação não está em nenhum campo dele, está na soma. Quem
implementa lendo só a ficha do componente não teria como saber. Quando o caminho
já está fora do padrão, a citação diz isso junto, porque é a informação mais
útil das duas.

**Terceira vez que o mesmo achado aparece,** e vale como régua: a citação só
chega ao documento se a **tela de revisão** repassar. Passar no engine e esquecer
no `ReviewScreen` faz a feature funcionar em teste unitário e em lugar nenhum —
foi assim na fatia A (§230), na C (§246), e teria sido de novo aqui. O mesmo
para a derivação: sem `percursos` no `ContextoQuebra` do `App`, a violação
apareceria no placar e nunca chegaria ao backlog (o achado do §240).

**Mordida:** tirar `percursosQueContam` da citação → o caminho não confirmado
passa a ser citado num documento que sai para fora da equipe, e o teste da regra
2 fica vermelho.

301 engine · 536 web · 63 aplicação · 220 server · 73/73 E2E · build limpo.

**A fatia E está fechada, e com ela a SPEC-57 inteira** (A propósito, B padrão
conferível, C porquê, D proposta medida, E percurso). O que resta da spec são as
três medições do §8.6 — que não são feature, são instrumentação para saber se o
que foi construído está sendo usado.

---

## §250 — o documento de desenho, as cinco fatias (SPEC-58)

*"pode implementar todas fases"*, com o requisito que reorientou a execução:
*"o output deve ser visualmente bonito"*.

**O achado que virou a SPEC do avesso, e que só apareceu porque fui verificar
antes de escrever:** `quebra.especificacao` estava persistida desde o §184 e
**nunca era exibida**. O App a lia como booleano (`!!quebra.especificacao`), o
markdown ia para o download e sumia da aplicação. O documento não precisava ser
criado — precisava ser **promovido de saída a artefato de trabalho**.

### O que ficou de pé

- **`estruturarDocumento`** — a estrutura de que saem a tela e o HTML. A régua
  do §7.3 (as saídas não podem divergir) virou um **teste de guarda** que cobra
  os mesmos fatos nas duas, em vez de uma promessa no comentário;
- **`#/documento`** — tela própria, ao lado de `#/itens`, com a faixa de saúde
  (os mesmos 🎯 ⚖ 🧭 🛣 do placar), o **diagrama animado embutido** e as
  decisões em cartão com as descartadas riscadas;
- **as duas seções escritas** — trade-offs e riscos, com marca visual própria.
  É proveniência aplicada ao documento: quem lê precisa saber o que uma pessoa
  afirmou e o que a máquina apurou;
- **o ciclo** — rascunho → em revisão → aprovado → implementado, sem bloquear
  nada;
- **o HTML autocontido** — um arquivo, CSS inline, zero dependência nova, no
  molde do `gerarDiagramaHtml` (SPEC-21). `@media print` cuidado dá o PDF de
  graça.

**Nenhuma biblioteca de markdown entrou.** O `packages/web` continua com seis
dependências. Reparsear um texto que nós mesmos geramos, para renderizar uma
estrutura que já está na mão, seria pagar uma árvore de dependências por um
intermediário desnecessário.

### O carimbo, e o que ele resolve

O documento é montado ao vivo — não há "regenerar" a clicar. Então **aprovar
guarda o markdown do momento**, e é aí que a coluna `especificacao` finalmente
ganha propósito: ser a FOTO do que foi aprovado. Comparar a foto com o documento
de agora é o que faz "aprovado" não virar carimbo.

### Três defeitos encontrados pelo E2E, e um deles é grave

1. **`abrirPorId` apagava metade da quebra.** Ele reconstrói o objeto campo a
   campo, e o §184 já tinha corrigido isso uma vez ("antes só vinham
   título/time/diagrama"). Desde então **cada** campo novo — produto (SPEC-53),
   necessidades, decisões, exceções, percursos, documento — foi esquecido de
   novo. Reabrir a demanda apagava as fatias A, C e E inteiras, em silêncio, e o
   autosave seguinte gravava o vazio por cima do que estava salvo. **Terceira
   ocorrência da mesma classe.** O que fecha isso não é lembrar melhor: é o
   teste novo, que compara a quebra reaberta com a salva **inteira**, em vez de
   conferir campo escolhido a dedo — campo novo esquecido quebra o teste no
   mesmo commit em que nasce.
2. **O documento não derivava sozinho.** Ao reabrir uma demanda salva,
   `resultado` é `null`, e o documento dizia "nenhum item derivado" sobre uma
   demanda que tem itens. Pior: a comparação com a foto deixava de enxergar
   mudança de desenho, porque o texto comparado não continha o desenho. Agora o
   documento roda o motor por conta própria.
3. **`?? []` furando o `useMemo`.** Um array novo a cada render regerava o HTML
   do diagrama, o `srcDoc` do iframe recarregava e **roubava o foco de quem
   estava escrevendo**.

### Uma lição de teste que vale por si

`toContainText` do Playwright lê o texto RENDERIZADO. Nesta subárvore o
`innerText` volta só com o título, e o matcher ficava vendo o estado anterior
enquanto `textContent` já tinha o texto — verificado com sete amostragens ao
longo de três segundos. E `toHaveValue` sobre componente controlado é **falso
positivo por construção**: se o React não re-renderizar, o DOM guarda o valor
que o próprio teste escreveu. A pergunta que importa não era "o DOM pintou?",
era "sobreviveu?" — e ela se responde no servidor.

316 engine · 551 web · 63 aplicação · 222 server · 74/74 E2E · build limpo.

Uma falha isolada de `produto-contexto` apareceu numa execução completa; duas
suítes seguidas depois deram 74/74 sem tocar em nada — flake de paralelismo.

---

## §251 — as lacunas que a avaliação do tour encontrou

Pedido: *"avalia se a demonstração está cobrindo tudo"*. A avaliação achou três
coisas, e a mais barata de arrumar foi a menos interessante.

**Cobertura de telas: completa.** As 12 áreas de configuração de `rota.ts`
aparecem em um dos dois tours; o fluxo principal está inteiro; as quatro
dimensões novas têm passo próprio.

**Lacuna 1 — a tela do documento não existia no tour, e o passo vizinho mentia.**
O passo "Especificação de solução" ainda dizia *"o balão baixa o markdown"*,
descrevendo o mundo anterior à SPEC-58 como se fosse a história toda. Dívida
minha, e a mesma classe do §244: capacidade que o tour não mostra não existe
para quem está avaliando a ferramenta.

**Lacuna 2 — o ato de pedir a decisão ao agente nunca era exercido.** A proposta
aparecia como DADO (o ⏳ na lista); o botão que a produz, não. É justamente a
interação que melhor mostra a tese — o motor mede, o agente explica, a pessoa
decide.

**Achado estrutural, deixado para decisão do usuário:** o tour do produto voltou
a ter 24 passos, 8 deles de administração — exatamente o que a divisão do §236
existia para evitar.

### O que a correção destas duas lacunas desenterrou

**Um defeito do tour que valia mais que as lacunas.** O passo novo aponta um
botão que fica **abaixo da dobra** no painel do nó. A carta era posicionada a
partir de um retângulo fora da viewport e ia parar fora da tela: o "Próximo"
existia e era inalcançável, e o tour travava. Três correções, e a honestidade
sobre qual delas resolveu:

- **os textos estavam longos demais** — 679 caracteres num cartão de 300px. Foi
  **isto** que destravou, e é bom que seja: cartão de tour com seis linhas é
  ruim independentemente de travar;
- **a carta agora tem teto e rolagem própria**, e o clamp prende topo e esquerda
  dentro da viewport;
- **o alvo é trazido para a tela antes de ser medido**, uma vez por passo.

**As duas últimas passaram na mordida**, ou seja: estavam sem cobertura. Em vez
de deixá-las como fé, ganharam teste direto — `posicionarCard` foi exportado e
tem caso para alvo colado no rodapé, na borda direita e acima da dobra; e
`useRect` tem caso para a rolagem. Agora as três mordem.

**A demonstração chegava pela metade, terceira vez.** `DECISOES_DO_TOUR` e
`REGRAS_DO_TOUR` alimentavam o placar e o painel do nó, e **não o documento** —
que lia a config real e saía sem decisão nenhuma, contradizendo o passo que
acabara de prometê-las. Virou uma variável só (`regrasVisiveis`,
`decisoesVisiveis`) em vez de um ternário por chamada, que é o que fazia a
terceira superfície ser esquecida.

**E uma nota de plataforma:** `scrollIntoView` não existe em jsdom. A chamada
virou `?.scrollIntoView?.()` — presumir que toda plataforma tem o método
quebrava o teste de quem nem estava exercitando rolagem.

316 engine · 560 web · 63 aplicação · 222 server · 74/74 E2E · build limpo.

---

## §252 — o tour anda sozinho, e volta a caber em si

Dois pedidos: reorganizar a divisão dos tours, e *"que ele rode sozinho, sem
depender de clicar em ok como a demo fazia, alguns trechos podem demorar mais
do que outros para mostrar as partes que mais impressionam"*.

### A divisão, devolvida

Sete telas de administração saíram do tour do produto: contexto do produto,
stacks, padrões por componente, níveis e acessos, modelos, exportação e PDCA.
**Produto: 26 → 19 passos. Configuração: 6 → 13.**

O §236 tinha dividido os tours exatamente por isso — *"para o primeiro
continuar respondendo 'isto serve pra quê?' em vez de virar 25 passos onde
metade é tela de administração"*. A deriva desfez isso um passo por vez, sem
ninguém decidir nada. O que impede a próxima é um teste novo: **o tour do
produto não pode chamar `abrirConfigNaAba` nenhuma vez**. Passo de
administração que vazar de volta quebra no mesmo commit.

O de configuração ganhou ordem por assunto: o que o produto é → o que os
componentes e conexões declaram → as réguas e os modelos → quem escreve (IA) →
quem pode, para onde vai, e como melhora.

### O relógio

A demonstração automática existiu e **foi removida no §243**, porque ela e o
tour faziam a mesma coisa por dois caminhos. Isto não a traz de volta: traz o
comportamento dela para dentro do único mecanismo que sobrou. Continua havendo
um tour só — ele é que passou a andar.

- **cada passo diz quanto quer durar** (`segundos`), e é a resposta ao pedido:
  transição 6–8s; o agente medindo, o padrão conferido e o caminho, 12s; a tela
  do documento montado, 14s. Ter que pedir tempo a mais é o que impede o tour
  de virar uma sequência de telas paradas;
- **"Próximo" continua existindo** — automático que sequestra o controle é pior
  que manual;
- **barra de progresso**, porque avanço automático sem sinal faz a pessoa achar
  que a tela pulou por erro.

### O defeito que quase passou, e é o mais bonito da rodada

Pausar e **segurar** precisavam ser dois estados, não um. Com um só: o ponteiro
entra na carta → pausa; o clique no botão → **despausa**. O botão de pausa não
funcionava, e pelo motivo mais difícil de enxergar — o próprio movimento do
mouse até ele já tinha feito o trabalho que o clique desfazia.

Agora `pausado` é ato da pessoa (tem botão) e `segurado` é o ponteiro sobre a
carta; o relógio anda só quando nenhum dos dois segura. E despausar **reinicia**
o tempo do passo: continuar de onde parou faria quem pausou para ler perder o
passo um segundo depois de voltar.

### O que o E2E acrescentou

Um teste que **não clica em nada** e vê o tour passar sozinho; depois pausa,
move o mouse para longe, espera 14 segundos e cobra que nada mudou. Sem ele o
modo automático seria uma afirmação de teste de unidade — o relógio existiria
no hook e ninguém saberia se chega à tela.

E os testes que já existiam pediram para pausar o tour antes de andar clicando:
sem isso o teste andaria dois passos por clique. Pausar é botão de verdade, não
gancho criado para o teste.

**Mordida:** tirar `pausado || segurado` da guarda do relógio → dois vermelhos,
a pausa e a retenção.

316 engine · 567 web · 63 aplicação · 222 server · 75/75 E2E · build limpo.

---

## §253 — dois defeitos vistos em uso, e a causa comum de um deles

Dois relatos com print, na mesma sessão.

### 1. O campo de contexto espremido

*"a barra de rolagem chega até o fim e o texto do último campo de texto é quase
que tapado"* — o campo do contexto do épico aparecia com **uma linha**, com o
texto cortado ao meio.

Não era o rodapé cobrindo, que foi a primeira hipótese. O `textarea` é item de
um flex column com altura definida, e **item flex encolhe por padrão**. Quando
a lista de necessidades acima crescia, o campo era espremido a quase nada — em
vez de o container rolar, que é exatamente para isso que ele tem `overflow:
auto`. E `rows={8}` não protege: `rows` é altura *inicial*, não mínima.

`flexShrink: 0` + `minHeight`. O teste é E2E e mede `boundingBox`, porque só o
navegador faz layout: em jsdom, `rows={8}` continuaria escrito com o campo
medindo 30 pixels, e conferir o estilo diria *"flexShrink está lá"* — não *"o
campo tem tamanho"*.

### 2. O chip "1 a decidir" que não sumia

*"aceitei uma decisão proposta pelo agente e segue aparecendo o chip de
pendente"*.

A causa não estava no aceite, e sim na **saída do tour**. `ligarDemonstracao
(false)` morava no `onEnter` do último passo — o que só cobre quem chega até o
fim. **Quem PULAVA saía com a demonstração ligada**, e `DECISOES_DO_TOUR` (que
tem uma proposta, de propósito, para ensinar a regra 2) continuava misturada
aos dados de uma sessão real. Aceitá-la não fazia nada: o aceite grava em
`quebra.decisoes`, e ela não vive lá.

Dois consertos, em níveis diferentes:

- **a garantia é da SAÍDA, não de um passo.** Passo pode não ser alcançado;
  saída sempre acontece. `pular` e o fim do percurso desligam a demonstração;
- **proposta de demonstração não oferece aceite**, e ganha a marca. Botão que
  não faz nada é pior que botão ausente — e o §235 já mandava marcar todo dado
  de demonstração. Eu não tinha marcado as decisões quando as criei no §246,
  e essa omissão é metade do motivo de alguém tentar aceitar uma que não é sua.

**A régua que fica:** dado de demonstração precisa de duas garantias, não uma —
que ele **saia** (em toda saída, não na feliz) e que, enquanto está na tela, ele
**se identifique**. Faltando qualquer uma, ele vira dado real na cabeça de quem
está olhando.

**Mordidas:** tirar `encerrar()` do `pular` → dois vermelhos; tirar a marca de
demonstração → um. Ambas falham pelo motivo certo.

316 engine · 572 web · 63 aplicação · 222 server · 76/76 E2E · build limpo.

---

## §254 — o desenho escapa da coluna, e o ponteiro volta

Dois pontos do mesmo print, e uma pergunta.

**A pergunta:** *"o que acontece ao clicar naquele botão?"* — "Reproduzir em
sequência" é o modo guiado do diagrama (SPEC-21): percorre as conexões uma a
uma, animando a direção do fluxo, para quem vê o desenho pela primeira vez
entender a ORDEM em que as coisas acontecem.

### O botão cortado

Ele estava cortado porque o diagrama foi espremido na coluna de leitura. As
~46rem são a régua certa para **texto** e errada para um desenho: nela o
gerador empilhava o cabeçalho numa coluna de três letras e o botão sumia na
borda.

O desenho passou a **escapar da coluna** (`width: min(1100px, calc(100vw -
48px))` com centralização por margem negativa), na tela e no HTML exportado —
e volta à largura da página na impressão, onde não há viewport para escapar.

A régua: **largura de leitura vale para parágrafo, não para diagrama.**
Obrigá-lo à medida do texto não deixa nada legível.

O teste mede o `boundingBox` e compara com a largura do título. Só medir
serve: `width: min(...)` continuaria escrito no código com o quadro estreito.

### O ponteiro

Pedido: *"seria importante mostrar um cursor como de mouse confirmando as
coisas"*. O `CursorFantasma` existiu e foi removido no §243 junto com a
demonstração automática; volta como parte do tour, não como segundo mecanismo
— mesma disciplina do §252.

**O que ele é, e o que ele deliberadamente não é:** ele **não simula clique**.
Cada passo executa a ação de verdade no `onEnter` (abre a tela, seleciona o nó,
deriva); o ponteiro vai até onde isso aconteceu e dá um pulso. Um cursor que
fingisse clicar seria teatro — e teatro numa demonstração é a mesma família de
mentira que o §234 pagou caro: a tela dizendo uma coisa e a ferramenta fazendo
outra.

Detalhes que os testes prendem: sem alvo ele não aparece (apontar para o nada é
pior que não apontar); o deslocamento dentro do alvo é proporcional, para não
sair de um alvo pequeno; o pulso reinicia a cada passo; e ele não intercepta
clique.

**Mordidas:** devolver o diagrama à largura da coluna → o E2E acusa `> 646`
recebendo `646`; tirar o alvo do ponteiro → o E2E não o encontra.

316 engine · 577 web · 63 aplicação · 222 server · 76/76 E2E · build limpo.

---

## §255 — o motor explicado, na demo e no README

*"sinto falta de uma explicação melhor sobre o que é o motor, como ele funciona
do ponto de vista do usuário, como ele se conecta com o resto"*.

O que existia dizia **o que o motor não é**: *"um motor determinístico — não um
LLM"*, e seguia em frente. Quem chega precisa do contrário — o que ele é, o que
decide, e onde a IA entra. **A divisão entre os dois é a tese do produto
inteiro, e não estava escrita em lugar nenhum que uma pessoa leia.**

### O que passou a estar escrito, nos três lugares

**Na jornada** (a aba "A jornada" da modal E a landing pública — um componente
só, dois públicos): um bloco antes das etapas com três parágrafos. O que ele lê
(o desenho **e** a configuração do time) e as três coisas que faz — mede,
deriva, monta. A divisão de trabalho. E o que o determinismo dá na prática.

**No tour**: um passo novo em segundo lugar, "Quem faz o quê", antes de
qualquer tela. O tour mostrava o que a ferramenta faz sem nunca dizer quem faz.

**No README**: uma seção com o desenho de entrada e saída, as três funções
detalhadas (incluindo as quatro dimensões de medição, que nenhum texto de
apresentação mencionava), e a divisão em citação.

E movi a seção para **antes das instruções de instalação**: quem lê um README
precisa entender o que a coisa é antes de aprender a subir o Docker.

### Duas correções que apareceram junto

O texto das etapas estava **desatualizado desde as fatias B e E**: "Prontidão"
falava só do semáforo de campos, e "Derivar" prometia itens por nó e por
aresta. Hoje o motor mede quatro dimensões e deriva quatro tipos de item.
Explicação de produto envelhece em silêncio — ninguém recebe erro de
compilação por um parágrafo que virou meia verdade.

### A régua sobre como explicar

Dizer que algo é *"determinístico"* é adjetivo de folheto. O que vale é a
consequência, e é isso que os três textos agora dizem: **o mesmo desenho
produz os mesmos itens** (dá para mudar uma coisa e comparar), **a chave do
item é estável** (rederivar não perde o que você escreveu) e **dá para
discordar** (existe uma regra explícita atrás de cada apontamento, e você pode
mudá-la ou contrariá-la com motivo). Medida que ninguém consegue contestar vira
ruído ou dogma.

Os testes cobram exatamente isso: não que as palavras existam, mas que as três
consequências e a divisão motor × IA estejam ditas. E o teste da modal, que
cobrava a frase antiga, apontou sozinho que ela tinha mudado de lugar.

316 engine · 583 web · 63 aplicação · 222 server · 76/76 E2E · build limpo.

---

## §256 — o desenho escapou sozinho, e deixou o título para trás

*"essa parte dá uma sensação de desalinhamento ou algo fora do lugar"*.

O §254 fez o diagrama sair da coluna de leitura — necessário, porque 46rem é a
régua do texto e nela o gerador do diagrama empilhava o cabeçalho e cortava o
botão. **Mas ele saiu sozinho.** O título "O desenho" ficou na coluna e o
conteúdo que ele rotula começava ~280 pixels à esquerda dele. Largura
resolvida, alinhamento quebrado — e o resultado lê como um bloco que caiu fora
da folha.

A correção é que **título e conteúdo saem juntos**, compartilhando a borda
esquerda. Com isso a largura maior deixa de parecer acidente e passa a ler como
figura deliberada — reforçada por fundo e respiro próprios, que anunciam "isto
é uma faixa, não um parágrafo que vazou".

Na impressão a faixa volta à largura da página e perde o fundo: lá não há
viewport de onde escapar, e a moldura só gastaria tinta.

**A régua que fica, e ela é sobre correções em geral:** quando um elemento
precisa quebrar a grade, ele quebra **com o rótulo dele**. Um pedaço fora da
grade e outro dentro não é meio-conserto — é um desalinhamento novo, e foi
exatamente o que a correção anterior produziu.

**Mordida:** empurrar o título 300px para dentro → o E2E acusa
`Expected: < 24 / Received: 300`, que é o número do print.

O teste compara a coordenada `x` do título com a do diagrama. Só o navegador
mede isso: em jsdom, o `margin-left: 50%` estaria escrito e nada saberia dizer
onde as duas coisas foram parar.

316 engine · 583 web · 63 aplicação · 222 server · 76/76 E2E · build limpo.

---

## §257 — a folha virou a página, e o documento perdeu um passo repetido

*"parece sobreposto e meio repetitivo em relação ao passo posterior"*.

### A sobreposição

A causa era estrutural, e minha: a faixa do desenho era **filha da folha** e
saía dela por margem negativa. O cartão continuava com 46rem de largura e a
faixa pintava por cima da borda dele — duas camadas se cruzando, que é
exatamente a sensação de "sobreposto".

O §254 fez o desenho escapar da coluna, o §256 fez o título escapar junto, e
os dois consertos mantiveram a premissa errada: **que a folha é a coluna de
leitura**. Ela não é.

Invertido: **a folha é a PÁGINA, e o texto é que se limita a ~46rem**, centrado
dentro dela. A faixa do desenho passa a usar a largura da folha, sem margem
negativa. Nada escapa de nada, e a régua de leitura continua valendo onde ela
importa — no parágrafo.

A lição é sobre a forma dos dois consertos anteriores: eu estava resolvendo um
sintoma por vez (largura, depois alinhamento) sem revisar a premissa que
produzia os dois. O terceiro relato é que forçou a pergunta certa.

### A repetição

Havia dois passos seguidos sobre o mesmo artefato: "Especificação de solução" e
"O documento de desenho" — e o primeiro **terminava anunciando o segundo**
(*"tem tela própria, que é o próximo passo"*). Isso era resíduo do §251: quando
a tela do documento entrou no tour, o passo antigo virou teaser em vez de sair.

Fundidos. O que o passo removido tinha de próprio — *o agente oferece o
documento sozinho quando tudo está refinado* — abre o passo que ficou. Produto:
20 → 19 passos.

**Mordidas:** devolver a folha a 46rem → o E2E acusa `> 646` recebendo `604`;
e o teste da fusão cobra que "Especificação de solução" não exista mais **e**
que a frase do passo removido esteja no que ficou — senão fundir viraria
apagar.

316 engine · 584 web · 63 aplicação · 222 server · 76/76 E2E · build limpo.

---

## §258 — o mapa do sistema (SPEC-59 fatias A e B)

*"revise, planeje e implemente"* sobre a SPEC-59. Implementadas **A (ver) e B
(avatares)** — que é o que a própria SPEC recomendou fazer primeiro, e o que o
pedido original descrevia visualmente. **C, D e E ficaram de fora de propósito**
(ver o fim desta entrada).

### O que ficou de pé

Uma tela nova, `#/sistema` ("Como está montada", no menu), em **leitura**:

- **o que o motor confere** — regras por tech, separando `requisitos` de
  `conferíveis`, mais as réguas de percurso;
- **quem escreve** — a esteira como **sequência**, com avatar por papel;
- **o laço do PDCA** — a seta de volta, que dá nome ao ciclo e não existia em
  tela nenhuma;
- **o item no centro**, que é o que os dois primeiros produzem.

Cada bloco leva à tela que edita aquilo. **A vista não edita nada**, e essa
restrição é o que a torna barata: config quebrada aqui quebraria a ferramenta
inteira, não o desenho de uma demanda.

### Os avatares, e o que os salva de serem adesivo

O anel colorido **é o estado**, não enfeite: `ativo`, `desligado`,
`sem-credencial`. O terceiro é o que responde *"por que meu item saiu vazio?"* —
um papel ativo sem modelo configurado é o defeito mais silencioso que existe
aqui, e hoje só se descobre olhando o resultado. E o aviso leva à solução: o
avatar sem modelo tem um link para a tela de IA.

**A ordem da checagem virou teste**, porque errá-la seria pior que não ter o
estado: papel **desligado** não é "sem credencial". Dizer o contrário mandaria a
pessoa configurar IA para resolver um problema que ela mesma criou.

### O que eu NÃO implementei, e por quê

**"Falhou na última execução"** está na SPEC-59 §4 e ficou de fora: o produto
não guarda o resultado das execuções da esteira. Inventar esse estado a partir
de nada seria um avatar mentindo sobre saúde — o oposto do que ele existe para
fazer. Fica registrado como o que falta, não como o que foi entregue.

**As fatias C, D e E** (separar `UseQuebra`, editar pelo canvas, aposentar as
abas) seguem a recomendação da SPEC: *"A primeiro, e por bastante tempo"*. Se a
vista não convencer em uso, as outras não merecem ser construídas — e terá
custado uma fatia em vez de cinco.

### Uma decisão que a implementação forçou

A tela usa a config **real**, nunca a de demonstração do tour. Ela responde
"como o MEU ambiente está montado", e mostrar a régua da demonstração ali seria
mentir sobre o ambiente de quem olha — exatamente o oposto do §245, onde a
demonstração era necessária porque a config de quem via não tinha o que mostrar.
Mesma ferramenta, decisão contrária, e o critério é o mesmo: **o que a tela
afirma ser**.

**Mordida:** tirar `temCredencialDeIa` do cálculo do estado → vermelho em
unidade *e* no navegador, porque a esteira do ambiente de teste não tem modelo e
o avatar passaria a dizer "ativo".

316 engine · 594 web · 72 aplicação · 222 server · 76/76 E2E · build limpo.

Uma falha isolada de `produto-contexto` apareceu numa execução completa; em
isolamento e na suíte seguinte passou — é o mesmo flake de paralelismo do §250.

---

## §259 — a parede caiu: estado de diagrama × estado de quebra (SPEC-59 fatia C)

A SPEC-59 §5 chamou isto de *"o trabalho real"*, e era: o `Canvas` já era
genérico na FORMA (recebe `DiagramaConfig` e desenha o que ele declarar) e
acoplado ao DOMÍNIO (recebia `UseQuebra`). Qualquer segundo desenho — o mapa do
sistema, um diagrama de referência, o que vier — esbarrava nessa parede.

**`useDiagrama` extraído.** Ele recebe o diagrama e **a função que o
substitui**, e não sabe onde ele mora. `useQuebra` o compõe, e só um callback de
três linhas sabe que o diagrama vive dentro de uma quebra.

**Composição, e não genérico por parâmetro de tipo** — que era a proposta da
SPEC §9.3 e continua certa: genérico espalharia o domínio dentro do canvas, e o
que se queria era exatamente tirá-lo de lá.

**O canvas e os painéis passaram a declarar o que usam.** `Canvas` recebe
`diagramaState` e `timePadrao`: ele precisava do time da quebra para o rótulo do
nó, e agora recebe isso como **valor**, não vai buscar num estado que não é
dele.

### O teste que faz a separação valer

Um hook que continuasse importando `Quebra` e "por acaso" não a usasse seria a
mesma parede, esperando a próxima adição para reaparecer. Então há um teste que
**lê o arquivo** e cobra que o código não mencione `Quebra` nem os campos dela.

Ele já se corrigiu uma vez sozinho: a primeira versão casava com as menções em
**comentário** — que são justamente as que explicam a fronteira. Proibir a
palavra proibiria a documentação dela. Passou a olhar o código com comentários
removidos.

### Dois fixtures apontaram a mudança antes de mim

O fixture do teste de repintura descrevia `{ quebra: { diagrama } }`, e o do
`EdgePanel` lia `quebra.diagrama.nodes`. Nenhum dos dois falhou por acaso: eles
descreviam o contrato anterior, e é para isso que servem.

**Mordida:** reimportar `Quebra` no hook → vermelho imediato, com o nome do
arquivo e a razão.

316 engine · 600 web · 72 aplicação · 222 server · 76/76 E2E · build limpo.

**O que isto destrava:** a fatia D (editar o mapa do sistema pelo canvas de
verdade) deixou de exigir um refactor antes de começar. E o próximo diagrama que
alguém quiser — qualquer um — nasce sem pedir licença ao domínio da demanda.

---

## §260 — editar onde se vê o problema (SPEC-59 fatia D, revisada)

*"pode seguir, gostei"* — sobre a vista. Então: fatia D. E construir a fatia A
mudou o que D deveria ser, então **revisei a SPEC antes de implementar** em vez
de executar o que estava escrito.

### O que estava escrito, e por que não fiz assim

D dizia *"mover, ligar, criar papel e regra pelo canvas"* — ou seja, arrastar
caixinha. Com a vista de pé, isso é o erro do §2 da própria SPEC ("tudo vira
nó") um nível mais fundo:

- a esteira é **sequência**, e editá-la arrastando em duas dimensões é pior que
  ↑↓;
- "criar regra" não tem mapeamento honesto — regras são arrays por tech com
  `checagem`, não caixas soltas;
- e o que foi aprovado em uso foi a vista em **blocos**, não um canvas.

### O que fiz

As **duas edições que o mapa provoca**: ligar/desligar um papel e reordenar a
esteira, ali mesmo. Ver que um papel está desligado e ter que ir a outra tela
para ligá-lo é o mapa apontando um problema e cobrando pedágio.

**Sem modal de "ver o efeito antes de aplicar", e isso é decisão, não atalho.**
O efeito **é o mapa**: o avatar troca de estado na frente de quem clicou, a
ordem se reorganiza, e um clique desfaz. O portão que o §6 pedia existe para
mudança estrutural de regra, não para um interruptor reversível de resultado
imediato.

**A falha de escrita não some.** O estado local muda primeiro (padrão do resto
do app), mas se o servidor recusar, ele **volta atrás** e o erro aparece: tela
otimista sobre uma escrita que falhou é mentir com mais confiança do que não ter
salvado.

### A fatia E sai do plano, e o motivo é de produto

Aposentar as abas **removeria capacidade**: o mapa liga/desliga e reordena; as
telas editam preâmbulo, contextos, requisitos, checagens e aplicam propostas do
PDCA. Tirá-las hoje seria regressão vestida de limpeza.

E se um dia o mapa fizer tudo o que elas fazem, ele **terá virado as telas** —
com caixas em volta. O ganho da fatia A nunca foi substituir formulário: foi
mostrar a **ligação** que o formulário escondia. As duas coisas convivem por
mérito.

**Mordida:** tirar o `salvar` do fluxo → o E2E acusa `Expected: false /
Received: true` lendo o servidor. É a mordida que importa aqui: um toggle que
pinta a tela e não grava é a pior versão desta feature, porque a pessoa sai
achando que configurou.

316 engine · 604 web · 72 aplicação · 222 server · 77/77 E2E · build limpo.

## §261 — o clique que diz o que está ignorando

*"não removeremos, tem alguma melhoria sugerida por vc?"* — sugeri três, e a
resposta foi *"vamos a 1"*. A 1 era: **o botão de derivar dizer o que está
deixando para trás**.

### O buraco

A SPEC-57 M7 prometia *"vermelho bloqueia, amarelo avisa — agora sobre todas as
dimensões"*, e entregou metade. O portão consulta só completude
(`vermelhos.length > 0`). Propósito, padrão, decisão e caminho — tudo o que foi
construído do §230 em diante — é amarelo. E amarelo que ninguém lê **no momento
da decisão** é medida nenhuma: derivar com uma necessidade órfã e uma proposta
do agente pendente acontecia em silêncio absoluto.

Não é sobre bloquear. Bloquear cedo ensina a ignorar a cor, e essa régua vale
desde o §230. É sobre o silêncio virar **reconhecimento**: seguir sabendo, ao
preço de um clique.

### A régua que descobri no meio, corrigindo a mim mesmo

Comecei avisando sobre as quatro dimensões. Os 12 E2E que quebraram me fizeram
olhar de novo, e o erro era de desenho, não de teste:

> **violação de padrão vira item (§240). Caminho fora da régua vira item
> (§249).** Avisar sobre eles é avisar sobre exatamente aquilo que o clique
> está prestes a resolver.

Um diálogo que aparece toda vez para anunciar o que já vai ser tratado é a
receita mais rápida de ensinar alguém a fechá-lo sem ler. Então o critério
virou **só o que a derivação NÃO resolve**: necessidade sem dono, caminho que
não dá para medir por falta de campo, proposta que ninguém aceitou, decisão sem
o porquê. Nenhum vira item. Nenhum reaparece depois. A dimensão `padrao` saiu
do tipo — e a ausência dela no `Record` é a régua escrita em código.

### O que não é

"Derivar assim mesmo" é a ação **primária**, à direita, e um clique basta.
Clicar fora fecha. O texto diz o que fica para trás, não o que a pessoa fez de
errado — às vezes derivar com um caminho fora da régua é a decisão certa, e ela
não precisa de permissão, precisa de informação.

### Três coisas que os testes cobraram

**O helper condicional (e a corrida dentro dele).** O diálogo aparece *por
mérito*: o cenário `mongo.json` traz necessidade órfã, e compor cenários pela
mesa não traz (só o diagrama é mesclado). Um clique cravado quebrava o segundo
caso. Mas a primeira versão do helper usava `isVisible()`, que responde no
mesmo instante — logo após o clique o React ainda não montou nada, dava `false`,
e o diálogo abria **em cima do teste seguinte**. Em arquivo serial isso derruba
quem vem depois, que é o pior tipo de falha: aparece longe da causa. `waitFor`
com janela curta resolve.

**O tour passava por fora.** `derivarQuebra` do tour chama `executarDerivacao`
direto. Sem um `mostrarAvisos` explícito, a capacidade existiria e não seria
demonstrada — §244 de novo.

**Um diagnóstico virou falso negativo.** `ia-hospedada` afirmava sobre
`janela.innerText().slice(0, 600)`. O seletor de produto do SPEC-58 nasceu
acima, empurrou o delta para fora do corte, e o teste passou a acusar ausência
de algo que **estava na tela** (o snapshot mostrava `1 sugerida(s)` em `e102`).
Corte por posição é bomba-relógio; ancorei na região das necessidades, que
contém o delta e contém o erro da proposta.

### Mordidas

Três, uma por camada: sumir com o aviso de caminho não-medido → engine vermelho;
o botão primário chamando `onVoltar` → unidade vermelha; `decisoes: []` no memo
do `App` → o E2E do tour não acha `aviso-decisao`. A terceira é a que importa,
porque é a única que prova que o diálogo mostra dado **de verdade**.

324 engine · 610 web · 72 aplicação · 222 server · 77/77 E2E · build limpo.

## §262 — o flake era um verde falso disfarçado

*"e em seguida sanar a dívida de teste"*. O flake do `produto-contexto` falhou
em duas execuções completas (§250, §258) e passou isolado nas duas. Fui atrás
da causa em vez de re-rodar.

### O que estava no banco

```
Portabilidade e2e 1786853010699 | Levar a conta do cliente para outro banco.
```

Um resíduo de execução interrompida, vivo no banco de e2e. O `finally` apagava
por nome **exato** — e o nome carrega `Date.now()`, então nenhuma execução
seguinte conseguia apagá-lo. Limpar só o que se criou é limpeza que não limpa.

E aí vem a parte pior. A tela reabre no **primeiro produto da lista** (ordenada
por nome) quando não sabe qual estava aberto, e o resíduo ordenava antes. O
teste recarregava e afirmava direto sobre o campo:

- resíduo vazio → vermelho, o flake que eu via;
- resíduo **com o mesmo texto** → **verde lendo a linha errada**.

Estava verde pelo segundo motivo quando fui olhar. Um flake é barulhento; um
verde falso é silencioso, e os dois eram a mesma falha.

### A causa real não era ordenação

Reproduzi inserindo um concorrente vazio: vermelho na hora. Corrigi a ordenação
— abrir o produto pelo nome depois do F5 — e continuou vermelho. Com o banco
limpo, passava. Com dois produtos, **o próprio salvamento gravava vazio**, com
`200` no PUT e "salvo" na tela.

O motivo estava numa linha que parecia inofensiva:

```ts
await page.getByTestId("criar-produto").click();
await expect(page.getByTestId("editor-do-produto")).toBeVisible();
```

Com outro produto no banco, o editor **já estava aberto** — no primeiro da
lista — antes do clique. A espera passava instantaneamente, no editor errado. O
texto era digitado ali, o `recarregar` do criar chegava depois e substituía o
rascunho, e o que subia era vazio.

> Afirmar sobre um estado que já era verdadeiro antes da ação não espera por
> nada. Mesma classe do §250 (`toHaveValue` num componente controlado), outra
> fachada: lá o DOM guardava o que o teste tinha escrito, aqui a tela já estava
> visível por outro motivo.

A espera agora é por **identidade**: `Nome do produto` com o valor do produto
criado. Com `exact`, porque "Nome do produto" também casava com "Nome do
produto novo" — o campo de criar, que o criar acabou de limpar.

### O concorrente ficou

Ele não é andaime de diagnóstico: virou parte do teste. Organização real tem
vários produtos, e este teste vinha provando tudo num banco de um produto só —
premissa que ele nunca declarou e que qualquer resíduo quebrava. Trazer a
situação real para dentro do teste é melhor do que torcer para ela não
acontecer.

Tirando o concorrente, tudo passa: é a medida exata do que ele sustenta.

### O que fica anotado e NÃO foi mexido

`recarregar()` substitui o rascunho depois de toda gravação. Quem digitar entre
o clique em Salvar e a resposta perde o que digitou, sem aviso. O guarda óbvio
— não substituir o rascunho quando o id é o mesmo — **quebra o glossário**, que
depende justamente dessa releitura para aparecer. Tem conserto, tem tamanho, e
não é conserto de dívida de teste: fica registrado aqui em vez de entrar de
carona.

**Mordidas:** tirar a espera por identidade → vermelho; tirar a abertura pelo
nome após o F5 → vermelho; tirar o concorrente → verde, que é a prova de que
ele é quem carrega o caso.

324 engine · 610 web · 72 aplicação · 222 server · 77/77 E2E · banco de e2e
zerado ao fim da suíte.

## §263 — a quarta batida do laço (SPEC-60 fatia A)

*"implemente tudo o que acabou de apontar, as 3 sugestões"*. Escrevi a
**SPEC-60** antes de mexer em código, porque as três melhorias que sobraram são
o mesmo defeito em três lugares: o produto mede, mostra o número, e para ali.

Esta é a primeira: **remedir**.

### O buraco

O §6 da SPEC-57 desenha *medir → conversar → decidir → remedir*, e a quarta
batida existia num lugar só — o `delta-da-proposta` das necessidades. Aceitar
uma decisão do agente e confirmar um caminho não diziam nada.

O caso do caminho é o que dói: confirmar um percurso é o que faz a régua passar
a valer sobre ele, e régua valendo **gera item** (§249). Isso acontecia depois
do clique, sem aviso.

### A régua: a moeda em que a consequência aparece

Decisão se mede no placar de decisões. Caminho se mede no **backlog**. Usar o
mesmo número nos dois seria simetria bonita e informação inútil — que é o
defeito que a SPEC-60 combate. `deltaDePercurso` roda a **derivação inteira**
duas vezes em vez de recalcular a conta: reimplementar aqui o que a derivação
já faz é a receita de os dois números divergirem no dia em que ela mudar.

### Três coisas que eu quebrei e o teste pegou

**O botão de aceitar sumiu.** `Delta` não desenha caixa vazia — de propósito,
uma caixa dizendo "se aceitar" e nada dentro sugere que a medição rodou e não
achou nada. Só que eu pus o botão **dentro** dele, e onde não havia diagrama
para medir o aceite desapareceu junto. Feature nova apagando feature antiga, e
parecendo configuração. A garantia virou explícita: `AceiteComDelta` devolve o
botão puro quando não há o que medir, e um teste guarda isso.

**O tour não mostrava.** A decisão do tour é de demonstração, e o §253 tirou o
aceite dela (gravaria numa quebra que não é a sua). Como o delta morava junto
do botão, ele sumiu também — e capacidade que o tour não mostra não existe
(§244). Separei: a demonstração **mede e mostra**, e não oferece o aceite. Os
números são reais, medindo as decisões da demonstração contra o desenho da
demonstração.

**O alerta que evita o zero enganoso.** Confirmar um caminho a que falta campo
mostra "itens no backlog 4 → 4" — e isso lê como "não custa nada", quando o que
acontece é que a medição não acontece. O alerta diz `falta timeoutMs em 1
componente(s)`.

### A caixa virou uma só

As necessidades passaram a usar o `Delta` compartilhado. Não é arrumação: três
caixas parecidas divergem na terceira mudança, e divergência aqui é pior que
feiúra — o delta é lido no meio de uma decisão, e um formato diferente por tela
obriga a reaprender no pior momento.

**Mordidas:** sumir com o alerta de "não dá para medir" → engine vermelho;
desenhar a caixa vazia → unidade vermelha. E a melhor delas foi acidental: o
E2E do tour ficou vermelho por causa do delta escondido na demonstração, antes
de eu perceber o problema.

333 engine · 620 web · 72 aplicação · 222 server · 77/77 E2E · build limpo.

## §264 — o aviso que agora diz o quê (SPEC-60 fatia C)

`documentoDesatualizado` era `especificacao !== markdownDoDocumento`: um
booleano. A tela dizia *"o desenho mudou depois da aprovação"* e parava ali.

O problema não é a frase estar errada — é ela ser **verdadeira e inútil**. Quem
lê tem que reler o documento inteiro para descobrir se mudou uma vírgula do
preâmbulo ou a lista de itens, e o custo disso não é neutro: um aviso que não
diz o que mudou **treina a reaprovar sem olhar**, que é exatamente o carimbo
que o §233 quis evitar.

### Por seção, não por linha

"Mudou a seção Itens" leva a uma ação. "A linha 340 mudou" não leva — ninguém
tem o documento aprovado aberto noutra janela com os números de linha à mão. A
seção é a unidade em que o documento foi escrito **e** em que ele é revisado.

Três decisões pequenas que o teste guardou:

- **espaço em branco não é mudança.** O booleano acusa qualquer byte; se a
  comparação repetisse isso, a tela diria "mudou" e listaria nada — pior que o
  aviso de antes. Quando isso acontece ela diz *"só espaço em branco"*, porque
  um amarelo sem explicação é a mesma armadilha noutra roupa;
- **entrou e saiu são coisas diferentes de mudou.** Seção nova pede leitura;
  seção que sumiu pede pergunta;
- **a abertura tem nome.** O que vem antes do primeiro `##` é título e
  preâmbulo do template, e "mudou o começo do documento" é informação distinta
  de "mudou uma seção".

### Nenhuma linha nova no banco

Não é versionamento, e continua não sendo — a SPEC-58 adiou histórico com
razão. Isto compara **duas** coisas que já estavam na mão: a foto da aprovação
(`quebra.especificacao`) e o texto de agora.

### O tour narra, e não mostra — de propósito

Para **mostrar**, o tour teria que aprovar o documento, voltar, mudar um campo
e voltar de novo: três passos numa demonstração de dezenove, e o selo
"aprovado" contradiria o resto da narrativa (o documento nasce rascunho). O
passo do documento passou a nomear o comportamento, e quem prova de ponta a
ponta é o E2E, que aprova de verdade, renomeia o serviço de verdade e cobra a
palavra **Itens** no aviso.

É exceção consciente ao §244, não esquecimento — e está escrita aqui para que
a próxima vez que alguém encontre uma capacidade fora do tour saiba se foi
decisão ou descuido.

**Mordidas:** tratar seção nova como "mudou" → dois testes vermelhos; tirar o
`trim` → o teste de espaço em branco vermelho.

340 engine · 623 web · 72 aplicação · 222 server · 77/77 E2E · build limpo.

## §265 — a esteira deixa rastro (SPEC-60 fatia B)

O comentário que eu tinha escrito no `mapaDoSistema` dizia em voz alta o que
faltava:

> *"falhou na última execução" está na SPEC-59 §4 e **não** entra aqui, porque
> o produto não guarda o resultado das execuções da esteira. Inventar o estado
> a partir de nada seria pior que não tê-lo.*

Esta fatia é o que torna aquele comentário obsoleto: agora o estado vem de uma
linha gravada, não de um palpite.

### Um lugar só para registrar

`executarPedido` é o funil por onde passa **toda** chamada ao modelo, e já
recebia um `rotulo` (`ia/pipeline/refinador`, `ia/sugerir`). O registro entrou
ali. Registrar em cada rota seria garantir que a próxima rota esqueça — e um
rastro com buraco é pior que rastro nenhum, porque o buraco se lê como "não
rodou".

Três decisões de borda que os testes fixaram:

- **"sem credencial" não é execução.** Já é um estado que o mapa mostra, e
  anotá-lo como falha faria o avatar acusar o papel por uma configuração que
  não é dele;
- **falha com o cabeçalho já enviado continua sendo falha.** O `anotar` ficou
  ANTES do `if`, senão o avatar ficaria verde justamente no caso em que a
  pessoa viu o texto cortado na tela;
- **o rastro casa pelo ID do papel**, não pelo nome. Casar por nome quebraria
  no dia em que alguém renomeasse o papel: o rastro ficaria órfão e o avatar
  voltaria a verde sem nada ter melhorado.

### O que a tabela NÃO guarda

Sem prompt, sem resposta, sem token, sem custo. Prompt e resposta carregam o
contexto do produto e da demanda, e acender um avatar não justifica criar um
problema de privacidade. Um teste ancora a lista de colunas exatamente para que
alguém que queira acrescentar "só o prompt, pra depurar" tropece nela primeiro.

E o histórico é podado em 200 linhas, junto do insert. Parece caro e não é: a
tabela nunca passa disso, então a varredura é sobre duzentas linhas — a
alternativa era criar uma peça de infraestrutura nova para o que cabe numa
cláusula.

### O avatar

Vermelho, e é o único vermelho do mapa: aqui alguma coisa realmente deu errado
contra um gateway de verdade. Embaixo do nome, `última execução: há 3 min ·
1,2 s`, e o erro **que o gateway disse** — quem abre o mapa por causa de uma
falha precisa da frase que resolve, não de um código nosso. O aviso do mapa
ganhou a consequência: *"o item sai sem a parte que eles escrevem"*.

### O E2E não podia quebrar a credencial

Para provar isso ponta a ponta é preciso uma falha de verdade. A saída óbvia —
gravar uma credencial quebrada — mexe num estado da **organização inteira**, e
com specs rodando em paralelo seria um teste derrubando os vizinhos. Então a
falha passou a viajar no **pedido**: o gateway falso responde 500 quando vê
`FALHAR_DE_PROPOSITO`. Só quem pede para falhar falha.

O teste ainda prova o outro lado: a execução seguinte, boa, **apaga** o
vermelho. Estado que só acende é alarme que se aprende a ignorar.

### Dois tropeços meus, do mesmo tipo

**`git checkout` num arquivo com trabalho não commitado.** Usei-o para desfazer
uma mordida e ele reverteu o arquivo inteiro, levando a fatia junto. Terceira
vez nesta sessão. A regra que passa a valer: mordida se desfaz aplicando o
patch inverso, nunca com checkout — ou se commita antes.

**`DATABASE_URL` do e2e num `npm test`.** Rodei a suíte de unidade apontando
para o banco de **e2e**, e os testes do servidor comeram o seed dele: seis
specs quebraram por "6 do time" ter virado outro número. Meia hora perseguindo
um defeito que eu mesmo tinha plantado dois comandos antes. O banco de e2e se
recria com `e2e:down && e2e:up`, e a variável só pertence ao `test:e2e`.

340 engine · 626 web · 78 aplicação · 229 server · 78/78 E2E · build limpo.

## §266 — o rascunho é de quem digita

O §262 achou isto perseguindo outra coisa e **anotou em vez de consertar de
carona**: `recarregar()` roda depois de toda gravação e trocava o rascunho pelo
que voltava do servidor. Quem digitasse entre o clique em Salvar e a resposta
perdia o texto — sem erro, sem aviso, e com "salvo" na tela.

### Por que não foi consertado na hora

O guarda óbvio — *não substituir o rascunho quando o id é o mesmo* — **quebra o
glossário**: o termo novo aparece justamente porque a releitura traz a lista do
servidor. Guardar o rascunho inteiro salvaria o texto e congelaria a lista, e
trocar um defeito por outro num PR de dívida de teste teria sido pior do que
deixar escrito.

### A régua

> O que a **pessoa** digita é dela; o que só o **servidor** sabe é dele.

Texto (nome e as cinco seções) vem do rascunho; coleções (glossário, times) vêm
da resposta. Trocar de produto continua substituindo tudo — aí a pessoa pediu
por isso, e manter o texto do anterior seria pior que o defeito original.

### Os dois testes têm que existir juntos

Cada um sozinho autoriza o conserto errado:

- só o do texto → passa guardando o rascunho inteiro, e o glossário congela;
- só o do glossário → passa substituindo tudo, e o texto se perde.

As mordidas provam exatamente isso: voltar a substituir derruba o primeiro,
guardar tudo derruba o segundo. Um par de testes em que cada um sozinho aceita
uma solução errada é o formato certo para uma regra que tem dois lados.

### E a mesma régua na tela vizinha

O `PdcaTab` tinha o defeito de novo: `recarregar()` roda depois de **toda** ação
daquela tela (tratar feedback, aplicar ajuste), e sobrescrevia a cadência que a
pessoa acabou de mudar. Quem trocasse 5 por 9 e salvasse via o 5 voltar — e
concluía que o botão não funciona. Carrega uma vez; depois disso quem manda é o
formulário.

340 engine · 630 web · 78 aplicação · 229 server · 78/78 E2E · build limpo.

## §267 — a sessão morre e o app finge que não

*"entrar em contexto do produto apareceu que falta sessão"* — com print: a tela
vazia, um `sessão inválida ou ausente` vermelho no canto, e o cabeçalho ainda
mostrando o time ativo, como se estivesse tudo bem.

### O que estava acontecendo

A sessão era conferida **uma vez**, no boot (`GET /auth/me`). O cookie dura 12h.
Passado o prazo com a aba aberta, o app continuava se achando logado — menu
funcionando, time no cabeçalho — e cada chamada virava uma linha vermelha na
tela onde calhasse de ser mostrada.

> Um problema do **app inteiro** dito uma vez por tela, e em nenhuma delas onde
> se resolve. Cinco telas, cinco avisos, zero caminhos de volta.

### Um ouvinte, e não um erro novo

`requisitar` avisa quem estiver ouvindo quando o servidor responde 401. A opção
óbvia — um tipo de erro especial — dependeria de **todos** os chamadores
cooperarem, e engolir erro com catch vazio aparece bastante no código: o ouvinte
funciona até onde o erro é engolido, que é justamente onde a sessão morta
ficaria invisível por mais tempo.

**A régua: 401 só é "expirou" se HAVIA sessão.** Uma chamada atrasada
respondendo 401 para quem nunca entrou arrancaria o visitante da landing com
"sua sessão expirou" — mentira, e das que fazem achar que o app está quebrado.

E quem expirou **não volta para a landing**: ela é para quem está chegando.
Mandar alguém que estava trabalhando reler a página de apresentação esconde a
única informação que importa ali (que é só entrar de novo).

### O teste que eu escrevi errado primeiro

O caso "401 de quem nunca entrou" passava **sem o guarda** — porque
`apiAuth.me()` não passa pelo `requisitar` (devolve `null` no 401, por
desenho). O teste tinha o nome certo e não guardava nada. Reescrito para o
cenário real (401 sem sessão, depois de sair), a mordida ficou vermelha.

### E o E2E que virou flake na hora

Limpar o cookie e clicar no menu passou isolado e falhou na suíte cheia: sob
carga, **uma chamada de fundo** dispara o 401 antes do clique — que é o
comportamento certo, derrubando um teste que insistia em ser ele o gatilho.
Qualquer chamada serve; o teste passou a afirmar o **destino**, não o caminho.

## §268 — "medido pelo motor", agora mostrado

*"fala em 'medido pelo motor', sem explicar como isso ocorre ou demonstrar algo
de forma animada"* e *"na demo não integra com o botão que aparece em tela
sobre o desenho"*.

### A frase mais repetida e a menos demonstrada

O produto diz "o motor mede" em quase toda tela. Quem lê ou acredita ou não — e
um número cuja origem não se conhece vale o mesmo que número nenhum. Pior:
"motor" **soa a IA**, que é exatamente a leitura que este produto passa o tempo
inteiro desfazendo.

`MotorPassoAPasso` mostra a cadeia com o foco andando de elo em elo: o campo que
você preencheu → a régua que alguém do time escreveu → a comparação → o item que
sai. Quatro elos, e a pergunta "onde entra a IA?" fica respondida sem ninguém
escrever a resposta: em lugar nenhum.

**Animado e não parágrafo**, porque a ordem entre os elos é a explicação
inteira. Empilhados num texto viram lista de conceitos; ver o foco andar é ver
um mecanismo.

### O exemplo é do time, e quando não é, ele diz

`exemploDeMedicao` pega o primeiro requisito **conferível** da configuração —
sem nenhum, a caixa diz isso e não desenha conta, porque explicar a régua de um
time que não a tem ensina algo falso sobre o próprio ambiente de quem olha.

No tour isso apareceu na cara: o time do E2E não tem régua conferível, e o passo
mostrou o estado vazio. A saída não foi fingir — foi usar a régua **da
demonstração** com a marca do §235 na caixa. Os números do mapa continuam vindo
da config real (§259); só o exemplo é de demonstração, e ele diz que é.

### Duas correções de rota minhas

**`preenchido` ficou de fora da primeira versão.** Eu exigi um literal, e com
isso a régua mais simples de todas — "este campo tem que estar preenchido" —
não podia ser o exemplo. É justamente a que se entende primeiro. Sem o
tratamento próprio ela sairia como "≥ undefined" no meio da explicação de como
as contas fecham.

**O passo do motor virou o primeiro a mostrar demonstração**, então é ele quem
liga a marca agora — antes quem ligava era a conversa, que passou a vir depois.

### O botão que estava lá o tempo todo

O tour abria e fechava a janela do assistente **por dentro** e nunca apontou o
✦ que fica por cima do desenho. Quem termina a demonstração precisa saber como
chamar o agente de novo — e o botão é a resposta. Ganhou passo próprio.

346 engine · 643 web · 78 aplicação · 229 server · 79/79 E2E · build limpo.

## §269 — o documento fora do fluxo, e um HTML que era a própria tela

*"seguindo o fluxo de preenchimento não consigo chegar nesse passo, também não
vejo necessidade do html já que temos tudo aqui, avalie a coesão"*.

### Uma tela que só o menu alcançava

O fluxo é desenhar → derivar → **revisar** → confirmar → **itens escritos**. O
documento não estava em lugar nenhum dele: só no ☰ Menu. E tela que só o menu
alcança é tela que a maioria nunca abre — o tour a mostrava no passo 19, o que
tornava a lacuna invisível para mim e óbvia para quem usa.

Agora as duas telas que TERMINAM o fluxo levam a ele. Na revisão porque é onde a
pergunta "e o porquê disso tudo?" aparece; nos itens porque são as duas saídas
da mesma demanda — o que fazer e por quê — e estavam separadas por um menu.

### O HTML era uma segunda renderização do mesmo documento

Ele nasceu antes da tela existir (SPEC-58 fatia 5), quando "o documento" era um
arquivo. Com a tela de pé virou o que o usuário nomeou: a mesma coisa, de novo,
mantida à parte e livre para divergir. **282 linhas de gerador e 115 de teste
foram embora.**

O markdown fica, e a diferença é de destino, não de formato: ele vai para
Confluence, Jira, repositório — lugares que a tela não alcança. O HTML ia para
"abrir no navegador", que é exatamente o que a tela é.

E há um ganho de coesão junto: o bloco do desenho tem clique em nó e
"reproduzir em sequência". Isso nunca funcionou de verdade num arquivo baixado.
Com uma saída só, o que a tela oferece de melhor deixa de competir com uma
cópia pior de si mesma.

### A coesão, avaliada

O que ficou **certo** e não vou mexer: a ordem das seções conta uma história
(contexto → o que precisa ser verdade → o desenho → decisões → o que foi
conferido → trade-offs → riscos → os itens). Ela vai do porquê ao que fazer, e
termina no trabalho — que é a conclusão, não o assunto.

O que ficou **anotado**, e não entrou porque é decisão de produto e não
conserto:

- **a faixa de saúde mistura problema e inventário.** "1 necessidade sem
  componente" e "1 fora do padrão" cobram ação; "1 decisão(ões)" é contagem. Os
  três chips têm o mesmo peso visual e só a cor os separa;
- **o bloco do desenho é interativo dentro de um documento.** É a melhor parte
  da tela e é também a única que não sobrevive a um print ou a um copiar-colar.
  Hoje isso é aceitável porque a tela é o veículo; se um dia o documento
  precisar circular fora dela, essa é a costura que vai doer.

335 engine · 645 web · 78 aplicação · 229 server · 79/79 E2E · build limpo.

## §270 — duas portas para o mesmo markdown, e a de trás escrevia na foto

*"no fluxo de gerar itens de trabalho já temos um markdown que deve ter tudo,
não vejo mais necessidade dessa opção de gerar especificação da solução"*.

### Eram a mesma coisa, literalmente

`baixarEspecificacao` chamava `gerarEspecificacaoEntrega` com o mesmo conjunto
de opções que o documento de desenho usa para montar o `⬇ Markdown`. Mesma
função, mesmas opções, mesmo texto — e dois nomes de arquivo diferentes
(`especificacao-de-solucao.md` × `documento-de-desenho.md`), que é a única
coisa que fazia parecerem artefatos distintos.

### O defeito que só apareceu ao remover

Gerar a especificação também gravava em `quebra.especificacao`. Desde o §264
esse campo é a **foto da aprovação** — a referência contra a qual o documento
diz "mudou a seção Itens". Ou seja: **um botão de gerar reescrevia a foto de
uma aprovação que ninguém tinha revisto**, zerando em silêncio o aviso do §264.

Dois escritores para um campo com dois significados. Agora tem um só, e o
significado é o que o nome do §264 promete.

### O que mudou de nome, e por quê

`temEspecificacaoSalva` e `especificacaoJaGerada` passaram a
`temDocumentoAprovado` e `documentoJaAprovado`. Não é cosmético: com a geração
fora, o campo só é escrito por aprovar, e um nome que descrevia o escritor
antigo mandaria a próxima pessoa procurar um botão que não existe.

As falas seguiram: o balão do canvas (M14) e a condução da revisão diziam *"já
tem a especificação de solução completa"*. Agora dizem que o **documento foi
aprovado**, e que ele mesmo acusa o que ficou diferente.

E a varredura pegou quatro textos que prometiam o artefato removido — a aba do
template, o modal da jornada, a landing e o aviso de "os agentes não rodam
neste modo". Todos falavam de uma saída que deixou de existir.

### Um efeito de fluxo que o E2E revelou

Gerar itens **abre a tela dos itens**; a especificação só baixava e deixava a
pessoa na revisão. O balão de feedback do PDCA mora na revisão, então ele passou
a esperar a volta — o que é o comportamento certo: pedir opinião por cima do
resultado que a pessoa acabou de abrir interromperia a leitura.

**Mordida:** devolver o botão ao balão → dois testes vermelhos.

335 engine · 645 web · 78 aplicação · 229 server · 79/79 E2E · build limpo.

## §271 — a tela contava a história do produto, e não o que ela faz

*"aqui faz referência a versões antigas do sistema, não faz sentido, estou
testando ele ainda, também sinto falta de poder usar o assistente para
preencher os campos"*.

### O texto que falava de um produto que ninguém usou

> *"O que a ferramenta **sabia** era tecnologia, processo e forma dos itens —
> nunca de que produto a demanda falava."*

Está no passado, e o passado é o **meu**: descreve uma versão anterior desta
ferramenta para alguém que a está abrindo pela primeira vez. Quem lê não tem
como saber o que ela sabia antes, e a frase gasta a atenção da abertura
explicando uma ausência que já não existe.

O JOURNEY é onde a história do produto mora. A tela diz o que a coisa **é**.

Varri as outras abas de configuração e as telas principais atrás do mesmo
padrão: só o passo do tour sobre produto repetia a mesma frase (era a mesma
origem). Os "antes" que sobraram são do usuário — *"nada é medido antes de você
confirmar"* —, e esses continuam certos.

### O assistente escreve o contexto do produto

O mecanismo já existia (`SugerirComIa`, SPEC-23 Fluxo 2) e a aba de produto era
a única superfície de configuração sem ele. Faltava um alvo.

**As cinco seções de uma vez, e não uma por vez.** Elas são um texto só partido
em pedaços — quem descreve um produto descreve as cinco juntas, e cinco pedidos
seguidos dariam cinco respostas que não se conhecem.

Duas réguas no prompt, cada uma contra um jeito específico de estragar o campo:

- **"regras que valem SEMPRE, não as desta entrega"** — regra de uma demanda
  escrita como se valesse para o produto contamina todas as demandas seguintes;
- **campo sem informação volta VAZIO** — contexto de negócio inventado vira
  item errado com cara de item certo.

E a fronteira de sempre: a IA preenche o **rascunho**, quem grava é o Salvar.
Com um detalhe que virou teste: campo vazio na resposta **não apaga** o que já
estava escrito. A sugestão acrescenta; subtrair seria a pessoa perder texto por
ter pedido ajuda — o oposto de ajudar.

**Mordidas:** deixar a sugestão sobrescrever com vazio → vermelho; tirar do
prompt a separação entre regra do produto e regra da entrega → vermelho.

335 engine · 647 web · 80 aplicação · 229 server · 79/79 E2E · build limpo.

## §272 — a seção que o documento nem tinha nasce preenchida

*"apareceu esse aviso, preciso que vc ajuste a massa"* — o aviso do §108,
dizendo que a configuração de regras não tem **nenhuma** régua de percurso, com
duas no padrão desta versão.

### O aviso estava certo, e era o fim da linha

O documento foi gravado antes de a seção existir. E a própria frase do
diagnóstico descrevia o beco: *"a ferramenta nunca sobrescreve o que você
editou, então uma seção criada depois do seu arquivo fica vazia **para
sempre**"*. A única saída era digitar à mão o que o padrão já traz.

### A régua: AUSENTE não é VAZIO

`undefined` é uma seção que **não existia** quando aquele documento foi criado
— não há edição a preservar, e completar com o padrão é exatamente o que a
pessoa faria à mão. `[]` é alguém que esvaziou de propósito: continua vazio, e
o diagnóstico continua avisando.

A promessa de nunca sobrescrever fica intacta, porque nada aqui toca em chave
que exista. E é **só o primeiro nível**: mesclar `porTech` tech a tech
devolveria a regra que alguém apagou.

### Por que não foi migração SQL

O usuário autorizou apagar e recriar ("não temos nada em produção"). Não
precisou: uma migração conserta **um** banco e duplica o padrão dentro de um
arquivo `.sql` que vai envelhecer sozinho. Completar na leitura conserta toda
instalação, inclusive as que ninguém abriu ainda — e sem gravar no meio de um
GET, que é o tipo de efeito colateral que ninguém procura depois. O próximo
Salvar persiste.

### O teste que passava por sorte

O `beforeEach` do servidor truncava dez tabelas e **não** `config_documentos`.
Config gravada por um teste sobrevivia à execução inteira e à seguinte: o
"nunca editada devolve o template" passava contra banco novo e falhava na
segunda rodada, sem nada ter mudado no produto. Foi o que me confundiu no §265,
quando culpei a chamada de pipeline.

Mesma classe do resíduo do §262, e o mesmo estrago: um vermelho que depende de
quantas vezes a suíte já rodou ensina a reexecutar em vez de ler.

### Uma suspeita registrada, e não resolvida

Numa das rodadas completas, `abas-de-configuracao` falhou sozinha e não
reproduziu em duas rodadas seguintes — e eu não capturei o erro. O suspeito é
uma corrida que já existia: quatro specs escrevem o **mesmo** documento de
regras da organização em paralelo, e esse spec faz setup/restore próprio
justamente por isso. Não é dívida nova, mas passa a estar escrita.

**Mordidas:** completar sobrescrevendo o que existe → dois vermelhos; tirar a
completude da leitura → vermelho.

335 engine · 647 web · 84 aplicação · 230 server · 79/79 E2E · build limpo.

## §273 — sessenta times num dropdown, e a lista que mostrava o que não é seu

*"essa parte do menu precisa ser revista, no meu contexto existem mais de 60
times"* e *"apareceu esse warning, mas parece não fazer sentido, pois não estou
querendo editar nada relacionado ao time de pagamentos"*.

### O warning fazia sentido — a lista é que não

O 403 dizia a verdade: aquela solicitação de ajuste é do `time-pagamentos`, e
quem está em `time-silvio` não tem nível para editar as regras de lá. O defeito
estava um passo antes: **`GET /ajustes` devolvia as solicitações da instalação
inteira**, sem filtro nenhum. A tela colocava na frente da pessoa um pedido que
não era dela, e o erro só aparecia depois do clique.

Dois filtros, e os dois importam:

- **`?timeId=`** é a tela dizendo em que time se está;
- **a interseção com os times da SESSÃO** é a garantia que não depende de a
  tela mandar o parâmetro certo. Pedido de time alheio não volta nem com
  `?timeId=` forjado — e é isso que a mordida do "confia só no parâmetro"
  prova.

Solicitação sem time é da organização e continua aparecendo para todo mundo:
`null` ali significa "de todos", não "de ninguém".

### O `<select>` que nascia legível e virava paredão

Um `<option>` por time no menu, um `<button>` por time na tela de escolha do
login. Com dois ou três, ótimo; com sessenta, os dois quebram — e o segundo é
pior, porque é a primeira coisa que alguém vê ao entrar.

**Um componente para os dois lugares.** São a mesma pergunta ("qual time?")
feita em momentos diferentes; duas implementações divergiriam na terceira
mudança, e a que ficaria para trás seria justamente a do login.

**A busca aparece quando vale a pena.** Com poucos times, um campo de filtro é
fricção pura — a pessoa vê a lista e clica. Acima de oito, rolar custa mais que
digitar, e o componente decide sozinho: quem o usa não configura nada.

E no menu a lista **não fica aberta**. Trocar de time é raro; o rodapé mostra o
ativo, e a lista vem a pedido. Deixá-la aberta seria o paredão de volta com
outra roupa.

**Mordidas:** a lista de ajustes ignorando o time → dois vermelhos; confiar só
no parâmetro da tela → vermelho.

335 engine · 650 web · 84 aplicação · 233 server · 79/79 E2E · build limpo.

## §274 — pedir ao assistente, e não a uma caixinha

*"ao invés de sugerir minha expectativa é que houvesse um botão semelhante que
levasse ao assistente, e fosse possível interagir com ele para gerar o conteúdo
dos campos"* — e, na sequência: *"assistente do FAB"*.

### O que o §271 acertou pela metade

Ele pôs um campo de instrução única dentro da aba: *"descreva e eu preencho"*.
Isso serve a quem já sabe dizer o produto inteiro numa frase — e esse é o caso
**raro**. Escrever o que um produto É se faz por partes: perguntando,
corrigindo, completando. Isso é conversa, e a conversa já existe no assistente
do FAB.

Manter a caixinha ali seria ensinar **dois jeitos** de pedir a mesma coisa, com
o pior deles mais à mão.

### O alvo entrou na conversa, não uma conversa nova

`contexto-do-produto` já era alvo do passo 2 desde o §271; faltava estar no
passo 1, o que decide sobre o que a conversa pode propor. Com ele lá, o cartão
de proposta aparece como os outros — com destino (qual produto) e um "Aplicar"
que é clique da pessoa.

O cartão mostra **só as seções preenchidas**: o modelo devolve string vazia no
que não sabe (§271), e listar rótulo sem conteúdo faria a proposta parecer
maior do que é.

### Um botão morto que não dizia por quê

Sem produto cadastrado, o "Aplicar" já vinha desabilitado — e calado. Este
arquivo tem a régua escrita para o outro caso (*"dizer o motivo, não esconder:
quem não tem a permissão precisa saber que a feature existe e a quem pedir"*,
§144) e não a aplicava aqui. Botão apagado sem explicação lê como app quebrado.

Achei isso escrevendo um teste que **afirmava a coisa errada** — eu tinha posto
um guarda dentro do `aplicar` que nunca rodava, porque o clique não chegava
nele. O teste que não passava estava certo sobre o sintoma e errado sobre a
causa.

335 engine · 652 web · 84 aplicação · 233 server · 79/79 E2E · build limpo.

## §275 — a palavra que ninguém definiu, e a CI que eu vinha contornando

*"aqui acho a informação pouco clara, que motor? e o que significa caminho?
fluxo informacional? ciclomático? precisamos melhorar as explicações para
reduzir a fricção cognitiva"*.

### O texto usava um vocabulário que a tela nunca deu

> *"O motor leu estes caminhos no desenho."*

Duas palavras carregadas numa frase de dez. **Motor** está explicado — na
jornada ("Como funciona"), que a pessoa pode não ter aberto. **Caminho** não
estava explicado em lugar nenhum da interface, e a leitura errada é fácil:
ciclomático? fluxo de informação? diagrama de sequência?

Agora o painel **define antes de usar**: *"Caminho = a sequência de componentes
por onde uma requisição passa, de ponta a ponta (aqui: srv-catalogo →
produtos)"* — com o exemplo do próprio desenho, que é o que dispensa a
abstração. E troquei "o motor leu" por **"lidos do seu desenho seguindo as
setas — cálculo, sem IA"**: diz a mesma coisa sem exigir que a palavra "motor"
tenha sido apresentada, e responde de passagem a pergunta que sempre vem depois.

O tooltip do chip seguiu a mesma régua.

### A régua que fica

> Termo do produto se define **onde ele aparece**, não num glossário. Quem lê
> no meio do trabalho não vai atrás da definição — ou entende ali, ou desiste
> e clica no que parece seguro.

### E a CI que eu vinha contornando em vez de consertar

Duas vezes seguidas o merge dependeu de eu cancelar um run travado na mão. A
causa estava no gatilho: `on: push` sem filtro **mais** `on: pull_request` faz
todo push numa branch de PR disparar **dois runs idênticos** sobre o mesmo
commit, competindo pelo mesmo pool de runners. Um deles ficou pendurado 74
minutos sem sequer atualizar o status.

`push` passou a valer só na main (verificação pós-merge), `pull_request` cobre
as branches, e um `concurrency` com `cancel-in-progress` mata o run velho quando
chega commit novo.

**Não abri SPEC para isto**, e digo por quê: a régua de "mudança de CI/CD ganha
SPEC" existe para mudança estrutural, e o que houve aqui foi um gatilho errado
consertado em cinco linhas, com o raciocínio inteiro no comentário do próprio
arquivo. Se a próxima mexida na CI for de estrutura, ela ganha a SPEC.

335 engine · 653 web · 84 aplicação · 233 server · 79/79 E2E · build limpo.

## §276 — a caixa que não podia fazer nada, e o histórico que não vendia o ciclo

*"por qual motivo aparece nenhum em 'vale só nos contextos deste componente
(nenhum)'?"* e *"da forma que está como uma lista simples vai ficar ruim de ver
ao longo do tempo, e também não vende bem o valor disso"*.

### O "(nenhum)" é literal, e por isso mesmo era um defeito

A caixa lista os contextos do tipo de componente escolhido. "Serviço" é **o
único dos 16 tipos** que não declara contexto nenhum na configuração de
diagrama (`contextos: []`) — então a frase estava certa e a opção, não: marcar
a caixa restringiria o item a uma lista **vazia**, e lista vazia significa
"vale sempre" pela régua do motor. Uma caixa marcada, com aparência de decisão,
que não muda nada.

Agora ela só aparece quando há contexto para restringir. Sem contexto, o lugar
dela é ocupado por uma frase que diz o que vai acontecer (o item vale para toda
a tecnologia) e onde se declara contexto.

> Opção que não pode fazer nada não é opção: é ruído com cara de decisão.

### O histórico contava linhas, não resultado

*"O que disseram (0 sem tratar)"* seguido de cinco linhas iguais responde "o que
foi dito" e não responde **o que isso mudou** — que é o único motivo de guardar
o histórico de um ciclo de melhoria. E com cem linhas fica pior.

O que entra em cima agora é o placar: **"4 de 5 viraram mudança na
configuração"**, com o descarte dito como decisão (*"foram lidos e descartados —
decidir não mudar também é decisão"*) e não como perda. A lista continua
embaixo, recente primeiro, cortada em oito: o que aconteceu ontem explica o item
de hoje, o de seis meses atrás é arqueologia — e arqueologia se pede.

### O flake do `abas-de-configuracao` voltou, e agora tem endereço

O §272 registrou a primeira ocorrência sem capturar o erro. Na segunda eu
capturei: *"não achei `regras-grupo-Frontend`"*, com o snapshot mostrando o
**canvas** — ou seja, o clique aconteceu antes de a navegação terminar, e o
erro apontava para o grupo em vez de apontar para a navegação.

Pus a espera pela tela antes do clique. **A causa raiz continua aberta** (por
que a navegação demora só em suíte cheia?), e digo isso em vez de dar por
resolvido: o que mudou é que a próxima falha vai dizer a verdade.

335 engine · 655 web · 84 aplicação · 233 server · 79/79 E2E · build limpo.

## §277 — uma saída só: os itens eram uma seção do documento o tempo todo

*"não vejo vantagem de manter `#/itens` e `#/documento` como features e telas
separadas, faça uma revisão delas e unifique"* e *"esse trecho do print de o
desenho me incomoda bastante, a lista fica mudando de tamanho, seria melhor ter
o mesmo diagrama da tela anterior"*.

A SPEC-61 saiu em três fatias, e a ordem foi de propósito: as duas isoladas
primeiro, a que mexe em rota por último.

### O sintoma tinha aparecido antes, e eu tratei como navegação

No §269 eu precisei **criar links de uma tela para a outra** — "Ver o documento
→" nos itens, e o contrário. Quando duas telas precisam apontar uma para a
outra o tempo todo, a pergunta certa não é onde pôr o link.

As duas nascem da mesma derivação, sobre a mesma demanda, no mesmo instante. O
documento **já tinha** uma seção "Os itens". O custo não era só de navegação:
dois caminhos para o mesmo texto (`itensGerados` × `documento.itens`), duas
respostas para "cadê o que eu gerei?", e o menu carregando as duas — o que faz
o menu parecer maior do que o produto.

> **O documento é a tela. Os itens são uma seção dele.**

Não o contrário: a folha é o que circula, o que se aprova, o que tem status.

**A tela de REVISÃO não morreu.** Lá se *trabalha* o item; no documento se *lê*
o resultado. Essa distinção se sustenta; a de "itens" × "documento" não se
sustentava.

### São duas listas, e sem dizer qual manda a seção mentiria

A lacuna que só apareceu quando fui implementar: `documento.itens` vem de
`estruturarDocumento` (a **derivação**, que existe sempre) e os cards vêm de
`gerarItensDeTrabalho` (a **escrita**, que só existe depois que alguém pediu).
Juntar as duas sem hierarquia produziria uma seção que às vezes tem quatro itens
e às vezes sete, sem ninguém entender por quê.

> **A derivação manda; a escrita enfeita.** A seção lista sempre os derivados;
> onde há escrita para aquela `chave`, o card abre com o texto final; onde não
> há, ele diz *"ainda não escrito"*.

Item escrito cuja chave sumiu da derivação **aparece no fim, marcado como
órfão** — §57 de novo: sumir em silêncio esconde justamente o evento que
interessa.

E o documento **não ganhou botão de gerar**: gerar continua sendo ato da
revisão. Uma tela que gera e mostra a mesma coisa é a confusão que esta rodada
está desfazendo. Exportar veio junto, porque é outra coisa — é o que se faz com
o resultado pronto.

### O desenho virou figura, e a figura é o mesmo canvas

O incômodo era literal: o `iframe` do `gerarDiagramaHtml` trazia junto um painel
lateral que mudava de tamanho conforme a seleção. Dentro de um documento, um
corpo estranho que se mexe sozinho.

> **Figura não muda de tamanho, não pede clique e não tem painel lateral.**

O que entra é o mesmo React Flow da mesa, em leitura. E não bastou passar um
`aplicar` vazio ao `useDiagrama` — isso impede a escrita, mas a interface
continuaria **convidando** a arrastar, conectar e apertar Delete. Convite que
não acontece é pior do que convite nenhum: entrou um `somenteLeitura` explícito
no `Canvas`, que também tira controles, minimapa e o zoom por roda (um quadro
que engole a roda trava a folha que rola atrás dele).

Duas coisas só o navegador me contou, e as duas foram print:

- as **alças de conexão** continuam sendo desenhadas mesmo com
  `nodesConnectable={false}` — bolinhas de "puxe daqui" num quadro que não
  aceita conexão;
- e escondê-las com `display: none` **apagou a aresta junto**, porque ela ancora
  na posição da alça. Virou `opacity: 0`.

O `gerarDiagramaHtml` não morreu: continua sendo o *"Baixar diagrama (.html)"*
da revisão, o artefato para quem não tem acesso à ferramenta.

### A faixa separa problema de inventário

Ficou anotado no §269: `🎯 1 necessidade sem componente`, `⚖ 1 fora do padrão` e
`🧭 1 decisão(ões)` tinham o mesmo peso visual, e só a cor os separava. Os dois
primeiros **cobram ação**; o terceiro é **contagem**.

Agora são duas partes com título — *o que ainda pede atenção* e *o que este
desenho já tem*. Nada de cor nova: **lugar comunica antes de cor**. E com um
lado dedicado ao que cobra, duas coisas que a cascata escondia passaram a
aparecer: *"N caminho(s) a confirmar"* (§261 — trabalho de uma pessoa que
ninguém fez) e *"N proposta(s) esperando"*.

### A rota morta redireciona

`#/itens` **continua sendo entendida**, e resolve para `documento`. Rota que
some sem redirecionar dá tela branca para quem tinha o link salvo — e link salvo
é justamente o de quem mais usa. O passo "Itens escritos" do tour passou a
apontar para a seção; passo que aponta para tela que não existe quebra a
demonstração inteira no meio.

339 engine · 655 web · 84 aplicação · 233 server · 80/80 E2E · build limpo.

## §278 — o "não" do ciclo, e a entrada que pulava o Check

*"na parte de sugestões não sei se é a massa ou o que, ali no ciclo pdca, mas só
aparece direto para aprovar antes de conseguir ver o pdca (não gerei nenhuma
nova), e se rejeito simplesmente some para sempre"*.

**Reproduzi contra a stack antes de escrever uma linha de código**, e o primeiro
achado foi que a pergunta do usuário tinha resposta: **não é massa** — não
existe seed de solicitação neste produto. O que aparecia foi criado pelo próprio
caminho de entrada.

### O pedido nascia no fim do ciclo

O balão da entrevista, para quem não é owner, chamava `criarAjuste` direto com o
texto digitado — sem operação, sem `feedbackId`, e **sem gravar feedback
nenhum**. A tela então dizia, ao mesmo tempo:

```
O que disseram (0 sem tratar) — Ninguém deixou feedback ainda.
Solicitações de ajuste (1 aguardando decisão) — [Aprovar] [Recusar]
```

O ciclo tem quatro tempos e a entrada pulava dois. O que uma pessoa diz é
*Check*; virar mudança é *Plan*; decidir é *Act*. Escrever direto na fila de
decisão é entregar o *Act* sem que o *Check* tenha existido.

> **Tudo que uma pessoa diz entra pelo mesmo lugar.** Solicitação não se escreve
> à mão — ela nasce de um feedback, no estúdio, com prévia do efeito.

A promessa não encolheu: o texto continua chegando a quem configura. Mudou a
porta, não o destino. E o M15 (*"tem N feedbacks esperando"*), que existia desde
a SPEC-45 e **nunca acendia por este caminho**, passou a acender.

### Quem decide decidia no escuro

O card mostrava `descricao`, `solicitante · recurso · estado`. Não mostrava
**quando** (por isso o "não gerei nenhuma nova": um pedido de três semanas atrás
era visualmente idêntico a um de hoje), não mostrava **de que feedback nasceu**
— com o dado ali, ligado no banco desde a SPEC-45 —, e não mostrava **o efeito**,
que o estúdio calcula para quem PROPÕE e sumia para quem DECIDE. Exatamente ao
contrário de quem precisa dele.

E pedido sem operação oferecia **"Aprovar"** enquanto `POST /aplicar` responde
*"este pedido é só texto — edite à mão"*. O botão prometia o *Act* e entregava
um bilhete.

### Os dois "não" eram becos

| O "não" | O que acontecia | O que mudou |
|---|---|---|
| **Recusar** um pedido | virava `rejeitada`, sem motivo, e o servidor devolvia `409` a qualquer nova decisão — nem pela API havia volta | grava o motivo e ganhou `reconsiderar`, que devolve a `pendente` **sem apagar o "não" anterior** |
| **Descartar** um feedback | sumia da tela (medido: `visível: false`) para dentro do histórico fechado, sem caminho de volta | ganhou `reabrir` |

O produto já sabia fazer isto direito em todo o resto — a decisão substituída da
SPEC-57 não se apaga, a exceção de padrão carrega motivo, a necessidade órfã
continua aparecendo (§57). O ciclo de melhoria era o único lugar onde o "não"
era mudo e definitivo.

> **Um "não" que não diz por quê e não pode ser revisto não é decisão: é
> descarte.** E descarte silencioso é o que ensina o time a parar de responder.

`invalida` reconsidera junto, e retomando a versão-alvo de agora — a própria
mensagem do 409 manda *"reavalie sobre o estado atual"*, e não havia como. Sem
retomar a versão, o pedido voltaria a pendente só para invalidar de novo.

### O placar mentia

Ele contava `virou-ajuste` como *"viraram mudança na configuração"* — e um
feedback cujo pedido foi **recusado** entrava na conta. O placar do §276 nasceu
para responder "o que isto mudou"; assim respondia o contrário. "Virou mudança"
passou a significar **solicitação aplicada**, e o resto aparece pelo que é.

### O teste que quebrou três vizinhos

Duas contaminações minhas, as duas encontradas rodando a suíte inteira e não o
spec isolado:

- o spec novo baixava a **cadência global** para 1 para provocar a entrevista, e
  três specs vizinhos passaram a receber o balão de feedback no meio do fluxo
  deles. O contador de usos é POR USUÁRIO — gastar quatro usos do membro
  recém-criado faz o quinto cair na cadência padrão, sem tocar em nada global;
- e ele **sobrescrevia o documento de regras** para ter o que comparar na
  prévia. Não precisava: a operação proposta aparece no diff mesmo sem régua
  prévia, e o que a sobrescrita fazia era apagar o que `exportacao` e
  `revisao-em-lote` esperavam encontrar.

Config global em suíte paralela é estado compartilhado. Restaurar no `finally`
não basta — a janela entre mexer e restaurar é o teste do vizinho.

339 engine · 665 web · 84 aplicação · 237 server · 83/83 E2E · build limpo.

## §279 — a base que toda spec assume como lida ainda dizia "ferramenta local"

*"precisamos atualizar esse documento de contexto e arquitetura"*.

O `CONTEXTO-E-ARQUITETURA.md` se declara **a base que toda spec nova assume como
lida**. Ele estava parado na era da SPEC-07, e o que ele afirmava tinha virado o
contrário do produto:

| O que dizia | O que é desde |
|---|---|
| *"não é SaaS multi-tenant; é uma ferramenta local, com estado em arquivo versionável em git"* | SPEC-33 — servidor Fastify + Postgres + navegador, com organização, times e RBAC |
| árvore com `packages/cli` e sem `aplicacao`/`server`/`llm` | SPEC-31/33 — o hexágono e o modo único |
| *"multi-tenant: nenhum — tenant é o próprio repositório git"* | SPEC-08/13/28 — organização, times, níveis, papéis, auditoria |
| *"persistência via File System Access API"* | Postgres, atrás de portas |
| *"o que ainda não existe: campos estruturados"* | SPEC-18 fez o campo tipo lista |

Um documento de referência errado é pior que documento nenhum: quem chega
confia nele, e ele manda a pessoa para o lugar errado com autoridade.

**O que a reescrita fez de diferente da anterior:** ela era um retrato de
implementação (árvore de pastas + tabela de divergências do plano original).
Agora as **réguas** vêm antes da estrutura — mecanismo nunca caso particular,
nada da máquina vale sem uma pessoa, o desenho é medido e a medida ensina, nada
some em silêncio, ver o efeito antes de aplicar, capacidade que o tour não
mostra não existe. É o que sobrevive à próxima refatoração; a árvore de pastas,
não.

Entraram também duas coisas que só se descobre lendo código: **onde mora a
configuração** (o `diagrama.json` é arquivo, as regras e os campos são banco — e
já houve o defeito das duas fontes disputando) e **as telas com o endereço de
cada uma**, agora que `#/itens` morreu e redireciona.

O que NÃO entrou: histórico. Isso é do JOURNEY, e duplicá-lo aqui criaria duas
versões da mesma verdade — exatamente o que a SPEC-31 mostrou dar errado com
código.

Sem mudança de código: 339 engine · 665 web · 84 aplicação · 237 server ·
83/83 E2E seguem como no §278.

## §280 — o tour mostrava só a metade do ciclo que dá certo

Duas pontas soltas que eu mesmo deixei nas rodadas anteriores, e que só
apareceram quando o usuário perguntou *"faltou algo?"*.

### O "não" existia e não aparecia em tour nenhum

A SPEC-62 pôs o "não" do ciclo de pé — recusar pede o porquê, o pedido recusado
pode ser reconsiderado, o feedback descartado volta a esperar tratamento. E o
passo "Melhoria contínua (PDCA)" do tour de configuração continuou contando só a
metade que dá certo: *"vira sugestão de ajuste, você vê o efeito, aprova — e a
configuração muda de verdade"*.

> Pela régua do §244, **capacidade que o tour não mostra não existe** para quem
> está avaliando a ferramenta. E o "não" é justamente a parte que decide se um
> time continua respondendo.

O passo passou a contar o ciclo inteiro, incluindo o que quem decide vê antes de
decidir (de que feedback o pedido nasceu, quando, e o que ele muda num item de
exemplo). Texto maior pediu tempo maior: 7s era o padrão, e passo longo com 7s é
passo que ninguém termina de ler — foi para 14s.

**Um passo novo, e não dois.** A tentação era dar ao "não" um passo próprio, mas
ele apontaria para o MESMO seletor, na MESMA aba: o realce não se moveria e só o
texto trocaria, o que lê como tour travado. O §236 também já tinha decidido que
este tour não vira uma sequência de telas paradas.

### Um comentário que descrevia o contrário do código

Em `loadConfig.ts`:

> *"`/campos-aresta` só existe no modo local (`openApiLocal.ts`) —
> `packages/server` fica dormente de propósito, sem essa rota"*

As duas afirmações morreram na SPEC-33: o modo local não existe mais e
`routes/camposAresta.ts` está lá. O comentário sobreviveu porque nada quebra
quando um comentário mente — e é por isso que ele é perigoso: a próxima pessoa
lê, conclui que o `catch` protege de uma rota ausente, e ou remove o `catch` ou
escreve uma rota que já existe.

O que se preservou foi o achado real que pôs o `catch` ali, e que continua
valendo: **o `catch` não é sobre rota faltando, é sobre blast radius.** Qualquer
falha naquela chamada rejeitava o `Promise.all` inteiro e derrubava o
carregamento da config para todo mundo, não só para quem usaria o editor de
campos de aresta.

Não saí corrigindo as outras 45 ocorrências de "modo local" no repositório: a
maioria é **história legítima** ("isto nasceu no modo local"), e apagá-la
custaria o porquê. A régua que usei para separar: corrige-se o comentário que
afirma algo **falso sobre o comportamento de hoje**; preserva-se o que conta de
onde a coisa veio.

### Um ruído que fica anotado, não resolvido

Numa das rodadas da suíte do web o vitest terminou com *"unhandled errors"* e
código 1, com **os 666 testes passando**. Duas execuções seguintes saíram limpas
(exit 0). Não é do que mudei aqui — texto de tour e comentário não criam promessa
pendente. Fica registrado em vez de virar "passou": intermitência que ninguém
anota é a que ensina a ignorar vermelho.

339 engine · 666 web · 84 aplicação · 237 server · 83/83 E2E · build limpo.

## §281 — o vermelho que não era teste quebrado, e a corrida na terceira aparição

O §280 anotou sem resolver: numa rodada em três, o vitest do web saía com código
**1** e a mensagem *"Vitest caught 5 unhandled errors"* — com os **666 testes
passando**. Agora com o log capturado, os cinco erros diziam a mesma coisa:

```
ReferenceError: window is not defined
 ❯ dispatchSetState react-dom.development.js
 ❯ src/config/RegrasTab.tsx:80    .catch((e) => setErro(...))
 ❯ src/config/MembrosTab.tsx:35   .catch((e) => setErro(...))
 ❯ src/config/ExportacaoTab.tsx:41
 ❯ recarregar src/config/PdcaTab.tsx:101
This error was caught after test environment was torn down.
```

Todos vindos de `ConfigScreen.test.tsx`. O padrão é sempre o mesmo:
`useEffect` → busca → `.then(setEstado)`. A resposta chega quando chega; se a
tela já saiu — e no teste o ambiente inteiro já foi derrubado —, o `setEstado`
roda sobre um React sem `window` e estoura fora de qualquer teste.

**Não era teste ruim: era o produto escrevendo estado que não interessa mais.**

### A casa já tinha decidido isto

Medi antes de escolher: **7 arquivos já usavam guarda de cancelamento**
(`App.tsx`, `AcessosTab`, `ModeloIaTab`, `ConversaPanel`, `ReviewScreen`,
`usePermissoes`, `useVozNaEntrada`) e **6 não** — e os 4 que estouraram estavam
exatamente entre os 6. Ou seja: não havia decisão nova a tomar, havia um padrão
aplicado pela metade. Consertar só os 4 que perderam a corrida deixaria os
outros 2 esperando a vez.

Duas formas, e a diferença importa:

- **flag local no efeito** (`RegrasTab`, `MembrosTab`, `ExportacaoTab`,
  `useSessao`) — serve quando o efeito é o único a escrever;
- **ref de montado** (`PdcaTab`, `ProdutosTab`, via `useMontado`) — a mesma
  função de recarga roda também depois de cada ação, então a escrita nasce fora
  do efeito e a flag daquele efeito não a alcança.

### E uma delas não era ruído de teste

`MembrosTab` busca por `[timeAtivo]`. Trocar de time com a busca no ar deixava a
resposta **antiga** chegar depois e sobrescrever a nova: a lista mostraria os
membros do time anterior com o nome do time novo em volta.

> É a **terceira aparição da mesma corrida**: §210 foram os itens da demanda
> anterior, §213 foi o canvas da demanda anterior, e agora os membros do time
> anterior. Três vezes já não é azar — é o padrão que faltava aplicar.

O teste novo força a ordem que o defeito precisa (a busca antiga resolve por
último) e **falha sem a guarda** — conferido revertendo o arquivo e rodando.
Ausência de erro em cinco rodadas seguidas não prova corrida nenhuma; um teste
que quebra sem a correção, sim.

### De brinde, um `.then` sem `catch`

`useSessao` fazia `apiAuth.modo().then(setModo)` sem tratamento nenhum. Uma
queda de rede ali virava rejeição não tratada **em produção** e deixava `modo`
indefinido para sempre — e é dele que a `LoginScreen` decide qual formulário
mostrar. Agora o erro aparece, em vez de a tela esperar um valor que não vem.

### O que não fiz

Não saí pondo guarda em toda chamada assíncrona do app. A régua foi o
**gatilho**: efeito que busca e escreve estado. Chamada disparada por clique,
que só existe enquanto a tela está lá, não entra.

339 engine · 667 web · 84 aplicação · 237 server · 83/83 E2E · build limpo — e o
`npm test -w packages/web` sai em 0 em cinco rodadas seguidas, onde antes falhava
em uma a cada três.

## §282 — a próxima spec não precisou de opinião: a ordem já estava declarada

*"e depois avaliar a próxima spec"*.

A tentação era propor o que parecesse mais bonito. Em vez disso, fui ver o que o
próprio usuário já tinha ordenado — a **SPEC-56 §0.4**, a tabela de oito passos
que ele escreveu depois de corrigir o rumo daquela avaliação — e cruzei com o que
foi construído desde então:

| # | Passo declarado | Estado |
|---|---|---|
| 1 | requisito + rastreabilidade + gap analysis | ✅ SPEC-57 fatia A |
| 2 | **padrão como regra sobre topologia e valor** | ⚠️ **só a metade do valor** |
| 3 | ADR ancorado no nó | ✅ SPEC-57 fatia C |
| 4 | percurso | ✅ SPEC-57 fatia E |
| 5 | número com unidade | ✅ `Checagem` com `valorDe` (§241) |
| 6–8 | modo de operação, variante A×B, dialeto | ❌ |

O #2 é o único dos quatro primeiros ainda aberto — e a SPEC-56 §10 tinha dito
por que ele esperava: *"as regras mais valiosas precisam de P1 (caminho) e de P2
(número). Com as duas, P8 é config"*. **As duas ficaram prontas.** A dependência
que o segurava caiu sem ninguém reparar.

### O que o levantamento mudou na SPEC antes de ela ser escrita

Fui conferir os pontos de encaixe em vez de escrever de cabeça, e dois achados
mudaram o desenho:

**1. As violações de percurso não têm válvula de escape.** Eu ia seguir o
precedente (topologia também sem exceção, como percurso). Aí reli o §242:
*"violar o padrão é permitido — e fica registrado. Sem essa saída, a pessoa
aprende a ignorar o vermelho, e a medição inteira morre junto."* Para forma o
argumento é **mais** forte, não menos: "fila sem consumidor porque o consumidor
vem na próxima demanda" é o caso comum. A válvula entrou na fatia C, e a dívida
do percurso ficou nomeada em vez de copiada.

**2. A exceção precisa de chave estável.** `ExcecaoDePadrao` identifica por
`(noId, campo)`, e uma regra de forma não tem campo. Se a exceção apontasse para
o `texto` da regra, renomear a regra desligaria em silêncio as exceções que
alguém registrou com motivo. Daí o `RequisitoDeTopologia.id` obrigatório — é a
mesma disciplina de `Atividade.chave` × `rotulo` que o projeto tem desde a
SPEC-01.

### A régua que impede isto de virar linter

> **A regra de topologia responde à MESMA pergunta das outras duas — "este
> desenho contraria o padrão do time?" — e nunca a "este grafo é válido?".**

Sem essa linha, o passo seguinte seria cobrar ciclo, nó solto e componente
desconectado por serem feios, e a mesa viraria um validador de grafo com opinião
própria. Regra de forma só existe se o time a declarou.

### Dois operadores, e a recusa do terceiro

`exige-conexao` e `proibe-conexao` cobrem os três casos canônicos da SPEC-56 §10.
O terceiro que quase entrou — `exige-intermediario`, "toda escrita no banco passa
por um serviço" — **já é expressável**: é proibir a conexão direta. O caminho
desejado não precisa ser afirmado, precisa ser o único que sobra.

### E a fatia que não é opcional

As réguas de percurso vivem no documento e **não têm editor** — só se configuram
por API. É aceitável para nascer e ruim para viver. A fatia D (seção na
`RegrasTab` + operação no PDCA) está escrita como não-opcional justamente por
causa do §194, quando o feedback que o agente coletava não aparecia em tela
nenhuma: capacidade que só se configura por JSON é capacidade que o time não usa.

Sem mudança de código: a SPEC é documento. A implementação vem na próxima rodada.

## §283 — o caminho confirmado por engano, e o recusado que sumia

*"aqui nessa parte de o usuário errar não consegue ajustar"* — com print do
painel de caminhos mostrando dois `✓` e nada clicável.

O print mostrava um dos três defeitos. Fui ver o código e achei os outros dois.

### 1. Confirmado não tinha volta

`PercursosPanel` desenhava o caminho confirmado como texto puro — `✓ {rotulo}`,
sem botão. E confirmar **não é clique inócuo**: liga as réguas de tempo e de
saltos sobre aquele trajeto e põe item no backlog (§249). O próprio painel
mostra um `Delta` avisando disso *antes* de confirmar — e depois não oferecia
saída. Pior: o botão fica a um pixel do "não é caminho".

### 2. Recusado sumia da interface inteira

Os filtros liam três estados e a tela desenhava dois:

```ts
const aConfirmar = percursos.filter((p) => p.confirmado === undefined);
const confirmados = percursos.filter((p) => p.confirmado === true);
```

`confirmado === false` não estava em nenhuma das duas. O registro continuava
gravado em `quebra.percursos` — o descarte grava `false` de propósito, senão o
inferidor reofereceria o mesmo caminho a cada render — e **nenhuma tela do
produto o mostrava**. Recusando todos, o chip passava a dizer "0 caminho(s)" e
abrir o popover não mostrava nada: nem os caminhos, nem o motivo de não haver
nenhum.

É o §278 na letra: *"se rejeito simplesmente some para sempre"*.

### 3. O obsoleto se passava por caminho vivo

Esse não estava no print e é o mais silencioso. O `conciliarPercursos` promete,
no próprio comentário, que *"caminho confirmado que sumiu do desenho vira
obsoleto em vez de desaparecer"*. O `ReadinessSummary` separava os dois — e os
**concatenava** ao passar adiante:

```tsx
percursos={[...percursosVivos, ...obsoletos]}
```

Como o obsoleto tem `confirmado === true`, caía em `confirmados` e ganhava o
mesmo `✓` de um caminho que existe. A distinção que o engine calculou morria na
renderização, e o `✓` afirmava que um trajeto existe no desenho quando ele já
não existe.

### A correção: um handler, três casos

O que faltava era apagar a **decisão** registrada — e no modelo os três casos
sempre foram a mesma operação. `onReabrir(id)` tira o registro guardado, e o que
sobra sai sozinho do `conciliarPercursos`:

| Estado | Depois de reabrir |
|---|---|
| confirmado | volta a "a confirmar" — o desenho ainda o produz |
| recusado | volta a "a confirmar", pelo mesmo caminho |
| obsoleto | some de vez — o desenho não o produz mais |

Uma linha no `ReadinessSummary` (`percursos.filter((p) => p.id !== id)`), três
comportamentos, nenhum caso especial. Quando o conserto sai assim, é sinal de
que o modelo estava certo e só a tela não o usava.

E o recusado ganhou lista própria, **fechada mas alcançável** — mesmo desenho do
histórico do ciclo (§276/§278): o resumo em cima, a lista atrás de um clique,
cada linha com a volta. Ele continua fora da fila de confirmação de propósito;
o que mudou é que deixou de estar fora da existência.

### Quarta aparição, e o que isso significa

§278 recusar ajuste. §278 descartar feedback. §281 a resposta antiga que
sobrescrevia a nova. Agora o caminho. A régua já estava escrita —
`CONTEXTO-E-ARQUITETURA` §4.4, *"nada some em silêncio… e o 'não' também é
decisão: fica registrado, e pode ser reconsiderado"*.

> **Quando a mesma correção aparece quatro vezes, ela deixou de ser correção e
> virou régua a aplicar por varredura.** O §281 fez isso para a corrida da
> resposta tardia (medi os 13 arquivos, corrigi os 6 que faltavam). Aqui o
> equivalente seria varrer toda decisão de mão única do produto — fica anotado
> como a próxima varredura, e não como mais um conserto pontual quando o próximo
> print chegar.

### Um teste que afirmava o defeito

`"caminho RECUSADO some da fila de confirmação"` existia e passava. A intenção
era certa (não voltar para a fila), mas a asserção parava aí — e o caminho sumia
da interface inteira sem que nada reclamasse. O teste ganhou a segunda metade:
sumiu da fila **e** continua alcançável.

### Um flake diferente do §280

Numa rodada da suíte cheia, `useEsteiraDeAgentes.test.ts` falhou (1 de 671).
Isolado passa 20/20, e três rodadas seguintes da suíte inteira saíram em 0.
**Não é o flake do §280** — aquele era "unhandled errors com todos os testes
passando", e foi fechado no §281; este é um teste que de fato falha sob carga.
Fica anotado com o nome, para a próxima ocorrência ter de onde partir.

339 engine · 671 web · 84 aplicação · 237 server · 84/84 E2E · build limpo.

## §284 — a seta que apontava para o mesmo lugar

*"o que me estranha aqui é 4 → 4, acho que ninguém entende instintivamente o que
é 4 → 4"* — com print da caixa **"Se confirmar este caminho"** mostrando
`itens no backlog 4 → 4`.

Está certo, e o incômodo tem nome: a caixa promete uma **consequência** no
título e entregava uma **equação para resolver** antes de a pessoa concluir que
não há nenhuma.

### O que estava certo e eu quase estraguei

A primeira ideia foi esconder a linha que não muda. Seria perder informação boa:
"não muda" é o **preço sendo zero**, e mostrar o preço antes do clique é
literalmente o que o §263 construiu. O `Remedicao` do motor já trata isso com
cuidado — o campo `alerta` tem no comentário *"ausente é afirmação: não piora
nada"*.

O defeito não era mostrar. Era **escrever a não-mudança na gramática da
mudança**.

> **A seta promete travessia.** Onde não houve travessia, ela mente por forma,
> mesmo com os números certos.

### E a casa já falava a língua certa

Duas prévias da `PdcaTab` já resolviam o mesmo caso em português — *"Nada muda —
esse campo já está exatamente assim"* (`previa-ficha-sem-efeito`) e *"Nenhuma
mudança neste item"* (`previa-sem-efeito`). O `Delta` era o único dos três que
respondia com aritmética. Agora:

| Situação | Antes | Agora |
|---|---|---|
| nada muda | `itens no backlog 4 → 4` | *Nada muda — itens no backlog continua em 4.* |
| linha parada entre linhas que andaram | `itens no backlog 4 → 4` | `itens no backlog: 4 (não muda)`, sem seta |
| linha que muda | `lacunas 0 → 2` | igual — a seta ficou para quem a merece |

A linha parada **não some** no caso misto: sumir esconderia uma medida que foi
tomada. Ela perde a seta, que é o que prometia travessia, e ganha peso menor.

Onde o conserto mora também foi decisão: no `Delta`, não no motor. O
`remedicao.ts` diz em voz alta que *"não montam frase… a redação é da tela"* — e
motor que devolve texto pronto é motor que a próxima tela não reaproveita.

### Um teste que codificava a forma, e não a intenção

`NecessidadesPanel.test` tinha:

```
it("sugestão que JÁ vem vinculada não cria lacuna — e o delta diz isso")
  expect(delta).toHaveTextContent("lacunas 0 → 0");
```

O **nome** do teste estava certo desde sempre: *"o delta diz isso"*. A asserção é
que tinha congelado a forma antiga — a mesma armadilha do §283, onde
`"caminho RECUSADO some da fila"` afirmava metade de um defeito. O teste passou a
cobrar a frase em vez da equação, e ganhou `not.toHaveTextContent("→")`: a
ausência da seta é parte do que se está afirmando.

339 engine · 673 web · 84 aplicação · 237 server · 84/84 E2E · build limpo.

## §285 — a pergunta sobre o conector desenterrou uma régua que devolvia zero

*"o que acontece quando o usuário altera um conector? exemplo, era lê, e agora lê
e escreve, como deveria impactar essa parte da confirmação? e se não for o que
foi sugerido, como ajustar?"*

Fui medir antes de opinar, e a resposta é **"hoje não acontece nada"** — em um
dos casos porque está certo, no outro porque a medição é cega.

### O que está certo, e por que não deve mudar

`Percurso.id` é `pc::${nos.join(">")}` — dos nós, não das arestas — e nem
`inferirPercursos` nem `avaliarPercursos` leem `Aresta.type`. Trocar `lê` por
`lê e escreve` tem efeito zero sobre a confirmação.

E deve ter: a confirmação afirma *"este trajeto existe de verdade"*, e trocar o
verbo do conector não desfaz a passagem da requisição por ali. Invalidar a cada
troca de rótulo obrigaria a reconfirmar o tempo todo, e o §242 já mostrou aonde
isso leva — a pessoa aprende a clicar sem ler.

### O que não está: a régua não vê o que o caminho atravessa

As duas réguas de percurso do exemplo somam `timeoutMs`. E `timeoutMs` é
declarado em **`edgeTypes.http` e `edgeTypes.grpc`** — entre os nós, só em
`external`. A apuração mede apenas nós:

```ts
function declaraCampo(no: No, config: DiagramaConfig, campo: string) {
  return (config.nodeTypes[no.type]?.spec ?? []).some((c) => c.key === campo);
}
```

Num caminho `web → api → worker` ligado por HTTP, a soma dá **zero** e a régua se
cala, no ramo comentado como *"a régua não se aplica aqui, e isso é silêncio
legítimo"*.

> **O silêncio não é legítimo, é cego.** O caminho tem timeouts, eles moram nas
> arestas, e a medição não os enxerga. O cabeçalho do próprio arquivo promete "a
> soma dos timeouts do percurso" — e o §248, sobre este mesmo código, escreveu
> que "um verde falso é o pior resultado possível de uma medição".

Trocar `lê` por `HTTP` com `timeoutMs: 900` deveria mudar tudo, e não muda nada.
O dado nem falta: `Aresta` tem `spec?: Record<string, ValorSpec>`, a mesma forma
do nó. Falta a apuração olhar.

### E a segunda pergunta: não dá para ajustar

Só existem `confirmar` e `não é caminho`. Se o trajeto real passa por um nó a
mais, não há verbo. O modelo já prevê — `Percurso.origem` aceita `manual` e
`percursoConta()` conta manual sempre — e nada no produto cria um. Mesma
assimetria do §283 um degrau acima: lá faltava **desfazer**, aqui falta
**corrigir**.

### Dois fatos que o levantamento mudou na SPEC

Como no §282, fui conferir os encaixes antes de escrever, e dois achados
entraram no desenho:

1. **`Aresta` já tem `spec`.** Eu ia propor um lugar novo para o valor do campo
   de conexão. Ele existe desde sempre, com a forma do nó — a fatia A é
   apuração, não modelo;
2. **`conciliarPercursos` mandaria todo caminho manual para "obsoleto".** Ele
   monta `percursos` a partir dos INFERIDOS e joga em `obsoletos` todo guardado
   que não foi inferido. Um manual nunca é inferido: apareceria para sempre como
   *"sumiu do desenho"*, recém-criado. A fatia B leva a conciliação junto, senão
   nasce quebrada.

### A costura fina: ajustar é recusar com resposta

Corrigir um caminho sugerido não pode apagar a sugestão — o inferidor a
devolveria a cada render, e a pessoa corrigiria a mesma coisa para sempre. Então
ajustar grava duas coisas: o manual com a sequência certa, e o inferido como
`confirmado: false`, que desde o §283 tem lista própria e caminho de volta.

> O produto já sabia que o "não" precisa de motivo (§278). Aqui o motivo é o
> caminho certo.

### Prioridade

A SPEC-63 (régua sobre a forma) e esta são independentes. Se for para escolher,
**esta primeiro**: corrigir uma medida que devolve zero vale mais do que
acrescentar uma medida nova.

Sem mudança de código: a SPEC é documento.

## §286 — a régua do caminho passou a enxergar o caminho

Implementação da SPEC-64, as três fatias.

### A: a medição enxergava metade

`declaraCampo` lia `config.nodeTypes`. `timeoutMs` é declarado em
`edgeTypes.http` e `edgeTypes.grpc`. Num caminho `web → api → worker` ligado por
HTTP a soma dava **zero**, e a régua se calava no ramo comentado como *"silêncio
legítimo"*.

Agora o campo é procurado em **quem o declara** — nó ou conexão atravessada — e
cada elemento contribui uma vez. A conta que aparece diz de onde veio: *"soma de
timeoutMs = 2400ms em 2 conexões"*, e não *"em 5 elementos"*. Essa frase é o que
o §4.3 da SPEC pedia como aviso de que a régua mudou — sem precisar de um estado
"é a primeira vez que você vê isto", que seria memória para uma preocupação
passageira. **Anotado como desvio consciente da SPEC.**

Duas decisões finas:

- **par com mais de uma conexão que declara o campo** não é medido, e diz por
  quê. Escolher uma seria inventar; somar as duas inflaria o caminho. É a
  terceira resposta do §248 num caso novo;
- a ambiguidade é resolvida **por campo**, não por caminho: um par com duas
  conexões só é ambíguo para a régua que mede um campo que as duas declaram.
  Resolver antes do campo produziria "não medido" em régua que nem olha conexão.

`nosSemValor` virou `elementosSemValor` — campo chamado "nós" carregando aresta
é a mentira por nome que o §280 corrigiu noutro lugar. E o endereço do que falta
passou a levar à aresta (`onSelecionarAresta`), que é onde se preenche.

### B e C: declarar e corrigir

O verbo do meio existe agora. **Ajustar é recusar com resposta**: grava o manual
certo e deixa o inferido como `confirmado: false` — apagá-lo faria o inferidor
devolvê-lo no render seguinte, e a pessoa corrigiria a mesma sugestão para
sempre.

A barra do modo vive **fora** do popover dos caminhos, e isso não é estética: o
gesto é clicar nós no canvas, e o popover fecha no primeiro clique fora dele.
Uma barra dentro dele sumiria no primeiro nó.

### Três defeitos que os testes pegaram, e um que a SPEC já previa

1. **A SPEC previa:** `conciliarPercursos` montava a lista de vivos a partir dos
   INFERIDOS, e um manual nunca é inferido — cairia direto em "obsoleto",
   recém-criado. Corrigido junto, como a SPEC mandava;
2. **o E2E pegou:** `ajustar` recebia o `id` e o App procurava o percurso em
   `quebra.percursos` — onde o inferido **não está**, porque ele é recalculado a
   cada render. A correção começava vazia. O painel passou a entregar o percurso
   inteiro;
3. **o E2E pegou:** o caminho manual **conta** mas nasce com
   `confirmado: undefined`, e o painel filtrava a lista por `confirmado ===
   true`. Ele não caía em lista nenhuma: **nascia invisível**, com o registro
   vivo na quebra. É o §283 de volta, pela porta da fatia B. O filtro passou a
   ser `percursoConta` — quem decide o que conta é o engine;
4. e o chip só aparecia havendo caminho lido, o que deixava sem porta de entrada
   justamente o desenho que o inferidor não sabe ler — o caso que a fatia B
   existe para atender.

> O terceiro é o mais instrutivo: eu tinha acabado de consertar essa família no
> §283 e reintroduzi um caso dela ao acrescentar um estado novo. **Régua aplicada
> não fica aplicada sozinha** — cada estado novo passa por ela de novo.

### O E2E da fatia A não existe, e o motivo fica escrito

Medi: o documento de regras do deploy E2E vem **vazio** (`percursos: null`).
Para exercitar a régua ponta a ponta eu teria de gravar uma régua **global** — e
o §281 custou três specs vizinhos ensinando que config global em suíte paralela
é estado compartilhado. Pior: uma régua de percurso ligada faria violação
aparecer, e o `caminho-tem-volta` (§283) espera a lista de confirmados, que a
tela esconde quando há violação. Eu quebraria meu próprio spec da rodada
anterior.

A fatia A é função pura e está coberta onde mora: sete casos novos no engine,
incluindo o caminho ligado por HTTP que antes somava zero.

351 engine · 679 web · 84 aplicação · 237 server · 85/85 E2E · build limpo.

## §287 — a régua que olha a forma, e não o preenchimento

A SPEC-63, inteira. Até aqui toda régua deste produto perguntava a mesma coisa:
**este campo está preenchido?** A régua de forma pergunta outra: **este desenho
está ligado do jeito que combinamos?** Fila sem consumidor, app falando direto
com o banco de outro time — nada disso é campo em branco. É desenho errado, e o
produto não tinha como dizer isso.

Foram quatro fatias, e o eixo delas é sempre o mesmo: a régua nasce do time,
mede o desenho de verdade, acusa com o porquê, e aceita exceção com motivo.

### A — o motor

`avaliarTopologia` é função pura sobre o diagrama e duas checagens:
`exige-conexao` (todo X precisa de conexão entrando/saindo) e `proibe-conexao`
(nenhuma conexão liga X a Y). Duas, não dez: são as que cobrem os casos que
motivaram a SPEC, e cada checagem nova é uma superfície nova no editor.

A violação aponta o **elemento**, não a régua: `noId` quando falta conexão,
`arestaId` quando a conexão é a proibida. É o que faz o clique no placar levar a
pessoa ao lugar onde se conserta — a mesma disciplina do `onSelecionarAresta` do
§286.

### B e C — onde ela aparece, e a válvula

A régua de forma entra no mesmo chip ⚖ das outras, somando. Não criei um placar
segundo: dois placares fariam a pessoa perguntar "qual dos dois manda?", e a
resposta seria "os dois", que é a pior resposta possível.

A exceção se prende ao par **(elemento, regraId)** — não ao campo, porque não há
campo. Isso obrigou `ExcecaoDePadrao` a ganhar `regraId?`, e o `campo` a ficar
vazio nas exceções de forma. Considerei um tipo separado; desisti porque a
exceção é a mesma ideia ("aceito de propósito, e digo por quê") e dois tipos
divergiriam na primeira mudança.

### D — a régua nasce pela tela

O que separa esta rodada de uma régua de arquivo: `ConstrutorDeForma` só oferece
**tipos que existem** no diagrama daquele time. Não dá para apontar para um
componente inexistente — melhor que validar depois. O `validateRegras` segue
guardando quem edita o JSON à mão, mas ninguém precisa mais fazê-lo.

O id da régua é derivado do texto (`forma-toda-fila-tem-consumidor`), estável, e
regravar o mesmo texto **atualiza** em vez de duplicar. Pedir à pessoa que
invente um identificador seria pedir a coisa errada na hora errada — e as
exceções se prendem a esse id.

O mesmo construtor serve o estúdio do PDCA, com prévia antes de aplicar. Duas
cópias do formulário divergiriam na primeira mudança; é a lição do `Delta`
(§263).

### O defeito que só o E2E acharia: a régua que não valia até o F5

A régua gravava certo, chegava certo ao documento do deploy, e **a mesa não
mudava**. `regrasConfig` era **prop** de `AppCarregado`: entrava uma vez, no
carregamento, e nunca mais era relida. Quem criasse a régua veria a tela dizer
"gravado" e o placar seguir mudo — e concluiria, com razão, que o produto
mentiu.

Virou estado, e `RegrasTab` passou a avisar quem segura a config
(`onRegrasMudaram` → `recarregarConfig`), pelo mesmo caminho que o
`onFichaMudou` da §52 já usava.

> Isto é a mesma família do §283 e do §281 por um ângulo novo: não é decisão de
> mão única, é **decisão que não chega**. O padrão vale a mesma varredura que o
> §283 já pediu: config lida uma vez e guardada em prop é uma promessa de que
> ela nunca muda — e neste produto ela muda o tempo todo.

### O que o E2E prova, e por que ele pôde existir aqui

O §286 não teve E2E de régua e escreveu o motivo: mexer em regras globais numa
suíte paralela quebra vizinho. Aqui deu para fazer, e a diferença fica registrada:
**nenhum outro spec lê `regras.topologia`** — é seção nova, sem vizinho. Mesmo
assim o `finally` restaura o documento, porque a janela existe.

O spec percorre o ciclo fechado: cria a régua pela tela → confere que ela chegou
ao servidor → desenha a fila no canvas → o chip acusa com o porquê → aceita com
motivo → o chip some. Nenhuma etapa mockada.

### Decisões que tomei sozinho

O usuário se ausentou pedindo a implementação pronta, então registro as chamadas
que fiz sem perguntar:

- **duas checagens, não um mini-idioma de regras.** Um DSL cobriria mais e
  ninguém escreveria a segunda régua;
- **um placar só**, somando forma e valor, pelo motivo acima;
- **`ExcecaoDePadrao` reaproveitada** em vez de tipo novo;
- **`onRegrasMudaram` genérico**, não específico de forma: o defeito era de
  toda a config de regras, não da seção nova.

369 engine · 687 web · 84 aplicação · 237 server · 129 llm · 86/86 E2E · build e
lint limpos.

## §288 — a ação que não era pílula virou texto solto

Relato, com captura: *"os botões ficaram com pouco espaço (os sem chips)"*. Na
imagem, **"não é caminho" partido ao meio** — "não é" numa linha, "caminho" na
outra — e "ajustar" colado nele.

Duas causas, e a segunda é a que interessa.

**A rasa:** `linkEstilo` era usado por duas coisas diferentes. Ele nasceu para o
**rótulo** do caminho, que é texto corrido e precisa quebrar: `padding: 0`,
quebra livre. Depois "ajustar", "não é caminho", "desfazer", "reabrir" e
"remover" foram herdando o mesmo estilo porque pareciam links. Ao lado de um
botão sólido, isso dava um alvo de clique de onze pixels sem folga nenhuma — e
a quebra livre, feita para o rótulo, partia o rótulo da ação.

O rótulo e a ação passaram a ter estilos separados: `acaoEstilo` com folga,
cantos e `nowrap`.

**A que interessa:** o rótulo é `a → b → c` e **cresce com o desenho, sem
teto**. Um layout que confia na largura de um texto sem teto vai quebrar — a
única questão é em qual desenho. O do relato tinha 40 caracteres; medi também
um de 67.

A linha ganhou `flexWrap`, o rótulo `minWidth: 0` (é o que autoriza um filho de
flex a encolher abaixo do próprio conteúdo), e as ações viraram um grupo com
`flexShrink: 0`. Agora **ou cabem todas na linha do rótulo, ou descem todas
juntas** — nunca se espremem.

### Medido, não olhado

JSDOM não calcula layout, então um teste unitário aqui só consegue travar a
*causa* (o `nowrap`, o `minWidth: 0`, o `flexShrink: 0`) — e é o que ele faz.
A prova de que o sintoma sumiu veio de um probe Playwright descartável contra a
pilha real, medindo `getBoundingClientRect` com os dois rótulos:

| rótulo | linhas do rótulo | "não é caminho" |
|---|---|---|
| 40 caracteres (o do relato) | 1 | 23px de altura, uma linha |
| 67 caracteres | 2 | 23px de altura, uma linha |

Nos dois, as ações desceram inteiras em vez de estreitar.

> A lição não é sobre CSS. É que **`linkEstilo` era um nome sobre aparência**
> ("parece um link"), não sobre papel, e nome sobre aparência atrai usos que não
> têm nada em comum. É o §280 outra vez, por outra porta: quando o nome não diz
> o papel, o código junta coisas que precisavam ficar separadas.

689 web · 12/12 E2E de caminho · demais suítes intocadas.

## §289 — o motor de regras vira componente, e não campo de texto

Relato: *"é muito comum inclusive na nossa implementação que o fluxo seja
implementado em um motor e que existam vários"* — precificação, renda, catálogo
de produto, elegibilidade de produto, elegibilidade de crédito, configuração e
estratégia de produto, limites.

Medi o catálogo antes de desenhar. Havia dois vizinhos e um buraco entre eles:
**Regra de Negócio** (a regra solta), **Fluxo Decisão (FICO)** (o fluxo de um
produto específico) — e o conceito de motor existindo só como **texto livre**,
num campo do FICO chamado `motorPadrao`. O produto já sabia que motores existem
e não sabia perguntar nada sobre eles.

### Um tipo, não sete

A pergunta de desenho era essa, e a resposta veio do próprio catálogo: **todo
tipo existente é uma categoria técnica** — "Tabela SQL", "Serviço", "Cache" —, e
a instância é o nó. Nenhum tipo carrega domínio de negócio.

Precificação e limites não são artefatos técnicos diferentes: são o mesmo motor
de regras decidindo coisas diferentes. Sete tipos de paleta seriam **sete cópias
do mesmo `spec`**, divergindo na primeira mudança (a lição do `Delta`, §263), a
paleta saltaria de 16 para 23 botões numa lista plana, e um motor de fraude
amanhã exigiria editar configuração. Um tipo com o domínio como campo resolve os
três, e um domínio novo nasce escolhendo `outro`.

### As perguntas que o tipo faz

Cada campo obrigatório teve de justificar por que um item de backlog o pede:

- **quem publica mudança de regra neste motor.** Motor é quase sempre
  compartilhado, e quem desenha o fluxo raramente é quem altera a regra. Sem
  este nome o item chega à sprint dependendo de alguém que não sabe disso;
- **decisões já tomadas na versão anterior** — valem congeladas, são
  reavaliadas, ou convivem. Mudar regra de motor **muda o passado**, e essa
  pergunta só aparece em produção se não for feita aqui;
- **comportamento se o motor não decidir** — timeout, indisponibilidade, ou
  caso sem regra.

O tipo aponta para `Backend-regras`, e não foi escolha estética: é o contexto
cujo checklist já cobra "descrever os motores, rulesets ou fluxos de decisão
modificados" e o versionamento das regras. Apontar para contexto sem régua faria
o tipo nascer sem ciclo de teste — exatamente a lacuna que o
`coberturaConfigPadrao` existe para pegar.

### Dois achados no caminho

**O schema mentia.** `config/diagrama.schema.json` não é validado por código
nenhum — é documentação do formato — e não declarava `specResumo`,
`specResumoPorAresta`, `cenarioGherkinPadrao` nem `cenarioGherkinPorAresta`,
todos em uso por quatro tipos com `additionalProperties: false`. Quem lesse o
schema para escrever um tipo novo escreveria um tipo pobre. As quatro chaves
entraram.

**A engrenagem contra a balança.** O motor caiu no badge de letra ("M") porque
o catálogo de ícones não tinha nada que dissesse "motor". `Scale` já é da Regra
de Negócio; usar o mesmo apagaria no canvas justamente a distinção que o tipo
novo existe para fazer. `Cog` entrou no catálogo.

### O que foi medido, e o que não precisou de E2E

Probe descartável contra a pilha real: o botão na paleta, o nó com a engrenagem,
o select com os sete domínios na ordem do relato, e `Qual domínio` **ausente**
com "Precificação" e **presente** com "outro".

Não escrevi E2E permanente do motor, e o motivo fica escrito: a paleta é um
`map` sobre `nodeTypes` e o formulário é um `map` sobre `spec` — um E2E do
motor testaria o mecanismo genérico outra vez. O risco específico é a config, e
ele está travado no engine com as funções **reais** (`camposVisiveis` avaliando
o `when`, `derivar` produzindo o item), pela mesma razão do
`coberturaConfigPadrao`: se a regra mudar, o teste acompanha em vez de mentir.

> O `fluxo-basico` cobrava `toHaveCount(16)` na paleta e quebrou — de propósito.
> O comentário dele já dizia "quem adiciona o tipo atualiza aqui". Contagem
> exata como essa costuma ser teste frágil; aqui ela é o que prova que a paleta
> vem do config e não de uma lista fixa no código, e o custo de mantê-la é uma
> linha por tipo novo.

377 engine · 689 web · 84 aplicação · 237 server · 129 llm · 86/86 E2E · build e
lint limpos.

## §290 — o verde que respondia a pergunta errada

Relato: *"senti falta de um feedback em tempo real — um serviço recebendo uma
chamada e fazendo diversas antes de responder não tem nenhum feedback disso
enquanto está desenhando"*.

Antes de opinar, medi. Carreguei o cenário `credito-completo` na pilha real, e
ele é — sem eu ter escolhido — exatamente o exemplo do relato: três saídas do
serviço de entrada, cadeia de quatro saltos, e um **bureau de terceiro** no fim
dela.

A faixa disse **VERMELHO 0 · AMARELO 0 · VERDE 8**, e o balão completou: *"Tudo
verde — a quebra está pronta para derivar os itens de trabalho."*

### O diagnóstico

**Verde responde "todos os campos estão preenchidos?" e é lido como "o desenho
está bom?".** A cor não mente sobre o que mede. Ela mente por omissão sobre o
que não mede — e a frase "pronta para derivar" fecha a pergunta que a pessoa
ainda deveria estar fazendo.

Levantei os cinco mecanismos de feedback que existem e nenhum cobre isto:
`calcularProntidao` é sobre **um** nó; `avaliarTopologia` (§287) é binária e
pontual; `avaliarPercursos` exige caminho **confirmado** e régua configurada;
`avisosDaDerivacao` (§261) só aparece **no clique de derivar**, que é tarde
demais — a decisão de desenho já foi tomada; `detectarConflitos` olha o grafo de
atividades, não o desenho.

> Todo feedback deste produto é ou **por elemento** (a cor do nó) ou **por
> momento** (o diálogo de derivar). Nenhum é **pela forma, enquanto ela nasce**.

### A linha da SPEC-63, e como atravessá-la sem quebrá-la

A SPEC-63 §1 escreveu: *"é a linha que impede isto de virar um linter de grafo
genérico — não vamos cobrar ciclo, nó órfão ou componente desconectado por serem
'feios'"*. Ela continua valendo, e foi o obstáculo real desta avaliação.

A saída não é uma exceção à linha, é uma distinção:

> **Uma régua diz "isto está errado". Uma leitura diz "isto é o que você
> desenhou".**

"Este serviço faz três chamadas que esperam resposta; a latência da resposta é a
soma das três" não é julgamento de ninguém — é o desenho, dito em voz alta. Por
isso a leitura não entra no placar ⚖, não bloqueia derivação, não vira item e
**não pede exceção com motivo**: não há o que excepcionar num fato. O que ela
ganha é um caminho de um clique para virar régua no `ConstrutorDeForma` da §287,
quando o time decidir que aquele fato é uma regra.

É também o que a impede de virar mais uma cor para ignorar (§230): ela não tem
cor de erro, porque não é erro.

### O achado que decidiu o desenho

Para dizer "três chamadas **antes de responder**" é preciso saber quais arestas
esperam resposta. **Nada no produto declara isso.** `EdgeTypeConfig.fluxo`
existe, mas é direção, e o próprio comentário diz que serve *"só pra animação do
diagrama exportável"*.

Direção não é sincronia: `consumes` é `reverse` e assíncrono, `reads` é
`reverse` e síncrono. E o nome do tipo não basta — `http` normalmente espera, e
`http` fire-and-forget existe. Chutar aqui produziria a pior saída possível: uma
frase confiante e errada sobre a arquitetura de alguém.

Daí `espera?: boolean`, declarativo — e a lacuna que se declara: tipo sem
`espera` sai da conta **e aparece na lista de ignorados**, com o caminho para
resolver. Leitura que ignorou metade do desenho sem dizer é pior que leitura
nenhuma (§57).

### O que ficou fora, escrito antes de alguém pedir

Ciclo, nó órfão, componente desconectado, profundidade assíncrona, contagem de
tipos. Todas detectáveis, nenhuma com consequência dizível numa frase sem virar
julgamento estético — que é o linter que a §287 recusou. Registrado na SPEC §5.5
para não virar zelo daqui a três rodadas.

Só a SPEC nesta rodada; nenhum código de produto mudou. As fatias estão em
ordem, e **B antes de C não é negociável**: desenhar a marca antes de ter o que
ela diz produz um número bonito que ninguém sabe explicar.

## §291 — o tempo que só existe através do que espera

Pedido: *"precisa aparecer em algum lugar sem precisar abrir e especificar
tudo, apenas o necessário — o tempo geral das operações mapeadas, e se houver
parte síncrona ver o que interessa quanto a isso"*.

As fatias A, B e C da SPEC-65, com a superfície mais barata que atende o pedido:
o número **na** faixa, não atrás dela.

### A percepção que organizou o código

Tempo e sincronia pareciam duas perguntas e são **uma**. O timeout de uma
chamada só entra na conta da resposta se quem chamou estiver esperando — quem
publica numa fila não espera, e a soma **para ali**.

Isso virou `trechosQueEsperam`, que quebra o caminho nos trechos contínuos de
conexões que esperam. Num desenho `api →http(300)→ srv →publica→ fila
→consome→ worker →http(5000)→ externo`, a leitura devolve **dois trechos**
(5000 e 300) e nunca 5300. Somar o caminho inteiro daria um número que ninguém
experimenta — e um número grande e confiante sobre uma cadeia que responde na
hora é pior que número nenhum.

### O dado que não existia, e a instância que sabe mais que o tipo

Nada no produto declarava o que é uma chamada síncrona. Entrou `espera?:
boolean` no `EdgeTypeConfig` — e ausente significa **não se afirma nada**: a
conexão sai da conta e aparece na lista de ignorados (§57).

O detalhe que rendeu: `consumes` já trazia um campo `sincrono` por conexão
desde a SPEC-21. Então a **instância manda sobre o tipo** — quem respondeu
aquele campo disse algo mais específico do que o padrão do tipo sabe, e
ignorá-lo seria descartar o dado mais confiável que existe sobre aquela
conexão.

### A frase precisou aprender a degradar

O primeiro desenho do chip falava em milissegundos. Medi o cenário
`credito-completo` e ele tinha **um** timeout preenchido — e esse é o estado
normal de quem acabou de desenhar. Um chip que só soubesse falar de tempo
ficaria mudo justamente para a pessoa que a SPEC existe para atender.

`resumirLeitura` passou a ter três degraus, sempre dizendo o que sabe:

| estado | frase |
|---|---|
| números completos | `até 1,1 s de resposta` |
| pela metade | `≥ 300 ms de resposta · 1 por preencher` |
| sem número | `3 saltos que esperam` |
| nada a dizer | **sem chip** |

O `≥` é o §248 na largura de um caractere: a soma é piso, e a frase não deixa
lê-la como total. E o último degrau importa tanto quanto os outros — chip que
aparece sempre vira moldura, e some da vista junto com o que deveria mostrar.
O E2E prova os dois lados: mensageria pura **não** ganha chip.

### O que o E2E flagrou, e era melhor que o esperado

Escrevi o spec esperando `"saltos que esperam"` e a tela devolveu **`≥ 3,0 s de
resposta · 1 por preencher`**. Fui ver: o único tempo declarado no cenário é o
`timeoutMs: 3000` do **nó** `bureau-credito-nacional`, e a conexão `http` que
leva até ele está vazia.

Ou seja, no mesmo desenho que dizia *"VERDE 8 — pronta para derivar"*, a mesa
passou a dizer: **a resposta leva pelo menos três segundos por causa de um
sistema que não é de vocês, e falta um dado para fechar a conta.** A
expectativa errada era minha; o produto estava mais certo do que eu tinha
escrito.

> Também é a prova de que o timeout do NÓ precisava entrar na soma junto com o
> da conexão. Uma leitura que olhasse só arestas devolveria zero aqui — o mesmo
> defeito que o §285 achou na régua de percurso, pelo outro lado.

### A linha que não foi cruzada

Nada disto entra no placar ⚖, bloqueia derivação, vira item ou pede exceção com
motivo. O chip é neutro de propósito: vermelho e âmbar já significam "errado" e
"atenção" na gramática da mesa, e pintar um fato de âmbar transformaria leitura
em cobrança — que é o linter de grafo que a §287 recusou. O popover abre
dizendo isso em voz alta: *"isto é leitura, não régua"*.

400 engine · 696 web · 84 aplicação · 237 server · 129 llm · 88/88 E2E · build e
lint limpos.

## §292 — a marca no desenho, o silêncio com volta, e o pressuposto que era invisível

As fatias **C** e **D** da SPEC-65, mais um buraco que a pergunta do usuário
desenterrou.

### A marca, e a regra de uma por nó

O nó que faz três chamadas que esperam agora diz isso **no próprio card**: um
selo `⏱ 3`, em cor de tinta. Nunca vermelho nem âmbar — os dois já significam
"errado" e "atenção" na mesa, e pintar um fato de âmbar transformaria leitura em
cobrança, que é o linter de grafo que a §287 recusou.

**Uma marca por nó, nunca duas.** Um nó pode ser fan-out *e* começo da cadeia
mais funda; duas marcas no mesmo canto viram enfeite, e enfeite é o que se para
de ver. Quando coincidem, o fan-out ganha — ele é sobre o nó em si ("este
componente faz N chamadas"), enquanto a cadeia é sobre o caminho que passa por
ele, e o canto de um nó fala do nó.

Ao olhar a marca, as conexões dela **acendem e animam** e as demais esmaecem: a
leitura vira visível **na figura**, que é onde a pessoa está olhando.

### O piscar quase voltou pela porta nova

O memo das arestas do `Canvas` carrega um comentário antigo sobre um achado
real: digitar no painel fazia todo rótulo de conexão repintar, porque o memo
dependia de um array recriado a cada render. A correção da época foi trocar a
dependência por uma **string de geometria**.

O realce precisa de uma dependência nova — quais arestas acender —, e um array
ali reintroduziria exatamente aquele defeito. Então ele entra como string
(`"e1|e2|e3"`), pela mesma razão e com o mesmo formato. E o `marcaOlhada` é
estado **local do canvas**: hover não é decisão, e subi-lo ao App faria toda
passada de mouse re-renderizar o painel lateral.

### Calar é decisão, e decisão tem volta

"Não me mostre aqui" cala o par **(nó, tipo de leitura)** — nunca o nó inteiro,
porque silenciar tudo de uma vez é o que transforma sinal em ruído aceito. Fica
registrado com quem e quando, e volta pela lista de caladas (§283).

Duas decisões finas:

- a dispensa se prende ao **tipo**, não ao número. Um fan-out que passa de 3
  para 4 chamadas não deveria ressuscitar um silêncio que alguém pediu;
- **dispensa de leitura que sumiu do desenho não aparece na lista** — ela não
  está calando nada. O registro fica na quebra, mas a tela só mostra o que tem
  efeito, senão a lista encheria de fantasmas do desenho de ontem.

### O E2E pegou o silêncio pela metade

`marcasPorNo` recebia as dispensas — e o App **não as passava**. Calar tirava a
linha do popover e deixava a marca de pé no canvas: o silêncio pedido valendo em
metade da tela, e a pessoa concluindo, com razão, que o botão não funciona.

Só o navegador acharia isso: os dois lados estão corretos isoladamente, e o
teste de unidade de cada um passava.

### "virar régua" NÃO foi entregue, e a ausência é a mensagem

A prop existe no painel; o App não a passa, então o botão não aparece. O motivo:
a régua de forma (§287) sabe `exige-conexao` e `proibe-conexao`, e um fan-out
viraria `limita-grau`, que **não existe**. Um botão que abre um formulário onde a
regra não cabe é pior que botão nenhum (§244).

A SPEC-65 §9.1 já recomendava `limita-grau` fora da fatia D. Fica de pé,
esperando a checagem.

### O pressuposto que ninguém conferia

O usuário perguntou: *"uma chamada http é síncrona, uma mensagem kafka
assíncrona — isso já está estruturado nas configurações?"*

Está, desde o §291, e a resposta tem uma precisão que vale registrar: **é por
conexão, não por componente.** Kafka e Rabbit são nós; o que é assíncrono é
*publicar em* e *consumir de* — e por isso o mesmo Kafka pode ser consumido de
forma bloqueante, que é a razão de `consumes` ter um `sincrono` por instância
que sobrepõe o padrão do tipo.

Mas medi e achei o buraco: **`espera` só existia no arquivo.** A aba de campos de
conexão nunca o mostrou, e pressuposto invisível é pressuposto que ninguém
confere — justo o que decide se o `timeoutMs` daquela conexão entra na conta do
tempo de resposta.

Cada tipo de conexão passou a exibir o selo: *espera resposta* · *não espera* ·
*não declarado* — o terceiro em âmbar, porque ali a leitura pula a conexão e diz
que pulou (§248).

> **Editar ainda não dá, e o motivo fica escrito.** `espera` mora no
> `diagrama.json` **global**, e aquela aba edita campos **por time**. Um editor
> de config global no meio de um editor de campos de time são duas coisas
> diferentes no mesmo lugar — que é como se constrói a tela que ninguém entende.
> Enquanto isso, ao menos o pressuposto deixou de ser invisível.

405 engine · 699 web · 84 aplicação · 237 server · 129 llm · 89/89 E2E · build e
lint limpos.

## §293 — a IA não calcula, ela escolhe a pergunta

Pedido: *"tem como interagir usando IA? A intenção seria simular cenários de
lentidão, abrir algum lugar que não existe ainda e ver uma tabela com cenários,
tudo interativo, bonito e útil."*

A avaliação inteira gira numa distinção, e errá-la contaminaria a tela toda:

> **O cálculo não é da IA. A pauta é.**

"Se o bureau responder em 8 s em vez de 3 s, quanto demora a resposta?" é
aritmética sobre o grafo — trocar um número e recorrer `lerDesenho`. Já está
implementado, roda em microssegundos e **dá o mesmo resultado toda vez**. Pedir
isso a um modelo trocaria uma resposta exata por uma plausível, e ninguém
deveria decidir arquitetura com um número que muda entre execuções.

O que um modelo faz melhor que o motor é **saber que cenários merecem ensaio**:
"bureau degradado em pico", "cache frio depois do deploy", "timeout do cliente
menor que a soma dos internos". Conhecimento de mundo, não conta.

É a divisão que o produto já pratica: **`/ia/sugerir` propõe, o engine decide.**
A IA escreve a pauta; o motor roda o ensaio; a tabela mostra.

### A consequência que isso impõe à tela

**Ela funciona inteira sem IA.** Sem modelo configurado, a pessoa cria cenários
à mão e a tabela responde igual — a sugestão é um botão a mais, nunca o caminho
principal. É o §244 pelo avesso: capacidade que só existe com IA ligada é
capacidade que metade dos times não tem.

Daí a ordem das fatias não ser estilo: **B antes de D**. Entregar a IA primeiro
faria a tela nascer dependente dela, e a fatia B existe justamente para provar
que não é.

### Quatro decisões sobre a tabela

- **a linha de "hoje" fica ancorada no topo.** Sem a referência, todo número é
  solto;
- **"quem domina" é a coluna que ensina.** O total diz que dói; ela diz **onde**
  — e vem de graça, é o maior contribuinte que `somarTempo` já percorre;
- **o Δ é contra hoje**, nunca contra a linha anterior: comparar em cadeia faria
  a ordem das linhas mudar o significado dos números;
- **o `≥` sobrevive** (§248). Se o desenho não tem os timeouts, o cenário
  também não tem, e cenário nenhum inventa número que o desenho não deu.

### Rota própria, e a porta certa

`#/simulacao`, não uma aba do assistente: o assistente é onde se **conversa**
para produzir desenho, e aqui não se produz nada, se ensaia. Além disso a tabela
precisa de largura, e — o que mais importa — **rota é linkável**: *"olha o que
acontece se o bureau cair"* é uma URL que se manda para alguém, e isso é metade
do valor.

A porta de entrada é o chip da leitura: quem está lendo "≥ 3,0 s de resposta" é
exatamente quem quer perguntar "e se piorar?", e é o único momento em que a
pergunta ocorre sozinha.

### A guarda contra a prestatividade do modelo

O modelo devolve **ajustes, nunca tempos calculados**. Se mandar um número de
resposta, é ignorado — e isso está escrito no prompt e no parser, porque é
exatamente o tipo de coisa que um modelo faz por querer ajudar, e que corrói a
confiança na tabela inteira.

### O que ficou fora, escrito antes de alguém pedir

Throughput, fila, contenção e percentil. Todos exigiriam dados que o desenho não
tem, e produziriam número com cara de precisão e conteúdo de chute. Só soma de
tempo pelo caminho que espera.

Só a SPEC nesta rodada; nenhum código de produto mudou.

## §294 — o painel que crescia por acréscimo, e a bancada de ensaio

A SPEC-66 inteira (A→D), e antes dela uma correção no que a antecedeu.

### O painel tinha virado uma parede de texto

Pedido: *"revisitando a leitura em voz alta, deve ser simples de usar"*. Medi
antes de mexer: **146 palavras e 424px de conteúdo num popover de 320px** — ele
rolava, e "profundidade" e "terceiros" ficavam abaixo da dobra.

A causa não foi descuido: cada fatia acrescentou um bloco, e **cada bloco
repetia a explicação inteira em prosa**. "A resposta dele é a soma delas, e
qualquer uma que falhe derruba as outras" aparecia uma vez por nó.

A forma passou a ser uma só: **número em destaque, frase curta, consequência no
título**. Quem quer o porquê passa o mouse; quem quer o número o lê de relance.
Resultado medido: **33 palavras, 261px, sem rolagem**.

O chip encolheu junto: `≥ 3,0 s de resposta · 1 por preencher` virou
`resposta ≥ 3,0 s`. O `≥` **já é** o aviso de que a soma é piso, e dizê-lo
também em palavras dobrava o chip para repetir a mesma coisa.

> O usuário depois esclareceu que não tinha pedido enxugar — só que continuasse
> fácil de usar. Mantive porque a medição mostrava um defeito real de
> usabilidade (metade do painel abaixo da dobra), e disse isso em vez de
> apresentar como se tivesse sido pedido.

### A bancada: o cálculo é do motor, a pauta é da IA

`simularCenario` aplica ajustes sobre uma **cópia** e recorre `lerDesenho`. Três
decisões que o teste trava:

- **o cenário nunca escreve no desenho.** Um "e se" que altera o diagrama de
  verdade transformaria ensaio em mudança, e a pessoa perderia o original no
  primeiro clique;
- **multiplicar o que ninguém declarou não fabrica número.** Um fator sobre um
  campo vazio daria um valor inventado com cara de medida; o elemento segue sem
  valor, e a soma segue sendo piso;
- **ajuste que perdeu o alvo é declarado**, não engolido (§57): o desenho mudou
  depois do cenário, e a tabela diz quantos ficaram de fora da conta.

`quemDomina` saiu **de graça** — `somarTempo` já percorria os contribuintes.
Empate devolve os dois: escolher um seria inventar, que é a terceira resposta do
§248 num caso novo.

### A tabela, e por que o Δ é contra hoje

A linha de **hoje** fica ancorada no topo: sem a referência na mesma tabela,
"12 s" não diz nada a quem não sabe que hoje são 3 s. E o Δ compara sempre com
ela, **nunca com a linha de cima** — em cadeia, a ORDEM das linhas mudaria o
significado dos números.

O `≥` sobrevive ao cenário: ele não inventa número que o desenho não deu.

### A prova de que a tela não nasceu dependente da IA

O E2E percorre o ciclo inteiro — abrir pelo chip, criar cenário, arrastar o
fator, ver o Δ, salvar, F5 — **sem uma chamada de modelo**. Era o motivo de a
SPEC ordenar B antes de D, e agora está travado por teste em vez de por
intenção.

O modelo devolve **ajustes, nunca tempos**: o esquema JSON não tem campo para
resultado, e a regra também está escrita no prompt. Além disso o `tipo` (nó ou
conexão) vem do **desenho**, não da resposta — o modelo só devolve o id, e
ajuste com id desconhecido é descartado antes de virar linha.

### Dois achados do navegador

1. **o popover ficava flutuando sobre a tela nova.** A faixa de saúde vive nas
   duas telas, então "e se ficar lento? →" navegava e deixava o painel aberto
   por cima da simulação. Fecha antes de navegar;
2. **dois nós com fan-out, um testid só.** Depois do enxugamento cada fan-out
   virou uma linha própria, e o `data-testid="leitura-fanout"` passou a casar
   com duas coisas diferentes. Passou a carregar o nó.

415 engine · 711 web · 84 aplicação · 237 server · 129 llm · 91/91 E2E · build e
lint limpos.

## §295 — a convergência medida, e a dívida de uma palavra

Duas coisas do usuário na mesma mensagem: *"na SPEC-56 fizemos uma avaliação do
SimArch, acho que estamos chegando em um ponto de convergência, avalie"* e
*"você falou de 'em um clique' na resposta anterior, reavalie"*.

### A convergência, com números

A SPEC-56 §0.4 declarou oito passos. O estado real, cruzado com o código:

| # | Passo | Estado |
|---|---|---|
| 1 | P3 requisito + gap | ✅ SPEC-57 A |
| 2 | **P8 padrão sobre topologia e valor** | ⚠️ **quase** — faltava GRAU |
| 3 | P4 ADR | ✅ SPEC-57 C |
| 4 | P1 percurso | ✅ SPEC-57 E, SPEC-64 |
| 5 | P2 número com unidade | ✅ §241, §291 |
| 6 | P5 modo de operação | ❌ |
| 7 | P6 variante A vs B | ❌ |
| 8 | P7 dialeto de provedor | ⚠️ parcial |

**Cinco de oito fechados.** E a convergência não veio da lista — veio de a
cadeia da §0.1 (*propósito → decisão → padrão → item*) ter sido construída elo a
elo, cada um com sua SPEC.

Duas coisas que a SPEC-56 **não previu** e hoje são centrais: a **leitura do
desenho** (§291) — a §0.6 dizia "medir o desenho, não o runtime", e a leitura é
isso levado a sério, chegando a quem não configurou nada — e a **bancada de
ensaio** (§294), que é, sem eu ter percebido enquanto a escrevia, **metade do
P5**.

### A dívida tinha nome, e era uma checagem

A SPEC-65 §6.3 prometeu em texto: *"virar régua — abre o construtor
pré-preenchido; é a resposta à pergunta 'e daí?'"*. O §292 não entregou, e
escreveu o motivo: `limita-grau` não existia, e botão que abre formulário onde a
regra não cabe é pior que botão nenhum.

A decisão de não entregar botão morto estava certa. **O erro foi parar ali.** A
leitura sabia dizer "este serviço faz 3 chamadas que esperam" e o time não tinha
como transformar isso em régua — o fato ficava sendo fato para sempre.

> `exige-conexao` e `proibe-conexao` cobrem **presença e ausência**. Faltava a
> terceira forma que um padrão de topologia assume: **quantidade** — e é
> justamente a que a leitura mais produz.

### O campo que impede a régua de nascer errada

`apenasQueEsperam` não é detalhe de configuração:

> Um serviço que **publica em quatro filas** faz exatamente o que se recomenda.
> Um que **chama quatro serviços síncronos** antes de responder é o problema.
> **Os dois têm grau de saída 4.**

Uma régua de grau que não distingue os dois é o linter de grafo que a SPEC-63 §1
recusou. O campo é o que a mantém sendo *"o desenho contraria o padrão do
time?"*. E `=== true`, não "diferente de false": conexão de tipo sem `espera`
declarado fica **de fora** — contar o que não se sabe inflaria o grau e acusaria
por ignorância, que é o oposto do §248.

### O clique, e o que ele não é

- **`maximo` nasce em `atual - 1`.** A régua existe para cobrar o desenho que a
  motivou; nascer permitindo-o faria o primeiro uso parecer quebrado;
- **texto e porquê nascem prontos e editáveis.** A frase da leitura é um bom
  começo e não é a régua do time — quem publica assina, e assinar exige poder
  mudar;
- **nada é gravado pelo clique.** Ele abre o construtor; publicar segue sendo um
  segundo gesto, com o RBAC valendo. "Um clique" é sobre não reconstruir à mão o
  que o produto acabou de medir, não sobre pular a decisão;
- **a tela DIZ de onde a régua veio**, senão parece que o produto inventou uma
  régua sozinho.

E a leitura de **cadeia não oferece o verbo**: profundidade é sobre caminho, e
caminho já tem escopo próprio (`percursos[]`). O verbo aparece só onde leva a
algum lugar — o §244 aplicado campo a campo, e não à tela inteira. O E2E prova
os dois lados na mesma tela.

### Três achados

1. **o elo faltou no meio.** `onVirarRegua` ia do App ao `ReadinessSummary` e
   parava lá — o painel nunca o recebia. Os dois lados corretos, o meio vazio, e
   só o E2E acharia;
2. **`conexãoões`.** O template concatenava `conexão` + `ões` para o plural. Um
   teste de frase pegou; sem ele, a régua nasceria com erro de português na cara
   de quem lê;
3. **o `build` pegou o que o `typecheck` não pegou** — um tipo não importado no
   `ConfigScreen`. É o §"checar o que a CI checa" outra vez: os dois comandos
   não olham o mesmo conjunto de arquivos.

### O que ficou fora, e por que não é preguiça

**P5 (modo de operação).** A SPEC-56 §7 estimou *"custo quase zero — é `when`,
que o engine já avalia"*. **Medi, e não é**: `avaliarCondicao` é chamado por
`camposVisiveis`, e este por seis lugares (prontidão, especificação,
refinamento, revisão, painel, engine). Não é caro por ser difícil, é caro por
ser **transversal** — e trabalho transversal feito junto com trabalho novo é
como se erra nos dois.

**P6 (variante A vs B).** A própria SPEC-56 §8 aponta o risco: copiar a quebra e
editar faz as duas divergirem sem ninguém saber qual venceu. Fazer certo é uma
quebra com duas variantes, decisão registrada, modelo, servidor, tela e
migração. É uma SPEC inteira.

**P7 (dialeto de provedor).** A SPEC-56 §9 já o chamou de *"o que mais parece
impressionante numa demo e o que menos muda o item derivado"*. Segue valendo.

431 engine · 717 web · 84 aplicação · 237 server · 129 llm · 93/93 E2E · build e
lint limpos.

## §296 — o nome estreito fechava a porta, e a resiliência virou conta

O usuário esclareceu o que queria dizer com *"temos outros cenários ali"*: duas
linhas específicas da tabela §2 da SPEC-56 — **Engine** (circuit breaker,
timeout, retry, bulkhead, queue) e **Controles** (duração, taxa, ramp-up, taxa
de falha). Eu tinha avaliado a lista inteira; ele apontava duas linhas.

### O que medi

A SPEC-56 dizia *"existe como checklist, não como valor"*, e é literal:

```
Backend-chamadas http · "Definir timeout e política de retry"   [timeoutMs ≤ 500]
Backend-chamadas http · "Definir circuit breaker ou fallback"   (sem checagem)
Backend-mensagens     · "Definir estratégia de retry e DLQ"     [ttl ≥ backoff × retries]
```

Duas coisas saltam. **A mensageria já faz a conta** — o P2 funcionando desde o
§241. E **a chamada HTTP não tem os campos**: o checklist manda "definir política
de retry" e não existe onde escrever a política. Circuit breaker não é campo em
lugar nenhum.

> O padrão de resiliência da fila é conferível, e o da chamada síncrona — que é
> o caminho da resposta — é um lembrete de texto.

### A armadilha que eu quase construí

O caminho óbvio era inflar o pior caso: `timeout × tentativas`. Números maiores,
mais alarme. Mas a própria SPEC-56 §12.1.1 já tinha nomeado por que isso é ruim:

> *"A aritmética de pior caso tem um defeito que eu não nomeei: **ela grita
> lobo**… um alerta que aparece em todo caminho com mais de três nós é um
> alerta que as pessoas aprendem a ignorar."*

Multiplicar o pior caso por tentativas piora exatamente esse defeito.

**A pergunta certa é outra:**

> **Não é "quanto demora". É: o sistema desiste antes ou depois de quem
> chamou?**

Uma api que insiste por 1,5 s numa requisição que o cliente abandonou em 1 s
joga meio segundo de trabalho fora — garantidamente, e justo quando o sistema já
está em dificuldade, que é quando o retry dispara. Isso não é pior caso
improvável: é uma **contradição entre dois números declarados**. Ou existe no
desenho ou não existe, e quando existe está sempre errada.

Por isso a insistência ganhou **coluna própria** em vez de ser somada à
resposta: são duas perguntas, e ficam em duas colunas.

### A Lei de Little, e o único "Controle" que é aritmética

`concorrência = taxa × tempo de resposta`. Com `taxaEsperadaRps` e
`chamadasSimultaneas` declarados, "a 100 req/s com 300 ms, você precisa de 30; o
pool tem 10" é exato e se refaz no papel.

**Duração, ramp-up e taxa de falha ficaram fora**, e o motivo não é preguiça:
os três só produzem número através de amostragem, e dependem de distribuição que
o desenho não declara. A §0.3 e a §12.1 já os recusaram.

### O nome era o problema

> *"seria uma repaginação do 'e se ficar lento' — pense em algo que tenha outro
> nome, já que é mais genérico."*

A SPEC-66 acertou o mecanismo e **errou o escopo pelo nome**. Retry não é
lentidão, pico de tráfego não é lentidão, disjuntor desligado não é lentidão.

**Um nome estreito não é enfeite errado: ele fecha a porta para o que cabe
dentro.** Ninguém procura "e se ficar lento?" para perguntar "e se o pico for de
Black Friday?".

A tela virou **Ensaios** (`#/ensaios`), cada linha é um ensaio — uma condição
aplicada ao desenho —, e o ajuste passou a mexer em tempo, **taxa**,
**tentativas** e **disjuntor**. `#/simulacao` redireciona: rota que some sem
redirecionar dá tela branca para quem tinha o link salvo, e a SPEC-66 §5 apostou
justamente em o endereço ser mandável para alguém.

Uma tela por dimensão pareceria três telas e é a mesma pergunta com entradas
diferentes — e três tabelas obrigariam a pessoa a cruzar números na cabeça, que
é o que a mesa existe para não pedir.

## §297 — três testes que quebraram, e nenhum era sobre o que mediam

A suíte E2E acusou três coisas nesta rodada, e as três valem mais que a
correção.

**1. A contaminação que ACUMULA.** O `conformidade` grava uma régua no documento
global e restaura no `finally`. Se o restore falha uma vez — queda, timeout,
execução interrompida —, a régua fica lá, e a execução seguinte **a acrescenta
de novo**: duas violações onde o teste espera uma. O sintoma ("2 fora do
padrão") não aponta para a causa. A gravação virou idempotente (filtra pelo
texto antes de concatenar), e o resíduo foi limpo à mão.

**2. O restore que apaga o vizinho.** Meus dois specs de régua liam o documento
INTEIRO no começo e o devolviam no fim — apagando o que outro spec escreveu no
intervalo. O `conformidade` via a própria régua sumir no meio do teste dele.
**O sintoma aparecia no vizinho e a causa estava aqui**, que é a assinatura do
§281. Os dois passaram a devolver só o campo que mexem, relendo o documento na
hora.

**3. A janela de 800 caracteres.** O `ia-hospedada` procurava a marca do gateway
em `innerText().slice(0, 800)`. Dois campos novos na ficha do Serviço empurraram
a proposta para além do corte, e o teste passou a falhar por um motivo que não
tinha nada a ver com o que ele mede. O corte existia para a **mensagem de erro**
ser legível, não para limitar a busca.

> Os três são a mesma família: **teste que depende de estado ou de posição que
> ninguém prometeu**. Nenhum falhou por o produto estar errado — e nos três o
> lugar onde o erro apareceu não era o lugar onde ele estava.

448 engine · 721 web · 84 aplicação · 237 server · 129 llm · 95/95 E2E · build e
lint limpos.

## §298 — a única espera do sistema que não respirava

Relato com captura: *"aqui ao invés de só 3 pontos precisamos de algo animado,
que dê a sensação de construção que já temos em geral nas interações com IA no
sistema"*.

Antes de desenhar, fui ver que gramática o produto **já tem** para "a IA está
trabalhando" — inventar uma segunda seria o problema, não a solução:

| onde | como |
|---|---|
| antes do primeiro token | `●●●` com `pip-pulso` (`.pensando-ao-vivo`) |
| durante o streaming | caret piscando no fim do texto (`.texto-ao-vivo`) |
| quem está trabalhando | `✨ <papel> escrevendo…` |

O botão de sugerir ensaios dizia **"sugerindo…"** e mais nada. Era a única
espera do sistema que não respirava.

### Mas o botão não era o lugar principal

Aqui não há stream a mostrar: a resposta chega inteira. E o lugar onde ela vai
cair é uma **tabela**. Então a metáfora certa não é "pensando" — é **a linha
abrindo espaço e sendo preenchida**.

O botão ganhou a gramática de sempre (`✨ montando ●●●`), e a tabela ganhou
linhas-fantasma: células que nascem como barras respirando, e que o conteúdo
substitui.

### Três decisões finas

- **três linhas, não o número que vai chegar.** Ninguém sabe quantos cenários o
  modelo vai propor, e fingir saber seria a fantasma **afirmando** uma
  quantidade que ela não conhece;
- **o atraso é escalonado** (90 ms entre linhas, 60 ms entre células). Em
  uníssono, três linhas piscando leem como erro de render — o escalonamento é
  literalmente o que separa "construindo" de "piscando junto";
- **as larguras variam.** Barras do mesmo tamanho leem como barra de progresso;
  variadas, leem como conteúdo tomando forma.

E o convite de tabela vazia (*"nenhum cenário ainda…"*) **some** enquanto monta:
os dois juntos se contradizem — um diz que não há nada, o outro mostra algo
chegando.

`aria-hidden` nas fantasmas, porque elas não são conteúdo: um leitor de tela
anunciando três linhas vazias seria pior que silêncio.

> Medi o resultado com duas capturas separadas por 700 ms: as barras aparecem em
> brilhos diferentes nas duas, que é a prova de que a animação roda e de que ela
> **não está em uníssono**. Animação é coisa de olhar — o teste de unidade trava
> a causa (a classe, o atraso, o `aria-hidden`), e o olho confere o efeito.

448 engine · 725 web · 84 aplicação · 237 server · 129 llm · 95/95 E2E · build e
lint limpos.

## §299 — a correção que consertou, o extra que quebrou, e o buraco que apareceu

A rodada da animação (§298) levou quatro tentativas até fechar, e nenhuma delas
foi sobre a animação. Fica registrado porque o que apareceu no caminho é maior
que o que eu estava fazendo.

### O que eu quebrei

**1. O extra que custou caro.** A CI acusou o `da-leitura-a-regua`: a régua não
chegava ao servidor. A causa era o §281 outra vez — meus dois specs de régua
gravam em `regras.topologia`, e o `finally` de um restaurava a **lista** que leu
no começo, apagando o que o outro tinha acabado de gravar. Passou local por
sorte de timing.

A correção certa foi trocar a unidade de restauração: **por item, não por
campo** — relê o documento na hora e tira só o que aquele spec criou.

Mas eu fiz um extra: juntei os dois arquivos num `describe.serial`. Isso mudou o
escalonamento dos workers e **derrubou o `regras-por-componente`**, que vinha
passando havia quatro PRs. Desfiz a fusão, e a CI ficou verde — provando que
quem consertava era o restore por item.

> **O extra não era gratuito, e eu tratei como se fosse.** Numa PR cujo assunto
> era uma animação, mexer no arranjo dos arquivos de teste foi escopo que
> ninguém pediu e que custou duas execuções de CI.

**2. O ambiente.** Tentando limpar, derrubei o volume do banco E2E com o
servidor de pé. As duas execuções seguintes mentiram (23 falhas, depois
timeout do webServer), e gastei duas rodadas diagnosticando um problema que eu
mesmo tinha criado dois comandos antes.

### O buraco que apareceu, e que não é meu

**Cinco specs escrevem no MESMO documento global de regras** —
`abas-de-configuracao`, `conformidade`, `pdca-jornada`,
`regras-por-componente` e os de régua de forma — com **seis workers em
paralelo**.

É a classe do §281 remendada spec a spec desde então: cada vez que ela estoura,
conserta-se o spec que gritou. Nenhuma dessas correções tocou a causa, e por
isso a próxima mudança de escalonamento a traz de volta noutro lugar.

**A correção de raiz é isolar a config por time**, e o mecanismo já existe:
`PUT /config/:chave` aceita `timeId`, e a tela lê pelo time ativo. É uma rodada
própria — enfiá-la no fim de uma rodada de animação seria repetir exatamente o
erro do extra acima.

> A lição das duas metades desta entrada é a mesma, e ela é sobre disciplina de
> escopo: **quando o teste falha, corrija o que falhou.** A vontade de "já que
> estou aqui, arrumo isto também" foi o que quebrou o vizinho — e o que teria
> quebrado mais três se eu tivesse ido adiante com o isolamento por time.

448 engine · 725 web · 84 aplicação · 237 server · 129 llm · 95/95 E2E · build e
lint limpos.

## §300 — eles não sumiram; a câmera é que não os seguiu

Relato: *"peguei um cenário pronto qualquer, fui em 'e se ficar lento', voltei
em 'como funciona' e carreguei o cenário de aprovação de crédito — os
componentes apareceram, mas sumiram do nada do canvas em seguida"*.

### A primeira medição não reproduziu, e o motivo ensina

Refiz a sequência exata e contei `.react-flow__node`: **8 nós, sempre 8**. Nada
sumia. Tentei três variações (com ensaio criado, com a quebra salva, com os
dois) e todas passavam.

O erro era da régua, não do produto: **o DOM tem os nós mesmo quando a câmera
aponta para outro lugar.** Troquei a medida para geometria — quantos nós caem
dentro do retângulo visível do canvas — e o defeito apareceu na primeira
tentativa:

```
total=8  dentro=4   transform: translate(-120px, 67px) scale(2)
```

Metade do desenho fora da tela, com o zoom **2×** que era o enquadramento do
desenho anterior. Dois nós cabem com zoom 2; oito, não.

> "Sumiram do canvas" era literal, e eu quase o descartei como não-reproduzível
> por estar contando a coisa errada.

### E os Ensaios não tinham nada a ver

Medi as duas sequências lado a lado — passando pelos Ensaios e sem sair da mesa
— e o resultado foi **idêntico**. O defeito era trocar de desenho, e existia
desde antes desta rodada. O caminho do relato só foi por onde o usuário passou.

### A causa estava escrita, e era um comentário que mentia

O `adicionarCenario` diz: *"os **TRÊS** caminhos que inserem nós em lote pedem
enquadramento"*. Só **dois** pediam — adicionar à mesa e a proposta da IA.

**Trocar a demanda inteira (`aoAbrir`) ficou de fora** — e é o caso mais forte
de todos: o desenho não é uma adição ao que havia, é outro desenho. Herdar a
câmera do anterior não faz sentido em nenhuma leitura.

Vale para carregar cenário **e** para abrir uma quebra salva: os dois passam
por ali, e os dois herdavam o enquadramento de quem estava aberto antes.

### O teste tinha que falhar antes

Desliguei a correção e rodei o spec novo: `dentro: 4` em vez de `8`. Religuei:
`8`. Sem esse passo eu teria um teste que passa dos dois lados e não trava nada
— foi exatamente o que a primeira versão da minha medição fazia.

E o spec é E2E de propósito: **a régua é geométrica**, e JSDOM não posiciona
nada. Contar nós no DOM passaria com folga sobre o bug.

448 engine · 725 web · 84 aplicação · 237 server · 129 llm · 97/97 E2E · build e
lint limpos.

## §301 — o botão que não levava a lugar nenhum, e a inversão que o consertou

Pergunta do usuário: *"não ficou claro o que acontece quando se clica em
aceitar, recusar ou apagar. Qual é o valor do próximo passo nessa etapa da
jornada?"*

Fui ao código antes de responder, e a resposta era desconfortável: **`aceitar`
trocava um booleano e mais nada.** Fui procurar quem lia aquele campo —
ninguém. O ensaio aceito não virava item, não virava régua, não entrava no
documento, não era citado. "Aceitar" significava *"eu li isto e não é lixo"*.

Isso destoava de todo o resto do produto, onde aceitar tem consequência. E o
pior é que a decisão de recusar as saídas óbvias estava certa e escrita
(SPEC-66 §7: o produto não decide arquitetura pelo time) — mas **recusar uma
saída não é o mesmo que não precisar de nenhuma**, e foi isso que eu deixei
acontecer.

### O propósito que faltava veio do usuário

> *"o valor está em tornar visível e assim antecipar decisões e **débitos
> técnicos inconscientes**."*

Essa frase reordenou o desenho inteiro. O ensaio não existe para consertar nada:
existe para que ninguém descubra em produção o que dava para saber na mesa.

### A inversão

Eu tinha desenhado "só o ensaio aceito cobra". O usuário corrigiu em cinco
palavras — **"na realidade todo ensaio cobra"** — e ele estava certo pelo
próprio propósito: se só o que alguém aceitou cobra, **o débito que ninguém
olhou continua invisível**, que é exatamente o inconsciente a acabar.

Com a inversão, os três verbos ganharam sentido de uma vez:

| verbo | significa | efeito |
|---|---|---|
| *(existir)* | "este cenário é plausível" | **cobra** |
| **assumir** | "sabemos e assumimos" | sai do placar, vira registro com quem e por quê |
| **apagar** | "não nos interessa" | some |

> É o §242 outra vez: a válvula da exceção com motivo, aplicada a um número que
> ninguém tinha. Assumir não silencia — **converte** débito inconsciente em
> decisão registrada, e é essa conversão que dá nome à SPEC.

### O fluxo tinha que ser mapeado, não três botões

> *"o fluxo é avaliar, revisar, e aceitar ou modificar — mas precisa ser um
> processo muito bem mapeado."*

O ensaio ganhou **estado** (`por avaliar` → `em revisão` → `assumido`), e cada
um diz o que se espera de quem olha. Duas regras que o desenho impõe:

- **"em revisão" cobra igual a "por avaliar".** O que tira do placar é
  **assumir**, não olhar — sair da cobrança por ter aberto a linha seria a
  fórmula de fazer as pessoas abrirem tudo sem ler;
- **assumir exige motivo.** Sem ele isto vira um botão de silenciar, e quem
  abrir o documento depois não saberá se foi decisão ou cansaço.

E abrir a revisão **move o estado** — senão o mapa do fluxo seria decoração.

### O número do negócio é o que faz o número técnico decidir

> *"o negócio também exige um tempo."*

**"24 s" sozinho não decide nada. "24 s contra os 5 s que o negócio pede"
decide.** A `Necessidade` — que é o propósito do negócio na mesa — ganhou
`limiteMs`.

Ele não vai no percurso de propósito: o percurso já cobra tempo, mas aquilo é a
régua **do time** ("isto segue o padrão da casa?"), e esta é a exigência **do
negócio** para esta demanda ("isto entrega o que prometemos?"). Um desenho passa
numa e falha na outra. Com várias promessas, vale a mais apertada.

### Reduzir o esforço de avaliar

> *"expor um porquê mais descritivo que reduza o esforço cognitivo."*

A linha entregava números crus — `≥ 24 s`, `+21 s`, `bureau (24 s)` — e pedia
que a pessoa cruzasse quatro colunas para chegar à conclusão que o motor já
tinha. Agora a conclusão vem escrita, e os números viram a evidência dela.

Três regras, e a terceira é a que importa: **a frase é derivada, nunca escrita
pela IA.** O texto do modelo é a *circunstância do mundo* ("fins de semana
concentram 40% das solicitações"); a conclusão sobre a conta é aritmética. Misturar
as duas seria a IA opinando sobre o número.

461 engine · 732 web · 84 aplicação · 237 server · 129 llm · build e lint
limpos.

## §302 — o retângulo vazio era o painel espremido

Relato com captura: *"no canto direito consta um retângulo com uma barra de
rolagem, e não é possível visualizar nada dentro dele"*.

Medi com `elementsFromPoint` no canto onde ele aparecia, e a resposta veio
inteira: um `<aside>` de **320×32 px**, com `overflow: auto` e o texto
*"Selecione um nó para editar as propriedades"* — que não cabe em 32 px de
altura, daí a barra de rolagem sobre um retângulo aparentemente vazio.

Era o **painel de propriedades da mesa**.

### A causa: uma tela fora do padrão

A mesa (canvas + painel) fica montada o tempo todo e **não é condicionada à
rota** — as telas de rota a cobrem. `ConfigScreen`, `SistemaScreen` e
`DocumentoScreen` fazem isso com `position: fixed`, `inset: 0`, fundo e
`zIndex`.

A `EnsaiosScreen` nasceu no **fluxo normal**, e por isso não cobria a mesa:
**disputava espaço** com ela. Os dois eram `flex: 1`, e o painel ficou com 32 px
de altura.

> Era a única das quatro fora do padrão. O defeito não foi de cálculo nem de
> estado — foi de uma tela nova não ter herdado a convenção que as três
> anteriores já seguiam, e nada no código obrigava a isso.

### A régua tem que ser de OCLUSÃO

O `aside` continua no DOM e continua "visível" para o CSS — ele só está atrás.
`toBeVisible()` passaria dos dois lados e não travaria nada. O que prova o
conserto é perguntar **quem está no pixel**: no canto direito tem que estar a
tela de ensaios, não o painel da mesa.

É a mesma lição do §300, dois relatos seguidos: **defeito de layout não se mede
contando elementos.** Lá foram nós fora da vista com o DOM intacto; aqui, um
painel visível por trás de uma tela que devia cobri-lo.

E, como no §300, desliguei a correção para ver o teste falhar antes de dar por
feito — na primeira tentativa o desligamento não pegou e o "passou" não valia
nada.

461 engine · 732 web · 84 aplicação · 237 server · 129 llm · 98/98 E2E · build e
lint limpos.

## §303 — a régua era de todo mundo, e a limpeza da suíte não rodava havia seis migrações

Pela terceira vez em poucos PRs, a CI ficou vermelha num spec diferente a cada
rodada — `regras-por-componente`, depois `forma-do-desenho`, depois
`da-leitura-a-regua`. Nenhum deles tinha sido tocado. O §281 já tinha nomeado a
classe ("config global em suíte paralela é estado compartilhado") e o §299 já
tinha tentado o remédio óbvio: cada spec restaurando **só o item que criou**, em
vez do documento inteiro.

Não bastou. E a tentativa de melhorar aquilo derrubou um vizinho que vinha
passando havia quatro PRs.

### A medição: quem escreve no documento de regras

Seis specs. Seis workers em paralelo. Um documento.

O que mudou desta vez foi olhar para o **produto** em vez de para os testes. As
outras configurações — `campos-no`, `campos-aresta`, `ajustes`, `produtos`,
`especificacao-template`, `permissoes` — todas mandam `timeId`. O servidor
sempre resolveu config por time (`obter` faz time → global → template) e o `PUT
/config/:chave` sempre aceitou `timeId` no corpo.

`regras` era a **única** que não mandava.

> O defeito não era de teste. Dois times não conseguiam ter réguas diferentes, e
> nada na tela dizia isso. A suíte E2E foi só o lugar onde isso ficou impossível
> de ignorar — seis clientes concorrentes gravando no mesmo lugar é exatamente o
> que dois times fazem, só que devagar.

### A correção é uma linha, e é invisível

O cliente passou a mandar o `timeId` no GET (query) e no PUT (corpo), e as três
superfícies que leem/gravam regras passaram a informar o time ativo:
`loadConfig`, `RegrasTab` e o `ConfigurarPanel` do assistente.

Não muda um pixel. Some o parâmetro e tudo continua funcionando — compartilhado
de novo, calado. Por isso os testes novos afirmam a **URL** e o **corpo**, e não
o efeito na tela: é a única régua que uma refatoração desatenta não consegue
apagar sem ficar vermelha. Desliguei cada metade separadamente para ver as duas
falharem antes de dar por feito.

### O que apareceu no caminho

O `ConfigurarPanel` lia e gravava o documento **global**. Com a aba de Regras
lendo o do time, a régua aplicada pelo assistente iria para um lugar e a tela
mostraria outro: ela **some em silêncio** (§57), e a pessoa não tem como
descobrir para onde foi. Foi corrigido junto — e só apareceu porque a mudança
obrigou a olhar todos os chamadores.

### O que continua global, e por quê

O `pdca-jornada` não ganhou time próprio. Quem grava ali não é a tela: é o `POST
/ajustes/:id/aplicar`, que escreve com `timeId: GLOBAL` fixo, porque uma
solicitação de ajuste vale para a organização, não para um time.

Colocá-lo num time daria a **ilusão** de isolamento — a tela leria o documento do
time e o `aplicar` continuaria gravando no global. Um teste verde medindo a
linha errada é pior que um teste que assume o global (§248). Pelo mesmo motivo o
`PdcaTab` continua lendo o global: a prévia tem que ser sobre a base que vai ser
alterada.

E, sozinho no global, ele não disputa com ninguém.

### A diferença entre remendo e conserto

Os `finally` que restauravam o documento eram a única defesa, e defesa que
depende de o teste chegar ao fim falha exatamente quando mais importa — quando
o teste morre no meio. Onde o time é exclusivo do arquivo, o `finally` saiu:
não há o que restaurar. Onde três testes irmãos dividem o mesmo time
(`conformidade`), ele ficou, escopado no time.

> §299 tentou fazer o remendo caber melhor. §303 tirou o motivo de existir
> remendo. A separação não torna a colisão improvável — torna impossível.

### E aí a separação não funcionou — e o motivo era muito pior

Criei os times no `globalSetup`, rodei a suíte, e os **seis** specs falharam na
mesma linha: a tela de escolher time não tinha nenhum dos times novos.

O primeiro diagnóstico foi trivial: `usuario_time.time_id` tem chave estrangeira
para `times`, e eu tinha inserido o vínculo sem criar o time. Mas o `INSERT`
falhou com erro **23503**, e o `globalSetup` tem um `catch` que só tolera
**42P01**. Ele deveria ter estourado a suíte inteira. Não estourou.

Instrumentei o setup passo a passo. A primeira linha já morria:

```
A: truncate
CATCH code=42P01 igual42P01=true
```

`TRUNCATE TABLE "quebras", "perfis_time", "campos_no"` — e **`perfis_time` não
existe**. A migração **0020** a apagou (o perfil de stack virou catálogo, e o
0026 o transformou em `stacks`/`stack_valores`).

> Tabela apagada por migração devolve exatamente o mesmo 42P01 que tabela
> ainda-não-criada. O `catch` foi escrito para deixar passar "banco novo, sem
> tabelas" — e passou a deixar passar "código velho apontando para tabela
> morta".

**Desde a 0020, o `globalSetup` inteiro nunca rodou uma linha.** Nada de
`TRUNCATE` em `quebras` e `campos_no`, nada de limpar `credenciais_ia`, nada de
apagar os papéis do RBAC (§203) — nem a asserção escrita justamente para provar
que essa limpeza aconteceu. Cada rodada da suíte começava com o resíduo de todas
as anteriores. Encontrei seis stacks `stack e2e <timestamp>` de execuções
antigas ainda no banco.

Aquele `catch` tinha até um comentário dizendo que o `catch` vazio anterior tinha
causado esse mesmo estrago — *"a suíte reportava 18 falhas espalhadas em vez de
'o setup não rodou'"*. A correção da vez trocou "engolir tudo" por "engolir um
código", e o defeito voltou pela porta que ficou aberta.

### O conserto: perguntar, não adivinhar

"Banco novo?" agora é uma **pergunta**, feita antes de tudo:

```ts
const bancoNovo = await client
  .query(`SELECT to_regclass('public.quebras') AS t`)
  .then((r) => r.rows[0].t === null);
if (bancoNovo) return;
```

Respondida isso, **nenhum** erro é tolerado — o `catch` só relança. Um código de
erro nunca vai distinguir dois mundos que o código de erro não distingue.

E a criação dos times ganhou conta própria, porque `INSERT ... SELECT` que não
casa nada insere zero linhas **sem erro**: um segundo jeito de o setup mentir,
pela mesma família.

### O terceiro achado: um time de teste não é um time

Com o setup vivo, os times passaram a existir — e três specs levaram **403** no
primeiro `PUT`. O corpo do erro dizia `sem permissão para "editar" em
"regras.checklistTecnico"`, e a primeira suspeita (RBAC ligado por um vizinho)
morreu na medição: `papeis_acesso` estava vazia.

A causa estava em `primeiroRecursoNegado`:

```ts
const nivel = timeId ? await nivelNoTime(db, email, timeId) : await maiorNivel(db, email);
if (nivel === "owner") return undefined;
```

Com o `timeId`, o nível conferido é o **daquele time** — e a coluna
`usuario_time.nivel` tem default `operar`. Todos os times reais em que
`dev@gerador.local` entra são `owner` (quem cria um time vira dono); os meus
nasceram membros comuns.

> Passar a mandar o `timeId` mudou o EIXO da autorização, de "maior nível em
> qualquer time" para "nível naquele time". A correção do cliente estava certa;
> o time de teste é que era um cidadão de segunda classe.

E o 403 não dizia nada disso, porque a asserção só olhava o número. Agora ela
carrega o corpo: RBAC, nível de time e seção sem dono são três causas diferentes
com o mesmo 403, e escolher entre elas no escuro custou uma rodada.

### O que isso diz sobre as três rodadas anteriores

A instabilidade que o §281 e o §299 tentaram explicar tinha **duas** causas
sobrepostas: o documento de regras compartilhado (real, e agora resolvido) e um
banco de teste que nunca era limpo (invisível, e muito maior).

A segunda foi encontrada por acidente — só porque a primeira correção falhou de
um jeito que me obrigou a instrumentar o setup em vez de ler o código dele. Ler
não teria bastado: o código está certo na aparência, e o comentário dele
descreve com precisão o defeito que ele próprio tinha.

Para não dar por feito, quebrei o `TRUNCATE` de propósito (uma tabela
inventada) e conferi que o setup **estoura** em vez de seguir calado. Antes, a
mesma quebra passava despercebida por seis migrações.

### De quebra: o Salvar que ia para o produto errado

Com o setup vivo, uma rodada derrubou o `produto-contexto` — o editor mostrava
outro produto depois de criar um. Investigando o `ProdutosTab`, achei um defeito
real e independente: `recarregar` roda depois de **cada** ação, duas ações
seguidas põem duas releituras no ar, e nada garantia a ordem de chegada. A que
responde por último reinstala a lista e a seleção velhas.

O estrago é invisível, e é o pior tipo: `reconciliar` (§266) preserva o texto
digitado, então a tela continua mostrando o nome certo — mas o **alvo** trocou,
e o `Salvar` seguinte vai para outro produto com "salvo" verde na tela. É a
ferida que o §262 tratou no spec, agora pela raiz.

Uma guarda de "qual releitura é a vigente" resolve. E o teste que a cobre custou
três tentativas:

1. A primeira modelava uma corrida **inalcançável** (a tela nem renderiza
   enquanto a listagem da montagem está pendente).
2. A segunda passava com a guarda **desligada** — eu afirmava sobre o nome, que
   o `reconciliar` protege de qualquer jeito.
3. A terceira espera pela resposta atrasada (§250) e afirma sobre o **id** para
   onde o `Salvar` vai: `expected 'p0' to be 'p2'` com a guarda desligada.

> Duas versões verdes de um teste que não testava nada. O hábito de desligar a
> correção e olhar o vermelho é o que separou uma delas da outra.

Isto **não explica** a falha do `produto-contexto` — a causa daquela rodada
segue em aberto. O que a investigação achou foi outra coisa, e valia por si.

Também gastei uma rodada inteira de E2E editando o fonte com a suíte no ar: o
Vite recarregou um estado intermediário sem um `import`, o app caiu no
ErrorBoundary com "useRef is not defined" e o relatório acusou um spec de tour
que não tinha nada a ver. Medição feita sobre a bancada em movimento não mede
nada.

### O último detalhe: o id do time morava em dois lugares

`entrarEmTimeProprio(page, "forma")` recebia o sufixo, e o spec repetia
`"time-e2e-forma"` numa constante para as chamadas de API que faz por fora do
navegador. Duas cópias da mesma verdade, e §263 diz como isso termina: mudar o
prefixo num lado deixaria o outro apontando para um time que não existe — e o
teste ficaria verde lendo a linha errada, que é o pior desfecho possível para
uma rodada que existiu justamente por causa disso.

O helper passou a **devolver** o id. Nenhum spec de regras escreve
`time-e2e-` na mão.

### E o efeito colateral que quase passou: 6 times viraram 11

Pendurei os cinco times novos no `dev@gerador.local`, que já tinha seis. Onze —
e `ListaDeTimes` liga o campo de busca **acima de oito** (`LIMITE_SEM_BUSCA`).

A suíte continuava verde, e é justamente por isso que quase passou: a tela de
escolher time de **todos** os specs tinha mudado de forma, e o caminho que a
maioria das pessoas percorre — poucos times, lista direta, sem busca — deixou
de ser exercido por qualquer teste. Um dado de fixture mudando a UI que o resto
da suíte mede é uma perda de cobertura que nada acusa.

Um e-mail próprio para os times de regra devolve o `dev` aos seis dele e deixa
o novo com cinco: os dois abaixo do limite, os dois vendo a tela que a maioria
vê. E o setup agora apaga vínculos desses times feitos por qualquer outro
e-mail — sem isso, o resíduo local sobreviveria para sempre e a CI (banco novo)
passaria a testar outra coisa que a máquina de quem desenvolve.

> Duas rodadas verdes não provaram que estava certo. O que apareceu no diff foi
> um número cruzando um limiar que ninguém tinha motivo para olhar.

### A CI achou o que quatro rodadas locais não acharam

Local: 98/98, duas vezes. Na CI, o `pdca-jornada` caiu — o card ficava em
"aprovada" depois de clicar em **Aplicar agora**, sem mudar nada e sem dizer
nada.

O `POST /ajustes/:id/aplicar` lia a linha GLOBAL de `config_documentos` direto:

```ts
if (!doc) return reply.code(409).send({ erro: `documento de ${alvo} não encontrado` });
```

Mas *"não encontrado"* é o estado normal de **toda organização que ainda não
salvou config nenhuma**. O `GET /config/:chave` sempre respondeu com o template
nesse caso (`obter` resolve time → global → template); só o `aplicar` tratava a
ausência como erro.

Numa instalação nova, portanto, o PDCA inteiro era inalcançável: aprovar
funcionava, aplicar nunca — e a tela nem contava por quê (§244).

**Por que só apareceu agora.** Na suíte E2E, algum spec vizinho sempre gravava
o documento global antes deste rodar. Quando os cinco specs de regras foram
para times próprios, ninguém mais gravou o global — e a CI, com banco novo,
reproduziu a instalação nova de verdade. O banco local, cheio de resíduo de
anos, continuava escondendo.

> A mesma separação que resolveu a colisão tirou o andaime que escondia este
> defeito. Isolar não criou o problema: parou de disfarçá-lo.

O `templateDaVersao` era uma função interna da rota de config — saiu para um
módulo próprio, com um dono só, e o `aplicar` passou a partir dele quando não
há linha gravada, gravando com `upsert` em vez de `update`.

O teste que cobre isso é definido por uma **ausência**: ele não faz o
`PUT /config/regras` que todos os outros testes de aplicar fazem. Está escrito
lá em cima do caso, porque é o tipo de coisa que a próxima leitura "conserta"
por engano.

461 engine · 737 web · 84 aplicação · 238 server · 129 llm · 98/98 E2E · build e
lint limpos.

## §304 — o botão que agora leva a algum lugar (SPEC-69 D+E)

A pergunta que abriu a SPEC-69 foi do usuário: *"o que acontece quando se clica
em aceitar? qual é o valor do próximo passo?"* — e a resposta medida na época
foi **nenhum**. Um cenário aceito trocava um booleano, saía da opacidade
reduzida, e ninguém mais lia aquele campo.

As fatias A, B e C entregaram a máquina de estados, o prazo do negócio no motor
e a conclusão derivada. Faltavam D e E: a evidência viajando, e as superfícies.

### O que a leitura do código revelou antes de escrever qualquer linha

Duas coisas que as fatias anteriores deixaram pela metade, e que só apareceram
ao procurar por quem consumia o que elas produziram:

**`ensaioCobra` estava exportado e ninguém o chamava.** A inversão que dá nome à
SPEC — *"na realidade todo ensaio cobra"*, correção que veio do usuário — existia
como função pura e não chegava a lugar nenhum. Na prática, um ensaio que ninguém
olhou continuava invisível: exatamente o débito inconsciente que a SPEC existe
para acabar.

**`Necessidade.limiteMs` não tinha onde ser declarado.** O tipo existia, o
`prazoEstourado` existia, e nenhuma tela pedia o número. Sem ele, o §3 inteiro
("24 s contra os 5 s que o negócio pede") era inalcançável — e é ele que
transforma leitura em decisão.

> Fatia que entrega motor sem superfície parece pronta no diff e não existe para
> quem usa. As duas passaram porque a prova de cada fatia era unitária, e teste
> unitário não sente falta de um chamador.

### O que entrou

- **`Decisao.ensaioIds`** — o elo. Ids e não cópias: o número continua vivo na
  quebra, e uma cópia divergiria na primeira vez que alguém mexesse no desenho.
- **`ensaiosAssumidos`** — um dono só para a conta. A tela de Ensaios, o
  documento e o item leem a **mesma** frase; recalculá-la em cada lugar seria a
  segunda versão de uma verdade, e ela divergiria em silêncio.
- **A seção de riscos ganha um bloco derivado**, ao lado do texto humano e nunca
  dentro dele (§4.4). O markdown e a tela mostram o mesmo — o arquivo baixado e
  o que está na tela não podem discordar sobre o que se está aceitando correr.
- **`cobrancasDeEnsaio`** — o ensaio no placar ⚖, marcado com o nome. A marca
  não é enfeite: é o que impede o placar de confundir *o que é* com *o que
  seria*.
- **O campo do prazo do negócio**, junto da necessidade — e não no percurso, que
  é a régua do time. São duas perguntas: "isto segue o padrão da casa?" e "isto
  entrega o que prometemos ao cliente?".

### A decisão de desenho que tomei sozinho, e por quê

A SPEC diz que o ensaio aceito **pode** ser anexado a uma decisão, e aí viaja. Não
diz o que acontece com o assumido que ninguém anexou.

Escolhi: **todo ensaio assumido vai à seção de riscos**; o anexo à decisão é o
que adicionalmente o leva ao **item**. A alternativa — exigir o anexo para
qualquer visibilidade — devolveria o débito ao lugar de onde a SPEC o tirou:
visível só para quem abre a tela certa. E a dica da própria seção é literalmente
*"o que você está aceitando correr"*.

### O gesto de assumir NÃO aparece no placar, de propósito

O placar mostra a cobrança e leva à bancada; assumir acontece lá, junto do
número. Oferecer "aceitar de propósito…" na lista, longe da evidência, seria
convidar a silenciar sem ler — que é o §230 ao contrário.

### Três fixtures que eu inventei

`AjusteDeCenario.campo`, `Necessidade` sem `origem`, e três rótulos de tela que
não existiam. Os dois primeiros passaram no motor (o tsconfig dele não checa os
testes) e só quebraram no `tsc` do web; os rótulos só quebraram no navegador.

> Escrever teste a partir do que eu achava que a tela tinha, e não do que ela
> tem, custou três rodadas. O `grep` pelo rótulo antes de escrever a asserção é
> mais barato que o Playwright descobrindo.

478 engine · 750 web · 84 aplicação · 238 server · 129 llm · 99/99 E2E · build e
lint limpos.

## §305 — a guarda testava a coisa errada, e o nome fechava o escopo

Dois relatos numa mensagem só: *"ele não está validando se as informações estão
completas para navegar para a tela de ensaios"* e *"precisamos encontrar um nome
melhor para substituir o texto 'e se ficar lento?'"*.

### A medição, antes de escrever qualquer linha

Reproduzi contra a stack local, com um desenho **legível e sem número nenhum**:
carreguei o cenário de aprovação de crédito e apaguei todos os timeouts.

```
chip de leitura sem tempo nenhum? true
chip diz: ⏱ 3 saltos que esperam
porta diz: e se ficar lento? →   | desabilitada? false
→ levou a: /ensaios
aviso 'sem tempo'? false
linha de HOJE diz: hoje  ≥ 0 ms  —  —  —
linha do ensaio: Teste | por avaliar | A resposta fica em 0 ms.
```

A porta abriu, e a bancada mostrou **"≥ 0 ms"** com um ensaio concluindo *"a
resposta fica em 0 ms"*.

### A causa: a pergunta certa não era essa

A SPEC-66 escreveu uma guarda exatamente para isto — *"sem número declarado não
há o que ensaiar, e dizer isso é melhor do que uma tabela de zeros que parece
uma medição"* (§248). Ela perguntava:

```ts
const semTempo = hoje.tempoDoPiorTrecho === undefined;
```

Só que um desenho com conexões que **esperam** e nenhum número declarado devolve
`ms: 0`, e não `undefined`. **A guarda nunca disparou no caso que existe de
verdade** — só no desenho totalmente vazio, que é justamente o caso em que
ninguém vai à bancada.

> A pergunta certa não é *"o motor devolveu alguma coisa?"*, é **"há número para
> somar?"**. Uma guarda escrita contra a implementação e não contra o conceito
> passa no teste que a acompanha e falha na tela.

E o teste que ela tinha usava um diagrama vazio — verde, e medindo o caso que
não acontece.

### A validação subiu para a porta

O relato pede validação **antes de navegar**, e está certo: levar alguém a uma
tela que só sabe dizer "não há o que somar" é gastar a navegação para entregar a
mesma frase mais tarde.

No lugar do botão, a frase e o **endereço**: *"Nenhum componente tem o tempo
preenchido… Preencha em `bureau-credito-nacional`, `decisao-score → bureau`."* —
cada nome é um clique que abre o painel no campo. Dizer "falta preencher" sem
dizer onde transfere a busca para quem já não sabia o que procurar (§57).

Não é botão desabilitado com tooltip: tooltip não se lê no toque, e um botão
morto continua parecendo caminho.

`faltaParaEnsaiar` mora no motor, e a porta e a bancada chamam **a mesma
função**. A rota é linkável de propósito, então quem chega por URL ou pelo placar
recebe a frase idêntica — duas versões desta conta divergiriam na primeira
mudança (§263).

E a linha de "hoje" deixou de mostrar `≥ 0 ms` quando falta número: um zero logo
abaixo de um aviso dizendo *"zero não é uma medição"* seria o produto se
contradizendo na mesma tela.

### O nome

`e se ficar lento?` → **`ensaiar este desenho`**, na porta e no título da tela,
escolha do usuário entre quatro opções.

O §296 já tinha repaginado o título para "Ensaios — e se…?" pelo mesmo motivo (um
nome estreito fecha a porta para retry, pico de tráfego e disjuntor, que não são
lentidão) — **e a porta ficou para trás**. Duas superfícies da mesma coisa, uma
renomeada e outra não: é a assinatura de §263 aplicada a texto.

482 engine · 756 web · 84 aplicação · 238 server · 129 llm · 100/100 E2E · build
e lint limpos.

## §306 — o volume dito uma vez, e o épico que virou demanda (SPEC-70)

Dois pedidos numa mensagem, olhando o campo `pico de [—] req/s` dentro de um
ajuste de ensaio:

> *"talvez adicionar uma volumetria geral em algum lugar determinístico
> relacionado a demanda (hoje está descrito como épico, mas pode ser qualquer
> demanda, vamos renomear para demanda) — distribuir já de forma determinística
> para o motor, **assim o usuário não precisa preencher**."*

### O que custava

A Lei de Little (§3.3 da SPEC-68) é a única conta do produto que é aritmética
pura, e ela pedia a **taxa nó a nó**:

```ts
const taxa = numeroDe(no.spec?.[campos.taxa]);   // por nó
if (taxa === undefined) continue;                 // silêncio
```

Num desenho de oito componentes a conta só fechava se alguém digitasse oito
números — e, quase sempre, **o mesmo número**: o volume que entra pela porta da
frente, propagado adiante pelo próprio grafo.

> Pedir oito vezes o que se deduz uma vez é a definição de trabalho que a
> ferramenta deveria estar fazendo.

### A regra é dedução, não estimativa

Entrada recebe o volume; cada conexão que **espera** o leva adiante; quem é
chamado por dois caminhos soma. É o mesmo passeio que a `lerDesenho` faz, com
outro número na mochila — sem heurística, sem amostragem.

O que o motor **não** adivinha está escrito na SPEC: quantas vezes por
requisição uma chamada acontece. Um laço que consulta o bureau por item de uma
lista de 50 multiplica a taxa por 50, e isso não está no desenho. Sem
declaração, assume **uma** — e diz que assumiu.

**Declarado vence derivado**, e a frase diz de onde o número veio: quem mediu um
componente sabe mais que quem propagou da porta da frente, e apresentar o
derivado como declarado seria a ferramenta se atribuindo uma medição que ninguém
fez.

### A regra de "entrada" estava errada na primeira versão

Escrevi *"entrada é quem não recebe conexão síncrona"*, e o teste da conexão
assíncrona pegou: uma **fila** ligada só por `publishes` não recebe nada
síncrono, e virava porta da frente recebendo o volume inteiro da demanda. Nada
no desenho diz isso — o `publishes` diz o contrário.

A regra correta tem duas metades: **ninguém síncrono me chama E eu chamo
alguém**. A segunda metade não é detalhe; é ela que separa "começo de corrente"
de "estou fora da corrente".

### O pico deixou de ser por elemento

`fatorDeVolume` no ensaio: *"neste ensaio o volume da demanda é 10× o normal"*, e
ele chega a todos os nós de uma vez. O `taxaRps` por ajuste continua existindo, e
não é redundante — responde *"e se só ESTE componente receber uma rajada?"*, que
não é dedutível do volume da demanda. Duas perguntas, dois mecanismos; o rótulo
do campo passou a dizer isso ("só este a N req/s").

### O E2E me obrigou a medir em vez de supor

Escrevi o teste carregando o cenário de aprovação de crédito e esperando a
saturação aparecer. Não apareceu. Duas causas, as duas encontradas medindo:

1. **As contradições de resiliência não vão ao placar da mesa.** `avaliarResiliencia`
   só é chamada na bancada de ensaios. A SPEC-68 §4.1 diz que elas vão ao placar
   ⚖ — **não vão**. Ajustei a asserção para onde elas estão, em vez de mudar o
   produto de passagem; fica anotado como lacuna real.
2. **Nenhuma conexão daquele cenário declara `timeoutMs`**, e a Lei de Little
   soma o timeout das CONEXÕES que esperam. Sem esse número a conta não se faz,
   com ou sem volumetria.

O teste passou a montar um desenho mínimo à mão, com a conexão arrastada de
verdade e o timeout preenchido — e aí prova o que se propôs a provar: o volume
entra uma vez, e a saturação aparece **sem ninguém digitar taxa em componente
nenhum**.

### O rename

`📎 Contexto do épico` → `📎 Contexto da demanda`, em toda superfície. Não é
cosmético: um rótulo que nomeia o artefato de um processo específico diz a quem
usa outro processo que a ferramenta não é para ele.

O campo interno `contextoEpico` (contrato do `/ia/sugerir`) **ficou**: renomear
um campo de fio é migração, e não é o que este pedido é. A divergência está
anotada aqui de propósito.

499 engine · 760 web · 84 aplicação · 238 server · 129 llm · build e lint limpos.

## §307 — a promessa que a SPEC-68 fez e ninguém tinha cumprido

O §306 mediu de passagem, investigando outra coisa, e eu deixei anotado em vez
de consertar no meio do pedido: **as contradições de resiliência não chegavam ao
placar ⚖ da mesa.** `avaliarResiliencia` só era chamada na bancada de ensaios.

A SPEC-68 §4.1 é explícita:

> *Elas **não** são leitura (SPEC-65): leitura é fato, e isto é defeito — dois
> números declarados que não podem estar os dois certos. Por isso vão para o
> placar ⚖, **com o porquê e a válvula da exceção, como toda violação desde o
> §239**.*

Nada disso existia. A bancada é onde se pergunta *"e se"*; quem está
**desenhando** perguntava *"como está"* e não recebia resposta — a contradição
que o desenho de hoje já tem ficava numa tela que só se abre de propósito.

### A válvula custava uma chave nova

`ExcecaoDePadrao` tinha duas: `campo` (violação de valor, §239) e `regraId`
(violação de forma, §287). Nenhuma das duas serve a uma contradição de
resiliência:

- **não é campo** — ela nasce da RELAÇÃO entre dois (taxa × tempo contra o pool;
  insistência contra a paciência de quem chama);
- **não é regra do time** — ela é aritmética, e vale em qualquer casa.

O que a identifica é o par **elemento + tipo**, e é essa a terceira chave
(`contradicao`). Guardá-la por campo faria um "aceito" calar o que ninguém
olhou — e há teste para isso: aceitar a saturação de um nó não pode silenciar a
insistência do mesmo nó.

### A régua que isto guarda

> **A válvula tem que ser a mesma em toda cobrança.**

Se uma violação se aceita com motivo e outra só se ignora, a pessoa aprende que
o placar é decorativo em parte — e a partir daí ele é decorativo inteiro. É o
§230 dito ao contrário: não é bloquear cedo demais que ensina a ignorar a cor, é
oferecer saída para umas coisas e não para outras.

### O que isso diz sobre a SPEC como contrato

A SPEC-68 descreveu a superfície com precisão, e a implementação parou no motor.
Nada acusou: os testes da fatia cobriam a conta, e conta certa num lugar que
ninguém vê é exatamente o tipo de coisa que passa em teste unitário.

É a **terceira vez neste ciclo** (o §304 achou duas iguais: `ensaioCobra`
exportado sem chamador, `limiteMs` sem tela). O padrão tem nome agora: **fatia
que entrega motor sem superfície parece pronta no diff e não existe para quem
usa.**

502 engine · 764 web · 84 aplicação · 238 server · 129 llm · build e lint limpos.

## §308 — a aba cortada, e o rename que só piorou o que já estava quebrado

Relato com captura: *"aqui cortou parte do texto da configuração"*. A terceira
aba do assistente aparecia como **"⚙ Configura"**, sem o "r".

### A medição

Contra a stack local, antes de tocar em qualquer coisa:

```
janela: 420 px
fileira: largura 418 · conteúdo 471 · flexWrap: nowrap · overflowX: visible
abas: "✦ Desenhar conversando" 159 · "📎 Contexto da demanda" 159 · "⚙ Configurar" 92
```

**53 px a mais do que cabe**, com `nowrap` dentro de uma janela
`overflow: hidden`. A terceira aba não estava truncada por CSS — ela estava
**fora da moldura**, e a borda a cortava.

### O rename não causou; agravou

`Contexto do épico` → `Contexto da demanda` (§306) alargou o rótulo em ~7 px.
O corte precisava de 53. **Já estava quebrado antes** — o rename só empurrou um
pouco mais um botão que já vazava.

> É a segunda vez neste ciclo que mexer num rótulo revela um layout que já não
> cabia. Rótulo é a única parte da tela que muda de tamanho com o idioma, e um
> `nowrap` numa fileira de largura fixa é uma aposta de que ninguém vai
> traduzir, renomear ou acrescentar nada.

### Quebrar, e não encolher

Três saídas foram consideradas, e a escolha tem motivo:

- **encolher com reticências** — uma aba com "⚙ Config…" continua ilegível;
- **alargar a janela para 470** — número mágico que quebra de novo no próximo
  rótulo, ou na primeira tradução;
- **quebrar em duas linhas** — 26 px de uma janela de 620, e sobrevive a
  qualquer rótulo futuro.

A régua por trás: **aba invisível é caminho que não existe** (§244). Duas linhas
são o preço mais barato da lista.

O `minWidth: 0` na fileira não é enfeite — sem ele um filho flex não encolhe
abaixo do próprio conteúdo, e a quebra nunca aconteceria.

### A régua do teste é de GEOMETRIA, não de presença

O botão continua no DOM e continua "visível" para o CSS — ele só está fora da
moldura. `toBeVisible()` passaria dos dois lados, exatamente como no §302.

O que prova o conserto é a conta: **nenhuma aba pode terminar depois da borda
direita da janela**. Desliguei a quebra e vi o vermelho antes de dar por feito.

### E a suíte local não estava medindo nada

Três rodadas seguidas vermelhas, com falhas DIFERENTES a cada vez — sempre em
specs sem relação com a mudança, sempre com forma de timeout, e a suíte passando
de 2,9 para 6,7 minutos. `docker stats` respondeu em uma linha: um container
`infisical`, alheio a este projeto, consumindo **152% de CPU** continuamente.

Com ele parado: **102/102 em 3,7 min**.

Dois erros meus de método no caminho, e os dois valem mais que o conserto:

1. **Rodei sondas com Chromium e um rebuild de container em paralelo com a
   suíte.** É o §304 outra vez com outra roupa: lá eu editei o fonte com a
   bancada em movimento, aqui disputei a máquina. O efeito é o mesmo — a
   medição não mede.
2. **Matei uma suíte com `TaskStop` e não limpei o que ela subiu.** O
   `TaskStop` mata o processo pai; os três `webServer` (Vite 5190, servidor
   4100, gateway falso 4123) sobreviveram segurando as portas, e a rodada
   seguinte morreu no boot — **sem artefato de falha nenhum**, que é o pior
   diagnóstico possível.

E um terceiro, que atrasou os dois primeiros: `| tail -8` num comando cujo
motivo da falha está no MEIO da saída. Filtrar por `passed|failed|Error` custa
o mesmo e diz a verdade.

502 engine · 766 web · 84 aplicação · 238 server · 129 llm · 102/102 E2E · build
e lint limpos.

## §309 — o dublê saiu do teste e virou o padrão da casa (SPEC-74)

O pedido veio no meio de outra conversa: *"quanto ao budget que esgotou para
api, vc vai precisar montar mocks para que possamos seguir trabalhando sem
gastar tokens."*

### A medição desarmou a SPEC antes de ela começar

Quase nada precisava ser inventado. `packages/web/e2e/gatewayFalso.ts` já tinha
229 linhas cobrindo `/chat/completions` com SSE em pedaços,
`/audio/transcriptions`, 401 de credencial recusada e falha sob comando. E o
ponto de troca é **uma linha** — `provedorOpenAI.ts:352`, onde a URL nasce da
`baseUrl` da credencial. Apontá-la para outro endereço faz as dez rotas `/ia/*`
mudarem de destino sem uma linha de produto nova.

> O trabalho era de **empacotamento**, não de invenção. O que faltava era um
> utilitário de teste virar modo de desenvolvimento de primeira classe.

### Pacote próprio, e o motivo é uma fronteira que já existia

`packages/gateway-falso`, e não um subpath de `@gerador/llm`: o
`packages/server/Dockerfile` copia o `llm` inteiro para dentro da imagem, e um
dublê não pode ser dependência de produção. É a mesma fronteira que
`gateway.fronteira.test.ts` guarda contra o binário nativo, pelo mesmo motivo.

Ganho de passagem que não estava no plano: `packages/web/tsconfig.json` inclui
só `src`, então **`e2e/` nunca foi typechecado**. No pacote novo é.

### "Padrão" foi decisão do usuário, e não pode significar "sobrescreve"

A SPEC propunha `--profile sem-custo`; o usuário escolheu o contrário — sem
custo é o **padrão**, e modelo real se liga explicitamente. É coerente com a
medição: o `--profile ia` existe porque são 4,7 GB de modelo, e este é um
processo `node:http` sem uma dependência de runtime. Cobrar um passo extra para
ligar o barato faria exatamente o que a SPEC existe para evitar — alguém
esquecer e pagar.

Mas a credencial é da **organização inteira**. Um padrão que apontasse a tela
para o dublê por cima de um gateway já configurado trocaria o modelo de todo
mundo sem pedir. Então o default só existe no vazio: credencial salva vence
sempre, e há teste para as duas metades.

### O serviço NÃO publica a porta, e isto foi medido

A primeira versão publicava `4123:4123`, como o ollama e o whisper fazem. Com
ela de pé, a stack de trabalho passa a disputar a porta com o `webServer` do
Playwright — e a suíte E2E inteira morre no boot, sem artefato de falha nenhum.
É o modo de falha que o §308 custou três rodadas para diagnosticar, e que o
comentário de porta do `playwright.config.ts` já documentava para o servidor
(4100, e não 4000).

Quem alcança o dublê é o **container do servidor**, pelo nome na rede. Publicar
não servia a ninguém e derrubava a rede de segurança de todo o resto.

### Dois modos de resposta, porque são dois usos

`ia-hospedada.spec.ts:379` afirma `escrito-pelo-gateway-falso.*\(label\)` — a
suíte depende do texto **por caminho de campo**, e é assim que ela prova que o
campo certo recebeu o texto certo. Trocar isso por respostas curadas quebraria a
rede de segurança do repositório.

Então o modo `esqueleto` continua sendo o default, e o `plausivel` é ligado por
ambiente — pelo serviço do compose, nunca pelo Playwright. Não é inconsistência:
o teste precisa de texto que diga QUAL campo foi preenchido, e quem desenvolve
precisa de texto do tamanho de uma resposta de verdade, senão não dá para
avaliar quebra de linha, lista com muitos itens nem estado de espera.

O gerador plausível **passeia no schema recebido** em vez de guardar payloads
prontos, e a razão é dura: os esquemas são montados a partir da config do time —
os `enum` de tipo de nó e de id de componente mudam por instalação. Payload
gravado à mão ficaria inválido na primeira config diferente, e inválido aqui
significa retry do provedor e um teste lento sem motivo aparente.

### A trava que impede o dublê e os pedidos de divergirem

`respostas.test.ts` não inventa prompt: chama os oito `montarPedido*` de
verdade, manda o que eles produzem ao dublê, e valida a resposta com o mesmo
`validarContraSchema` que o provedor usa em produção. É o §263 resolvido por
teste, e não por acoplamento — o pacote continua sem uma dependência fora do
`node:http`; `@gerador/aplicacao` é devDependency.

### A marca viaja com o DADO, não com o modo

`origem: "sugerido"` já existia; o que faltava era dizer que nenhum modelo foi
consultado. A `EVIDENCIA_SIMULADA` vai na `evidencia` do próprio `ValorSpec`, e
não num sinalizador global de "o modo está ligado" — quem gerou no modo
simulado, trocou para um gateway de verdade e exportou uma semana depois
continua carregando um item cujo texto ninguém escreveu, e um estado de modo
lido na hora da exportação diria que está tudo bem.

Daí a `MARCA_SIMULADO` no documento, irmã da `MARCA_SUGERIDO` — e uma
consequência que precisou ser escolhida: **confirmar tira a marca de "sugerido"
e não tira a de "simulado"**. Quem confirmou assumiu o texto; o texto continua
não tendo vindo de modelo nenhum. Marca, e não impede a exportação (§230).

Na tela, `MarcaDeDemonstracao` com texto próprio — o componente do §235, sem
inventar nada, e no lugar que a régua dele manda: acima do que qualifica, não ao
lado de cada campo.

### Cinco coisas que só apareceram medindo

**1. O container respondia com a imagem velha, e eu quase reportei verde.**
Testei contra a stack real e o dublê devolveu o texto do esqueleto, em 27 ms,
com `plausivel` e 500 ms de latência configurados. A imagem tinha sido
construída antes da fatia C. Sem o rebuild, o relato teria sido "funciona" sobre
código que não estava rodando.

**2. Um teste meu não tinha dentes.** Escrevi que a ordem da tabela de
marcadores importava, e o teste que a guardava passava mesmo com a ordem
invertida: a desambiguação real vinha do ponto final de um dos prompts. Tirei a
pontuação dos marcadores (é a parte do texto que mais muda por revisão de
escrita) — aí a ordem passou a importar de verdade, e o teste a falhar quando
ela inverte.

**3. O endereço mais exercitado do repositório ficaria sem marca.** O preset
oferece `gateway-falso:4123` (o nome do serviço), mas a suíte E2E aponta para
`127.0.0.1:4123`. `ehSimulado` não reconhecia, então o destino simulado mais
usado da casa era justamente o que não recebia a marca. Os endereços
alternativos passaram a viajar **dentro do preset**, para a tela aplicar a mesma
régua do servidor em vez de manter uma segunda cópia da lista.

**4. Um vazamento antigo, destapado por acaso.** Acrescentar seis testes num
arquivo deixou a suíte web vermelha em outro: um `setTimeout` do `JourneyModal`
chamava `setState` depois do teardown. O vazamento já existia — mudar a ordem de
execução só encontrou a janela em que ele dói. Corrigido com `clearTimeout` na
desmontagem.

**5. O `npm install` do Dockerfile procurava os workspaces no registro.** As
devDependencies do pacote novo incluem `@gerador/aplicacao` (só para o teste), e
um install dentro do pacote, sem a raiz do monorepo, morre em 404. Instalar o
compilador em `/repo` — ancestral do pacote — resolve dois problemas de uma vez;
`-g` resolveria o `tsc` e não o `@types/node`.

### E o E2E que fecha o laço achou um defeito de proveniência mais antigo

O usuário perguntou por que eu não podia gravar a credencial simulada e apagar
depois. A resposta certa não era "não posso": era que essa conferência **devia
morar num teste**, e não numa checagem manual contra o banco de trabalho. Duas
travas nasceram daí — uma em `app.test.ts` (credencial simulada gravada faz o
`/ia/status` dizer `simulado: true`, com o controle negativo do destino de
verdade) e uma no E2E, que baixa o markdown e afirma o par: **contém a marca de
simulado e não contém a de sugerido**, depois de confirmar todos os campos.

A do E2E ficou vermelha. E não por causa da SPEC-74.

A sonda mostrou o documento inteiro com o texto da esteira, todo confirmado, e
sem marca nenhuma — enquanto outra sonda, dentro do hook, provava que a
evidência era gravada. O valor era perdido **entre a escrita e o documento**, e
o culpado é uma linha em `ReviewScreen`:

```ts
onResponder?.(p.chave, { valor, origem: "manual" });
```

O botão "Confirmar" de cada campo **montava um `ValorSpec` novo do zero**.
Confirmar um texto que a esteira escreveu, sem tocar nele, passava a afirmar
que uma pessoa o escreveu — e junto iam a evidência, a confiança e o carimbo de
insumos do §292.

O mais revelador é que a régua certa já existia a dois arquivos de distância:
`FilaDeRevisao` decide exatamente isto — *editou vira manual, não editou vira a
mesma resposta, confirmada* —, e `confirmarTodas` usa `assinarSugestao`, que
preserva. **Três superfícies confirmam a mesma coisa; duas preservavam e uma
apagava.** É a assinatura do §263, e aqui ela custava um fato falso sobre quem
escreveu o item.

> E o teste que cobria essa linha era **cúmplice**: ele afirmava
> `origem: "manual"` para uma resposta que a esteira tinha escrito. Nasceu para
> provar outra coisa (que confirmar sem digitar não é no-op) e, de passagem,
> fixou o defeito como comportamento esperado. É o mesmo padrão que este
> arquivo já registra sobre o passo de reescolher time: *contornar um defeito
> conhecido dentro do teste transforma a suíte em cúmplice dele.*

Duas corridas no caminho, as duas do mesmo tipo e as duas achadas pelo E2E:
`setIaSimulada` e `esteira.iniciar` acontecem no mesmo `.then`, então o ref
ainda tinha o valor velho quando a esteira gravava. O arquivo já resolvia isso
para os papéis — passando o valor resolvido explicitamente ao `iniciar` — e
agora o `simulado` viaja pelo mesmo caminho.

### Um aviso para a próxima rodada, encontrado de passagem

Ao investigar isto, li a linha da quebra no banco do E2E:

```
titulo: Esteira com gateway falso | respostas_itens: {}
```

O documento na tela tinha todas as respostas da esteira; **o banco não tinha
nenhuma.** É a SPEC-71 aparecendo antes da hora, e num campo que nem estava na
lista dela. Não investiguei mais do que isto aqui — vira medição da rodada
seguinte, e não afirmação desta.

### Onde cada coisa foi verificada

A stack real cobriu o caminho inteiro (tela → servidor → provedor → serviço do
compose → SSE → volta) via `POST /ia/credencial/testar`, que aceita a credencial
no corpo e **não persiste** — importante aqui, porque gravar a credencial
simulada por cima da que está no banco de trabalho destruiria uma chave que não
volta por HTTP. O modo com a credencial *gravada* é coberto por teste, que é
onde ele devia estar: `app.test.ts` no banco descartável, e o E2E, que grava a
credencial do dublê de verdade e confere as marcas na tela e no markdown
baixado. Toda asserção nova foi vista falhando com a correção desligada.

505 engine · 133 llm · 84 aplicação · 776 web · 240 server · 39 gateway-falso ·
102/102 E2E · build e lint limpos.

## §310 — o que se salva volta, e a classe do defeito morreu junto (SPEC-71)

O pedido do usuário, antes de abrir uma conversa nova: *"precisamos avaliar se
existem testes a fim de garantir que todas informações salvas sejam
recuperadas."*

### A medição, contra o servidor real, antes de uma linha de código

Uma quebra com todo campo do tipo preenchido, gravada e lida de volta:

```
PERDEU  volumetria
PERDEU  cenariosDeLentidao (inteiro)
PERDEU  leiturasDispensadas
PERDEU  necessidades[].limiteMs
PERDEU  decisoes[].ensaioIds
PERDEU  excecoes[].contradicao
POST 400  anexosContexto  ("Expected string, received object")
```

**Seis perdas silenciosas, e uma ruidosa.** A SPEC listava quatro; o mapeamento
achou mais duas, e a sétima linha respondeu por evidência uma pergunta que a
SPEC §4 tinha deixado em aberto ("não medi").

> **Demanda com anexo não salvava nada.** Nem o anexo, nem o diagrama, nem o
> resto. `z.array(z.string())` recebendo objeto não descarta em silêncio: falha,
> e a rota devolve 400. O modelo diz `{ nome, conteudo }[]` desde sempre; a
> coluna e o Zod diziam `string[]`. A conversão existia num lugar só — na
> LEITURA (`usePersistencia`), que inventava `anexo-N.txt` —, e a escrita nunca
> teve par.

### O Zod não ficou para trás sozinho

`types.ts` guardava uma segunda definição do ensaio, `CenarioDeLentidaoGuardado`,
congelada na forma da SPEC-66. A UI escrevia a forma viva (`CenarioDeLentidao`,
em `leitura/simularLentidao.ts`), com `estado`, `debito`, `fatorDeVolume` e as
condições da SPEC-68. O Zod da borda foi escrito contra a cópia — e ficou **em
sincronia com um tipo que ficou para trás**.

Por isso a correção não foi "atualizar o Zod": os quatro tipos do ensaio mudaram
de casa para `model/types.ts`, e a cópia morreu. **O que é persistido é do
modelo**; `simularLentidao` reexporta, para quem já importava de lá não precisar
saber que a fronteira mudou.

### Cinco funis, e o quinto é o que tornava a correção do servidor insuficiente

A SPEC descreve três causas. São cinco lugares, em série:

| # | Onde | O que morria |
|---|---|---|
| 1 | Zod da borda | quatro campos, por chave desconhecida descartada em silêncio |
| 2 | Tipo da porta | três campos nem existiam em `QuebraSalva` |
| 3 | Normalizador (lista fechada de 13 campos) | o que passou pelo Zod e não estava na lista |
| 4 | Colunas | não havia onde escrever |
| 5 | **`usePersistencia.abrirPorId`** | reidratação campo a campo, sem os três |

O quinto é o que faria a correção do servidor não bastar: com Zod e colunas
certos, reabrir continuaria descartando — e o autosave de 2 s gravaria o vazio
por cima do que estava salvo. O bloco de comentário naquele arquivo é
literalmente o aviso de que isso ia se repetir. Repetiu.

### A trava: aviso não bastou três vezes, agora falha

`repositorioDeQuebras.ts` já repetia a lição três vezes, uma por SPEC. A
migração 0011 avisa na própria tabela. Não bastou.

`routes/quebras.borda.test.ts` troca a lembrança por uma falha, e precisa de
duas metades porque `keyof Quebra` não existe em runtime e o Zod não existe em
tempo de compilação:

1. **o compilador** obriga um inventário a cobrir `keyof Quebra` — campo novo
   sem entrada é erro de build;
2. **o teste** confronta esse inventário com `corpoQuebra.shape`.

Uma sem a outra não pega nada. E o que ela **não** pega — campo aninhado, como
`ajustes[].taxaRps` — é coberto pelo round-trip por igualdade estrutural em
`app.test.ts`, que compara o objeto inteiro. Dois testes porque são duas
perguntas.

> **A metade do compilador era decorativa, e isso teve que ser consertado
> junto.** Nada rodava `tsc` sobre `packages/server`: o `build` é `tsup`, que
> não typecheca. É o achado do §286 sobre a CLI, um pacote depois. O pacote
> ganhou `typecheck`, e no caminho quatro erros de tipo antigos foram corrigidos
> — um deles real: `contratoDoClienteWeb` chamava `apiQuebras.listar("time")`
> com um argumento que a assinatura não tem, afirmando um filtro que não existe.

### O E2E da fatia D mentia em QUATRO camadas

O teste dizia *"o ensaio é do time, não da sessão"*. Cada camada era verde:

1. **`goto("/#/ensaios")` é same-document.** Difere da URL atual só no
   fragmento: não recarrega nada, e a asserção lia o estado em memória. A
   armadilha já estava documentada num spec vizinho.
2. **A demanda nunca era salva.** O cenário de demonstração vem sem título, e
   salvar sem título abre a pergunta do nome. O teste conferia
   `getByText(/salv/i)` — que casa com *"dê um título antes de salvar"* tão bem
   quanto com *"salvo"*.
3. **E não poderia ser salva.** O cenário pronto é do `time-credito`, e o
   usuário do E2E não tem `operar` nele: o POST volta **403**.
4. E, embaixo de tudo, **o ensaio inteiro sumia no banco** — o defeito que o
   teste existia para pegar.

Descascar isso levou o F5 para um teste próprio, com a demanda montada à mão no
time de quem está logado. Ele assume um débito com motivo, confere **no
servidor** que o ensaio chegou inteiro (estado, débito e o fator do ajuste),
recarrega de verdade, reabre pelo menu — e o débito continua assumido, com autor
e motivo.

> Uma âncora antes de salvar evitou o diagnóstico errado: sem ela, um vermelho
> depois do F5 não distingue "a persistência perdeu" de "o gesto nunca valeu".
> Foi ela que mostrou que o meu primeiro desenho do teste estava errado — o
> controle de fator não existe num ensaio já assumido, porque a linha fica em
> modo de leitura.

### O que ficou anotado para a rodada seguinte

O banco do E2E mostrou uma quebra com `respostas_itens: {}` enquanto a tela
tinha todas as respostas da esteira. Não investiguei aqui: vira medição da
SPEC-72, e não afirmação desta.

505 engine · 133 llm · 84 aplicação · 776 web · 245 server · 39 gateway-falso ·
103/103 E2E · build, typecheck e lint limpos.

## §311 — toda lacuna que o documento entrega virou contável (SPEC-73)

O relato: *"o documento que estamos gerando parece ok, exceto por alguns pontos:
parece que gera algumas coisas como placeholder no markdown, exemplo:
`Como <papel>, quero <ação> para que <benefício — detalhar>`. Preciso de
validação completa disso."*

### A palavra que definiu a rodada foi "completa"

Corrigir os dois casos conhecidos não é validação completa: é preciso provar que
não há um terceiro, e a prova tem que envelhecer bem. Por isso a fatia A não é
uma correção — é um **varredor** que procura a forma `<algo>` no documento
gerado e falha com o que encontrar, hoje e daqui a três SPECs. Ele nasceu
vermelho, apontando exatamente as duas famílias medidas, com linha e endereço:

```
linha  7: <papel>              —  Como <papel>, quero <ação> para que <benefício — detalhar>.
linha  7: <ação>
linha  7: <benefício — detalhar>
linha 35: <contexto>           —  Dado <contexto>
linha 36: <ação>               —  Quando <ação>
linha 37: <resultado esperado> —  Então <resultado esperado>
```

### A régua do varredor custou três decisões, e a primeira contraria o instinto

**Bloco de código NÃO é exceção.** O instinto é ignorar ```` ``` ```` — `<T>` num
exemplo de código não é lacuna. Só que o Gherkin genérico, um dos dois casos que
a SPEC mediu, sai justamente dentro de um bloco ```` ```gherkin ````. Uma régua
que pula bloco de código passaria ao largo de metade do defeito que ela existe
para pegar.

**O marcador vale para o PARÁGRAFO, não para a linha.** `<- ✍️ especificar`
dentro de um bloco gherkin quebra a sintaxe para quem colar o trecho numa
ferramenta de BDD. Então a vizinhança é o trecho entre linhas em branco, e o
marcador pode vir depois do bloco.

**O `<` tem que estar solto na frase.** `Map<string, Endpoint>` é genérico e se
reconhece pelo `<` colado a uma palavra; `` `<div>` `` é citação; `<https://…>`
tem `:` e `/`. O que o motor escreve é português, e vem depois de um espaço.
Sem esse recorte a régua vira ruído — e régua ruidosa morre.

### A visão geral era uma string do motor, e a lacuna era invisível DUAS vezes

O comentário que a produzia acertava o diagnóstico — *"papel e benefício não são
inferíveis a partir do modelo"* — e errava a conclusão. O que não é dedutível
não vira texto do motor: vira campo de quem sabe.

E havia um segundo achado, que o mapeamento pegou: **a Visão geral nem aparecia
na tela do documento.** Ela era uma variável de topo que só existia no markdown
baixado e no que a aprovação carimbava. Ninguém a contava e ninguém a via.

Agora ela é `SecaoEscrita`, como Trade-offs e Riscos — o mecanismo que a SPEC-58
criou e que já sobrevive à regeneração. O esqueleto não morreu: virou a **dica**
do editor. No lugar certo ele diz o formato esperado; no lugar errado, se passava
por resposta. Vazia, a seção inteira sai do documento pelo mesmo
`removerSecaoDaVariavel` que já cuida das outras três — e é isso que faz
*"documento sem visão geral escrita não contém `<papel>`"* ser verdade por
construção, e não por asserção.

> A SPEC recusou em voz alta as duas saídas fáceis, e as duas continuam
> recusadas: **fazer a IA preencher** (papel e benefício são conhecimento de
> negócio, e um modelo os inventaria de forma plausível — o pior resultado
> possível num texto que alguém vai aprovar) e **remover a seção** (ela tem
> valor; o que não tinha é o esqueleto entregue como conteúdo).

### O Gherkin genérico era o único que chegava ao tracker

Ele fica — dá a forma a quem nunca escreveu Gherkin. O que não podia continuar é
sair idêntico a um cenário de verdade.

E ele era o mais caro dos quatro casos, por um motivo que só apareceu ao seguir a
exportação: **a exportação só manda itens com `pendencias === 0`**, e a contagem
é por marcador. Sem marcador, ele não contava como nada — e viajava para o card
de alguém como se o time o tivesse escrito. O `<papel>`, por ser variável de
topo, nunca chegou lá; este chegava sempre.

### A aprovação passou a dizer o número, e a mesma conta serve os dois níveis

`contar` era privada e só via o corpo do ITEM. O documento de topo nunca passava
por ela — e é por isso que a visão geral era invisível para a contagem. Agora ela
é exportada e serve os dois níveis: duas contas divergiriam na primeira mudança
(§263).

O número fica ao lado do selo, e **não bloqueia** (§230). Um documento com três
lacunas declaradas pode ser aprovado de propósito; o produto inteiro é construído
sobre essa distinção. O que não pode é a lacuna ser invisível — e há teste para
as duas metades: o número aparece, e aprovar continua a um clique.

513 engine · 133 llm · 84 aplicação · 780 web · 245 server · 39 gateway-falso ·
103/103 E2E · build, typecheck e lint limpos.

## §312 — o custo de salvar, e o teto que já existia sem ninguém saber (SPEC-72)

O pedido: *"o sistema salva muitas informações, eventualmente grandes, como o
contexto da demanda, portanto avaliar se as estratégias de salvamento estão
corretas ou faltam otimizações."*

### A rodada começou recusando o que foi pedido

Remedido contra o banco de trabalho, agora:

```
pg_total_relation_size('quebras') .... 848 kB
quebras ............................. 27
maior demand_info ................... 1 692 caracteres
maior diagrama (pg_column_size) ..... 3 629 bytes
maior anexos_contexto ...............    59 bytes
```

Vinte e sete quebras ocupam **848 kB**. Otimizar isto seria trabalho contra um
número que não dói, e a SPEC já tinha recusado a família inteira: salvamento
incremental por campo, compressão, paginação de anexos, tabela separada para o
contexto, reduzir o debounce. Nada disso entrou.

> O número novo é o último: **o maior anexo do banco tem 59 bytes.** Praticamente
> ninguém nunca conseguiu salvar um — o que é exatamente o defeito que a
> SPEC-71 corrigiu na rodada anterior (a borda recusava a FORMA com 400). A
> "bomba de tamanho" que a SPEC-72 §2.3 apontou nunca chegou a poder explodir.

### O teto já existia, e era o pior possível

O teste da fatia A nasceu vermelho — mas com **413**, não com o 400 que eu
esperava.

O `bodyLimit` default do Fastify é **1 MB**, e ele responde sem uma palavra.
Ou seja: o produto já recusava anexo grande, num limite que ninguém declarou,
com exatamente a mensagem que a SPEC §3.1 recusa em voz alta — *"recusados na
borda com a frase que diz o número, não um 413 seco"*.

Ninguém tinha percebido porque **anexo nenhum salvava**: a borda rejeitava a
forma antes de o tamanho importar. Corrigida a forma na rodada anterior, o
limite mudo apareceu.

O `bodyLimit` subiu para 8 MB — acima do teto declarado, de propósito: quem
recusa tem que ser a regra que sabe explicar, não a que só sabe cortar. E o
`toBe(400)` do teste é o que impede a volta: baixar o limite do Fastify para
debaixo do teto declarado faz a resposta virar 413 de novo, e o teste cai.

A frase diz o arquivo, o tamanho, o limite e a saída:

> *O anexo "ata-gigante.md" tem 1,5 MB e o limite por anexo é 1,0 MB. Anexe só a
> parte que importa, ou cole o trecho no contexto da demanda.*

### O flush ao sair era greenfield, e o timer estava preso

`beforeunload`, `visibilitychange` e `pagehide` tinham **zero ocorrências** em
todo o `packages/web`. Fechar a aba com o timer armado perdia os últimos 2 s de
trabalho, sem aviso — e o campo mais afetado é justamente o que o pedido citou:
o contexto da demanda, digitado em prosa longa.

O obstáculo era estrutural: o timer vivia **dentro** do efeito, então não havia
o que disparar de fora. Dois refs resolvem — o relógio, para saber se há algo
pendente, e a quebra do momento, porque o listener é registrado uma vez e não
pode ficar preso à renderização em que nasceu.

Os **dois** eventos, com a mesma função (§6.2): `beforeunload` é menos confiável
em móvel, `visibilitychange` cobre o descarte que vem depois. E uma guarda que
custa uma linha e evita um defeito novo: só grava quando a aba fica `hidden` —
voltar do alt-tab dispara `visibilitychange` também, e salvar ali transformaria
troca de janela em escrita, que é a frequência que o debounce existe para evitar.

### O carimbo passou a dizer a verdade

Toda gravação carimbava `atualizadoEm`. Com o autosave mandando a quebra inteira
a cada 2 s, "quando esta demanda mudou pela última vez" respondia *"quando
alguém arrastou um nó"* — e é sobre esse carimbo que a SPEC-58 §5 constrói o
"documento desatualizado" e que a tela de Abrir… ordena a lista.

A SPEC deixou a escolha em aberto entre *o autosave para de reenviar o que não
mudou* e *o carimbo passa a distinguir*. **A segunda**, e o motivo é o §4 da
própria SPEC: ensinar o autosave a mandar só o diferente é o começo do
salvamento incremental que ela recusa, e criaria a classe de defeito em que
metade da quebra é de uma versão e metade de outra.

A comparação é por JSON, e não campo a campo — campo novo entra na conta
sozinho, e uma segunda lista de campos a manter em dia é exatamente o que a
SPEC-71 acabou de provar que não se mantém. Com uma sutileza que só apareceu ao
rodar: `jsonb` volta do Postgres com as chaves noutra ordem, então comparar o
texto cru daria "mudou" sempre.

De passagem, o mesmo raciocínio consertou o vizinho: `especificacaoGeradaEm` era
recarimbado a cada autosave que tivesse especificação, fazendo "gerada em"
responder pela última tecla digitada em qualquer campo.

513 engine · 133 llm · 84 aplicação · 784 web · 250 server · 39 gateway-falso ·
103/103 E2E · build, typecheck e lint limpos.

## §313 — o volume que é do produto, e a régua citada estava no § errado (SPEC-77)

O pedido veio dentro do da página de apresentação, com instrução de virar SPEC
própria: *"requisitos de volumetria (e também seria importante adicionar para
produto, pois também deveria fazer parte do PDCA)"*.

### A régua que a SPEC cita não é a que ela queria

A SPEC-77 §2 diz que a herança segue "a mesma régua do §303". O §303 é sobre
`timeId` nas regras de config — dois times não conseguiam ter réguas diferentes.
Régua parecida, assunto diferente.

A régua literal é do **§306**: *"declarado vence derivado, e a frase diz de onde
o número veio: quem mediu um componente sabe mais que quem propagou da porta da
frente, e apresentar o derivado como declarado seria a ferramenta se atribuindo
uma medição que ninguém fez."*

E ela já estava implementada, em dez linhas, em `resiliencia.ts:229-265` — com a
marca de procedência sendo uma **sufixação condicional na própria frase**, e não
um componente. É o padrão mais barato do repositório para dizer procedência, e
o único que funciona igual na tela, no documento e num log. Foi o que se imitou.

### Três volumetrias, e nenhuma era do produto

- a do **checklist** (`config/types.ts`) é do ITEM: "que número este item precisa
  cumprir";
- a da **demanda** (SPEC-70) é do que esta entrega atende;
- e as duas morrem quando a demanda termina.

*"Este produto atende 2 milhões de consultas por dia"* não muda a cada demanda.
Muda uma vez por trimestre — e quando muda, muda o julgamento de **todas** as
demandas em aberto. É o tipo de fato que o contexto do produto (SPEC-53) existe
para guardar: o que é perene.

### A armadilha que o repositório já documentava, um nível acima

O caminho fácil seria copiar o número do produto para dentro da quebra ao abrir.
`PipelineAgentesTab` já documenta por que não, para o preâmbulo herdado:
*"herdado NÃO é salvo como cópia enquanto ninguém edita — senão o papel congela
numa versão do padrão"*. Aqui é pior: o volume muda uma vez por trimestre, e as
demandas em aberto precisam mudar junto. Uma cópia faria cada demanda carregar o
volume do dia em que foi aberta.

Daí a decisão que atravessa a fatia inteira: **os campos do painel mostram só o
que a DEMANDA declarou**, e o herdado aparece como frase logo abaixo. Preencher
os campos com o número do produto faria o próximo autosave gravá-lo como
declarado — em dois segundos, sem ninguém pedir.

E quando os dois discordam, os **dois** números aparecem, com a frase que diz o
que a divergência não faz: *"mudar aqui não muda o produto"*.

### Um `??` em quatro lugares é duas versões da mesma régua

`quebra.volumetria` era lido em quatro pontos (documento, ensaios, placar,
contexto). Resolver a herança em cada um seria a definição do §263, e este
projeto já pagou esse preço mais de uma vez. Quem decide é o engine —
`volumetriaEmVigor(daDemanda, doProduto)` —, resolvido uma vez no `App` e
distribuído.

### Por que volume pertence ao PDCA, e as outras configs não tanto

Uma regra de refinamento continua válida até alguém mudá-la. Um volume declarado
há um ano provavelmente está errado hoje, e **nada avisa**: ele envelhece
sozinho. E número velho alimentando a Lei de Little não produz silêncio — produz
saturação falsa, ou pior, silêncio falso.

Por isso a data de declaração é coluna própria, e ela **só se move quando o
número muda** — a mesma disciplina do `atualizadoEm` da rodada anterior (§312).
Recarimbar a cada salvamento do formulário faria "declarado em" responder pela
última vírgula corrigida no objetivo, e a pergunta do ciclo nunca dispararia
porque o número pareceria sempre novo.

O `N meses` é **configurável**, junto da cadência do PDCA — é a resposta honesta
à pergunta §6.2 ("qual é o N?"): não há número de uso real para escolher. Seis
meses é um começo, não uma régua. E `0` desliga a pergunta, porque desligar
tinha que ser possível sem apagar o número declarado.

### O que NÃO entrou, e continua recusado

**Medir volume de verdade** (telemetria, APM) — o produto nunca mediu nada do
mundo real, e começar aqui mudaria o que ele é. **Volumetria por ambiente** —
multiplica a superfície por três para um ganho não demonstrado. **Estimar o pico
a partir da média** — "5×" é conhecimento de negócio, não constante.
**Substituir a volumetria técnica do checklist** — são perguntas diferentes, e
fundi-las perderia as duas.

E o `picoDe` **não entra na conta do motor**, de propósito: quem responde *"e se
o volume for 5×?"* continua sendo o `fatorDeVolume` do ensaio, porque aquilo é
uma pergunta hipotética que alguém faz. Este é um fato que o produto declara — e
a tela diz isso em voz alta, para ninguém esperar a saturação mudar sozinha.

524 engine · 133 llm · 84 aplicação · 787 web · 254 server · 39 gateway-falso ·
103/103 E2E · build, typecheck e lint limpos.
