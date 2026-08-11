# Gerador de Itens

> ## ⚠️ A CLI local foi descontinuada
>
> O Gerador de Itens passou a rodar **apenas no modo hospedado** (Docker +
> Postgres + navegador). O pacote `gerador-de-itens` no npm está depreciado e
> não recebe mais atualizações; `gerador open`, `gerador derive`,
> `gerador implementar` e `gerador import-graphify` saíram do repositório.
>
> **As seções abaixo que falam em `npm install -g` e `gerador <comando>` estão
> desatualizadas** e serão reescritas. Enquanto isso, o caminho válido é o
> `docker compose` da seção de Produção.
>
> Motivo, medições e roteiro: [`SPEC-33-modo-unico-hospedado.md`](SPEC-33-modo-unico-hospedado.md).

Ferramenta de quebra técnica: desenhe um diagrama de arquitetura (serviços, filas, bancos, processos de negócio, regras...) num canvas visual, preencha um painel de propriedades dirigido por config, e derive **deterministicamente** itens de trabalho com dependências reais — agnóstico de qual sistema de tracking recebe isso depois. Nada aqui é gerado por um LLM adivinhando a partir de uma descrição solta — sempre por regras explícitas em `config/diagrama.json`.

Não é um gerador de prompt de IA. O mesmo diagrama sempre produz os mesmos itens.

---

**Autor:** Silvio Allgayer Trindade — <https://github.com/silvioAL>
**Licença:** Apache-2.0 (ver [LICENSE](LICENSE) e [NOTICE](NOTICE))

A Apache-2.0 permite uso, modificação e uso comercial. Exige, em contrapartida,
que a **atribuição ao autor seja preservada**: mantenha o `NOTICE` nas cópias e
marque as modificações que fizer. O direito de ser reconhecido como autor do
programa é, além disso, garantido pela Lei 9.609/98 e é irrenunciável.

---

## Testes de ponta a ponta

A suíte E2E (Playwright) usa uma **stack própria**, nunca o banco de
desenvolvimento:

```bash
npm run e2e          # sobe, roda e derruba
# ou, separado:
npm run e2e:up && npm run test:e2e -w packages/web && npm run e2e:down
```

O banco vive em `localhost:5433/gerador_e2e_test`, sem volume. Apontar a suíte
para um banco cujo nome não termine em `_test` faz o `globalSetup` recusar
rodar — ela trunca tabelas, e já apagou dados de ambiente em uso uma vez.

## Início rápido

Um caminho só: subir a stack com Docker. O servidor guarda as quebras em
Postgres, a autenticação decide quem edita o quê, e o editor abre no
navegador.

### 1. Docker — o jeito de rodar


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

A porta `11434` também é publicada pra fora, então dá pra apontar um cliente da sua máquina para a **mesma** instância (`http://localhost:11434/v1`) — sem instalar Ollama localmente.

</details>

> **Sem modelo embutido.** A instalação de um GGUF na máquina (`gerador ia
> instalar`) saiu junto com o modo local — ver
> [`SPEC-33`](SPEC-33-modo-unico-hospedado.md). No hospedado o caminho é o
> gateway: o Ollama do compose acima, ou qualquer endpoint compatível com a
> API da OpenAI configurado na aba **Modelo de IA**.

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

### 2. Desenvolvimento local (hot reload, pra trabalhar no próprio `gerador`)

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

## Solução de problemas

**A stack sobe mas o navegador mostra tela em branco.** O `gerador` (nginx)
serve um build estático: depois de mudar o código do `packages/web`, é preciso
`docker compose build gerador` antes do `up`. Sem isso você testa o bundle
anterior — foi assim que um defeito já corrigido voltou a ser reportado.

**Erro de IA com o gateway configurado.** A aba **Modelo de IA** tem um
"Testar conexão" que reporta o que o gateway respondeu, em vez de um erro
genérico de rede. Comece por ele: credencial errada, endereço sem `/v1` e
modelo inexistente dão mensagens diferentes.

**`docker compose up` reclama de porta em uso.** A stack publica 8080 (web),
4000 (servidor), 5432 (Postgres), 9000 (Whisper) e 11434 (Ollama). O E2E usa
um compose separado, em 5433, justamente para não disputar com a de trabalho.

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
