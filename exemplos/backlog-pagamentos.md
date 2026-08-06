# Backlog derivado

| # | Tipo | Tamanho | Descrição | Techs | Contextos | Dependências | Times | Detalhes |
|---|---|---|---|---|---|---|---|---|
| 01 | História | M | Setup inicial de srv-pagamentos-aprovacao. | Backend |  | enabler |  |  |
| 02 | História | M | Implementar endpoint POST /v1/pagamentos/{id}/aprovar em srv-pagamentos-aprovacao. | Backend | Backend-chamadas http | dependent→n1::setup |  |  |
| 03 | Task | PP | Criar pagamentos.eventos. | Backend | Backend-topologia-mensageria | enabler |  | exchangeType=topic, durable=true |
| 04 | Task | PP | Criar pagamento.aprovado.q. | Backend | Backend-mensagens rabbitmq | enabler |  | queueType=quorum, dlq=true, retryStrategy=backoff, ack=manual |
| 05 | História | P | srv-pagamentos-aprovacao publica em pagamentos.eventos. | Backend | Backend-topologia-mensageria | dependent→n1::setup; dependent→n2::criacao |  |  |
| 06 | História | M | srv-antifraude consome de pagamento.aprovado.q. | Backend | Backend-mensagens rabbitmq | dependent→n3::criacao | time-risco | ack=manual, concorrencia=3, ordenacao=true, idempotencia=false |

## Refinamento técnico — 01 Setup inicial de srv-pagamentos-aprovacao.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 02 Implementar endpoint POST /v1/pagamentos/{id}/aprovar em srv-pagamentos-aprovacao.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Timeout e política de retry definidos
- [ ] Autenticação/autorização da chamada definida
- [ ] Circuit breaker ou fallback para indisponibilidade

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de timeout**: Chamada expira dentro do limite configurado e é tratada
- **Teste de contrato**: Request/response batem com o contrato da API externa
_HLG:_
- **Teste de contrato**: Request/response batem com o contrato da API externa

## Refinamento técnico — 03 Criar pagamentos.eventos.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 04 Criar pagamento.aprovado.q.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de retry e DLQ definidas
- [ ] Consumo é idempotente ou tem chave de dedupe
- [ ] Ordem de processamento documentada (importa ou não)
- [ ] Prefetch dimensionado para o volume esperado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de retry/DLQ**: Mensagem malformada ou que falha repetidamente vai para a DLQ
_HLG:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de carga**: Fila absorve pico de 2x o volume médio sem atraso relevante

## Refinamento técnico — 05 srv-pagamentos-aprovacao publica em pagamentos.eventos.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 06 srv-antifraude consome de pagamento.aprovado.q.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de retry e DLQ definidas
- [ ] Consumo é idempotente ou tem chave de dedupe
- [ ] Ordem de processamento documentada (importa ou não)
- [ ] Prefetch dimensionado para o volume esperado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de retry/DLQ**: Mensagem malformada ou que falha repetidamente vai para a DLQ
_HLG:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de carga**: Fila absorve pico de 2x o volume médio sem atraso relevante
