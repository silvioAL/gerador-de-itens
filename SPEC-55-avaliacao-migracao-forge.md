# SPEC-55 — Avaliação: migrar o Gerador para um app Forge (Jira), com Rovo no MVP

> ## ⛔ DECIDIDO: a migração **não** vai acontecer
>
> Decisão do usuário em **14/08/2026**, textualmente: *"não vamos migrar,
> decidido"*. **Motivo não declarado.**
>
> Correção de um erro meu: eu havia registrado aqui que a decisão vinha da
> credencial `silvioaltr@gmail.com` não ser admin da Atlassian. Não era —
> a frase do usuário era sobre o **cadeado dentro do próprio Gerador**
> (defeito de RBAC na tela, corrigido no §220), e nada tinha a ver com o
> Forge. A decisão continua valendo; a causa que atribuí a ela, não.
>
> **Nada abaixo deve ser lido como plano.** O roteiro da §9 não está em fila,
> não está adiado e não tem dono. O produto segue no modo hospedado da SPEC-33.
>
> O documento fica no repositório como **pesquisa de plataforma**, não como
> intenção: se a pergunta voltar — com outra credencial, outra empresa ou outro
> ano — os números da §2 e o mapeamento da §4/§5 são o ponto de partida, e o que
> precisa ser refeito é a checagem de datas (a Forge LLMs API estava em Preview,
> e Preview muda).

> **Status original: avaliação, não decisão de construir.** Este documento
> existe para responder "dá pra fazer, quanto custa, e o que se perde" com
> números verificados na documentação da Atlassian de agosto/2026 e no código
> deste repositório. Nenhuma linha de produção muda por causa dele.

Pedido original: *"pesquisa sobre as novidades do Jira e como funciona
publicação de applications, avaliar esse projeto no estado atual (…) a intenção
é migrar para um app Forge (…) sendo um app Forge vai integrar inicialmente
apenas com o Rovo no MVP, precisaremos de todas as demais features atuais (…)
avaliar como podemos fazer com a parte do banco de dados. Essa aplicação não
está em uso e sim em desenvolvimento (…) mas precisamos de suíte de testes e
algum meio de fazer o CI/CD"*.

Esclarecimento posterior, que fixa o cenário: *"essa é uma aplicação que
gostaria de pôr em um dev space da empresa onde trabalho, não publicar para
qualquer pessoa instalar (…) publisher e usuário seriam a mesma pessoa"*.
**App interno, não produto de Marketplace** — ver §2.9.

---

## 1. Resumo executivo

**Cabe.** A migração é viável e a arquitetura atual — hexagonal, portas em
`@gerador/aplicacao`, engine puro sem I/O — é o que torna isso um trabalho de
trocar adaptadores em vez de reescrever o produto. Cerca de **15 mil das 55 mil
linhas** (engine + aplicação + llm) atravessam sem tocar em nada.

Três coisas mudam de verdade, e nenhuma é o banco:

1. **A esteira de agentes não roda em 25 segundos.** Esse é o teto de uma
   invocação Forge disparada por usuário. Hoje um único item leva ~3min40 em
   CPU. A esteira precisa virar processamento assíncrono (`async events`, teto
   de 900s) com a tela consultando progresso. É o maior redesenho da migração —
   maior que o banco.
2. **Voz e imagem não cabem no MVP Rovo-only.** A Forge LLMs API é
   **texto puro** hoje: sem visão, sem áudio. O 🎤 Falar (Whisper) e o 🖼
   Anexar imagem saem do escopo do MVP, ou exigem egress externo declarado /
   Forge Containers (Preview) — que é justamente o que o "só Rovo" pretende
   evitar.
3. **Metade das tabelas some porque o Jira já as tem.** Organizações, times,
   usuários e boa parte do RBAC deixam de ser nossos: a instalação do app já é
   o tenant, e a identidade vem do Atlassian.

O banco, que era a preocupação declarada, é o item **mais barato** desta lista:
sem dado em produção, é recriar 23 tabelas em Forge SQL (TiDB, dialeto MySQL) e
trocar o driver do Drizzle — que já é o ORM usado aqui.

E, por ser **app interno** (publisher e usuário são a mesma empresa), some a
metade cara da lista de preocupações de um app Forge: nenhuma revisão de
Marketplace, nenhum escopo a justificar para a Atlassian, nenhum licenciamento.
Sobra **uma** pendência não-técnica, e ela bloqueia tudo depois do ambiente de
desenvolvimento: **o Developer Space precisa ser da empresa**, com billing admin
da empresa, porque é ali que a conta do Forge (inclusive a de LLM) é emitida.
Começar por isso.

---

## 2. O que mudou na plataforma Atlassian (o que importa pra nós)

### 2.1 Jira — releases sazonais de 2026

| Novidade | Por que nos interessa |
|---|---|
| **Rovo incluído nos planos** (Teamwork Collection: Jira + Confluence + Loom + Rovo) | O público-alvo do app já tem IA disponível — o Gerador não precisa levar chave de API nenhuma |
| **Delivery Agent** (agente nativo pra coordenação recorrente) | Concorrência/vizinhança: define a expectativa de UX de um agente dentro do Jira |
| **Criação de espaço via Rovo em linguagem natural** | Precedente direto do nosso caso: descrever → gerar estrutura de trabalho |
| **Campos de fórmula escritos por IA** | Idem: IA que escreve *configuração*, não conteúdo |
| **Work items conectados a Atlassian Projects** | É pra onde nossos itens derivados deveriam apontar |

A leitura estratégica: o Jira de 2026 já normalizou "IA que gera estrutura de
trabalho". O Gerador deixa de ser exótico e passa a competir por atenção nesse
espaço — com a diferença defensável de que a **derivação aqui é determinística**
(`derivar()` é função pura), não um LLM adivinhando itens. Isso é vantagem de
posicionamento, não desvantagem.

### 2.2 Forge — o que mudou em janeiro/2026

- **Preço por consumo** substituiu as quotas em 01/01/2026. Faturamento mensal
  em arrears, primeira fatura em fevereiro/2026.
- **Developer Space** virou obrigatório: é onde apps, membros do time e
  faturamento vivem. Todo app — Marketplace ou privado — pertence a um.
- **Quotas viraram "limites de plataforma"**: continuam existindo para
  estabilidade, mas não mais como teto anti-abuso.

Franquia mensal gratuita, **por app**:

| Recurso | Franquia grátis/mês | Acima disso |
|---|---|---|
| Funções (compute) | 200.000 GB-segundos | US$ 0,000025/GB-s |
| KVS leitura / escrita | 0,1 GB cada | US$ 0,055/GB (leitura) |
| SQL — duração de compute | 1 hora | US$ 0,143/hora |
| SQL — requisições | 100.000 | — |
| SQL — armazenamento | 730 GB-hora | — |
| Logs | 1 GB | — |
| **LLM** | **0 créditos** | por token, in/out |

> **O único zero da tabela é o LLM.** Todo token gasto pela esteira de agentes é
> cobrado **de quem publica o app**, não de quem instala. No cenário deste
> projeto — app interno, publisher e usuário são a mesma empresa (§2.9) — isso
> deixa de ser questão de modelo de negócio e vira **linha de orçamento
> interno**: a empresa paga o próprio uso, como pagaria por qualquer API de IA.
> Continua precisando ser medido (§10.1), mas o risco muda de "o produto é
> insustentável" para "a conta é maior ou menor do que a alternativa".

### 2.3 Rovo — os módulos disponíveis

| Módulo | Status | O que faz |
|---|---|---|
| `rovo:agent` | **GA** | Registra um agente seu dentro do Rovo/AI Mate. Campos: `key`, `name` (≤30 chars), `prompt`, mais `description`, `icon`, `conversationStarters`, `actions`, `followUpPrompt` |
| `action` | **GA** | A função que o agente pode chamar — é o ponto onde nosso engine determinístico entraria |
| `rovo:agentConnector` | EAP | Registra agente remoto externo (Copilot, Cursor…) dentro do Jira |
| `rovo:mcp` | EAP | MCP |

Um agente do app **só enxerga dados do workspace onde o app está instalado**.

### 2.4 Forge LLMs API — o achado central desta pesquisa

`@forge/llm` (**Preview**, já liberado para produção e Marketplace):

- Modelos **Claude** em três faixas — Haiku, Sonnet, Opus. Nomeados na
  referência: `claude-opus-4-6/4-7/4-8`, `claude-opus-5`, `claude-sonnet-5`.
  Escolha do modelo é **por requisição**.
- `chat()` para troca estruturada, `stream()` para resposta incremental,
  `list()` para descobrir modelos disponíveis em runtime.
- **Tool use** suportado (definições tipadas de ferramenta).
- **Sem chave de API, sem egress**: nada sai da plataforma Atlassian. Isso
  resolve, de graça, o problema que o README hoje resolve com um container
  Ollama ao lado ("se o seu ambiente bloqueia a API do Claude — o caso comum em
  rede corporativa").
- `max_completion_tokens` controla saída. `temperature`/`top_p` **não existem**
  em `claude-opus-4-7`, `4-8`, `opus-5` e `sonnet-5` — omitir.
- **Texto puro. Sem multimodal.** (ver §6.2)
- Declarar `llm` no `manifest.yml` dispara **major version upgrade**: admins das
  instalações existentes precisam revisar e aprovar.

Isto é o que torna o "MVP só com Rovo" concreto: não é uma limitação de
integração, é a substituição inteira de `packages/llm` por uma chamada de SDK.

### 2.5 Armazenamento

| Opção | Status | Para quê |
|---|---|---|
| KVS (`@forge/kvs`) | GA | preferências, config leve |
| Custom Entity Store | GA | dados estruturados com query |
| **Forge SQL** | **GA** | modelo relacional — o nosso caso |
| Object Store | Preview | binários |

Tudo criptografado em disco e **escopado por instalação** (isolamento de tenant
automático). Retenção de 28 dias após desinstalação. O `storage` antigo do
`@forge/api` parou de receber atualizações em 17/03/2025.

### 2.6 Custom UI — a caixa onde o `packages/web` vai morar

- App React/Vite buildado vira **static resource** apontado pelo manifesto.
- Roda em **iframe isolado**, com CSP fechada:
  - **nenhum recurso externo** — sem fonte do Google, sem CDN, sem Sentry;
  - **nenhum `fetch` direto** da tela pra fora — tudo passa por
    `invoke()` do `@forge/bridge` até um resolver;
  - caminhos de asset precisam ser relativos (`./assets/x.png`).
- Cota de deploy semanal de assets: 150 MB (app pago) / 75 MB (grátis).

Limites de recurso: 5.000 arquivos e 100 MB por bundle, 50 bundles por app,
25.000 arquivos e 1 GB no total.

O `packages/web` (30.685 linhas, React + `@xyflow/react`) cabe folgado. React
Flow é bundle local, não CDN — não esbarra na CSP.

### 2.7 Limites de invocação — onde o projeto realmente dói

| Situação | Teto |
|---|---|
| Invocação disparada por usuário | **25 s** |
| Web trigger e módulo `action` | **55 s** |
| **Async events e scheduled triggers** | **900 s (15 min)** |
| Evento de backend remoto | 5 s |
| Memória | 1.024 MB (padrão 512, ajustável via `memoryMB`) |
| Payload de invocação | 5 MB (request do frontend: 500 KB; response: 5 MB) |
| Disco efêmero | 512 MB em `/tmp` |
| Rate | 1.200/min por usuário, 5.000/min por instalação, 30.000/min por app |

### 2.8 Forge Containers (Preview)

Rodar imagem de container como serviço persistente na infra do Forge, com data
residency automática e elegível ao selo "Runs on Atlassian". Já pode ir a
produção e ao Marketplace. `forge tunnel` sobe o container local
automaticamente. **É a porta de saída** para o que não cabe em função (Whisper,
processo longo) sem sair da plataforma — mas com preço de reserva, sem franquia
grátis.

### 2.9 Publicação de applications — e por que o Marketplace não nos interessa

> **Cenário decidido:** o app vive num **Developer Space da empresa onde o autor
> trabalha**, instalado nos sites da própria empresa. Publisher e usuário são a
> mesma organização. Nada disso vai pro Marketplace.

#### Duas etapas que é fácil confundir com dois caminhos

**Publicar (deploy) é sempre CLI. Instalar pode ser por interface.** Não existe
upload de app por tela: o código só chega na plataforma via `forge deploy`,
rodado por uma pessoa ou pela CI. O que a interface resolve é a *outra* metade —
quem instala não precisa de CLI nenhum.

Os caminhos de instalação, para registro:

1. **`forge install` pelo CLI** — direto nos sites da própria empresa, sem
   habilitar compartilhamento nenhum. Serve para desenvolvimento e para quem já
   tem o CLI configurado.
2. **Link de instalação (interface)** — no Developer Console: **Distribution →
   Edit → Sharing**, preencher os dados do app, escolher em quais produtos
   Atlassian ele pode ser instalado, salvar. Isso gera um link. O **admin do
   site** abre o link no navegador e vê uma tela com as informações do app, **as
   permissões que ele pede** e um dropdown para escolher site e produto —
   confirma ali, e a instalação acontece do lado da Atlassian. Atualizações
   depois disso saem pela página **Connected apps** do site. O link pode ser
   regenerado a qualquer momento (os antigos morrem; quem já instalou continua).
3. **Marketplace público** — declarar cada escopo de API com justificativa e
   cada hostname remoto para onde o app manda requisição, com decisão da
   Atlassian em ~1 semana. **Fora de escopo.**

**O desenho recomendado é o 1 para desenvolvimento e o 2 para o resto:** a CI
faz `forge deploy`, o admin instala pelo navegador. Ninguém no time precisa do
CLI além de quem mexe no pipeline.

Restrições do link, todas satisfeitas pelo nosso caso: o app **não pode ser
pago**, **não pode ter `license` no `manifest.yml`** e **não pode ter sido
submetido ao Marketplace**. Vale notar que app Forge **não é compatível com
listagem privada de Marketplace** — privado é por link ou CLI, ponto.

> **Rolling releases amenizam o atrito de escopo.** A plataforma separa o deploy
> do código da aprovação de permissões: o que for compatível sobe enquanto o
> admin ainda não aprovou os escopos novos. Isso torna o major version upgrade
> disparado pelo módulo `llm` menos bloqueante do que "o release para até alguém
> clicar" — mas não o elimina: as capacidades que dependem do escopo novo só
> ligam depois da aprovação.

#### O que cai fora do problema por ser interno

| Preocupação típica de app Forge | No nosso caso |
|---|---|
| Revisão da Atlassian (~1 semana, justificar escopos e hostnames) | **Não existe** |
| Selo "Runs on Atlassian" como argumento de venda | Deixa de ser venda — mas **continua valendo como argumento de segurança interna**, e é o mais forte que temos (§2.9.1) |
| Licenciamento, cobrança de cliente, versionamento público | **Não existe** |
| Egress externo como obstáculo de submissão | **Deixa de ser obstáculo** — muda o custo de voz e imagem (§6.2) |
| Quem paga o LLM | **A própria empresa**, que também é quem usa (§2.2) |

#### O que passa a ser o problema, no lugar

1. **De quem é o Developer Space.** Faturamento do Forge é **por Developer
   Space**, agregado numa conta de cobrança ligada a ele: fatura no dia 1º de
   cada mês, referente ao mês anterior, com autopay se houver meio de pagamento.
   O espaço precisa ser **da empresa**, com um billing admin da empresa — não a
   conta pessoal de quem desenvolve. Isso é ação de procurement/TI, não de
   engenharia, e é a única coisa desta migração que **não** se resolve escrevendo
   código. Vale começar por ela.
2. **Um admin de site precisa instalar** (por interface, ver acima) e aprovar as
   permissões. Adicionar o módulo `llm` ou mudar escopo dispara **major version
   upgrade**, que exige nova aprovação. Sendo interno o admin é um colega, e
   rolling releases evitam que o release inteiro pare — mas é uma pessoa a mais
   no caminho de cada mudança de permissão. Planejar os escopos de uma vez, em
   vez de descobri-los aos poucos, continua sendo o barato.
3. **A revisão de segurança da empresa** substitui a da Atlassian. Diferente em
   forma, não em existência.

#### 2.9.1 O argumento interno mais forte

O README hoje descreve, em três parágrafos, como subir um Ollama em container
"se o seu ambiente bloqueia a API do Claude — **o caso comum em rede
corporativa**". Isso é o produto contornando a política de segurança da
própria empresa que vai usá-lo.

Com `@forge/llm`, o modelo roda **dentro da plataforma Atlassian que a empresa
já aprovou e já usa**, sem chave de API, sem egress, sem hostname novo pra
liberar no proxy. O app deixa de precisar de exceção de rede. Num app interno,
isso vale mais que qualquer selo de Marketplace — é a diferença entre "aprovado"
e "em análise pela segurança há três meses".

Ambientes: `development`, `staging`, `production`, via `forge deploy -e <env>`.

### 2.10 CI/CD de app Forge

Receita oficial, direta:

- Credenciais como variáveis secretas: **`FORGE_EMAIL`** e
  **`FORGE_API_TOKEN`** (token com escopo).
- `forge lint` como portão.
- `forge deploy -e staging` no merge; `forge deploy -e production` em gatilho
  manual.
- `forge install --non-interactive` para instalar sem prompt.
- **Fixar a major do CLI** (`@forge/cli@12`) — sem isso, uma major nova quebra o
  pipeline sozinha.
- `forge settings set usage-analytics true` em cada passo.

A documentação usa Bitbucket Pipelines como exemplo; nada ali é específico de
Bitbucket — traduz direto pro GitHub Actions que já temos.

---

## 3. O projeto hoje — medido, não estimado

Números deste repositório em 14/08/2026 (commit `fd8c0e4`, CI verde):

| Pacote | Arquivos | Linhas | O que é |
|---|---:|---:|---|
| `engine` | 39 | 7.216 | TS puro, zero I/O — modelo, `derivar()`, prontidão, dependências |
| `aplicacao` | 40 | 3.698 | casos de uso + **10 portas** |
| `llm` | 30 | 4.329 | provedores, presets, credenciais, rede |
| `server` | 50 | 8.889 | Fastify, 53 endpoints, 11 adaptadores Postgres, OIDC, RBAC |
| `web` | 134 | 30.685 | React + React Flow |
| **total** | **293** | **~54.800** | |

- **143 arquivos de teste** unitários (vitest) + **32 specs Playwright**
  (66/66 verdes na última rodada).
- CI com dois jobs: `test` (build → typecheck → test → lint, contra Postgres
  real) e `e2e` (Chromium + Postgres efêmero, artefato de screenshot na falha).
- Deploy: Terraform/GCP + Caddy + docker-compose + Infisical, disparo manual.
- **23 tabelas** no Postgres, **18 chaves estrangeiras**, várias com
  `onDelete: "cascade"`.
- Autenticação: OIDC (Google) em produção, `AUTH_MODE=dev` local; sessão
  própria; RBAC próprio (papéis, permissões, organizações, times).

### 3.1 O ativo que decide a viabilidade

`packages/aplicacao/src/portas/` — dez contratos, cada um com um adaptador
Postgres do outro lado:

```
repositorioDeQuebras         repositorioDeCamposNo        cofreDeSegredos
repositorioDeItensGerados    repositorioDeCamposAresta    exportadorDeItens
repositorioDeConfig          repositorioDeStacks
repositorioDeCredenciais     repositorioDeProdutos        repositorioDeTemplateEspecificacao
```

A SPEC-31 pagou esse preço por outro motivo (matar a divergência entre modo
local e hospedado). O retorno chega agora: **migrar de Postgres pra Forge SQL é
escrever `*EmForgeSql.ts` ao lado de `*EmPostgres.ts`**, com os mesmos testes de
contrato apontando pros dois. Sem as portas, isto seria uma reescrita.

---

## 4. Mapeamento feature a feature

Legenda: 🟢 atravessa quase intacto · 🟡 muda de forma · 🔴 não cabe no MVP

| Feature de hoje | No Forge | |
|---|---|---|
| Engine determinístico (`derivar`, prontidão, dependências, ciclos) | Roda igual dentro do resolver — TS puro, zero I/O | 🟢 |
| Canvas React Flow, painel de propriedades, revisão | Custom UI em `jira:globalPage` (item em *Apps* na navegação) | 🟢 |
| Config-driven (`config/*.json`, `validateConfig`) | Igual; documentos de config em Forge SQL | 🟢 |
| Proveniência, semáforo de prontidão, chave estável | Regra de domínio, não muda | 🟢 |
| Exportação em markdown da especificação | Igual | 🟢 |
| **Persistência de quebras/itens/config** | Forge SQL, mesmo Drizzle, driver trocado | 🟡 §5 |
| **Multi-provedor de IA** (`packages/llm`, gateway OpenAI-compat, credenciais no cofre) | Substituído inteiro por `@forge/llm`. `credenciaisIa`, `cofreInfisical`, presets de gateway, teste de conexão — **tudo isso some** | 🟡 §6.1 |
| **Esteira de agentes** (4 agentes × N itens, minutos) | Não cabe em 25 s. Vira `async events` (900 s) + estado de progresso consultável | 🟡 §6.3 |
| Conversa como interface, condução proativa, PDCA | Igual em cima do `@forge/llm` | 🟢 |
| **Autenticação OIDC + sessão própria** | Some. Identidade vem do Forge/Atlassian | 🟡 §5.3 |
| **RBAC próprio** (papéis, permissões, organizações, times, convites) | Some em grande parte: o Jira já tem usuários, grupos e permissões de projeto. O que sobra é o que for *específico do Gerador* | 🟡 §5.3 |
| **Exportação pro tracker** (SPEC-49, adaptador via agente HTTP) | **Melhora**: vira chamada à REST API do Jira com escopo declarado, sem agente intermediário nem endpoint configurável | 🟢 |
| Auditoria | Logs do Forge + tabela própria se precisar de leitura pelo produto | 🟡 |
| **🎤 Voz (Whisper)** | Forge LLMs não faz áudio. Precisaria de Forge Containers (Preview) ou egress externo | 🔴 |
| **🖼 Imagem (visão)** | Forge LLMs é texto puro hoje | 🔴 |
| Ollama local / "IA na sua rede" | Perde o objeto: o modelo é da Atlassian e não sai da plataforma | 🟢 (obsoleto por bem) |
| Docker Compose, Caddy, nginx, Terraform/GCP, Infisical | **Tudo some.** A Atlassian hospeda | 🟢 |

---

## 5. O banco de dados

### 5.1 Forge SQL, com números

TiDB, dialeto **MySQL**. Limites (revisados em 09/06/2025):

| | |
|---|---|
| Armazenamento por instalação | **1 GiB** produção · 256 MiB staging · 128 MiB dev |
| Tabelas | **200** |
| Tamanho de linha | 6 MiB |
| Requisições | 150 DML/s · 25 DDL/min |
| Memória por query | 16 MiB |
| Tempo de query | SELECT 5 s · INSERT/UPDATE/DELETE 10 s · DDL 20 s (62,5 s acumulados/min) |
| Request / response | 1 MiB / 4 MiB |
| **Chaves estrangeiras** | **não suportadas** — `JOIN` funciona, `DELETE` não cascateia |
| Statements | **uma query por statement** |

### 5.2 O que isso custa pra nós, concretamente

**Boa notícia grande:** já usamos **Drizzle ORM** (`drizzle-orm ^0.45.2` +
`drizzle-kit`). Existe `forge-sql-orm`, driver Drizzle para Forge SQL com
suporte a migração de schema, cache em dois níveis e locking otimista. O
`schema.ts` de 23 tabelas migra de `pgTable` para o equivalente MySQL com
esforço mecânico, não conceitual.

**As três coisas que exigem decisão:**

1. **18 FKs, várias com `onDelete: cascade`.** Não existem no Forge SQL. Cada
   cascata vira exclusão explícita no adaptador (ou no caso de uso). Isso é
   trabalho real e é onde defeito silencioso nasce — item órfão de quebra
   apagada. Mitigação: os testes de contrato de porta já existentes passam a
   cobrar "apagar a quebra apaga os itens" como comportamento, não como
   constraint. Sem isso, a garantia sai do banco e não entra em lugar nenhum.
2. **1 GiB por instalação.** Suficiente com folga: um diagrama e seus itens são
   JSON de kilobytes. O risco não é o dado do produto, é log/histórico/PDCA
   crescendo sem poda.
3. **200 tabelas.** Usamos 23. Não é limite.

### 5.3 Tabelas que deixam de existir

Este é o ganho escondido: **a instalação do app é o tenant.** O que hoje é
código nosso vira propriedade da plataforma.

| Tabela hoje | Destino |
|---|---|
| `organizacoes` | **Sai** — a instalação é o escopo |
| `times`, `usuario_time`, `convites_time` | **Provavelmente saem** — grupos e times do Jira |
| `papeis_acesso`, `papel_permissao`, `usuario_papel`, `time_papel` | **Reduzem muito** — permissão de projeto do Jira responde a maior parte; sobra o que for regra do Gerador (ex.: quem pode editar config global) |
| `credenciais_ia` | **Sai** — não há credencial com `@forge/llm` |
| `auditoria` | Fica se o produto lê; senão vira log |
| `quebras`, `itens_gerados`, `campos_no`, `campos_aresta`, `stacks`, `stack_valores`, `produtos`, `produto_glossario`, `produto_time`, `config_documentos`, `especificacao_templates`, `pdca_*`, `solicitacoes_ajuste` | **Ficam** — é o produto |

Estimativa: de 23 tabelas para **~13–15**.

### 5.4 Migração de dados: não existe

*"Essa aplicação não está em uso e sim em desenvolvimento"* — confirmado pelo
JOURNEY. Não há dado de cliente, não há janela de corte, não há script de
migração, não há rollback de dado a planejar. **Este é o momento mais barato que
essa migração jamais vai ter**, e é um argumento a favor de decidir agora em vez
de depois do primeiro cliente.

---

## 6. Os três riscos que decidem o escopo do MVP

### 6.1 `@forge/llm` está em **Preview**

Preview permite produção e Marketplace, mas a API pode mudar. Mitigação natural
e barata: **manter a porta**. Hoje o produto já fala com IA por trás de uma
fronteira (`packages/aplicacao/src/casos-de-uso/ia/pedidos.ts` + `ProvedorIa`).
O adaptador Forge fica atrás da mesma porta. Se a Preview virar, muda um
arquivo. Isto **não** é argumento para manter o multi-provedor no MVP — é
argumento para não apagar a porta ao remover os provedores.

### 6.2 Multimodal não existe na Forge LLMs API

Verificado na documentação de modelos: *"apenas texto de entrada e saída;
suporte multimodal ainda não implementado"*.

Consequência direta, sem rodeio: **o 🎤 Falar e o 🖼 Anexar imagem não entram no
MVP Rovo-only.** As alternativas, todas com preço:

| Caminho | Preço |
|---|---|
| Cortar do MVP | Grátis. Recomendado. |
| Web Speech API no navegador | Sem custo de plataforma, mas dentro de iframe com CSP e sem o ganho de vocabulário medido no README (a transcrição volta a errar "rabitém IKEA") |
| Forge Containers (Preview) com Whisper | Cabe tecnicamente; preço de reserva sem franquia; contradiz "só Rovo" |
| Egress externo declarado | **Barato agora** — sendo app interno (§2.9) não há revisão de Marketplace pra complicar, só a política de rede da empresa. Mas é exatamente a exceção de proxy que §2.9.1 argumenta que o Forge elimina |

**Sendo app interno, a porta fica destrancada.** Não há revisor da Atlassian
para convencer, então declarar egress externo ou subir um container Whisper é
decisão só da empresa. Isso muda a natureza do corte: voz e imagem deixam de ser
*impossíveis* e passam a ser *adiadas por escolha*.

A recomendação continua sendo cortar, por dois motivos: são as duas features
mais recentes e menos exercitadas do produto, e reintroduzir egress no dia 1
joga fora o argumento de §2.9.1 justamente na conversa em que ele mais rende (a
revisão de segurança interna). Registrar como fase 2 — atrelada ou ao dia em que
a Forge LLMs ganhar visão, ou a uma decisão consciente de abrir egress depois de
o app já estar aprovado e em uso.

### 6.3 25 segundos

O número que mais muda o desenho. Medido no próprio README, em CPU: **~3min40
por item com dois campos**, `qwen2.5:7b`. Com Claude via Forge a latência cai
muito — mas a esteira é 4 agentes × N itens, e N não tem teto.

Reescrita necessária:

- Disparar a esteira devolve **imediatamente** um identificador de execução
  (`queue.push`, async event).
- O consumidor roda com `timeoutSeconds` de até 900 e grava progresso por item.
- A tela consulta progresso e desenha o que já ficou pronto — que é, aliás,
  melhor UX do que a espera de hoje.
- Item que não couber em 900 s precisa ser **reentrante**: o estado por item já
  existe (`itensGerados`), então o consumidor pode retomar de onde parou.

Isto não é adaptação — é a SPEC-24 (esteira de agentes) sendo reescrita para um
modelo de execução diferente. **Orçar como tal.**

---

## 7. Suíte de testes

O que se preserva e o que precisa ser construído:

| Camada | Hoje | No Forge |
|---|---|---|
| `engine` (7.216 ln) | vitest, TS puro | **Idêntico.** Zero mudança |
| `aplicacao` (3.698 ln) | vitest sobre portas | **Idêntico** — as portas não sabem quem as implementa |
| `llm` (4.329 ln) | vitest | Some junto com o pacote; nasce um teste pequeno do adaptador `@forge/llm` |
| Adaptadores Postgres (11) | vitest contra Postgres real no CI | Viram adaptadores Forge SQL. **Precisa decidir onde rodam** — ver abaixo |
| `web` unit (473 testes) | vitest + Testing Library | Preservados, com **mock de `@forge/bridge`** (`invoke`) no lugar do `api/client.ts`. O `contratoDoClienteWeb.test.ts` que já existe é exatamente o lugar de trocar |
| **E2E (32 specs, 66 casos)** | Playwright contra stack docker-compose | **O item mais caro.** Ver abaixo |

### 7.1 Testes de adaptador sem Postgres

Duas opções, e a segunda é melhor:

1. TiDB em container no CI (compatível com MySQL) — rápido de montar, mas testa
   *MySQL*, não *Forge SQL* (não pega ausência de FK, teto de query, limite de
   statement).
2. **Testes de contrato de porta rodando contra os dois adaptadores** — o padrão
   que este repositório já usa. O adaptador Forge SQL roda contra TiDB local no
   CI *e* contra o SQL de dev via `forge tunnel` num job separado, mais lento e
   menos frequente. O primeiro pega regressão; o segundo pega divergência de
   plataforma.

### 7.2 O E2E é o problema de verdade

Hoje o Playwright sobe Fastify + Vite + gateway falso e dirige um navegador.
Num app Forge, a tela vive **num iframe dentro de um site Atlassian real**, o
que exige site de desenvolvimento, login e um app instalado — caro, lento e
frágil pra 66 casos.

O comentário no `.github/workflows/ci.yml` (e o JOURNEY §123) é explícito sobre
o custo de deixar essa suíte morrer:
*"a suíte Playwright estava MORTA há muitas rodadas (…) QUATRO defeitos
chegaram ao usuário, todos no vão que só um navegador enxerga"*. Não é uma
suíte a sacrificar.

Estratégia recomendada, em duas faixas:

- **Faixa larga (os 66 casos, a cada PR):** servir o bundle do Custom UI
  standalone com um **`@forge/bridge` falso** que roteia `invoke()` para os
  resolvers reais rodando em processo, contra um TiDB local. É o mesmo desenho
  do `gatewayFalso.ts` que já existe na suíte — a técnica está no repositório,
  só muda o que é falsificado. Preserva praticamente todos os casos atuais.
- **Faixa fina (smoke, contra o `staging` instalado — §8.1):** meia dúzia de
  casos com o app de verdade dentro do Jira — abrir a global page, desenhar um
  nó, derivar, exportar. É o que pega o que só a plataforma quebra (CSP, tamanho
  de payload, escopo faltando). A exportação é o caso que precisa apontar para
  um projeto Jira dedicado, pelo motivo da §8.2.

---

## 8. CI/CD e o ambiente de homologação

### 8.1 Homologação já vem de fábrica

`forge create` cria **três ambientes** — `development`, `staging`,
`production` — e dá pra criar mais com `forge environments create` (sem máximo
documentado). **`staging` é o ambiente de homologação**, e não custa nada nem
exige infraestrutura: é `forge deploy -e staging`.

Vale medir o contraste, porque ele é maior do que parece: **hoje o projeto não
tem homologação nenhuma.** `deploy.yml`, `docker-compose.prod.yml` e
`infra/README.md` não mencionam staging em lugar nenhum — é uma VM, um banco, um
domínio. Montar homologação no desenho atual significaria segunda VM, segundo
Postgres, segundo DNS, segundo conjunto de segredos no Infisical e segundo alvo
no Terraform. No Forge é uma flag.

O que a plataforma garante entre ambientes:

| | |
|---|---|
| Isolamento | **Cada ambiente é firewalled dos outros e não compartilha dado do app.** O storage de `staging` não é o de `production` |
| Tetos | Diferentes por ambiente — em Forge SQL: **1 GiB produção, 256 MiB staging, 128 MiB dev/custom**. Dá pra homologar; não dá pra restaurar produção inteira |
| Observabilidade | **`forge tunnel` e `forge logs` funcionam em staging; em produção, não.** É o argumento operacional mais forte pra ter homologação: é o único lugar onde se observa o app rodando de verdade |
| Identificação | Título ganha sufixo `(STAGING)` / `(DEVELOPMENT)` na tela |

### 8.2 A escolha real: mesmo site Jira ou site separado

**Múltiplos ambientes do mesmo app podem ser instalados no mesmo site Jira**,
inclusive em versões diferentes. Daí duas topologias:

| | Mesmo site do Jira de produção | Site separado |
|---|---|---|
| Dado **do app** (quebras, itens, config) | Isolado por ambiente | Isolado |
| Dado **do Jira** que o app lê | **O real** — homologa com contexto de verdade | Fictício |
| Custo | Zero | Sandbox exige Premium/Enterprise, ou um site de desenvolvimento à parte |
| Risco | Só um, e é nomeável ↓ | Nenhum |

**O único ponto onde "mesmo site" machuca é a exportação pro tracker
(SPEC-49).** Todo o resto do produto — diagrama, derivação, esteira, PDCA —
grava apenas no storage do app, que é isolado por ambiente. Mas a exportação
**cria work items de verdade**, e o Jira é o mesmo. Homologar exportação contra
produção é gerar lixo em backlog real.

Duas saídas, ambas baratas: um **projeto Jira dedicado à homologação** no mesmo
site (resolve o caso e custa nada), ou site separado se a empresa já tiver
sandbox disponível.

> **Ressalva sobre sandbox.** Sandboxes Atlassian são de Premium/Enterprise, e
> app Forge **pago** tem limitação conhecida para entrar em sandbox
> ([ECO-99](https://jira.atlassian.com/browse/ECO-99)). Sendo o nosso interno e
> sem `license` no manifesto, provavelmente não nos atinge — mas é do tipo que
> se confirma testando, não lendo.

**Recomendação:** `staging` instalado no **mesmo site**, com um projeto Jira
dedicado para exercitar a exportação. É grátis, é o que o pipeline abaixo já
faz, e é onde a faixa fina do E2E (§7.2) passa a rodar.

### 8.3 O pipeline

O pipeline atual (dois jobs, ~2min40) evolui em vez de ser substituído:

```
PR  ─┬─ build --workspaces
     ├─ typecheck --workspaces        ← guarda do ACHADO #286, mantém
     ├─ test --workspaces  (TiDB service container)
     ├─ lint --workspaces
     ├─ forge lint                    ← novo
     └─ e2e faixa larga (Chromium + bridge falso)

merge em main ─┬─ forge deploy -e staging      ← homologação (§8.1)
               ├─ forge install --non-interactive
               └─ e2e faixa fina (contra o staging instalado)

manual ─── forge deploy -e production   (aprovação de escopos pelo admin)
```

Segredos no GitHub: **`FORGE_EMAIL`**, **`FORGE_API_TOKEN`**. Fixar
`@forge/cli@12`.

**O que morre:** Terraform, GCP, Caddyfile, nginx.conf, os quatro
docker-compose, Infisical, os quatro secrets do GitHub do `infra/README.md`, o
workflow `deploy.yml`. Em linhas de infraestrutura que deixam de ser mantidas
por nós, este é provavelmente o maior ganho isolado da migração inteira — e o
menos discutido.

**O que nasce sem custo:** um ambiente de homologação que hoje não existe, com
logs e tunnel que produção não tem.

---

## 9. Roteiro sugerido (se a decisão for ir)

Cada fase termina verde e sozinha; nenhuma depende da seguinte ter começado.

| # | Fase | Entrega | Risco |
|---|---|---|---|
| **−1** | **Developer Space da empresa** | Espaço criado no nome da empresa, com billing admin e meio de pagamento. **Não é código, e bloqueia tudo o que vier depois de `development`.** Começar por aqui, em paralelo com a fase 0 | fora da engenharia |
| 0 | **Prova de conceito, 2–3 dias** | App Forge vazio, `jira:globalPage`, Custom UI servindo o `packages/web` de hoje com dados falsos. Responde a única pergunta que documentação não responde: **React Flow se comporta dentro do iframe?** | baixo |
| 1 | Adaptadores Forge SQL | `*EmForgeSql.ts` para as 10 portas, passando nos testes de contrato existentes. Cascatas explícitas. | médio |
| 2 | `@forge/llm` atrás da porta de IA | `packages/llm` sai; sobra um adaptador. Sem esteira ainda. | baixo |
| 3 | Identidade e permissão | OIDC e RBAC próprios saem; contexto do Forge entra; sobra só a regra específica do Gerador. | médio |
| 4 | **Esteira assíncrona** | Async events + progresso consultável + reentrância por item. Reescrita da SPEC-24. | **alto** |
| 5 | Exportação pro tracker | REST do Jira direto, escopo declarado. Fecha a SPEC-49 melhor do que ela foi desenhada. | baixo |
| 6 | Suíte E2E nas duas faixas | §7.2 | médio |
| 7 | CI/CD Forge + instalação | §8 + `forge install` nos sites da empresa (ou link, §2.9) | baixo |

Fases 0–2 são as que valem a pena fazer **antes** de decidir de verdade: elas
custam pouco e derrubam as três incertezas que sobraram (iframe, dialeto, custo
real de token por quebra). A fase −1 é a que se descobre estar bloqueando
quando já é tarde — não depende de nenhuma outra e leva o tempo que a burocracia
da empresa levar.

---

## 10. O que este documento **não** respondeu

Honestidade sobre os buracos, para ninguém tratá-los como resolvidos:

1. **Custo real de token por quebra.** A franquia de LLM é zero e a conta é do
   Developer Space da empresa. Sendo interno, isso não decide se o produto
   existe — decide **qual é a conta mensal** e se ela é melhor ou pior que a
   alternativa que a empresa já paga (ou já bloqueia). Continua sendo a pergunta
   mais importante em aberto, e é medível na fase 2, gerando uma quebra real e
   lendo os tokens de entrada/saída que a própria API reporta por requisição.
2. **React Flow dentro do iframe com a CSP do Forge.** Nenhuma documentação
   responde; só a fase 0 responde.
3. **Quanto do RBAC realmente sobrevive.** Depende de quanto a permissão de
   projeto do Jira cobre das regras da SPEC-28 — é leitura de spec contra API,
   não pesquisa de plataforma. Sendo app interno, há um atalho legítimo que não
   existiria num app de Marketplace: **assumir os grupos do Jira da empresa**
   como verdade e não modelar nada além do que sobrar.
4. **Se o Rovo deve ser `rovo:agent` ou só `@forge/llm`.** São coisas diferentes:
   um agente registrado no AI Mate (o usuário conversa com ele de qualquer
   lugar do Jira) ou um app com tela própria que usa LLM por dentro.
   A leitura desta avaliação é **os dois, nessa ordem**: o app com tela é o
   produto, e o `rovo:agent` com `action` apontando pro nosso `derivar()`
   determinístico é o que o torna descobrível dentro do Jira. Mas isso é
   decisão de produto, não de plataforma.

---

## 11. Fontes

- [Forge — Rovo modules](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-index/) · [rovo:agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/)
- [Forge LLMs API](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/) · [referência](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/) · [modelos](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/) · [anúncio](https://www.atlassian.com/blog/development/forge-llms-preview)
- [Forge SQL](https://developer.atlassian.com/platform/forge/storage-reference/sql/) · [limites](https://developer.atlassian.com/platform/forge/limits-sql/) · [migração de fonte externa](https://developer.atlassian.com/platform/forge/storage-reference/sql-migration-guide/) · [forge-sql-orm (Drizzle)](https://github.com/forge-sql-orm/forge-sql-orm)
- [Storage API](https://developer.atlassian.com/platform/forge/runtime-reference/storage-api/)
- [Limites de invocação](https://developer.atlassian.com/platform/forge/limits-invocation/) · [de recurso](https://developer.atlassian.com/platform/forge/limits-resource/) · [quotas e limites](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/)
- [Custom UI](https://developer.atlassian.com/platform/forge/custom-ui/) · [jira:globalPage](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-global-page/)
- [Forge Containers (Preview)](https://developer.atlassian.com/platform/forge/containers-reference/) · [anúncio](https://www.atlassian.com/blog/development/forge-container-services-preview)
- [Staging e produção](https://developer.atlassian.com/platform/forge/staging-and-production-apps/) · [CI/CD](https://developer.atlassian.com/platform/forge/set-up-cicd/) · [distribuir apps](https://developer.atlassian.com/platform/forge/distribute-your-apps/) · [listar no Marketplace](https://developer.atlassian.com/platform/marketplace/listing-forge-apps/) · [publicar Developer Space](https://developer.atlassian.com/platform/forge/developer-space/publish-developer-space/)
- [Preço da plataforma Forge](https://developer.atlassian.com/platform/forge/forge-platform-pricing/) · [mudanças de jan/2026](https://www.atlassian.com/blog/development/updates-to-forge-pricing-effective-january-2026)
- [Developer Spaces — visão geral](https://developer.atlassian.com/platform/forge/developer-space/developer-spaces-introduction/) · [criar](https://developer.atlassian.com/platform/forge/developer-space/create-developer-space/) · [cobrança e pagamento](https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/) · [papéis](https://developer.atlassian.com/platform/forge/developer-space/developer-space-roles/)
- [Jira — release sazonal](https://www.atlassian.com/software/jira/release) · [Jira 2026 Summer Release](https://community.atlassian.com/forums/Jira-articles/Introducing-the-Jira-2026-Summer-Release/ba-p/3268349) · [Rovo no Jira](https://www.atlassian.com/software/jira/ai)
