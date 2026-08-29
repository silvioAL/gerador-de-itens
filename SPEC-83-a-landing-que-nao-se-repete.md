# SPEC-83 — A landing que não se repete

> **Origem:** o usuário, com as telas na mão —
>
> > *"a parte após o ciclo com todos pontos verdes precisa ser revista, pois está
> > meio repetitiva, a idéia é que fique com cara de landing page de verdade,
> > verificar explicações melhores, remake do layout (mantendo em alguma parte a
> > idéia do círculo e dos pontos verdes, mas também ter outros elementos,
> > eventualmente imagens…)"*

É a última das cinco rodadas deste bloco, e por um motivo estrutural: **as
SPEC-79, 80 e 81 mudam as marcas que esta página mostra.** Refazer a página antes
seria desenhar em cima de um dado que está prestes a mudar — o mesmo erro que a
SPEC-78 evitou vindo por último.

---

## 0. A medição

A landing hoje (`packages/web/src/demo/LandingPage.tsx`, 84 linhas) é, em ordem:

1. header com "Entrar";
2. `<h1>` *"Do diagrama ao backlog, sem inventar nada"*;
3. um parágrafo;
4. `<CicloDoProduto />` — os 13 estágios;
5. `<Jornada />` — que é `OMotor()` + **5 etapas numeradas**;
6. botão "Entrar pra começar".

**A repetição tem causa exata, e é medível.** Das 5 etapas da `Jornada`, **4 são
estágios que o círculo acabou de mostrar**:

| Etapa da `Jornada` | Estágio do ciclo já mostrado |
|---|---|
| 1 · Diagrama | `desenho` — "Desenhar a solução" |
| 2 · Prontidão | `prontidao` — "Medir o que está pronto" |
| 3 · Derivar | `itens` — "Derivar os itens" |
| 5 · Especificação de solução | `especificacao` — "Especificar com a IA" |

A quinta (4 · Revisão) **não tem estágio correspondente** — ela descreve a
detecção de ciclos de dependência, que vive dentro de `itens`.

E o bloco `OMotor()` (`Jornada.tsx:59`, `data-testid="explicacao-do-motor"`)
reconta a divisão motor × IA que o `CONCEITO.md` e o próprio círculo já
carregam. **É a terceira vez que a mesma tese aparece na mesma rolagem.**

> Não é excesso de conteúdo: é **uma narrativa contada três vezes em três
> formatos**. Foi exatamente o §263 — duas explicações da mesma coisa
> dessincronizam — chegando pelo lado que ninguém vigiava.

**Um segundo achado, sobre o "cara de landing page":** a página inteira é **uma
coluna de 760 px** (`conteudoEstilo`, `:69`). Não há seção de largura total, não
há alternância, não há ritmo. É a estrutura de um **documento**, não de uma
página de apresentação — e nenhuma troca de texto conserta isso, porque o
problema é de layout.

## 1. O problema novo que as três rodadas anteriores criam

Quando as SPEC-79, 80 e 81 fecharem, o círculo terá **13 marcas iguais**.

A marca existe/parcial/ausente é o que torna a página honesta — mas 13 pontos
verdes idênticos não comunicam nada além de "verde". O que hoje é a informação
mais interessante do círculo (*"olha, eles dizem o que ainda não existe"*) vira
ruído uniforme.

**E a tentação é apagar a máquina de marcação.** Não se apaga:

- ela é a trava da SPEC-76 fatia D (todo estágio não-ausente tem que ter rota);
- no minuto em que existir um 14º estágio, ela é necessária de novo;
- e a honestidade da página **não é** um estado a que se chega — é um mecanismo
  que se mantém.

O que muda é o **peso visual**: com tudo verde, a marca deixa de ser manchete e
vira detalhe consultável. Com um ausente, ela volta a ser manchete. A página tem
que saber fazer as duas coisas — e isso é design, não texto.

## 2. O que "cara de landing page de verdade" quer dizer aqui

Ritmo, não decoração. Concretamente:

- **Seções com larguras e fundos diferentes** — a coluna de 760 px é uma delas,
  não a página inteira;
- **uma promessa forte no alto**, com **uma prova ao lado dela**, não três
  parágrafos abaixo;
- **movimento onde ele explica** (as três peças da SPEC-82), e em lugar nenhum
  onde ele só enfeita;
- **o círculo como um mapa compacto e consultável**, não como uma lista vertical
  de 13 itens para ler;
- **um fim que oferece um começo** — a mesma régua que a SPEC-78 aplicou ao
  tour, e pelo mesmo motivo: é o momento em que a pessoa está mais disposta.

O que **não** quer dizer: depoimento inventado, logo de cliente que não existe,
número de conversão fabricado. A régua da SPEC-76 vale para a página inteira, e
não só para os estágios — **a landing não pode prometer o que o produto não
faz.**

## 3. O destino da `Jornada`

Ela **não** é lixo: é um passo a passo de uso, e passo a passo de uso é bom —
no lugar certo. `JourneyModal.tsx:125` já a usa como aba "A jornada", pós-login,
que é exatamente o lugar de quem já entrou e quer saber por onde começar.

**Recomendação:** a landing para de renderizá-la; ela continua pós-login. E o
`OMotor()` sai de dentro dela para virar uma das peças de conceito da SPEC-82 —
assim cada tese tem **uma** casa, que é o que o §263 pede.

Consequência declarada: `Jornada.test.tsx`, `JourneyModal.test.tsx` e o E2E que
cobra `explicacao-do-motor` vão ficar vermelhos. **Reescritos com o motivo dito,
nunca contornados** — foi o que as SPEC-73 e 78 fizeram, e nas duas vezes um
teste vermelho apontou um defeito real.

## 4. O que esta SPEC RECUSA

**Apagar a marcação de estado.** Ver §1. Ela some da manchete, não do código.

**Refazer a landing antes das SPEC-79/80/81.** As marcas mudam; o texto dos
estágios muda. Trabalho jogado fora, e a SPEC-78 já provou o custo disso.

**Framework de UI ou biblioteca de animação novos.** O produto não tem design
system (é justamente a SPEC-79), e a landing não é o lugar de estrear um. Estilo
com `React.CSSProperties` sobre as variáveis CSS existentes, como o
`CicloDoProduto` já faz.

**Prova social inventada.** Sem clientes, sem números, sem depoimento.

**Uma segunda narrativa do ciclo.** Se um conteúdo novo repetir um estágio, ou
ele substitui o estágio ou não entra. É literalmente o defeito que esta SPEC
existe para consertar — e seria constrangedor recriá-lo.

## 5. Fatias

- **A — a poda, e ela vem primeiro.** A landing para de renderizar `Jornada`;
  `OMotor` sai dela. Prova: a página deixa de conter a segunda e a terceira
  versão da mesma tese, e um teste passa a **contar** — se uma seção nova
  repetir um `titulo` de `ESTAGIOS_DO_CICLO`, vermelho. É a trava da SPEC-78
  aplicada à landing.
- **B — as três peças de conceito.** Determinismo, centro contido, proveniência
  — a fase 1 do veredito da SPEC-82, dirigidas por dado e herdando claro/escuro.
- **C — o layout com ritmo.** Seções de larguras e fundos alternados; o círculo
  vira mapa compacto com a contagem (`contagemDoCiclo()` já existe e já dá o
  número); o "o que falta" deixa de ser lista e vira detalhe do estágio.
- **D — a prova de que ela continua honesta.** O teste da SPEC-76 fatia D
  continua valendo (estágio não-ausente tem rota) e ganha um irmão: **a página
  não pode citar estágio que não está em `ESTAGIOS_DO_CICLO`**, nem omitir um
  que esteja. Hoje nada impede a landing de ganhar prosa que promete o que o
  produto não faz.

## 6. Perguntas em aberto

1. **A promessa do `<h1>` ainda é a certa?** *"Do diagrama ao backlog, sem
   inventar nada"* foi escrita quando o produto terminava no backlog. Com a
   SPEC-80 ele passa a produzir specs, e com a SPEC-81 a conversar com as
   ferramentas do time. **Remedir antes de reescrever** — pode ser que continue
   certa, e trocar manchete por moda é como o tour envelheceu.
2. **Imagens: quais, e de quê?** O usuário disse *"não necessariamente telas do
   sistema"*. A SPEC-82 responde para os conceitos, mas não para o resto da
   página. Fica em aberto de propósito: é decisão de design, e vem depois de ver
   a fatia C de pé.
3. **A landing precisa de rota própria?** Hoje ela é renderizada em `App.tsx`
   **antes** de qualquer roteador, então um link direto para uma seção não passa
   por `rota.ts`. Se a fatia C criar seções linkáveis, isso vira trabalho real —
   e é o tipo de coisa que se descobre tarde. Medir na fatia C, não na D.
