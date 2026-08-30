import { CONEXOES, type Conexao } from "./conceito";
import { ESTAGIOS_DO_CICLO, FASES_DA_JORNADA, ROTULO_DA_FASE, type FaseDaJornada } from "./ciclo";
import { MARCA_DE_ESTADO } from "./CicloDoProduto";

/**
 * SPEC-90 — **a jornada, e onde ela fala com fora.**
 *
 * ## O pedido, e por que ele não era repetição
 *
 * > *"falta uma explicação em forma de diagrama que demonstre o processo, mostre
 * > em forma de fluxo quando vai para o MCP, etc. — nesse sentido semelhante a
 * > arquitetura técnica."* E: *"uma visão de jornada, o objetivo é mostrar como o
 * > sistema funciona."*
 *
 * A landing já tinha o círculo e a lista de conexões. O círculo responde *"quais
 * são os estágios, e o que já existe?"* — é **índice**. A lista responde *"que
 * caminhos existem para fora?"*, e nunca **onde**.
 *
 * Isto responde a pergunta que faltava: *"por onde a coisa passa, e em que ponto
 * ela sai para o gateway?"* É percurso, não inventário.
 *
 * ## Por que ele não repete o círculo
 *
 * Existiu uma `Jornada` nesta página, e o §323 a tirou daqui porque **4 das 5
 * etapas dela eram estágios que o círculo acabava de mostrar** — a mesma
 * narrativa contada três vezes.
 *
 * A diferença aqui é deliberada e é o que a trava cobra: **nenhum resumo de
 * estágio aparece.** Só os nomes, agrupados por fase, com as setas e os desvios.
 * Se este diagrama passar a explicar o que cada estágio faz, virou a `Jornada`
 * de novo com outro nome.
 *
 * ## Por que ele não consegue mentir
 *
 * É desenhado a partir de `ESTAGIOS_DO_CICLO` e `CONEXOES` — as duas listas que
 * já são guardadas por travas (§327, §328). Uma fase sem estágio não aparece; uma
 * conexão que aponte para estágio inexistente quebra o teste. É o mesmo mecanismo
 * que a SPEC-76 usou na prosa, aplicado ao desenho.
 *
 * ## O MCP não é caixa nossa
 *
 * O produto **não implementa MCP**: ele chama um gateway configurável, e quem
 * fala MCP é quem está do outro lado (SPEC-81). Por isso o que sai do fluxo vai
 * para uma faixa marcada como **fora**, e não para uma caixa desenhada como se o
 * protocolo morasse aqui dentro.
 */

const LARGURA = 900;
/**
 * A altura da caixa SAI do dado, não de um número escolhido.
 *
 * A captura contra a stack mostrou a fase de entrega — cinco estágios —
 * transbordando a caixa: os dois últimos nomes ficavam fora da borda. Um número
 * fixo funciona até o dia em que uma fase cresce, e aí quebra em silêncio.
 */
const ALTURA_MINIMA_FASE = 74;
const alturaDaFase = (quantos: number) => Math.max(ALTURA_MINIMA_FASE, 42 + quantos * 12);
const ALTURA_FASE = Math.max(
  ...["negocio", "tecnica", "desenho", "ensaio", "entrega", "volta"].map((f) =>
    alturaDaFase(ESTAGIOS_DO_CICLO.filter((e) => e.fase === f).length)
  )
);
const TOPO_FAIXA = 26;
const TOPO_FASES = 150;

/** As fases que têm ao menos um estágio — fase vazia não vira caixa bonita. */
function fasesComEstagio(): FaseDaJornada[] {
  return FASES_DA_JORNADA.filter((f) => ESTAGIOS_DO_CICLO.some((e) => e.fase === f));
}

function estagiosDa(fase: FaseDaJornada) {
  return ESTAGIOS_DO_CICLO.filter((e) => e.fase === fase);
}

/** Em que fase este salto acontece — via o estágio a que ele está ancorado. */
function faseDaConexao(conexao: Conexao): FaseDaJornada | undefined {
  return ESTAGIOS_DO_CICLO.find((e) => e.id === conexao.noEstagio)?.fase;
}

export function OFluxoDoProcesso() {
  const fases = fasesComEstagio();
  const largura = LARGURA / fases.length;

  return (
    <section data-testid="fluxo-do-processo" style={{ maxWidth: 940, margin: "0 auto" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--texto)", margin: "0 0 8px", lineHeight: 1.3 }}>
        Do negócio ao item, e de volta
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--texto-2)", lineHeight: 1.6, margin: "0 0 4px" }}>
        A mesma coisa que o círculo mostra como mapa, vista como percurso — com os pontos em que o processo{" "}
        <strong>fala com o que a casa já tem</strong>. O que entra chega marcado como importado; o que sai vai por um
        endereço que o time configura.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${TOPO_FASES + ALTURA_FASE + 60}`}
        width="100%"
        style={{ display: "block", margin: "12px auto 0" }}
        role="img"
        aria-label="A jornada em fases, do negócio à entrega, com a volta do PDCA e os pontos em que o processo troca informação com sistemas de fora."
      >
        {/* A faixa de FORA, acima: é onde o gateway vive, e ela é declarada como
            de fora justamente porque o produto não implementa MCP. */}
        <rect x={0} y={TOPO_FAIXA} width={LARGURA} height={40} rx={8} fill="var(--painel-alto, rgba(99,102,241,.06))" stroke="var(--borda)" strokeDasharray="5 5" />
        <text x={12} y={TOPO_FAIXA + 16} style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--texto-fraco)" }}>
          FORA — o gateway do time (Jira, Confluence, ADRs, agentes)
        </text>

        {fases.map((fase, i) => {
          const x = i * largura;
          const centro = x + largura / 2;
          const daFase = estagiosDa(fase);
          const conexoes = CONEXOES.filter((c) => faseDaConexao(c) === fase);

          return (
            <g key={fase} data-testid={`fase-${fase}`}>
              {/* A caixa da fase. */}
              <rect
                x={x + 8}
                y={TOPO_FASES}
                width={largura - 16}
                height={ALTURA_FASE}
                rx={10}
                fill="var(--painel)"
                stroke={fase === "volta" ? "#6366f1" : "var(--borda)"}
                strokeWidth={fase === "volta" ? 2 : 1}
              />
              <text x={centro} y={TOPO_FASES + 20} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: "var(--texto)" }}>
                {ROTULO_DA_FASE[fase]}
              </text>
              {daFase.map((estagio, j) => (
                <text
                  key={estagio.id}
                  x={centro}
                  y={TOPO_FASES + 36 + j * 12}
                  textAnchor="middle"
                  style={{ fontSize: 9.5, fill: "var(--texto-2)" }}
                >
                  {estagio.titulo}
                </text>
              ))}

              {/* A seta para a fase seguinte — a jornada anda para a direita. */}
              {i < fases.length - 1 && (
                <path
                  d={`M ${x + largura - 8} ${TOPO_FASES + ALTURA_FASE / 2} L ${x + largura + 8} ${TOPO_FASES + ALTURA_FASE / 2}`}
                  stroke="var(--texto-fraco)"
                  strokeWidth={2}
                  markerEnd="url(#seta)"
                />
              )}

              {/* Os DESVIOS: cada conexão sobe (sai) ou desce (entra) da faixa de
                  fora, no ponto do processo em que acontece. É o que a lista de
                  conexões nunca conseguiu dizer. */}
              {conexoes.map((c, k) => {
                const marca = MARCA_DE_ESTADO[c.estado];
                const xc = centro + (k - (conexoes.length - 1) / 2) * 30;
                const sobe = c.sentido === "sai";
                return (
                  <g key={c.id} data-testid={`salto-${c.id}`}>
                    <path
                      d={`M ${xc} ${sobe ? TOPO_FASES : TOPO_FAIXA + 40} L ${xc} ${sobe ? TOPO_FAIXA + 40 : TOPO_FASES}`}
                      stroke={marca.cor}
                      strokeWidth={2}
                      // Caminho que ainda não existe vai tracejado, e ainda assim
                      // aparece: esconder o que falta seria uma história forte e
                      // incompleta (SPEC-76).
                      strokeDasharray={c.estado === "completo" ? undefined : "4 4"}
                      markerEnd="url(#seta)"
                    />
                    {/**
                     * O rótulo DESCE um degrau por salto.
                     *
                     * A primeira captura contra a stack mostrou os três da fase
                     * de entrega escritos uns por cima dos outros — borrão
                     * ilegível. Empilhar em degraus é o que cabe: a faixa tem
                     * altura, e o que faltava era usá-la.
                     */}
                    <text
                      x={xc}
                      y={TOPO_FAIXA + 58 + k * 22}
                      textAnchor="middle"
                      style={{ fontSize: 9, fill: marca.cor, fontWeight: 700 }}
                    >
                      {sobe ? "↑" : "↓"} {c.titulo}
                    </text>
                    {c.estado !== "completo" && (
                      <text
                        x={xc}
                        y={TOPO_FAIXA + 68 + k * 22}
                        textAnchor="middle"
                        style={{ fontSize: 8.5, fill: marca.cor }}
                      >
                        {marca.rotulo}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* A VOLTA: o que se aprende usando muda a camada perene. É o que faz
            disto um ciclo e não uma esteira, e por isso é desenhada. */}
        <path
          d={`M ${LARGURA - 40} ${TOPO_FASES + ALTURA_FASE + 6} L ${LARGURA - 40} ${TOPO_FASES + ALTURA_FASE + 34} L 40 ${TOPO_FASES + ALTURA_FASE + 34} L 40 ${TOPO_FASES + ALTURA_FASE + 6}`}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2}
          markerEnd="url(#seta-indigo)"
        />
        <text x={LARGURA / 2} y={TOPO_FASES + ALTURA_FASE + 48} textAnchor="middle" style={{ fontSize: 10, fill: "#a5b4fc" }}>
          o que se aprende usando vira ajuste na camada perene — e muda o próximo desenho
        </text>

        <defs>
          <marker id="seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--texto-fraco)" />
          </marker>
          <marker id="seta-indigo" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#6366f1" />
          </marker>
        </defs>
      </svg>
    </section>
  );
}
