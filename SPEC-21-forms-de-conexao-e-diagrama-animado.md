# SPEC-21 — Forms de conexão + diagrama animado exportável

**Depende de/relacionado a:** SPEC-20 §8 (identificou a lacuna de `edgeTypes` sem `spec`), SPEC-14 (especificação de entrega, de onde vem `Atividade[]`/`Diagrama` usados aqui), SPEC-01 §9 (campo tipo lista / `FieldSpec`).

**Status: implementado.**

---

## 1. Contexto

Depois de fechar o checklist de processo/técnico (SPEC-20), o usuário confirmou dois pedidos, sinalizados como o que mais incomoda hoje na configuração:

1. **Forms de conexão** — dar aos tipos de aresta a mesma capacidade de campo customizado que os tipos de nó já têm.
2. **Especificação final com diagrama animado** — não pra revisar checklist, mas pra facilitar a **compreensão da arquitetura**: um HTML único, interativo, que anima o fluxo de dados entre os nós e, ao clicar, revela as tasks/histórias relacionadas.

## 2. Item 1 — Forms de conexão

`EdgeTypeConfig` (`packages/engine/src/config/types.ts`) ganhou `spec?: FieldSpec[]` — mesmo tipo que `NodeTypeConfig.spec`. `Aresta` (`model/types.ts`) ganhou `spec?`/`specNA?: Record<string, ValorSpec | JustificativaNA>`, espelhando `No`.

- `camposVisiveisAresta()` (novo, `spec/campos.ts`) devolve todo o `spec` do tipo sem avaliar `when` — `avaliarCondicao` pressupõe um `No`, e os operadores de hoje (`nodeType`, `hasIncomingEdge`...) não têm semântica decidida pra aresta. Limitação conhecida e documentada, mesma disciplina do `when` de `ItemProcesso` (SPEC-20) não avaliado.
- `validator.ts` valida `edgeTypes[tipo].spec` (referências de `default` a chaves existentes) num bloco paralelo ao de `nodeTypes`; `when` fica de fora pela mesma razão.
- `PropertiesPanel.tsx` teve seu dispatcher de campo (`FieldControl`) **exportado** — `EdgePanel.tsx` reusa exatamente o mesmo componente pra renderizar `config.edgeTypes[aresta.type]?.spec`, escrevendo em `aresta.spec` via `definirValorSpecAresta` (novo em `useQuebra.ts`). Sem N/A/confirmar-descartar/prontidão: esse aparato não existe pra arestas no engine hoje (ninguém pediu semáforo de conexão), então o mecanismo fica no essencial.
- Nova aba **"Campos por tipo de conexão"** em `ConfigScreen.tsx` (`CamposArestaTab.tsx`) — mirror de `CamposNoTab.tsx` (global vs. time, sobrescrever campo padrão, `+ Adicionar campo`), **sem** o editor de `type: "lista"`/`itemSpec`: campo repetível numa conexão é caso hipotético que ninguém pediu ainda.
- Persistência: **só o caminho local** (`config/campos-aresta.json` + bloco novo em `packages/cli/src/commands/openApiLocal.ts`, mesmo padrão de `campos-no.json`). Decisão explícita: **não** replicar em `packages/server` — o server está dormente por escolha do usuário ("Docker e Terraform vamos manter, um dia pode ser usado"), sem receber feature nova.
- `loadConfig.ts` mescla `campos-aresta` efetivos em `edgeTypes[tipo].spec` (mesma regra de override que já existe pra `nodeTypes`).

Exemplo ilustrativo na config real: `edgeTypes.http.spec` ganhou um campo `timeoutMs` (number).

## 3. Item 2 — Diagrama animado exportável

### 3.1 Protótipo antes de código real

Por pedido do usuário ("antes de mexermos no código real, com dados mockados"), o primeiro passo foi um HTML standalone com dados fake (`_prototipos/diagrama-animado-mock.html`, gitignored) — validar visual e interação sem risco. Duas rodadas de ajuste vieram daí:

1. **Painel de item mostra prontidão, não só valor.** Cada campo ganhou status (verde=especificado, amarelo=a confirmar, vermelho=pendente) — o pedido foi "dá pra ver tudo que já foi especificado ou que ainda está pendente", não só uma lista plana.
2. **Pan/zoom.** "Não consigo movimentar como no nosso canvas" — arrastar pra mover, rolar pra zoom, controles +/−/reset, mesmo modelo do React Flow (transform num `<g>`, coordenadas dos nós continuam fixas).
3. **Modo sequencial.** "Seria importante poder ver essa animação de forma sequencial... roda automático, ou vai avançando/voltando com next/previous" — igual à demo automática do app: barra com ⏮/▶‖/⏭, cada passo escurece tudo menos a aresta atual + os dois nós envolvidos, seleciona-os no painel.
4. **Timing.** "Mudou muito rápido" — intervalo entre passos dobrado (2.6s → 5.2s).
5. **Esclarecimento sobre "vai e volta":** uma conexão `readwrite` anima duas bolinhas simultâneas (leitura E escrita independentes) — não é request/response. Um padrão de request/response de verdade (sai, chega, *depois* volta) seria um terceiro tipo de fluxo sequencial, não implementado nesta rodada (ver §5).

### 3.2 Arquitetura da versão real

Nova função pura `gerarDiagramaHtml(atividades, diagrama, config, opcoes?)` em `packages/engine/src/diagrama-html/gerarDiagramaHtml.ts` — mesmo princípio de `gerarEspecificacaoEntrega`: string in/out, zero dependência nova, `packages/engine` continua sem framework. Reusa `nosDeOrigem()` (agora exportada de `gerarEspecificacaoEntrega.ts`) pra montar `nodeIdParaItens`.

O HTML gerado embute:
- `DADOS` (um objeto JSON com nós/arestas/itens/mapa/legenda) — a única parte que muda por diagrama.
- CSS e JS **estáticos** (o mesmo renderizador SVG+pan/zoom+sequencial do protótipo, generalizado pra ler de `DADOS` em vez de arrays hardcoded) — nunca duplicados entre gerações, só os dados variam.

**Direção do fluxo animado não é hardcoded por verbo** — violaria "nada hardcoded no engine". Novo campo opcional `EdgeTypeConfig.fluxo?: "forward" | "reverse" | "bidirectional"` (default `"forward"`, configs existentes continuam funcionando sem mudança):

| campo | quando | exemplo real |
|---|---|---|
| `forward` (default) | fluxo sai de `source` pra `target` | `http`, `publishes`, `writes` |
| `reverse` | o dado sai do recurso em direção ao nó (`target`→`source` na animação) | `consumes`, `reads` |
| `bidirectional` | duas direções simultâneas | `readwrite`, `pubsub` |
| `estatico` (calculado, não configurável) | `gerarAtividade: false` — aresta só topológica | `binding` |

Nível de prontidão por item (semáforo verde/amarelo/vermelho, cor no painel lateral) é o **pior** entre os nós de origem da atividade — reusa `calcularProntidao()` já existente, não reinventa nada.

Interatividade sem framework: um único blob JSON (`nodeIdParaItens`) + um listener de clique delegado no SVG — sem virtual DOM, sem client-side templating (os cards já vêm com os dados prontos).

**Sem PNG/imagem.** Decisão explícita: rasterizar exigiria headless browser (contradiz o CLI zero-dependência do SPEC-17) ou lib de canvas nova, e perderia a animação — o próprio ponto do pedido. HTML sozinho já satisfaz "bonito, portátil, funciona fora do app".

### 3.3 Integração

- **`ReviewScreen.tsx`**: botão "🔀 Ver diagrama animado" troca a lista de itens por um `<iframe srcDoc={html}>` — o MESMO `gerarDiagramaHtml(...)` alimenta o preview ao vivo e o botão "Baixar diagrama (.html)" (`baixarArquivoTexto`), nunca duas fontes de verdade.
- **CLI (`implementar.ts`)**: quando `--out algo.md` é passado, sempre escreve `algo.html` junto (mesmo nome-base, extensão trocada) — sem flag nova, o par é sempre o par. Sem `--out` (stdout), não gera HTML (aviso de uma linha em stderr).

## 4. Config

`config/diagrama.example.json` (+ mirror `packages/cli/templates/diagrama.json`, byte-idênticos): `consumes`/`reads` ganharam `fluxo: "reverse"`; `pubsub`/`readwrite` ganharam `fluxo: "bidirectional"`; `http` ganhou `spec: [{ key: "timeoutMs", ... }]` como exemplo ilustrativo de campo de conexão.

## 5. Fora de escopo, identificado

- **Fluxo `request-response` (sequencial: sai, chega, *depois* volta)** — distinto de `bidirectional` (simultâneo). Relevante pra `http`/`grpc`/`graphql`, não implementado — registrado a partir da pergunta do usuário no protótipo.
- **`when` em campo de aresta** — não avaliado (nem no `camposVisiveisAresta` nem no validador), mesma disciplina do `ItemProcesso.when` (SPEC-20).
- **`type: "lista"`/`itemSpec` em campo de aresta** — removido do escopo de `CamposArestaTab`/persistência local; ninguém pediu campo repetível numa conexão.
- **`packages/server` não recebe as duas features** — dormente por decisão do usuário, sem escopo nesta rodada nem planejado.

## 6. Correções pós-publish (achados reais, mesma sessão)

Dois bugs reais, achados só ao usar a feature de verdade (não pelos testes automatizados, que mockavam demais pra pegar os dois):

1. **Modo hospedado quebrava no carregamento inteiro da config.** `loadConfig.ts`/`App.tsx` passaram a chamar `apiCamposAresta.listar(timeAtivo)` incondicionalmente — mas `packages/server` nunca ganhou a rota `/campos-aresta` (decisão deliberada, §2). Um 404 ali rejeitava o `Promise.all` inteiro, e qualquer pessoa no modo hospedado via só "Não foi possível carregar a configuração", sem nunca chegar no canvas. Corrigido com `.catch(() => [])` nos dois pontos de chamada (ausência da rota = "sem campos customizados de aresta", nunca erro fatal) — mesmo espírito de `buscarJsonOpcional` já usado pra `regras.json`. A aba "Campos por tipo de conexão" também ganhou um `mostrarCamposAresta={modo === "local"}` (inverso de `mostrarMembros`), pra não expor uma tela que sempre falharia ao salvar no modo hospedado. Achado via `packages/web/e2e/derivar-e-revisar.spec.ts` rodando contra o server de verdade (Postgres via Docker) — o teste, que já existia, começou a falhar sozinho ao testar de verdade.

2. **Diagrama animado renderizava em branco com dados reais.** `gerarDiagramaHtml()` usava um `viewBox` fixo (`"0 0 1000 700"`), mas `No.x`/`No.y` são livres (o usuário arrasta sem limite no canvas React Flow) — qualquer diagrama cujos nós não coubessem por acaso nessa caixa ficava com o SVG tecnicamente correto (dados certos, sem erro de JS) mas **visualmente vazio**, sem nenhuma pista de que havia algo fora da vista. Reportado pelo usuário como "clico no ícone de play [Reproduzir em sequência] pra expandir um item e vai pra uma página em branco". Corrigido calculando o `viewBox` a partir do bounding box real de todos os nós (+80px de margem) em vez de um valor chutado — validado contra o cenário `credito-completo` de verdade (nós até x=1000, que ultrapassavam a caixa antiga) via Playwright, screenshot confirmando os 8 nós visíveis e o modo sequencial funcionando ponta a ponta.

## 7. Validação

- Testes novos: `camposVisiveisAresta` (2), validator edge-spec-default (1), `EdgePanel` renderizando/editando campo de aresta (3), `CamposArestaTab` (6), `openApiLocal` `/campos-aresta` CRUD (3), `gerarDiagramaHtml` (7 — posição/cor, direção de fluxo por `fluxo`, `nodeIdParaItens`, nível de prontidão, legenda, diagrama vazio), `ReviewScreen` diagrama animado (3), CLI par `.html`/`.md` (2). Regressão completa: engine 115, web 126, cli 29 — 270 testes verdes.
- Validação real: `gerador implementar` sobre o cenário `credito-completo` (8 nós, 6 arestas, 14 atividades) gerando `diagrama-real.html` de verdade, aberto no navegador — animação, pan/zoom, clique em nó e modo sequencial conferidos contra dado real, não só teste automatizado.
