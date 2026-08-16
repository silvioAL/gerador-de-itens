# SPEC-60 — Remedir, rastrear, comparar

> **Origem:** três das cinco melhorias que levantei depois do §260, e que o
> usuário mandou implementar: *"implemente tudo o que acabou de apontar, as 3
> sugestões"*.

---

## 1. O que as três têm em comum

Não é coincidência que tenham saído juntas. As três são o **mesmo defeito em
três lugares**: o produto mede, mostra o número, e para ali.

| Fatia | O que o produto sabe hoje | O que ele não diz |
|---|---|---|
| **A — remedir** | que existe uma proposta de decisão e um caminho a confirmar | **o que muda nas medidas** se você aceitar |
| **B — rastrear** | quem são os papéis da esteira e em que ordem rodam | **se rodaram**, e se deu certo |
| **C — comparar** | que o desenho mudou depois da aprovação | **o quê** mudou |

Um número que não vira consequência é decoração. As três fatias fecham a mesma
distância — entre **medir** e **importar** — que o §261 começou a fechar do
lado da derivação.

---

## 2. Fatia A — a remedição, a quarta batida do laço

### O buraco

O §6 da SPEC-57 desenha o laço **medir → conversar → decidir → remedir**. A
quarta batida existe em exatamente um lugar: `delta-da-proposta`, no painel de
necessidades, que roda o motor duas vezes (como está, e como ficaria) e diz
*"se aceitar tudo: lacunas 0 → 1 — aceitar propósito sem componente cria
trabalho"*.

Aceitar uma **decisão** proposta pelo agente e confirmar um **caminho** não
dizem nada. E o caso do caminho é o que mais dói: confirmar um percurso é o que
faz a régua passar a valer sobre ele, e uma régua que passa a valer pode
**gerar item no backlog** (§249). Hoje isso acontece depois do clique, sem
aviso.

### A régua

> **A remedição usa a moeda em que a consequência aparece.** Para decisão, o
> placar de decisões. Para caminho, o **backlog** — porque é lá que confirmar
> um caminho cobra o preço.

Não é o mesmo número nos dois lugares por simetria estética: é o número que
muda em cada caso. Mostrar "decisões vigentes 2 → 3" ao confirmar um caminho
seria informação verdadeira e inútil, que é o defeito que esta SPEC combate.

### O que entra

- **`remedicao.ts` no engine**, puro: `deltaDeDecisao` e `deltaDePercurso`.
  Cada um roda a medição duas vezes — o mundo como está, e o mundo com a
  proposta aceita — e devolve os dois números, nunca uma frase. Frase é
  assunto da tela; número comparável é assunto do motor.
- **Um componente `Delta` compartilhado** na web, com a linguagem visual que já
  foi aprovada em uso no painel de necessidades: título, `de → para`, e uma
  linha de alerta quando o "para" é pior que o "de".
- **Aceitar uma decisão** mostra: propostas esperando, decisões vigentes, e o
  alerta de aceitar sem o porquê — que é criar dívida, não resolvê-la.
- **Confirmar um caminho** mostra: itens no backlog agora → depois, e o aviso
  de "não vai dar para medir" quando falta campo.

### O que fica de fora, e por quê

**Não haverá remedição para "registrar decisão manual".** Quem escreve a
decisão à mão já sabe o que está fazendo — o delta existe para o que **outro**
propôs. Botar delta em toda ação transformaria o mecanismo em ruído, que é o
mesmo erro que o §261 evitou no diálogo de derivação.

### O que prova

Unidade no engine (o motor rodando duas vezes e devolvendo números diferentes),
unidade na tela (o alerta aparecendo só quando piora), E2E do caminho que
confirma e ganha item, e um passo no tour — capacidade que o tour não mostra
não existe (§244).

---

## 3. Fatia B — a esteira deixa rastro

### O buraco

O mapa do sistema (§258) mostra os papéis da esteira com avatar e estado:
`ativo`, `desligado`, `sem-credencial`. Falta o estado que interessa depois do
primeiro dia: **falhou da última vez**. E falta porque o produto **não guarda
nada** sobre execução — nenhuma linha, em lugar nenhum.

A consequência maior não é o avatar apagado: é o PDCA. Ele se chama ciclo e se
alimenta só de feedback **escrito por gente**. Sem rastro de execução, o "check"
do PDCA depende de alguém ter tido paciência de reclamar.

### A régua

> **Registrar o mínimo que responde a uma pergunta que alguém realmente faz:**
> *este papel rodou? deu certo? quando? demorou quanto?* Nada além disso.

O que fica **fora** é o que transformaria isto em observabilidade: sem prompt
gravado, sem resposta gravada, sem token contado, sem custo. Prompt e resposta
carregam o contexto do produto e da demanda — guardá-los cria um problema de
privacidade que esta fatia não precisa ter para acender um avatar.

### O que entra

- **Uma tabela** `execucoes_de_ia`: organização, rótulo, papel, ok, erro,
  duração, quando. Migração e contrato, como toda persistência nova.
- **O registro num lugar só**: `executarPedido` no `routes/ia.ts` já é o funil
  por onde passa **toda** chamada ao modelo, e já recebe um `rotulo`. Registrar
  ali é registrar tudo sem espalhar; registrar em cada rota seria garantir que
  a próxima rota esqueça.
- **Fire-and-forget**: gravar o rastro nunca pode derrubar a resposta ao
  usuário. Falha ao registrar vai para o log e morre ali.
- **Poda**: o histórico é limitado por organização. Rastro que cresce para
  sempre vira problema de operação, e ninguém pergunta "como foi a execução de
  três meses atrás" numa ferramenta de desenho.
- **O mapa do sistema** ganha o estado `falhou` e a linha *"última execução:
  há 3 min · 1,2 s"* no avatar.

### O que prova

Unidade na aplicação (`montarMapaDoSistema` acendendo `falhou`), unidade no
servidor (o registro acontecendo, e a falha ao registrar **não** derrubando a
chamada), E2E contra o gateway falso: uma chamada que dá certo e uma que falha,
e o avatar mudando de estado entre as duas.

---

## 4. Fatia C — o documento aprovado diz o que mudou

### O buraco

`documentoDesatualizado` é `especificacao !== markdownDoDocumento`: um
booleano. O aviso *"o desenho mudou depois da aprovação"* é verdadeiro e
inútil — quem lê tem que reler o documento inteiro para descobrir se mudou uma
vírgula do preâmbulo ou a lista de itens.

E o aviso inútil tem custo: ele treina a pessoa a aprovar de novo sem olhar,
que é exatamente o carimbo que o §233 quis evitar.

### A régua

> **Comparar por SEÇÃO, não por linha.** O documento é feito de seções com
> título, e "mudou a seção Itens derivados" é uma frase que leva a uma ação.
> "Linha 340 mudou" não é.

### O que entra

- **`compararDocumentos(aprovado, atual)` no engine**, puro: devolve o que
  **entrou**, o que **saiu** e o que **mudou**, por título de seção.
- **A tela do documento** mostra a lista no lugar do booleano, junto do aviso
  que já existe.

### O que fica de fora

**Não é versionamento, e continua não sendo.** A SPEC-58 adiou histórico de
versões com razão. Isto compara **duas** coisas que já estão na mão: a foto da
aprovação e o texto de agora. Nenhuma linha nova no banco.

### O que prova

Unidade no engine (seção que entrou, que saiu, que mudou, e documento igual não
produzindo nada), unidade na tela, e o passo do documento no tour cobrando o
conteúdo — não só a visibilidade (§234).

---

## 5. Ordem, e por quê

**A → C → B.** A fatia A fecha o laço da SPEC-57, que é a dívida conceitual
mais antiga das três. A C é a mais barata e some do caminho rápido. A B vem por
último porque é a única que cria persistência, e persistência nova depois de
duas fatias verdes é uma variável a menos quando algo quebrar.
