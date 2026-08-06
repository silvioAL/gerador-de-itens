# SPEC-04 — Schemas de spec para as tecnologias além do Rabbit

**Depende de SPEC-01/02/03 e de CONTEXTO-E-ARQUITETURA.md** · Registra uma decisão já implementada em `config/diagrama.example.json`, não uma proposta.

---

## 1. Objetivo

SPEC-03 entregou o schema completo do tipo `rabbit` e chamou isso de "o teste de fogo" da genericidade do mecanismo (§1 daquele documento). O teste passou: nenhuma linha de `engine/` ou do painel de propriedades mudou para acomodar Kafka, Mongo, SQL, Camunda, FICO, API Externa, Job/Scheduler ou Regra de Negócio. Este documento registra **por que cada campo existe** nesses oito schemas — a intenção, não só o JSON, que já está em `config/diagrama.example.json`.

## 2. Critério de recorte (herdado de SPEC-03 §3)

O mesmo critério vale para todo domínio novo:

- Campo que ninguém consegue responder no momento do desenho não entra — vira N/A automático e ensina a dispensar sem ler.
- Campo com resposta óbvia na maioria dos casos ganha `default`, não é feito obrigatório sem default.
- Cadeia condicional só se a segunda pergunta genuinamente depender da resposta da primeira — não para "organizar" o formulário.

Cada schema abaixo é mais raso que o de `rabbit` propositalmente. Mensageria com garantia de entrega tem mais decisões reais do que uma tabela SQL — forçar profundidade artificial nos schemas mais simples repetiria o erro oposto ao de SPEC-03 (excesso de campo, dispensa em massa).

## 3. Kafka — o schema mais rico depois do Rabbit

Kafka não é "Rabbit com nome diferente". As decisões que importam são estruturalmente diferentes:

- **Não tem DLQ nativa.** Rabbit tem o conceito embutido; Kafka precisa que alguém decida redirecionar para um tópico de erro à mão (`topicoDlq`). Sem essa pergunta, a suposição errada mais comum é "deve ter DLQ automática", e não tem.
- **Ordem é por partição, não pela fila inteira.** O campo `ordenacao` vem com a `ajuda` dizendo isso explicitamente, porque é a confusão mais comum de quem vem de Rabbit/SQS.
- **Chave de particionamento é uma decisão de modelagem, não de infra.** Só aparece quando há aresta de publicação (`hasIncomingEdge: publishes/pubsub`) — é quem publica que decide a chave.
- **`particoes` não permite N/A.** Ao contrário de `fatorReplicacao` (razoável ter só 1 em dev), o número de partições define o teto de paralelismo de consumo para sempre — decidir isso "depois" é caro.

## 4. Mongo e SQL — mesma pergunta central, ângulos diferentes

Os dois compartilham a pergunta mais importante — **plano de migração para nó existente** — e divergem no resto porque o risco real diverge:

- **Mongo** pergunta `ttlDias` e `chaveDeSharding` porque coleções schemaless crescem sem alarme — não existe migration que force a decisão como em SQL.
- **SQL** pergunta `ferramentaMigracao` e `volumeEsperado` porque o risco ali é o oposto: schema rígido, então a dor aparece na hora de migrar, não na hora de crescer.

Nenhum dos dois tenta modelar colunas/índices como estrutura — `indices` é texto livre. Uma lista estruturada de índices é a mesma categoria de melhoria que "stages do Camunda" (§6) — adiada de propósito, ver §7.

## 5. Camunda e FICO — o mesmo problema, dois nomes

Ambos são "algo decide por regras, ao longo do tempo, com histórico". O core de cada schema é a mesma pergunta com sotaque diferente:

- Camunda: **o que fazer com instâncias em voo** quando o processo muda (`estrategiaVersionamento`, só aparece em nó `existente`).
- FICO: **o que fazer quando o motor não decide** (`fallback`) e **se a decisão precisa ser auditável** (`auditoria`).

Nenhum dos dois modela o conteúdo interno do processo/fluxo (stages, motores como lista) — ver §7.

## 6. External, Job e Rule — schemas deliberadamente enxutos

- **API Externa**: autenticação, timeout e rate limit são as três perguntas que, sem resposta, geram incidente em produção — não em desenvolvimento, o que é exatamente por que costumam ficar sem resposta até doer.
- **Job/Scheduler**: a pergunta central é `concorrencia` — o que acontece se a execução anterior ainda estiver rodando quando a próxima disparar. É a causa mais comum de job duplicando efeito.
- **Regra de Negócio**: `gatilho` (bloqueia vs só alerta) é a única pergunta que muda o comportamento em produção; o resto é metadado.

## 7. O que foi conscientemente deixado de fora

- **Sub-listas estruturadas** (stages de um Camunda, motores de um FICO, índices de uma tabela, endpoints de um serviço). `FieldSpec.type` suporta `text | textarea | number | boolean | select` (`textarea` chegou depois, achado em uso real — ver SPEC-03 §7 — mas é puramente visual, mesma semântica de `text`) — não existe tipo "lista de sub-formulário". Adicionar isso é uma mudança de mecanismo (`engine/` e painel), não de config — cai na régua de SPEC-01 §14 ("não modifique engine para acomodar um campo, corrija o mecanismo"). Fica como próxima extensão de mecanismo, não como próxima spec de domínio.
- **Validação cruzada entre campos** (ex.: `ordenacao=true` com `concorrencia>1` no Kafka é uma contradição real). SPEC-03 §3 já registrava isso como "candidato a evolução do mecanismo, não improvise agora" — continua valendo.

## 8. Critério real de sucesso (herdado de SPEC-03 §5)

O mesmo vale aqui: não é o JSON estar completo, é rodar uma quebra real em cada tecnologia e observar se a pessoa responde com informação nova ou dispensa em massa com motivo vago. Ainda não foi validado com uso real para nenhum dos oito — são desenhados com o mesmo cuidado de `rabbit`, mas só uso real confirma o recorte.
