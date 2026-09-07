# SPEC-110 — O fluxo como low-code: gatilhos, telas (screens) e bancos de dados

> **A tese, nas palavras do usuário:** *"o objetivo é que vire um low code
> de verdade"*. Tudo nesta SPEC serve a isso: o canvas deixa de ser o
> encanamento interno com um botão e passa a ter as primitivas de um
> low-code — quando roda (gatilhos), com quem fala (integrações e bancos),
> onde a pessoa entra (telas com avançar/retornar, criáveis pelo usuário) e
> dados como componentes explícitos (ler/gravar, nunca fundidos).

> **Para quem implementa (conversa nova): leia a §0 antes de qualquer código.**
> Esta SPEC foi escrita para ser autossuficiente — as medições da §2 foram
> feitas contra a main `1dc016f` (pós-SPEC-109) e citam arquivo/linha.

## 0. O rito da casa (não negociável)

1. **Nunca commitar na main.** Branch + PR por fatia; merge e tag autorizados
   sem perguntar. `git commit -F arquivo`; `gh pr create --body-file`.
2. **Nunca reportar "pronto" só com teste verde.** Cada fatia fecha com:
   quatro portões (`npm run build/test/lint --workspaces --if-present`) + E2E
   completo SOZINHO (`npm run e2e:up` / `npm run test:e2e -w packages/web` /
   `npm run e2e:down` separados — o `;` do script raiz quebra no Windows;
   matar portas 5190/4100/4123 antes; banco descartável 5433; validar com
   banco recriado `down -v` na última rodada) + validação visual contra a
   stack real (`docker compose up -d --build`, web em :8080, Playwright nos
   DOIS temas — `localStorage gerador:tema`; trocar tema na MESMA sessão, o
   login repetido bate em rate limit) + entrada no JOURNEY.md + `graphify
   update .` + PR + CI verde (loop bash com grep, sem jq) + merge + rebuild
   dos containers locais (conferir que o serviço `gerador` — o web — buildou,
   não só o server).
3. **§248 em toda prova nova:** desligar a correção e ver o teste falhar
   antes de dar por feito (trio limpo-verde / sujo-vermelho / restaurado).
4. **Medir a premissa contra o código antes de codar cada fatia** — as
   medições da §2 envelhecem; re-conferir linhas antes de editar.
5. `packages/server/src/routes/ia.ts` e `packages/web/src/api/client.ts` têm
   **byte NUL** — `grep -a`, editar por âncora exata longe da região.
6. Vitest: `npm test -w pacote -- filtro` (o `-w` do vitest é OUTRA flag e
   fabrica falha em massa). Cuidado: `git checkout <arquivo>` para desfazer
   uma sujeira de §248 leva junto edits não commitados (mordeu no §386).
7. Credencial de IA nos E2E: `BASE_URL/CHAVE/MODELO_GATEWAY_FALSO`, visão
   marcada, uma por organização. Testes que gravam config de time usam time
   PRÓPRIO (`entrarEmTimeProprio` + lista em `globalSetup.ts`, ~linha 147).
8. `graphify query` antes de ler/grepar (hooks reforçam). Responder sempre em
   português. JOURNEY.md ganha um § por fatia (próximo livre: §391).
9. Lições recentes de E2E (SPEC-109): fontes do Linux na CI alargam cartões e
   escondem handles sob vizinhos (fiar ANTES de batizar nós); `page.goto`
   para o MESMO hash não remonta a tela (usar `reload`); `reload` logo após
   um clique de salvar mata o PUT em voo (poll na API antes); testes que
   desligam estado no meio precisam ser auto-saneadores (a 1ª rodada morta
   envenena as seguintes).

## 1. De onde ela vem (as palavras do usuário)

Depois da SPEC-109, o usuário avaliou o canvas contra o objetivo real:

- *"me parece não descrever o sistema ou ser flexível como um low code, que é
  o nosso objetivo"*;
- *"sinto falta de componente do banco de dados por exemplo e de
  configurações para essas coisas"*;
- *"não entendi qual o objetivo do botão executar"*;
- *"senti falta de componente scheduler para outros desenhos"*;
- *"não entendi como a parte de ensaios seria executada no sentido de como o
  usuário vai interagir, acho que esse tipo de coisa poderia ser abstraído
  como screen"*;
- e o desenho da interação: *"se chegarmos ao nível de abstração pretendido
  no sentido de ser uma screen integrada a algum output, poderia ser feita a
  conexão com essa screen, o agente iria gerar o ensaio, e depois o usuário
  revisa, e decide avançar para a derivação (conexão com próximo output), ou
  retornar"*;
- *"também precisará de spec para essa parte de criar ou editar screens"*.

## 2. Medições do estado atual (main `1dc016f`)

**M1 — Tipos de nó.** `TIPOS_DE_NO_DO_FLUXO = ["conector", "agente",
"funcao", "projeto", "transformacao"]`
(`packages/aplicacao/src/config/fluxos.ts:39`). Não existem: gatilho, tela,
banco, laço, condicional. O plano de execução é DAG topológico puro
(`planoDoFluxo`, mesmo arquivo).

**M2 — Integração externa = só HTTP.** O `Conector`
(`packages/aplicacao/src/config/conectores.ts:67`) declara `endpoint`,
`metodo` (`:72`), cabeçalhos/envelope resolvidos, e campos de entrada/saída
com JSONPath (`caminho`, default `$.{chave}`). Segredos via cofre
(`packages/server/src/adaptadores/cofreInfisical.ts`, exercido em
`cofreNaRota.test.ts`). Nada de banco de dados.

**M3 — "Executar" é o gatilho manual implícito.** `FluxoScreen.tsx` (botão
`executar-fluxo`): salva os declarados, chama
`apiExecucaoDeFluxo.executarAoVivo(fluxo.id, timeAtivo, ateNo, aoEvento,
parametrosPorNo)` com `{demanda:{demandaId}}` quando a fiação tem o nó de
mesa com id `"demanda"`. Não há conceito de gatilho no desenho — por isso o
botão parece sem propósito.

**M4 — A execução JÁ SABE suspender e esperar gente.** SPEC-107 fatia C:
`confirmacao: "aguardar"` num nó suspende DEPOIS dele; a execução persiste em
`fluxo_execucoes` (colunas: `id uuid, fluxo_id, time_id, hash, email, em,
nos jsonb, estado ('concluida'|'aguardando-confirmacao'), saidas jsonb,
ate_no`) e os endpoints `POST /fluxos/execucoes/:id/continuar` ("continuar é
disparar o resto", `routes/fluxos.ts:533`) e `.../descartar` já existem, com
UI de gate no canvas (rastro com `aguardandoEm`, botões continuar/descartar,
sobrevive a F5 — efeito em `FluxoScreen.tsx` ~419). **Esta é a fundação das
telas: falta só a tela ser um NÓ com saída própria.**

**M5 — A bancada de ensaios é um painel ad hoc.** `BancadaDeEnsaios.tsx`
(props na linha 57: `diagrama, config, cenarios, onMudar, onVoltar,
executar(cenario) => LeituraDoEnsaio`) montada pelo App SOBRE o canvas quando
a rota é `#/fluxo/ensaio`; a porta é o botão "Simular" da mesa
(`App.tsx:1839` — salva e navega). Ela chama `executar` que roda a fiação
semeada `ensaio-de-cenarios` (`fluxoDoEnsaio`, `fluxos.ts` ~380: `demanda →
funcao(ensaio)`). Não há "avançar para a derivação" nem "retornar".

**M6 — Padrões consolidados a REUSAR (SPEC-107/109).** (a) Registro fechado
com contrato declarado: `FUNCOES_DO_SISTEMA` / `funcaoDoSistema`
(`aplicacao/src/config/funcoes.ts`) — o molde para telas e gatilhos do
sistema. (b) "Deep-link + porta no nó": aba fora do menu, capacidade viva
atrás de `#/config/...`, botão no painel do nó que a consome (§§388–389).
(c) Fluxo de fábrica derivado da configuração com `sombreiaFabrica` +
"voltar à derivada" (§386). (d) Vocabulário: Integração externa / Agente /
Mesa de projeto / Função do sistema / Transformação; nome por nó
(`NoDoFluxo.nome`, §387). (e) Config por documento por time
(`config_documentos`: chave/time_id/documento jsonb) com normalizar tolerante
+ validar-escrita rigorosa (SPEC-35).

**M7 — Não existe scheduler.** Nenhuma tabela de agendamento, nenhum runner;
`fluxo_execucoes` guarda histórico mas tudo nasce de request HTTP.

**M8 — Postgres já é a casa.** O server usa `pg` (repositórios em
`packages/server/src/adaptadores/*EmPostgres.ts`); o compose E2E sobe um
Postgres descartável em 5433 — serve de alvo REAL para testar o conector de
banco sem dublê novo.

**M9 — O nó de mesa é "a mesma coisa duas vezes" (queixa literal).** A
esteira de fábrica tem `demanda` e `grava` AMBOS com `tipo: "projeto",
refId: "projeto"` (`fluxos.ts:241` e `:250`) — dois cartões idênticos
("Mesa de projeto") cuja diferença — um LÊ a demanda, o outro GRAVA nela —
vive escondida nos mapeamentos das arestas. O `PROJETO_DO_SISTEMA`
(`projeto.ts:47`) funde três papéis num registro só: tela (a porta "abrir a
mesa"), fonte de dados (desenho/fila/contextos) e destino de dados
(respostasItens/resultados/linkExterno). O PDCA tem o mesmo sintoma em menor
grau: a escrita de feedback existe só como rota (`routes/pdca.ts:277`) e
aba de config — nenhum componente do canvas fala com ele.

## 3. As decisões de produto (fechadas — não reabrir)

- **D1.** Todo fluxo COMEÇA num **gatilho visível** (nó). Tipos v1: `manual`
  e `agendamento`. O botão "Executar" vira o gesto do gatilho manual
  ("▶ Rodar agora"), mantendo o testid `executar-fluxo` (dezenas de E2Es).
- **D2.** **Tela (screen) é um nó**: entrada = o que ela mostra; saída = a
  decisão (`avancar`/`retornar`) + o que a pessoa preencheu/aprovou. Quando a
  execução chega numa tela, SUSPENDE (reusa a mecânica M4); a pessoa abre a
  tela, age, e **Avançar** continua o fluxo com a saída dela, **Retornar**
  descarta a execução suspensa e devolve ao canvas com aviso ("retornado —
  ajuste e rode de novo"). *Retornar re-rodar automaticamente o nó anterior é
  dívida declarada, não v1.*
- **D3.** Telas do SISTEMA (registro fechado, molde M6a): `bancada-de-ensaios`,
  `documento` (revisar/confirmar sugestões), `mesa` (abrir a mesa). Telas
  DECLARADAS pelo usuário (D5) vivem no mesmo vocabulário.
- **D4.** O ensaio vira a cadeia que o usuário descreveu:
  `gatilho → mesa(demanda) → ensaio → TELA bancada → (avançar) → derivação`.
  Quem gera o ensaio pode ser a função do motor (hoje) OU um agente — a tela
  consome a entrada dela de qualquer produtor; nada na tela pressupõe o
  produtor. O painel ad hoc da bancada morre; `#/fluxo/ensaio` redireciona.
- **D5.** **Criar/editar screens é do usuário**: documento de config `telas`
  (por time), com blocos declarativos (v1: `texto` markdown, `dado` — mostra
  uma entrada, `campo` — input da pessoa) + a decisão padrão
  Avançar/Retornar. Editor com porta no nó ("editar a tela →",
  `#/config/telas/<id>`, fora do menu — padrão M6b) e renderizador genérico.
- **D6.** **Conector de banco de dados**: o catálogo ganha `tipo: "http" |
  "banco"`. v1 = Postgres, SOMENTE CONSULTA (transação read-only), SQL com
  parâmetros nomeados (nunca interpolação), segredo (connection string) no
  cofre, timeout e LIMIT forçados. Escrita e Mongo são fatias futuras
  (SPEC-108).
- **D7.** **Scheduler**: tabela própria + runner no server (tick ~30s) +
  gatilho `agendamento` com expressão cron de 5 campos editada no painel do
  nó. Single-instance v1 (lock por UPDATE atômico; multi-instância é dívida
  declarada).
- **D8.** Fluxos declarados ANTIGOS (sem gatilho) continuam executáveis pelo
  botão — compatibilidade sem migração de dados; a fábrica sempre desenha o
  gatilho; a tela sugere ("sem gatilho — adicione um pela paleta").
- **D9.** Nada desta SPEC muda a derivação determinística (§6 da SPEC-105) nem
  o julgamento na demanda (§5.5): a TELA documento é uma porta para o mesmo
  julgamento, não um segundo motor.
- **D10.** **A demanda se DESDOBRA em TRÊS componentes** — confirmado pelo
  usuário em pergunta direta (*"exato, então podemos decompor em 3
  componentes, o objetivo é que vire um low code de verdade"*): a TELA
  `mesa` (interação, D3), **Demanda — ler** e **Demanda — gravar** (dados).
  Mecânica: registro
  `DADOS_DO_SISTEMA` com `demanda-ler` (só a `saida` atual) e
  `demanda-gravar` (só a `entrada` atual), cartões e nomes distintos
  ("Demanda — ler" / "Demanda — gravar"), ícones/tons distintos. O refId
  legado `"projeto"` continua aceito com o contrato fundido (fluxos salvos
  não quebram — deprecado, o painel avisa); a fábrica desenha os novos. A
  porta "Abrir a mesa de projeto" SAI dos nós de dados e vai para a TELA
  `mesa` (D3) — dado é dado, interação é tela.
- **D11.** **A demanda NÃO vira Postgres cru.** As invariantes moram nas
  operações nomeadas (sugerido nunca sobrescreve confirmado, `nivelNoTime`,
  auditoria — `aplicarRespostasNaDemanda`): o conector de banco (D6) é para
  dados EXTERNOS; a demanda é o banco DO PRODUTO, acessado pelos componentes
  do D10. Mesmo espírito low-code, contrato seguro.
- **D12.** **PDCA vira componente**: função do sistema `pdca-feedback`
  (entrada: texto + contexto; escreve `pdca_feedback` pela mesma rota/regra
  de auditoria) — com ela, uma screen DECLARADA (D5) com um `campo` de texto
  fiada nessa função monta um coletor de feedback dentro de qualquer fluxo.
  A aba "PDCA — melhoria contínua" continua no menu por ora (ela é o laço de
  quem ADMINISTRA; medir depois se segue o padrão §221).
- **D13.** **O PDCA é um FLUXO, e configurar as coisas se faz PELO fluxo** —
  apontado pelo usuário (*"o PDCA provavelmente vai demandar outro fluxo…
  deve ser possível configurar as coisas por lá"*). Dois componentes de
  dados novos: `config-ler` (lê um documento de configuração nomeado do
  time) e `config-propor-ajuste` — que **NÃO grava direto**: cria uma
  `solicitacao_ajuste` (a mudança como dado, SPEC-39/45, `pdca.ts:509`), e
  quem APLICA é a máquina existente (`POST /ajustes/:id/aplicar`,
  `pdca.ts:553` — determinístico, auditado, permissão checada no server).
  O laço completo vira fluxo de FÁBRICA (`pdca-melhoria`, derivado):
  `gatilho → pdca-ler-feedbacks → agente(propõe o ajuste) → TELA(revisar a
  proposta) → avançar → config-propor-ajuste + aplicar`. A tela de revisão
  É a aprovação — avançar sem permissão de aplicar falha nomeado, não em
  silêncio.
- **D14.** **Fluxos e screens moram numa GALERIA** — confirmado duas vezes
  pelo usuário ("simplificaria bastante"): `#/fluxo` sem id abre uma tela
  de cards grandes com busca filtrada, ícone (emoji) e nome editáveis; o
  canvas vira o destino do clique, não a porta. Detalhe na fatia H.

## 4. As fatias

> Ordem: A → B → C → D → E → F → G → H. B é a maior; C depende de B; D e E
> são independentes entre si (podem inverter se conveniente); F depende de
> B; G depende de B e F; H depende de C (mas a galeria só-de-fluxos pode
> adiantar). Se a rodada apertar, H-só-fluxos logo após A é um upgrade
> visível barato.

### Fatia A — o gatilho como nó

**Motor** (`aplicacao/src/config/fluxos.ts` + novo `config/gatilhos.ts`):
- `TIPOS_DE_NO_DO_FLUXO` ganha `"gatilho"`. Registro fechado
  `GATILHOS_DO_SISTEMA`: `manual` ("▶ Manual — roda quando alguém manda") e,
  na fatia E, `agendamento`. Sem contrato de dados v1 (o gatilho é âncora de
  "quando roda"; os dados continuam nascendo nos nós de mesa/integração).
- `planoDoFluxo`: nó gatilho entra na ordem mas o executor dele é no-op
  (rastro "✓ gatilho" com origem do disparo).
- Aresta gatilho→primeiro-nó SEM mapeamento ganha o rótulo **"dispara"** em
  vez de "sem mapeamento" (edges memo, `FluxoScreen.tsx` ~310).
- Fábricas (`fluxoDaEsteira`, `fluxoDaExportacao`, `fluxosDaPublicacao`,
  `fluxoDoEnsaio`): todas passam a desenhar `gatilho-manual` como primeiro nó
  (ids de nó: `gatilho`). Cuidado: E2Es contam nós da esteira (6→7) —
  varrer `toHaveCount` e listas `["demanda","po",...]` nos specs.
- `validarEscritaFluxos`: no máximo UM gatilho por fluxo (dois = qual vale?).
  Zero é tolerado (D8).

**Tela**: paleta ganha "+ Gatilho" (`add-gatilho`, tipo gatilho, refId
manual); vocabulário: família "Gatilho" (cor/ícone novos em
`vocabularioDoFluxo.ts` — cores travadas por contraste nos dois temas, teste
existente `vocabularioDoFluxo.contraste.test.ts` cobra `>= 3`); botão
"Executar" → texto "▶ Rodar agora" (testid intacto); painel do nó gatilho
manual explica o propósito ("é o que o botão dispara").

**Provas**: unidade (validação de gatilho duplicado; fábricas com gatilho;
plano com no-op) + E2E: esteira derivada mostra o gatilho e "▶ Rodar agora"
roda a partir dele (ajustar contagens); §248: remover o gatilho da fábrica →
teste da fábrica vermelho.

### Fatia B — telas do sistema + o ensaio pela tela (o coração)

**Motor** (`aplicacao/src/config/telas.ts`, novo):
```ts
interface TelaDoSistema {
  id: "bancada-de-ensaios" | "documento" | "mesa";
  nome: string;
  entrada: CampoDoConector[];   // o que ela mostra (ex.: bancada: ensaio(documento), desenho(objeto))
  saida: CampoDoConector[];     // decisao(texto: "avancar"|"retornar") + o que aprova (ex.: ensaioAprovado)
}
```
- `TIPOS_DE_NO_DO_FLUXO` ganha `"tela"`; `telaDoSistema(refId)` no molde de
  `funcaoDoSistema`. Trava SPEC-80: conferir se `gerarSpec.trava.test.ts`
  (engine) lista arquivos novos de IA — telas não são IA, não deve morder,
  mas MEDIR.

**Executor** (`routes/fluxos.ts`, executor por tipo):
- Nó tela: persiste a execução com `estado: "aguardando-tela"`, `ate_no` = o
  nó de tela, `saidas` = stage acumulado (entradas da tela inclusas).
  Migração: `fluxo_execucoes.estado` ganha o valor novo (coluna text — sem
  ALTER de enum; conferir constraint).
- `POST /fluxos/execucoes/:id/continuar` aceita corpo opcional
  `{ saidaDaTela: Record<string, unknown> }` quando o estado é
  `aguardando-tela`: valida contra a `saida` declarada da tela, grava
  `decisao: "avancar"` e segue o plano. Sem corpo em estado de tela = 400
  nomeado.
- `POST /fluxos/execucoes/:id/retornar` (novo): só em `aguardando-tela`;
  marca `estado: "retornada"` (novo valor terminal), audita, e o canvas
  mostra "retornado — ajuste e rode de novo". (D2: sem re-rodar automático.)

**Renderização da tela em modo stage**:
- O canvas, ao ver `aguardando-tela`, mostra no rastro: "aguardando:
  Bancada de ensaios — **abrir →**" (testid `abrir-tela-do-stage`).
- Rota nova `#/tela/<execucaoId>`: o App busca a execução, resolve a tela do
  nó e monta o RENDERIZADOR com as entradas do stage + a barra fixa
  **Retornar ← / Avançar →** (testids `tela-retornar`/`tela-avancar`).
- Para as telas do sistema o renderizador delega: `bancada-de-ensaios` monta
  a `BancadaDeEnsaios` REUSADA como corpo (props vindas do stage — o ensaio
  já calculado vira a leitura inicial; a bancada continua podendo re-medir
  cenários); `documento` navega para `#/documento` com a barra de stage
  visível (o julgamento continua na demanda, D9); `mesa` navega para a mesa.

**O fluxo do ensaio (fábrica) muda para a cadeia do usuário**:
`gatilho → demanda(mesa) → ensaio(funcao) → bancada(tela) → derivacao(funcao)`
- Arestas: `demanda.desenho → ensaio.desenho`; `ensaio.leitura →
  bancada.ensaio`; `bancada.ensaioAprovado → derivacao.?` — MEDIR o contrato
  real de `funcaoDoSistema("derivacao")` antes de fiar (a derivação lê o
  desenho da demanda; o mapeamento certo pode ser `demanda.desenho →
  derivacao.desenho` com a bancada só como GATE no caminho — decidir na
  implementação com o contrato à frente, e documentar no JOURNEY).
- O botão "Simular" da mesa passa a EXECUTAR este fluxo (gatilho manual) em
  vez de só navegar; `#/fluxo/ensaio` redireciona para `#/fluxo/ensaio-de-cenarios`.
- O painel ad hoc morre do App (prop `painel` da FluxoScreen sai se ficar
  órfã); `BancadaDeEnsaios` vive como corpo da tela.

**Provas**: unidade do executor de tela (suspende; continuar exige saída
válida; retornar termina) — §248 em cada; E2E guardião novo
(`tela-do-ensaio.spec.ts`): Simular → execução suspende na bancada → abrir →
re-medir um cenário → Avançar → derivação roda e o rastro fecha verde →
Retornar num segundo run termina como "retornada". Ajustar
`esteira-pela-fiacao`/`fluxo-de-funcoes` ao nó extra de gatilho.

### Fatia C — criar e editar screens (telas declaradas)

**Config** (chave `telas` em `config_documentos`, por time — molde M6e):
```ts
interface TelaDeclarada {
  id: string; nome: string;
  blocos: (
    | { tipo: "texto"; markdown: string }
    | { tipo: "dado"; chave: string; rotulo: string; formato: "texto" | "documento" | "lista" | "objeto" }
    | { tipo: "campo"; chave: string; rotulo: string; entrada: "texto" | "numero" | "escolha"; opcoes?: string[]; obrigatorio?: boolean }
  )[];
}
```
- `entrada` derivada dos blocos `dado`; `saida` = blocos `campo` + `decisao`.
  Normalizar tolerante / validar-escrita rigorosa (id repetido, chave
  repetida, escolha sem opções — recusar nomeando, SPEC-35).
- `fluxosEmVigor`-análogo: `telasEmVigor(documentoTelas)` = declaradas + as
  do sistema (id colidente: declarada vence, com o MESMO selo
  `sombreiaFabrica` e "voltar à derivada" da §386 — reusar o padrão, não
  reinventar).

**Editor** (`#/config/telas` lista, `#/config/telas/<id>` edita — FORA do
menu, padrão M6b): criar tela, adicionar/remover/reordenar blocos,
preview ao vivo do renderizador, salvar com validação. Porta: painel do nó
tela ganha "editar a tela →" (telas declaradas) e a paleta ganha "+ Tela"
(escolhe declarada ou do sistema no painel, como integração externa).

**Renderizador genérico**: blocos `texto` (markdown já existe no produto —
reusar o render do documento), `dado` (formato documento = texto corrido;
objeto/lista = pré formatado como o rastro faz), `campo` (inputs controlados;
obrigatório trava o Avançar com motivo visível, não silêncio).

**Provas**: unidade de normalizar/validar/telasEmVigor (§248 no validar);
E2E: criar tela com um `dado` + um `campo` obrigatório, fiar
`mesa → agente → tela` num fluxo novo, rodar, abrir, ver o dado, Avançar
travado até preencher, preencher, Avançar → saída da tela no rastro do nó
seguinte (ou no stage final). Editor sobrevive a F5.

### Fatia D — conector de banco de dados (Postgres, consulta)

**Catálogo** (`conectores.ts`): `tipo?: "http" | "banco"` (ausente = http);
banco: `{ motor: "postgres", segredoDaConexao: <chave no cofre>, sql: string,
limite?: number }`; entrada = parâmetros nomeados do SQL (`:param` →
posicionais `$n` na borda — NUNCA interpolar); saída = chave→coluna.
Validar-escrita: recusar SQL sem `select` inicial (heurística honesta e
documentada), parâmetro declarado que não aparece no SQL, e vice-versa.

**Executor** (server): pool `pg` por conexão (cache com teto), `SET
TRANSACTION READ ONLY`, `statement_timeout` 10s, `LIMIT` forçado
(`limite ?? 100`) quando o SQL não tem; linhas viram a saída declarada;
falha nomeada no rastro (mensagem do Postgres, sem stack).

**UI**: `ConectoresTab` ganha o formulário do tipo banco (motor fixo
postgres v1, segredo escolhido do cofre, SQL, parâmetros, teste de conexão
com "consultou N linhas"); painel do nó igual aos demais (valores fixos =
parâmetros).

**Provas**: unidade da tradução `:param`→`$n` e das recusas (§248); E2E
contra o Postgres descartável 5433: seed de uma tabela no próprio teste
(`page.request` não serve — usar o banco via conector de SETUP? Não: criar a
tabela via um endpoint? MEDIR: o e2e globalSetup já fala com o banco 5433
direto via `pg` — semear `CREATE TABLE ... INSERT` ali é o caminho), fiar
`gatilho → banco → transformacao`, rodar, rastro com as linhas.

### Fatia E — scheduler (gatilho de agendamento)

**Migração**: tabela `fluxo_agendamentos (id uuid pk, fluxo_id text, time_id
text, expressao text, ativo bool default true, proximo_em timestamptz,
ultima_em timestamptz, criado_por text)`.

**Runner** (server, no boot): tick a cada 30s; `UPDATE fluxo_agendamentos SET
proximo_em = <próxima> WHERE proximo_em <= now() AND ativo RETURNING *` (o
UPDATE atômico é o lock, D7) → para cada linha, executa o fluxo pela MESMA
função do endpoint (auditoria com origem `agendamento`; histórico em
`fluxo_execucoes`). Parser cron de 5 campos próprio e pequeno (minuto hora
dia mês dia-da-semana, `*` e números; SEM dependência nova — documentar
limites) ou dependência mínima se o time preferir; decidir na implementação
e travar com testes de próxima-ocorrência.

**Nó**: `GATILHOS_DO_SISTEMA` ganha `agendamento`; `parametros.expressao`;
painel edita com preview "próxima: <data legível>"; salvar o fluxo
sincroniza o agendamento (RMW: criar/atualizar/desativar quando o nó sai).
Fluxo com gatilho de agendamento continua rodável pelo "▶ Rodar agora".

**Prova determinística**: endpoint `POST /fluxos/agendamentos/tick`
(somente `AUTH_MODE=dev` — o modo dos E2E) que força um tick; o E2E cria o
agendamento com `proximo_em` no passado via expressão, força o tick e vê a
execução no histórico com origem `agendamento`. §248: desligar o runner do
tick forçado → vermelho.

### Fatia F — a demanda desdobrada + o PDCA como componente (D10–D12)

**Motor** (`aplicacao/src/config/projeto.ts` → evolui, sem renomear
arquivo):
- Registro `DADOS_DO_SISTEMA`: `demanda-ler` (contrato = a `saida` atual do
  `PROJETO_DO_SISTEMA` + o parâmetro `demandaId`) e `demanda-gravar`
  (contrato = a `entrada` atual, menos `demandaId` que continua parâmetro).
  `PROJETO_DO_SISTEMA` (refId `"projeto"`) permanece como LEGADO deprecado —
  normalizar aceita, painel avisa "componente antigo — troque por
  Demanda — ler/gravar".
- Executor (`routes/fluxos.ts`, ramo projeto): decide por refId — `ler` só
  emite, `gravar` só grava, `projeto` mantém o comportamento fundido de hoje
  (bit a bit: os E2Es de fluxos salvos antigos são a prova de regressão).
- Fábricas re-desenham com os novos refIds (esteira, exportação, publicação,
  ensaio). Rótulos: "Demanda — ler" / "Demanda — gravar" nos cartões; a cor
  da família pode ganhar dois tons (medir contraste nos dois temas).
- A porta "Abrir a mesa de projeto" sai do painel dos nós de dados
  (`FluxoScreen.tsx` ~1030, `abrir-mesa-do-projeto`) e passa a ser a TELA
  `mesa` (fatia B) — quem quer interação adiciona a tela; quem quer dado usa
  ler/gravar.

**PDCA**: `FUNCOES_DO_SISTEMA` ganha `pdca-feedback` (entrada:
`texto (obrigatório)`, `contexto?`; saída: `feedbackId`) — executor chama a
mesma gravação de `routes/pdca.ts` (auditoria idêntica, `recurso:
"pdca_feedback"`). E2E de exemplo que também serve de documentação viva: uma
screen declarada com um `campo` texto fiada em `pdca-feedback`, rodada, e o
feedback aparece na aba PDCA.

**Provas**: unidade dos dois contratos + legado fundido (§248: trocar o
executor de `ler` para o fundido → o teste que afirma "gravar não emite"
fica vermelho); E2E: esteira de fábrica nova mostra "Demanda — ler" e
"Demanda — gravar" com cartões distintos (a queixa M9 morta na tela), e um
fluxo salvo ANTIGO com refId `projeto` continua executando igual.

### Fatia G — o PDCA como fluxo (D13)

> Depende de B (tela) e F (componentes PDCA/dados). O gatilho de
> agendamento (E) é opcional — o manual serve para o v1 do laço.

**Componentes** (`DADOS_DO_SISTEMA` + `FUNCOES_DO_SISTEMA`):
- `pdca-ler-feedbacks`: saída = lista de feedbacks abertos (mesma leitura da
  aba, `routes/pdca.ts` — reusar a query, não copiá-la).
- `config-ler`: parâmetro `chave` (validada contra a lista real de
  documentos de config); saída = o documento.
- `config-propor-ajuste`: entrada = a operação proposta (o formato de
  `solicitacoes_ajuste` — MEDIR o shape em `pdca.ts:384` "a mudança como
  dado" antes de declarar o contrato); efeito = cria a solicitação
  (auditoria idêntica à rota). **Sem escrita direta de config em fluxo —
  decisão D13, não reabrir.**
- Aplicar: o Avançar da tela de revisão chama `POST /ajustes/:id/aplicar`
  existente; sem permissão, a falha volta nomeada para o rastro.

**Fluxo de fábrica `pdca-melhoria`** (derivado, aparece no catálogo como a
esteira): `gatilho(manual) → pdca-ler-feedbacks → agente(refId de papel
configurável; prompt padrão "proponha UM ajuste de configuração a partir
destes feedbacks, no formato de operação") → tela(revisar proposta:
blocos dado com o feedback e a operação proposta) → config-propor-ajuste →
aplicar`. Com E entregue, trocar o gatilho para agendamento é um gesto do
usuário, não código.

**Provas**: unidade dos contratos + da recusa de chave de config
inexistente (§248); E2E contra o dublê: semear um feedback, rodar o fluxo,
o agente propõe (gateway falso determinístico), a tela mostra, Avançar cria
a solicitação E aplica, a auditoria registra os dois passos, e a aba PDCA
mostra o feedback tratado. Rodar SEM permissão de aplicar: falha nomeada no
rastro, solicitação fica pendente (aprovável pela aba, como hoje).

### Fatia H — a galeria: onde fluxos e screens moram (D14)

> Pedido literal: *"precisamos planejar onde as screens vão morar… acho que
> simplificaria bastante ter um menu com screens e o que já existe de
> fluxos (talvez com outra tela antes, busca filtrada, ícones grandes e
> avatares/nomes editáveis)"*. Depende de C (screens declaradas existirem);
> a galeria SÓ de fluxos pode nascer antes, junto de A/B, se ajudar.

**A porta**: o item de menu "Fluxos de integração" (e `#/fluxo` sem id)
passa a abrir a **GALERIA** — não o canvas. Cards grandes em grid (o molde
visual é o dos cenários da JourneyModal): um por FLUXO (ícone/avatar +
nome + selo `derivado`/`declarado`/`sombreando` + nº de nós + última
execução ok/falhou) e um por SCREEN declarada (ícone + nome + "usada em N
fluxos"). Busca filtrada no topo (nome, tipo). Clique no fluxo → canvas
naquele fluxo (`#/fluxo/<id>`, já mandável); clique na screen → editor com
preview (`#/config/telas/<id>`). Botões "+ Novo fluxo" / "+ Nova screen"
vivem na galeria; o seletor dropdown do canvas continua como troca rápida.

**Avatar/nome editáveis**: `Fluxo.icone?: string` e
`TelaDeclarada.icone?: string` — **emoji** (o precedente dos rostos dos
papéis: zero asset, legível nos dois temas), editável na própria galeria
(clicar no avatar abre um input curto; nome idem, gravando pelo caminho de
salvar existente — fluxo DERIVADO não edita: "editar uma cópia" continua
sendo a porta, com o selo da §386). Normalizar tolera ausência; default por
família (a esteira ganha um padrão, ex.: 🤖).

**Interação com screens (a dúvida em aberto do usuário, respondida
parcialmente)**: em v1 a screen "roda" DENTRO de um fluxo (stage,
fatia B) — a galeria dá a ela endereço, cara e edição; o card oferece
"testar" abrindo o preview do editor com dados de exemplo. Screen como
app standalone (rodar sem fluxo, direto da galeria) tem SPEC própria
registrada — **SPEC-111** — a implementar depois das fatias B/C/H, com o
desenho provável (fluxo implícito de um nó) já esboçado lá.

**Provas**: E2E: galeria lista a esteira derivada com selo, busca filtra,
renomear/trocar o emoji de um fluxo declarado persiste e sobrevive a F5,
clique abre o canvas no fluxo certo; screen declarada aparece e o clique
abre o editor. §248: quebrar o filtro da busca → o teste da busca fica
vermelho. Ajustar E2Es que hoje esperam `#/fluxo` abrir direto no canvas
(medir com grep antes: `goto("/#/fluxo")` aparece em vários specs — decidir
se `#/fluxo` legado redireciona para a galeria e os specs usam
`#/fluxo/<id>`, documentando no JOURNEY).

## 4.x O caso-norte (para onde tudo isto aponta)

Nas palavras do usuário: *"no futuro, schedulers que buscam dados em
integrações como por exemplo Jira, consolidam em tabelas e geram reports
com agentes"*. Esse fluxo, desenhado com as primitivas desta SPEC + a
SPEC-108:

```
gatilho(agendamento, fatia E)
  → integração externa Jira, paginada (SPEC-108: laço/agregação)
  → transformação (existe)
  → banco — gravar na tabela de consolidação (SPEC-108: escrita; a
    consulta é a fatia D)
  → agente gera o report (existe)
  → publicação/Teams (existe / SPEC-108)
  → [opcional] tela de revisão antes de publicar (fatia B)
```

Nenhuma fatia desta SPEC existe por si — cada uma é um pedaço deste
desenho. Quando a 110 fechar, o que falta para o caso-norte é exatamente o
recorte da SPEC-108: laço/paginação, escrita em banco, Teams. Manter este
caso como teste de mesa ao decidir contratos: se uma decisão de fatia
tornar este fluxo impossível de fiar, a decisão está errada.

## 5. O que esta SPEC NÃO faz (e onde fica)

- Teams webhook, Jira paginado (laço), Mongo, escrita em banco → SPEC-108
  (`projeto_spec108_integracoes_reais.md` na memória).
- Condicionais/branches e laços como nós → medir demanda depois do laço do
  Jira; não desenhar antes do caso real.
- Retornar re-rodando o nó anterior automaticamente (D2) — dívida declarada.
- Multi-instância do runner (D7) — dívida declarada.
- Merge por campo na quebra (corrida §250) — dívida antiga, fora daqui.
- Dono de exportador/tokens no RBAC; SPEC-97 fatia B — dívidas antigas,
  NÃO tocar sem perguntar.

## 6. Riscos nomeados

- **R1** Execuções suspensas em tela acumulando por time — a listagem de
  execuções já existe; a fatia B deve mostrar as pendentes do fluxo aberto
  (como o gate faz) e o Retornar/descartar as encerra. Não inventar GC.
- **R2** SQL arbitrário: read-only + timeout + LIMIT + parâmetros são o
  contrato v1; escrita só com desenho próprio (SPEC-108).
- **R3** O nó extra de gatilho muda contagens em E2Es e no `fluxo-de-funcoes`
  (esteira 6→7 nós): varrer ANTES de rodar a suíte, não depois de 3 rodadas.
- **R4** `estado` novo em `fluxo_execucoes`: conferir CHECK constraint na
  migração 0001+ antes de assumir texto livre.
- **R5** A tela `documento` toca a corrida §250 (autosave×escrita-externa):
  a barra de stage NÃO grava a quebra — só continua/retorna a execução.

## 7. Perguntas que já têm resposta (não reabrir)

- "Gatilho vira obrigatório?" Não (D8) — fábrica desenha, declarado antigo
  tolera, validação recusa só a duplicidade.
- "A tela edita a demanda?" Não (D9/R5) — telas mostram e decidem; quem grava
  na demanda continua sendo o caminho existente (aplicarRespostasNaDemanda).
- "Screen builder com layout livre?" Não v1 (D5) — blocos empilhados; layout
  é evolução com uso.
- "Confirmação (§5.5) muda?" Não — o gate por nó continua; a tela é um nó
  com saída, o gate é uma pausa após qualquer nó. Os dois coexistem.
- "A demanda vira acesso Postgres cru?" Não (D11) — ler/gravar são operações
  nomeadas com as invariantes dentro; o conector de banco é para dados
  externos.
- "Remove o refId legado `projeto`?" Não nesta SPEC — deprecado com aviso;
  a morte segue a régua da casa (só com prova de que nenhum fluxo salvo o
  usa, rodada própria).
- "A aba PDCA sai do menu?" Ainda não (D12) — ela é administração do laço;
  medir uso depois que o componente existir.
- "Fluxo grava configuração direto?" Não (D13) — o fluxo PROPÕE (a mudança
  como dado, SPEC-39/45) e a tela aprova; aplicar é a máquina existente,
  determinística e auditada. Escrita direta de config por fluxo não entra
  nem com permissão — o rastro de aprovação é o produto.
- "Onde as screens moram?" Na GALERIA (fatia H): card com ícone/nome
  editáveis, clique abre o editor; em execução elas aparecem pelo stage do
  fluxo (fatia B). Screen standalone (rodar sem fluxo) é evolução anotada,
  fora desta SPEC.
