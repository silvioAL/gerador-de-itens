# SPEC-09 — Autenticação de produção: Google OIDC, convite de time e administração

**Depende de SPEC-08-autenticacao-e-config-por-time.md** · Estende o modo `AUTH_MODE=oidc` (até aqui nunca exercido, só desenhado) e fecha as duas lacunas que o próprio SPEC-08 §2.2 já sinalizava como conhecidas: onboarding de usuário/time era manual (inserir linha direto no banco) e não existia UI de administração.

---

## 1. Objetivo

Usando a Fase B de verdade, o usuário apontou que "o processo de login e de conta não está maduro ainda": faltava um provedor real configurado (só o modo `dev` tinha sido exercido), faltava um jeito de uma pessoa nova entrar num time sem alguém rodar SQL na mão, e faltava alguma forma de gerenciar quem pertence a qual time sem acesso direto ao banco.

## 2. Google como provedor OIDC

### 2.1 Por que Google encaixa sem mudar o desenho do SPEC-08

`AUTH_MODE=oidc` (SPEC-08 §2.1) já foi desenhado genérico via `openid-client` — Google é só mais um provedor com endpoint de descoberta padrão (`https://accounts.google.com/.well-known/openid-configuration`). Ativar Google é configuração (`OIDC_ISSUER_URL=https://accounts.google.com`, `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` de um projeto no Google Cloud Console, `OIDC_REDIRECT_URI` apontando pro `/auth/callback` do `@gerador/server` hospedado), não código novo — a primeira vez que o modo `oidc` roda de verdade nesta rodada.

Em produção, `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` **não** entram como `environment:` em texto plano no `docker-compose.yml` — chegam via o vault (SPEC-12-gerenciamento-de-segredos.md). `packages/server/src/auth/oidc.ts` continua lendo `process.env.OIDC_CLIENT_SECRET` exatamente como antes; quem injeta esse valor no processo muda (`infisical run`), não o código.

### 2.2 Duas checagens que o SPEC-08 não tinha (porque nunca foi exercido contra um provedor real)

- **`email_verified`**: `trocarCodigoPorEmail` (`packages/server/src/auth/oidc.ts`) passa a exigir `claims.email_verified === true`, não só a presença do claim `email`. Google sempre verifica, mas o código é genérico pra qualquer provedor OIDC — alguns permitem e-mail não verificado no cadastro; confiar nisso sem checar seria a mesma classe de furo que "confiar em header de origem sem validar".
- **Domínio permitido (opcional)**: `OIDC_DOMINIO_PERMITIDO` (env var, ex.: `empresa.com`) — se setada, `trocarCodigoPorEmail` rejeita e-mails fora desse domínio antes mesmo de chegar em `usuario_time`. Não é sobre confiar mais no Google; é sobre não deixar qualquer conta Google do mundo tentar autenticação contra um servidor que é, na prática, de uso interno de uma empresa.

### 2.3 O que continua igual

Sessão, cookie, `exigirSessao`/`exigirTime`, e a tabela `usuario_time` como fonte de quais times uma pessoa pertence — nada disso muda entre `dev` e `oidc`. Login com Google só troca *como* a pessoa prova quem é; o que ela pode fazer depois de provada é exatamente o mesmo código do SPEC-08.

### 2.4 Correção: login não escolhe time (achado real, revisão pós-implementação)

A primeira versão desta spec (e do modo `dev`) pedia um `timeId` na própria tela/corpo de login — mesmo raciocínio do SPEC-08 original. Isso não se sustenta: não tem como saber, *antes* de autenticar, a quais times um e-mail pertence, e um e-mail pode pertencer a mais de um (a própria premissa do §3 abaixo). `POST /auth/login` (modo `dev`) e o retorno do callback OIDC passam a receber **só a prova de identidade** — `emitirSessaoParaEmail` monta a sessão com todo `usuario_time` daquele e-mail, seja zero, um, ou vários times. Qual fica *ativo* é decisão de depois que a sessão já existe:

- Zero times → `SemTimeScreen` (`packages/web/src/auth/SemTimeScreen.tsx`) — cola um link/código de convite (mesmo mecanismo do §3.2), não só uma mensagem sem saída.
- Um time → segue direto, sem perguntar nada.
- Mais de um → `EscolherTimeScreen` (`packages/web/src/auth/EscolherTimeScreen.tsx`) — escolhe qual fica ativo agora; dá pra trocar depois pelo seletor que já existe no header (SPEC-08 §2.3).

## 3. Auto-cadastro por convite

### 3.1 Por que convite, não "pedir acesso" com aprovação

Duas formas óbvias de deixar uma pessoa nova entrar num time sem SQL manual: (a) um fluxo de solicitação + aprovação por alguém, ou (b) um link de convite gerado por quem já está no time. (a) exige inventar um conceito de aprovador/notificação que este projeto não tem em lugar nenhum. (b) é o padrão já conhecido (Slack, Discord, GitHub) e não exige nada novo além de uma tabela e duas rotas — decisão: **convite por link**.

### 3.2 Mecanismo

Nova tabela `convites_time`:

```
convites_time: token (uuid, pk), time_id, criado_por (email), criado_em, expira_em, usado_por (email, nullable), usado_em (nullable)
```

- `POST /times/:timeId/convites` (`exigirTime(timeId)` — só quem já é do time convida pra ele) cria um token com validade curta (7 dias) e devolve a URL completa (`{ORIGEM_WEB}/?convite={token}`).
- `POST /convites/:token/aceitar` (`exigirSessao` — precisa estar logado, qualquer time) valida token não expirado e não usado, insere `usuario_time(email da sessão, timeId do convite)` (idempotente — `ON CONFLICT DO NOTHING`, entrar de novo no mesmo time não é erro), marca o convite usado. Convite usado ou expirado devolve 410, não 404 (o link existiu, só não serve mais — mensagem diferente pro usuário).
- `packages/web`: `?convite=TOKEN` na URL raiz é lido no boot, guardado em estado até a sessão existir (login acontece primeiro, se necessário), então chama `aceitar` automaticamente e redireciona pra `/` limpo.

### 3.3 O que isso não resolve (de propósito) — **revertido, ver SPEC-13**

~~Não cria um time novo do zero — convite sempre aponta pra um `time_id` que quem convidou já pertence. Criar o *primeiro* time de uma organização continua sendo uma linha manual em `usuario_time`... Isso é aceitável: um time só existe, neste sistema, quando alguém já colocou pé nele.~~ Corrigido pós-uso: a primeira sessão logada via Google de verdade, com o banco limpo, caiu exatamente nesse buraco — ninguém tinha time nenhum pra convidar ninguém. `POST /times` agora deixa qualquer sessão criar um time novo (ver **SPEC-13-organizacao-times-membros.md**), sem exigir que alguém já exista antes.

## 4. Administração de membros do time

### 4.1 Sem papel de admin novo — mesma régua do SPEC-08 §3.4

SPEC-08 já decidiu deliberadamente não introduzir um papel de administrador pra campos globais. Mesma lógica aqui: **qualquer pessoa que já pertence a um time pode administrar a lista de membros daquele time** (adicionar direto por e-mail, remover, gerar/revogar convite) — não existe um "admin do time" diferente de "membro do time". Simplicidade sobre controle fino que ninguém pediu ainda.

### 4.2 Rotas

- `GET /times/:timeId/membros` (`exigirTime`) — lista e-mails.
- `POST /times/:timeId/membros` (`exigirTime`) — adiciona direto, `{ email }`, sem convite (atalho pra quando a pessoa já confirmou por fora, ex. Slack).
- `DELETE /times/:timeId/membros/:email` (`exigirTime`) — remove. Recusa (400) remover o último membro de um time — um time sem ninguém não tem quem o administre depois, vira órfão sem saída a não ser SQL manual de novo.

### 4.3 UI

Nova aba "Membros" na `ConfigScreen` (SPEC-08 §3.5) — lista de e-mails do time ativo, formulário "adicionar por e-mail", botão "gerar link de convite" (copia a URL), botão excluir por linha.

## 5. O que não fazer

- Não pedir/checar time no momento do login (§2.4) — é responsabilidade de `exigirTime` nas rotas que de fato mexem em recurso de um time, não do handshake de identidade.
- Não confiar em `email` de um provedor OIDC sem checar `email_verified` — vale pra Google e pra qualquer provedor que entrar depois.
- Não inventar aprovação/fluxo de notificação pro convite — é auto-aceite de quem já tem o link, igual a qualquer convite de time de mercado.
- Não criar papel de admin separado de "é membro do time" — nem aqui nem em `campos_no` (SPEC-08 §3.4). Se aparecer necessidade real de um papel mais restrito, é extensão futura, não antecipação.
- Não deixar remover o último membro de um time.
