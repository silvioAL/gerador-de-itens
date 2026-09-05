# SPEC-107 — O conjunto de abstrações do fluxo: o que é nó, e o que viaja

> **Origem:** o usuário, revisando o plano do "nó documento" (SPEC-106 C):
>
> > *"mas documento seria realmente um nó? existe cenário onde existirá uma
> > integração e o retorno poderá ser um documento que o response passará para
> > um agente. precisamos planejar o set de itens que representa a abstração
> > correta para os fins que vamos trabalhar/possíveis"*

## 0. A medição: o cenário dele já funciona — sem nó documento

Conector de leitura (`Documento de contexto`) → `conteudo` → mapeamento →
agente. Roda hoje, ponta a ponta (E2E da SPEC-105 D). **O documento entrou no
fluxo como DADO, não como nó** — e é essa a observação que decide a SPEC.

## 1. A tese, nas palavras do usuário: **"poucos conceitos e mais solidez"**

> *"hoje tem muita coisa… maior consistência e simplicidade."*

É a régua que decide TODA escolha desta SPEC. Hoje o produto carrega mais de
uma dúzia de conceitos de superfície (esteira, exportação, destinos,
operações, revisão, ensaios, documento, importação…). O alvo é **CINCO tipos
de nó** — `conector`, `agente`, `projeto`, `peca`, `transformacao` — e **duas
mecânicas** — o mapeamento (o dado viajando) e a parada (a revisão humana).
Tudo o mais é instância, rótulo ou fiação. Um conceito novo só entra
aposentando pelo menos um velho (o mapa da §3.1 é o placar).

## 1.1 Nó é o que AGE; documento é o que VIAJA

| Conceito | O que é | Onde mora |
|---|---|---|
| **Nó** | uma capacidade que executa | `nos[]` |
| **Aresta + mapeamento** | o dado fluindo, campo a campo | `arestas[]` |
| **Documento** | uma FORMA de dado (texto/markdown + metadados) | payload — nunca nó |

"Nó documento" repetiria o erro que o §368 acabou de pagar: uma implementação
contextual específica onde cabia dado numa superfície genérica.

## 2. O conjunto proposto (fechado, cresce por decisão)

1. **`conector`** — o adaptador de I/O. Lê, escreve ou ambos; o CONTRATO
   (`entrada`/`saida`) diz qual. Já existe (SPEC-105 A). Componentes na
   paleta = operações + chamada externa (§368).
2. **`agente`** — transforma texto com IA (papel da esteira como adaptador).
   Já existe.
3. **`mesa`** *(a fatia E da 105 — "a própria mesa de projetos pode ser um
   componente", o usuário)* — a demanda como NÓ, nas duas direções da 105
   §4.3: **fonte** (`saida`: `desenho`, `itens`, `markdown`, `volumetria`,
   `necessidades`) e **destino** (`entrada`: `desenho` — o importado virando
   proposta, com a confirmação humana de sempre). É o que faltava para
   "publicar o documento" e "importar por link" virarem fiação.
4. **`transformacao`** *(reservado, sem executor ainda)* — pura, sem IA
   (extrair campo, concatenar). Entra quando houver executor que a honre
   (§346: tipo oferecido sem executor é meia-integração).
5. **`motor`** *(pedido do usuário: "um componente pode ser o próprio
   motor")* — o `derivar()` como componente: entrada `desenho`, saída
   `itens`/`avisos`/`conformidade`. Determinístico por natureza — mesmo
   desenho, mesmos itens, sempre.

### 2.1 O motor no fluxo × a tese do §6 — a decisão que só o usuário fecha

A SPEC-105 §6 sustentou: *"a derivação continua determinística e continua fora
do fluxo"* — porque dois times com fiações diferentes produzindo itens
diferentes DO MESMO desenho quebraria a régua do produto. Expor o motor como
componente é revisitar isso, e há dois desenhos honestos:

- **(a) O motor só aceita o desenho vindo do nó `demanda`** (preserva a tese):
  o fluxo decide QUANDO derivar e o que fazer com o resultado, nunca O QUE
  entra na derivação. Flexibilidade: encadear derivação → agente → publicação
  numa fiação só.
- **(b) O motor aceita qualquer `desenho` mapeado** (revoga a tese §6): um
  conector pode trazer um desenho de fora e derivá-lo — flexibilidade máxima,
  e o rastro com hash (§9.5) vira a ÚNICA âncora de reprodutibilidade.
  Requer reescrever a régua do produto em voz alta.

**Recomendação: (a) na primeira leva** — entrega o encadeamento sem pagar a
revogação; (b) fica a um passo, documentado, quando um caso real pedir.

**E o tipo de dado ganha um nome:** `"documento"` entra em
`TIPOS_DE_CAMPO_DO_CONECTOR` (texto com semântica de markdown + metadados
`titulo`/`link`/`atualizadoEm`). É o que permite, depois, validar
compatibilidade de mapeamento (saída `documento` → entrada `documento`) e
renderizar preview no rastro — sem nenhum nó novo.

## 2.2 A generalização pedida: **as engines como PEÇAS** (avaliação)

> *"vamos transformar as engines em 'peças', abertas a depender da
> governança, desenháveis no canvas com componentes visualmente iguais aos da
> mesa de projeto"* — o usuário.

**A avaliação: o modelo já comporta isso, e barato.** Um conector é "endereço
com forma declarada"; uma **peça** é "função do motor com forma declarada" — o
MESMO contrato (`entrada`/`saida` em `CampoDoConector`), trocando o transporte
(chamada em processo, não HTTP). O nó vira UMA coisa só: *capacidade com
contrato*, com quatro adaptadores — HTTP (conector), papel+LLM (agente),
função do engine (peça), demanda (fonte).

**As candidatas a peça já existem, puras e testadas:** `derivar` (a
derivação unificada no canvas), **`ensaio`** (`simularLentidao` +
`resiliencia`: entrada `desenho`+`cenario`, saída `leitura` — a bancada de
ensaios como peça, pedido explícito), `validateConfig`,
`resolverDependencias`, `conformidade`/`topologia`,
`gerarEspecificacaoEntrega`, `lerDesenho`. O
catálogo de peças nasce como os conectores de fábrica: **derivado de um
registro no código com o contrato como dado** — peça nova entra por decisão
(lista fechada, §242), nunca por acidente.

**Governança:** cada peça declara o recurso RBAC que a abre (`derivar` no
nível `operar`, como hoje; peças que tocam configuração, curadas) — a
máquina de `exigirPermissao`/curadoria já existe e vira atributo do registro.

**Visual igual à mesa:** paridade de LINGUAGEM, não de superfície. O
`NodeCard` da mesa já é dirigido por `DiagramaConfig`; o fluxo ganha um
`DiagramaConfig` PRÓPRIO gerado do catálogo (peças/conectores/agentes com
cores e ícones) e renderiza com o MESMO cartão. As telas continuam separadas
(a régua da 105 §1 fica); o que unifica é o vocabulário visual. Risco a
vigiar: os dois grafos ficarem indistinguíveis — mitigação: paleta de cores
própria e o cabeçalho dizendo o que se desenha.

## 2.3 O vocabulário, revisado para ficar GENÉRICO

> *"os nomes precisam ser adaptados para que fique genérico"* — o usuário.
> A régua é a de sempre (§359/§368): **o id é estável e técnico; o rótulo da
> interface nomeia a FUNÇÃO, nunca o jargão interno nem a instância.**

| Conceito | id técnico (estável) | Rótulo na interface | O que substitui no falar |
|---|---|---|---|
| capacidade de I/O | `conector` | "Conector" | — (já genérico) |
| transformação com IA | `agente` | "Agente" | "papel da esteira" some da tela |
| a fonte/destino do desenho | `projeto` | "Projeto" | ~~`mesa`~~ — "mesa" é o nome DA TELA, não do componente; toda menção a `mesa` nesta SPEC lê-se `projeto` |
| função do motor | `peca` | "Peça" + o nome da função | "engine" não aparece na interface |
| geração determinística | peça `derivacao` | "Geração de itens (desenho → itens)" | ~~`derivar`~~ como rótulo |
| bancada de cenários | peça `ensaio` | "Ensaio de cenários" | — |
| transformação pura | `transformacao` | "Transformação" | — (reservado) |
| a cadeia de agentes | fluxo semeado `sequencia-de-agentes` | "Sequência de agentes" | ~~"esteira"~~ sai da interface (fica no código/JOURNEY como história) |
| forma de dado textual | tipo `documento` | "documento" | — |

Dois efeitos práticos: (1) o fluxo semeado `esteira-de-agentes` ganha o rótulo
novo mantendo o id (link/rastro não quebram; rótulo é interface); (2) nenhuma
tela nova nasce dizendo "esteira", "mesa" ou "engine" — e as existentes
migram o rótulo quando forem tocadas, nunca em varredura cega (a lição do
§357: verificar a frase NOVA, não só remover a velha).

## 2.4 Diretrizes de UX — para quem vai TRABALHAR com o sistema

Avaliação: quase todas já são leis da casa, pagas com defeito real — aqui
viram checklist de aceite de TODA superfície do canvas. A pessoa-alvo é quem
chega sem contexto: agilista, arquiteto, QA — não quem escreveu o código.

1. **O rótulo nomeia a função; o jargão fica no código** (§2.3). Ninguém lê
   "esteira", "engine" ou "refId" numa tela.
2. **O vazio ensina o gesto** (§364): canvas sem nós mostra a dica do próximo
   passo, nunca uma página em branco.
3. **Nada aparece sem porta; nada some sem redirect** (SPEC-79 / SPEC-61
   §6.7): capacidade nova tem caminho no menu ou na jornada; link antigo
   nunca vira tela branca.
4. **Quem age no mundo se anuncia**: conector de escrita marcado, credencial
   sinalizada ("com credencial no servidor"), e a parada configurável ANTES
   dele (§368) — susto de publicação indevida é defeito de UX, não do usuário.
5. **Ausência nunca vira default, e o erro diz o NOME do que faltou** (§9.3) —
   na tela, apontando onde consertar (a régua dos 403/409 da casa).
6. **O implícito é dito em voz alta**: aresta sem mapeamento exibe "sem
   mapeamento"; nó sem adaptador diz "escolha nas propriedades".
7. **Derivado × declarado sempre visível** (selo + "editar uma cópia"):
   ninguém edita sem saber SE aquilo é dele ou da configuração.
8. **Um dado, um lugar — editado de onde se vê** (§260/§369): o painel do nó
   edita a mesma verdade da aba; nunca uma cópia.
9. **O vivo é feedback**: execução anima nó a nó, streaming visível, rastro
   com estado/duração/porquê — "rodou" sem mostrar o quê é caixa-preta.
10. **Escolha só quando há escolha**: um adaptador compatível já vem
    selecionado; selects aparecem quando existem ≥2 opções reais.
11. **Cores por família** (peça/conector/agente/projeto), legíveis nos DOIS
    temas — travadas pelo teste de cor fixa.
12. **Demonstração cobre a superfície nova** (§235): o tour nunca mostra tela
    vazia nem escreve de verdade, e o dado de demo é marcado.
13. **Rótulo visível = nome acessível** (WCAG 2.5.3 — a pendência antiga do
    "Carregar na mesa" paga junto): quem usa voz ou leitor encontra o botão
    pelo texto que vê.
14. **Confirmação humana em toda escrita no projeto** — importar não é
    aceitar, e nenhuma fiação muda isso por baixo.

## 3. O que esta SPEC RECUSA

- **Nó `documento`** — a SPEC-106 C fica emendada: o que era "documento como
  nó" vira `demanda` (fonte) + o tipo de dado `documento`.
- **Tipos de nó por caso de uso** ("nó JMX", "nó Confluence") — caso de uso é
  fiação + adaptador, nunca tipo.
- **Executor de `transformacao` antes do caso real** (§242).

## 3.1 O que isto SUBSTITUI — o mapa, detalhado

A régua é a da SPEC-106 (§3): **nada sai sem a prova da substituição verde.**
"Vira fiação" significa: existe um fluxo semeado que faz o mesmo, o E2E da
capacidade passa por ele, e só então a peça antiga morre.

| Hoje | Vira | Prova de substituição | O que morre |
|---|---|---|---|
| **`#/ensaios` (EnsaiosScreen)** — bancada de cenários rodando no navegador | peça `ensaio` no canvas: `mesa.desenho → ensaio(cenario) → [agente]` | os cenários do E2E de ensaios passam pela fiação, com a MESMA leitura | a tela e a rota (redirect `#/ensaios → #/fluxo`), o código client-side de simulação |
| **Botão "Derivar Quebra"** da mesa | continua na mesa (é a jornada) — mas dispara a MESMA peça `derivar` registrada | derivação pelo botão ≡ derivação pela peça, byte a byte | a segunda implementação do caminho de derivar (§263: um executor só) |
| **Botão "Publicar"** do documento | atalho que dispara a fiação semeada `mesa.markdown → conector(documento)` | E2E de publicação passa SEM a rota dedicada | `POST /quebras/:id/documento/publicar` + seu bloco em `quebras.ts` |
| **Exportar prontos** (seção de itens) | atalho da fiação `mesa.itens → conector(itens)` | E2E de exportação passa pela fiação | `POST /quebras/:id/itens/exportar` + `exportadorViaAgente.ts` (o "forasteiro" da medição §0) |
| **Importar ADR / documento por link** (conversa) | fiações `conector(adr) → mesa` e `conector(documentoExterno) → agente → mesa(destino)` — confirmação humana FICA | E2E do §356 e do ADR passam sem as rotas dedicadas | `POST /ia/documento-externo`, `POST /quebras/:id/adr/importar`, e os adaptadores de `gatewayDoTime.ts` (o executor genérico de conector os cobre) |
| **Revisão/esteira** (`useEsteiraDeAgentes` + a TELA de revisão) | o fluxo semeado com `mesa.itens` como fonte, executado no servidor — e **a execução AO VIVO no canvas**: o nó do agente pulsa enquanto roda, a aresta anima carregando o dado, o texto streama no painel do nó ("quero aquelas animações" — o vivo da revisão é UX conquistada, não se perde) | **resultado idêntico item a item** (SPEC-105 F) E o vivo equivalente: quem assiste à fiação rodando vê o MESMO acontecendo que via na revisão | o motor de orquestração client-side (`acumuladas`, lotes) e a tela de revisão como superfície própria |

> Sobre a revisão: o que unifica no canvas é a **execução** (o grafo vivo). A
> **confirmação campo a campo** (SPEC-35: cada sugestão pendente até a pessoa
> aceitar) é outra natureza — julgamento, não fiação — e o lugar dela é
> pergunta aberta (§5.5): no stage do nó, ou na demanda como hoje.
| **`ENVELOPE_PADRAO`/`OPERACOES_DO_GATEWAY` como gargalo** | contratos no catálogo (105 A, feito) + peças por registro | já provado (§362) | crescimento da lista fechada como pré-requisito de integração |

**O que NÃO substitui, por decisão:** a mesa de projeto (o desenho da demanda
é a alma do produto — vira COMPONENTE, não refém do canvas de fluxo); a
conversa/assistente (produção de desenho ≠ fiação); as abas de catálogo
(Conectores, Pipeline como catálogo de papéis, regras — a 106 §2 já deu o
destino de cada uma); o PDCA; e a confirmação humana em toda escrita na mesa.

**Ordem de morte sugerida** (menor risco → maior): exportar itens → publicar
documento → importar por link/ADR → ensaios → esteira (a última, atrás da
prova item a item).

## 4. Fatias — REESCRITAS com as decisões da §5

> `peca` → **`funcao`** em tudo abaixo (decisão §5.3). Cada fatia fecha com o
> rito completo da casa (§6.2).

- **A — o registro de FUNÇÕES + `derivacao` (modo b) + `ensaio`.**
  Registro no código com contrato como DADO (`entrada`/`saida` em
  `CampoDoConector` — o molde de `CONTRATO_DA_OPERACAO`) e governança como
  atributo (recurso RBAC + nível). `derivacao` aceita qualquer `desenho`
  mapeado — e por isso **grava as ENTRADAS de cada execução no rastro** (a
  âncora da tese reescrita: "mesma fiação + mesmas entradas → mesmos itens").
  **Prova:** `projeto.desenho → derivacao → agente → conector(escrita)` e
  `projeto.desenho → ensaio → agente` rodam ponta a ponta contra o dublê, com
  rastro auditável (hash + entradas), e derivar pelo botão da mesa ≡ derivar
  pela função, byte a byte (§263).
- **B — o nó de ENTRADA `projeto`**, nas duas direções. Saída: `desenho`,
  `itens`, `markdown`, `volumetria`, `necessidades`; parâmetro `demandaId`
  (default: a ativa). Destino (escrever desenho proposto) SEMPRE atrás de um
  gate de confirmação (§2.4-14). **Prova:** as fiações da fatia A usando
  `projeto` real; importar-por-link vira fiação sem o E2E do §356 mudar.
- **C — o GATE DE CONFIRMAÇÃO desenhável + execução RETOMÁVEL.** `pausarDepois`
  generaliza para `confirmacao: "aguardar" | "automatica"` no nó; execução
  suspensa persiste as saídas (evolução de `fluxo_execucoes`: estado
  `aguardando-confirmacao` + `POST /fluxos/execucoes/:id/continuar`), quem
  revisa o stage continua ou descarta. **Prova:** fiação com gate suspende,
  sobrevive a F5/outra máquina, e continua do ponto exato.
- **D — a UX viva (o critério "incrível como a mesa").** `NodeCard` +
  `DiagramaConfig` próprio gerado do catálogo; cores por família
  (funcao/conector/agente/projeto), ícones, temas travados por `corFixa`;
  **execução ao vivo**: nó pulsa enquanto roda, aresta anima o dado, texto
  streama no painel (a técnica do `executarPedido`, por nó). **Prova:** quem
  assiste vê o MESMO vivo da revisão; visual nos dois temas.
- **E — `transformacao` com executor simples** (re-mapeio/combinação de
  campos — o Set do n8n; consequência do modelo input/output, §5.2).
- **F — o tipo de dado `documento`** no contrato + preview no rastro; e a
  validação de compatibilidade de mapeamento por tipo (aviso, não bloqueio).
- **G — as substituições, na ordem de morte da §3.1** (exportar → publicar →
  importar → ensaios → revisão), cada uma com a prova da tabela — item de
  menu/rota/código só morre com ela verde.

## 6. Para quem implementar (numa conversa do zero)

### 6.1 Leia antes, nesta ordem
- **Esta SPEC inteira** — as decisões da §5 JÁ FORAM tomadas pelo usuário;
  não as repergunte.
- SPEC-105 (§§1, 6, 7, 9) e SPEC-106 (§§1–4) — as fronteiras herdadas; a tese
  do 105 §6 está REESCRITA pela §5.4 desta.
- JOURNEY §§360–370 — a história curta de como se chegou aqui.
- Código: `packages/aplicacao/src/config/{fluxos,conectores,caminho}.ts`;
  `packages/aplicacao/src/casos-de-uso/{fluxos,conectores}.ts` (o executor e o
  `pausarDepois` que a fatia C generaliza); `packages/server/src/routes/
  {fluxos,conectores}.ts`; `packages/server/src/ia/provedorDaOrganizacao.ts`
  (o agente); `fluxo_execucoes` (migração 0043 — a fatia C a evolui);
  `packages/web/src/fluxo/FluxoScreen.tsx`; `packages/web/src/canvas/
  {Canvas,NodeCard}.tsx` e `styles.css` (a linguagem visual da fatia D);
  `engine`: `derivar`, `simularLentidao`, `resolverDependencias`.

### 6.2 O rito de toda fatia (não negociável)
Branch + PR (nunca na main); medição da premissa ANTES de codar; 4 portões
(`build`/`typecheck`/`test`/`lint` `--workspaces`); E2E completo SOZINHO
(matar 5190/4100/4123 antes; banco descartável 5433 via
`docker-compose.e2e.yml`); §248 (desligar a correção e ver o teste falhar);
`docker compose up -d --build` + verificação visual em :8080 nos DOIS temas;
entrada no JOURNEY; `graphify update .`; merge já autorizado; rebuild final.

### 6.3 Avisos que o código não conta
- `routes/ia.ts` e `web/src/api/client.ts` carregam um byte NUL — `grep -a`,
  e edite por âncora exata, longe da região.
- Os E2E rodam em paralelo e os documentos de config são globais: escreva
  read-modify-write só dos SEUS ids (`fluxo-de-integracao.spec.ts` é o
  molde) e grave a credencial de IA IDÊNTICA à convenção
  (`ia-hospedada.spec.ts:260` — com visão).
- Renomeie `peca → funcao` ANTES de nascer código (§5.3); ids estáveis,
  rótulos genéricos (§2.3); as diretrizes §2.4 são critério de ACEITE.
- Dívidas vizinhas que NÃO são desta SPEC: dono errado de `exportador`/
  `tokens` no RBAC; SPEC-97 fatia B.

## 5. As perguntas — RESPONDIDAS pelo usuário (§370)

**1+2. O modelo é INPUT/OUTPUT, como no n8n.** *"Falta abstração na pergunta:
precisamos de algo como input/output."* A abstração universal: **todo nó
recebe entradas e emite saídas** (dados estruturados fluindo pelas arestas —
os "items" do n8n são o nosso mapeamento). Consequências:
- `projeto` NÃO é caso especial: é um nó de ENTRADA cujo parâmetro diz a
  origem (demanda ativa por padrão; `demandaId` é só um parâmetro do nó —
  `parametros` já existe no modelo).
- `transformacao` deixa de ser "reservada": no modelo input/output ela é
  consequência (um nó que só re-mapeia/combina dados — o Set/Code do n8n), e
  entra com um executor simples na primeira leva.

**3. "Peça" não é o melhor nome — avaliação:** candidatos: *bloco*, *ação*,
*operação*, ***função***. **Recomendação: `funcao`** (rótulo "Função do
sistema — Geração de itens/Ensaio de cenários"): é como quem trabalha fala
("a função que gera os itens"), não colide com "operação" (do gateway) nem
com "ação" (RBAC). Ids da SPEC migram `peca → funcao` antes de nascer código.

**4. MODO (b) — decidido.** A peça de geração aceita QUALQUER `desenho`
mapeado. **A tese da SPEC-105 §6 fica formalmente REESCRITA:** a promessa
deixa de ser "mesmo desenho → mesmos itens, sempre" e passa a ser **"mesma
fiação + mesmas entradas → mesmos itens"** — a reprodutibilidade ancora no
rastro (hash do fluxo §9.5 + as entradas registradas por nó). O rastro deixa
de ser diagnóstico e vira ÂNCORA de auditoria; gravar as entradas de cada
execução da função de geração vira requisito da fatia A.

**5. A confirmação MORA NO DESENHO.** *"Você pode desenhar para aguardar
confirmação antes de seguir, ou para seguir automaticamente."* A parada
(§368) se generaliza no **gate de confirmação desenhável** — o Wait/approval
do n8n: um nó marcado "aguardar confirmação" suspende a execução ali, alguém
revisa o stage e CONTINUA (ou descarta); sem a marca, segue automático.
Consequência de implementação honesta: execução deixa de ser one-shot —
precisa de **estado retomável** (a execução pausada persiste as saídas e um
`continuar`), que é a evolução do `fluxo_execucoes`. A confirmação campo a
campo da revisão vira instância disso quando a revisão migrar.

> Com isso, nas palavras dele, *"resolvemos tudo ligado inclusive aos outputs
> do sistema"* — outputs são nós de saída como quaisquer outros.

1. O nó `demanda` aponta a demanda ATIVA ou recebe `demandaId` como parâmetro?
   (Recomendação: ativa na primeira leva — é onde a jornada está.)
2. `transformacao` espera caso real, certo?
3. O conjunto acima cobre "os fins possíveis" que você enxerga, ou falta uma
   capacidade (ex.: espera/aprovação humana como nó — hoje coberta por
   `pausarDepois`)?
4. **Motor no fluxo: (a) ou (b) da §2.1?** É a decisão que define se a tese do
   §6 fica ou é reescrita.
5. **A confirmação campo a campo da revisão mora onde**, quando a execução
   unificar no canvas — no stage do nó, ou na demanda como hoje?
