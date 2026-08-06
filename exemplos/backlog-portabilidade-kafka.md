# Backlog derivado

| # | Tipo | Tamanho | Descrição | Techs | Contextos | Dependências | Times | Detalhes |
|---|---|---|---|---|---|---|---|---|
| 01 | História | M | Setup inicial de srv-portabilidade. | Backend |  | enabler |  |  |
| 02 | História | M | Implementar endpoint POST /v1/portabilidade/solicitacoes em srv-portabilidade. | Backend | Backend-chamadas http | dependent→n1::setup |  |  |
| 03 | Task | PP | Criar portabilidade.solicitada.v1. | Backend | Backend-mensagens kafka | enabler |  | particoes=6, politicaRetencao=tempo, schemaRegistry=true |
| 04 | História | P | srv-portabilidade publica em portabilidade.solicitada.v1. | Backend | Backend-mensagens kafka | dependent→n1::setup; dependent→n2::criacao |  |  |
| 05 | História | M | srv-auditoria-eventos consome de portabilidade.solicitada.v1. | Backend | Backend-mensagens kafka | dependent→n2::criacao | time-dados | consumerGroup=auditoria-eventos-portabilidade, offsetReset=earliest, ordenacao=true, idempotencia=false |

## Refinamento técnico — 01 Setup inicial de srv-portabilidade.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 02 Implementar endpoint POST /v1/portabilidade/solicitacoes em srv-portabilidade.

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

## Refinamento técnico — 03 Criar portabilidade.solicitada.v1.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de retry e DLQ definidas
- [ ] Consumo é idempotente ou tem chave de dedupe
- [ ] Ordem de processamento documentada (importa ou não)
- [ ] Estratégia de particionamento e chave definidas
- [ ] Consumer group e política de offset (earliest/latest) definidos

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de retry/DLQ**: Mensagem malformada ou que falha repetidamente vai para a DLQ
_HLG:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de rebalanceamento**: Consumer group rebalanceia sem perda ou duplicação de mensagem

## Refinamento técnico — 04 srv-portabilidade publica em portabilidade.solicitada.v1.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de retry e DLQ definidas
- [ ] Consumo é idempotente ou tem chave de dedupe
- [ ] Ordem de processamento documentada (importa ou não)
- [ ] Estratégia de particionamento e chave definidas
- [ ] Consumer group e política de offset (earliest/latest) definidos

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de retry/DLQ**: Mensagem malformada ou que falha repetidamente vai para a DLQ
_HLG:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de rebalanceamento**: Consumer group rebalanceia sem perda ou duplicação de mensagem

## Refinamento técnico — 05 srv-auditoria-eventos consome de portabilidade.solicitada.v1.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de retry e DLQ definidas
- [ ] Consumo é idempotente ou tem chave de dedupe
- [ ] Ordem de processamento documentada (importa ou não)
- [ ] Estratégia de particionamento e chave definidas
- [ ] Consumer group e política de offset (earliest/latest) definidos

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de retry/DLQ**: Mensagem malformada ou que falha repetidamente vai para a DLQ
_HLG:_
- **Teste de contrato**: Payload publicado/recebido bate com o schema acordado
- **Teste de rebalanceamento**: Consumer group rebalanceia sem perda ou duplicação de mensagem
