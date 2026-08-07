import { useEffect, useState } from "react";
import { COMANDOS } from "./FakeTerminal";

const VELOCIDADE_DIGITACAO_MS = 28;
const PAUSA_ANTES_DA_SAIDA_MS = 250;
const PAUSA_DEPOIS_DA_SAIDA_MS = 900;

/** Tempo total pra digitar + revelar a saída de todos os comandos, um atrás do
 * outro — achado real: a demonstração automática (useAutoDemo.ts) avançava pro
 * próximo passo antes do terminal terminar de digitar tudo, cortando a
 * demonstração no meio. Exportado pra o passo "Linha de comando" do tour usar
 * como piso de duração, em vez de duas constantes desincronizadas. */
export const DURACAO_TOTAL_TERMINAL_MS = COMANDOS.reduce(
  (total, c) => total + c.comando.length * VELOCIDADE_DIGITACAO_MS + PAUSA_ANTES_DA_SAIDA_MS + PAUSA_DEPOIS_DA_SAIDA_MS,
  0
);

/**
 * Variante animada do FakeTerminal — digita cada comando caractere a
 * caractere, revela a saída, pausa, e avança pro próximo. Usado só nos
 * passos de CLI da demonstração automática (JourneyModal); a aba estática
 * "Linha de comando" continua usando FakeTerminal, sem autoplay. Reaproveita
 * a mesma lista COMANDOS — uma fonte só pras duas apresentações.
 */
export function TerminalAnimado() {
  const [linhaAtual, setLinhaAtual] = useState(0);
  const [charsDigitados, setCharsDigitados] = useState(0);
  const [mostrarSaida, setMostrarSaida] = useState(false);

  const linha = COMANDOS[linhaAtual];

  useEffect(() => {
    if (!linha) return;

    if (!mostrarSaida && charsDigitados < linha.comando.length) {
      const id = setTimeout(() => setCharsDigitados((n) => n + 1), VELOCIDADE_DIGITACAO_MS);
      return () => clearTimeout(id);
    }

    if (!mostrarSaida) {
      const id = setTimeout(() => setMostrarSaida(true), PAUSA_ANTES_DA_SAIDA_MS);
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      setLinhaAtual((n) => n + 1);
      setCharsDigitados(0);
      setMostrarSaida(false);
    }, PAUSA_DEPOIS_DA_SAIDA_MS);
    return () => clearTimeout(id);
  }, [linha, charsDigitados, mostrarSaida]);

  const linhasAnteriores = COMANDOS.slice(0, linhaAtual);

  return (
    <div style={janelaEstilo} data-testid="terminal-animado">
      <style>{`
        @keyframes gerador-cursor-terminal-pisca { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
      `}</style>
      <div style={barraEstilo}>
        <span style={{ ...bolinhaEstilo, background: "#ef4444" }} />
        <span style={{ ...bolinhaEstilo, background: "#f59e0b" }} />
        <span style={{ ...bolinhaEstilo, background: "#22c55e" }} />
        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>terminal</span>
      </div>
      <div style={corpoEstilo}>
        {linhasAnteriores.map((l) => (
          <div key={l.comando} style={{ marginBottom: 14 }}>
            <div>
              <span style={{ color: "#4ade80" }}>$</span> <span style={{ color: "#e2e8f0" }}>{l.comando}</span>
            </div>
            <pre style={saidaEstilo}>{l.saida}</pre>
          </div>
        ))}
        {linha && (
          <div style={{ marginBottom: 14 }}>
            <div>
              <span style={{ color: "#4ade80" }}>$</span>{" "}
              <span style={{ color: "#e2e8f0" }}>{linha.comando.slice(0, charsDigitados)}</span>
              {!mostrarSaida && (
                <span style={{ animation: "gerador-cursor-terminal-pisca 1s step-start infinite", color: "#e2e8f0" }}>
                  ▋
                </span>
              )}
            </div>
            {mostrarSaida && <pre style={saidaEstilo}>{linha.saida}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

const janelaEstilo: React.CSSProperties = {
  borderRadius: 10,
  overflow: "hidden",
  background: "#0f172a",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)",
};

const barraEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  background: "#1e293b",
};

const bolinhaEstilo: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
};

const corpoEstilo: React.CSSProperties = {
  padding: "14px 16px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12.5,
  minHeight: 220,
};

const saidaEstilo: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#94a3b8",
  whiteSpace: "pre-wrap",
};
