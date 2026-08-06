# SPEC-03 — Spec completo do nó `rabbit`

**Passo 3 de §12** · Depende de SPEC-01 e SPEC-02 · **Maior risco de design do projeto**

---

## 1. Objetivo

Preencher `config/diagrama.json` com o schema de especificação completo do tipo `rabbit` — os campos que hoje ninguém pensa no momento da quebra e que causam a dor #1.

Este passo entrega **configuração, não código**. Se exigir mudança em `engine/` ou no painel de propriedades, o mecanismo dos passos 1 e 2 não ficou genérico o bastante — pare e corrija lá, não aqui. É por isso que este é o passo de maior risco: ele é o teste real da generalidade dos anteriores.

## 2. Entregável

Bloco `nodeTypes.rabbit` de `config/diagrama.json`, mais `rabbit-exchange` se o time usar exchange declarada separadamente.

```json
{
  "nodeTypes": {
    "rabbit": {
      "label": "Fila Rabbit",
      "derives": "queue",
      "techs": ["Backend"],
      "contextos": ["Backend-mensagens rabbitmq"],
      "spec": [
        { "key": "topic", "label": "Nome da fila", "type": "text", "required": true,
          "ajuda": "Nome completo, no padrão do time." },

        { "key": "durable", "label": "Durable", "type": "boolean",
          "default": true, "required": true,
          "ajuda": "Fila não durable some quando o broker reinicia." },

        { "key": "dlq", "label": "Possui DLQ?", "type": "boolean",
          "default": true, "required": true,
          "when": { "hasIncomingEdge": ["consumes", "pubsub"] },
          "ajuda": "Sem DLQ, mensagem que falha repetidamente é perdida ou trava a fila." },

        { "key": "dlxName", "label": "Nome da DLX", "type": "text",
          "default": "{{topic}}.dlx", "required": true,
          "when": { "field": "dlq", "equals": true } },

        { "key": "dlqRoutingKey", "label": "Routing key da DLX", "type": "text",
          "default": "{{topic}}.dlq", "required": true,
          "when": { "field": "dlq", "equals": true } },

        { "key": "retryStrategy", "label": "Estratégia de retry", "type": "select",
          "options": ["backoff", "delay-queue", "sem-retry"], "required": true,
          "when": { "field": "dlq", "equals": true },
          "ajuda": "backoff = retry do listener; delay-queue = fila de espera com TTL + DLX de volta. São incompatíveis; ver padrões." },

        { "key": "retries", "label": "Tentativas", "type": "number",
          "default": 3, "required": true,
          "when": { "field": "retryStrategy", "notEquals": "sem-retry" } },

        { "key": "backoffInicialMs", "label": "Intervalo inicial (ms)", "type": "number",
          "default": 1000, "required": true,
          "when": { "field": "retryStrategy", "equals": "backoff" } },

        { "key": "backoffMultiplicador", "label": "Multiplicador", "type": "number",
          "default": 2, "required": true,
          "when": { "field": "retryStrategy", "equals": "backoff" } },

        { "key": "delayTtlMs", "label": "TTL da fila de espera (ms)", "type": "number",
          "required": true,
          "when": { "field": "retryStrategy", "equals": "delay-queue" } },

        { "key": "ttl", "label": "TTL da mensagem (ms)", "type": "number",
          "required": true, "permiteNA": true,
          "ajuda": "Sem TTL, mensagem antiga é processada muito depois de perder o sentido." },

        { "key": "ack", "label": "Ack", "type": "select",
          "options": ["manual", "auto"], "default": "manual",
          "required": true, "permiteNA": false,
          "ajuda": "auto confirma antes de processar — perda de mensagem em caso de falha." },

        { "key": "prefetch", "label": "Prefetch", "type": "number",
          "required": false,
          "when": { "allOf": [
            { "hasIncomingEdge": ["consumes"] },
            { "field": "ack", "equals": "manual" } ] } },

        { "key": "concorrencia", "label": "Consumidores concorrentes", "type": "number",
          "default": 1, "required": true,
          "when": { "hasIncomingEdge": ["consumes"] } },

        { "key": "ordenacao", "label": "Exige ordem estrita?", "type": "boolean",
          "required": true,
          "when": { "hasIncomingEdge": ["consumes", "pubsub"] },
          "ajuda": "Ordem estrita é incompatível com concorrência > 1 e com retry assíncrono." },

        { "key": "idempotencia", "label": "Consumo é idempotente?", "type": "boolean",
          "required": true,
          "when": { "hasIncomingEdge": ["consumes", "pubsub"] },
          "ajuda": "Com retry, a mesma mensagem chega mais de uma vez. Se não for idempotente, precisa de dedupe." },

        { "key": "chaveDedupe", "label": "Chave de deduplicação", "type": "text",
          "required": true,
          "when": { "allOf": [
            { "field": "idempotencia", "equals": false },
            { "hasIncomingEdge": ["consumes", "pubsub"] } ] } },

        { "key": "migracao", "label": "Plano de migração", "type": "text",
          "required": true,
          "when": { "not": { "nodeStatus": "novo" } },
          "ajuda": "Fila que já existe: como conviver com o consumo atual durante a mudança." }
      ]
    }
  }
}
```

## 3. Decisões de recorte

**`ack` não permite N/A.** Toda fila consome de algum jeito; dispensar essa decisão é sempre esquecimento, nunca escolha.

**`ttl` permite N/A.** Há casos legítimos sem TTL — mas o motivo fica registrado, que é o ponto (§3.2).

**`idempotencia` puxa `chaveDedupe`.** É a cadeia condicional mais valiosa do schema: a pessoa responde "não é idempotente" e imediatamente descobre que precisa definir como deduplicar. Essa descoberta hoje acontece em desenvolvimento.

**`ordenacao` e `concorrencia` juntos.** O painel não valida a combinação neste passo, mas a pergunta lado a lado já expõe o conflito. Validação cruzada é candidata a evolução do mecanismo — não improvise agora.

## 4. Validação

Após escrever o JSON:

1. A aplicação deve **subir** — `ValidadorConfig` (SPEC-01 §5) confirma que `Backend` e `Backend-mensagens rabbitmq` existem em `app.json` e que todos os `{{campo}}` resolvem.
2. `fixtures/spec-conditions/rabbit.json` continua passando nas duas suítes. A fixture usa um subconjunto deste schema — **não a altere para acomodar o schema**; se divergirem, acrescente casos novos.
3. Desenhar uma fila com consumo no canvas deve mostrar a cadeia condicional funcionando ponta a ponta.

## 5. Critério real de sucesso

Não é o JSON estar completo. É **rodar uma quebra real** e observar o que a pessoa faz:

- Ela responde as perguntas e o item sai mais especificado → o recorte está certo, replique para Kafka.
- Ela dispensa metade dos campos com motivos vagos → excesso de campos. Corte, não insista.
- Ela trava porque não sabe responder → falta padrão aplicável (passo 6), não falta campo.

As três reações são informação útil. A pior saída é ninguém rodar uma quebra real e o schema ser replicado para Kafka, Camunda e FICO com um erro de recorte multiplicado por quatro.

## 6. O que NÃO fazer

- Não acrescente Kafka, Camunda, FICO ou endpoint neste passo.
- Não modifique `engine/` nem o painel de propriedades para acomodar um campo. Se precisar, o mecanismo está errado — corrija o mecanismo.
- Não altere a fixture para fazê-la passar.
- Não acrescente campo que ninguém consegue responder no momento do desenho. Campo impossível vira N/A automático e ensina a dispensar sem ler.

## 7. Atualização — topologia de nível sênior (pós-implementação)

Uso real do schema original expôs uma lacuna: ele descrevia bem a fila isolada, mas não a topologia de produção ao redor dela. Campos adicionados a `config/diagrama.example.json` e `config/domains/rabbit.diagrama.json`, mantendo o mesmo critério de recorte do §3 (só pergunta que muda decisão real):

- **`routingKey`** — a binding entre exchange e fila não tinha campo nenhum; só existia a aresta `binding`/`publishes` sem capturar a chave.
- **`queueType` (quorum/classic)** — decisão de disponibilidade que hoje tem resposta recomendada clara (quorum, desde RabbitMQ 3.8) mas que ninguém pensava em perguntar.
- **`maxLength` + `overflowBehavior`** — sem isso, uma fila sem consumidor cresce sem alarme até estourar o broker; é a mesma categoria de risco que já motivava `ttl`.
- **`consumidorAtivoUnico`** — resolve uma contradição que o schema original só documentava na `ajuda` de `ordenacao` ("incompatível com concorrência > 1") sem oferecer saída. `x-single-active-consumer` é a saída real: registra N consumidores, mantém 1 ativo, falha rápido sem perder ordem.
- **`contratoMensagem`** (`type: "textarea"`) — formato da mensagem/payload, achado faltando em uso real (o resto do schema decide política de retry/DLQ, mas nada dizia o que ia dentro da mensagem). Junto com essa adição, `type: "textarea"` também é config novo no engine desde então (`packages/engine/src/config/types.ts`) — mesma semântica de `"text"`, só reserva mais espaço vertical na UI e oferece expandir; nunca é ramificado por lógica do engine.

Nenhuma dessas mudanças tocou `engine/` de forma estrutural — são só campos e condições novas em config (e um tipo de campo puramente visual), confirmando de novo a genericidade do mecanismo.
