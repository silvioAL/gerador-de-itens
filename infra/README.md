# infra/ — Terraform (Fase D, SPEC-15)

Provisiona a VM única do `gerador-de-itens` no GCP. Não inclui a stack do Infisical (`infra/secrets/`, SPEC-12) — essa é infra separada, ver o README dela.

## Uso

```bash
cd infra
terraform init
terraform plan \
  -var="project_id=<seu-projeto-gcp>" \
  -var="region=southamerica-east1" \
  -var="zone=southamerica-east1-a" \
  -var="ssh_user=<seu-usuario>" \
  -var="ssh_pub_key_path=~/.ssh/id_ed25519.pub" \
  -var="allowed_ssh_cidr=<seu-ip>/32"
# revise o plano, só então:
terraform apply <mesmas flags>
```

Ou crie um `terraform.tfvars` (nunca commitado — já coberto pelo `.gitignore` deste diretório) com as mesmas variáveis.

## Depois do `apply`

1. `terraform output instance_ip` — aponte o DNS do domínio pra esse IP.
2. SSH na VM, `docker network create gerador-secrets-net`, suba `infra/secrets/` (SPEC-12) e configure a Machine Identity — mesmo passo a passo do onboarding local, agora na VM.
3. Cadastre `GCP_VM_HOST` (o IP acima), `GCP_VM_SSH_USER`, `GCP_VM_SSH_KEY` e `DOMAIN` (o domínio público que você apontou pro IP, ex. `gerador.suaempresa.com`) como secrets do repositório no GitHub — o workflow `.github/workflows/deploy.yml` usa os quatro.
4. `git push` na `main` — primeiro deploy automático copia `docker-compose.prod.yml`/`Caddyfile` pra `/opt/gerador` e sobe a stack.

## Por que separado do resto do repo

Trocar de provedor de nuvem no futuro é trocar este diretório (provider + os 4 arquivos `.tf`), não redesenhar o resto — `docker-compose.prod.yml`, `Caddyfile` e os workflows do GitHub Actions não sabem nem precisam saber que a VM é GCP.
