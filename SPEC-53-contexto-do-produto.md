# SPEC-53 — Contexto do produto: o que a ferramenta nunca soube

## 1. O problema

Todo item gerado nasce sem saber **de que produto está falando**.

O que hoje parece contexto e não é:

| O que existe | O que realmente é |
|---|---|
| `demandInfo` + `anexosContexto` | Contexto **da demanda**: colado a cada épico, morre com a quebra |
| `contextos` (ex.: `Backend-mensageria`) | Tag **técnica** que filtra checklist |
| Perfil/stacks conhecidas | **Tecnologia** por componente |

Nenhum guarda o que o produto **é**: o objetivo, o vocabulário do domínio, quem
usa, as regras de negócio que valem sempre, os sistemas com que ele conversa,
as restrições que não se negociam.

O efeito aparece em `montarPedidoPipeline`: o agente recebe `contextoEpico` — o
texto daquela demanda — e nada mais. Quem usa a ferramenta acaba recolando a
mesma explicação de produto em toda demanda (e ela envelhece em cada cópia), ou
não cola, e o item sai tecnicamente correto e genérico de negócio.

## 2. A decisão de modelagem

**Produto é entidade própria**, não um campo do time.

Um time atende vários produtos e um produto atravessa times — a mesma lição da
SPEC-42, quando "time" e "stack" estavam misturados e a tela pedia para
escolher stack como se fosse identidade do time. Repetir a fusão aqui
("contexto do produto = contexto do time") criaria a mesma confusão de novo,
uma abstração adiante.

E a recíproca, que o usuário deixou explícita: **produto e checklist de
processo são abstrações diferentes**. Nada de mudar as regras de refinamento
para "regras por produto". O produto pode *entrar* no checklist como **eixo de
aplicabilidade** — do mesmo jeito que `contextos` já é hoje — mas nunca
substituindo a costura existente. Isso é a Fase 3, e é opcional por item.

## 2.1 "Mas `produto` já não tinha saído do modelo?"

Saiu, no §21 — e a decisão continua certa. O que saiu era `Quebra.produto` /
`Atividade.produto`: um campo de **texto solto**, preenchido em quatro pontos
de `derivar.ts` e **nunca lido** por `exportar.ts` nem por `gerarPacote.ts`. O
próprio código confirmava a queixa da época: informação do épico vazando pro
item, sem ninguém consumir.

O que entra agora é o oposto em todos os eixos: entidade com conteúdo próprio,
mantida fora da demanda, e cuja razão de existir é justamente **ser lida** —
pelo prompt dos agentes (Fase 2), pelo documento e pela tela. Se a Fase 2 não
acontecer, esta SPEC recria o defeito do §21 com outro nome; é por isso que ela
não é opcional, e por isso que a Fase 1 sozinha não fecha nada.

## 3. O que o contexto do produto guarda

Um conjunto pequeno e fixo de seções, escolhidas por quanto mudam a escrita de
um item. Fixo, e não configurável: uma "configuração de quais seções o contexto
tem" seria uma camada a mais para resolver um problema que ninguém tem ainda —
e o produto já tem configuração demais para quem chega.

- **O que é / objetivo** — um parágrafo. Sem isso, o agente inventa a razão de ser.
- **Quem usa** — personas e seus objetivos.
- **Glossário** — termo → definição, estruturado. É a seção que mais muda a
  qualidade: "portabilidade", "fatura", "carteira" significam coisas diferentes
  em cada casa, e é onde o item genérico se denuncia.
- **Regras de negócio que valem sempre** — lista.
- **Sistemas e integrações** — com quem esse produto conversa e para quê.
- **Restrições** — regulatório, compliance, contratos.

Todas em texto livre, menos o glossário (par termo/definição): estrutura só
onde ela paga.

## 4. Fases

### Fase 1 — O produto existe
Tabela `produtos` (escopo da organização), vínculo N:N com times, `produtoId`
na quebra, RBAC com recurso próprio (`produtos`), tela no menu e seleção do
produto na demanda. Produto é opcional: quebra sem produto continua funcionando
exatamente como hoje — a ferramenta não pode passar a exigir cadastro para
fazer o que já fazia.

### Fase 2 — O contexto chega em quem escreve
O contexto do produto entra no prompt do pipeline **antes** do contexto da
demanda (o geral antes do específico), na especificação gerada e na tela, com o
mesmo cuidado de janela que os anexos já têm. Aqui é onde o valor aparece: o
item deixa de ser genérico de negócio.

### Fase 3 — O contexto se mantém vivo, e o produto entra no checklist
Duas coisas que só fazem sentido depois das duas primeiras:
- O contexto do produto vira alvo do PDCA — feedback ("o agente não sabe o que
  é uma fatura em aberto") vira operação estruturada, com prévia e aplicação,
  exatamente como as regras e a ficha.
- Itens de checklist ganham `produtos?: string[]` como filtro opcional, ao lado
  de `contextos`. Vale para qualquer seção — inclusive processo — sem fundir as
  duas abstrações: o item continua morando onde mora, e o produto só decide
  **quando** ele aparece.

## 5. O que esta SPEC não faz

- Não mexe em `RegrasConfig.porTech`. A costura "todo checklist pendurado numa
  tech" é uma limitação real para conteúdo de processo e de negócio, mas é
  outra conversa — e resolvê-la de carona no produto seria misturar
  exatamente o que se decidiu não misturar.
- Não gera contexto de produto sozinha a partir do diagrama. O assistente pode
  ajudar a redigir (como já ajuda no resto), mas quem afirma o que o produto é
  são as pessoas.
