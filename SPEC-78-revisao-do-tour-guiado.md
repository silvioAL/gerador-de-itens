# SPEC-78 — A revisão do tour guiado

> **Origem:** o usuário:
>
> > *"e uma sétima, e que precisa ser a última: uma revisão do tour guiado."*

**A ordem não é detalhe: é a própria SPEC.** O tour ensina o produto. Revisá-lo
antes das outras seis seria ensinar um produto que está prestes a mudar em seis
lugares — e refazer o trabalho.

---

## 0. A medição

```
packages/web/src/demo/useTour.ts ........ 569 linhas
passos declarados ....................... 37
tours ................................... 2 (produto: 19 · configuração: 13)
```

Trinta e sete passos escritos ao longo de dezenas de SPECs, cada um acrescentado
quando a superfície que ele explica nasceu.

## 1. O problema estrutural: o tour cresce por adição

Cada SPEC que criou tela acrescentou passo. Nenhuma removeu.

Isso produz três coisas, e a terceira é a que dói:

1. **passos que explicam o que mudou de nome** — o §306 renomeou "Contexto do
   épico" para "Contexto da demanda", e o §308 mostrou que texto de tour envelhece
   junto com rótulo;
2. **passos de peso desigual** — "este é o botão de salvar" ao lado de "isto é o
   ciclo de PDCA sobre a sua própria configuração";
3. **nenhuma ordem narrativa**, porque a ordem é a ordem em que as SPECs
   aconteceram — não a ordem em que alguém aprende.

> O tour não conta a história do produto. Conta a história do repositório.

## 2. Por que ele precisa vir DEPOIS das outras seis

Cinco das seis mudam o que o tour teria que ensinar:

| SPEC | O que muda no que se ensina |
|---|---|
| **74** — modo sem custo | o tour passa a poder mostrar IA de verdade, sem gastar token |
| **71** — o que se salva volta | hoje o tour ensina a assumir um ensaio que **some no F5** |
| **73** — lacuna contável | muda o que o documento mostra, que é metade do tour |
| **77** — volumetria de produto | estágio novo no ciclo |
| **76** — a página que explica o ciclo | **define o conceito** que o tour deveria estar ensinando |

A 76 é a dependência dura: ela escreve *o que é o ciclo*. Sem isso, revisar o
tour é reorganizar passos sem saber para onde eles apontam.

## 3. O que a revisão precisa perguntar de cada passo

Uma régua, aplicada aos 37:

> **Este passo ensina um CONCEITO, ou aponta um botão?**

Passo que aponta botão envelhece a cada mudança de rótulo e não sobrevive a uma
reorganização de tela. Passo que ensina conceito sobrevive a qualquer redesenho —
e é o que faz alguém entender por que a ferramenta existe.

Os que apontam botão não morrem todos: alguns são necessários (*"a porta para a
bancada fica aqui"*). Mas eles precisam ser **poucos e escolhidos**, não o
resultado de trinta acréscimos.

## 4. As três perguntas que a medição levanta

**4.1 Dois tours é o número certo?** A separação atual — produto × configuração —
tem razão declarada (§236: juntos seriam 25 passos, e a parte que decide adoção
ficaria no meio de tela de administração). A pergunta é se depois da SPEC-76 o
primeiro tour ainda precisa existir, **ou se a landing passa a fazer o trabalho
dele melhor**.

**4.2 O tour deveria usar dado de demonstração ou o desenho da pessoa?** Hoje usa
demonstração, com marca (§235/§251). Funciona, e custou três rodadas para
funcionar — o §251 registra que a demonstração ficou pela metade três vezes.
Mexer nisso tem custo conhecido.

**4.3 Onde ele deve terminar?** Um tour que acaba em "e é isso" desperdiça o
momento em que a pessoa está mais disposta. Terminar em uma **ação** — abrir um
cenário pronto, criar a primeira demanda — é a diferença entre visita guiada e
começo de uso.

## 5. O que NÃO entra

**Reescrever os 37 passos.** A revisão é sobre **quantos** e **quais**, não sobre
polir texto de todos.

**Um tour por tela.** Já foi tentado pelo avesso e produziu os 37.

**Vídeo.** Ver SPEC-76 §5: outra mídia, outro problema, e nenhum número que
justifique.

**Tour configurável pelo time.** Superfície nova para um problema que ninguém
relatou.

## 6. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | O inventário: os 37 passos classificados em CONCEITO ou BOTÃO, com o que cada um ainda ensina depois das seis SPECs | uma tabela — e a decisão do que corta sai dela, não de gosto |
| **B** | A poda, e a ordem narrativa | o tour do produto cabe no número que a fatia A justificar |
| **C** | O fim em ação | E2E: o último passo leva a fazer algo, não a fechar |
| **D** | A prova contra envelhecimento: passo que cita rótulo que não existe mais quebra a suíte | mudar um rótulo sem mudar o tour deixa a suíte vermelha |

**A fatia D é a que impede esta SPEC de ser necessária de novo em um ano.** As
outras três consertam o tour de hoje; ela conserta o processo que o degradou.

## 7. Perguntas em aberto

1. **Qual é o número certo de passos?** Não tenho régua. Recomendação: sai da
   fatia A, e o critério é *"quantos conceitos existem"*, não *"quantas telas"*.
2. **O tour de configuração sobrevive à landing?** Provavelmente sim — ele fala
   com quem já decidiu adotar. Mas é decisão da fatia A.
3. **Passo que aponta botão deve ter teste próprio?** Recomendação: **sim**, e é
   a fatia D — foi exatamente assim que "⚙ Configura" cortado chegou até o
   usuário sem nada acusar.
