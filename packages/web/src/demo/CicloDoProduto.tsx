import { useState } from "react";
import { ESTAGIOS_DO_CICLO, contagemDoCiclo, type EstagioDoCiclo } from "./ciclo";

/**
 * SPEC-76 fatias B e C — **o ciclo, desenhado.**
 *
 * ## Por que um círculo, e por que ele não é a primeira impressão
 *
 * O que a forma circular acerta é que **o ciclo fecha**: a coleta de
 * oportunidades volta como ajuste na camada determinística, que muda as regras,
 * que mudam o próximo documento. Esse retorno é o coração do produto, e um
 * diagrama linear o perderia.
 *
 * O que ela arrisca é ser densa — e denso na primeira tela é a definição de
 * *não se vender bem*. Por isso a página abre com a promessa em uma frase, e
 * isto vem **logo abaixo**: o círculo como mapa, com os desdobramentos abrindo
 * ao clique. Trocar "uma frase e um botão" por "um infográfico que ninguém lê"
 * seria o mesmo erro com outra roupa.
 *
 * ## O centro é a tese
 *
 * *"A IA contida no meio como um círculo rígido"* — a imagem do pedido é
 * precisa, e ela merece ser o conceito central: **a IA está no meio de tudo, e
 * é contida.** Ela propõe, nunca aplica; sugere, e alguém aceita; escreve o
 * texto, e nunca a conta. É o que separa este produto de um gerador — e é a
 * coisa mais difícil de comunicar, porque é uma **ausência** de comportamento.
 *
 * ## O estado nunca é só cor
 *
 * "existe / parcial / ainda não existe" é **status**, e status vem com ícone e
 * palavra, nunca com cor sozinha — quem não distingue as cores tem que ler a
 * mesma coisa. Vale para daltonismo, para impressão e para o modo de alto
 * contraste. E as cores saem das variáveis que o produto já tem, em vez de uma
 * paleta nova: duas paletas no mesmo app divergem na primeira mudança de tema.
 */

const RAIO = 148;
const CENTRO = 176;

/** Status com ícone e palavra — a cor é reforço, nunca o portador. */
/**
 * SPEC-83 — exportada porque ganhou um segundo cliente: o mapa de conexões faz
 * a mesma pergunta sobre outra coisa, e duas legendas para o mesmo vocabulário
 * obrigariam quem lê a aprender as duas (§263).
 */
export const MARCA_DE_ESTADO: Record<EstagioDoCiclo["estado"], { icone: string; rotulo: string; cor: string }> = {
  completo: { icone: "●", rotulo: "existe", cor: "var(--verde, #3ecf8e)" },
  parcial: { icone: "◐", rotulo: "parcial", cor: "var(--amarelo, #eab308)" },
  ausente: { icone: "○", rotulo: "ainda não existe", cor: "var(--texto-mudo, #94a3b8)" },
};

function posicaoNoCirculo(indice: number, total: number): { x: number; y: number } {
  // Começa no topo e anda no sentido horário — é como se lê um relógio, e o
  // ciclo é lido como tempo.
  const angulo = (indice / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTRO + RAIO * Math.cos(angulo), y: CENTRO + RAIO * Math.sin(angulo) };
}

/**
 * SPEC-84 fatia B — a lista entra por fora, **e é o teste que precisa disso.**
 *
 * A tela nunca passa `estagios`: quem chama é a landing, e a landing mostra o
 * ciclo real. O parâmetro existe porque a máquina de marcar o que falta agora só
 * se prova com um dado que os dados reais não têm mais — todos os treze estágios
 * ficaram verdes, e uma trava que fizesse `find(estado === "ausente")!` quebraria
 * com `undefined.id`.
 *
 * Foi exatamente o que aconteceu duas vezes: a SPEC-79 zerou o último `parcial` e
 * a trava caiu; a SPEC-84 zerou o último `ausente` e ela caiu de novo. Na terceira
 * repetição, a régua deixa de ser comentário e vira entrada.
 */
export function CicloDoProduto({ estagios = ESTAGIOS_DO_CICLO }: { estagios?: EstagioDoCiclo[] } = {}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const { existem, total } = contagemDoCiclo(estagios);
  const detalhe = estagios.find((e) => e.id === aberto);

  return (
    <section data-testid="ciclo-do-produto" style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 17, color: "var(--texto)", margin: "0 0 4px" }}>O ciclo, e onde a IA entra</h2>
      <p style={{ fontSize: 13.5, color: "var(--texto-2)", lineHeight: 1.6, maxWidth: 640, margin: "0 0 4px" }}>
        Da captação do que é perene até o aprendizado que volta e muda as regras. Clique num estágio para ver o que ele
        faz.
      </p>
      {/* A contagem sai do DADO, não de um número digitado aqui: uma prosa
          dizendo "nove de doze" continuaria dizendo isso depois de o décimo
          ficar pronto. */}
      <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: "0 0 14px" }} data-testid="ciclo-contagem">
        {existem} dos {total} estágios existem hoje. Os que ainda não existem estão marcados — eles dizem para onde isto
        vai, e marcá-los é o que os torna honestos.
      </p>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
        <svg width={CENTRO * 2} height={CENTRO * 2} role="img" aria-label="O ciclo do produto, em treze estágios">
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RAIO}
            fill="none"
            stroke="var(--borda)"
            strokeWidth={2}
            strokeDasharray="4 6"
          />
          {/* O centro RÍGIDO — a IA está no meio de tudo, e é contida. */}
          <circle cx={CENTRO} cy={CENTRO} r={62} fill="var(--painel-alto, rgba(99,102,241,.08))" stroke="#6366f1" strokeWidth={2} />
          <text x={CENTRO} y={CENTRO - 12} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: "var(--texto)" }}>
            IA
          </text>
          <text x={CENTRO} y={CENTRO + 6} textAnchor="middle" style={{ fontSize: 10.5, fill: "var(--texto-2)" }}>
            propõe, nunca
          </text>
          <text x={CENTRO} y={CENTRO + 20} textAnchor="middle" style={{ fontSize: 10.5, fill: "var(--texto-2)" }}>
            aplica sozinha
          </text>

          {estagios.map((estagio, i) => {
            const { x, y } = posicaoNoCirculo(i, estagios.length);
            const marca = MARCA_DE_ESTADO[estagio.estado];
            const selecionado = aberto === estagio.id;
            return (
              <g
                key={estagio.id}
                data-testid={`estagio-${estagio.id}`}
                onClick={() => setAberto(selecionado ? null : estagio.id)}
                style={{ cursor: "pointer" }}
              >
                {/* Alvo de clique maior que a marca — a régua de interação. */}
                <circle cx={x} cy={y} r={17} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={selecionado ? 11 : 8}
                  fill={estagio.estado === "ausente" ? "var(--painel)" : marca.cor}
                  stroke={marca.cor}
                  strokeWidth={2}
                />
                <title>{`${estagio.titulo} — ${marca.rotulo}`}</title>
              </g>
            );
          })}
        </svg>

        {/* A LISTA, ao lado do círculo e não dentro dele.
            Treze rótulos em volta de um círculo de 300px ou ficam ilegíveis ou
            exigem uma tela larga — e a página tem que funcionar em cinco
            segundos, inclusive no celular. O círculo mostra a FORMA (fecha, e
            tem um centro); a lista carrega o texto. */}
        <ol style={{ listStyle: "none", margin: 0, padding: 0, flex: "1 1 320px", minWidth: 300 }}>
          {estagios.map((estagio) => {
            const marca = MARCA_DE_ESTADO[estagio.estado];
            const selecionado = aberto === estagio.id;
            return (
              <li key={estagio.id} style={{ borderBottom: "1px solid var(--borda)" }}>
                <button
                  onClick={() => setAberto(selecionado ? null : estagio.id)}
                  data-testid={`estagio-item-${estagio.id}`}
                  aria-expanded={selecionado}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "baseline",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: "9px 2px",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span aria-hidden="true" style={{ color: marca.cor, fontSize: 11 }}>
                    {marca.icone}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--texto)" }}>{estagio.titulo}</span>
                    {estagio.estado !== "completo" && (
                      /* A PALAVRA junto do ícone: status nunca é só cor. */
                      <span style={{ fontSize: 11, color: marca.cor, marginLeft: 8 }}>{marca.rotulo}</span>
                    )}
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--texto-2)", marginTop: 2 }}>
                      {estagio.resumo}
                    </span>
                  </span>
                </button>
                {selecionado && (
                  <div data-testid={`estagio-detalhe-${estagio.id}`} style={{ padding: "0 2px 12px 23px" }}>
                    <p style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, margin: 0 }}>
                      {estagio.detalhe}
                    </p>
                    {estagio.oQueFalta && (
                      <p style={{ fontSize: 12, color: marca.cor, lineHeight: 1.6, margin: "6px 0 0" }}>
                        <strong>O que falta:</strong> {estagio.oQueFalta}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {detalhe && (
        <p style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 12 }} data-testid="ciclo-fecha">
          O ciclo fecha: o que se aprende usando vira ajuste na configuração, e a configuração muda o próximo documento.
        </p>
      )}
    </section>
  );
}
