import { useEffect, useRef, useState } from "react";
import type { Diagrama, DiagramaConfig, Necessidade, RegrasConfig } from "@gerador/engine";
import type { ExcecaoDePadrao, Violacao } from "@gerador/engine";
import { analisarLacunas, avaliarConformidade, violacoesEmAberto } from "@gerador/engine";
import { ReadinessBadge } from "./ReadinessBadge";
import { calcularResumoProntidao, type NoComProntidao } from "./prontidaoResumo";

export interface ReadinessSummaryProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  onSelecionar: (id: string) => void;
  /** SPEC-57 fatia A — o propósito da demanda. Sem necessidade declarada o
   * indicador não aparece: a dimensão nova não pode acusar quem nunca a usou. */
  necessidades?: Necessidade[];
  /** Abre o painel onde a lacuna se resolve. Sem isto o número seria um beco. */
  onAbrirProposito?: () => void;
  /** §239 — as regras do time; sem elas não há padrão a conferir, e o
   * indicador de conformidade não aparece. */
  regras?: RegrasConfig;
  /** Leva ao nó que viola — o equivalente ao "Próximo pendente". */
  onSelecionarViolacao?: (noId: string) => void;
  /** §242 — as violações já aceitas de propósito. */
  excecoes?: ExcecaoDePadrao[];
  /** §242 — aceitar uma violação, com motivo. Ausente = a válvula não aparece. */
  onAceitarViolacao?: (violacao: Violacao, motivo: string) => void;
}

export function ReadinessSummary({
  diagrama,
  config,
  onSelecionar,
  necessidades,
  onAbrirProposito,
  regras,
  onSelecionarViolacao,
  excecoes,
  onAceitarViolacao,
}: ReadinessSummaryProps) {
  const { vermelhos, amarelos, verdes } = calcularResumoProntidao(diagrama, config);
  // Dimensão PROPÓSITO (SPEC-56 §0.6): mesma barra, mais uma razão. Amarelo e
  // não vermelho de propósito: lacuna de propósito avisa, não bloqueia derivar
  // — bloquear no primeiro dia ensinaria a ignorar a cor.
  const lacunas = analisarLacunas(diagrama, necessidades ?? []);
  const semElemento = lacunas.semElemento.length;
  // §239 — dimensão CONFORMIDADE: quais padrões este desenho viola. Amarelo
  // como o propósito: acusa, não bloqueia. Bloquear no primeiro dia ensinaria
  // a ignorar a cor, e a decisão de bloquear é do portão, não da medida.
  // §242 — o placar conta só as que ainda cobram alguém. As aceitas de
  // propósito continuam existindo (`avaliarConformidade` as devolve marcadas):
  // some do vermelho, não do histórico.
  const violacoes = violacoesEmAberto(avaliarConformidade(diagrama, config, regras, excecoes ?? []));
  const pendentes = [...vermelhos, ...amarelos];
  const indicePendenteRef = useRef(0);

  function irParaProximoPendente() {
    if (pendentes.length === 0) return;
    const item = pendentes[indicePendenteRef.current % pendentes.length];
    indicePendenteRef.current += 1;
    onSelecionar(item.no.id);
  }

  return (
    <div
      data-tour="readiness-summary"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 16px",
        borderBottom: "1px solid var(--borda)",
        background: "var(--painel)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <ContagemComLista rotulo="vermelho" itens={vermelhos} onSelecionar={onSelecionar} />
      <ContagemComLista rotulo="amarelo" itens={amarelos} onSelecionar={onSelecionar} />
      <span style={{ color: "var(--verde)" }}>
        <ReadinessBadge nivel="verde" /> {verdes.length}
      </span>
      {(necessidades?.length ?? 0) > 0 && (
        <button
          data-testid="proposito-resumo"
          onClick={onAbrirProposito}
          title="Necessidades da demanda sem nenhum componente que responda por elas"
          style={{
            ...botaoProximoEstilo,
            borderColor: semElemento > 0 ? "var(--amarelo)" : "var(--borda-forte)",
            color: semElemento > 0 ? "var(--amarelo)" : "var(--texto-fraco)",
          }}
        >
          🎯 {semElemento > 0 ? `${semElemento} sem componente` : "propósito coberto"}
        </button>
      )}
      {violacoes.length > 0 && (
        <ListaDeViolacoes violacoes={violacoes} onSelecionar={onSelecionarViolacao} onAceitar={onAceitarViolacao} />
      )}
      {pendentes.length > 0 && (
        <button onClick={irParaProximoPendente} style={botaoProximoEstilo}>
          ▶ Próximo pendente ({pendentes.length})
        </button>
      )}
    </div>
  );
}

/**
 * §242 — as violações, com o PORQUÊ do padrão e a válvula para contrariá-lo.
 *
 * Chip só com número não ensina nada: a SPEC-56 §0.7 diz que a mesa deve
 * explicar o padrão, não só cobrá-lo — "forçar a decisão sem explicar produz
 * obediência; explicar produz critério". E sem uma saída legítima a pessoa
 * aprende a ignorar o amarelo, que mata a medição inteira (regra 3).
 */
function ListaDeViolacoes({
  violacoes,
  onSelecionar,
  onAceitar,
}: {
  violacoes: Violacao[];
  onSelecionar?: (noId: string) => void;
  onAceitar?: (violacao: Violacao, motivo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [aceitando, setAceitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="conformidade-resumo"
        onClick={() => setAberto((a) => !a)}
        style={{ ...botaoProximoEstilo, borderColor: "var(--amarelo)", color: "var(--amarelo)" }}
      >
        ⚖ {violacoes.length} fora do padrão
      </button>

      {aberto && (
        <div data-testid="conformidade-lista" style={popoverEstilo}>
          {violacoes.map((v) => {
            const id = `${v.noId}::${v.campo}`;
            return (
              <div key={id} data-testid={`violacao-${id}`} style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}>
                <button
                  onClick={() => onSelecionar?.(v.noId)}
                  style={{ ...itemPopoverEstilo, fontWeight: 600 }}
                >
                  {v.noLabel}: {v.campo} {v.esperado} — está {v.atual}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-fraco)", padding: "2px 6px" }}>{v.texto}</div>
                {/* O porquê é o que separa ensinar de cobrar. */}
                {v.porque && (
                  <div data-testid={`porque-${id}`} style={{ fontSize: 11, color: "var(--texto-mudo)", padding: "2px 6px" }}>
                    Por quê: {v.porque}
                  </div>
                )}

                {onAceitar &&
                  (aceitando === id ? (
                    <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                      <input
                        aria-label={`Motivo para aceitar: ${v.texto}`}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ex.: o parceiro não suporta menos que isso"
                        style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)" }}
                      />
                      <button
                        aria-label={`Confirmar exceção: ${v.texto}`}
                        disabled={motivo.trim() === ""}
                        onClick={() => {
                          onAceitar(v, motivo.trim());
                          setAceitando(null);
                          setMotivo("");
                        }}
                        style={{ ...botaoProximoEstilo, fontSize: 11 }}
                      >
                        Registrar
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`Aceitar de propósito: ${v.texto}`}
                      onClick={() => {
                        setAceitando(id);
                        setMotivo("");
                      }}
                      style={{ ...itemPopoverEstilo, fontSize: 11, color: "var(--texto-fraco)" }}
                    >
                      aceitar de propósito…
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContagemComLista({
  rotulo,
  itens,
  onSelecionar,
}: {
  rotulo: "vermelho" | "amarelo";
  itens: NoComProntidao[];
  onSelecionar: (id: string) => void;
}) {
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

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={itens.length === 0}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: itens.length > 0 ? "pointer" : "default",
          font: "inherit",
        }}
      >
        <ReadinessBadge nivel={rotulo} /> {itens.length}
      </button>
      {aberto && itens.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--painel)",
            border: "1px solid var(--borda)",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
            zIndex: 30,
            minWidth: 240,
            maxWidth: 320,
            padding: "4px 0",
          }}
        >
          {itens.map((item) => (
            <button
              key={item.no.id}
              onClick={() => {
                onSelecionar(item.no.id);
                setAberto(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "6px 10px",
                background: "none",
                border: "none",
                borderBottom: "1px solid var(--borda)",
                cursor: "pointer",
                color: "var(--texto-2)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.no.label}</div>
              {item.camposFaltando.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginTop: 2 }}>
                  {item.camposFaltando.slice(0, 3).join(", ")}
                  {item.camposFaltando.length > 3 && ` +${item.camposFaltando.length - 3}`}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mesmo desenho do popover de prontidão logo acima — a dimensão é nova, a
 * linguagem visual não. */
const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 8,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
  zIndex: 30,
  minWidth: 280,
  maxWidth: 380,
  padding: "4px 0",
};

const itemPopoverEstilo: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "4px 6px",
  cursor: "pointer",
  font: "inherit",
  fontSize: 12,
  color: "var(--texto)",
};

const botaoProximoEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "rgba(99, 102, 241, 0.14)",
  color: "#a5b4fc",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
