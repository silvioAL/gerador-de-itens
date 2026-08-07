# SPEC-17 — Pivô: CLI local-first, Obsidian como padrão

**Depende de/relacionado a:** SPEC-16 (base de conhecimento, JOURNEY §32), Fase A (JOURNEY §20, decisão original de ir pra banco de verdade), CONTEXTO-E-ARQUITETURA.md §2/§5.1 (decisão original v1 de cortar banco/multi-tenant/auth, agora parcialmente revertida de novo). Reabre o rumo geral do produto — não corrige uma peça, decide entre dois modelos de distribuição.

**Status: completo. `gerador-de-itens` publicado no npm, Trusted Publisher configurado e validado de ponta a ponta — `v0.1.2` publicada sozinha via `git push --tags`, sem OTP/token nenhum (JOURNEY §35-§38).**

**Revisão posterior:** a decisão §1.3 ("Obsidian obrigatório") e o formato de `config/referencias/*.json` (§4) foram revertidos numa rodada seguinte — `referencias` e `gerador export-vault` foram removidos por completo (ver JOURNEY, rodada "vamos remover completamente a parte de referências de código" — o usuário decidiu que registrar racional/decisão de arquitetura é papel do próprio Claude Code via skills/MCP de projeto, não desta ferramenta). O resto deste SPEC (CLI local-first, sem servidor, sem login) continua valendo.

---

## 1. Por que agora

Testando a Fase F (referências com `codigoRelacionado`, visualizadas na aba web `ReferenciasTab`), o usuário achou a apresentação de links externos e a visualização de documentos ruim — e, em vez de pedir só um ajuste visual, questionou o rumo maior: o `gerador` deveria funcionar como o Graphify (instalável na máquina com um comando, integrado ao Claude Code do mesmo jeito que `/graphify`, "se virando sozinho" sem servidor).

Decidido via `AskUserQuestion` (três perguntas, sem ambiguidade):
1. **Escopo:** substituir o modelo hospedado (Fastify+Postgres+OIDC+Docker+Terraform/GCP — Fases A, B, B.1, B.2, D) pelo CLI local, não os dois coexistindo.
2. **Dados do time:** "pasta simples, com os markdowns" — não é integração de git dentro da ferramenta. O time decide como compartilhar essa pasta; o `gerador` não orquestra `git add`/`commit`/`push`.
3. **Obsidian:** dependência obrigatória, como o Graphify assume Python — documentos redirecionam direto pra abrir lá via URI, sem visualizador próprio no app.

## 2. Achado: isso é, em boa parte, reviver um modelo que já existiu

`packages/server/src/db/schema.ts` já documentava que `referencias` "substitui o armazenamento de trecho de código local (`config/referencias/*.json`)" e que `perfis_time` é "a mesma forma que antes vivia em `perfis-time.json` local" (JOURNEY §14/§18, pré-Fase-A). Este SPEC não inventa um design novo — volta pro que já foi validado, com os campos que a Fase F acrescentou (`codigoRelacionado`, `linkExterno`).

## 3. O que fica dormente, não é apagado

`packages/server`, `docker-compose*.yml`, `infra/` (Terraform), `.github/workflows/deploy.yml` — nada disso foi removido. Continua código válido, testado, documentado (SPEC-08 a SPEC-15), só deixa de ser o caminho padrão/recomendado. `packages/web` também não mudou nesta rodada — continua funcionando contra o server, pra quem já estiver nesse caminho.

**Observação do usuário, registrada aqui (não implementada ainda):** com o produto identificado como ferramenta local publicada num registry público — como o Graphify, não como serviço hospedado multi-time — a autenticação (Fase B/B.1/B.2 inteiras: OIDC, organização, times, membros) pode simplesmente parar de fazer sentido por padrão. Um CLI que roda na máquina de cada pessoa não tem "quem logar" nele. Isso é uma razão mais forte do que a que já estava escrita aqui pra eventualmente descontinuar `packages/server` (§9) — mas continua sendo uma decisão separada, não decidida nem implementada nesta rodada. Não removido sem confirmação explícita.

## 4. `config/referencias/*.json` — formato revivido

Um arquivo por referência, texto editável à mão (mesma disciplina de `perfis-time.json`/`diagrama.json`, sem CRUD/wizard):

```json
{
  "titulo": "...",
  "racional": "...",
  "designPatterns": ["..."],
  "codigoRelacionado": ["packages/engine/src/derive/derivar.ts"],
  "linkExterno": null
}
```

Todos os campos exceto `titulo`/`racional` são opcionais. `gerador init` semeia dois exemplos ilustrativos em `config/referencias/` (mesmo padrão de `perfis-time.json` de exemplo).

## 5. `gerador export-vault` fica 100% local

Removida a flag `--server-url`/`fetch()` — o comando lê `config/referencias/*.json` do diretório atual. Nenhum comando do CLI depende mais de rede.

## 6. Obsidian: redirect, não visualizador

Depois de materializar as notas, `export-vault` imprime `obsidian://open?vault=<nome>&file=<primeira-referencia>`. Nova flag `--vault-nome` (nome do vault registrado no Obsidian pode divergir do nome da pasta) e `--abrir` (lança a URI via `start` no Windows). Resolve o "visualização dos docs ficou ruim" não com um visualizador melhor, mas sem visualizador nenhum — abre onde já é bonito.

## 7. Empacotamento e skill do Claude Code (skill revertida, ver §11)

- `packages/cli`: `files`/`README.md` novos, dependência de `@gerador/engine` movida pra `devDependencies` (já é bundlada no `dist/cli.js` via `tsup.noExternal` — como `dependencies` quebraria a instalação de um pacote empacotado fora do monorepo, tentando resolver um pacote workspace-only do registry).
- `skill/gerador-de-itens/SKILL.md`: corrigidos dois bugs reais achados na auditoria (exemplo de `quebra.json` ainda tinha `produto`, removido na Fase B; `implementar` ainda documentava `<chave-ou-rótulo>`, removido no redesenho SPEC-14 v3) e adicionada a seção de `export-vault` (ausente até aqui). `scripts/gerador.ps1` simplificado: prefere `gerador` do PATH (instalação global) e só cai pro build de desenvolvimento do repositório como fallback.

## 7.1. Fatia 2 — publicação pública no npm (JOURNEY §35)

Pergunta direta do usuário sobre como o Graphify instala (`pip install graphifyy` / `npm install -g @sentropic/graphify`) revelou que a fatia 1 tinha ficado num meio-termo: `private: true` + `npm pack`/`npm link` local exige clonar o repositório, o que não é "funcionar como o Graphify" de verdade — o mecanismo real do Graphify é baixar um artefato já compilado de um registry público, com dependências resolvidas, sem tocar no código-fonte.

Confirmado com o usuário via `AskUserQuestion`: **público, igual ao Graphify** (não uma alternativa privada tipo GitHub Packages). Decisões resultantes:
- Nome do pacote: `gerador-de-itens` (sem escopo `@algo/`) — `gerador` sozinho já estava ocupado no npm por um pacote não relacionado ("Gerador de dados brasileiros"); `@gerador/cli` exigiria criar uma organização no npm primeiro. Sem escopo é o caminho mais simples, sem pré-requisito de conta além do login.
- `private: true` removido de `packages/cli/package.json`; `license: "MIT"` + `LICENSE` novos; `keywords` adicionados.
- `npm publish --dry-run` validado limpo (11 arquivos, `LICENSE`/`README.md`/`dist/`/`templates/` inclusos) — achado no caminho: `"bin": {"gerador": "./dist/cli.js"}` com o prefixo `./` é inválido pro publish do npm (auto-corrigido/removido silenciosamente, o que quebraria o comando `gerador` pra quem instalasse do registry); corrigido pra `"dist/cli.js"` sem prefixo via `npm pkg fix`.
- **Login no npm é do usuário, não automatizável aqui** — esta sessão não roda prompts interativos (`npm login` pede navegador/OTP), e não é apropriado eu manusear um token de conta pessoal. O pacote fica pronto pra publicar (`npm publish` dentro de `packages/cli`) assim que o usuário estiver logado nesta máquina.

## 7.2. Decisão final de visibilidade: GitHub privado, npm público

Depois de empurrar o repositório pro GitHub como público (JOURNEY §36), o usuário reabriu a decisão: repositório privado (código-fonte, histórico, JOURNEY.md e as SPECs — a parte "processo interno"), mas o pacote publicado no npm continua público (é "só a ferramenta pronta", não o desenvolvimento). Não é meio-termo incoerente — os dois são jornais diferentes: o registry do npm hospeda o artefato compilado (`dist/cli.js`, legível mas sem o histórico/racional por trás), o GitHub hospeda o processo.

**Consequência técnica real, corrigida antes de virar erro:** `--provenance` no `npm publish` (adicionado em 7.1 pensando em repositório público) **exige repositório público** — a atestação de proveniência depende de um log de transparência público. Com o repositório privado, publicar com essa flag falharia. Removida de `publish.yml`; `id-token: write` também removido (só existia pra provenance).

Consequência colateral aceita, não corrigida: os campos `homepage`/`bugs`/`repository` em `packages/cli/package.json` continuam apontando pro repositório no GitHub — agora um link que só quem tem acesso consegue abrir. Comportamento esperado da escolha, não um bug.

## 7.3. Publicação sem segredo nenhum: Trusted Publishing (OIDC), não token

Pergunta do usuário sobre o token de automação ("teria que trocar a cada deploy?") levou a verificar a documentação oficial do npm em vez de responder de memória (a política do npm mudou bastante recentemente). Achado real, confirmado em `docs.npmjs.com/trusted-publishers` e no changelog do GitHub: **o npm revogou todos os tokens clássicos sem expiração em dez/2025** — hoje qualquer token novo com permissão de escrita é limitado a no máximo 90 dias. A preocupação do usuário era legítima e o plano original (token de automação) já não é mais viável do jeito que foi desenhado em §7.1.

A resposta certa é **Trusted Publishing (OIDC)**, GA desde jul/2025: o GitHub Actions se autentica direto com o npm via identidade do próprio workflow run, sem segredo nenhum armazenado — nunca expira, nunca precisa trocar. Confirmado que funciona com repositório privado (a limitação de repositório público é só da atestação de proveniência, um recurso separado).

**Pré-requisito real, não contornável:** o pacote precisa **já existir** no registry pra configurar isso — a primeira publicação (`v0.1.0`) continua exigindo o fluxo manual com 2FA (§7.1), sem alternativa. Trusted Publishing só cobre as publicações seguintes.

`.github/workflows/publish.yml` atualizado: `node-version: "22"` (Trusted Publishing exige npm ≥ 11.5.1, que o Node 20 não traz por padrão), `permissions.id-token: write` de volta (necessário pro OIDC, diferente da vez anterior em que só servia pra provenance), `npm publish --no-provenance` (a atestação de proveniência vem ligada por padrão no Trusted Publishing, mas não funciona em repositório privado — teria falhado o publish inteiro se deixada ligada), e o `NODE_AUTH_TOKEN`/`secrets.NPM_TOKEN` removidos por completo — não há segredo nenhum pra cadastrar.

**Passo a passo pra ativar, depois que `v0.1.0` existir no registry** (fica registrado aqui pra não se perder, é a próxima ação real):
1. `npmjs.com` → página do pacote `gerador-de-itens` → **Settings** → **Trusted Publisher** → GitHub Actions.
2. Preencher exatamente: organização/usuário `silvioAL`, repositório `gerador-de-itens`, nome do arquivo de workflow `publish.yml` (só o nome do arquivo, não o caminho completo), ação permitida `npm publish`.
3. Dali em diante, `git tag vX.Y.Z && git push --tags` publica sozinho, sem token, sem OTP, sem nada pra rotacionar.

## 7.4. Causa raiz real do 403 persistente: 2FA nunca tinha sido ativado na conta

Depois de três tentativas falhas com a mesma mensagem (OTP digitado à mão, token granular com bypass configurado corretamente por dois nomes diferentes), a hipótese de "bug conhecido do npm" (`npm/cli#9268`, ainda parecia plausível — pesquisada e citada aqui como descoberta real, não descartada por estar errada, só superada por uma causa mais simples) foi substituída por uma mais direta ao checar `npmjs.com` → **Account Settings** → **Two-Factor Authentication**: o botão dizia **"Enable 2FA"**, não "Manage" — a conta nunca tinha 2FA configurado de verdade. Isso explica os dois sintomas de uma vez: o "código OTP" fornecido não podia ser válido (não existia nenhum autenticador gerando código nenhum pra essa conta), e o token de bypass provavelmente é rejeitado pelo registry quando não há fator nenhum pra "bypassar" — bypassar algo que nunca existiu não é uma operação que o npm aceita como bem-formada.

**Resolvido de verdade:** usuário ativou 2FA (QR code + app autenticador). `npm publish` sem nenhuma flag então caiu num fluxo diferente e correto — `EOTP` com uma URL de autorização via browser (`npm auth/cli/...`), não mais um código de 6 dígitos. A URL vem mascarada (`***`) em qualquer saída não interativa (stdout redirecionado/logs) — precisou rodar no terminal de verdade do usuário pra ele ver e abrir o link. Depois de autorizar no browser, `npm publish` completou sozinho.

**Validação real:** `npm view gerador-de-itens` confirmou a versão `0.1.0` no registry; `npm install -g gerador-de-itens` rodado de um diretório temporário fora do repositório (mesma disciplina de sempre — nunca confiar sem testar) instalou e `gerador --help` funcionou, comando publicado de verdade, baixado do registry público, não de um tarball local. Pacote de teste desinstalado depois.

**Próximo passo real, não implementado (é configuração no site do npm, fora do alcance desta sessão):** com `v0.1.0` agora existindo, configurar o Trusted Publisher em `npmjs.com` → página do pacote → Settings → Trusted Publisher → GitHub Actions, com `silvioAL` / `gerador-de-itens` / `publish.yml` (passo a passo em §7.3) — depois disso, toda versão futura publica sozinha via tag, sem OTP nunca mais.

## 7.5. Trusted Publisher configurado e testado de verdade — achado real, segundo bug de infra no caminho

Usuário configurou o Trusted Publisher no site do npm e pediu pra testar de verdade, não só confiar que ia funcionar. Teste real: bump pra `v0.1.1`, tag, push — **falhou**, mas de um jeito enganoso: `npm error 404 'gerador-de-itens@0.1.1' is not in this registry`, não um erro de autenticação/permissão. Investigado o log completo do job (não só o erro final): `actions/setup-node@v4` com `node-version: "22"` instala **Node 22.23.1 com npm 10.9.8** — abaixo do `>= 11.5.1` que o Trusted Publishing exige. Sem suporte a OIDC nessa versão do npm, `npm publish` virou uma chamada sem nenhuma autenticação; o registry, por não vazar se um pacote existe pra quem não está autenticado, respondeu 404 em vez de um 401/403 mais direto — o que tornou a causa raiz não óbvia só pelo texto do erro.

Corrigido com um passo explícito `npm install -g npm@latest` logo depois do `setup-node`, antes de qualquer outro comando — `node-version` sozinho não garante a versão do npm bundled ser recente o bastante. Testado de novo com `v0.1.2`: sucesso, confirmado via `npm view gerador-de-itens version` (`0.1.2`) e `dist-tags` (`latest: 0.1.2`) — publicado inteiramente por `git tag v0.1.2 && git push origin v0.1.2`, sem nenhuma intervenção manual, sem OTP, sem token.

Lição reforçada pela terceira vez nesta sessão (SPEC-14, `gerador export-vault`, agora CI/CD): **"parece que devia funcionar" não é validação — só rodar de verdade contra o ambiente real (aqui, o runner do GitHub Actions, diferente da máquina de dev) encontra esse tipo de gap.**

## 8. `gerador open` funciona fora do monorepo (resolvido, Fase I)

Limitação original: `open` servia o build de `packages/web` a partir de um caminho relativo (`../../web/dist`, só existente dentro do monorepo) — instalação global via npm não encontrava esse build.

**Correção:** `packages/cli/scripts/copy-web-dist.mjs`, rodado como parte de `npm run build --workspace=packages/cli` (`"build": "tsup && node scripts/copy-web-dist.mjs"`), copia `packages/web/dist` pra `packages/cli/web-dist` — incluído em `files` do `package.json`, então vai junto no pacote publicado. `open.ts` procura primeiro `web-dist` (bundlado), caindo pro caminho de monorepo (`../../web/dist`) só como fallback de dev. `.github/workflows/publish.yml` builda `packages/web` antes de `packages/cli`, pra a cópia não sair vazia em produção.

Cogitou-se resolver isso com Docker (volumes) — descartado: o problema que volume resolve (dado escrito dentro de um container sobreviver a recriação) não existe aqui, já que `config/*.json` já vive direto no disco do usuário, fora de qualquer container; Docker só adicionaria uma dependência pesada sem necessidade.

Validado de ponta a ponta rodando `dist/cli.js` a partir de um diretório temporário fora do repositório: `gerador init` + `gerador open` respondem 200 em `/`, `/config/diagrama.json` e nos assets do bundle.

**Essa validação foi incompleta — achado real numa máquina de verdade, não neste ambiente de dev.** Bundlar os arquivos estáticos resolveu a *entrega*, não a *funcionalidade*: o build de `packages/web` empacotado é o mesmo do modo hospedado, que trava em "Verificando sessão..." esperando `/auth/me` — uma rota que não existia em lugar nenhum no servidor simples de `gerador open`. Publicado assim (`v0.1.3`), o usuário instalou numa máquina corporativa e caiu numa tela de login sem nenhum jeito de logar — pior que a limitação antiga (pelo menos avisava). Erro meu: validei "os arquivos respondem 200", nunca abri o app de verdade num browser pra confirmar que ele *funciona* depois de carregar. Corrigido em §8.2.

## 8.1. Correção real: API local sem login (não é mais "Fase H depois", é agora)

O usuário lembrou de uma decisão já registrada nesta sessão (SPEC-17, tarefa "auth pode não fazer sentido no modelo CLI") e propôs a saída certa: manter o mesmo build do modo hospedado, mas com login desabilitado — um "feature toggle" em vez de reescrever `packages/web` do zero.

**`packages/cli/src/commands/openApiLocal.ts`** (novo): API mínima, compatível com o que `packages/web` já chama, sem tocar no código do app. Sessão é sempre fixa (`{email:"local", timeIds:["local"]}`, `GET /auth/modo` devolve `"local"`) — como só há 1 `timeId`, `App.tsx` nunca renderiza `LoginScreen`/`EscolherTimeScreen`/`SemTimeScreen`, vai direto pro app. Dados que no modo hospedado moram no Postgres viram arquivo local, reaproveitando formatos que já existiam:
- `GET/POST/PUT /quebras` → **revisado em §12**: começou como um único `quebra.json` fixo (achado real depois: isso fazia "Nova quebra" + salvar sobrescrever a anterior sempre) — virou `quebras/<id>.json`, um arquivo por quebra.
- `GET/PUT /perfis-time` → `config/perfis-time.json` (já existia, mesmo formato).
- `GET/POST/PATCH /referencias` → `config/referencias/*.json` (já existia, mesmo formato de `gerador init`/`export-vault`).
- `GET /especificacao-template` → arquivo opcional local, cai pro `TEMPLATE_ESPECIFICACAO_PADRAO` do engine se não existir (achado ao implementar: `especificacaoTemplate.conteudo` não pode ser `""` — `??` não trata string vazia como nula, um template vazio geraria documento vazio em vez de cair no default).
- `GET /campos-no` sempre `[]`, e qualquer escrita em `/campos-no`, `/times`, `/convites` devolve 501 — **`/campos-no` revisado em §12** (o usuário queria configurar convenção de nomenclatura por essa tela mesmo local); `/times`/`/convites` continuam 501, sem equivalente local.

**Segunda peça, menos óbvia:** o Vite resolve `VITE_API_URL` em **build time**, embutido no bundle — o build genérico de `packages/web` (usado até aqui) aponta pra `http://localhost:4000` (endereço do `packages/server`), fixo no JS, mesmo rodando via `gerador open`. `packages/cli/scripts/copy-web-dist.mjs` passou a buildar sua própria variante (`VITE_API_URL=""`, mesma origem — as chamadas vão pro próprio servidor que `gerador open` sobe, seja lá qual porta `--port` escolher) usando a API JS do Vite direto (`import("vite").build(...)`, não um subprocesso `vite build`/`npx` — achado real: `spawnSync("npx.cmd", ...)` sem `shell:true` dá `EINVAL` no Windows, e `shell:true` com array de args é um padrão que o próprio Node desaconselha por risco de injeção).

Cogitou-se resolver com Docker de novo (o pedido original de "modo hospedado, mas sem login" quase virou "roda o server em Docker sem OIDC") — descartado pela mesma razão do §8: nenhum problema que Docker resolveria (volumes, isolamento) existe aqui, e adicionaria uma dependência pesada que o usuário explicitamente queria evitar (risco de firewall corporativo bloqueando algo novo).

**Validado de verdade** (não só "arquivo responde 200" como da vez passada): rodando `dist/cli.js` fora do repositório, batendo em cada rota via HTTP real — `/auth/modo` → `{modo:"local"}`, `/auth/me` → sessão fixa, `POST /quebras` grava `quebra.json` no formato exato que `gerador derive` lê, `GET /quebras` lista de volta, `/perfis-time` e `/referencias` fazem round-trip completo, o bundle JS não contém mais `localhost:4000`. **Limitação da validação:** sem browser disponível neste ambiente, não foi possível confirmar visualmente que o canvas renderiza — só que toda chamada de rede que o boot do app faz responde com o formato certo. Pendente confirmação visual do usuário. 17 testes novos em `openApiLocal.test.ts` (servidor HTTP real numa porta efêmera, sem mock).

## 8.2. Skill do Claude Code empacotada no pacote npm (`gerador skill-install`) — revertido, ver §11

A skill (`skill/gerador-de-itens/SKILL.md`) só existia neste repositório — que é privado — então quem só tinha o pacote npm não tinha como pegá-la. `packages/cli/templates/skill/SKILL.md` é uma variante distribuível (mesmo conteúdo de regras/comandos, mas chamando `gerador` direto em vez do wrapper `.ps1` específico de desenvolvimento deste monorepo). Comando novo `gerador skill-install [destino]` (default `.claude/skills/gerador-de-itens`) copia esse arquivo pro projeto atual — sempre sobrescreve (é conteúdo mantido pela ferramenta, não editável pelo usuário, diferente de `config/` que `init` nunca sobrescreve).

**Revertido pouco depois (mesma sessão) — ver §11: a skill inteira foi cortada**, `gerador skill-install` removido. O plano de produto mudou de direção antes desse comando chegar a ser usado de verdade.

## 9. Fora de escopo nesta rodada (Fase H, registrada, não implementada)

- ~~**Canvas web sem Postgres/login.**~~ Feito na mesma sessão, adiantado — o que fazia sentido "ficar pra depois" virou urgente ao publicar `gerador open` quebrado numa máquina real (ver §8.1: `openApiLocal.ts` + build local do Vite com `VITE_API_URL=""`).
- **Instalar o modo hospedado via `gerador` CLI** (ex.: um `gerador hosted-init` que baixasse `docker-compose.yml` + imagens publicadas) — hoje o único caminho é clonar o repositório e rodar `docker compose up --build`; como o repositório é privado, isso já filtra pra quem tem acesso de colaborador, consistente com "npm é o artefato público, repositório é o caminho interno".
- ~~**Wire-up automático do Graphify**~~ — feito na mesma sessão, com confirmação explícita do usuário ("pode fazer"): Git não estava instalado nesta máquina (instalado via `winget`, confirmado com o usuário antes), `git init` + commit inicial, `graphify hook install` (post-commit/post-checkout + driver de merge) e `graphify claude install` (`CLAUDE.md` + hooks `PreToolUse`). Detalhes em JOURNEY §34.
- **Descontinuar/remover de fato `packages/server`/Docker/Terraform** — decisão separada, não urgente.

## 10. Verificação

- `packages/cli`: `exportVault.test.ts` reescrito pra ler `config/referencias/*.json` local (fixture, sem mock de `fetch`); testes novos cobrindo a URI `obsidian://open?...` (nome do vault, `--vault-nome`, primeira referência) e que `--abrir` chama o launcher do SO (mockado no teste, não lança de verdade).
- Regressão completa dos 4 workspaces.
- Validação real: instalar o CLI globalmente de verdade (`npm pack` + `npm install -g`) numa sessão de terminal, confirmar `gerador --help`/`gerador export-vault` funcionam fora do diretório do repo.
- `graphify update .` + `JOURNEY.md` documentando o resultado real da validação.
- Fatia 2: `npm publish --dry-run` limpo (bin corrigido, conteúdo do tarball conferido); publicação de verdade pendente do login npm do usuário — quando publicado, validar `npm install -g gerador-de-itens` numa máquina/sessão sem o repositório clonado.

## 11. Skill removida — direção muda pra dois subagentes externos, um deles com MCP

Testando `gerador skill-install` de verdade, o usuário parou e reconsiderou: o valor que a skill entregava (conversa em texto que monta `quebra.json`, roda `derive`/`implementar`, revisão crítica) não é o fluxo que faz sentido pro objetivo final, que é terminar com os itens **de fato publicados** em algum sistema de tracking (Jira, citado como exemplo). Decisão: **cortar a skill inteiramente** — `gerador skill-install`, `packages/cli/templates/skill/`, `skill/gerador-de-itens/` removidos, junto com toda referência em README/tour/JourneyModal.

**Desenho da direção nova** (ainda não implementado — este parágrafo registra a intenção, não o resultado):
- **Interface de interação continua sendo o canvas existente** (`gerador open`, já funcionando sem login desde §8.1) — não uma UI nova. Confirmado explicitamente pelo usuário: a skill cortada não tira a necessidade do canvas visual, só a camada de skill-conversacional por cima dele.
- **Dois subagentes** (Claude Code `Agent` tool, não mais uma skill instalada em `.claude/skills/`), cada um com um prompt próprio:
  1. **Agente 1** — recebe o markdown já gerado (backlog ou especificação de entrega, saída de `gerador derive`/`implementar`) e monta os itens a partir dele.
  2. **Agente 2** — tem MCP habilitado (ex.: MCP do Jira), começa perguntando o link do épico onde os itens devem entrar (assim resolve projeto + épico de destino) e faz o upload de verdade.
- Um terceiro prompt, do **agente principal/orquestrador**, coordena a passagem do output do Agente 1 pro Agente 2.
- **Os textos/prompts desses agentes não vão pro pacote do `gerador`** — ficam como arquivos deste repositório (a serem criados), não como algo que `gerador` instala ou distribui. Diferente da skill (que era pra rodar em qualquer projeto via `gerador skill-install`), esse fluxo de subagentes é operado diretamente pelo usuário na sua própria sessão do Claude Code.

**Não implementado ainda** — os três prompts (agente 1, agente 2, orquestrador) ficam para uma rodada futura, quando o usuário validar o desenho acima.

## 12. Correções de uso real: `quebras/<id>.json`, cenário de exemplo completo, campos por tipo de nó editáveis, time por item

Detalhado em JOURNEY §42/§43 — resumo aqui pra quem lê só o SPEC.

- **Bug real: `quebra.json` fixo sobrescrevia a quebra anterior.** §8.1 descreveu um único arquivo pra toda quebra salva no canvas — funcionava pro primeiro save, mas "Nova quebra" + salvar reescrevia o mesmo arquivo, perdendo a anterior. Corrigido: `quebras/<id>.json`, um arquivo por quebra (`id` gerado com `randomUUID()` no primeiro `POST`), exatamente o que o cliente web (`usePersistencia.ts`) já esperava — ele já distinguia "criar" (sem id) de "atualizar" (com id), só o servidor local ignorava isso.
- **`config/campos-no.json` revisado.** §8.1 tinha decidido não suportar campo customizado por time no modo local (`GET` sempre `[]`, escrita 501). Revertido: o usuário queria configurar convenção de nomenclatura (ex.: sufixo `.queue`/`.dlq`/`.dlx`) por essa tela mesmo sem servidor — `openApiLocal.ts` ganhou a mesma regra de merge global/por-time que o modo hospedado já tinha (`packages/server/src/routes/camposNo.ts`), replicada num arquivo local.
- **`CamposNoTab.tsx` reescrito.** Antes só listava campos customizados (`campos_no`) — ficava vazio (0) mesmo com o tipo de nó tendo vários campos padrão em `config/diagrama.json`. Agora lista os padrão também (tag "padrão"), com "sobrescrever" pré-preenchendo um override pro time ativo.
- **`timesEnvolvidos` passa a ter default.** Antes só populava quando uma atividade tocava um nó `existente` de outro time (decisão de uma rodada anterior, pra evitar "só um item mostra time, parece bug"). Reconsiderado: toda atividade agora carrega o time da própria quebra por padrão, e o usuário edita item a item pelo nó de origem (`PropertiesPanel`, campo "time responsável", agora visível em qualquer nó — não editando a atividade derivada diretamente, que continua não-editável).
- `config/cenarios/credito-completo.json` ganhou os campos opcionais que faltavam (estava sem `linguagem`/`framework`/contratos/lógicas — sobrava `(não preenchido)` na especificação gerada).

Regressão completa (engine 81, web 100, cli 38) verde. Publicado `v0.1.8`.
