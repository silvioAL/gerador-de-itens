# SPEC-46 — O ajuste vale para as quatro seções das regras de refinamento

> Origem (§195): a jornada da SPEC-45 cobria só o checklist técnico. "O
> mesmo deve ser aplicável aos checklists de processo e requisitos de
> refinamento" — que é onde boa parte do feedback real mora ("sobrou o
> bloco de volumetria", "faltou repontar massa").

## 1. As quatro seções

`OperacaoDeAjuste` deixa de ser só checklist técnico:

| Seção | Operações | Forma |
|---|---|---|
| `checklistTecnico` | adicionar/remover item | texto + contextos |
| `checklistProcesso` | adicionar/remover item | texto + contextos |
| `testes` | adicionar/remover ciclo | tipo, validação, dev/hlg, contextos |
| `volumetria` | passar a exigir / deixar de exigir | contextos |

`secao` ausente = `checklistTecnico`: solicitação gravada antes desta fase
continua válida e aplicável (sem migração de dado).

## 2. O defeito que a extensão expôs

O gate de decidir/aplicar era **fixo** em `regras.checklistTecnico`. Com as
quatro seções isso mandaria todo pedido para o dono errado — e barraria
justamente quem cuida da seção. Agora o recurso RBAC vem da operação
(`secaoDaOperacao` → `SECOES_DE_REGRAS`), respeitando a delegação por seção
da SPEC-28.

## 3. Na tela

O estúdio ganha "Onde (a seção das regras de refinamento)"; os campos
seguem a seção (ciclo de teste pede o que valida e os ambientes; volumetria
não tem texto por item, é liga/desliga). A prévia continua igual — o item
de exemplo já renderiza as quatro seções, então o efeito aparece no lugar
certo sem código novo.

## 4. Feito quando

1. As quatro seções propõem, preveem e aplicam.
2. Quem decide é o dono da seção — com teste que morde.
3. Pedido antigo (sem `secao`) continua aplicável.
