---
name: gerador-de-itens
description: "Use when the user wants to break a feature or architecture change into a technical backlog (stories, tasks, tech debt) with dependencies, derived deterministically from an architecture diagram rather than guessed by an LLM. Triggers on: 'quebra técnica', 'quebrar essa feature em stories', 'derivar backlog', 'gerador de itens', 'planejar essa mudança de arquitetura'. Also use to scaffold gerador config in a new project (init), open its visual diagram editor, build a quebra.json draft from an existing codebase (including via Graphify import), critically review/question an existing quebra.json for hidden contradictions before deriving, or pull the full implementation context (node spec + refinamento técnico) for a single backlog item before coding it."
---

# Gerador de Itens

Ferramenta de quebra técnica: um diagrama de arquitetura (serviços, filas, bancos, processos de negócio...) node por node, com painel de propriedades dirigido por config (campos condicionais, proveniência de cada valor, semáforo de prontidão), que deriva **deterministicamente** um backlog de atividades com dependências. O backlog nunca é gerado por um LLM adivinhando a partir de uma descrição solta — sempre por regras explícitas em `config/diagrama.json` do projeto.

A skill usa o `gerador` instalado globalmente na máquina (SPEC-17 — instalação em `packages/cli/README.md` do repositório) quando disponível; se não estiver instalado, o wrapper (`scripts/gerador.ps1`) cai pro build de desenvolvimento deste próprio repositório (resolvido a partir do caminho do script, ajustável via `$env:GERADOR_REPO`). Fora deste monorepo — via `gerador skill-install`, que empacota uma variante desta skill sem o wrapper — não tem fallback: assume o `gerador` global.

## Quando usar

- O usuário quer quebrar uma mudança de arquitetura em itens de backlog.
- O usuário já tem (ou está montando) um arquivo `quebra.json` (produto + diagrama de nós/arestas) e quer o backlog derivado dele.
- O usuário quer começar um projeto novo com a ferramenta (`init`).
- O usuário quer abrir o editor visual para desenhar o diagrama interativamente.

## Regras importantes

- **Nunca invente atividades.** O backlog só existe como saída de `derive` sobre um diagrama real. Se o usuário só descreveu a mudança em texto corrido, ajude a modelar o diagrama primeiro (que serviços/filas/processos existem, como se conectam, o que é novo vs existente) — não gere a lista de tarefas por conta própria a partir da descrição.
- **`config/` do projeto alvo é a fonte da verdade.** Os tipos de nó disponíveis (rabbit, kafka, mongo... ou os tipos específicos daquele projeto) vêm de `config/diagrama.json` do projeto — leia esse arquivo antes de montar um `quebra.json` do zero, não presuma os tipos deste repositório.
- **Ciclos e conflitos não são para "resolver" silenciosamente.** Se `derive` reportar ciclos ou conflitos de dependência, pare e explique ao usuário o que encontrou — não remova/altere dependências para fazer o erro sumir.
- Atividades derivadas não são editáveis diretamente — é sempre o diagrama que muda, e a derivação é recalculada.

## Projeto existente — montando o contexto

Quando o usuário disser algo como "isso já existe, quero quebrar uma mudança nele":

1. **Leia `config/diagrama.json` do projeto alvo primeiro** (não deste repositório). São os únicos tipos de nó válidos ali; não presuma os tipos do domínio de exemplo deste repo.
2. **Se `graphify-out/graph.json` já existir no projeto alvo**, rode `gerador import-graphify <graph.json>` (precisa de `config/graphify-mapping.json` no projeto alvo, mapeando padrão de caminho de arquivo → tipo de nó — `gerador init` cria um exemplo). Gera um rascunho de `quebra.json` com nós `existente`/`extraido`; arquivos sem regra de mapeamento aparecem listados, nunca com tipo adivinhado. **O comando nunca gera arestas** — o grafo do Graphify descreve estrutura de código (imports/calls), não arquitetura (publica/consome/chama); modele as conexões manualmente depois. O mesmo import também existe no app web (aba "Importar do Graphify" do modal "✦ Como funciona & cenários") — mesma função, sem precisar da CLI, direto no canvas. Se o grafo não existir e o projeto for grande o bastante para valer a pena, **sugira** ao usuário rodar `/graphify .` lá antes; não rode por conta própria.
3. **Sem grafo, leia os arquivos relevantes diretamente** (manifests de dependência, configs de infra, definições de fila/tópico/tabela) — o suficiente para identificar quais nós já existem e como se conectam.
4. **Todo fato vindo do código vira nó com `status: "existente"` e valor com `origem: "extraido"`, sempre com `evidencia` no formato `arquivo:linha`.** Nunca `origem: "manual"` para algo que você leu, mesmo com certeza alta — proveniência existe exatamente para essa distinção (CONTEXTO-E-ARQUITETURA.md §6).
5. **Incerto é N/A com motivo, não é adivinhação.** Se o código não deixa claro (ex.: não dá para saber se um consumo é idempotente só lendo a assinatura do listener), preencha `specNA` com um motivo honesto ("não verificável estaticamente") em vez de chutar um valor.
6. **Apresente o rascunho antes de derivar.** Mostre os nós `existente`/`extraido` que você montou e peça confirmação — mesmo motivo pelo qual `sugerido`/`inferido` nunca contam como preenchidos sozinhos: nada que você extraiu deveria virar prontidão verde sem alguém olhar.

## Revisão crítica — atuando como arquiteto questionador

Use quando o usuário pedir para "revisar", "criticar" ou "questionar" uma quebra, ou ofereça isso (como opção, não como bloqueio) depois de um `derive` bem-sucedido. Isso é raciocínio seu sobre o `quebra.json`, não uma nova checagem determinística — o motor só valida o que é inequívoco (campo obrigatório vazio, `when.field` inexistente, ciclo de dependência); julgar se uma combinação de valores é intencional ou um esquecimento exige entender a intenção, que é trabalho seu, não do engine (mesma régua de SPEC-03 §3, que deixou validação cruzada de propósito fora do mecanismo).

**O que procurar**, em ordem de valor:

1. **Contradições estruturais entre campos do mesmo nó que o schema permite coexistir mas que raramente fazem sentido juntos.** Exemplos reais deste domínio: `dlq: false` + `ordenacao: true` + `idempotencia: false` numa fila (sem rede de segurança nenhuma: uma mensagem ruim trava a fila E pode duplicar efeito se alguém reprocessar manualmente); `ack: auto` numa fila com `ordenacao: true` (confirmar antes de processar arrisca perder justamente a mensagem que quebraria a ordem). Ver também SPEC-03 §7 (`consumidorAtivoUnico` existe exatamente para resolver a tensão entre `ordenacao` e `concorrencia`).
2. **N/A com motivo genérico demais para o peso do campo.** `"sem tempo"` ou `"não sei"` num campo como `migracao` ou `chaveDedupe` não é o mesmo tipo de N/A que `"volume baixo, default do broker basta"` em `prefetch`. Não recuse o N/A (não é sua decisão), mas pergunte se o motivo reflete uma decisão real.
3. **Nós órfãos** — sem nenhuma aresta de entrada ou saída — que provavelmente deveriam estar conectados a algo que já existe no diagrama.
4. **Nó `existente` com plano de migração que não parece convincente** (muito curto, genérico, ou que ignora o que SPEC-03 chama de "como conviver com o consumo atual durante a mudança").
5. **Atividades com `timesEnvolvidos` preenchido** sem nenhuma menção a como o outro time será avisado/envolvido — a quebra sinalizou a dependência entre times, mas isso sozinho não garante que alguém vai agir sobre ela.

**Regras não-negociáveis do modo revisor:**

- **Pergunte, nunca decida.** "Percebi que X e Y — é intencional, ou vale revisar?" — nunca "corrigi X porque Y estava errado."
- **Nunca edite a quebra como parte da revisão.** Se o usuário concordar com um apontamento, é ele (ou uma edição explícita pedida depois) que muda o diagrama — a revisão é só a conversa.
- **Não repita o que a prontidão já mostra.** Campo obrigatório em aberto já aparece vermelho na própria ferramenta; o valor da revisão está no que o semáforo não pega.

## Comandos

Resolva o wrapper primeiro (builda o CLI na hora, se preciso):

```powershell
$GERADOR = "C:\Users\silvi\Documents\gerador\skill\gerador-de-itens\scripts\gerador.ps1"
```

### Derivar backlog (headless — o caminho mais comum para um agente)

```powershell
& $GERADOR derive <caminho-para-quebra.json> --out backlog.md
```

Sem `--out`, imprime no stdout em vez de gravar. `--out arquivo.csv` gera CSV; qualquer outra extensão gera Markdown (inclui checklist de refinamento técnico e ciclos de teste por atividade, quando `config/regras.json` do projeto existir).

### Especificação de entrega (documento único da quebra inteira)

Quando o usuário (ou você, numa sessão de implementação) for atacar o backlog derivado, não monte o contexto técnico à mão — gere o documento inteiro de uma vez (SPEC-14 v3: um documento por quebra, não mais por atividade):

```powershell
& $GERADOR implementar <caminho-para-quebra.json> --out especificacao.md
```

Sem `--out`, imprime no stdout. O documento traz, pra cada item do backlog: a especificação completa dos nós envolvidos (não só o resumo — todo campo preenchido, N/A com motivo, e proveniência), dependências, critérios de aceite em Gherkin (scaffold por tipo de nó, editável), e o refinamento técnico + ciclos de teste, se `config/regras.json` existir — fechando com Definition of Ready/Done da quebra inteira.

### Materializar referências e padrões como notas Obsidian

Depois de `graphify export obsidian` já ter gerado o vault de código deste projeto, complementa esse vault com `config/referencias/*.json` (racional humano por trás de decisões, ligado a código real) e os padrões default por tipo de nó (SPEC-16/17):

```powershell
& $GERADOR export-vault --dir <vault> --abrir
```

`--dir` aponta pro mesmo vault que o Graphify já gerou (default `graphify-out/obsidian`); sem `--abrir`, só imprime a URI `obsidian://open?...` em vez de lançar o Obsidian. 100% local — não depende de servidor nenhum.

### Iniciar um projeto novo

Cria `config/{app,diagrama,regras,perfis-time}.json` + `config/referencias/*.json` + `config/cenarios/*.json` de exemplo no diretório indicado — nunca sobrescreve arquivo que já existir:

```powershell
& $GERADOR init <diretório-do-projeto>
```

### Abrir o editor visual

```powershell
Set-Location "C:\Users\silvi\Documents\gerador"
npm run build --workspace=packages/web   # só na primeira vez, ou após mudar o front
& $GERADOR open --port 4321
```

Depois abra `http://localhost:4321` no browser — a pessoa desenha o diagrama, preenche o painel de propriedades, e usa "Derivar Quebra" + "Exportar .md/.csv" na própria interface. `open` sempre serve o config/ do **diretório de onde foi chamado** (`config/diagrama.json`, `config/app.json`) — o mesmo bundle estático abre qualquer projeto, desde que rodado dentro dele e que `gerador init` já tenha criado `config/`. Sem `config/diagrama.json` no diretório, a tela mostra "Não foi possível carregar a configuração" em vez de renderizar quebrada.

## Formato de uma `quebra.json`

```json
{
  "time": "time-responsavel",
  "diagrama": {
    "nodes": [
      { "id": "n1", "type": "service", "status": "novo", "label": "srv-exemplo",
        "x": 100, "y": 100, "spec": {}, "specNA": {} }
    ],
    "edges": [
      { "id": "e1", "source": "n1", "target": "n2", "type": "publishes" }
    ]
  }
}
```

- `type` de cada nó precisa existir em `nodeTypes` do `config/diagrama.json` do projeto.
- Cada valor em `spec` precisa de `origem` (`manual` | `extraido` | `inferido` | `sugerido`); só `origem: "manual"` ou algo já `confirmado: true` conta como decidido de fato.
- Exemplo completo e realista (3 nós, 2 arestas, 6 atividades derivadas com dependências): `fixtures/01-servico-novo-fila-consumo.json` neste repositório — leia o campo `quebra` de lá como referência de forma, não copie o conteúdo.
