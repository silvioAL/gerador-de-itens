# SPEC-20 — Dois checklists: processo e técnico, com condição por nó

**Depende de/relacionado a:** SPEC-19 (alinhamento com o agente validador — foi ao trazer a dimensão de habilitação de teste que a mistura ficou visível), SPEC-18 (campo `type: "lista"`, que o operador `listaContem` lê), SPEC-01 §6 (os operadores de condição originais).

**Status: implementado.**

---

## 1. Por que agora

Depois de SPEC-19 §6 (habilitação de teste), o usuário nomeou o incômodo de fundo:

> *"eu sinto que falta um nível de abstração no sistema, a parte de configurações hoje é a que mais me incomoda, algo como checklists de processo e checklists técnicos (mais ou menos o que já existe, mas de forma mal expressa...). No checklist de processo também seria possível vincular a uma condição (ex: se componente é serviço — ou até mais de uma, como alteração de endpoint ou novo endpoint)."*

Ele estava certo, e havia uma razão dura por trás do "mal expressa" que eu mesmo tinha criado na rodada anterior: SPEC-19 §6 colocou "Configurar mock", "Levantar massa de teste" e "Especificar serviços a repontar" dentro de `requisitos`, renderizado como **"Requisitos de refinamento técnico"**. Mas o próprio padrão do agente validador (SPEC-19 §1) lista, sob *"O QUE NÃO SÃO"*:

> ❌ Atividades de teste (teste E2E, teste funcional, etc.)

Ou seja: eu tinha resolvido a falta de uma dimensão criando uma violação de contrato. Separar os dois checklists não é organização estética — é o que deixa a seção "Requisitos de refinamento" **correta** perante o padrão externo.

## 2. A distinção

| | pergunta que responde | exemplo | formato |
|---|---|---|---|
| **Checklist técnico** (`checklistTecnico`) | o que precisa ser **decidido/especificado** no desenho | "Definir estratégia de retry e DLQ" | `- texto <- ✍️ especificar` |
| **Checklist de processo** (`checklistProcesso`) | o que o time precisa **fazer** pra executar/testar | "Configurar mock com cenários de sucesso e erro" | `- [ ] texto` |

O formato difere de propósito. O marcador `<- ✍️ especificar` é contrato externo e vale só pra "Requisitos de refinamento"; item de processo é coisa pra **marcar como feita**, então `- [ ]` — que é justamente o formato que SPEC-19 §3 removeu do checklist técnico por proibição do Confluence. Cada um no seu lugar, sem conflito.

## 3. Modelo

`RegrasPorTech.requisitos` foi **renomeado** para `checklistTecnico` (rename puro, sem mudança de comportamento — serve o "mal expressa": os dois campos agora são simétricos e auto-descritivos). Novo:

```ts
export interface ItemProcesso {
  texto: string;
  contextos: string[];        // mesmo casamento parcial do técnico
  when?: Condicao;            // avaliado contra os nós de origem da atividade
}

export interface RegrasPorTech {
  checklistTecnico: Requisito[];
  checklistProcesso?: ItemProcesso[];
  testes: TesteAutomatizado[];
  volumetria?: { contextos: string[] };
}
```

## 4. Dois operadores de condição novos

`Condicao` tinha sete operadores e ganhou dois — não por gosto, mas porque o checklist de processo precisa condicionar por coisas que campo de nó nunca precisou:

- **`{ nodeType: string[] }`** — *"se componente é serviço"*. Num `FieldSpec.when` o tipo de nó é implícito (o campo vive dentro de um tipo); num item de processo, que se aplica a vários tipos, não é. Não dava pra expressar via contexto: `service` tem `contextos: []` em `diagrama.example.json`, ou seja, não existe contexto que signifique "é um serviço".
- **`{ listaContem: { field, sub, equals } }`** — *"novo endpoint"* vs *"alteração de endpoint"*. Olha dentro de um campo `type: "lista"` (SPEC-18) e satisfaz se **algum** item tiver o sub-campo com o valor pedido. Sem isso não dá pra distinguir "este serviço expõe um endpoint novo" de "altera um existente" — que é trabalho diferente (publicar contrato novo vs. avisar consumidores atuais).

Combinação continua sendo `allOf`/`anyOf`/`not`, que já existiam — o *"ou até mais de uma"* do pedido não precisou de nada novo.

## 5. A decisão que faltava: qual nó avaliar numa atividade de aresta

Era o bloqueio que fez esse mecanismo ficar fora de escopo em SPEC-19: uma `Atividade` de aresta tem **dois** nós de origem (quem chama e o que é usado), então "avalie o `when` contra o nó" é ambíguo.

**Regra escolhida: satisfaz se ALGUM dos nós de origem satisfizer** (`.some()`), a mesma régua do casamento de contexto. Exigir os dois perderia caso legítimo — numa aresta `service → external`, "confirmar ambiente de teste do provedor" é relevante por causa do `external`, e o `service` nunca satisfaria.

**Trade-off aceito e conhecido:** isso super-inclui em alguns casos. Na validação real, a atividade *"srv-credito-api usa a validação de regra-limite-endividamento"* recebeu tanto "publicar contrato do endpoint novo" (do `service`, source) quanto "abrir demanda de configuração do parâmetro" (da `rule`, target) — o primeiro é discutível ali. Escolha deliberada: num checklist, super-incluir é mais seguro que sub-incluir (dá pra desmarcar um item que apareceu; não dá pra agir num que nunca apareceu), e é coerente com "nada vira verde sem alguém olhar".

**Sem nó de origem, item condicionado não aparece.** Condição que não dá pra avaliar não é assumida como verdadeira — mesma disciplina.

`gerarChecklistProcesso(regras, techs, contextos, nos, arestas)` recebe os nós; `renderizarItemEspecificacao` já computava `nosDeOrigem(atividade, diagrama)`, então não houve cálculo novo.

## 6. Config

`config/regras.example.json` (+ mirror `packages/cli/templates/regras.json`): 27 itens técnicos, 11 de processo (4 condicionados), Mobile com 1 de processo. Os 4 condicionados cobrem exatamente os exemplos do pedido, mais a pergunta *"será possível fazer testes integrados?"* que o usuário levantou em SPEC-19:

| item | condição |
|---|---|
| Publicar o contrato do endpoint novo (OpenAPI/Swagger) | `service` **e** algum endpoint com `action: "novo"` |
| Avisar consumidores atuais e combinar janela de mudança | `service` **e** algum endpoint com `action: "alterar"` |
| Confirmar se o provedor tem ambiente de teste; sem ele, o integrado depende de mock | `external` |
| Abrir a demanda de configuração do parâmetro nos ambientes | `rule` ou `fico` |

## 7. Validação

`validateRegras` valida contexto de `checklistProcesso` igual ao técnico. O `when` **não** é validado: diferente de `FieldSpec.when` (que vive dentro de um tipo de nó e tem as chaves do `spec` pra conferir `field`), um item de processo se aplica a vários tipos — não há um conjunto único de chaves contra o qual validar. Limitação conhecida, documentada no código.

Testes: 7 novos em `gerarRefinamento.test.ts` (formato `- [ ]` sem o marcador; item sem `when`; `nodeType` incluindo e excluindo; `listaContem` com e sem o valor; a regra do `.some()` na atividade de aresta; sem nó de origem). Suíte do engine: 105 verdes.

Validação com dado real (`gerador init` + `implementar` sobre `credito-completo`, 14 itens, lendo a saída): "Requisitos de refinamento técnico" ficou só com decisões de desenho; "Checklist de processo" apareceu como seção própria com `- [ ]`; os condicionados dispararam certo — contrato de endpoint novo só onde há `action: "novo"`, ambiente do provedor só no nó `external`, demanda de parâmetro só em `rule`/`fico`.

## 8. Fora de escopo, identificado

**Forms de conexão.** O usuário citou *"parte de configurar forms das conexões"* entre o que incomoda na configuração. Confirmado como lacuna real: `edgeTypes` em `diagrama.json` só tem `label`/`color`/`verbo`/`tamanhoPadrao` — **não tem `spec`**, diferente de `nodeTypes`. Uma aresta não pode carregar campo nenhum (qual endpoint é chamado, síncrono ou assíncrono, tem retry próprio), e o `EdgePanel` só deixa escolher o tipo. Não implementado nesta rodada; é um mecanismo à parte, do tamanho do que SPEC-18 foi para campos de nó.
