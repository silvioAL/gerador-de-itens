import type { ReactNode } from "react";
import { ATOS, type Ato } from "./atos";

/**
 * SPEC-92 fatia C — **a moldura: o que muda em volta das peças.**
 *
 * O usuário foi explícito — *"gostei dos diagramas"* — e a SPEC-92 §5 recusa
 * refazê-los. **Nenhuma peça muda por dentro.** O que muda é o que as cerca: ar,
 * largura, e um chapéu que diz em que parte da apresentação a pessoa está.
 *
 * ## Por que o chapéu não é um `<h2>`
 *
 * Cada peça já traz o seu título, e ele é o mais específico dos dois — foi a
 * lição do §333, quando a página trazia "O ciclo, e o que dele já existe" três
 * linhas acima de "O ciclo, e onde a IA entra". Um `<h2>` de ato empilhado sobre
 * o `<h2>` da peça reconstruiria o mesmo defeito cinco vezes, e a trava de
 * abertura repetida de `landing.travas.test.tsx` acusaria — com razão.
 *
 * O chapéu é o **numeral e o nome**, do tamanho de um rótulo, e a pergunta logo
 * abaixo. Numa apresentação isso é o canto do slide, não o título dele.
 *
 * ## A `<section>` é nomeada mesmo sem título próprio
 *
 * `aria-labelledby` aponta para o chapéu: sem isso, cinco regiões anônimas
 * aparecem na lista de marcos de um leitor de tela, e navegar por elas seria pior
 * do que não tê-las.
 *
 * ## O `scroll-margin-top` mora no CSS, e é o defeito clássico deste padrão
 *
 * Com cabeçalho fixo, uma âncora rola o título para debaixo da barra e a pessoa
 * chega numa seção decapitada. A margem está em `styles.css`, junto da altura do
 * cabeçalho que a produz — os dois números precisam concordar, e separá-los é
 * garantir que um mude sem o outro.
 */
export function MolduraDoAto({
  ato,
  destacado,
  largura = 700,
  children,
}: {
  ato: Ato;
  /** Fundo próprio. Alterna entre os atos — é o ritmo que a SPEC-83 §5 pediu, e
   *  o que impede cinco partes iguais de virarem uma coluna só outra vez. */
  destacado?: boolean;
  /**
   * A largura do ato, e ela vale para o chapéu **e** para as peças.
   *
   * ## Por que uma prop, e não duas larguras escritas lado a lado
   *
   * A primeira versão dava 700 px fixos ao chapéu e deixava cada ato escolher a
   * largura do seu conteúdo. Capturando contra a stack: no ato do percurso o
   * chapéu começava em `x=370` e a peça em `x=60` — **310 px de desalinhamento**,
   * um rótulo flutuando no meio de um diagrama que ocupa a tela toda. No ato do
   * ciclo eram 30 px, suficiente para parecer desleixo sem parecer defeito.
   *
   * Os dois números precisavam concordar e moravam em arquivos diferentes, que
   * é a mesma forma de erro que o `--altura-do-cabecalho` resolve no CSS. Com
   * uma prop só, não há como divergirem.
   *
   * As peças que são mais estreitas que o ato continuam se centralizando
   * sozinhas — todas já trazem o seu próprio `maxWidth`.
   */
  largura?: number;
  children: ReactNode;
}) {
  const numero = ATOS.indexOf(ato) + 1;
  const rotuloId = `ato-rotulo-${ato.id}`;

  return (
    <section
      id={ato.id}
      data-testid={`ato-${ato.id}`}
      aria-labelledby={rotuloId}
      className="landing-ato"
      style={{
        /**
         * 38 e não 56, e o número é consequência de uma medição.
         *
         * A primeira escrita usou 56 px, e a página **cresceu**: 4693 → 4968 px,
         * exatamente o oposto do que o usuário pediu (*"está ficando longa"*).
         * Os cinco chapéus custam ~350 px, e o ar em volta deles pagava esse
         * custo duas vezes.
         *
         * O ar é o que faz a apresentação respirar, então ele não some — encolhe
         * até a página empatar com a de antes. O que esta rodada entrega não é
         * uma página mais curta: é uma página com **saída**, que é coisa
         * diferente e está dita como diferente no §341.
         */
        padding: "38px 24px",
        background: destacado ? "var(--painel-alto)" : "transparent",
        borderTop: "1px solid var(--borda)",
      }}
    >
      <div style={{ maxWidth: largura, margin: "0 auto" }}>
        <header style={{ margin: "0 0 20px" }}>
          <div
            id={rotuloId}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "var(--acento-gente-texto)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{String(numero).padStart(2, "0")}</span>
            {/* O traço é decoração e sai da árvore de acessibilidade: lido em voz
                alta ele vira ruído entre o número e o nome. */}
            <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--borda-forte)" }} />
            {ato.nome}
          </div>
          {/**
           * A PERGUNTA é a legenda do ato, e ela substitui a prosa de abertura
           * que a fatia A tirou. Uma pergunta faz um trabalho que um resumo não
           * faz: diz a quem já sabe a resposta que pode pular a parte.
           */}
          <p
            style={{
              fontSize: 15,
              color: "var(--texto-2)",
              lineHeight: 1.5,
              margin: "8px 0 0",
            }}
          >
            {ato.pergunta}
          </p>
        </header>

        {children}
      </div>
    </section>
  );
}
