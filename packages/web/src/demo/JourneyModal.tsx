import { useEffect, useState } from "react";
import type { DiagramaConfig, No, Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import { ImportarGraphify } from "./ImportarGraphify";
import { FakeTerminal } from "./FakeTerminal";
import { Jornada } from "./Jornada";

// "perfis"/"referencias" saíram daqui pra ConfigScreen.tsx — são config recorrente
// de time, não onboarding/demo (ver SPEC-08 §3.5). O tipo continua com essas duas
// chaves comentadas como referência histórica pro tour guiado, que só usa as que restam.
export type AbaJornada = "jornada" | "cenarios" | "graphify" | "cli";

export interface JourneyModalProps {
  config: DiagramaConfig;
  cenarios: Cenario[];
  onFechar: () => void;
  onCarregarCenario: (quebra: Quebra) => void;
  onAdicionarCenario: (quebra: Quebra) => void;
  onImportarGraphify: (nodes: No[]) => void;
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
  onImportarGraphify,
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
          background: "#ffffff",
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
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Como funciona o Gerador de Itens</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Não é um gerador de prompt de IA — é um mecanismo determinístico, do diagrama ao backlog.
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
          <button onClick={() => setAba("graphify")} style={aba === "graphify" ? abaAtivaEstilo : abaEstilo}>
            Importar do Graphify
          </button>
          <button onClick={() => setAba("cli")} style={aba === "cli" ? abaAtivaEstilo : abaEstilo}>
            Linha de comando
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {aba === "jornada" && <Jornada />}
          {aba === "cenarios" && (
            <Cenarios cenarios={cenarios} config={config} onCarregar={carregar} onAdicionar={onAdicionarCenario} />
          )}
          {aba === "cli" && <LinhaComando />}
          {aba === "graphify" && <ImportarGraphify onImportar={onImportarGraphify} />}
        </div>
      </div>
    </div>
  );
}


interface ComandoCli {
  comando: string;
  quando: string;
}

const COMANDOS_CLI: ComandoCli[] = [
  { comando: "gerador init", quando: "Começar um projeto novo — cria config/ de exemplo, nunca sobrescreve o que já existir." },
  { comando: "gerador derive <quebra.json>", quando: "Gerar o backlog a partir de um diagrama já pronto, sem abrir o browser." },
  {
    comando: "gerador implementar <quebra.json>",
    quando: "Gerar a especificação de entrega da quebra inteira — documento único com todos os itens, especificação técnica e refinamento — pronto pra refinar e enviar pra quem faz o upload.",
  },
  { comando: "gerador open", quando: "Abrir o editor visual servindo o build já pronto, sem depender de npm run dev." },
  {
    comando: "gerador import-graphify <graph.json>",
    quando: "Rascunhar nós existente/extraído a partir de um projeto já mapeado pelo Graphify.",
  },
  {
    comando: "gerador export-vault",
    quando: "Materializar config/referencias/*.json + padrões default como notas Obsidian, com redirect direto pra abrir lá.",
  },
];

function LinhaComando() {
  return (
    <div>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginTop: 0, maxWidth: 640 }}>
        Tudo isso também roda sem abrir o browser — direto no terminal. O app web é uma forma de usar a ferramenta,
        não a única. Instala uma vez com{" "}
        <code>npm install -g gerador-de-itens</code> (publicado no npm, mesmo mecanismo do Graphify — sem precisar
        clonar repositório nenhum) e o comando <code>gerador</code> fica disponível em qualquer projeto.
      </p>

      <FakeTerminal />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 18 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
            <th style={{ padding: "6px 8px", color: "#475569" }}>Comando</th>
            <th style={{ padding: "6px 8px", color: "#475569" }}>Quando usar</th>
          </tr>
        </thead>
        <tbody>
          {COMANDOS_CLI.map((c) => (
            <tr key={c.comando} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "8px", fontFamily: "ui-monospace, Menlo, Consolas, monospace", whiteSpace: "nowrap" }}>
                {c.comando}
              </td>
              <td style={{ padding: "8px", color: "#475569" }}>{c.quando}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            border: cenario.destaque ? "1.5px solid #4f46e5" : "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: cenario.destaque ? "#f5f5ff" : "#fff",
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
                  background: "#dcfce7",
                  color: "#15803d",
                }}
              >
                {ROTULO_CATEGORIA[cenario.categoria]}
              </span>
            )}
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{cenario.titulo}</strong>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.45, flex: 1 }}>{cenario.descricao}</p>
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
                    background: "#ede9fe",
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
  color: "#64748b",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  color: "#4f46e5",
  borderBottom: "2px solid #4f46e5",
};

const botaoDemoAutomaticaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#4f46e5",
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
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#64748b",
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
  border: "1px solid #c7d2fe",
  background: "#fff",
  color: "#4f46e5",
  cursor: "pointer",
};
