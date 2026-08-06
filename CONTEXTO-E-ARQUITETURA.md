# Contexto e Arquitetura — Gerador de Itens

Este documento não existia quando SPEC-01/02/03 foram escritas — elas assumiam sua existência e nunca foi criado. Este arquivo reconstrói essa base retroativamente, a partir do que foi de fato decidido e construído, e passa a ser a referência que qualquer spec nova deve assumir como lida.

---

## 1. Por que este projeto existe

Existe uma ferramenta em uso hoje (`gerador_de_itens-2.html`, protótipo de página única) que gera itens de backlog a partir de uma descrição de mudança de arquitetura. Ela resolve um problema real — sem ela, cada quebra técnica reinventa do zero quais perguntas fazer sobre uma fila nova, um endpoint novo, uma integração nova — mas carrega problemas estruturais que motivaram a reescrita:

1. **Estado lido de volta do DOM.** O JS lê valores de células de tabela por índice em vez de manter um objeto de estado. Qualquer mudança de layout quebra a leitura em silêncio.
2. **Regras de negócio presas em `switch`/JS inline.** Techs, contextos e regras de derivação estão hardcoded no script. Renomear uma tecnologia faz um requisito sumir sem erro nenhum.
3. **`localStorage` como fonte da verdade.** Perda de aba, de navegador ou de máquina é perda de dado — não é um rascunho, é o único lugar onde a quebra existe.
4. **Nenhuma proveniência.** Um valor preenchido por engano, um valor copiado de outro card, um valor que "parece certo" — tudo com a mesma aparência de um valor decidido com intenção.
5. **Cobertura desigual entre tecnologias.** O detalhe de uma fila Rabbit (DLQ, retry, idempotência) não tem equivalente para Kafka, Mongo, SQL, Camunda, FICO — quem usa essas stacks não é servido pela mesma qualidade de pergunta.

O objetivo não é "reescrever a mesma ferramenta melhor". É mudar o que a ferramenta força a pessoa a decidir **antes** de escrever código, não depois — e fazer isso de um jeito que não trava em Rabbit como domínio único.

## 2. O que este projeto **não** é

- **Não é um editor de diagramas genérico.** O diagrama é meio, não fim — existe para produzir prontidão e backlog, não para desenhar bonito.
- **Não é um gerador de texto por IA.** Nenhuma atividade de backlog nasce de um LLM interpretando uma descrição solta. Atividades só existem como saída determinística de `derivar()` sobre um diagrama real. Ver §5.
- **Não é SaaS multi-tenant.** É uma ferramenta local, rodada por um dev ou time, com estado em arquivo versionável em git. "Tenant" não existe como conceito — existe "repositório".

## 3. As duas jornadas de entrada

Esta é a decisão de produto mais importante tomada nesta fase, e o que diferencia esta ferramenta de "mais um desenhador de arquitetura":

1. **Projeto do zero** — a pessoa desenha o diagrama nó a nó, o painel de propriedades pergunta o que precisa ser decidido, a prontidão mostra o que falta.
2. **Projeto existente** — o repositório já tem código. Rodar `/graphify` nele constrói um grafo de conhecimento local (AST, sem IA obrigatória) que descreve o que já existe. Esse grafo pode alimentar nós `status: existente` com `origem: extraido` e evidência (`arquivo:linha`) — a pessoa não descreve de memória o que o sistema já faz, ela **confirma ou corrige** o que foi extraído. Implementado (MVP5, ver SPEC-06 §5): `gerador import-graphify <graph.json>` na CLI e a aba "Importar do Graphify" no app web, ambos usando `config/graphify-mapping.json` pra traduzir `source_file` em tipo de nó, com fallback explícito (`naoMapeados`) pra qualquer arquivo sem regra — nunca um tipo adivinhado.

A proveniência (§6.4) é o mecanismo que torna a jornada 2 segura: nada extraído ou inferido conta como decidido até alguém olhar e confirmar.

## 4. O que foi preservado do plano original (SPEC-01/02/03)

As specs originais desenhavam uma arquitetura pesada (Java/Spring Boot + MongoDB + multi-tenant + Testcontainers no backend; Vite/React com canvas SVG manual no frontend). A stack mudou (§7), mas os princípios de mecanismo permanecem intactos porque continuam corretos:

- **Config-driven, nunca hardcoded.** Tipo de nó, campo, condição de visibilidade, regra de conexão — tudo vem de `config/*.json`. O engine não sabe o que é "rabbit" ou "kafka"; sabe interpretar `NodeTypeConfig`/`FieldSpec`.
- **Proveniência de cada valor.** `manual` | `extraido` | `inferido` | `sugerido`. Um valor `inferido`/`sugerido` não confirmado **nunca** conta como preenchido para prontidão — é a proteção deliberada contra excesso de confiança em qualquer automação futura (copiloto, IA, ou o próprio Graphify).
- **Prontidão em semáforo.** Vermelho bloqueia, amarelo não. Bloquear no amarelo criaria pressão para confirmar sem ler.
- **Derivação determinística.** Diagrama → atividades é sempre função pura de `(diagrama, config, contexto)`. Nunca há um passo onde um LLM decide o que virou item de backlog.
- **Falhar alto, nunca em silêncio.** Config inválida (tech inexistente, `when.field` que não existe, `{{campo}}` quebrado) impede a subida com mensagem apontando o campo exato — não faz o requisito sumir.
- **Chave estável vs rótulo.** Atividades têm uma chave que nunca muda (`n2::criacao`) e um rótulo sequencial recalculado a cada derivação (`04`). Merge e referência sempre usam a chave.

## 5. Arquitetura como construída

```
gerador/
├── packages/
│   ├── engine/   TS puro, zero I/O — model, spec (condições), readiness,
│   │             derive, dependency (ciclos/conflitos), refinamento, export
│   ├── web/      Vite + React + React Flow — canvas, painel de propriedades,
│   │             revisão, persistência via File System Access API
│   └── cli/      bundle único (tsup) — init / derive / open, é o que a skill chama
├── config/       diagrama.json (tipos de nó/aresta), app.json (vocabulário
│   │             techs/contextos), regras.json (refinamento técnico por tech),
│   │             perfis-time.json (stack conhecida por time),
│   │             cenarios/ (exemplos prontos pro canvas, carregados em runtime),
│   │             referencias/ (trechos de código real guardados como referência,
│   │             mesmo carregamento em runtime)
├── fixtures/     casos compartilhados entre as suítes do engine e do web
├── skill/gerador-de-itens/   SKILL.md + wrapper — empacota o CLI pro Claude Code
├── Dockerfile, docker-compose.yml
└── gerador_de_itens-2.html  legado, mantido só como referência de regras a minerar
```

### 5.1 Decisões de simplificação em relação ao plano original

Cada uma destas é uma divergência deliberada do texto literal de SPEC-01/02, registrada aqui para não parecer omissão:

| Original | Construído | Por quê |
|---|---|---|
| Java/Spring Boot + Mongo | TypeScript de ponta a ponta | Só existe um runtime agora — elimina a necessidade de duplicar o avaliador de condições em duas linguagens (o "5.2" que SPEC-02 tratava como não-negociável deixou de ser necessário, não foi violado) |
| Multi-tenant, `TenantContext`/`TenantFilter` | Nenhum — "tenant" é o próprio repositório git | Ferramenta local, não SaaS; multi-pessoa é resolvido por commit, não por isolamento de banco |
| `PUT` com `rev` e 409 de concorrência | Checagem de mtime do arquivo local | Sem servidor, sem banco — a mesma proteção (não sobrescrever silenciosamente) com um mecanismo mais simples |
| SVG manual, sem lib de diagramação | React Flow | Prioridade mudou para simplicidade + visual, mantendo o princípio "estado é objeto JS, nunca DOM" (React Flow é estado controlado) |
| `POST /derivar` reavalia prontidão no servidor | Derivação roda 100% no browser | Não existe mais "servidor" nem "cliente não confiável" — é a mesma pessoa, o mesmo processo |

### 5.2 O que ainda não existe

- UI para editar `endpoints` de um nó `service` (o modelo e a derivação já suportam, falta o formulário).
- Campos estruturados (lista/sub-formulário) — `stages` de um Camunda, `motores` de um FICO ainda são texto livre, não uma lista editável de itens.
- Edição de `waypoints` manuais de aresta (roteamento automático apenas).
- Seleção de arquivos assistida por Graphify na aba "Referências de código" — hoje a seleção é manual (`<input type="file">`); apontar direto para nós já mapeados pelo grafo do Graphify (em vez de escolher do disco) é a evolução natural, ainda não feita (ver SPEC-07, atualização em JOURNEY.md §17).
- Itens de backlog manuais fora do diagrama — **decisão explícita de não fazer**: todo item nasce de um nó/aresta real, nunca de texto solto (§2 acima).

## 6. Convenções para quem for escrever a próxima spec

- Se a mudança é sobre **o que um tipo de nó pergunta**, é uma extensão de `config/diagrama.json` — spec própria só se o domínio for grande o bastante para justificar (ver SPEC-04).
- Se a mudança exigir tocar `packages/engine/src/`, pare e pergunte se o mecanismo genérico não está bom o bastante — mudar o engine para acomodar um campo específico é o erro que SPEC-03 já advertia.
- Toda fixture nova em `fixtures/` é lida por engine **e** web — nunca copiada.
- Toda config nova em `config/*.example.json` precisa passar em `validateConfig`/`validateRegras` (engine) antes de ser considerada pronta.
