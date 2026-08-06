# SPEC-13 — Organização → Times → Membros

**Depende de SPEC-09-autenticacao-de-producao.md** · Corrige SPEC-09 §3.3 ("times só entram por convite, nunca criados do zero").

---

## 1. Objetivo

Testando `AUTH_MODE=oidc` de ponta a ponta contra o Google de verdade pela primeira vez (não só `dev`), a primeira sessão logada caiu direto no buraco que SPEC-09 §3.3 tinha sinalizado e aceitado como conhecido: com o banco limpo, ninguém tinha time nenhum — e sem alguém já num time pra gerar um convite, não tinha como a primeira pessoa de verdade entrar no app. A correção óbvia ("deixa criar um time novo") levantou a pergunta certa: nome de time é hoje uma string solta, única no banco inteiro — isso faz sentido, ou devia ser único só dentro de alguma coisa maior?

## 2. Uma organização por deploy — decisão, não limitação técnica

Este projeto pode um dia ser usado por mais de uma empresa (cada uma rodando sua própria instância, ou compartilhando uma). Modelo escolhido: **Organização → Times → Membros**, com uma tabela `organizacoes` de verdade — não só documentada, uma linha semeada pela migração — mas **uma organização só por deploy** nesta rodada, não multi-tenant de verdade.

Por quê não multi-tenant agora: o paralelo citado na decisão foi Jira/Trello — cada empresa tem seu próprio workspace/site, não várias organizações auto-servidas compartilhando a mesma configuração de login. Multi-tenant de verdade neste projeto reabriria o mesmo problema de bootstrap um nível acima (quem cria a *segunda* organização? Por qual login?) e exigiria decidir como `OIDC_DOMINIO_PERMITIDO` (SPEC-09 §2.2 — hoje um único domínio pro deploy inteiro) interage com múltiplas empresas logando pela mesma configuração OIDC — nenhuma dessas perguntas tem resposta ainda, e não vale a pena inventar uma sem um caso de uso real.

## 3. Schema

```
organizacoes: id (uuid), nome, criado_em
times: id (text — a mesma string de sempre, ex. "time-pagamentos"),
       organizacao_id (uuid, FK -> organizacoes), nome, criado_em
```

`usuario_time.time_id`, `convites_time.time_id`, `perfis_time.time_id` ganham FK de verdade pra `times.id` (antes eram texto solto, sem garantia de que o time "existisse"). `campos_no.time_id` fica de fora (tem o sentinela `__global__`, complicaria por pouco ganho) e `quebras.time`/`referencias.time_id` também (nullable, já soltos).

**Decisão deliberada:** `times.id` continua sendo a mesma string de sempre e continua **globalmente única** — não uma chave composta `(organizacao_id, id)`. Com uma organização só, isso já é o comportamento certo; virar composta quando (e se) existir mais de uma organização é uma migração pequena e isolada, não um redesenho. Evita reescrever `packages/engine` (`PerfisConfig` continua `Record<string, PerfilTime>`), `packages/cli`, e todas as telas do `packages/web` que hoje mostram o `timeId` direto como rótulo (`EscolherTimeScreen`, `<select>` do header, `PerfisTimeTab`, `CamposNoTab`, `MembrosTab`) — nenhuma delas precisou mudar nesta rodada.

## 4. `POST /times` — criar um time novo

`exigirSessao` (qualquer sessão, mesmo sem time nenhum) → resolve a organização única (`SELECT id FROM organizacoes LIMIT 1` — não há seletor de organização em lugar nenhum, só existe uma) → 409 se já existe um `times` com esse nome ("já existe um time com esse nome" — tom de namespace, não de "vc tá tentando roubar algo") → insere em `times` e em `usuario_time` na mesma escrita → reemite o cookie de sessão já com o time novo dentro (mesmo padrão de `POST /convites/:token/aceitar`, SPEC-09 §3.2).

`packages/web/src/auth/SemTimeScreen.tsx` ganha uma segunda seção — "ou crie um time novo" — ao lado da já existente "colar link de convite". As duas resolvem "sem time nenhum ainda" por caminhos diferentes: criar do zero (você vira o primeiro membro) vs. entrar num que já existe (alguém de lá te convidou).

## 5. O que fica de fora desta rodada (de propósito)

- Sem UI pra criar/renomear organização — a única linha é semeada pela migração, igual aos usuários de seed do modo `dev`.
- `OIDC_DOMINIO_PERMITIDO` continua um único domínio pro deploy inteiro — não vira configuração por organização.
- Nenhuma tela mostra `times.nome` como algo distinto de `times.id` ainda — a coluna existe pro futuro, mas todo lugar que hoje usa o slug como rótulo continua fazendo isso.
- Sem chave composta `(organizacao_id, id)` — ver §3.

## 6. O que não fazer

- Não deixar `POST /times` reaproveitar um nome já existente — isso seria auto-entrar num time de outra pessoa sem convite, quebrando a mesma barreira que SPEC-09 §3 já estabeleceu pro fluxo de convite.
- Não inventar fluxo de criação/entrada em organização nesta rodada — com uma organização só, isso ainda não tem caso de uso real.
- Não migrar `times.id` pra uuid nem pra chave composta preventivamente — só quando (e se) existir uma segunda organização de verdade.
