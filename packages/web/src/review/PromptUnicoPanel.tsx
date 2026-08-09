import { useEffect, useMemo, useState } from "react";
import { gerarPromptUnico, type Atividade, type Diagrama, type RegrasConfig, type ValorSpec } from "@gerador/engine";
import { apiPromptUnicoTemplate } from "../api/client";

export interface PromptUnicoPanelProps {
  atividades: Atividade[];
  diagrama: Diagrama;
  regras?: RegrasConfig;
  demandInfo?: string;
  anexosContexto?: { nome: string; conteudo: string }[];
  respostasItens?: Record<string, Record<string, ValorSpec>>;
  onFechar: () => void;
}

/**
 * SPEC-25 §5.5 / Fase 2.1 — "copiar prompt do breakdown".
 *
 * Painel, e não um botão que copia direto, por um motivo de confiança: o texto
 * vai ser colado no chat da empresa, num lugar onde a pessoa não pode "desfazer".
 * Ver antes de colar é barato; descobrir depois que foi o prompt errado, não.
 *
 * Não depende de provedor conectado nenhum — é justamente o caminho que
 * funciona enquanto o token não sai (SPEC-25 §8.1).
 */
export function PromptUnicoPanel({
  atividades,
  diagrama,
  regras,
  demandInfo,
  anexosContexto,
  respostasItens,
  onFechar,
}: PromptUnicoPanelProps) {
  const [template, setTemplate] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    apiPromptUnicoTemplate
      .obter()
      .then((r) => {
        if (!cancelado) setTemplate(r.conteudo);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const prompt = useMemo(() => {
    if (template === null) return "";
    return gerarPromptUnico(atividades, diagrama, {
      regras,
      demandInfo,
      // Os anexos do contexto do épico entram como "contexto adicional" — é
      // o mesmo material que a esteira já usa, sem uma segunda fonte.
      contextoAdicional: (anexosContexto ?? []).map((a) => `## ${a.nome}\n${a.conteudo}`).join("\n\n"),
      respostasItens,
      template,
    });
  }, [template, atividades, diagrama, regras, demandInfo, anexosContexto, respostasItens]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      // Clipboard bloqueado (http sem localhost, permissão negada): o texto
      // continua na tela e selecionável — dizer o que houve é melhor que um
      // botão que "não faz nada".
      setErro(`não consegui copiar (${e instanceof Error ? e.message : String(e)}) — selecione o texto e copie à mão`);
    }
  }

  return (
    <aside style={painelEstilo} data-testid="prompt-unico-panel" aria-label="Prompt único">
      <header style={cabecalhoEstilo}>
        <strong style={{ fontSize: 13 }}>Prompt único</strong>
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
          {atividades.length} {atividades.length === 1 ? "item" : "itens"} · {prompt.length.toLocaleString("pt-BR")}{" "}
          caracteres
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={botaoFecharEstilo} aria-label="Fechar prompt único">
          ×
        </button>
      </header>

      <p style={explicacaoEstilo}>
        Cole isto no chat que você já usa. Os requisitos técnicos e ciclos de teste já vão derivados das regras do time
        — o modelo não precisa acertá-los. Editar o texto do prompt: aba <strong>Prompt único</strong> nas
        configurações.
      </p>

      {erro && <p style={{ margin: "0 12px", fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</p>}

      {/* Sem template não há prompt: mostrar um textarea vazio pareceria
          "a quebra não gerou nada", quando o que houve foi falha de carga. */}
      {template === null ? (
        !erro && <p style={{ padding: 12, fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>
      ) : (
        <textarea readOnly value={prompt} style={textoEstilo} aria-label="Prompt gerado" data-testid="prompt-unico-texto" />
      )}

      <div style={rodapeEstilo}>
        <button onClick={() => void copiar()} disabled={!prompt} style={botaoPrimarioEstilo}>
          {copiado ? "✓ copiado" : "Copiar prompt"}
        </button>
      </div>
    </aside>
  );
}

const painelEstilo: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 560,
  maxWidth: "100vw",
  display: "flex",
  flexDirection: "column",
  background: "var(--painel)",
  borderLeft: "1px solid var(--borda-forte)",
  zIndex: 60,
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--borda)",
  color: "var(--texto)",
};

const explicacaoEstilo: React.CSSProperties = {
  margin: "10px 12px 6px",
  fontSize: 11.5,
  lineHeight: 1.6,
  color: "var(--texto-2)",
};

const textoEstilo: React.CSSProperties = {
  flex: 1,
  margin: "0 12px",
  padding: 10,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto-2)",
  fontSize: 11.5,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.5,
  resize: "none",
};

const rodapeEstilo: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
};

const botaoPrimarioEstilo: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

const botaoFecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};
