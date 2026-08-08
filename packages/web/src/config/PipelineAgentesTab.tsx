import { useState } from "react";
import type { ConfigPipelineAgentes } from "../api/client";

export interface PipelineAgentesTabProps {
  config: ConfigPipelineAgentes;
  onSalvar: (dados: ConfigPipelineAgentes) => Promise<void>;
}

/**
 * SPEC-24 Fase E — achado real do usuário: "pode avançar sozinho até o fim,
 * ou ir parando conforme está hoje". Um toggle só, por enquanto — mesmo
 * arquivo (`config/pipeline-agentes.json`) que a Fase F (prompts/ordem/
 * agentes contextuais, ainda não implementada) vai estender.
 */
export function PipelineAgentesTab({ config, onSalvar }: PipelineAgentesTabProps) {
  const [confirmacaoObrigatoria, setConfirmacaoObrigatoria] = useState(config.confirmacaoObrigatoria);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar(valor: boolean) {
    setConfirmacaoObrigatoria(valor);
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ confirmacaoObrigatoria: valor });
    } catch (e) {
      setConfirmacaoObrigatoria(!valor);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Controla como a esteira de agentes (PO → Arquiteto → Especialista técnico → QA) se comporta ao gerar cada
        item na tela de revisão.
      </p>

      <div style={cardEstilo}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={confirmacaoObrigatoria}
            onChange={(e) => void alternar(e.target.checked)}
            disabled={salvando}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ fontSize: 13, color: "#0f172a", display: "block" }}>Confirmação obrigatória</strong>
            <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
              {confirmacaoObrigatoria
                ? "Ligado — cada campo sugerido pela IA fica pendente até você revisar e confirmar, um a um."
                : "Desligado — a esteira aplica cada campo direto, sem pausa, avançando sozinha até o fim. Você ainda pode revisar e editar qualquer campo depois."}
            </span>
          </span>
        </label>
        {erro && <p style={erroEstilo}>{erro}</p>}
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
  maxWidth: 680,
};

const erroEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  marginTop: 8,
  marginBottom: 0,
};
