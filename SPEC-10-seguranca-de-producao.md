# SPEC-10 — Segurança de produção (Fase E adiantada)

**Depende de SPEC-08-autenticacao-e-config-por-time.md e SPEC-09-autenticacao-de-producao.md** · Corresponde à "Fase E" do plano `hashed-foraging-ullman.md`, adiantada pra logo depois da Fase B em vez de ficar pro final — o usuário pediu medidas anti-ataque especificamente ao ver o login funcionando de verdade pela primeira vez.

---

## 1. Objetivo

Login real (SPEC-09) expõe `@gerador/server` de um jeito que a Fase A/B não expunham: agora existe um endpoint que qualquer um na rede pode bater tentando adivinhar credencial, e sessões que valem a pena roubar. Fechar os riscos óbvios de expor isso numa rede real, sem inventar compliance que ninguém pediu — mesmo espírito do plano original.

## 2. Rate limiting

### 2.1 Login primeiro, resto depois

`/auth/login` (modo `dev`) e `/auth/callback` (modo `oidc`) são os alvos óbvios de força bruta/abuso — ganham limite mais agressivo (`@fastify/rate-limit`, ex.: 10 tentativas / 5 min por IP) que o resto da API. Endpoints de escrita normais (`PUT /perfis-time`, `POST /campos-no`...) ganham um limite mais folgado (ex.: 100/min por IP) — não é sobre impedir uso normal, é sobre não deixar um script varrer o banco em loop.

### 2.2 Por IP, não por sessão

Rate limit tem que valer *antes* de saber quem é a pessoa (é exatamente o cenário de alguém tentando adivinhar) — chave é IP, não `email`/cookie. Atrás de um proxy reverso (Caddy, Fase D), isso exige confiar em `X-Forwarded-For` só do proxy conhecido, nunca do cliente direto — `@fastify/rate-limit` com `trustProxy` configurado igual ao Fastify (`app.register(..., { trustProxy: true })` só quando `NODE_ENV=production` atrás do Caddy da Fase D; em dev/E2E, sem proxy, `trustProxy` fica desligado).

## 3. Headers de segurança e CORS

- `@fastify/helmet` com a config padrão (CSP básica, `X-Content-Type-Options`, `X-Frame-Options`) — o app não serve conteúdo de terceiros nem iframe embed, então a política padrão do helmet não quebra nada.
- CORS já não usa `*` desde a Fase A (`ORIGEM_WEB` fixo quando setado) — isso fica confirmado/travado como obrigatório em produção: `buildApp` passa a exigir `origemPermitida` definido quando `NODE_ENV=production` (falha alto no boot, não silenciosamente aberto pra qualquer origem).

## 4. Log de auditoria

### 4.1 O que grava

Toda escrita em `perfis_time`, `referencias`, `campos_no`, e membership (`usuario_time` via SPEC-09 §4) grava uma linha em `auditoria (id, email, acao, recurso, recurso_id, timestamp)` — não versiona o dado (não é "quem mudou o quê pra quê", só "quem mexeu em quê e quando"). Suficiente pra responder "quem tocou nisso" sem montar um sistema de auditoria completo com diff de valores.

### 4.2 Onde vive

Um `preHandler`/hook único registrado nas rotas de escrita já protegidas por `exigirSessao`/`exigirTime` (SPEC-08 §2.2) — reaproveita que essas rotas já garantem `req.usuario` populado, só acrescenta um insert fire-and-forget depois da escrita principal ter sucedido (não bloqueia a resposta, não derruba a escrita se a auditoria falhar — auditoria é observabilidade, não deveria ser um novo jeito da escrita de verdade falhar).

## 5. Backup — continua bloqueado pela Fase D

`pg_dump` diário via cron precisa de uma VM pra rodar o cron (Fase D, ainda esperando decisão de provedor de nuvem). Não dá pra adiantar isso sem inventar onde ele roda — fica registrado aqui como pendência que também abre quando a Fase D começar, não implementado nesta rodada.

## 6. O que não fazer

- Não colocar rate limit por sessão/e-mail no login — o ataque que importa é anterior a saber quem é a pessoa.
- Não confiar em `X-Forwarded-For` sem `trustProxy` explicitamente restrito ao proxy conhecido — cliente pode forjar esse header.
- Não versionar valor antigo/novo na auditoria — é log de "quem/quando", não um sistema de histórico/rollback.
- Não montar backup sem ter onde rodar o cron — não adianta escrever `infra/backup.sh` (já previsto no plano original) antes de existir uma VM de verdade pra chamá-lo.
