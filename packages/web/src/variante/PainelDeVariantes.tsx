import { useState } from "react";
import { compararVariantes, formatarDuracao, type Diagrama, type DiagramaConfig, type Variante } from "@gerador/engine";

/**
 * SPEC-88 (P6) fatia D — **as duas opções lado a lado, e a adoção que exige o
 * porquê.**
 *
 * ## O que esta tela é, e o que ela recusa ser
 *
 * A pergunta real é *"esta ou aquela?"*. Por isso compara **duas** por vez: três
 * colunas de números lado a lado é uma planilha, e planilha não é o que se lê
 * antes de decidir.
 *
 * Os números **não são digitados aqui**. Vêm de `lerDesenho`, a mesma leitura que
 * o produto já faz sobre o desenho de trabalho — um cálculo próprio para a
 * comparação seria uma segunda verdade sobre o mesmo desenho (§263).
 *
 * ## Por que o porquê é obrigatório
 *
 * Adotar sem registrar seria "copiar e editar" com um passo a mais: daqui a três
 * meses ninguém sabe por que o desenho é este, e a alternativa guardada parece um
 * rascunho esquecido em vez de uma opção descartada com razão.
 *
 * É a régua do §230 pelo outro lado — não bloqueamos aprovar com lacuna marcada,
 * mas bloqueamos gravar decisão vazia, porque decisão vazia não é lacuna marcada:
 * é ausência disfarçada de registro.
 */
export interface PainelDeVariantesProps {
  /** O desenho de trabalho — sempre o adotado. */
  tituloAtual: string;
  diagramaAtual: Diagrama;
  variantes: Variante[];
  config: DiagramaConfig;
  /** Guarda o desenho de agora como alternativa. Não troca nada. */
  onGuardar: (titulo: string) => void;
  /** Adota — troca os dois de lugar e registra a decisão. */
  onAdotar: (varianteId: string, porque: string) => void;
  onFechar: () => void;
}

export function PainelDeVariantes({
  tituloAtual,
  diagramaAtual,
  variantes,
  config,
  onGuardar,
  onAdotar,
  onFechar,
}: PainelDeVariantesProps) {
  /**
   * A escolha é DERIVADA, não congelada no estado inicial.
   *
   * A primeira escrita fazia `useState(variantes[0]?.id ?? null)`: montado com a
   * lista vazia, ficava `null` para sempre, e a variante recém-guardada não
   * abria comparação nenhuma. O unitário não pegou porque montava com a lista já
   * cheia — quem pegou foi o E2E, que exercita a TRANSIÇÃO de vazio para um.
   *
   * `escolhido` é a preferência da pessoa; a lista manda quando essa preferência
   * não existe mais (a variante foi adotada e saiu de lá).
   */
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const comparandoId = variantes.some((v) => v.id === escolhido) ? escolhido : (variantes[0]?.id ?? null);
  const setComparandoId = setEscolhido;
  const [porque, setPorque] = useState("");
  const [tituloNovo, setTituloNovo] = useState("");

  const alvo = variantes.find((v) => v.id === comparandoId);
  const comparacao = alvo
    ? compararVariantes(
        { titulo: tituloAtual, diagrama: diagramaAtual },
        { titulo: alvo.titulo, diagrama: alvo.diagrama },
        config
      )
    : null;

  return (
    <section data-testid="painel-de-variantes" style={caixaEstilo}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>Alternativas de desenho</strong>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={botaoFracoEstilo} data-testid="fechar-variantes">
          fechar
        </button>
      </div>

      <p style={ajudaEstilo}>
        O desenho de agora é o <strong>adotado</strong>. Guarde uma alternativa para compará-la — e adotar troca os dois
        de lugar, registrando a decisão.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          aria-label="Nome da alternativa"
          data-testid="titulo-da-variante"
          value={tituloNovo}
          onChange={(e) => setTituloNovo(e.target.value)}
          placeholder="ex.: Vitrine com fila"
          style={{ ...inputEstilo, flex: 1 }}
        />
        <button
          onClick={() => {
            onGuardar(tituloNovo.trim());
            setTituloNovo("");
          }}
          disabled={!tituloNovo.trim()}
          data-testid="guardar-variante"
          style={botaoEstilo}
        >
          guardar o desenho de agora
        </button>
      </div>

      {variantes.length === 0 && (
        <p style={{ ...ajudaEstilo, marginTop: 12 }} data-testid="sem-variantes">
          {/* Estado legítimo e o mais comum. Uma tabela vazia faria parecer que
              algo falhou ao carregar. */}
          Nenhuma alternativa guardada. A maioria das demandas tem um desenho só, e está certo.
        </p>
      )}

      {variantes.length > 0 && (
        <>
          <div style={{ marginTop: 14 }}>
            <label style={legendaEstilo} htmlFor="comparar-com">
              comparar com
            </label>
            <select
              id="comparar-com"
              value={comparandoId ?? ""}
              onChange={(e) => setComparandoId(e.target.value)}
              data-testid="escolher-variante"
              style={{ ...inputEstilo, display: "block", marginTop: 4, width: 260 }}
            >
              {variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}
                </option>
              ))}
            </select>
          </div>

          {comparacao && (
            <table style={tabelaEstilo} data-testid="comparacao-de-variantes">
              <thead>
                <tr>
                  <th style={thEstilo}> </th>
                  <th style={thEstilo}>{comparacao.a.titulo} (adotado)</th>
                  <th style={thEstilo}>{comparacao.b.titulo}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdEstilo}>Pior trecho que espera</td>
                  {[comparacao.a, comparacao.b].map((lado, i) => (
                    <td key={i} style={tdEstilo} data-testid={`pior-trecho-${i === 0 ? "a" : "b"}`}>
                      {/* "não medido" e não "0": tratar ausência como zero faria
                          o desenho sem dado nenhum parecer o mais rápido. */}
                      {lado.piorTrechoMs === undefined ? "não medido" : formatarDuracao(lado.piorTrechoMs)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdEstilo}>Pontos que esperam por mais de um</td>
                  <td style={tdEstilo}>{comparacao.a.pontosDeFanOut}</td>
                  <td style={tdEstilo}>{comparacao.b.pontosDeFanOut}</td>
                </tr>
                <tr>
                  <td style={tdEstilo}>Conexões sem tempo declarado</td>
                  <td style={tdEstilo}>{comparacao.a.naoMedido}</td>
                  <td style={tdEstilo}>{comparacao.b.naoMedido}</td>
                </tr>
              </tbody>
            </table>
          )}

          {comparacao && (
            <p style={ajudaEstilo} data-testid="diferenca-das-variantes">
              {comparacao.diferencaMs === undefined
                ? "Sem os dois números, não há diferença a calcular — e inventar uma seria pior que não ter."
                : comparacao.diferencaMs === 0
                  ? "As duas somam o mesmo no pior trecho."
                  : `${comparacao.b.titulo} ${comparacao.diferencaMs > 0 ? "soma" : "economiza"} ${formatarDuracao(Math.abs(comparacao.diferencaMs))} no pior trecho.`}
            </p>
          )}

          <div style={{ marginTop: 14, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
            <label style={legendaEstilo} htmlFor="porque-adotar">
              por que adotar esta
            </label>
            <textarea
              id="porque-adotar"
              value={porque}
              onChange={(e) => setPorque(e.target.value)}
              rows={2}
              data-testid="porque-adotar"
              placeholder="ex.: a fila tira o parceiro do caminho da resposta"
              style={{ ...inputEstilo, display: "block", width: "100%", marginTop: 4, resize: "vertical" }}
            />
            <button
              onClick={() => {
                if (comparandoId) onAdotar(comparandoId, porque.trim());
                setPorque("");
              }}
              // Sem o porquê o botão nem habilita: o motor recusa, e deixar
              // clicar para receber erro é ensinar a ignorar o campo.
              disabled={!porque.trim() || !comparandoId}
              data-testid="adotar-variante"
              style={{ ...botaoEstilo, marginTop: 8 }}
            >
              adotar “{alvo?.titulo}”
            </button>
            <p style={{ ...ajudaEstilo, marginTop: 6 }}>
              O desenho de agora vira alternativa, e a escolha entra nas decisões da demanda.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 10,
  padding: "12px 14px",
  marginTop: 12,
};

const ajudaEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--texto-fraco)",
  lineHeight: 1.6,
  margin: "6px 0 0",
};

const legendaEstilo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--texto-fraco)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const tabelaEstilo: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
  fontSize: 12.5,
};

const thEstilo: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--borda)",
  color: "var(--texto)",
  fontSize: 11.5,
};

const tdEstilo: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--borda)",
  color: "var(--texto-2)",
};

const inputEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 7,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const botaoFracoEstilo: React.CSSProperties = {
  ...botaoEstilo,
  background: "transparent",
  color: "var(--texto-2)",
  border: "1px solid var(--borda)",
};
