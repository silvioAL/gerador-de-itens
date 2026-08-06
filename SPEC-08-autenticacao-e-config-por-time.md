# SPEC-08 — Autenticação, isolamento por time e config de campos por tipo de nó

**Depende de CONTEXTO-E-ARQUITETURA.md e do plano `hashed-foraging-ullman.md` (Fase B)** · Registra mecanismo em implementação (`packages/server/src/auth/`, `packages/server/src/routes/{auth,camposNo}.ts`, `packages/server/src/db/schema.ts`).

---

## 1. Objetivo

A Fase A (SPEC-06 §6, JOURNEY.md §20) tirou quebras/perfis/referências do arquivo local pra um banco compartilhado — mas sem login, "compartilhado" virou "sem isolamento nenhum": qualquer pessoa via/editava a configuração de qualquer time. Usando a ferramenta de verdade, o usuário reportou três problemas concretos que esta spec resolve:

1. Time A enxerga e edita a configuração do time B (perfis de stack, e o editor de campos do §3).
2. Os campos de formulário de cada tipo de nó só existiam estáticos em `config/diagrama.json` — sem CRUD, sem forma de o time ajustar/estender sem editar arquivo e fazer deploy.
3. `Quebra.produto`/`Atividade.produto` era informação do épico vazando pro nível de item, sem uso real downstream.

## 2. Autenticação — dois modos, mesmo código de sessão

### 2.1 Por que dois modos em vez de um IdP de mentira

Não existe IdP corporativo acessível no ambiente de desenvolvimento deste projeto (só existirá quando hospedado — Fase D, ainda em aberto). Em vez de bloquear todo o trabalho de auth nesse dia, ou inventar uma dependência nova só pra teste (subir um `oidc-provider` de brinquedo), `packages/server` lê `AUTH_MODE`:

- `oidc` (produção): fluxo padrão via `openid-client` contra `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI` — nenhum vendor hardcoded, troca de Azure AD/Okta/Google Workspace/outro é só variável de ambiente.
- `dev` (default local, `docker-compose.yml`, E2E, CI): `POST /auth/login` aceita `{ email, timeId }` direto, sem handshake nenhum — valida contra `usuario_time` e emite exatamente a mesma sessão que o modo `oidc` emitiria. Só a etapa "provar quem você é" muda; sessão, cookie e middleware de autorização são o mesmo código nos dois modos, o que é o ponto — o caminho de produção não fica sem exercício só porque não há IdP real disponível agora.

### 2.2 Sessão

Cookie httpOnly assinado (JWT via `jose`, claims `{ email, timeIds, exp }`) — stateless, sem tabela de sessão no banco, consistente com a régua de "deploy simples" do plano. `usuario_time (email, time_id)` é a fonte de verdade de a quais times uma pessoa pertence; onboarding de usuário/time é manual (inserir linha direto no banco) — não existe UI de admin nesta rodada, sinalizado deliberadamente como lacuna, não como esquecimento.

`GET /auth/me` devolve a sessão atual ou 401. Dois `preHandler` cobrem toda a autorização: `exigirSessao` (qualquer sessão válida) e `exigirTime(resolverTimeId)` (a sessão precisa ter aquele `timeId`; `resolverTimeId` pode devolver `null` para recurso sem dono de time, caso em que só a sessão é exigida — ver `packages/server/src/auth/middleware.ts`).

### 2.3 "Time" unificado — sessão vira a única fonte

Antes desta spec, `quebra.time` era um campo de texto livre no header do `packages/web`, servindo dois papéis ao mesmo tempo: metadado da quebra E único jeito de escolher de qual time puxar sugestões de stack. Isso confundia "de quem é este diagrama" com "controle de acesso" — o mesmo campo não deveria fazer as duas coisas. A partir desta spec, o **time ativo é sempre um dos `timeIds` da sessão** (vira `<select>` restrito, nunca mais texto livre); essa mesma variável alimenta tanto `perfisTime[timeAtivo]` quanto o merge de campos customizados do §3. Resolve o problema 1 do §1 na raiz — não dá mais pra digitar o time de outra pessoa.

## 3. Campos por tipo de nó — global ou por time

### 3.1 Por que virou tabela

`nodeTypes[tipo].spec` (`packages/engine/src/config/types.ts`, array de `FieldSpec`) segue definindo a *forma* de cada tipo de nó — isso não muda, o engine continua sem saber que existe banco. O que muda é onde a lista de campos de cada tipo mora: antes só em `config/diagrama.json`, estático, exigindo editar arquivo e fazer deploy pra qualquer ajuste. Tabela nova `campos_no` (`time_id`, `tipo_no`, `key`, `label`, `type`, `required`, `valor_padrao`, `opcoes`, `ajuda`, `permite_na`, `ordem`) dá CRUD de verdade, mesmo padrão relacional de `perfis_time`.

### 3.2 Sentinela `__global__`, não `NULL`

`time_id` nunca é `NULL` — usa a constante `CAMPO_GLOBAL = "__global__"` (`packages/server/src/db/schema.ts`). Motivo: Postgres trata `NULL ≠ NULL` em índice único, então duas linhas globais do mesmo `(tipoNo, key)` não seriam barradas por `UNIQUE(time_id, tipo_no, key)` se `time_id` fosse `NULL` — o sentinela mantém a unicidade de verdade.

### 3.3 Merge: time sobrescreve global, mesma regra de `perfis_time`

`GET /campos-no?timeId=X` devolve todo campo `__global__` daquele `tipoNo` mais os campos extras de `X` — se `X` declarar um campo de mesma `key` que já existe global, o do time vence (mesmo comportamento de override já estabelecido em `PerfilTime`, SPEC-05 §2.3, só que aplicado à *definição* do campo em vez de ao valor sugerido). `packages/web/src/config/loadConfig.ts` faz o splice desse resultado em `nodeTypes[tipo].spec` antes de entregar a config pro resto do app — `PropertiesPanel`/`FieldControl` não sabem que essa mesclagem existe, só recebem um `spec` já pronto.

### 3.4 Autorização de escrita

Editar/criar/excluir um campo `__global__` exige só sessão válida (`exigirSessao`) — não existe papel de administrador nesta rodada, simplificação deliberada (qualquer pessoa logada pode mexer no que é compartilhado por todos). Editar um campo de um time específico exige `exigirTime(timeId)` — só quem pertence àquele time.

### 3.5 Tela própria, não aba de modal

O editor vive em `packages/web/src/config/ConfigScreen.tsx`, um overlay de tela cheia (mesmo padrão de `ReviewScreen.tsx`), não uma aba dentro da `JourneyModal` — a densidade de um formulário de CRUD de campo (key, label, tipo, obrigatório, default, opções, ajuda) não cabe no espaço de aba que a jornada de onboarding usa. `PerfisTimeTab`/`ReferenciasTab` também migraram pra cá, por serem a mesma natureza (config recorrente de time, não onboarding); a `JourneyModal` fica só com o que é de fato tour/demo (cenários prontos, importar Graphify, linha de comando).

## 4. Removendo `Quebra.produto`/`Atividade.produto`

### 4.1 Por que saiu, não foi substituído

"Produto" é informação do **épico** — a este projeto não modela épico como entidade, só quebra (um recorte de trabalho) e atividade (um item derivado). O campo tinha uso real em `Quebra` (única forma de nomear uma quebra salva na UI) mas era **write-only** em `Atividade`: preenchido em quatro pontos de `derivar.ts`, nunca lido por `exportar.ts` nem `gerarPacote.ts` — os dois consumidores finais da atividade. Isso confirma no próprio código a queixa que motivou a remoção: o dado só repetia, por atividade, o mesmo valor da quebra inteira, sem agregar nada.

### 4.2 Substituto pro identificador da lista "Abrir…"

Sem `produto`, a listagem de quebras salvas (`GET /quebras`, o `<select>` "Abrir…" do header) passa a mostrar `time · atualizadoEm` formatado — dado que já existia em `QuebraResumo`, sem precisar de campo novo. Deliberadamente não virou um campo `nome`/`titulo` de substituição: o ponto da remoção era parar de forçar a pessoa a inventar um nome pra cada quebra só pra identificá-la numa lista.

## 5. O que não fazer

- Não usar `AUTH_MODE=dev` fora de ambiente local/E2E/CI — não tem handshake nenhum, é literalmente "diga seu e-mail e time e eu acredito".
- Não guardar `timeIds` da sessão em `localStorage`/JWT solto no client — o cookie é sempre httpOnly, o risco é XSS lendo o token e se passando pela sessão.
- Não deixar campo `__global__` exigir `exigirTime` — ele por definição não tem dono; forçar isso quebraria a única forma de qualquer pessoa logada ajustar o que é compartilhado.
- Não reintroduzir `produto` (ou qualquer campo de "nome") em `Atividade` — o §4.1 mostrou que informação de quebra vazando pra item não tem consumidor real; se um caso de uso aparecer, resolver no nível de `Quebra`, nunca duplicando pra cada atividade derivada.
- Não fazer o merge de `campos_no` do §3.3 no `packages/server` — a mesclagem mora em `loadConfig.ts` (client), pra manter o server sem lógica de composição de config, só CRUD.
