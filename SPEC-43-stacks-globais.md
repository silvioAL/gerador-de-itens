# SPEC-43 — Stacks conhecidas: catálogo global por componente, sem vínculo por time

> Origem (§190): depois da SPEC-42, o usuário apontou o problema de fundo —
> o card "Java + Spring Boot" carregava Camunda e FICO dentro (perfil =
> pacote heterogêneo com nome que mente), e questionou o próprio vínculo:
> "isso se é que faz sentido representar por time, poderia simplesmente ter
> tudo". Decidido com o usuário: ter tudo, sem vínculo por time.

## 1. Modelo

- **Stack é por componente**: `stacks` {id, organizacao_id, tipo_no, nome,
  criado_por} + `stack_valores` {stack_id, campo, valor}. "Java + Spring
  Boot" é uma stack DO Serviço; "Camunda 7" é outra, DO Processo — o nome
  para de mentir porque o escopo é um componente só.
- **Sem ponteiro de time**: morre `times.perfil_stack_id`, morrem
  `perfis_stack`/`perfil_stack_valores` (migração 0026 converte: cada
  (perfil × componente) vira uma stack, nome derivado dos valores —
  "Java + Spring Boot", "Camunda 7", "FICO Blaze Advisor", "Node").
- **Sugestão vem de TODAS as stacks**: o campo de um nó novo oferece um chip
  "usar sugestão: X" por valor conhecido daquele campo no catálogo. Filtrar
  por time volta como refinamento aditivo se o ruído um dia incomodar.

## 2. Superfícies

- Rotas: `GET /stacks`, `GET /stacks/sugestoes` (agregado tipo→campo→
  valores[]), `POST /stacks` {tipoNo, nome}, `PUT /stacks/:id/valores`,
  `POST /stacks/capturar` {tipoNo, valores} (o botão do painel — cria ou
  mescla a stack de nome derivado). Escrita segue o RBAC `perfis-stack`
  (curadoria; catálogo aberto = owners). Morrem `/perfis-time/*`,
  `/perfis-stack` antigos e `/times/:id/perfil-stack`.
- Painel do nó: "💾 salvar estes valores como stack conhecida" (sem «time»);
  chips de sugestão múltiplos quando há mais de um valor conhecido.
- Tela "Stacks conhecidas": catálogo agrupado por componente, criar stack
  (componente + nome), valores editáveis por stack. Sem seção de time, sem
  "usado por", sem apontar.
- Menu: some a linha "stack: …" da SPEC-42 (não existe mais stack DO time);
  o rótulo "Time" fica.

## 3. Feito quando

1. Migração converte o dado existente sem perda (valores e nomes honestos).
2. Sugestões de qualquer stack aparecem pra qualquer time; capturar cria a
   stack certa no componente certo.
3. Nenhuma menção a "stack do time" sobra na UI. Testes com mordida; E2E do
   ciclo criar→valor→sugestão; smoke no bundle.
