# Gerador de Itens

Ferramenta de quebra técnica: desenhe um diagrama de arquitetura (serviços, filas, bancos, processos de negócio, regras...) num canvas visual, preencha um painel de propriedades dirigido por config, e derive **deterministicamente** itens de trabalho com dependências reais — agnóstico de qual sistema de tracking recebe isso depois. Nada aqui é gerado por um LLM adivinhando a partir de uma descrição solta — sempre por regras explícitas em `config/diagrama.json`.

Não é um gerador de prompt de IA. O mesmo diagrama sempre produz os mesmos itens.

## Início rápido

O caminho padrão é o CLI local — instala com um comando, sem servidor, sem login (SPEC-17). Além de mais simples, isso evita depender de um domínio novo hospedado (VM+DNS próprio) que times corporativos costumam bloquear até serem categorizados/liberados no firewall — o CLI local não sai do `localhost`, só `npm install` contra `registry.npmjs.org` (já confiável na maioria dos ambientes). Docker/login real continuam existindo (modo hospedado, pra quem já usa esse caminho e não tem essa restrição), mas deixaram de ser o recomendado por padrão.

### 1. CLI local (recomendado)

```powershell
npm install -g gerador-de-itens --allow-scripts=node-llama-cpp
gerador init                            # em qualquer diretório de projeto
gerador derive quebra.json --out itens.md
gerador open                            # editor visual, http://localhost:4321 — já vem empacotado, sem build extra
```

`--allow-scripts=node-llama-cpp` é necessário porque o CLI depende do [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) (motor de IA local, SPEC-23) — sem essa flag, o `npm` (versões recentes) pula o postinstall dele por padrão, e os binários nativos ficam num estado incompleto/incorreto que o Windows Defender pode sinalizar como "app bloqueado" ao tentar carregar (ver [Solução de problemas](#solução-de-problemas)).

Publicado no [npm](https://www.npmjs.com/package/gerador-de-itens), mesmo mecanismo de instalação do Graphify — sem clonar este repositório. Veja [`packages/cli/README.md`](packages/cli/README.md) pra instalar a partir do código (contribuindo/testando), e [Comandos da CLI](#comandos-da-cli) abaixo pra lista completa.

### 2. Docker (modo hospedado, opcional — canvas visual + Postgres + login)

```powershell
docker compose up --build
```

Abra `http://localhost:8080`. Usa o config de exemplo deste repositório (rabbit, kafka, mongo, sql, camunda, fico, api externa, job, regra, cache, storage, batch — 14 tipos de nó, mais gRPC/GraphQL como tipos de conexão sobre "Serviço"). Sobe em `AUTH_MODE=dev` (login só com e-mail, sem senha — ver SPEC-08 §2.1), nunca precisa de segredo nenhum.

#### Produção (VM na nuvem + login Google real)

Hospedar de verdade (não só `docker compose up` local) é uma sequência de três passos:

1. **Provisionar a VM** — siga [`infra/README.md`](infra/README.md) até o fim (Terraform, GCP; gera o IP, aponta o DNS, cadastra os 4 secrets do GitHub que o deploy usa).
2. **Configurar login Google de verdade** — os segredos (`OIDC_CLIENT_SECRET` etc.) vêm de um vault self-hosted (Infisical), não de um `.env` colado à mão a cada máquina (ver SPEC-12-gerenciamento-de-segredos.md). Roda na própria VM, mesmo passo a passo abaixo:
3. **Disparar o deploy** — manualmente pela aba Actions do GitHub (workflow **Deploy** → **Run workflow**, ver `infra/README.md` passo 4; não é mais automático em `git push`, SPEC-17).

`docker compose up` sozinho **não muda** — continua em modo `dev`. Comandos do passo 2:

```powershell
# Uma vez por máquina:
docker network create gerador-secrets-net
cd infra/secrets
cp .env.example .env   # preencher ENCRYPTION_KEY/AUTH_SECRET (openssl rand ...)
docker compose up -d
# abrir http://localhost:8081, criar admin, criar projeto, colar os segredos
# reais (OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/...), criar uma Machine Identity

# De volta na raiz do repo:
cp .env.example .env   # preencher INFISICAL_CLIENT_ID/SECRET/PROJECT_ID + OIDC_REDIRECT_URI
docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d --build
```

### 3. Desenvolvimento local (hot reload, pra trabalhar no próprio `gerador`)

```powershell
npm install
npm run dev --workspace=packages/web
```

Abra `http://localhost:5173`.

Também dá pra ver a jornada de linha de comando dentro do próprio app web: botão **"✦ Como funciona & cenários" → aba "Linha de comando"**.

## O que você pode fazer

- **Desenhar um diagrama** no canvas — 14 tipos de nó prontos (serviço, fila Rabbit/Kafka, banco Mongo/SQL, processo Camunda, motor de decisão FICO, API externa, job, regra de negócio, cache Redis/Caffeine, storage S3/Blob, batch Spring Batch), mais gRPC/GraphQL como tipos de conexão pra chamada interna entre serviços — cada tipo com seu próprio painel de campos condicionais.
- **Ver o que falta** — cada nó tem um semáforo (vermelho/amarelo/verde); o resumo no topo do canvas mostra a lista de pendências e um botão "Próximo pendente" pra navegar direto até elas.
- **Carregar ou compor cenários prontos** — 11 exemplos validados (um por tipo de nó, mais um fluxo completo de 8 nós) via o modal "✦ Como funciona & cenários"; "Adicionar ao canvas" injeta um cenário no diagrama atual sem substituir o que já existe.
- **Importar de um projeto existente** — se o [Graphify](https://github.com/Graphify-Labs/graphify) já extraiu a estrutura do seu código (`/graphify .`), a aba "Importar do Graphify" lê o `graph.json` e rascunha nós `existente`/`extraído` no canvas, sem inventar tipo pra arquivo nenhum.
- **Capturar a stack do time direto do uso** — preencheu campos manualmente num nó (linguagem, framework...) com o time da quebra definido? Um botão no painel salva esses valores como padrão do time em `perfis-time.json` — próximo nó do mesmo tipo já sugere o valor conhecido, sem reconfigurar do zero.
- **Derivar os itens** — motor determinístico que calcula dependências a partir das arestas do diagrama, detecta ciclos e conflitos antes de deixar você seguir.
- **Revisar e exportar** — depois de derivar, expanda cada item pra ver a especificação técnica completa, o refinamento e os critérios de aceite em Gherkin, sem precisar copiar nada à parte. Um clique gera um único markdown — a **especificação de solução** da quebra inteira (contexto, visão geral, cada item completo, DoR/DoD no fim) — pronto pra ser o input de outro agente (ex.: o que sobe os itens pro sistema de tracking do time).

## Comandos da CLI

| Comando | Quando usar |
|---|---|
| `gerador init [diretório]` | Começar um projeto novo — cria `config/` de exemplo, nunca sobrescreve o que já existir. |
| `gerador derive <quebra.json> [--out arquivo]` | Gerar os itens (Markdown) a partir de um diagrama já pronto, sem abrir o browser. |
| `gerador implementar <quebra.json> [--out arquivo]` | Gerar a especificação de solução da quebra inteira — um documento com todos os itens, especificação técnica completa e refinamento — pronto pra ser o input de outro agente. |
| `gerador open [--port]` | Abrir o editor visual — já vem empacotado dentro do pacote npm, sem depender de `npm run dev` nem de clonar o repositório. Serve o `config/` do diretório onde foi chamado. |
| `gerador import-graphify <graph.json> [--out arquivo]` | Rascunhar nós `existente`/`extraído` a partir de um projeto já mapeado pelo Graphify. Precisa de `config/graphify-mapping.json` (mapeamento de padrão de arquivo → tipo de nó); `gerador init` cria um exemplo. |

Todo comando lê `config/*.json` do **diretório atual**, nunca deste repositório — o mesmo pacote serve qualquer projeto.

## Solução de problemas

**`gerador` não é reconhecido como comando depois do `npm install -g`.** O `npm` instalou o binário, mas a pasta global de binários do `npm` não está no `PATH` do Windows — comum em instalações novas do Node, principalmente sem reiniciar o terminal depois. Confirme rodando `npm config get prefix` (é essa pasta que precisa estar no `PATH`); se `gerador --help` ainda falhar depois disso, feche e reabra o terminal.

**Windows mostra "Parte deste aplicativo foi bloqueado" ao rodar `gerador ia instalar`/`status`/`open`.** Sintoma de ter instalado sem `--allow-scripts=node-llama-cpp` (ver comando acima) — sem o postinstall dele rodar, os binários nativos de IA ficam num estado que o Windows Defender não reconhece. Corrija reinstalando com a flag:

```powershell
npm uninstall -g gerador-de-itens
npm install -g gerador-de-itens --allow-scripts=node-llama-cpp
```

Se preferir não rodar postinstall de dependência nenhuma por princípio, tudo bem — todo o resto da ferramenta (`init`/`derive`/`implementar`/`open`/`import-graphify`, incluindo `gerador ia instalar`/`status`, que só baixam/checam arquivo) funciona normalmente; só a chamada de verdade ao modelo — botão "✨ Sugerir" na revisão — fica indisponível, com erro claro em vez de travar o resto do app.

```powershell
$npmPath = npm config get prefix
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')

if ($userPath -split ';' -notcontains $npmPath) {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$npmPath", 'User')
    Write-Host "Adicionado ao PATH: $npmPath" -ForegroundColor Green
} else {
    Write-Host "Ja esta no PATH: $npmPath" -ForegroundColor Yellow
}
```

## Desenvolvimento

```powershell
npm install
npm test              # engine + web + cli, todos os workspaces
npm run lint           # eslint em todos os workspaces
npm run build           # build de todos os workspaces
npm run test:e2e --workspace=packages/web   # Playwright, precisa do build do web feito antes
```

Estrutura:

```
packages/engine/   TS puro, zero I/O — modelo, derivação, prontidão, dependências (fonte da verdade do mecanismo)
packages/web/      Vite + React + React Flow — o editor visual
packages/cli/      bin `gerador` — init | derive | implementar | open | import-graphify
config/            Config de exemplo deste repositório (diagrama.json, app.json, regras.json, cenários...)
fixtures/          Casos de teste do engine, compartilhados entre implementações
exemplos/          Quebras reais usadas pra validar os schemas de cada domínio
```

Documentação mais profunda: [`CONTEXTO-E-ARQUITETURA.md`](CONTEXTO-E-ARQUITETURA.md) (por que o projeto existe e as decisões de design), [`JOURNEY.md`](JOURNEY.md) (o que foi construído, o que quebrou, e por quê), e os `SPEC-*.md` (desenho detalhado por área).
