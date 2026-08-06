# SPEC-05 — Perfil de stack por time e refinamento técnico

**Depende de CONTEXTO-E-ARQUITETURA.md** · Registra mecanismo já implementado (`packages/engine/src/spec/campos.ts`, `packages/engine/src/refinamento/`, `config/perfis-time.example.json`, `config/regras.example.json`).

---

## 1. Objetivo

Dois problemas concretos, do mesmo time que revisou este projeto:

1. "Um time que trabalha com Java/Spring Boot, Camunda e FICO não deveria ficar configurando se determinado serviço é Node toda vez." — repetição evitável de uma resposta que já se sabe.
2. O protótipo legado tinha uma aba `rules` inteira (`tabelaRegras`, `getTechnicalRefinementForBreakdown`, `getAutomatedCyclesForBreakdown`) gerando um checklist de refinamento técnico e ciclos de teste DEV/HLG por tech — e isso não tinha sido portado. É provavelmente o valor central da ferramenta original, não um extra.

Os dois mecanismos são independentes mas compartilham a mesma forma: uma base de conhecimento de config que **sugere**, nunca decide por quem está desenhando.

## 2. Perfil de stack por time

### 2.1 Mecanismo

`config/perfis-time.json`: `{ [timeId]: { [tipoDeNo]: { [campo]: valor } } }`. `resolverDefault(campo, no, perfilDoTime?)` (SPEC-01 §6 original) ganhou um terceiro parâmetro opcional: quando o campo **não tem** `default` estático no schema, consulta o perfil do time da quebra (`quebra.time`) antes de desistir.

### 2.2 Por que não é um mecanismo novo

Um `default` estático já era "uma sugestão que a pessoa aceita com um clique, nunca conta como preenchida sozinha" (§7 de SPEC-01, e testado pela fixture `rabbit.json`, caso "dlq=true encadeia dlxName..."). O perfil de time é **a mesma coisa**, só que a fonte do valor sugerido é o time em vez do schema. Reaproveitar o botão "usar sugestão" e a proveniência `manual` (só depois de aceito) evita inventar uma quinta origem de valor — `manual`/`extraido`/`inferido`/`sugerido` continuam sendo as únicas quatro.

### 2.3 Precedência

`default` explícito do schema **sempre** vence o perfil. Um autor de domínio que escreveu `"default": "manual"` para o campo `ack` fez um julgamento deliberado ("manual é o seguro por padrão") — o perfil de time preenche só as lacunas que o schema deixou genuinamente abertas (ex.: `linguagem` de um serviço, que varia por time e não tem resposta "certa" universal).

### 2.4 Por que o time é o da quebra, não do nó

`Quebra.time` já existia no modelo (usado para o badge de "time diferente" em nós `existente`). Reaproveitar esse campo como "de quem é a stack default" evita introduzir um segundo conceito de time. Escolha deliberada: perfil por nó individual (cada serviço podendo ter um time diferente da quebra) fica como extensão futura, só se aparecer necessidade real — não foi implementado especulativamente.

## 3. Refinamento técnico e ciclos de teste

### 3.1 Mecanismo

`config/regras.json.porTech[tech]` tem duas listas:

- `requisitos`: checklist de refinamento técnico. Cada item tem `contextos` — vazio aplica sempre que a tech estiver presente na atividade; caso contrário, só se algum contexto da atividade **contiver** (substring, sem case) algum dos contextos do item.
- `testes`: ciclos de teste automatizados, com `dev`/`hlg` como booleanos independentes (um teste pode valer para os dois ambientes, só um, ou nenhum sentido ter os dois marcados como falso).

`gerarChecklistTecnico`/`gerarCiclosDeTeste` (`packages/engine/src/refinamento/`) são funções puras: `(regras, techs, contextos) -> string` em Markdown. `paraMarkdown` do export as chama por atividade quando `regras` é passado.

### 3.2 Por que casamento parcial de contexto, não igualdade

Um requisito com `contextos: ["Backend-mensagens"]` vale tanto para `Backend-mensagens rabbitmq` quanto para `Backend-mensagens kafka` — a maioria dos requisitos de mensageria (retry, DLQ, idempotência) é igual entre brokers; só uma minoria é específica (prefetch é Rabbit, particionamento é Kafka). Igualdade exata forçaria duplicar cada requisito genérico por broker. É o mesmo espírito do `hasIncomingEdge` do avaliador de condições: perguntar "isso se aplica aqui?" de um jeito que não precisa enumerar cada combinação.

### 3.3 Por que isso não vira parte do schema do nó

Refinamento técnico é sobre **como construir**, não sobre **o que o nó é**. Uma pergunta do schema (`dlq: true`) é uma decisão de design que afeta a prontidão do nó. Um item de checklist ("DLQ configurada e monitorada") é uma lembrança de execução — não bloqueia nada, não tem proveniência, não é preenchido, só aparece junto da atividade derivada na hora de virar trabalho. Misturar os dois faria campos de schema virarem checklist e vice-versa, perdendo a distinção entre "decisão" e "lembrete".

### 3.4 Validação

`validateRegras(regras, app)` (paralelo a `validateConfig`) recusa `porTech` referenciando uma tech que não existe em `app.json`, e contextos de `requisitos`/`testes` que não batem com nenhum contexto de `app.json` — mesmo princípio de falhar alto de SPEC-01 §7.2, aplicado à base de regras.

## 4. O que não fazer

- Não usar o perfil de time para preencher campos que já têm `default` estático — quebraria a precedência do §2.3 e tornaria o comportamento de `resolverDefault` imprevisível.
- Não adicionar uma quinta origem de proveniência para "sugerido pelo perfil de time" — é `manual` como qualquer outro valor aceito, a distinção mora na UI (texto da sugestão), não no modelo.
- Não fazer o checklist técnico bloquear a derivação. Ele é puramente informativo — igual ao "amarelo não bloqueia" da prontidão (SPEC-02 §6), a mesma filosofia de não forçar confirmação sem leitura se aplica aqui.
