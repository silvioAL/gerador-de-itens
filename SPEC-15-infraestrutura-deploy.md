# SPEC-15 — Infraestrutura como código, deploy e CI/CD (Fase D)

**Depende de** SPEC-09 (autenticação OIDC), SPEC-10 (segurança de produção), SPEC-12 (segredos via Infisical) · Fecha a única decisão que ficava em aberto no plano mestre ("Ainda em aberto: provedor de nuvem") — o usuário escolheu **GCP**.

---

## 1. Objetivo

Deploy repetível de uma VM só, com HTTPS automático e CI/CD simples — sem Kubernetes, sem múltiplos serviços gerenciados, sem sobre-engenhar pra uma escala que este projeto não tem. Mesma régua usada em todo o resto: "muito simples" primeiro, evoluir depois só se doer.

## 2. Terraform — um módulo pequeno, trocável de provedor

`infra/main.tf` + `infra/variables.tf` + `infra/outputs.tf` + `infra/cloud-init.yaml`, provider `google` (`hashicorp/google ~> 5.0`). Provisiona:

- **1 VM** (`google_compute_instance`, `e2-small` por padrão — configurável via `var.machine_type`), imagem `debian-cloud/debian-12`.
- **1 IP externo fixo** (`google_compute_address`) — sem isso, todo restart de VM trocaria o IP e quebraria DNS/OIDC redirect URI.
- **1 disco de dados separado** (`google_compute_disk`, padrão 20GB) anexado à VM — o volume do Postgres vive aqui, não no disco de boot, pra sobreviver a uma recriação de instância sem perder dado.
- **1 regra de firewall** liberando só `22` (SSH), `80`/`443` (HTTP/HTTPS via Caddy) — nada mais exposto.
- **cloud-init** (`infra/cloud-init.yaml`, passado como `metadata.user-data`) instala Docker + Docker Compose plugin, formata (se ainda não formatado) e monta o disco de dados em `/mnt/pgdata`, cria `/opt/gerador` (destino dos arquivos de deploy) dono do usuário SSH.

Deliberadamente **não** provisionado por Terraform: a stack do Infisical (`infra/secrets/`, SPEC-12) e o conteúdo de `/opt/gerador` (compose file, Caddyfile) — esses continuam sendo copiados/subidos pelo workflow de deploy (§4) ou manualmente na primeira vez, mesmo modelo dos outros onboardings deste projeto (nada é criado silenciosamente fora do controle de quem está olhando).

Variáveis sem default (o operador precisa decidir conscientemente, não herdar um valor perigoso):
- `project_id`, `region`, `zone` — do projeto GCP do usuário.
- `ssh_user`, `ssh_pub_key_path` — quem consegue entrar na VM.
- `allowed_ssh_cidr` — nunca `0.0.0.0/0` por padrão; exige um CIDR explícito (o IP de quem administra, ou a faixa do runner do GitHub Actions se o deploy também abrir SSH — ver §4).

`terraform apply` **não foi executado nesta sessão** — não há credenciais GCP nem `terraform`/`gcloud` instalados neste ambiente de desenvolvimento. O módulo foi escrito e revisado à mão; falta `terraform validate`/`plan` reais na primeira vez que o usuário rodar com uma conta GCP de verdade.

## 3. Caddy — TLS automático, e a peça que faz o cookie de sessão continuar funcionando

`Caddyfile` (raiz do projeto, ~10 linhas): termina TLS via Let's Encrypt automaticamente (zero configuração manual de certificado) e faz reverse proxy:

```caddyfile
{$DOMAIN:localhost} {
	handle_path /api/* {
		reverse_proxy server:4000
	}
	handle {
		reverse_proxy gerador:80
	}
}
```

**Decisão importante, não só conveniência:** `/api/*` no mesmo domínio do front, não um subdomínio `api.dominio.com` separado. A sessão viaja em cookie `sameSite: "lax"` (`packages/server/src/auth/sessao.ts`, decisão da Fase B) — em domínios diferentes isso exigiria `sameSite: "none"` + `secure: true` e reabriria a superfície de CSRF que `lax` evita hoje. Com Caddy roteando por *path* no mesmo domínio, o browser vê tudo como same-origin — nenhuma mudança de `sameSite` necessária, CORS deixa de ser relevante pro tráfego real do browser (continua configurado no server por defesa em profundidade, SPEC-10).

Isso exige `packages/web` saber, em **build time**, que a API mora em `/api` (Vite resolve `import.meta.env.VITE_API_URL` no bundle, não em runtime — diferente de `config/*.json`, que já é runtime desde a Fase A). O `Dockerfile` da raiz ganhou `ARG VITE_API_URL` (default `http://localhost:4000`, preservando o comportamento atual de dev/E2E sem mudar nada pra quem não passa o build-arg) — o build de produção no CI passa `--build-arg VITE_API_URL=/api`.

**Achado ao desenhar isto, corrigido junto:** os `reply.setCookie(...)` de `routes/auth.ts` e `routes/times.ts` nunca setavam `secure` — inofensivo em dev (HTTP puro) mas errado atrás de HTTPS de verdade (o cookie deveria recusar viajar em texto plano). Adicionado `secure: process.env.NODE_ENV === "production"`, mesmo padrão de detecção de ambiente já usado em `app.ts` pro CORS obrigatório.

## 4. CI/CD — GitHub Actions

Dois workflows, escopo deliberadamente separado:

- **`.github/workflows/ci.yml`** — todo push e PR, qualquer branch: `npm ci`, `npm test --workspaces`, `npm run lint --workspaces`, `npm run build --workspaces`. Não builda nem publica imagem Docker — só valida que o código está correto, mesmos comandos que já rodam localmente.
- **`.github/workflows/deploy.yml`** — builda as duas imagens (`web`, `server`) com `docker/build-push-action`, publica no GitHub Container Registry (`ghcr.io/<owner>/gerador-web`, `ghcr.io/<owner>/gerador-server`, grátis e já autenticado via `GITHUB_TOKEN`, sem conta em mais um serviço), depois via SSH (`appleboy/ssh-action`) copia `docker-compose.prod.yml` + `Caddyfile` pra `/opt/gerador` na VM e roda `docker compose -f docker-compose.prod.yml -f docker-compose.secrets.yml pull && ... up -d`. **Atualizado em SPEC-17**: disparo mudou de automático (`workflow_run` toda vez que CI passava na `main`) pra manual (`workflow_dispatch`, aba Actions → "Run workflow") — o modo hospedado virou dormente, não é mais o caminho padrão de distribuição (esse lugar foi tomado por `publish.yml`, que publica `packages/cli` no npm numa tag de versão), e disparar automaticamente contra uma VM que talvez nem exista (`terraform apply` nunca rodou) só gerava execução falha sem sentido.

Sem blue-green, sem canary — um serviço deste porte tolera alguns segundos de downtime num `up -d` com imagem nova; resolver isso depois é aditivo, não um redesenho.

**Segredos do próprio pipeline** (GitHub Actions secrets, nunca commitados): `GCP_VM_HOST` (o IP fixo do §2, usado só pra SSH/SCP), `GCP_VM_SSH_USER`, `GCP_VM_SSH_KEY` (chave privada correspondente à pública passada ao Terraform), `DOMAIN` (o domínio público que aponta pro IP fixo — o Caddyfile e `ORIGEM_WEB` usam esse valor, não o IP; distinto de `GCP_VM_HOST` porque um é endereço de rede e o outro é identidade pública do serviço). `GITHUB_TOKEN` pro GHCR é automático, não precisa ser cadastrado.

**O que o pipeline não faz:** não roda `terraform apply` (provisionamento de infra continua manual/deliberado — trocar o tamanho da VM não deveria ser um efeito colateral de um `git push`), não gerencia os segredos da aplicação (`OIDC_CLIENT_SECRET` etc. — isso é o Infisical, SPEC-12, já rodando na VM antes do primeiro deploy).

## 5. `docker-compose.prod.yml` — variante de produção, não um compose novo do zero

Reaproveita a mesma composição de sempre, só troca `build:` por `image: ghcr.io/...` (imagens já publicadas pelo CI) e acrescenta o serviço `caddy`:

```yaml
services:
  gerador:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/gerador-web:latest
  server:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/gerador-server:latest
  db:
    volumes:
      - /mnt/pgdata:/var/lib/postgresql/data   # disco de dados do §2, não o disco de boot
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
```

`gerador`/`server` **não publicam porta pra fora** em produção — só o Caddy fala com a internet, o resto conversa por dentro da rede do compose (mesmo princípio de "não expor o que não precisa" já usado pro Infisical em SPEC-12 §2.2). Subido junto com o overlay já existente do SPEC-12 (`-f docker-compose.prod.yml -f docker-compose.secrets.yml`) — não duplica a integração com o vault, só empilha.

## 6. O que fica de fora desta fase

- Sem Kubernetes/ECS/multi-VM — uma VM com `docker compose up -d` é a "infra muito simples" que o usuário pediu; escalar horizontalmente é um problema de quando (se) a carga justificar.
- Sem blue-green/canary no deploy.
- Sem backup automatizado do Postgres ainda (`pg_dump` via cron na VM) — mencionado no plano original como parte da Fase D, mas não incluído neste SPEC; entra como item separado quando a VM já estiver de pé (precisa dela existindo pra agendar o cron).
- Sem `terraform apply` real nem validação `terraform plan` — bloqueado por falta de conta/credenciais GCP e das CLIs (`terraform`, `gcloud`) neste ambiente de desenvolvimento. Escrito e revisado à mão; validação real fica para quando o usuário rodar com uma conta GCP de verdade.
- Sem provisionamento automático da stack do Infisical na VM nova — a primeira vez continua manual, seguindo SPEC-12 §5 (agora na VM em vez de local).

## 7. Próximos passos (fora deste SPEC)

1. Usuário roda `terraform init && terraform plan` com uma conta GCP real, revisa o plano, só então `apply`.
2. Primeira subida manual na VM nova: `docker network create gerador-secrets-net`, subir `infra/secrets/`, configurar a Machine Identity (SPEC-12 §5) — antes do primeiro deploy automático via Actions.
3. Cadastrar os 3 secrets do GitHub Actions (§4) no repositório.
4. `git push` na `main` — primeiro deploy automático.
