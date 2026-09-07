# SPEC-111 — Screens standalone: rodar uma tela sem fluxo, direto da galeria

> **Status: REGISTRADA, não detalhada.** Depende da SPEC-110 (fatias B, C e
> H) implementada — as decisões finas daqui devem ser tomadas COM as lições
> daquelas fatias na mão, não antes. Este registro existe a pedido do
> usuário: a evolução foi anotada na 110 e ele respondeu *"entendo que
> então precisamos registrar a spec para isso"*.

## 1. De onde ela vem

A SPEC-110 decide (D14/fatia H) que screens moram na galeria e RODAM dentro
de fluxos (o stage da fatia B). A pergunta que ficou: e a screen que vale
sozinha — um formulário de feedback, uma consulta pronta, um checklist —
sem o usuário precisar fiar um fluxo para usá-la?

## 2. A promessa

Uma screen declarada pode ser **aberta e usada direto da galeria** (e por
**link mandável**, ex.: `#/tela/s/<id>` — a régua da casa: toda porta é
URL). Quem abre vê os blocos, preenche os campos, e o Avançar ENTREGA a
saída para um destino configurado na própria screen.

## 3. O desenho provável (validar contra a 110 implementada)

- **Standalone = fluxo implícito de um nó.** Rodar a screen cria uma
  execução cujo plano é só o nó de tela — reusando TUDO da 110-B: o estado
  `aguardando-tela`, o renderizador, continuar/retornar, histórico em
  `fluxo_execucoes`. Nenhum motor novo; é açúcar de galeria por cima do que
  existe. Se a 110-B mudar esse contrato, esta SPEC muda junto.
- **O destino da saída é da screen**: um campo `aoAvancar` na
  `TelaDeclarada` apontando um componente de efeito (os mesmos do canvas:
  `pdca-feedback`, `config-propor-ajuste`, um conector do catálogo…). Sem
  destino, o Avançar grava só o histórico — e a tela DIZ isso, não finge
  entrega.
- **O caso de estreia é o PDCA**: a screen de feedback (exemplo vivo da
  110-C/F) aberta por link mandável, sem fluxo — qualquer pessoa do time
  registra feedback de onde estiver.
- **Permissão**: quem pode ABRIR uma screen standalone é decisão desta SPEC
  (por time? por papel? link público NÃO — sessão continua obrigatória),
  tomada com o RBAC real na mesa.

## 4. Fronteiras (já decididas)

- Não é um app builder: continua sendo os blocos da 110-C (texto/dado/
  campo). Layout livre, rotas próprias por screen, temas por screen — não.
- Não fura as invariantes: efeitos passam pelos componentes nomeados
  (110 D11/D13) — screen standalone não ganha poderes que o fluxo não tem.
- Sem link público/anônimo nesta SPEC.

## 5. Quando

Depois da SPEC-110 fatias B, C e H mergeadas — e com uma medição de uso da
galeria antes de detalhar (a 110-H entrega o "testar" no card; se ninguém
sentir falta do standalone, esta SPEC espera).
