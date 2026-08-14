import { useEffect, useState } from "react";
import type { DiagramaConfig, No, Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import { Jornada } from "./Jornada";

// "perfis" saiu daqui pra ConfigScreen.tsx — é config recorrente de time, não
// onboarding/demo (ver SPEC-08 §3.5).
// A aba "cli" morreu com o modo local (SPEC-33) — a revisão geral da demo
// (pedido do usuário: "fala de CLI, que nem temos mais") tirou o resto.
export type AbaJornada = "jornada" | "cenarios";

export interface JourneyModalProps {
  config: DiagramaConfig;
  cenarios: Cenario[];
  onFechar: () => void;
  onCarregarCenario: (quebra: Quebra) => void;
  onAdicionarCenario: (quebra: Quebra) => void;
  onIniciarTour: () => void;
  /** Demo autoplay (SPEC-17 Fase I) — aditiva ao tour clicável, mesma lista de passos. */
  onIniciarDemoAutomatica: () => void;
  /** Troca a aba ativa de fora (usado pelo tour guiado pra abrir/navegar entre abas sem fechar e reabrir a modal). */
  abaForcada?: AbaJornada;
}

export function JourneyModal({
  config,
  cenarios,
  onFechar,
  onCarregarCenario,
  onAdicionarCenario,
  onIniciarTour,
  onIniciarDemoAutomatica,
  abaForcada,
}: JourneyModalProps) {
  const [aba, setAba] = useState<AbaJornada>(abaForcada ?? "jornada");

  useEffect(() => {
    if (abaForcada) setAba(abaForcada);
  }, [abaForcada]);

  function carregar(cenario: Cenario) {
    onCarregarCenario(cenario.quebra);
    onFechar();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
      onClick={onFechar}
    >
      <div
        data-tour="journey-modal-content"
        style={{
          background: "var(--painel)",
          borderRadius: 16,
          width: "min(920px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--borda)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--texto)" }}>Como funciona o Gerador de Itens</div>
            <div style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 2 }}>
              Não é um gerador de prompt de IA — é um mecanismo determinístico, do diagrama à especificação de solução.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onIniciarDemoAutomatica} style={botaoDemoAutomaticaEstilo}>
            ▶ Demonstração automática
          </button>
          <button onClick={onIniciarTour} style={botaoTourEstilo}>
            ▶ Iniciar tour guiado
          </button>
          <button onClick={onFechar} style={botaoFecharEstilo} aria-label="Fechar">
            ×
          </button>
        </header>

        <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
          <button onClick={() => setAba("jornada")} style={aba === "jornada" ? abaAtivaEstilo : abaEstilo}>
            A jornada
          </button>
          <button onClick={() => setAba("cenarios")} style={aba === "cenarios" ? abaAtivaEstilo : abaEstilo}>
            Cenários prontos ({cenarios.length})
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {aba === "jornada" && <Jornada />}
          {aba === "cenarios" && (
            <Cenarios cenarios={cenarios} config={config} onCarregar={carregar} onAdicionar={onAdicionarCenario} />
          )}
        </div>
      </div>
    </div>
  );
}


const ROTULO_CATEGORIA: Record<Cenario["categoria"], string> = {
  demo: "demo",
  "padrao-arquitetural": "arquitetura de referência",
  "aprendido-do-time": "aprendido do time",
};

function Cenarios({
  cenarios,
  config,
  onCarregar,
  onAdicionar,
}: {
  cenarios: Cenario[];
  config: DiagramaConfig;
  onCarregar: (c: Cenario) => void;
  onAdicionar: (quebra: Quebra) => void;
}) {
  const [adicionadoId, setAdicionadoId] = useState<string | null>(null);

  function adicionar(cenario: Cenario) {
    onAdicionar(cenario.quebra);
    setAdicionadoId(cenario.id);
    setTimeout(() => setAdicionadoId((atual) => (atual === cenario.id ? null : atual)), 1500);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {cenarios.map((cenario) => (
        <div
          key={cenario.id}
          style={{
            border: cenario.destaque ? "1.5px solid #4f46e5" : "1px solid var(--borda)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: cenario.destaque ? "rgba(99, 102, 241, 0.14)" : "var(--painel)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {cenario.destaque && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "#4f46e5",
                  color: "#fff",
                }}
              >
                fluxo completo
              </span>
            )}
            {cenario.categoria !== "demo" && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "rgba(62, 207, 142, 0.16)",
                  color: "var(--verde)",
                }}
              >
                {ROTULO_CATEGORIA[cenario.categoria]}
              </span>
            )}
            <strong style={{ fontSize: 13, color: "var(--texto)" }}>{cenario.titulo}</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: 0, lineHeight: 1.45, flex: 1 }}>{cenario.descricao}</p>
          {cenario.designPatterns.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {cenario.designPatterns.map((padrao) => (
                <span
                  key={padrao}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: "rgba(99, 102, 241, 0.16)",
                    color: "#6d28d9",
                  }}
                >
                  {padrao}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {cenario.tipos.map((tipo) => (
              <span
                key={tipo}
                title={config.nodeTypes[tipo]?.label ?? tipo}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: config.nodeTypes[tipo]?.color ?? "#94a3b8",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onCarregar(cenario)}
              style={{ ...botaoCarregarEstilo, flex: 1 }}
              aria-label={`Carregar cenário: ${cenario.titulo}`}
              title="Substitui o diagrama atual por este cenário"
            >
              Carregar no canvas
            </button>
            <button
              onClick={() => adicionar(cenario)}
              style={{ ...botaoAdicionarEstilo, flex: 1 }}
              aria-label={`Adicionar cenário ao canvas: ${cenario.titulo}`}
              title="Injeta os nós deste cenário no diagrama atual, sem substituir"
            >
              {adicionadoId === cenario.id ? "✓ Adicionado" : "+ Adicionar ao canvas"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: "8px 8px 0 0",
  border: "none",
  borderBottom: "2px solid transparent",
  background: "none",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  color: "#a5b4fc",
  borderBottom: "2px solid #4f46e5",
};

const botaoDemoAutomaticaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "#a5b4fc",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoTourEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoFecharEstilo: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const botaoCarregarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "var(--painel)",
  color: "#a5b4fc",
  cursor: "pointer",
};
