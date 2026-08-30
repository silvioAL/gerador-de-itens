import { useState } from "react";
import { apiIa, type AlvoSugestaoConfig } from "../api/client";

export interface SugerirComIaProps<T> {
  /** Qual schema o servidor deve usar (`ALVOS_SUGESTAO_CONFIG` no CLI). */
  alvo: AlvoSugestaoConfig;
  /** Onde essa configuração vai valer (tipo de nó, tipo de conexão) — sem
   * isso o modelo escreve algo genérico, que é justamente o que não serve. */
  contexto?: string;
  /** Exemplo curto do que dá pra pedir, mostrado como placeholder do input. */
  exemplo: string;
  /** Recebe o objeto pronto pra pré-preencher o formulário. Quem decide o que
   * fazer com ele é a aba — este componente nunca salva nada. */
  onSugestao: (sugestao: T) => void;
}

/**
 * SPEC-23 Fluxo 2 — "poder ajustar as configurações com apoio de IA".
 *
 * Um par input + botão que descreve em português o que se quer e devolve o
 * OBJETO de configuração pronto pro formulário que já existe. A IA não grava:
 * ela preenche o rascunho, o usuário revisa e salva pelo caminho de sempre.
 * Essa fronteira é deliberada — é o que impede a assistência de virar um canal
 * paralelo de escrita (a lição da skill removida, JOURNEY §41).
 *
 * Genérico no tipo de retorno porque cada alvo tem seu schema; quem chama sabe
 * qual espera (`SugestaoCampo`, `SugestaoPapel`).
 */
export function SugerirComIa<T>({ alvo, contexto, exemplo, onSugestao }: SugerirComIaProps<T>) {
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O modelo local leva minutos; sem mostrar o que está saindo, a espera parece
  // travamento (mesmo achado da esteira: "fica só o ícone de gerando").
  const [parcial, setParcial] = useState("");

  async function gerar() {
    if (!instrucao.trim() || gerando) return;
    setGerando(true);
    setErro(null);
    setParcial("");
    try {
      const sugestao = await apiIa.sugerirConfig<T>({ alvo, instrucao, contexto }, setParcial);
      onSugestao(sugestao);
      setInstrucao("");
      setParcial("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a sugestão.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div style={caixaEstilo} data-testid={`sugerir-ia-${alvo}`}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void gerar();
          }}
          placeholder={exemplo}
          disabled={gerando}
          aria-label="Descreva o que a IA deve propor"
          style={inputEstilo}
        />
        <button onClick={() => void gerar()} disabled={gerando || !instrucao.trim()} style={botaoEstilo}>
          {gerando ? "pensando…" : "✨ Sugerir"}
        </button>
      </div>
      {parcial && (
        <pre style={parcialEstilo} data-testid="sugerir-ia-parcial">
          {parcial}
        </pre>
      )}
      {erro && <p style={erroEstilo}>{erro}</p>}
      <p style={rodapeEstilo}>
        A sugestão só preenche o formulário abaixo — nada é salvo até você revisar e clicar em salvar.
      </p>
    </div>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 10,
  marginBottom: 12,
  background: "var(--painel-alto)",
};

const inputEstilo: React.CSSProperties = {
  flex: 1,
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const botaoEstilo: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const parcialEstilo: React.CSSProperties = {
  margin: "8px 0 0",
  padding: 8,
  maxHeight: 120,
  overflow: "auto",
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  color: "var(--texto-fraco)",
  fontSize: 11,
  whiteSpace: "pre-wrap",
};

const erroEstilo: React.CSSProperties = { margin: "8px 0 0", color: "var(--vermelho)", fontSize: 12 };

const rodapeEstilo: React.CSSProperties = { margin: "6px 0 0", color: "var(--texto-mudo)", fontSize: 11 };
