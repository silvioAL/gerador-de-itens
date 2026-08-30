# SPEC-86 — O eixo do produto nas regras

> **Origem:** o usuário, na rodada da SPEC-83:
>
> > *"quanto a 'afirmar organização de checklist por domínio de negócio', na
> > realidade acho que o que tem é checklist por processo, mas uma das demandas
> > que precisamos atender também é estender para produto."*
>
> A SPEC-83 §10.5 apostou que isto seria a SPEC-84. A SPEC-84 virou *a porta da
> spec*, e a demanda ficou órfã por duas rodadas. Está registrado, e é por isso
> que esta SPEC existe.

## 0. A medição

### 0.1 O checklist é escopado por processo, e o usuário está certo

`RegrasConfig` (`engine/src/config/types.ts:503`) tem quatro eixos, e nenhum é
produto:

| Eixo | Onde | O que ele responde |
|---|---|---|
| tech | `porTech: Record<string, RegrasPorTech>` | "isto vale para Backend" |
| contexto | `Requisito.contextos` | "…quando o nó é de checkout" |
| nó | a condição por tipo de componente | "…e o componente é uma fila" |
| percurso / forma | `percursos`, `forma` | as réguas que atravessam techs |

`RegrasPorTech` carrega `checklistTecnico`, `checklistProcesso`, `testes` e
`volumetria`. **É tudo processo de construção.** Nada ali sabe se a demanda é da
vitrine pública ou do backoffice interno.

### 0.2 A escada já existe, e tem dois degraus

`configEmPostgres.ts:35-41`:

```ts
async obter(chave, timeId) {
  if (timeId && timeId !== CAMPO_GLOBAL) {
    const doTime = await buscar(chave, timeId);
    if (doTime) return doTime;
  }
  return buscar(chave, CAMPO_GLOBAL);
}
```

E `casos-de-uso/config.ts:96` completa com o template. A escada de hoje é
**time → global → template**, e ela é de **documento inteiro**: um time com
documento próprio não vê mais o global.

O índice que a SPEC-83 apontou como bloqueio é
`uniqueIndex("config_documentos_chave_unica").on(t.chave, t.timeId)`
(`schema.ts:460`). O precedente de como se mexe nele é a migração **0028**, que
fez `especificacao_templates` virar `(time_id, tipo)`.

### 0.3 O elo com o produto já está pronto do outro lado

`Quebra.produtoId` existe (`types.ts:502`), e a SPEC-77 já construiu a escada de
herança produto → demanda para volumetria. Não falta modelo: falta o eixo nas
regras.

## 1. A decisão que define esta SPEC: **soma, não substituição**

É a pergunta que muda tudo, e a resposta não é a mesma do degrau `time → global`.

Aquele degrau **substitui**: um time com regras próprias não vê as da casa. Faz
sentido lá, porque as duas respondem à mesma pergunta — *"como este time
refina?"* — e duas respostas para uma pergunta é ambiguidade.

Aqui não é a mesma pergunta:

- o checklist do **time** responde *"como se constrói software nesta casa"* —
  DLQ configurada, idempotência, plano de migração, ciclos de teste;
- o checklist do **produto** responde *"o que é verdade sobre ESTE produto"* —
  a vitrine é pública, então acessibilidade e SEO se conferem; o backoffice
  processa dado sensível, então trilha de auditoria se confere.

**Um não substitui o outro: os dois valem.** Um produto que declarasse regras e
com isso perdesse as do time estaria pior do que antes — e é exatamente o
congelamento que o §306 mediu no `PipelineAgentesTab` (herdado copiado vira
cópia morta que para de acompanhar a evolução do original).

> **Consequência declarada:** o eixo do produto **não** entra por
> `configEmPostgres.obter`, que é substituição por construção. Ele é um documento
> próprio, somado na resolução. Enfiá-lo na escada existente seria reusar o
> mecanismo errado porque ele estava ali.

## 2. A régua da SPEC-77, aplicada onde ela vale

*"Declarado vence derivado, e a frase diz de onde o número veio"* (§306) vale
para **conflito**, e conflito aqui só existe num caso: o produto declara um
requisito com a **mesma chave** de um do time.

Nesse caso, e só nesse: o do produto vence, **e a tela diz que venceu**. Fora
dele, somam.

E a régua irmã, a que a SPEC-77 aprendeu na tela: **herdado não é salvo como
cópia enquanto ninguém edita.** O produto guarda só o que é dele. O que vem do
time continua vindo do time, e evolui com ele.

## 3. O que esta SPEC RECUSA

- **Substituir o checklist do time pelo do produto.** §1.
- **Um terceiro tipo de checklist.** `checklistTecnico` e `checklistProcesso` já
  existem e já sabem condicionar por contexto e por nó. O que muda é **de onde o
  item vem**, não o que ele é.
- **Herança entre produtos.** Produto-pai, linha de produto, família. Não temos
  medição de que exista, e é a porta para uma árvore de resolução que ninguém
  consegue depurar.
- **Produto como novo eixo de `porTech`.** Seria `Record<tech, Record<produto,
  …>>` — a explosão combinatória que torna a config impossível de ler. O produto
  é um documento à parte que **soma**, não uma dimensão dentro do outro.

## 4. Fatias

- **A — a resolução, e ela é função pura no engine.** `regrasEmVigor(doTime,
  doProduto)` devolve as regras somadas **com procedência por item**
  (`origem: "time" | "produto"`). Um dono só (§263): a tela, a derivação e o
  documento precisam da mesma resposta. Prova: item do produto e do time somam;
  item com a mesma chave, o do produto vence e a procedência diz isso; sem
  produto, a saída é **idêntica** à de hoje — comparação do objeto inteiro, não
  por trecho, porque é a garantia de que nada muda para quem não usa o eixo.
- **B — o lugar de guardar.** Migração **0040**: `config_documentos` ganha
  `produto_id` (nulo = o documento de sempre) e o índice único passa a ser
  `(chave, time_id, produto_id)`, no molde da 0028. Porta, adaptador e caso de
  uso alcançam o campo — **sem** mexer na escada de substituição, que continua
  fazendo o que fazia.
- **C — a borda e a tela.** `RegrasTab` ganha o seletor de produto e a marca de
  procedência por item, no molde de `PipelineAgentesTab.tsx:296-330`
  (`preambulo-herdado-*`). O que veio do time aparece, marcado e **não
  editável ali** — editar regra de time é na tela do time, e duas portas para o
  mesmo arquivo é o §263.
- **D — a prova de que o herdado não congela.** O teste que a SPEC-77 já tem em
  `PipelineAgentesTab.test.tsx:144`, na versão deste eixo: mudar a regra do time
  **muda** o que o produto vê, enquanto ninguém declarou nada por lá. É a fatia
  que impede esta SPEC de criar o defeito que ela existe para evitar.

## 5. Perguntas em aberto

1. **A demanda sem produto.** `Quebra.produtoId` é opcional. Uma demanda sem
   produto vê só o checklist do time — que é o comportamento de hoje, e está
   certo. Fica dito para ninguém achar que é buraco.
2. **Quem pode editar o checklist do produto?** O RBAC hoje escopa por time
   (`primeiroRecursoNegado(..., timeId)`). Escopar por produto é pergunta de
   permissão, e não temos medição de que a casa queira separar. Esta rodada
   mantém a permissão de `regras`, e diz isso em voz alta.
