/**
 * SPEC-95 §3 — **a página cita a prova.**
 *
 * ## A ideia, e por que ela é específica deste produto
 *
 * Quem avalia uma compra cara não quer adjetivo: quer verificar. E este
 * repositório tem uma coisa que quase nenhuma landing tem — **cada afirmação
 * técnica já é sustentada por um teste com nome**.
 *
 * *"Robusto"*, *"enterprise-grade"* e *"escalável"* são o que se escreve quando
 * não se tem o que mostrar. Uma afirmação com o arquivo ao lado é do outro tipo:
 * **se a prova sumir, a suíte cai no mesmo commit.**
 *
 * É a régua da SPEC-76 — *a página não promete o que o produto não faz* — virada
 * argumento de venda.
 *
 * ## A régua da própria régua
 *
 * `site/provas.test.ts` verifica que **todo `arquivo` daqui existe no
 * repositório**. Uma citação quebrada seria pior que nenhuma: seria uma promessa
 * falsa *sobre o mecanismo de não fazer promessas falsas*.
 *
 * ## O que NÃO fazer aqui
 *
 * Despejar contagem — *"2.170 testes!"* — como número de folheto. Quantidade de
 * teste não é qualidade de produto, e quem avalia sabe disso. O que convence é a
 * **afirmação específica com a prova específica ao lado**, e é por isso que esta
 * lista é curta de propósito.
 */
export interface Prova {
  /** O que a página afirma, em uma frase, sem jargão. */
  afirmacao: string;
  /** Por que isso importa para quem está avaliando — em linguagem comum. */
  porque: string;
  /** O caminho, a partir da raiz do repositório. A trava confere que existe. */
  arquivo: string;
  /** O que aquele arquivo faz, dito com precisão — nunca mais do que ele faz. */
  oQueEleProva: string;
}

export const PROVAS: Prova[] = [
  {
    afirmacao: "O mesmo desenho produz sempre a mesma saída.",
    porque:
      "É o que torna possível mudar uma coisa e comparar o antes e o depois. Se houvesse amostragem de modelo no meio do caminho, duas execuções iguais dariam textos diferentes e não haveria com o que comparar.",
    arquivo: "packages/engine/src/especificacao/documentoNaoMuda.test.ts",
    oQueEleProva:
      "Um teste de caracterização: ele afirma que o documento gerado é byte a byte o mesmo. Qualquer não-determinismo na cadeia o derruba.",
  },
  {
    afirmacao: "A regra da empresa roda, em vez de ficar documentada.",
    porque:
      "Uma regra em wiki depende de alguém lembrar. Uma regra com checagem é conferida a cada mudança do desenho, e o que ela acusa vira item de trabalho.",
    arquivo: "packages/engine/src/config/types.ts",
    oQueEleProva:
      "`Requisito.checagem` é opcional: um requisito com checagem é medido pelo motor, um sem checagem é item de checklist que uma pessoa responde. A fronteira entre os dois é explícita no tipo.",
  },
  {
    afirmacao: "Toda permissão que a tela oferece é verificada por uma rota.",
    porque:
      "O modo de falha de uma autorização ausente é o silêncio: a permissão existe, é gravada, é resolvida — e nenhuma rota pergunta. A tela mostra a matriz completa e o 403 nunca vem.",
    arquivo: "packages/server/src/auth/permissoes.cobertura.test.ts",
    oQueEleProva:
      "Cruza os recursos declaráveis na tela de acessos com as rotas que de fato os verificam. Esta suíte nasceu porque 14 de 16 recursos podiam ser concedidos e negados sem que ninguém perguntasse.",
  },
  {
    afirmacao: "Medimos o nosso contraste com a mesma régua que cobramos do time.",
    porque:
      "Um produto que mede o contraste do design system dos outros e não mede o próprio está pedindo uma coisa que ele mesmo não faz.",
    arquivo: "packages/web/src/tema/paleta.contraste.test.ts",
    oQueEleProva:
      "As duas paletas passam pela função `contraste()` do motor — a mesma que avalia o design system do time. É aritmética de WCAG, e o teste falha se alguém escurecer um cinza demais.",
  },
  {
    afirmacao: "A página não promete estágio que não tem tela.",
    porque:
      "Uma página de apresentação que desenhasse estágios inexistentes seria o produto violando, na porta de entrada, a única coisa que ele exige de quem o usa.",
    arquivo: "packages/web/src/demo/ciclo.test.ts",
    oQueEleProva:
      "Confere cada estágio contra o roteador de verdade: todo estágio que existe tem rota, a rota resolve, e estágio ausente não pode ter rota. Um estágio que perder a tela derruba a suíte no mesmo commit.",
  },
  {
    afirmacao: "Todo caminho de integração incompleto aparece marcado, com o que falta.",
    porque:
      "Cinco setas todas acesas seria a maior promessa falsa que esta página poderia fazer. A honestidade aqui não é escrúpulo: é o que faz um arquiteto acreditar no resto.",
    arquivo: "packages/web/src/site/site.travas.test.tsx",
    oQueEleProva:
      "Para cada conexão que não está completa, exige que a página diga o estado e o que falta — e que a conexão completa NÃO leve marca, porque marcar o que está certo é ruído.",
  },
];
