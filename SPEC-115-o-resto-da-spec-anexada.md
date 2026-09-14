# SPEC-115 — O resto da spec anexada: derivação, experiência com mock, e o gate na tela certa

> **Origem:** o usuário, testando o botão "Anexar spec aos itens" já corrigido
> (SPEC-114 + o fix do payload vazio):
>
> > *"apareceu o botão, e eu disse que queria mudar a terminologia, os
> > tradeoffs podem ser mapeados conforme eu já disse."*
> >
> > *"eu não tenho o endpoint de subidas dos itens acessível ainda aqui, mas
> > precisamos de tela e experiências prontos, usar algum mock com delay de 20
> > segundos."*
> >
> > *"o botão de exportar fica desabilitado, mas isso não faz sentido já que
> > eu posso chegar nessa tela, então acredito que a validação deveria ficar
> > na tela anterior."*
>
> Pedido explícito: **levantar o que falta numa spec, para implementar numa
> conversa nova** — esta SPEC não implementa nada, só mapeia.

---

## 1. Três frentes, e por que não são uma só

### 1.1 Trade-offs/Riscos derivados — mais barato do que parecia

A SPEC-114 já tinha adiado a troca do rótulo "escrito por uma pessoa" porque
ela dependia do fluxo de mapeamento de contexto (SPEC-75) e do assistente
expandido — nenhum dos dois construído ainda. **Medindo agora, a dependência
é menor do que a escrita anterior presumiu.**

`Decisao` (`packages/engine/src/model/types.ts:226`) já é praticamente o
material de um trade-off, sem precisar de conversa nova nenhuma:

```
titulo · contexto · alternativas: {titulo, consequencia?}[] · escolhida · porque
```

**A alternativa NÃO escolhida + a consequência dela é literalmente "o que se
perdeu"; a escolhida + o porquê é "o que se ganhou".** Isso já existe hoje,
por nó/aresta da mesa (`DecisoesDoNo.tsx`), e a quebra já carrega
`decisoes: Decisao[]`.

**Proposta**: `Trade-offs e o que ficou de fora` deixa de ser `SecaoEscrita`
em branco — vira uma lista derivada de `quebra.decisoes` (uma entrada por
decisão, "escolhi X em vez de Y porque Z"), com o texto livre atual
sobrevivendo como complemento OPCIONAL para o que nenhuma decisão registrada
cobre. `Riscos e o que pode dar errado` é candidato à mesma tese, mas usando
`RiscosMedidos`/`ensaios` (já existe abaixo da seção, mostrando débito
assumido) em vez de `Decisao` — a fonte é outra, o princípio é o mesmo.

**O que isso NÃO precisa esperar**: nem o mapeamento de contexto via
PowerShell, nem o assistente expandido (§1.3 da SPEC-75, ainda sem forma).
Aquele fluxo continua valendo para ALIMENTAR novas decisões — não para
exibir as que já existem.

**O rótulo**: com a seção passando a ter conteúdo DERIVADO por padrão, "escrito
por uma pessoa" deixa de ser verdade em geral — vira "derivado de N decisões,
mais o que você quiser complementar". O texto muda para algo como
*"derivado das decisões registradas — edite ou complemente"*, e só volta a
dizer "escrito por uma pessoa" no caso raro de zero decisões (mesmo texto de
hoje, como fallback).

### 1.2 A experiência de upload, com mock de 20s

*"não tenho o endpoint... mas precisamos de tela e experiências prontos."*

Isto é literalmente a **SPEC-98 fatia E** ("o feedback animado, sobre estado
persistido"), nunca implementada — e agora pode ser construída e DEMONSTRADA
sem depender de nenhum agente/MCP real.

**O precedente já existe no repositório**: o "modo sem custo" (SPEC-74) já
tem um dublê determinístico que simula latência e resposta sem gastar
tokens, e `packages/gateway-falso` já é um pacote inteiro dedicado a simular
o outro lado de uma integração em teste. A peça que falta é um MODO
equivalente para o destino de `specDoItem` (e, por extensão, `itens`):

- Um adaptador `criarAnexadorDeSpecComAtraso` (ou uma flag no adaptador via
  gateway existente) que espera ~20s e devolve sucesso determinístico —
  usável em DEV/demo sem endereço real configurado.
- A tela precisa do pipeline por item que a SPEC-98 §3.2 desenhou (história
  ✓ → id ✓ → spec ⏳ → spec ✓), com o estado **persistido** (sobrevive a F5,
  não é estado de componente) — hoje o `resultadoDoAnexo` é só estado local
  do React, perdido ao trocar de tela.
- Animação: em que item está, o que já chegou marcado, quanto falta —
  regra do §5 da SPEC-98 (movimento com informação, nunca barra de
  progresso fingida).

**O que esta fatia RECUSA**: fingir que o mock é o comportamento real em
produção. O destino "com atraso" precisa aparecer marcado na tela de
configuração como o que é — um modo de demonstração — a mesma disciplina que
o "modo sem custo" já aplica em `ModeloIaTab.tsx`.

### 1.3 O gate do "pronto pra exportar" muda de tela

*"o botão de exportar fica desabilitado, mas isso não faz sentido já que eu
posso chegar nessa tela — a validação deveria ficar na tela anterior."*

**Diagnóstico**: hoje `SecaoDosItens` desabilita "Exportar prontos" quando
`prontos === 0`, mas nada na jornada IMPEDE chegar ao Documento com itens
cheios de `✍️ especificar`. O resultado é uma pessoa encontrando um botão
morto sem saber por quê — o mesmo defeito de fundo que a SPEC-73 já resolveu
para lacuna CONTADA; aqui a lacuna existe, só que anunciada tarde demais.

**Duas formas de corrigir, e a diferença é onde a régua mora:**

| Opção | O que muda | Risco |
|---|---|---|
| **A — bloquear a navegação** | Documento só é alcançável com os itens prontos (revisão completa antes de avançar) | Pode frustrar quem só quer LER o documento sem exportar nada ainda |
| **B — a revisão avisa antes de sair** (recomendado) | Nada é bloqueado; a tela de revisão mostra, antes do link "Ir ao documento", quantos itens ainda pedem atenção — e o Documento mantém o botão desabilitado, mas agora **com o motivo à vista**, não mudo | Preserva o caminho de "só ler"; a régua da SPEC-71 (motivo sempre visível) resolve o "não faz sentido" sem fechar porta |

**Recomendação: opção B.** Fechar a porta (opção A) contradiz o próprio
histórico do produto — o §269 (JOURNEY) fez o documento **alcançável cedo**
de propósito, exatamente para responder "e o porquê disso tudo" antes da
revisão terminar. Bloquear voltaria atrás nisso. O ajuste é dizer o motivo
onde a pessoa já está, não impedir que ela chegue lá.

## 2. O que esta SPEC RECUSA

- **Reabrir o mapeamento de contexto via PowerShell/assistente expandido**
  (SPEC-75 §1.2 continua em aberto, sem workflow construído) — a derivação
  de trade-offs (§1.1) não depende disso.
- **Apresentar o mock de 20s como o comportamento real.** Precisa estar
  marcado como demonstração, sempre.
- **Bloquear a navegação ao Documento** (opção A do §1.3) — a régua histórica
  do produto (§269) já decidiu o contrário, por um motivo bom.

## 3. Fatias, para a conversa que implementa

- **A — Trade-offs derivados de `Decisao`.** Lista renderizada a partir de
  `quebra.decisoes`, com o texto livre como complemento. Prova: uma quebra
  com 2 decisões e nenhum texto livre mostra 2 linhas, não a caixa vazia
  "escrito por uma pessoa".
- **B — Riscos derivados de ensaios/débito assumido.** Mesma tese, fonte
  `RiscosMedidos`/ensaios. Prova análoga.
- **C — o rótulo muda de texto conforme a origem** (derivado × fallback
  manual quando não há nada para derivar).
- **D — o adaptador com atraso simulado** para `specDoItem` (e candidatável
  para `itens`), marcado como modo de demonstração na tela de configuração.
- **E — o pipeline por item, persistido.** Estado sobrevive a F5; a tela lê
  de onde parou, não recomeça.
- **F — a animação sobre o pipeline** (SPEC-98 §5): em que item está, o que
  já chegou, quanto falta.
- **G — o motivo do "Exportar" desabilitado fica visível na tela de
  revisão**, antes de ir ao documento — não um bloqueio, um aviso.

## 4. Perguntas em aberto para quem implementar

1. **Riscos deriva de ensaios OU de uma nova categoria de `Decisao`
   marcada como risco?** Não medido — vale olhar o que `RiscosMedidos` já
   mostra hoje antes de escolher.
2. **O adaptador com atraso é um destino novo (`operacao` extra) ou uma
   flag no destino existente?** Repetir a régua da SPEC-74 antes de decidir.
