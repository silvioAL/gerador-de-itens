# SPEC-39 — PDCA de configurações via agente, aprovações com validade e o fim dos botões de saída

> Pedido do usuário (pré-autorizado, §183): a cada N usos o agente pergunta se
> faltou/sobrou item de checklist, regra ou campo; a entrevista cita os
> últimos itens feitos pelo time; quem não é owner (ou o papel é de outro
> grupo, ex. arquitetura) tem o pedido direcionado a APROVAÇÃO — com validade,
> porque pode haver tempo entre pedido e decisão e uma config que mudou no
> meio invalida o pedido. Gerar especificação vira ação do agente (botão sai)
> e, após esse passo, o agente coleta feedback a cada 3 usos.

## 1. Conceitos

- **Uso** = uma derivação concluída (`tipo: derivacao`) ou uma especificação
  gerada (`tipo: especificacao`). Contado POR USUÁRIO no servidor
  (`pdca_usos`), porque a cadência é "a cada N usos do MESMO usuário".
- **Cadência** = documento de config `pdca` (`{cadenciaUsos: 5,
  cadenciaFeedback: 3}`), editável pelo admin (gate: permissão `acessos` —
  quem administra o RBAC administra o PDCA).
- **Entrevista (M11)** = balão do assistente no RETORNO ao canvas (a revisão
  fala pela revisão): "sentiu falta ou sobra de checklist/regra/campo?",
  citando os títulos das últimas quebras do time. Chip abre a conversa de
  configuração (SPEC-34) para quem pode; para quem não pode, a entrada do
  balão vira o texto de uma SOLICITAÇÃO.
- **Solicitação de ajuste** (`solicitacoes_ajuste`) = {recurso, descrição,
  time, solicitante, **versaoAlvo** = `config_documentos.atualizadoEm` do
  documento do recurso no momento do pedido}. Estados: `pendente`,
  `aprovada`, `rejeitada`, `invalida`.
- **Validade**: ao APROVAR, o servidor recompara a versão atual do documento
  com a `versaoAlvo`. Mudou → o pedido é marcado `invalida` e a aprovação é
  recusada (409, com o motivo) — um pedido sobre uma versão anterior da
  config pode não fazer mais sentido; quem decide reavalia sobre o estado
  novo. Recursos sem documento versionado (campos-no/aresta) entram sem
  versão na Fase 1 (sempre válidos) — anotado como limite.
- **M12** = com a revisão aberta e nenhum momento mais urgente, o agente
  oferece "Gerar especificação de solução" — o BOTÃO do header morre; todo
  caminho de geração passa pelo agente (M7 quando tudo refinado, M12 nos
  demais casos).
- **M13** = feedback pós-especificação: a cada `cadenciaFeedback` gerações do
  mesmo usuário, balão com entrada livre ("o que faltou ou sobrou?") →
  `pdca_feedback` (consultável; alimenta o mesmo ciclo).

## 2. Fases

- **Fase 1 (esta rodada)**: tabelas + rotas (`/pdca/config`, `/pdca/uso`,
  `/pdca/feedback`, `/ajustes` com decisão e validade), M11/M12/M13 no web,
  botão de especificação removido, seção "Solicitações de ajuste" na aba
  Acessos (aprovar/rejeitar/inválida).
- **Fase 2**: a solicitação nascer AUTOMATICAMENTE do 403 do ConfigurarPanel
  (a proposta negada vira pedido com recurso exato); aplicação automática do
  ajuste aprovado; recursos por-linha (campos-no) versionados.

## 3. Feito quando (Fase 1)

1. Com cadência 1, derivar e voltar ao canvas mostra a entrevista citando as
   últimas quebras do time; dispensável.
2. `POST /ajustes` guarda a versão do documento; mudar o documento e aprovar
   → 409 e estado `invalida`; sem mudança → `aprovada`. Mordida na validade.
3. O header da revisão não tem mais "Gerar especificação de solução"; o M12
   gera pelo balão (E2E do download passa pelo agente).
4. Na 3ª especificação do usuário, balão de feedback com entrada; o texto
   aparece em `pdca_feedback`.
