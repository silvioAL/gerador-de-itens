# SPEC-47 — O item escrito de verdade: template próprio e entrega final

> Origem (§196): "essa tela ainda está longe da minha expectativa, gostaria
> de ver os itens estruturados com a escrita real... conforme um
> template/prompt configurado... e esse template precisa ter a entrega final
> no fim de cada item".

## 1. O que estava errado

- A tela `#/itens` mostrava **títulos e chips**; o texto ficava atrás de um
  "Ver corpo" colapsado, em `<pre>` cru. Quem vai executar o item precisa
  ler o item.
- Só o DOCUMENTO tinha template. O corpo de cada item era estrutura fixa no
  código: mudar ordem, título de seção ou acrescentar uma seção exigia
  recompilar.
- Nenhum item dizia **o que fica pronto quando ele termina**. O texto
  descrevia o trabalho e parava no cenário de teste.

## 2. O que muda

1. **Template do ITEM** (`tipo: "item"` na mesma tabela do template do
   documento, migração 0028): `{{rotulo}}`, `{{historiaUsuario}}`,
   `{{especificacaoTecnica}}`, `{{refinamentoTecnico}}`,
   `{{criteriosAceite}}`, … e **`{{entregaFinal}}`**. Seção com conteúdo
   vazio some inteira, título junto — cabeçalho órfão é ruído.
2. **Entrega final** vira placeholder de refinamento (`_entregaFinal`),
   como história e critérios: a esteira escreve, o humano confirma, e o
   documento fecha cada item com o entregável.
3. **A tela mostra a escrita**: o corpo aparece por padrão, lido como texto
   (títulos, listas, negrito, blocos de código), não como markdown cru.
   Recolher é que passou a ser sob demanda.
4. A área "Especificação de solução" ganha os dois templates lado a lado —
   documento e corpo do item —, cada um com a sua régua de validação.

## 3. Feito quando

1. O item na tela sai do template e termina na entrega final.
2. Trocar o template do time muda a escrita dos itens (ordem e títulos).
3. Mordida no marcador da entrega final; E2E e smoke no bundle.
