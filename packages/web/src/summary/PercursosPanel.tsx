import { useEffect, useRef, useState } from "react";
import type { Percurso, PercursoNaoMedido, Remedicao, ViolacaoDePercurso } from "@gerador/engine";
import { Delta } from "./Delta";

/**
 * SPEC-57 fatia E — os CAMINHOS do desenho, no placar.
 *
 * O chip cobra três coisas diferentes e diz qual, porque cada uma pede uma ação
 * diferente de quem lê:
 *
 * - **a confirmar** — o motor inferiu caminhos e ninguém olhou. Inferir é
 *   grátis e erra (§5 pergunta 4 da SPEC-57), então nada é medido antes do
 *   aceite;
 * - **fora do padrão** — um caminho confirmado estourou a régua;
 * - **sem medir** — a régua não conseguiu rodar porque falta campo no caminho.
 *   Este é o estado que mais importa não esconder: somar só o que existe
 *   produziria um verde falso, e verde falso encerra a pergunta.
 */
export interface PercursosPanelProps {
  percursos: Percurso[];
  violacoes: ViolacaoDePercurso[];
  naoMedidos: PercursoNaoMedido[];
  /** `true` quando a inferência parou no teto — a lista está incompleta. */
  truncado?: boolean;
  onConfirmar: (id: string) => void;
  onDescartar: (id: string) => void;
  /** SPEC-60 fatia A — o que confirmar ESTE caminho põe no backlog. Devolver
   * `undefined` (ou não passar) é dizer "não sei medir", e aí o botão fica
   * como era: confirmar nunca depende de haver medição. */
  remedirConfirmacao?: (id: string) => Remedicao | undefined;
  /** Leva ao primeiro nó do caminho — sem isto o número seria um beco. */
  onSelecionarNo?: (noId: string) => void;
}

export function PercursosPanel({
  percursos,
  violacoes,
  naoMedidos,
  truncado,
  onConfirmar,
  onDescartar,
  onSelecionarNo,
  remedirConfirmacao,
}: PercursosPanelProps) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Três estados, não dois: `undefined` = o motor inferiu e ninguém olhou;
  // `true` = confirmado; `false` = a pessoa disse que não é caminho. Tratar
  // `false` como "a confirmar" faria o botão "não é caminho" não fazer nada —
  // o inferidor devolveria o mesmo caminho no render seguinte, para sempre.
  const aConfirmar = percursos.filter((p) => p.origem === "inferido" && p.confirmado === undefined);
  const confirmados = percursos.filter((p) => p.confirmado === true);
  const cobra = violacoes.length + naoMedidos.length + aConfirmar.length;

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="percursos-resumo"
        onClick={() => setAberto((a) => !a)}
        title="Os caminhos que uma requisição faz pelo desenho, e as réguas que valem sobre eles"
        style={{
          ...botaoEstilo,
          borderColor: cobra > 0 ? "var(--amarelo)" : "var(--borda-forte)",
          color: cobra > 0 ? "var(--amarelo)" : "var(--texto-fraco)",
        }}
      >
        {/* A ordem importa: o que exige ação primeiro. */}
        🛣{" "}
        {violacoes.length > 0
          ? `${violacoes.length} caminho(s) fora do padrão`
          : naoMedidos.length > 0
            ? `${naoMedidos.length} sem medir`
            : aConfirmar.length > 0
              ? `${aConfirmar.length} caminho(s) a confirmar`
              : `${confirmados.length} caminho(s)`}
      </button>

      {aberto && (
        <div data-testid="percursos-lista" style={popoverEstilo}>
          {violacoes.map((v) => (
            <div key={`v-${v.percursoId}-${v.texto}`} data-testid="percurso-violacao" style={linhaEstilo}>
              <strong style={{ fontSize: 12, color: "var(--amarelo)" }}>{v.rotulo}</strong>
              <div style={{ fontSize: 11 }}>
                {v.texto}: esperado {v.esperado}, está <strong>{v.atual}</strong>
              </div>
              {/* §242 — o porquê é o que separa ensinar de cobrar. */}
              {v.porque && <div style={{ fontSize: 11, color: "var(--texto-fraco)" }}>{v.porque}</div>}
            </div>
          ))}

          {naoMedidos.map((n) => (
            <div key={`n-${n.percursoId}-${n.campo}`} data-testid="percurso-nao-medido" style={linhaEstilo}>
              <strong style={{ fontSize: 12 }}>{n.rotulo}</strong>
              <div style={{ fontSize: 11, color: "var(--texto-fraco)" }}>
                {/* Dizer o que falta, e não só que falhou: sem os ids, "não deu
                    para medir" é uma reclamação sem endereço. */}
                não dá para medir "{n.texto}" — falta <strong>{n.campo}</strong> em{" "}
                {n.nosSemValor.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ", "}
                    <button style={linkEstilo} onClick={() => onSelecionarNo?.(id)}>
                      {id}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}

          {aConfirmar.length > 0 && (
            <div style={{ ...linhaEstilo, borderBottom: "none" }}>
              <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginBottom: 4 }}>
                O motor leu estes caminhos no desenho. Nada é medido antes de você confirmar — inferir é grátis e erra.
              </div>
              {aConfirmar.map((p) => (
                <div key={p.id} data-testid="percurso-a-confirmar" style={{ padding: "3px 0" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button style={linkEstilo} onClick={() => onSelecionarNo?.(p.nos[0])}>
                      {p.rotulo}
                    </button>
                    <div style={{ flex: 1 }} />
                    <button style={botaoMiniEstilo} onClick={() => onConfirmar(p.id)} data-testid={`confirmar-${p.id}`}>
                      confirmar
                    </button>
                    <button style={linkEstilo} onClick={() => onDescartar(p.id)}>
                      não é caminho
                    </button>
                  </div>
                  {/* §263 — o preço de confirmar, ANTES de confirmar. Aqui o
                      delta é o único aviso possível: o item que a confirmação
                      cria (§249) só apareceria depois, no backlog derivado. */}
                  {(() => {
                    const remedicao = remedirConfirmacao?.(p.id);
                    return remedicao ? (
                      <Delta data-testid={`delta-percurso-${p.id}`} titulo="Se confirmar este caminho" remedicao={remedicao} />
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}

          {confirmados.length > 0 && violacoes.length === 0 && naoMedidos.length === 0 && (
            <div style={{ ...linhaEstilo, borderBottom: "none", fontSize: 11, color: "var(--texto-fraco)" }}>
              {confirmados.map((p) => (
                <div key={p.id} data-testid="percurso-confirmado">
                  ✓ {p.rotulo}
                </div>
              ))}
            </div>
          )}

          {truncado && (
            <div data-testid="percursos-truncado" style={{ ...linhaEstilo, borderBottom: "none", fontSize: 11, color: "var(--texto-mudo)" }}>
              O desenho tem mais caminhos do que cabe listar — estes são os primeiros. Um grafo muito conectado
              costuma indicar que falta um limite de contexto, não que faltam caminhos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 70,
  minWidth: 380,
  maxWidth: 520,
  maxHeight: 320,
  overflow: "auto",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
  textAlign: "left",
};

const linhaEstilo: React.CSSProperties = {
  padding: "8px 4px",
  borderBottom: "1px solid var(--borda)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const linkEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
  textAlign: "left",
};

const botaoMiniEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};
