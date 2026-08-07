import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

/**
 * Achado real: uma exceção de render (ex.: um `config/regras.json` editado à
 * mão com um campo faltando) derrubava o app inteiro pra uma tela em branco,
 * sem nenhum aviso — React só loga no console, não existe fallback nenhum sem
 * isso. `componentDidCatch`/`getDerivedStateFromError` só existem como classe,
 * não têm equivalente de hook — único lugar do app com componente de classe.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Erro não tratado na renderização:", erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
          <h1 style={{ fontSize: 18, color: "#b91c1c" }}>Algo deu errado</h1>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
            Um erro inesperado interrompeu esta tela — provavelmente um dado ou uma configuração em formato
            inesperado (ex.: <code>config/regras.json</code> editado à mão). Recarregar a página deve resolver;
            se persistir, veja o console do navegador (F12) para o detalhe técnico.
          </p>
          <pre style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap", marginTop: 12 }}>
            {this.state.erro.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
