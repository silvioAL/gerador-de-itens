# SPEC-17 — Pivô: CLI local-first, Obsidian como padrão

**Depende de/relacionado a:** SPEC-16 (base de conhecimento, JOURNEY §32), Fase A (JOURNEY §20, decisão original de ir pra banco de verdade), CONTEXTO-E-ARQUITETURA.md §2/§5.1 (decisão original v1 de cortar banco/multi-tenant/auth, agora parcialmente revertida de novo). Reabre o rumo geral do produto — não corrige uma peça, decide entre dois modelos de distribuição.

**Status: implementado (fatia 1, JOURNEY §34) + fatia 2 (publicação no npm + GitHub, JOURNEY §35/§36) em andamento — falta só a publicação real no npm (bloqueada em 2FA, decisão do usuário sobre automatizar via CI em curso).**

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

## 7. Empacotamento e skill do Claude Code

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

## 8. Limitação conhecida: `gerador open` ainda não funciona fora do monorepo

`open` serve o build de `packages/web` a partir de um caminho relativo (`../../web/dist`, dentro do monorepo) — uma instalação global de `@gerador/cli` fora do checkout não encontra esse build. Os demais comandos (`derive`, `implementar`, `init`, `import-graphify`, `export-vault`) não têm essa limitação. Empacotar o editor visual junto ao CLI fica pra Fase H.

## 9. Fora de escopo nesta rodada (Fase H, registrada, não implementada)

- **Canvas web sem Postgres/login.** Fazer `gerador open` ganhar leitura/escrita local (quebras, perfis-time, campos-no, especificacao-template como arquivo) — a peça que faltaria pra `packages/web` funcionar inteiro sem servidor, não só o CLI/skill.
- **Empacotar `packages/web/dist` dentro de `@gerador/cli`** — resolveria a limitação do §8.
- ~~**Wire-up automático do Graphify**~~ — feito na mesma sessão, com confirmação explícita do usuário ("pode fazer"): Git não estava instalado nesta máquina (instalado via `winget`, confirmado com o usuário antes), `git init` + commit inicial, `graphify hook install` (post-commit/post-checkout + driver de merge) e `graphify claude install` (`CLAUDE.md` + hooks `PreToolUse`). Detalhes em JOURNEY §34.
- **Descontinuar/remover de fato `packages/server`/Docker/Terraform** — decisão separada, não urgente.

## 10. Verificação

- `packages/cli`: `exportVault.test.ts` reescrito pra ler `config/referencias/*.json` local (fixture, sem mock de `fetch`); testes novos cobrindo a URI `obsidian://open?...` (nome do vault, `--vault-nome`, primeira referência) e que `--abrir` chama o launcher do SO (mockado no teste, não lança de verdade).
- Regressão completa dos 4 workspaces.
- Validação real: instalar o CLI globalmente de verdade (`npm pack` + `npm install -g`) numa sessão de terminal, confirmar `gerador --help`/`gerador export-vault` funcionam fora do diretório do repo.
- `graphify update .` + `JOURNEY.md` documentando o resultado real da validação.
- Fatia 2: `npm publish --dry-run` limpo (bin corrigido, conteúdo do tarball conferido); publicação de verdade pendente do login npm do usuário — quando publicado, validar `npm install -g gerador-de-itens` numa máquina/sessão sem o repositório clonado.
