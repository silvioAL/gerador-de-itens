# SPEC-16 — Base de conhecimento: Obsidian + Graphify

**Depende de** SPEC-07 (correção de escopo, JOURNEY §14), Fase A (`referencias`, JOURNEY §20) · Reabre uma decisão de escopo da Fase A à luz de uma peça que não existia na época: o Graphify já sabe exportar o grafo deste projeto como vault Obsidian (`graphify export obsidian`).

**Status: implementado e validado — ver JOURNEY §32.**

---

## 1. Objetivo

Fechar três pontas deixadas em aberto na jornada (JOURNEY §13, §14, §19): uma base de conhecimento real, ligada ao código de verdade via Graphify, sem depender do Confluence (nunca implementado) — usando Obsidian como destino simples por enquanto.

Dois tipos de conteúdo passam a viver num vault Obsidian, ao lado das notas de código que o Graphify já gera:
1. **Referências** (racional humano sobre uma decisão) — já existem (`referencias`), ganham um vínculo estruturado com o código real que motivou a referência.
2. **Padrões default** (boas práticas por tipo de integração — os scaffolds Gherkin/refinamento técnico já configurados em `diagrama.json`/`regras.json`, JOURNEY §31) — documentados como notas legíveis, não só strings dentro de um JSON.

## 2. Por que duas peças separadas escrevendo no mesmo vault

O Graphify já extrai e exporta a estrutura de código como notas Obsidian (`graphify export obsidian`) — um processo que roda fora deste repositório de ferramenta, local, invocado pelo usuário. Este projeto **não reimplementa extração de código**; só complementa um vault que o Graphify já gerou, com o que só ele sabe (o racional humano por trás de uma decisão, e os padrões default configurados). Os dois processos escrevem no mesmo diretório por convenção de pasta — nenhum acoplamento em código entre `gerador` e `graphify`.

**Pré-condição:** o vault já precisa ter sido gerado por `graphify export obsidian --dir <vault>` antes de rodar o comando deste SPEC. Sem isso, não há como resolver os wikilinks pro código real.

## 3. Achado real ao inspecionar o formato do Graphify (antes de codar o resolvedor)

Rodado `graphify export obsidian` de verdade contra este repositório (1472 notas). Confirmado, não suposto:

- Cada nota tem frontmatter YAML com `source_file: "<caminho relativo ao repo>"` — inclusive notas de símbolo (função, classe), não só de arquivo.
- O nome do arquivo da nota (e portanto o alvo do wikilink `[[...]]`) **não é sempre o nome base do arquivo** — quando há colisão de nome entre pastas (ex.: `config/types.ts` e `model/types.ts`), o Graphify desambigua com um esquema próprio (`configtypes.ts` / `modeltypes.ts`) que este projeto não controla nem deveria replicar.
- A nota que representa o **arquivo inteiro** (não um símbolo dentro dele) é identificável de forma confiável: dentre as notas com o mesmo `source_file`, é a que tem `location: "L1"` e cujo título (H1) é igual ao nome base do arquivo.

**Decisão de design direta desse achado:** o resolvedor de wikilink nunca reimplementa o esquema de nomes do Graphify — ele **escaneia as notas já geradas no vault** (frontmatter `source_file`) e usa o nome de arquivo real de lá. Deixa de precisar entender `graph.json` para esse propósito.

**Segundo achado real, só visível na validação de ponta a ponta contra o vault de verdade (um vault fixture sintético de teste não pegou isso):** as notas geradas pelo Graphify usam `\r\n` (CRLF), não `\n`. O parser de frontmatter precisa tolerar os dois (`\r?\n`), senão o frontmatter nunca casa e toda referência cai no ramo "não encontrado" mesmo com a nota existindo — ver JOURNEY §32.

## 4. `referencias` ganha `codigoRelacionado`

- `codigoRelacionado: string[]` — caminhos de arquivo relativos ao repositório (texto livre, ex.: `packages/engine/src/derive/derivar.ts`), não upload/seleção de arquivo do browser (não dá pra obter caminho relativo de repo de um `<input type=file>`, e texto livre também serve pra quem cria referência via script/CLI no futuro). Continua sem guardar conteúdo — só o ponteiro, mesma disciplina da Fase A ("nunca o código em si").
- `linkConfluence` → **`linkExterno`** (genérico) — cobre Confluence ou qualquer outro destino publicado com URL. Obsidian local não tem URL (é arquivo), então esse campo continua opcional — a referência "existe" no vault independente de ter link externo preenchido.
- Migração nova (`0005_referencias_codigo_e_link_externo.sql`, não edita migração anterior — a tabela pode já ter dado real do usuário).

## 5. `gerador export-vault`

```
gerador export-vault [--dir <vault>] [--server-url <url>]
```

- `--dir`: pasta do vault Obsidian já gerado pelo Graphify (default `graphify-out/obsidian`).
- `--server-url`: onde buscar as referências (default `http://localhost:4000`) — `GET /referencias` já é rota pública (sem sessão), nenhuma autenticação nova precisa ser inventada pro CLI.

Passos:
1. Escaneia `<vault>/*.md`, indexando `source_file` → nome real da nota (achado do §3).
2. Busca `GET {server-url}/referencias`.
3. Pra cada referência, escreve `<vault>/referencias/<slug>.md`: frontmatter (tags, criadoEm) + racional + seção "Código relacionado" com `[[nota]]` pros caminhos resolvidos e uma linha explícita ("não encontrado no vault") pros que não bateram — nunca inventa link, mesma disciplina de `naoMapeados` em `importarGrafo.ts`.
4. Pra cada tipo de nó em `config/diagrama.json`, escreve `<vault>/patterns/<tipo>.md`: label, campos-chave (`specResumo`), o cenário Gherkin já configurado, e os itens de refinamento técnico relevantes (`config/regras.json`, casados por contexto).
5. Idempotente — nome de arquivo determinístico (slug), reescreve em vez de duplicar.

## 6. O que fica fora desta rodada

- Mineração/promoção automática de padrão por recorrência (visão completa do JOURNEY §13) — maior que esta rodada, fica registrada mas não implementada.
- Watch/sync automático — comando manual, mesma disciplina do próprio Graphify.
- Remoção do Confluence — `linkExterno` continua aceitando qualquer URL.
- Validação ao vivo do caminho de arquivo contra o grafo na hora de digitar na UI — o campo é texto livre; a checagem contra nós reais acontece só no `export-vault`.
- Servidor MCP novo — o `--mcp` do próprio Graphify já expõe o grafo de código; markdown em Obsidian já é lido por qualquer agente com acesso a filesystem.

## 7. Verificação

- `packages/server`: testes de `referencias` com `codigoRelacionado`/`linkExterno`, migração validada contra Postgres limpo.
- `packages/cli`: `exportVault` testado contra um vault fixture pequeno (nota gerada, wikilink resolvido, caminho não mapeado listado, idempotência).
- Validação real: referência real apontando pra um arquivo real deste repo, `gerador export-vault` contra o vault real gerado neste repositório, conferindo que o wikilink aponta pra uma nota que o Graphify de fato criou.
