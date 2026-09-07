# SPEC-111 — Screens standalone e o caminho de app builder assistido

> **Status: REGISTRADA, não detalhada.** Depende da SPEC-110 (fatias B, C e
> H) implementada — as decisões finas daqui devem ser tomadas COM as lições
> daquelas fatias na mão, não antes. Registrada a pedido do usuário, e
> REVISADA por ele: *"eu acredito que deveria sim funcionar como appbuilder
> low code/no code, e que deveria funcionar com apoio do assistente"* — a
> fronteira antiga ("não é um app builder") caiu; virou o norte, por
> etapas.

## 1. De onde ela vem

A SPEC-110 decide (D14/fatia H) que screens moram na galeria e RODAM dentro
de fluxos (o stage da fatia B). Esta SPEC responde as duas perguntas
seguintes: a screen que vale sozinha (sem fiar um fluxo para usá-la), e até
onde a criação de screens vai — resposta do usuário: até **app builder**,
com o assistente ajudando a construir.

## 2. A promessa

1. **Standalone**: uma screen declarada pode ser aberta e usada direto da
   galeria e por **link mandável** (ex.: `#/tela/s/<id>` — toda porta é
   URL). Quem abre vê os blocos, preenche, e o acionador (bloco `acao`,
   110-D17) entrega a saída ao destino configurado.
2. **App builder, por etapas**: o conjunto de blocos da 110-C é o CHÃO, não
   o teto. A evolução declarada: mais blocos (tabela/lista de dados,
   imagem, seções), encadeamento tela→tela sem canvas (a aresta implícita),
   e — quando o uso pedir — layout além da pilha. Cada degrau entra por
   medição de uso, nunca por especulação.
3. **Com apoio do assistente**: criar e editar screens (e fluxos) por
   CONVERSA — *"faz uma tela de aprovação de despesa com valor, motivo e
   botão de aprovar"* → o assistente propõe a `TelaDeclarada` (e a fiação,
   se pedida) como PROPOSTA aplicável, no molde do que a casa já faz (o
   assistente ✦ propõe diagramas na mesa; `SugerirComIa` propõe papéis):
   **nada é aplicado sozinho** — a pessoa vê, ajusta e aceita. O preview do
   editor (110-C) é onde a proposta aparece viva.

## 3. O desenho provável (validar contra a 110 implementada)

- **Standalone = fluxo implícito de um nó.** Rodar a screen cria uma
  execução cujo plano é só o nó de tela — reusando TUDO da 110-B
  (`aguardando-tela`, renderizador, continuar/retornar, histórico).
  Nenhum motor novo. Se a 110-B mudar esse contrato, esta SPEC muda junto.
- **O destino da saída é da screen**: `aoAvancar` na `TelaDeclarada`
  apontando um componente de efeito (os mesmos do canvas: `pdca-feedback`,
  `config-propor-ajuste`, um conector do catálogo…). Sem destino, o
  Avançar grava só o histórico — e a tela DIZ isso, não finge entrega.
- **O assistente-construtor** reusa a infraestrutura existente de proposta
  (conversa → JSON estruturado → prévia → aplicar): a saída é o documento
  `TelaDeclarada`/`Fluxo` validado pela MESMA validação de escrita
  (SPEC-35) antes de qualquer prévia — proposta que não valida volta ao
  assistente com o erro nomeado, não à pessoa. Dublê determinístico do
  gateway falso cobre os E2E, como sempre.
- **O caso de estreia é o PDCA**: a screen de feedback (exemplo vivo da
  110-C/F) aberta por link mandável, sem fluxo.
- **Permissão**: quem pode ABRIR uma screen standalone é decisão desta SPEC
  (por time? por papel? link público NÃO — sessão continua obrigatória),
  tomada com o RBAC real na mesa.

## 4. Fronteiras (revisadas)

- ~~"Não é um app builder"~~ — **caiu por decisão do usuário**; é o norte,
  atingido por degraus medidos (§2.2). O primeiro degrau continua sendo os
  blocos da 110-C.
- Não fura as invariantes: efeitos passam pelos componentes nomeados
  (110 D11/D13) — screen standalone e proposta do assistente não ganham
  poderes que o fluxo não tem; aplicar proposta passa pela validação de
  escrita SEMPRE.
- Sem link público/anônimo nesta SPEC.
- O assistente PROPÕE, a pessoa aplica — a régua de toda IA da casa (§5.5,
  SPEC-39) vale aqui sem exceção.

## 5. Quando

Depois da SPEC-110 fatias B, C e H mergeadas — o standalone e o
assistente-construtor podem vir em fatias separadas (o standalone é menor;
o assistente-construtor pede medição da infra de proposta da conversa
antes de detalhar). Configurações nas devidas bases e apresentação no
"Como usar" seguem as regras D18/D19 da 110.
