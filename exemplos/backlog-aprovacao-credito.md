# Backlog derivado

| # | Tipo | Tamanho | Descrição | Techs | Contextos | Dependências | Times | Detalhes |
|---|---|---|---|---|---|---|---|---|
| 01 | História | M | Setup inicial de srv-credito-api. | Backend |  | enabler |  |  |
| 02 | História | M | Implementar endpoint POST /v1/credito/solicitacoes em srv-credito-api. | Backend | Backend-chamadas http | dependent→n1::setup |  |  |
| 03 | Task | PP | Criar processo-aprovacao-credito. | Backend | Backend-orquestracao | enabler |  | framework=Camunda 8, compensacao=true |
| 04 | Task | PP | Criar decisao-score-credito. | Backend | Backend-regras | enabler |  | auditoria=true, fallback=Se o motor não decidir em 5s, a solicitação é encaminhada para análise manual e o cliente é notificado do atraso. |
| 05 | Task | PP | Criar solicitacoes_credito. | Backend | Backend-dados | enabler |  | volumeEsperado=medio, ferramentaMigracao=flyway |
| 06 | Task | PP | Criar decisoes_auditoria. | Backend | Backend-dados | enabler |  | writeConcern=majority, ttlDias=2555 |
| 07 | Task | PP | Criar reprocessar-decisoes-pendentes. | Backend |  | enabler |  | cron=*/15 * * * *, concorrencia=execução exclusiva (fila) |
| 08 | Task | PP | Criar regra-limite-endividamento. | Backend | Backend-regras | enabler |  | gatilho=bloqueia a operação |
| 09 | História | M | srv-credito-api orquestra processo-aprovacao-credito. | Backend | Backend-orquestracao | dependent→n1::setup; dependent→n2::criacao |  |  |
| 10 | História | M | processo-aprovacao-credito orquestra decisao-score-credito. | Backend | Backend-regras | dependent→n2::criacao; dependent→n3::criacao |  |  |
| 11 | História | P | decisao-score-credito chama via HTTP bureau-credito-nacional. | Backend | Backend-chamadas http | dependent→n3::criacao | time-integracoes |  |
| 12 | História | P | srv-credito-api escreve em solicitacoes_credito. | Backend | Backend-dados | dependent→n1::setup; dependent→n5::criacao |  |  |
| 13 | História | P | decisao-score-credito escreve em decisoes_auditoria. | Backend | Backend-dados | dependent→n3::criacao; dependent→n6::criacao |  |  |
| 14 | História | P | srv-credito-api usa a validação de regra-limite-endividamento. | Backend | Backend-regras | dependent→n1::setup; dependent→n8::criacao |  |  |

## Refinamento técnico — 01 Setup inicial de srv-credito-api.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 02 Implementar endpoint POST /v1/credito/solicitacoes em srv-credito-api.

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

## Refinamento técnico — 03 Criar processo-aprovacao-credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de compensação (rollback) do processo definida
- [ ] Versionamento do processo considerado (instâncias em voo na migração)

### Ciclos de teste

**BACKEND:**
_HLG:_
- **Teste de compensação**: Rollback funciona quando uma etapa do processo falha

## Refinamento técnico — 04 Criar decisao-score-credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Decisão é auditável (rastreabilidade de por que decidiu X)
- [ ] Versionamento das regras de negócio considerado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança
_HLG:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança

## Refinamento técnico — 05 Criar solicitacoes_credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Índices criados para as queries novas
- [ ] Plano de migração/rollback do schema
Volume e retenção de dados esperados <- especificar

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes
_HLG:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes

## Refinamento técnico — 06 Criar decisoes_auditoria.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Índices criados para as queries novas
- [ ] Plano de migração/rollback do schema
Volume e retenção de dados esperados <- especificar

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes
_HLG:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes

## Refinamento técnico — 07 Criar reprocessar-decisoes-pendentes.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro

## Refinamento técnico — 08 Criar regra-limite-endividamento.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Decisão é auditável (rastreabilidade de por que decidiu X)
- [ ] Versionamento das regras de negócio considerado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança
_HLG:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança

## Refinamento técnico — 09 srv-credito-api orquestra processo-aprovacao-credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Estratégia de compensação (rollback) do processo definida
- [ ] Versionamento do processo considerado (instâncias em voo na migração)

### Ciclos de teste

**BACKEND:**
_HLG:_
- **Teste de compensação**: Rollback funciona quando uma etapa do processo falha

## Refinamento técnico — 10 processo-aprovacao-credito orquestra decisao-score-credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Decisão é auditável (rastreabilidade de por que decidiu X)
- [ ] Versionamento das regras de negócio considerado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança
_HLG:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança

## Refinamento técnico — 11 decisao-score-credito chama via HTTP bureau-credito-nacional.

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

## Refinamento técnico — 12 srv-credito-api escreve em solicitacoes_credito.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Índices criados para as queries novas
- [ ] Plano de migração/rollback do schema
Volume e retenção de dados esperados <- especificar

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes
_HLG:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes

## Refinamento técnico — 13 decisao-score-credito escreve em decisoes_auditoria.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Índices criados para as queries novas
- [ ] Plano de migração/rollback do schema
Volume e retenção de dados esperados <- especificar

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes
_HLG:_
- **Teste de migração**: Migration roda limpo numa base com dados existentes

## Refinamento técnico — 14 srv-credito-api usa a validação de regra-limite-endividamento.

**BACKEND:**
- [ ] Nome segue o padrão de nomenclatura do time
- [ ] Logs relevantes emitidos em pontos de decisão/erro
- [ ] Decisão é auditável (rastreabilidade de por que decidiu X)
- [ ] Versionamento das regras de negócio considerado

### Ciclos de teste

**BACKEND:**
_DEV:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança
_HLG:_
- **Teste de regressão de regras**: Casos conhecidos continuam decidindo da mesma forma após a mudança
