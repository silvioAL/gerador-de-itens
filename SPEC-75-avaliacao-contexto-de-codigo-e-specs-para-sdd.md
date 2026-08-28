# SPEC-75 — Avaliação: contexto vindo do código, e specs para SDD

> **Origem:** o usuário, e a mensagem já traz a hierarquia de valor pronta:
>
> > *"o objetivo do sistema também é antecipar decisões e melhorar o processo de
> > especificação, reduzindo o atrito cognitivo para que o processo seja suave.
> > Precisamos avaliar se é possível: mapear projetos em determinada pasta →
> > selecionar projetos envolvidos → fazer o mapping do contexto com algum agente
> > de forma simplificada: aceitar a execução de script de mapeamento de
> > superfície (PowerShell) → agente lê → pede para rodar mais scripts → se
> > aprova isso → mais contexto. E também anexar imagens nessas interações, pois
> > por exemplo em motores FICO não tem como fazer de outra forma.*
> >
> > *No final, além do que já é entregue e da possível integração com issue
> > tracker via MCP, poder gerar também **specs** para atuar da mesma forma que
> > estamos trabalhando — que seriam anexadas a esses itens. **Precisamos de
> > muito cuidado ao avaliar isso**, se faz sentido, se facilitaria,
> > especialmente a parte de mapeamento de contexto. Mas em geral o que teria
> > mais valor seria a parte de gerar specs para SDD; o mapeamento vale apenas se
> > acelerar o processo de passar contexto para specs melhores (e para isso, caso
> > valha a pena, precisa ter um workflow muito bem definido) e/ou o desenho via
> > assistente."*

Esta é uma SPEC de **avaliação**, como a SPEC-55 foi para o Forge. Ela não
autoriza construção: ela separa o que vale do que só parece valer, e diz o que
precisaria ser verdade antes.

---

## 1. A hierarquia, aceita como o usuário a colocou

Ele mesmo ordenou, e a ordem está certa:

1. **Gerar specs para SDD** — o valor maior, e independente do resto;
2. **Mapeamento de contexto** — só vale **se** acelerar a chegada de contexto às
   specs ou ao desenho;
3. **Anexar imagem** — habilitador de um caso concreto (motores FICO), e o mais
   barato dos três.

**A avaliação segue essa ordem, e a recomendação preserva essa independência:**
as três podem existir separadas, e a primeira não deve esperar pelas outras.

## 2. Gerar specs — o que o produto JÁ é, aplicado a si mesmo

### 2.1 O que já existe e ninguém precisa reconstruir

O produto já converte desenho + contexto + decisões em **markdown estruturado com
template configurável, seções escritas por gente que sobrevivem à regeneração,
proveniência por campo, lacunas contáveis e PDCA sobre o próprio template**.

Uma spec de SDD é markdown estruturado com seções, decisões e critérios. **É o
mesmo motor**, com outro template e outro conjunto de seções.

> A pergunta certa não é *"como construímos um gerador de specs?"* — é *"o que
> falta no gerador de documento para que uma spec caiba nele?"*. E a resposta é
> pequena.

### 2.2 O que de fato falta

- **Um tipo de artefato além do "documento de solução".** Hoje a quebra produz um
  documento; precisaria produzir **N artefatos** de tipos diferentes, cada um com
  template próprio.
- **O que uma spec tem e o documento não:** as **recusas** ("o que NÃO entra, e
  por quê") e as **fatias com prova**. As duas são o que faz esta SPEC ser útil e
  não uma lista de desejos — e nenhuma existe como seção hoje.
- **O vínculo com o item.** *"anexadas a esses itens"* — o elo já tem forma: é o
  mesmo `Decisao.ensaioIds` da SPEC-69, aplicado a outro par.

### 2.3 O risco declarado

Uma spec gerada por modelo, com aparência de spec deste repositório, e conteúdo
plausível-mas-vazio, é **pior que nenhuma**: ela custa a leitura de alguém e
carrega autoridade que não merece. A régua da SPEC-69 §5 vale inteira aqui.

**Mitigação, e ela é estrutural:** as seções que carregam julgamento — a origem,
as recusas, a régua — **não podem ser escritas pelo modelo**. Ele preenche o que
é derivável (o que existe hoje, o que foi medido, quais elementos participam); o
resto é `SecaoEscrita`, com lacuna contável (SPEC-73).

### 2.4 Veredito

**Vale, e é a primeira coisa a fazer.** É incremento sobre um motor maduro,
independente do resto do pedido, e o único item cujo valor não depende de nenhuma
hipótese sobre uso.

## 3. Mapeamento de contexto — o cuidado que o pedido pede

### 3.1 O que ele resolveria de verdade

O gargalo real, hoje: **alguém tem que digitar o contexto**. Colar o estado da
demanda, descrever os sistemas, explicar como o motor FICO decide. É trabalho
manual, e é onde a qualidade do documento nasce.

Ler o repositório e propor o desenho a partir dele atacaria esse gargalo na
origem. É um valor real, e não é pequeno.

### 3.2 As quatro coisas que precisam ser verdade, e nenhuma é óbvia

**(a) O mapeamento tem que ser MELHOR que a pessoa descrevendo.** Um mapa
automático que erra os limites do sistema produz um desenho errado com aparência
de apurado — e o custo de corrigir um desenho errado é maior que o de fazer o
certo do zero. **Não temos medição nenhuma sobre isso.**

**(b) Executar script é uma fronteira de segurança, não de UX.** *"aceitar a
execução de script de mapeamento de superfície (PowerShell)"* — o desenho precisa
ser: **script versionado no repositório, revisável antes de rodar, aprovado um a
um, e com a saída mostrada antes de virar contexto.** Um agente que pede "posso
rodar mais um?" em laço, com aprovação por hábito, é uma escada para execução
arbitrária. A aprovação tem que custar atenção, ou não é aprovação.

**(c) Só serve com o workflow declarado ANTES** — e o próprio usuário disse isso.
Sem os estados nomeados (o que é uma "pasta de projetos", o que é "selecionar
projetos envolvidos", o que o agente pode pedir, o que se faz com um mapa que
está errado), isto vira uma conversa aberta com um agente e um terminal. Que é
exatamente o que **não** reduz atrito cognitivo.

**(d) O produto é hospedado.** A ferramenta roda em Docker, e o código do usuário
está na máquina dele. Um mapeamento que exige acesso ao sistema de arquivos local
**não cabe na arquitetura atual** sem um componente novo — um agente local, ou
upload explícito. Isso não é detalhe: é a diferença entre uma fatia e um produto
novo.

### 3.3 Veredito

**Vale avaliar, não vale construir ainda.** E o critério de entrada é o que o
próprio usuário nomeou: **o workflow muito bem definido**, que precisa existir
antes de qualquer linha — inclusive antes de decidir se o mapeamento roda local
ou hospedado.

Sugestão de primeiro passo, barato e informativo: **uma fatia manual.** Deixar
colar a saída de um script que a pessoa rodou por conta própria, e medir se o
desenho proposto a partir dela é melhor que o descrito à mão. Isso responde (a) —
a pergunta que decide todo o resto — sem construir automação nenhuma.

## 4. Anexar imagem — o menor, e o mais claro

*"em motores FICO não tem como fazer de outra forma"* é um caso concreto, e
concreto é o que falta aos outros dois.

O produto já lê o campo `visao` da credencial (`credenciais.ts`), e o assistente
já tem "Anexar imagem" na entrada. **Isso já existe em parte** — o que esta
avaliação recomenda é medir o que falta, e não presumir.

**Veredito: o mais barato e o de escopo mais claro.** Não depende de nada dos
outros dois.

## 5. O que esta avaliação RECUSA

**Agente com terminal em laço aberto.** *"agente lê → pede para rodar mais
scripts → se aprova isso → mais contexto"* é um laço sem condição de parada
declarada. Sem teto de iterações, sem lista fechada de scripts e sem a saída
visível antes de virar contexto, isto é execução arbitrária com passos extras.

**Mapeamento como pré-requisito de qualquer coisa.** As três partes precisam
permanecer independentes. Se gerar specs esperar pelo mapeamento, o item de maior
valor fica refém do de maior risco.

**Spec gerada inteira por modelo.** Ver §2.3. As seções de julgamento são de
gente, ou o artefato mente com autoridade.

**MCP como fatia desta SPEC.** A integração com issue tracker via MCP é assunto
próprio, com superfície própria. Misturá-la aqui faria três avaliações virarem
quatro, e nenhuma delas ficaria clara.

## 6. Recomendação, em uma frase

> **Fazer a geração de specs; instrumentar o mapeamento antes de automatizá-lo;
> medir o que já existe de imagem antes de construir.**

## 7. O que precisaria ser medido antes da próxima decisão

1. Um desenho proposto a partir de saída de script é **melhor** que o descrito à
   mão? (fatia manual do §3.3)
2. Quanto do "anexar imagem" já funciona hoje ponta a ponta?
3. Qual é o formato mínimo de uma spec de SDD que este time usaria — e ele cabe
   no template configurável que já existe?

Nenhuma dessas três exige código novo para ser respondida. **Todas exigem uma
medição que ainda não fizemos.**
