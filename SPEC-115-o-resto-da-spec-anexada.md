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

#### 1.1.1 ⚠️ Correção: o mapeamento/conversa com o agente é POR COMPONENTE — não da demanda inteira

> Pergunta do usuário, na revisão desta SPEC: *"colocou a parte de interagir
> com o agente, rodar scripts de mapeamento e interações nesse sentido quanto
> a um componente do desenho?"* **Resposta honesta: não — a primeira escrita
> desta SPEC deixou aquele fluxo inteiro como "ainda sem forma" (SPEC-75),
> sem essa dimensão.**

Isto muda a forma da fatia, e ela agora tem endereço próprio no código:
`DecisoesDoNo.tsx` já ancora `Decisao` num nó ou aresta específico via
`noId`/`arestaId` — não na demanda como um todo. A conversa de
aprofundamento (colar saída de script, discutir com o assistente, registrar
a decisão) faz mais sentido **dentro do painel do componente**
(`PropertiesPanel.tsx`, onde `DecisoesDoNo` já vive), não como uma conversa
solta no nível da demanda:

- A pessoa seleciona um componente (ex.: `srv-catalogo`).
- Cola a saída de um script de mapeamento relevante PARA AQUELE componente
  (ex.: o schema do banco que ele usa, as rotas que ele expõe).
- Conversa com o assistente sobre esse recorte especificamente — contexto
  menor, resposta mais precisa, menos chance de misturar decisões de
  componentes diferentes numa sopa só.
- O que sai vira `Decisao` com `noId` daquele componente — a mesma âncora
  que `DecisoesDoNo.tsx` já usa, sem estrutura nova nenhuma do lado do dado.

**Por que isso é melhor que uma conversa única da demanda inteira, e não só
diferente:** um desenho com 8 componentes discutidos na MESMA conversa
tende a produzir decisões cujo contexto se perde — "por que escolhemos fila
em vez de síncrono" precisa saber DE QUAL chamada, entre qual componente e
qual, para não virar uma frase genérica demais para ancorar em lugar nenhum.
Por componente, a pergunta chega já recortada.

**O que ainda fica em aberto, e continua sendo o bloqueio real da SPEC-75:**
a fronteira hospedado/local do script em si (resposta já dada: colar a
saída, sem execução automática) e o painel expansível do assistente (ainda
não desenhado). Esta correção só decide o ESCOPO da conversa (por
componente), não resolve o mecanismo de rodar scripts — isso continua sendo
trabalho da SPEC-75, agora com um alvo mais claro de onde a conversa mora.

**Isto não é periférico — é a tese do produto.** Confirmado pelo usuário na
revisão desta SPEC: *"a proposta do sistema é acelerar a construção de itens
e specs, então é natural e desejável poder iterar dessa forma com o
assistente e, com apoio dele, decidir por exemplo design patterns a
utilizar."* Isso muda a prioridade relativa das fatias: o painel expansível
do assistente, que a primeira escrita tratava como "gap registrado, rodada
própria" (§1.2 da SPEC-75), passa a ser pré-requisito direto de uma fatia
central, não um adiamento confortável.

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

- **Executar scripts de mapeamento automaticamente.** A fronteira decidida
  (SPEC-75) continua sendo colar a saída — nenhuma automação de execução
  entra aqui, nem por componente, nem por demanda.
- **Uma conversa única de mapeamento pra demanda inteira.** O §1.1.1
  corrige isso: é por componente, ancorada em `noId`/`arestaId`.
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
- **D — o modo de demonstração com atraso simulado.** Uma flag no destino
  existente (`specDoItem`/`itens`), não uma `operacao` nova — ver §4.2.
  Marcado como demonstração na tela de configuração, no espírito do "modo
  sem custo" (SPEC-74).
- **E — o pipeline por item, persistido.** Estado sobrevive a F5; a tela lê
  de onde parou, não recomeça.
- **F — a conversa de mapeamento por componente** (§1.1.1) — **prioridade
  alta, não periférica**: o usuário confirmou que isto é central à proposta
  do produto ("acelerar a construção de itens e specs... é natural e
  desejável poder iterar com o assistente e, com apoio dele, decidir por
  exemplo design patterns a utilizar"). Entrada no `PropertiesPanel`/
  `DecisoesDoNo` do componente selecionado; colar saída de script e
  conversar com o assistente produz `Decisao` ancorada naquele
  `noId`/`arestaId`. **Depende de** o painel expansível do assistente (ainda
  não desenhado) — o desenho desse painel deixa de ser opcional/depois e
  passa a ser pré-requisito direto desta fatia.
- **G — a animação sobre o pipeline** (SPEC-98 §5): em que item está, o que
  já chegou, quanto falta.
- **H — o motivo do "Exportar" desabilitado fica visível na tela de
  revisão**, antes de ir ao documento — não um bloqueio, um aviso.

## 4. Perguntas respondidas pelo usuário, na revisão desta SPEC

1. **Riscos deriva de quê?** → **Ensaios/débito assumido** (`RiscosMedidos`,
   já mostrado hoje abaixo da seção) — não uma categoria nova de `Decisao`.
   Ajusta a fatia B (§3): a fonte é só `ensaios`/débito, sem schema novo.
2. **O adaptador com atraso é destino novo ou flag?** → **Flag no destino
   existente.** Ajusta a fatia D (§3): não cria uma `operacao` nova em
   `OPERACOES_DO_GATEWAY` — acrescenta algo como `demonstracao?: boolean` (ou
   nome equivalente) em `DestinoDoGateway`, reaproveitando a tela e a
   configuração de `itens`/`specDoItem` que já existem. Mesmo espírito do
   "modo sem custo" (SPEC-74): o modo é uma variação de configuração, não um
   caminho novo no código.
