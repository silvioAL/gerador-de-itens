# SPEC-06 — CLI, skill do Claude Code e empacotamento

**A skill do Claude Code (§3) foi removida.** Decisão registrada em SPEC-17 §11: o fluxo mudou pra dois subagentes externos (um deles com MCP) em vez de uma skill instalável — `skill/gerador-de-itens/` não existe mais no repositório. §3 abaixo fica como registro histórico do que foi construído e por quê, não como estado atual.

**Depende de CONTEXTO-E-ARQUITETURA.md** · §2 a §5 registram mecanismo já implementado (`packages/cli/`, `Dockerfile`, import do Graphify) — ver "status" no início de cada seção.

---

## 1. Objetivo

Fazer a ferramenta ser algo que um agente (Claude Code) consegue **usar em nome de alguém** durante uma sessão de planejamento — não só uma SPA que um humano abre no browser. Isso exige um caminho headless (sem UI, sem clique) que produza o mesmo resultado determinístico que o editor visual produz.

## 2. CLI (`packages/cli`) — status: implementado

### 2.1 Por que bundle único em vez de pacote publicado

`@gerador/engine` é TS-fonte sem build próprio (decisão de CONTEXTO-E-ARQUITETURA.md §5.1 — só existe um runtime, não precisa de dist). Um CLI compilado com `tsc` puro não consegue rodar sob Node comum porque o Node não resolve `.ts` como módulo ESM padrão. A solução foi empacotar com `tsup`/esbuild, forçando `noExternal: ["@gerador/engine"]` (por padrão o bundler trata dependências do `package.json` como externas — é exatamente esse comportamento default que quebra aqui, porque não há nada para resolver em runtime). O resultado é um único `dist/cli.js` de ~23KB, sem `node_modules` para rodar.

### 2.2 Os cinco comandos

- `derive <quebra.json> [--out arquivo]`: o comando que um agente realisticamente chama sozinho na maioria das sessões. Lê `config/*.json` do diretório atual, deriva, escreve `.md` (com refinamento técnico, se `config/regras.json` existir) ou `.csv`.
- `implementar <quebra.json> <chave-ou-rótulo> [--out arquivo]`: pega o contexto completo de UMA atividade (especificação dos nós envolvidos + refinamento técnico) sem reler o diagrama inteiro — pensado para uma sessão de dev atacando um item específico do backlog já derivado. Adicionado depois de §2 ter sido escrito (ver JOURNEY.md §11), quando ficou claro que "derivar o backlog" e "pegar contexto pra codar um item" são dois momentos diferentes de uso.
- `init [diretório]`: scaffold de `config/` a partir de templates embutidos em `packages/cli/templates/` — nunca sobrescreve o que já existe, porque `init` é ponto de partida, não reset.
- `open [--port]`: sobe um servidor estático loopback servindo `packages/web/dist` — não é "modo servidor", é abrir a mesma SPA sem precisar de `npx vite`.
- `import-graphify <graph.json> [--out arquivo]`: rascunha nós `existente`/`extraído` a partir de um projeto já mapeado pelo Graphify — ver §5.

Nenhum comando decide nada que a UI ou a config já não decidam — cada um só muda a forma de acessar o mesmo mecanismo determinístico (headless vs. visual, diagrama inteiro vs. uma atividade).

### 2.3 O que `derive` valida antes de derivar

`validateConfig` roda sobre `config/diagrama.json` do projeto alvo antes de qualquer derivação — o mesmo "falhar alto" do resto do sistema. Um projeto com config quebrada não produz um backlog incompleto silenciosamente; recusa rodar e aponta o campo.

## 3. Skill do Claude Code (`skill/gerador-de-itens/`) — status: implementado

### 3.1 Por que o wrapper resolve o caminho do CLI em vez de assumir instalação global

Este projeto não está publicado no npm — é um repositório local. `skill/gerador-de-itens/scripts/gerador.ps1` resolve o CLI via `$env:GERADOR_REPO` (default: onde este repo vive nesta máquina) e builda na hora se o bundle não existir. Isso é o trade-off aceito de ser uma ferramenta pessoal, não um pacote distribuído — portabilidade real (rodar em qualquer máquina sem configurar `$env:GERADOR_REPO`) fica como extensão futura via publicação no npm, não implementada agora.

### 3.2 Por que o script é ASCII puro

Achado durante a implementação, não decisão a priori: PowerShell 5.1 lê arquivos `.ps1` sem BOM como ANSI por padrão. Caracteres acentuados dentro de uma string literal corrompem o parse do arquivo inteiro (erros de "string sem terminador" em linhas muito depois do caractere real problemático — o parser perde sincronia). O `SKILL.md` (lido como texto puro pelo agente, nunca executado) não tem essa restrição; só `.ps1` executável precisa ficar em ASCII.

### 3.3 Regras que o SKILL.md marca como não-negociáveis

- Nunca inventar atividade a partir de descrição solta — sempre exigir (ou ajudar a montar) um diagrama real primeiro.
- `config/` do **projeto alvo** é a fonte da verdade dos tipos de nó disponíveis, nunca presumir os tipos deste repositório.
- Ciclo/conflito reportado por `derive` é para explicar ao usuário, nunca para "resolver" removendo dependência silenciosamente.

## 4. Docker — status: implementado e validado

`Dockerfile` multi-stage: builda `packages/web` no contexto do monorepo (precisa da raiz como build context, não `packages/web` isolado, porque o workspace do npm resolve `@gerador/engine` via link) e serve o `dist/` estático via nginx, com `nginx.conf` próprio (não o `default.conf` da imagem `nginx:alpine`) — necessário porque o config default não manda `Cache-Control` nenhum em `/config/*.json`, e esse endpoint muda a cada rebuild deste projeto; sem o header, o browser aplicava cache heurístico e continuava mostrando config velha até um hard refresh (achado em uso real, ver JOURNEY.md §18.2). `docker-compose.yml` expõe porta 8080→80.

Validado nesta máquina depois de instalar Docker Desktop (exigiu WSL2 + reinício, feito com confirmação explícita do usuário): `docker compose build` + `docker compose up` serviram o app real em `localhost:8080`. Importante: `docker restart`/o botão de restart do Docker Desktop reusa a imagem com que o container foi criado — não repuxa nem recria a partir de uma imagem nova. O comando certo depois de qualquer mudança de código é `docker compose up -d --build` (rebuild + recria o container, um passo só).

## 5. MVP5 — import do Graphify — status: implementado

Esta é a peça que fecha a "jornada 2" descrita em CONTEXTO-E-ARQUITETURA.md §3 (projeto existente → abrir código → agregar informação).

### 5.1 Achado que mudou o desenho original

O desenho original (abaixo do texto riscado nesta seção antes desta revisão) presumia que o Graphify anota cada nó com um "tipo de entidade" semântico. Ao ler o `graphify-out/graph.json` real deste próprio repositório antes de implementar, isso se provou falso: o Graphify produz grafo no formato node-link do NetworkX (`nodes`/`links`/`hyperedges`), sem nenhum campo de tipo de entidade, e as arestas (`relation`) descrevem **estrutura de código** — `contains`, `extends`, `imports`, `imports_from`, `references`, `re_exports`, `calls` — não relações de arquitetura (`publica`/`consome`/`chama`). Mapear `relation` de código para `edgeTypes` do `diagrama.json` seria inventar uma correspondência que não existe nos dados.

### 5.2 Desenho implementado

- `packages/engine/src/adapters/graphify/importarGrafo.ts`: função pura `(grafoGraphify, mapeamento) -> { nodes, naoMapeados }`. Para cada nó do Graphify com `source_file`, aplica a **primeira regra de regex que casar** contra o caminho do arquivo (`config/graphify-mapping.json`, lista ordenada de `{ padrao, tipo }`) e gera um nó `status: "existente"`. Múltiplos nós do Graphify apontando para o mesmo arquivo colapsam em um único nó do diagrama (o Graphify frequentemente emite mais de um nó AST por arquivo). Arquivo sem regra que bata vai para `naoMapeados` — nunca vira nó com tipo adivinhado.
- **Nenhuma aresta é gerada.** Consequência direta do achado do §5.1: como as relações do Graphify são de código, não de arquitetura, o importador escreve `edges: []` e deixa a modelagem de conexões para o usuário no canvas.
- `gerador import-graphify <graph.json> [--out arquivo]`: leitura de arquivo para arquivo, puro, implementado em `packages/cli/src/commands/importGraphify.ts`. Não chama o Graphify programaticamente — o fluxo é `/graphify .` rodado à parte, depois este comando sobre o `graph.json` resultante, escrevendo um rascunho de `quebra.json` para revisão manual antes de abrir no canvas. Não recebe mais um nome de produto (removido do modelo — SPEC-08 §4).

### 5.3 Validação

Testado com dado real: rodado contra o `graphify-out/graph.json` deste próprio repositório (562 nós de código, extraídos via AST). Com as regras de exemplo em `config/graphify-mapping.example.json` (pensadas para repositórios de serviço com pastas `controllers/`, `rabbit/`, `migrations/`, etc.), apenas 1 dos 68 arquivos casou — esperado, já que este repo é a própria ferramenta, não um serviço de domínio. O comando não travou, não adivinhou tipo para os 67 restantes, e listou todos em `naoMapeados`. 64 testes de engine (`importarGrafo.test.ts` incluso) e a suíte completa (web + E2E) seguem verdes depois da integração.

### 5.4 Correção posterior: matching só por caminho ficava restritivo demais em código real

Testando contra um projeto Camunda real (não este repositório), quase nada casou — nomes de classe reais (`AprovacaoDelegate.java`, `PedidoProducer.java`) não seguem convenção de pasta nenhuma, e o `.bpmn$` sozinho não cobre o `.java` do delegate, que é onde a lógica de negócio de fato mora. `RegraMapeamentoGraphify` (§5.2) ganhou dois campos opcionais além de `padrao`: `padraoLabel` (regex contra o nome da classe/símbolo) e `padraoImporta` (regex contra o que a classe importa/estende/implementa, lido das arestas `imports`/`imports_from`/`extends`/`implements` que o §5.1 já tinha mapeado como estrutura de código disponível). Dentro de uma mesma regra, qualquer um dos três sinais definidos é suficiente (OR, não AND) — continua "primeira regra que bate vence", só testando mais sinais por regra. `config/graphify-mapping.example.json` também deixou de cobrir só 7 dos 16 tipos de nó — agora tem regra pra todos, exceto `rabbit-exchange` (deliberadamente fora: raramente é uma classe 1:1, melhor deixar pro usuário modelar à mão). Engine ganhou 6 testes novos; regressão completa e `config/graphify-mapping.json` de `packages/cli/templates/` mantido byte-idêntico ao exemplo.
