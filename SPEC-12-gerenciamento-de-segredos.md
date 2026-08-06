# SPEC-12 — Gerenciamento de segredos (Infisical self-hosted)

**Depende de SPEC-09-autenticacao-de-producao.md** · Fecha a lacuna que SPEC-09 deixou em aberto: `OIDC_CLIENT_SECRET` (e o resto dos segredos reais de produção) precisava ser colado direto no `docker-compose.yml`/`.env` de cada máquina — funciona, mas "chumba" o segredo em texto plano local por máquina, sem rotação centralizada nem forma de revogar sem trocar o valor em todo lugar de novo.

---

## 1. Objetivo

Usando a Fase B.1 pela primeira vez, o usuário apontou o problema antes mesmo de configurar o Google de verdade: colar `OIDC_CLIENT_SECRET` num `.env` local funciona, mas não escala pra "baixar o projeto do GitHub numa máquina nova, só rodar e inserir a chave lá" sem repetir o processo de configuração toda vez, e sem um lugar central pra revogar/rotacionar se vazar. Decisão (confirmada pelo usuário): **Infisical self-hosted**, não HashiCorp Vault (robusto demais pra essa escala — `unseal`/políticas que este projeto não precisa) nem só um `.env.example` (não é um vault de verdade, o segredo mora em texto plano local sem rotação nem UI).

## 2. Arquitetura: duas stacks Docker separadas

### 2.1 Por que separada do `docker-compose.yml` do projeto

O vault não é do domínio do `gerador-de-itens` — é infraestrutura compartilhável entre qualquer projeto futuro na mesma máquina. Fica em `infra/secrets/docker-compose.yml`, com Postgres e Redis **próprios** (dependência do próprio Infisical, não reaproveita o Postgres do `db` do projeto — misturar os dois bancos criaria acoplamento entre o ciclo de vida do vault e o ciclo de vida do app). Essa stack pode ser movida pra qualquer outra pasta/máquina sem alterar nada — não referencia nenhum arquivo do resto do repo.

### 2.2 Rede: os dois containers precisam se falar sem publicar porta

`server` (a app) precisa alcançar `infisical` (o vault) pelo nome do container, não só pelo host — os dois `docker-compose.yml` (o do projeto e o de `infra/secrets/`) declaram a mesma rede Docker **externa**, criada uma vez por máquina:

```bash
docker network create gerador-secrets-net
```

Cada compose referencia essa rede como `external: true`. Isso é o que permite `infra/secrets/` viver em outra pasta (ou repositório) — a única coisa que os liga é o nome da rede, não caminho de arquivo nenhum.

### 2.3 O problema do segredo-zero (bootstrap)

Um vault resolve "onde guardar os segredos de verdade", mas ainda precisa de **uma** credencial pra provar quem está pedindo os segredos — não dá pra eliminar isso, só reduzir o dano de vazar. Solução: **Machine Identity** do Infisical (Universal Auth — client ID + client secret), criada pela UI do Infisical e escopada só pra ler o projeto/ambiente deste app. Essas duas credenciais (`INFISICAL_CLIENT_ID`/`INFISICAL_CLIENT_SECRET`) são o que sobra em texto plano num `.env` local — mas vazar isso só dá acesso de leitura a um projeto específico do vault, revogável na hora pela UI, nunca o `OIDC_CLIENT_SECRET` do Google diretamente. É uma redução de blast radius, não eliminação — não existe eliminação total do segredo-zero em nenhum esquema de vault.

## 3. Injeção em runtime — zero mudança de código no server

`packages/server` continua lendo `process.env.OIDC_CLIENT_SECRET` exatamente como hoje (`packages/server/src/auth/oidc.ts`) — nenhuma linha de código muda. O CLI oficial do Infisical (`infisical run`) busca os segredos do projeto/ambiente configurado e os injeta como variáveis de ambiente no processo filho, antes dele iniciar. `packages/server/Dockerfile` troca:

```dockerfile
CMD ["node", "dist/server.cjs"]
```
por
```dockerfile
CMD ["infisical", "run", "--domain", "$INFISICAL_API_URL", "--projectId", "$INFISICAL_PROJECT_ID", "--env", "$INFISICAL_ENV", "--", "node", "dist/server.cjs"]
```
(autenticação via `INFISICAL_CLIENT_ID`/`INFISICAL_CLIENT_SECRET` no ambiente, que o CLI lê automaticamente). Isso mantém a mesma separação que já existia entre `AUTH_MODE=dev` (nunca precisa do Infisical — não tem segredo real nenhum) e `AUTH_MODE=oidc` (agora busca `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_DOMINIO_PERMITIDO`/`SESSAO_SEGREDO` do vault em vez de `environment:` do compose).

## 4. O que vai pro vault, o que continua em `environment:` puro

| Vai pro Infisical (sensível) | Continua no `docker-compose.yml` (não sensível / já escopado à rede local) |
|---|---|
| `OIDC_CLIENT_ID` | `DATABASE_URL` (credencial do Postgres do próprio compose, não exposta fora dele) |
| `OIDC_CLIENT_SECRET` | `AUTH_MODE` |
| `OIDC_DOMINIO_PERMITIDO` (não é segredo, mas muda por ambiente) | `CONFIG_DIR` |
| `SESSAO_SEGREDO` (chave de assinatura JWT — SPEC-08 §2.1) | `ORIGEM_WEB` |

Critério: se vazar o valor compromete algo fora da rede Docker local (login de terceiros via Google, forjar sessão), vai pro vault. Se o valor só faz sentido dentro da rede que o próprio `docker-compose.yml` já define, fica como está.

## 5. Onboarding numa máquina nova (o pedido original do usuário)

1. `docker network create gerador-secrets-net` (uma vez por máquina).
2. Subir `infra/secrets/docker-compose.yml` (pode estar em qualquer pasta — não precisa estar dentro do clone deste repo).
3. Abrir a UI do Infisical (`http://localhost:8080` por padrão), criar o admin (primeira vez só), criar o projeto e colar os segredos reais lá — isso é o único passo manual que se repete por máquina, e é exatamente o "baixar em outra máquina, iniciar e inserir lá" que o usuário pediu.
4. Criar uma Machine Identity, gerar `INFISICAL_CLIENT_ID`/`INFISICAL_CLIENT_SECRET`, dar acesso de leitura ao projeto/ambiente.
5. No `.env` deste repo (gitignored — nunca commitado, ver `.env.example`): `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV`, `INFISICAL_API_URL=http://infisical:8080`.
6. `docker compose up -d --build` — o `server` já sobe puxando os segredos reais do vault pela rede.

## 6. O que não fazer

- Não usar HashiCorp Vault — `unseal`, políticas ACL e Raft storage são complexidade que essa escala de projeto não justifica; Infisical cobre o mesmo problema (segredo fora do código, UI de administração, rotação) com fricção de setup muito menor.
- Não misturar o Postgres do Infisical com o `db` do projeto — ciclos de vida diferentes (o vault pode servir outros projetos depois, o `db` é só deste app).
- Não commitar `INFISICAL_CLIENT_ID`/`INFISICAL_CLIENT_SECRET` em lugar nenhum — são o segredo-zero local, mesma régua que já valia pro `OIDC_CLIENT_SECRET` antes.
- Não publicar a porta do Infisical pra fora da máquina em produção sem TLS na frente — mesmo raciocínio de rede exposta que já motivou SPEC-10 (rate limit, CORS) pro próprio app.
- Não reimplementar a leitura de segredos com um SDK dentro do código do server — `infisical run` como wrapper do processo mantém `packages/server` sem nenhuma dependência do Infisical, trocável por outro vault no futuro sem tocar em `auth/oidc.ts`.
