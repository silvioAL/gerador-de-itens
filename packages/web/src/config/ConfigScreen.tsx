import { useEffect, useState } from "react";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";
import type { CampoNo, DadosCampoNo, EspecificacaoTemplate, Referencia } from "../api/client";
import { PerfisTimeTab } from "../demo/PerfisTimeTab";
import { ReferenciasTab } from "../demo/ReferenciasTab";
import { CamposNoTab } from "./CamposNoTab";
import { MembrosTab } from "./MembrosTab";
import { EspecificacaoTemplateTab } from "./EspecificacaoTemplateTab";

export type AbaConfig = "perfis" | "campos" | "referencias" | "membros" | "especificacao";

export interface ConfigScreenProps {
  config: DiagramaConfig;
  perfisTime: PerfisConfig;
  referencias: Referencia[];
  camposNo: CampoNo[];
  especificacaoTemplate: EspecificacaoTemplate;
  timeAtivo: string;
  onEditarValorPerfilTime: (timeId: string, tipoNo: string, campo: string, valor: string) => void;
  onCriarReferencia: (dados: { titulo: string; racional: string; designPatterns: string[]; codigoRelacionado: string[] }) => Promise<void>;
  onAtualizarLinkExternoReferencia: (id: string, linkExterno: string) => Promise<void>;
  onCriarCampoNo: (dados: DadosCampoNo) => Promise<void>;
  onAtualizarCampoNo: (id: string, dados: Partial<DadosCampoNo>) => Promise<void>;
  onExcluirCampoNo: (id: string) => Promise<void>;
  onSalvarEspecificacaoTemplate: (dados: { timeId?: string; conteudo: string }) => Promise<void>;
  onFechar: () => void;
  /** Troca a aba ativa de fora (tour guiado) sem fechar/reabrir a tela. */
  abaForcada?: AbaConfig;
}

/**
 * Tela cheia (mesmo padrão de ReviewScreen.tsx), não mais aba dentro da
 * JourneyModal — o editor de campos por tipo de nó não cabe na densidade de
 * uma aba de onboarding (SPEC-08 §3.5). Reúne o que é config recorrente de
 * time: perfis de stack, campos de formulário, referências de código.
 */
export function ConfigScreen({
  config,
  perfisTime,
  referencias,
  camposNo,
  especificacaoTemplate,
  timeAtivo,
  onEditarValorPerfilTime,
  onCriarReferencia,
  onAtualizarLinkExternoReferencia,
  onCriarCampoNo,
  onAtualizarCampoNo,
  onExcluirCampoNo,
  onSalvarEspecificacaoTemplate,
  onFechar,
  abaForcada,
}: ConfigScreenProps) {
  const [aba, setAba] = useState<AbaConfig>(abaForcada ?? "perfis");

  useEffect(() => {
    if (abaForcada) setAba(abaForcada);
  }, [abaForcada]);

  return (
    <div
      data-tour="config-screen-content"
      style={{
        position: "fixed",
        inset: 0,
        background: "#ffffff",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <strong style={{ fontSize: 14 }}>Configurações</strong>
        <span style={{ fontSize: 12, color: "#64748b" }}>time ativo: {timeAtivo}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar ao canvas
        </button>
      </header>

      <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", borderBottom: "1px solid #e2e8f0" }}>
        <button onClick={() => setAba("perfis")} style={aba === "perfis" ? abaAtivaEstilo : abaEstilo}>
          Perfis de time ({Object.keys(perfisTime).length})
        </button>
        <button onClick={() => setAba("campos")} style={aba === "campos" ? abaAtivaEstilo : abaEstilo}>
          Campos por tipo de nó ({camposNo.length})
        </button>
        <button onClick={() => setAba("referencias")} style={aba === "referencias" ? abaAtivaEstilo : abaEstilo}>
          Referências de código ({referencias.length})
        </button>
        <button onClick={() => setAba("membros")} style={aba === "membros" ? abaAtivaEstilo : abaEstilo}>
          Membros
        </button>
        <button onClick={() => setAba("especificacao")} style={aba === "especificacao" ? abaAtivaEstilo : abaEstilo}>
          Especificação de entrega
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {aba === "perfis" && (
          <PerfisTimeTab perfisTime={perfisTime} config={config} onEditarValor={onEditarValorPerfilTime} />
        )}
        {aba === "campos" && (
          <CamposNoTab
            config={config}
            camposNo={camposNo}
            timeAtivo={timeAtivo}
            onCriar={onCriarCampoNo}
            onAtualizar={onAtualizarCampoNo}
            onExcluir={onExcluirCampoNo}
          />
        )}
        {aba === "referencias" && (
          <ReferenciasTab
            referencias={referencias}
            onCriar={onCriarReferencia}
            onAtualizarLinkExterno={onAtualizarLinkExternoReferencia}
          />
        )}
        {aba === "membros" && <MembrosTab timeAtivo={timeAtivo} />}
        {aba === "especificacao" && (
          <EspecificacaoTemplateTab
            template={especificacaoTemplate}
            timeAtivo={timeAtivo}
            onSalvar={onSalvarEspecificacaoTemplate}
          />
        )}
      </div>
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4f46e5",
};

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
