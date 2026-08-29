/**
 * SPEC-85 fatia C / SPEC-82 fase 1 — **o passo contido.**
 *
 * ## Por que esta peça se move, e as outras não
 *
 * A régua que a SPEC-85 §2 declara: *movimento que não carrega informação que o
 * estático não carrega, não entra.* Três das quatro peças do conceito passam sem
 * movimento — camadas, evolução e conexões são **estruturas**, e estrutura se lê
 * parada.
 *
 * Esta é a exceção porque a tese do produto é uma **ausência de comportamento**:
 *
 * > a IA propõe, e não aplica sozinha.
 *
 * Ausência não tem o que apontar. Um diagrama estático só pode **afirmá-la** —
 * escrever "espera confirmação" ao lado de uma seta. O tempo pode **mostrá-la**:
 * a proposta anda, chega ao portão, e **para**. E fica parada. E continua parada.
 *
 * ## O que é a informação, exatamente
 *
 * **A espera ocupa 40% do ciclo, e é a única parte em que nada acontece.** Esse
 * vazio é a peça inteira. Encurtá-lo para "ficar mais fluido" apagaria o que ela
 * existe para dizer, e é por isso que o número está escrito no CSS com o motivo
 * ao lado, e não escolhido no olho.
 *
 * A ordem também é informação: **o carimbo humano aparece antes de o portão
 * abrir**, nunca depois. Primeiro alguém confirma, depois a coisa passa. Invertida,
 * a animação contaria a história de um produto diferente.
 *
 * ## Movimento reduzido não perde nada
 *
 * Quem pede `prefers-reduced-motion` recebe **o quadro que carrega a tese**: a
 * proposta parada no portão, com o carimbo apagado. Não é uma versão degradada —
 * é o mesmo enunciado, sem o tempo. Isso não é gentileza: uma peça cuja versão
 * estática não diz nada é uma peça que não estava dizendo nada.
 *
 * (A guarda global entrou junto, em `styles.css`: o produto tinha catorze
 * `@keyframes` e nenhuma pergunta sobre movimento reduzido.)
 */

const LARGURA = 560;
const ALTURA = 132;
const CAMINHO = `M 96 66 L 464 66`;

export function OPassoContido() {
  return (
    <section data-testid="passo-contido" style={{ maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--texto)", margin: "0 0 8px", lineHeight: 1.3 }}>
        Propõe. E para.
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--texto-2)", lineHeight: 1.6, margin: "0 0 4px" }}>
        Toda proposta da IA chega até um ponto e espera. O que abre o portão é alguém confirmando — não o tempo, não a
        confiança no modelo, não a ausência de erro aparente.
      </p>
      {/* O enunciado em texto vem ANTES da figura, e não como legenda dela:
          quem não vê a animação (leitor de tela, movimento reduzido, imagem
          bloqueada) precisa ter a tese inteira sem ela. */}

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width="100%"
        style={{ maxWidth: LARGURA, display: "block", margin: "10px auto 0" }}
        role="img"
        aria-label="Uma proposta da IA percorre o caminho até um portão, espera, e só passa depois que uma pessoa confirma."
      >
        {/* O trilho — cinza e tracejado: é caminho possível, não caminho feito. */}
        <path d={CAMINHO} stroke="var(--borda)" strokeWidth={2} strokeDasharray="5 6" fill="none" />

        {/* A origem: a IA. */}
        <circle cx={62} cy={66} r={30} fill="var(--painel-alto, rgba(99,102,241,.08))" stroke="#6366f1" strokeWidth={2} />
        <text x={62} y={70} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: "var(--texto)" }}>
          IA
        </text>

        {/* O PORTÃO, no meio do caminho. É o objeto mais importante do desenho, e
            por isso tem peso: linha cheia, cor de gente. */}
        <line x1={266} y1={30} x2={266} y2={102} stroke="#4f46e5" strokeWidth={3} strokeLinecap="round" />
        <text x={266} y={22} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: "#a5b4fc" }}>
          alguém confirma
        </text>
        <g className="passo-contido-carimbo">
          <circle cx={266} cy={116} r={9} fill="#4f46e5" />
          <text x={266} y={120} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}>
            ✓
          </text>
        </g>

        {/* O destino: o artefato. */}
        <rect x={468} y={40} width={64} height={52} rx={8} fill="none" stroke="var(--borda)" strokeWidth={2} />
        <text x={500} y={62} textAnchor="middle" style={{ fontSize: 10.5, fill: "var(--texto-2)" }}>
          o que
        </text>
        <text x={500} y={76} textAnchor="middle" style={{ fontSize: 10.5, fill: "var(--texto-2)" }}>
          fica valendo
        </text>

        {/* A proposta. `offsetPath` põe o movimento no caminho declarado acima —
            uma coordenada só, em vez de dois keyframes que precisam concordar. */}
        <circle
          className="passo-contido-proposta"
          r={7}
          fill="#6366f1"
          style={{ offsetPath: `path("${CAMINHO}")`, offsetRotate: "0deg" }}
        />
      </svg>

      <p style={{ fontSize: 12, color: "var(--texto-fraco)", lineHeight: 1.6, margin: "8px 0 0", textAlign: "center" }}>
        A pausa no meio não é um detalhe da animação. É o produto.
      </p>
    </section>
  );
}
