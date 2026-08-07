import { Jornada } from "./Jornada";

export interface LandingPageProps {
  onEntrar: () => void;
}

/**
 * Página pública, antes do login (SPEC-11) — contexto pra quem chega sem
 * saber o que a ferramenta é, em vez de cair direto num formulário de
 * credencial. Reaproveita `Jornada()` (mesma explicação usada na aba "A
 * jornada" pós-login) em vez de escrever uma segunda versão.
 */
export function LandingPage({ onEntrar }: LandingPageProps) {
  return (
    <div style={containerEstilo}>
      <header style={headerEstilo}>
        <strong style={{ fontSize: 16, color: "#0f172a" }}>Gerador de Itens</strong>
        <div style={{ flex: 1 }} />
        <button onClick={onEntrar} style={botaoEntrarEstilo}>
          Entrar
        </button>
      </header>

      <div style={conteudoEstilo}>
        <h1 style={{ fontSize: 24, color: "#0f172a", margin: "0 0 6px" }}>Do diagrama à especificação de solução, sem inventar nada</h1>
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
          Não é um gerador de prompt de IA — é um mecanismo determinístico. O mesmo diagrama sempre produz os mesmos
          itens, com proveniência em cada campo e nada virando "pronto" sem alguém confirmar.
        </p>
        <Jornada />
        <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, marginTop: 24 }}>
          Entrar pra começar
        </button>
      </div>
    </div>
  );
}

const containerEstilo: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  fontFamily: "system-ui, sans-serif",
};

const headerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "14px 24px",
  borderBottom: "1px solid #e2e8f0",
  background: "#fff",
};

const conteudoEstilo: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px",
};

const botaoEntrarEstilo: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};
