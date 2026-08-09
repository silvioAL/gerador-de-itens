import { useEffect, useState } from "react";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";
import type { CampoAresta, CampoNo, ConfigPipelineAgentes, DadosCampoAresta, DadosCampoNo, EspecificacaoTemplate } from "../api/client";
import { PerfisTimeTab } from "../demo/PerfisTimeTab";
import { CamposNoTab } from "./CamposNoTab";
import { CamposArestaTab } from "./CamposArestaTab";
import { MembrosTab } from "./MembrosTab";
import { EspecificacaoTemplateTab } from "./EspecificacaoTemplateTab";
import { PipelineAgentesTab } from "./PipelineAgentesTab";
import { ModeloIaTab } from "./ModeloIaTab";

export type AbaConfig = "perfis" | "campos" | "camposAresta" | "membros" | "especificacao" | "pipeline" | "modeloIa";

export interface ConfigScreenProps {
  config: DiagramaConfig;
  perfisTime: PerfisConfig;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  especificacaoTemplate: EspecificacaoTemplate;
  pipelineAgentes: ConfigPipelineAgentes;
  timeAtivo: string;
  /** false no modo local (CLI) — sem servidor não existe conceito de outros
   * membros pra administrar; a aba não faz sentido. */
  mostrarMembros: boolean;
  /** true só no modo local — `/campos-aresta` não existe no servidor hospedado
   * (SPEC-21 §2, dormente de propósito); mostrar a aba lá levaria a salvar e
   * sempre falhar. Inverso de `mostrarMembros`. */
  mostrarCamposAresta: boolean;
  onEditarValorPerfilTime: (timeId: string, tipoNo: string, campo: string, valor: string) => void;
  onCriarCampoNo: (dados: DadosCampoNo) => Promise<void>;
  onAtualizarCampoNo: (id: string, dados: Partial<DadosCampoNo>) => Promise<void>;
  onExcluirCampoNo: (id: string) => Promise<void>;
  onCriarCampoAresta: (dados: DadosCampoAresta) => Promise<void>;
  onAtualizarCampoAresta: (id: string, dados: Partial<DadosCampoAresta>) => Promise<void>;
  onExcluirCampoAresta: (id: string) => Promise<void>;
  onSalvarEspecificacaoTemplate: (dados: { timeId?: string; conteudo: string }) => Promise<void>;
  onSalvarPipelineAgentes: (dados: ConfigPipelineAgentes) => Promise<void>;
  onFechar: () => void;
  /** Troca a aba ativa de fora (tour guiado) sem fechar/reabrir a tela. */
  abaForcada?: AbaConfig;
}

/**
 * Tela cheia (mesmo padrão de ReviewScreen.tsx), não mais aba dentro da
 * JourneyModal — o editor de campos por tipo de nó não cabe na densidade de
 * uma aba de onboarding (SPEC-08 §3.5). Reúne o que é config recorrente de
 * time: perfis de stack, campos de formulário.
 */
export function ConfigScreen({
  config,
  perfisTime,
  camposNo,
  camposAresta,
  especificacaoTemplate,
  pipelineAgentes,
  timeAtivo,
  mostrarMembros,
  mostrarCamposAresta,
  onEditarValorPerfilTime,
  onCriarCampoNo,
  onAtualizarCampoNo,
  onExcluirCampoNo,
  onCriarCampoAresta,
  onAtualizarCampoAresta,
  onExcluirCampoAresta,
  onSalvarEspecificacaoTemplate,
  onSalvarPipelineAgentes,
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
        background: "var(--painel)",
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
          borderBottom: "1px solid var(--borda)",
        }}
      >
        <strong style={{ fontSize: 14 }}>Configurações</strong>
        <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>time ativo: {timeAtivo}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar ao canvas
        </button>
      </header>

      <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", borderBottom: "1px solid var(--borda)" }}>
        <button onClick={() => setAba("perfis")} style={aba === "perfis" ? abaAtivaEstilo : abaEstilo}>
          Perfis de time ({Object.keys(perfisTime).length})
        </button>
        <button onClick={() => setAba("campos")} style={aba === "campos" ? abaAtivaEstilo : abaEstilo}>
          Campos por tipo de nó ({camposNo.length})
        </button>
        {mostrarCamposAresta && (
          <button onClick={() => setAba("camposAresta")} style={aba === "camposAresta" ? abaAtivaEstilo : abaEstilo}>
            Campos por tipo de conexão ({camposAresta.length})
          </button>
        )}
        {mostrarMembros && (
          <button onClick={() => setAba("membros")} style={aba === "membros" ? abaAtivaEstilo : abaEstilo}>
            Membros
          </button>
        )}
        <button onClick={() => setAba("especificacao")} style={aba === "especificacao" ? abaAtivaEstilo : abaEstilo}>
          Especificação de solução
        </button>
        <button onClick={() => setAba("pipeline")} style={aba === "pipeline" ? abaAtivaEstilo : abaEstilo}>
          Pipeline de IA
        </button>
        <button onClick={() => setAba("modeloIa")} style={aba === "modeloIa" ? abaAtivaEstilo : abaEstilo}>
          Modelo de IA
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
        {aba === "camposAresta" && mostrarCamposAresta && (
          <CamposArestaTab
            config={config}
            camposAresta={camposAresta}
            timeAtivo={timeAtivo}
            onCriar={onCriarCampoAresta}
            onAtualizar={onAtualizarCampoAresta}
            onExcluir={onExcluirCampoAresta}
          />
        )}
        {aba === "membros" && mostrarMembros && <MembrosTab timeAtivo={timeAtivo} />}
        {aba === "especificacao" && (
          <EspecificacaoTemplateTab
            template={especificacaoTemplate}
            timeAtivo={timeAtivo}
            onSalvar={onSalvarEspecificacaoTemplate}
          />
        )}
        {aba === "pipeline" && <PipelineAgentesTab config={pipelineAgentes} onSalvar={onSalvarPipelineAgentes} />}
        {aba === "modeloIa" && <ModeloIaTab />}
      </div>
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
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
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  color: "#a5b4fc",
  borderBottom: "2px solid #4f46e5",
};
