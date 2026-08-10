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

#### Atualizar pra versão mais nova

```powershell
npm uninstall -g gerador-de-itens
npm install -g gerador-de-itens --allow-scripts=node-llama-cpp
```

Desinstalar antes é o caminho mais garantido — evita herdar um estado de instalação anterior incompleto (ex.: binário nativo baixado sem a flag `--allow-scripts`, ver [Solução de problemas](#solução-de-problemas)). `npm install -g gerador-de-itens@latest --allow-scripts=node-llama-cpp` sozinho também funciona no dia a dia (o `npm` sobrescreve a instalação anterior), mas depois de qualquer problema de instalação vale desinstalar primeiro.

Confirme a versão instalada com `npm list -g gerador-de-itens` (ou `npm view gerador-de-itens version` pra ver a versão mais recente publicada, sem instalar) — o próprio app (`gerador open`) também mostra a versão rodando no canto da tela.

### 2. Docker (modo hospedado, opcional — canvas visual + Postgres + login)

```powershell
docker compose up --build
```

Abra `http://localhost:8080`. Usa o config de exemplo deste repositório (rabbit, kafka, mongo, sql, camunda, fico, api externa, job, regra, cache, storage, batch — 14 tipos de nó, mais gRPC/GraphQL como tipos de conexão sobre "Serviço"). Sobe em `AUTH_MODE=dev` (login só com e-mail, sem senha — ver SPEC-08 §2.1), nunca precisa de segredo nenhum.

#### IA rodando dentro da stack (Qwen, sem sair da sua rede)

Se o seu ambiente bloqueia a API do Claude — o caso comum em rede corporativa — dá pra rodar o modelo **num container ao lado do servidor**. Nada sai da máquina, e não é preciso chave de API nenhuma.

```powershell
docker compose --profile ia up -d --build
```

Isso sobe dois serviços a mais: o **Ollama** e um passo único que baixa o modelo (`qwen2.5:7b`, 4,7 GB — a primeira subida demora). Sem `--profile ia`, nada disso é baixado.

Depois, na aplicação:

1. Entre em **⚙ Configurações → Modelo de IA**.
2. Em **Destino**, escolha **"Qwen no Docker (junto do servidor)"** — isso preenche a base URL (`http://ollama:11434/v1`) e o modelo.
3. Em **Chave de API**, escreva qualquer coisa (`nao-usada`, por exemplo). O Ollama ignora a chave, mas o campo é obrigatório porque os outros destinos exigem.
4. Clique em **Testar conexão** e depois em **Salvar**.

A esteira de agentes passa a rodar sozinha ao derivar uma quebra.

##### Qual modelo escolher (medido, não estimado)

Rodando o pipeline **de verdade** (`POST /ia/pipeline/po`, 1 item com 2 campos), **em CPU pura**, sem GPU no container:

| modelo | tamanho | 1 item / 2 campos | JSON no formato certo |
|---|---|---|---|
| **`qwen2.5:7b`** (padrão) | 4,7 GB | ~3 min 40 s | de primeira |
| `qwen2.5:3b` | 1,9 GB | ~1 min 50 s | de primeira, texto um pouco pior |
| `qwen3:4b` | 2,5 GB | **~22 min** | só depois de uma segunda tentativa |

> **Seja realista sobre CPU.** Uma quebra pequena leva minutos; uma quebra grande, com quatro agentes passando por todos os itens, leva bem mais. Se a máquina tiver **GPU NVIDIA**, ative-a (abaixo) — é a diferença entre usável e não usável. Sem GPU, o `qwen2.5:3b` é ~2× mais rápido e continua acertando o formato; vale a troca se a espera incomodar mais que a qualidade do texto.

> **Não use `qwen3` aqui**, apesar do nome mais novo. Ele é um modelo de **raciocínio**: o Ollama coloca o pensamento em `message.reasoning`, e isso consome o mesmo orçamento de tokens da resposta. Com teto baixo, o campo volta **vazio**; com teto alto, chega — gastando minutos por campo. É um bom modelo para outro uso; a esteira quer estrutura, não deliberação.

Para trocar, use `MODELO_IA` no `.env` da raiz (qualquer [tag do Ollama](https://ollama.com/library)):

```powershell
echo "MODELO_IA=qwen2.5:3b" >> .env
docker compose --profile ia up -d
```

E troque também o campo **Nome do modelo** na tela — o nome precisa bater com o que foi baixado, senão a primeira geração falha com `model not found`.

Se a máquina tiver **GPU NVIDIA**, vale muito a pena: descomente o bloco `deploy:` do serviço `ollama` no `docker-compose.yml` (precisa do NVIDIA Container Toolkit no host).

##### Voz: falar em vez de digitar

O mesmo `--profile ia` sobe um **servidor Whisper** (145 MB) ao lado. Ele é um serviço à parte porque **o Ollama não transcreve** — serve texto e visão, não áudio.

Com o destino **"Qwen no Docker"** escolhido, a conversa ganha um botão **🎤 Falar**: você fala, a onda se mexe com sua voz, e o texto cai no campo **editável** (não é enviado sozinho). Nada sai da sua rede.

O ganho de qualidade não vem do tamanho do modelo — vem do **vocabulário**. A ferramenta manda junto os termos do seu projeto (tipos de nó da config, nomes do diagrama, jargão de arquitetura). Medido, mesma frase, mesmo modelo de 145 MB:

| | transcrição |
|---|---|
| sem vocabulário | "fila do **rabitém IKEA** … com **dedileta arquil** e **idem potência**" |
| com vocabulário | "fila do **RabbitMQ** … com **dead letter queue** e **idempotência**" |

Modelos maiores **não** resolviam isso (o `large-v3-turbo` continuava errando, 10× mais lento) — e é por isso que **não há fine-tuning aqui**: treinar um modelo para aprender termos que já estão num JSON seria caro, e em manutenção eterna, para o que uma linha de contexto resolve.

Para um modelo de voz maior, use `MODELO_VOZ` no `.env` (`small`, `large-v3-turbo`).

<details>
<summary>Por que o endereço é <code>ollama</code> e não <code>localhost</code></summary>

Quem faz a chamada é o **container do servidor**, não o seu navegador. Dentro dele, `localhost` é ele mesmo — o pedido morreria em "connection refused" sem nunca sair. `ollama` é o nome do serviço no `docker-compose.yml`, que a rede interna do Docker resolve pro container certo.

A porta `11434` também é publicada pra fora, então a **mesma** instância serve o `gerador open` (modo local, aí sim em `http://localhost:11434/v1`) — sem instalar Ollama na máquina.

</details>

> **Modelo local sem Docker.** No `gerador open` existe o outro caminho: `gerador ia instalar` baixa um GGUF e roda embutido no processo, sem container nenhum (SPEC-23). O caminho do Ollama acima é o do **modo hospedado**, onde carregar o modelo dentro do container do servidor foi descartado de propósito (SPEC-31 Fase 4).

##### Se `gerador ia instalar` falha na rede da empresa

Antes de qualquer outra coisa, rode o diagnóstico — ele testa o caminho de verdade e diz a **causa real**, não `fetch failed`:

```bash
gerador ia diagnosticar
```

A causa mais comum, medida em campo, é **inspeção TLS**: a rede intercepta o HTTPS e reassina com uma CA da empresa, que o Node não conhece. É também o que explica o `npm` funcionar e o download não — o npm usa o repositório de certificados do Windows, o Node não usa por padrão.

| O que o diagnóstico diz | O que fazer |
|---|---|
| `SELF_SIGNED_CERT_IN_CHAIN` / `CERT_*` | `NODE_OPTIONS=--use-system-ca` (Node 22.15+ — usa a CA que já está na máquina). Em Node mais antigo, `NODE_EXTRA_CA_CERTS=caminho\ca.pem` |
| `ENOTFOUND` / `ECONNREFUSED` / timeout, sem proxy | `HTTPS_PROXY=http://proxy.empresa:8080` — o npm honra proxy sozinho, e até a v0.1.65 o download não honrava |
| Tudo falhou | Use `--de` ou `--origem npm` abaixo |

No Windows, para não repetir a cada terminal:

```powershell
[Environment]::SetEnvironmentVariable("NODE_OPTIONS", "--use-system-ca", "User")
```

> **Nada disso é necessário para usar a ferramenta.** `gerador open` abre o editor, o canvas, a derivação e a especificação sem baixar modelo nenhum — só os recursos de IA dependem dele. E se a sua rede libera algum gateway de LLM, `gerador ia conectar --url <base> --chave <chave> --modelo <nome>` resolve com **zero download**.

##### Se a rede realmente não alcança o Hugging Face

Por padrão `gerador ia instalar` busca o GGUF no Hugging Face. Onde isso é bloqueado, há duas saídas — nenhuma delas exige rede liberada para lá (SPEC-32):

```bash
# 1. De um arquivo que você já tem (pendrive, share, a máquina de um colega)
gerador ia instalar --modelo qwen-local --de D:\modelos\Qwen3-4B-Q4_K_M.gguf

# 2. Pelos pacotes-parte no npm — usa o registry/proxy que a sua rede já libera
gerador ia instalar --origem npm
```

O `--origem npm` existe porque **um pacote npm de 2,5 GB não publica**: um pacote de 229,9 MB já levou `413 Payload Too Large` no npmjs.org. Então o modelo vai fatiado em pacotes de ~190 MB e é remontado na instalação, com o SHA-256 do arquivo inteiro conferido no fim — parte fora de ordem produziria um arquivo do tamanho certo e do conteúdo errado.

Para gerar e publicar esses pacotes a partir de um GGUF:

```bash
node scripts/fatiar-modelo.mjs caminho/modelo.gguf --escopo @seu-escopo
```

O script imprime o `sha256`/`partesNpm` para colar em `packages/llm/src/modelos.ts` e o comando de publicação — mas **não publica**: mexer numa conta npm pública é decisão de quem é dono dela.

##### Imagem: anexar um print

Na conversa do desenho, **🖼 Anexar imagem** manda um print junto com o texto: um diagrama de Miro, uma foto de lousa, um desenho de Confluence. O agente propõe os nós e conexões equivalentes **usando os tipos que existem na sua config** — a imagem é insumo, não um formato novo de saída.

Até 3 imagens, 4 MB cada. Com imagem anexada, a tela diz **para onde** ela vai: `ollama` é o container ao lado, `api.anthropic.com` é upload para terceiro. Print de arquitetura costuma ter mais informação sensível do que quem anexa lembra na hora.

O botão só aparece se o modelo configurado enxerga imagem. Como não há como perguntar isso a um gateway compatível com a OpenAI, é uma caixinha que **você** marca na aba **Modelo de IA** — e ninguém verifica se é verdade.

##### Quando não funciona

As limitações abaixo são reais e não têm conserto do nosso lado — o que existe é a ferramenta dizer qual delas você pegou, em vez de um erro técnico:

| O que acontece | Por quê | O que fazer |
|---|---|---|
| **O 🎤 aparece e a transcrição dá erro** | O Ollama não transcreve, e o serviço de voz é separado | `docker compose --profile ia up -d` (a mensagem de erro já diz isso) |
| **Cada item da esteira leva ~3min40** | CPU, sem GPU. Não é travamento | Descomente o bloco `deploy:` do `ollama` se tiver GPU NVIDIA |
| **"O modelo não devolveu … em formato válido"** | O gateway falhou **depois** que a resposta começou — não há mais status HTTP pra sinalizar | A mensagem mostra o começo do que veio; costuma ser modelo sem visão, resposta cortada, ou prosa em vez de JSON |
| **Marquei "enxerga imagem" e dá 400** | O modelo não aceita mesmo — ninguém verifica a caixinha | Desmarque, ou troque de modelo |
| **HTTP 413 ao anexar** | O gateway tem teto menor que o nosso | Print menor, ou grave menos tempo |

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
