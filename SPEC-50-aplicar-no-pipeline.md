# SPEC-50 — O ajuste alcança a esteira de agentes

> Continuação da SPEC-46: o "aplicar automático" só existia para `regras`;
> os outros documentos respondiam 409 e exigiam editar à mão. O pipeline de
> agentes é o próximo mais citado no feedback real ("esse papel sobra nos
> meus itens", "ninguém escreveu a seção X").

## 1. As operações

`OperacaoDeAjuste` ganha `ativar-papel` / `desativar-papel`. Como agora há
mais de um documento alvo, nasce `recursoAlvoDaOperacao(op)` — é ele que
decide **onde aplicar** e **quem aprova**:

| Alvo | Aplicação | Gate RBAC |
|---|---|---|
| `regras` | `aplicarOperacao` (por seção) | dono da seção (SPEC-28/46) |
| `pipeline-agentes` | `aplicarOperacaoNoPipeline` | `pipeline-agentes` |

O rótulo do pedido não manda mais: quem manda é a operação. Um ajuste de
papel vai pro dono do pipeline mesmo que o pedido tenha nascido marcado
como "regras".

## 2. A prévia é outra pergunta

Para regras, a prévia mostra o item de exemplo mudando. Para a esteira, o
texto do item não muda — muda **quem o escreve**. A tela diz isso: "o papel
X para de escrever: a seção dele fica sem dono e os campos chegam em
branco", com a lista dos papéis e a marcação do que muda, e o aviso de que
vale da próxima geração em diante.

## 3. Feito quando

1. Desligar/ligar papel vira solicitação, aprova e **aplica** no documento.
2. O gate é do dono do pipeline — com teste que morde.
3. A prévia do pipeline explica o efeito sem prometer mudança no texto.
