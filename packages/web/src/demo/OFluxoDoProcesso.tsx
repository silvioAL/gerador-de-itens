import { CONEXOES, type Conexao } from "./conceito";
import { ESTAGIOS_DO_CICLO, FASES_DA_JORNADA, ROTULO_DA_FASE, type FaseDaJornada } from "./ciclo";
import { MARCA_DE_ESTADO } from "./CicloDoProduto";

/**
 * SPEC-90 — **a jornada, em raias: o que é feito aqui dentro e o que é feito
 * fora.**
 *
 * ## O pedido, e o que a primeira versão errou
 *
 * > *"falta uma explicação em forma de diagrama que demonstre o processo, mostre
 * > em forma de fluxo quando vai para o MCP"* … *"uma visão de jornada, o
 * > objetivo é mostrar como o sistema funciona."*
 *
 * A primeira versão desenhou o percurso e os saltos. O usuário olhou o resultado
 * rodando e apontou dois defeitos, os dois reais:
 *
 * 1. **setas por cima do texto** — os rótulos ficavam soltos na faixa e as linhas
 *    verticais passavam por dentro deles;
 * 2. **não discriminava dentro × fora**, *"como em diagramas mais didáticos de
 *    BPM que têm as personas"*.
 *
 * O segundo é conceitual, e é o que reorganizou a peça: **raias**. Uma para o que
 * este sistema faz, outra para o que já é da casa. A fronteira deixa de ser uma
 * faixa decorativa e passa a ser a linha que as setas atravessam — que é
 * exatamente o que uma raia de BPM comunica.
 *
 * O primeiro deixou de existir por consequência: cada salto virou **caixa dentro
 * da raia de fora**, com o nome dentro dela. Seta e texto não disputam mais o
 * mesmo pixel porque o texto saiu do caminho da seta — em vez de a seta desviar
 * do texto.
 *
 * ## Por que ele não repete o círculo
 *
 * Existiu uma `Jornada` nesta página, e o §323 a tirou daqui porque **4 das 5
 * etapas dela eram estágios que o círculo acabava de mostrar**. A trava em
 * `OFluxoDoProcesso.test.tsx` cobra a diferença: aqui aparecem os **nomes** das
 * paradas, nunca os resumos nem os detalhes. Nome é percurso; prosa é índice, e
 * o índice já está no círculo.
 *
 * ## Por que ele não consegue mentir
 *
 * Desenhado a partir de `ESTAGIOS_DO_CICLO` e `CONEXOES`, que já são guardadas
 * por travas (§327, §328). Fase sem estágio não vira caixa; conexão ancorada em
 * estágio inexistente quebra o teste.
 *
 * ## O MCP não é caixa nossa
 *
 * O produto **não implementa MCP**: chama um gateway configurável, e quem fala
 * MCP está do outro lado (SPEC-81). Por isso o que sai atravessa para a raia de
 * fora, em vez de haver uma caixa de protocolo desenhada aqui dentro.
 */

const COLUNA_RAIA = 96;
const LARGURA_FASES = 1260;
const LARGURA = COLUNA_RAIA + LARGURA_FASES;

/**
 * 30 e não 24: a palavra de estado desceu para uma SEGUNDA linha.
 *
 * "Arquitetura de negócio · ainda não existe" numa linha só vazava a caixa —
 * ~168 px de texto em ~160 px de caixa. Encolher a fonte resolveria hoje e
 * quebraria no próximo nome mais longo; tirar a palavra não é opção, porque
 * status sem palavra é só cor (SPEC-76), e cor sozinha não serve para quem não
 * a distingue.
 *
 * Duas linhas cabem para qualquer nome, e a altura é uniforme para as caixas
 * empilharem alinhadas.
 */
const ALTURA_CAIXA_FORA = 30;
const ESPACO_CAIXA = 6;

function estagiosDa(fase: FaseDaJornada) {
  return ESTAGIOS_DO_CICLO.filter((e) => e.fase === fase);
}

function faseDaConexao(conexao: Conexao): FaseDaJornada | undefined {
  return ESTAGIOS_DO_CICLO.find((e) => e.id === conexao.noEstagio)?.fase;
}

/** As fases que têm ao menos um estágio — fase vazia não vira caixa bonita. */
const FASES = FASES_DA_JORNADA.filter((f) => estagiosDa(f).length > 0);

/**
 * As alturas saem do DADO, e não de números escolhidos.
 *
 * A captura contra a stack mostrou a fase de entrega — cinco estágios —
 * transbordando a caixa. Número fixo funciona até o dia em que uma fase cresce, e
 * aí quebra em silêncio.
 */
const MAIS_SALTOS = Math.max(1, ...FASES.map((f) => CONEXOES.filter((c) => faseDaConexao(c) === f).length));
const ALTURA_FORA = 18 + MAIS_SALTOS * (ALTURA_CAIXA_FORA + ESPACO_CAIXA) + 12;
const ALTURA_FASE = Math.max(...FASES.map((f) => Math.max(74, 44 + estagiosDa(f).length * 13)));
const TOPO_FASES = ALTURA_FORA + 16;
const ALTURA = TOPO_FASES + ALTURA_FASE + 52;

export function OFluxoDoProcesso() {
  const largura = LARGURA_FASES / FASES.length;

  return (
    <section data-testid="fluxo-do-processo" style={{ maxWidth: 1320, margin: "0 auto" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--texto)", margin: "0 0 8px", lineHeight: 1.3 }}>
        Do negócio ao item, e de volta
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--texto-2)", lineHeight: 1.6, margin: "0 0 4px" }}>
        A mesma coisa que o círculo mostra como mapa, vista como percurso — e em duas raias:{" "}
        <strong>o que este sistema faz</strong> e <strong>o que já é da casa</strong>. Toda seta que cruza a linha é um
        ponto em que o produto fala com fora, por um endereço que o time configura.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width="100%"
        style={{ display: "block", margin: "12px auto 0" }}
        role="img"
        aria-label="A jornada em duas raias: fora, as ferramentas que a casa já tem; dentro, as fases do processo, do negócio à entrega, com a volta do aprendizado. As setas que cruzam a linha entre as raias são os pontos em que o produto troca informação com sistemas de fora."
      >
        {/* ── AS RAIAS ──────────────────────────────────────────────────────
            A linha entre elas é a fronteira do sistema, e é ela que as setas
            atravessam. Antes isto era uma faixa solta no topo: bonita, e sem
            dizer de que lado cada coisa acontece. */}
        <rect x={0} y={0} width={LARGURA} height={ALTURA_FORA} fill="var(--painel-alto, rgba(99,102,241,.05))" />
        <rect x={0} y={0} width={LARGURA} height={ALTURA} fill="none" stroke="var(--borda)" />
        <line x1={0} y1={ALTURA_FORA} x2={LARGURA} y2={ALTURA_FORA} stroke="var(--borda)" strokeWidth={2} />
        <line x1={COLUNA_RAIA} y1={0} x2={COLUNA_RAIA} y2={ALTURA} stroke="var(--borda)" strokeWidth={2} />

        <text
          x={COLUNA_RAIA / 2}
          y={ALTURA_FORA / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${COLUNA_RAIA / 2} ${ALTURA_FORA / 2})`}
          style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--texto-fraco)" }}
        >
          FORA · a casa
        </text>
        <text
          x={COLUNA_RAIA / 2}
          y={(ALTURA_FORA + ALTURA) / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${COLUNA_RAIA / 2} ${(ALTURA_FORA + ALTURA) / 2})`}
          style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--texto)" }}
        >
          DENTRO · este sistema
        </text>

        {FASES.map((fase, i) => {
          const x = COLUNA_RAIA + i * largura;
          const centro = x + largura / 2;
          const daFase = estagiosDa(fase);
          const conexoes = CONEXOES.filter((c) => faseDaConexao(c) === fase);

          return (
            <g key={fase} data-testid={`fase-${fase}`}>
              <rect
                x={x + 8}
                y={TOPO_FASES}
                width={largura - 16}
                height={ALTURA_FASE}
                rx={10}
                fill="var(--painel)"
                stroke={fase === "volta" ? "var(--acento-indigo)" : "var(--borda)"}
                strokeWidth={fase === "volta" ? 2 : 1}
              />
              <text x={centro} y={TOPO_FASES + 20} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: "var(--texto)" }}>
                {ROTULO_DA_FASE[fase]}
              </text>
              {daFase.map((estagio, j) => (
                <text
                  key={estagio.id}
                  x={centro}
                  y={TOPO_FASES + 38 + j * 13}
                  textAnchor="middle"
                  // SPEC-91 fatia B — voltou a 10 porque a LARGURA cresceu. O
                  // §334 encolheu a fonte para o pior nome caber; o certo era a
                  // caixa crescer, e o critério continua sendo o pior caso.
                  style={{ fontSize: 10, fill: estagio.aplicacao === "quando-se-aplica" ? "var(--texto-fraco)" : "var(--texto-2)" }}
                >
                  {estagio.titulo}
                  {/* SPEC-91 §2.1 — o que não acontece em toda demanda vai
                      marcado, em vez de a página prometer processo pesado para
                      quem chegou com uma mudança pequena. */}
                  {estagio.aplicacao === "quando-se-aplica" ? " ◇" : ""}
                </text>
              ))}

              {i < FASES.length - 1 && (
                <path
                  d={`M ${x + largura - 8} ${TOPO_FASES + ALTURA_FASE / 2} L ${x + largura + 7} ${TOPO_FASES + ALTURA_FASE / 2}`}
                  stroke="var(--texto-fraco)"
                  strokeWidth={2}
                  markerEnd="url(#seta)"
                />
              )}

              {/* ── OS SALTOS ─────────────────────────────────────────────────
                  Cada um é uma CAIXA na raia de fora, com o nome dentro dela, e a
                  seta sai pela lateral por um canal próprio — à esquerda de todas
                  as caixas, para nunca cruzar nenhuma. */}
              {conexoes.map((c, k) => {
                const marca = MARCA_DE_ESTADO[c.estado];
                const yCaixa = 14 + k * (ALTURA_CAIXA_FORA + ESPACO_CAIXA);
                const meioCaixa = yCaixa + ALTURA_CAIXA_FORA / 2;
                const xCanal = x + 14 + k * 9;
                const esquerdaCaixa = x + 16 + MAIS_SALTOS * 9;
                const sobe = c.sentido === "sai";

                return (
                  <g key={c.id} data-testid={`salto-${c.id}`}>
                    <rect
                      x={esquerdaCaixa}
                      y={yCaixa}
                      width={x + largura - 8 - esquerdaCaixa}
                      height={ALTURA_CAIXA_FORA}
                      rx={6}
                      fill="var(--painel)"
                      stroke={marca.cor}
                      strokeDasharray={c.estado === "completo" ? undefined : "4 3"}
                    />
                    <text
                      x={esquerdaCaixa + 6}
                      y={c.estado === "completo" ? yCaixa + 18 : yCaixa + 13}
                      style={{ fontSize: 8.5, fill: marca.cor, fontWeight: 700 }}
                    >
                      {c.titulo}
                    </text>
                    {c.estado !== "completo" && (
                      <text x={esquerdaCaixa + 6} y={yCaixa + 24} style={{ fontSize: 8, fill: marca.cor }}>
                        {marca.rotulo}
                      </text>
                    )}

                    {/* A ponta diz o sentido: quem SAI aponta para a caixa de
                        fora; quem ENTRA aponta para a fase. */}
                    <path
                      d={
                        sobe
                          ? `M ${xCanal} ${TOPO_FASES} L ${xCanal} ${meioCaixa} L ${esquerdaCaixa - 3} ${meioCaixa}`
                          : `M ${esquerdaCaixa - 3} ${meioCaixa} L ${xCanal} ${meioCaixa} L ${xCanal} ${TOPO_FASES - 3}`
                      }
                      fill="none"
                      stroke={marca.cor}
                      strokeWidth={1.6}
                      strokeDasharray={c.estado === "completo" ? undefined : "4 3"}
                      markerEnd={c.estado === "completo" ? "url(#seta-verde)" : "url(#seta-fraca)"}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* A VOLTA, dentro da raia do sistema: o que se aprende usando muda a
            camada perene. É o que faz disto um ciclo e não uma esteira. */}
        <path
          d={`M ${LARGURA - 44} ${TOPO_FASES + ALTURA_FASE + 6} L ${LARGURA - 44} ${TOPO_FASES + ALTURA_FASE + 26} L ${COLUNA_RAIA + 40} ${TOPO_FASES + ALTURA_FASE + 26} L ${COLUNA_RAIA + 40} ${TOPO_FASES + ALTURA_FASE + 6}`}
          fill="none"
          stroke="var(--acento-indigo)"
          strokeWidth={2}
          markerEnd="url(#seta-indigo)"
        />
        {/* A legenda do ◇: sem ela o símbolo é enfeite. */}
        <text x={COLUNA_RAIA + 8} y={TOPO_FASES + ALTURA_FASE + 42} style={{ fontSize: 9.5, fill: "var(--texto-fraco)" }}>
          ◇ acontece quando se aplica — nem toda demanda passa por todas as paradas
        </text>
        <text
          x={COLUNA_RAIA + LARGURA_FASES / 2}
          y={TOPO_FASES + ALTURA_FASE + 42}
          textAnchor="middle"
          style={{ fontSize: 9.5, fill: "var(--acento-gente-texto)" }}
        >
          o que se aprende usando vira ajuste na camada perene — e muda o próximo desenho
        </text>

        <defs>
          <marker id="seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--texto-fraco)" />
          </marker>
          <marker id="seta-indigo" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--acento-indigo)" />
          </marker>
          <marker id="seta-verde" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--verde)" />
          </marker>
          <marker id="seta-fraca" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--texto-mudo)" />
          </marker>
        </defs>
      </svg>
    </section>
  );
}
