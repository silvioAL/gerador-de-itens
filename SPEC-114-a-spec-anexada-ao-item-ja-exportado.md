# SPEC-114 — A spec anexada ao item já exportado: a segunda chamada que a SPEC-98 previu

> **Origem:** o usuário, revisando a tela de documento (seções "Trade-offs" e
> "Riscos") e pedindo o que falta para fechar a jornada de SDD:
>
> > *"o fluxo para gerar seria: quando o usuário quiser refinar mais, poder
> > usar scripts de PowerShell de mapeamento de contexto do projeto,
> > aprofundar nas discussões, e depois agregar essas decisões — e os itens de
> > trabalho incluiriam specs no mesmo padrão das nossas, que seriam anexadas
> > aos itens no fluxo que está faltando. Hoje é possível apenas baixar o
> > markdown único; a intenção é poder fazer uma chamada ao MCP para gerar os
> > itens e anexar essas specs. Com isso fechamos a parte principal do
> > projeto atendendo o objetivo de facilitar a construção de itens voltados
> > a SDD."*
>
> E, sobre o rótulo "escrito por uma pessoa" nas seções de julgamento:
>
> > *"só não dizer 'escrito por uma pessoa', e o segundo ponto é que ali não
> > faz sentido escrever nada disso — é algo que deve ser derivado do que
> > acabei de te pedir."*

---

## 0. O que já existia, medido antes de propor

Este pedido não é território novo — bate quase palavra por palavra com duas
avaliações já escritas neste repositório:

| Peça do pedido | Já avaliada em |
|---|---|
| Specs no padrão da casa, anexadas aos itens, via MCP, hoje só existe download | **SPEC-98** — estrutura decidida (fatias A-F), nunca implementada |
| Mapear contexto via scripts, aprofundar com um agente, aprovado passo a passo | **SPEC-75 §3** — avaliada e **recomendada para não construir ainda**, por falta de workflow definido e por o produto ser hospedado (scripts rodam na máquina do usuário) |

A medição nesta rodada, direto no código (branch pós-rollback SPEC-113, sem o
canvas de fluxos):

- **A tela de spec dedicada morreu** (§346) — `#/spec` redireciona para o
  documento. `gerarSpec.ts`/`TEMPLATE_SPEC_PADRAO` continuam vivos, chamados
  em `App.tsx` (`markdownDaSpec`), com única saída `baixarSpecMarkdown()`
  (download). **Exatamente o problema que o usuário apontou continua sem
  solução.**
- **A exportação de itens (SPEC-49) é uma chamada só**, item a item, falha
  parcial (`ExportadorDeItens.exportar`, `packages/aplicacao/src/portas/exportadorDeItens.ts`).
  Devolve `{chave, linkExterno}` por item — **é o "id do tracker" que a
  SPEC-98 precisa para a segunda chamada, e ele já existe e já é persistido**
  (`itens_gerados.link_externo`).
- **O rastro hoje é um campo só.** `ItemGeradoSalvo.estado: "gerado" |
  "exportado"` não tem espaço para "exportado, mas sem spec anexada" — a
  SPEC-98 §3.2 previu exatamente essa lacuna.
- **O gateway configurável (SPEC-81) já suporta N operações com destino
  próprio** (`OPERACOES_DO_GATEWAY`, `destinosDaOperacao`) — acrescentar uma
  operação nova é acrescentar um valor à união, não uma migração de
  arquitetura (o mesmo achado que a SPEC-80 §0 fez para o template).

## 1. A decisão: duas frentes independentes, uma pronta para construir agora

O pedido tem duas partes com maturidade MUITO diferente, e misturá-las faria
a de maior valor esperar pela de maior risco — a mesma régua que a SPEC-75
§5 já escreveu ("se gerar specs esperar pelo mapeamento, o item de maior
valor fica refém do de maior risco").

### 1.1 Pronta agora: a spec anexada ao item (SPEC-98 fatia C)

A spec da demanda (`gerarSpec`) já existe, já é markdown, já sabe quais itens
cobre (`SpecEscrita.itensCobertos`). O que falta é só a **segunda chamada**:
depois que um item já subiu pro tracker (primeira chamada, já existe), anexar
o mesmo conteúdo da spec a cada item que ela cobre, usando o link/id que a
primeira chamada devolveu. Fatia C desta SPEC.

### 1.2 Adiado, com workflow agora definido: mapeamento de contexto (SPEC-75 revisitada)

A SPEC-75 travava em "precisa de workflow bem definido antes de construir".
O usuário definiu: **é através do assistente** — a pessoa cola a saída de um
script (rodado por conta própria, na máquina dela) na conversa; o assistente
lê, pode pedir mais, e agrega as decisões. Isso é literalmente a "fatia
manual" que a SPEC-75 §3.3 já tinha sugerido como primeiro passo barato:
**zero infraestrutura nova, e mede se vale a pena antes de automatizar
execução de script**.

Falta ainda, e por isso este ponto não entra nesta rodada: o assistente hoje
vive num painel pequeno lateral, inadequado para uma conversa longa de
mapeamento. Precisa de um modo expandido (mantendo a mesma identidade
visual) antes de a conversa de aprofundamento ser utilizável. **Gap
registrado, não fatiado ainda** — é trabalho de rodada própria.

### 1.3 Consequência: o rótulo "escrito por uma pessoa" não muda ainda

*"Ali não faz sentido escrever nada disso — é algo que deve ser derivado do
que acabei de te pedir."* Concordo com o diagnóstico, mas a derivação
depende de 1.2 existir: Trade-offs e Riscos passariam a nascer da conversa de
aprofundamento agregada, não de uma caixa de texto em branco. **Mudar o
rótulo agora, sem a fonte que o substitui, seria remover o aviso sem
resolver o que ele avisa.** Fica marcado como consequência da fatia de
mapeamento (1.2), não como tarefa isolada desta rodada.

## 2. O desenho da Fatia C

### 2.1 O rastro cresce de um campo para dois

`ItemGeradoSalvo` ganha `specAnexada: boolean` (default `false`), ao lado do
`linkExterno` existente. Migração nova (`itens_gerados.spec_anexada`),
preservado na regeneração pela mesma `chave` — a mesma régua que já preserva
`estado`/`linkExterno` hoje.

### 2.2 Cada item tem a sua spec — não uma cópia da spec da demanda

> Correção do usuário sobre a primeira escrita desta seção: *"não esqueça que
> são diversos itens e cada um tem sua spec."*

O julgamento (origem, recusas, fatias) é escrito **uma vez por demanda** —
continua sendo `SpecEscrita`, a mesma tela, o mesmo `gerarSpec`. Mas o
**anexo não é essa spec inteira copiada N vezes**: para cada item que ela
declara cobrir (`itensCobertos`), o cliente gera um markdown PRÓPRIO —
`gerarSpec({...opcoesComuns, itens: [aquela atividade]})` — que reaproveita o
mesmo julgamento compartilhado, mas cuja seção "Itens que esta spec cobre"
lista **só aquele item**. Cada item recebe seu próprio arquivo/anexo, não uma
cópia idêntica de um documento que fala de todos os outros também. É a mesma
função pura (`gerarSpec`, §263) chamada N vezes com um recorte diferente de
`itens`, não uma segunda implementação.

### 2.3 A régua do que pode ser enviado

- **Só item com `linkExterno`** (já exportado) entra na lista de candidatos —
  os que não subiram ainda aparecem como "sem história ainda", nunca como
  erro.
- **Só spec sem lacuna** (`MARCADOR_ESPECIFICAR` ausente do markdown) pode
  ser anexada — mesma régua do §6 da SPEC-98 ("enviar spec com lacuna" é
  recusa).
- **Reenviar manda só quem falta**: item com `specAnexada = true` não entra
  de novo na lista.

### 2.4 Destino próprio

Nova operação `"specDoItem"` em `OPERACOES_DO_GATEWAY` — resposta à Pergunta
3 da SPEC-98 §8: destino separado do de itens, mesmo formato de configuração
(`DestinoDoGateway`), porque são "duas chamadas de qualquer forma" e nada
obriga as duas a saírem pelo mesmo endereço.

### 2.5 Contrato do gateway

```
POST {endpoint}  { itens: [{ chaveExterna, conteudo }] }
→ 200 { resultados: [{ chaveExterna, erro? }] }
```

**`conteudo` vai por item, não uma vez só** — é o que muda com a correção do
§2.2. Resposta à Pergunta 5 da SPEC-98 §8: manda `chaveExterna` (o link/id
que a primeira chamada devolveu) e o conteúdo daquele item; **o agente
decide a forma** — attachment, comentário ou campo customizado é problema de
quem fala o protocolo.

## 3. O que esta SPEC RECUSA

- **Misturar a exportação do item com o anexo da spec numa chamada só** — são
  duas operações com ciclo de vida e modo de falha diferentes (SPEC-98 §3.2).
- **Anexar spec com lacuna.** Mesma régua do item pronto.
- **Automatizar execução de script agora** (§1.2). O workflow "via
  assistente" resolve a pergunta de fronteira (colar, não executar), mas o
  painel expansível do assistente é pré-requisito que ainda não existe.
- **Mudar o rótulo "escrito por uma pessoa" isoladamente.** Depende da fonte
  derivada existir (§1.3).
- **Lotes por token nesta fatia** (SPEC-98 fatia D). Uma spec de demanda
  cabe, hoje, numa chamada — fatiar por tamanho é problema de quando isso
  deixar de ser verdade, medido, não antecipado.

## 4. Fatias desta rodada

- **A — o rastro de dois campos.** ✅ Migração `0043_spec_anexada_ao_item`,
  porta (`marcarSpecAnexada`), adaptador Postgres, contrato compartilhado
  (4 casos novos). **Prova:** regenerar itens preserva `specAnexada` como já
  preserva `linkExterno` — 9 testes verdes contra Postgres real.
  - **Achado real durante a fatia**: o `drizzle-kit generate` falhou neste
    ambiente, e a migration foi escrita à mão. Isso expôs que o drizzle
    decide o que rodar por **timestamp** (`_journal.json`), não por hash — um
    banco que já rodou as migrations da era fluxo (removidas por esta
    branch) tem `created_at` à frente do que a sequência antiga produziria, e
    a migration nova seria **ignorada em silêncio**. Confirmado nos bancos de
    teste E de desenvolvimento reais (ambos tinham o registro órfão até
    id 50). Corrigido usando `Date.now()` de verdade no `when`, e documentado
    no comentário da própria migration para quem escrever a próxima à mão.
- **B — a porta e o adaptador de anexo.** ✅ `AnexadorDeSpec`, no molde de
  `ExportadorDeItens` (falha por item), reaproveitando o `postar()` da
  SPEC-81 (metodo/envelope/espaço). **Prova:** 8 testes com espião de
  `fetch`, incluindo honra a método/envelope declarados e erro por item sem
  exceção.
- **C — o caso de uso e a rota.** ✅ `anexarSpecNaQuebra`,
  `POST /quebras/:id/spec/anexar`. **Prova:** 6 testes de caso de uso + 10 de
  rota contra Postgres real — item sem `linkExterno` aparece em
  `semLinkExterno` (não erro); spec com `MARCADOR_ESPECIFICAR` aparece em
  `comLacuna`, com HTTP 200 e **zero chamada de rede** (não é 409 — o pedido
  é válido, só não sobra nada para mandar); reenviar depois de um sucesso
  manda zero itens; falha é por item, nunca tudo-ou-nada.
- **D — a tela.** ✅ Botão "Anexar spec aos itens" em `SecaoDosItens`
  (aparece só quando há item exportado sem spec), selo "spec anexada" por
  card, cada item com sua PRÓPRIA spec (`gerarSpec` chamado uma vez por
  atividade coberta, não uma cópia da spec da demanda). **Prova:** build
  limpo, E2E real contra a stack Docker rebuildada confirma que o botão só
  aparece depois que a primeira chamada deu link — a dependência entre as
  duas chamadas se cumpre pelo servidor real, não só pela tela.

## 5. Itens que esta spec cobre

Nenhum ainda — esta spec é sobre a MECÂNICA de cobrir itens, não sobre um
item que ela mesma cobre.
