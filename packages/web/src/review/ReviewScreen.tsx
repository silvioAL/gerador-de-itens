import { Fragment, useState } from "react";
import {
  gerarEspecificacaoEntrega,
  type Atividade,
  type Diagrama,
  type DiagramaConfig,
  type RegrasConfig,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";

export interface ReviewScreenProps {
  resultado: ResultadoDependenciasDe<Atividade>;
  diagrama: Diagrama;
  config: DiagramaConfig;
  regras?: RegrasConfig;
  /** Efetivo pro time ativo — template do time se existir, senão o global (SPEC-14 §6). */
  especificacaoTemplate: EspecificacaoTemplate;
  /** `quebra.demandInfo` — de onde vem a demanda, pra seção "Contexto" do documento (SPEC-14 §4). */
  demandInfo?: string;
  onFechar: () => void;
  onSelecionarNo: (id: string) => void;
  onExportarMarkdown: () => void;
}

function descreverDependencia(a: Atividade): string {
  return a.dependencias
    .map((d) => (d.alvoChave ? `${d.type}→${d.alvoChave}` : d.type))
    .join(", ");
}

function descreverSpecResumo(a: Atividade): string {
  if (!a.specResumo) return "";
  return Object.entries(a.specResumo)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(", ");
}

export function ReviewScreen({
  resultado,
  diagrama,
  config,
  regras,
  especificacaoTemplate,
  demandInfo,
  onFechar,
  onSelecionarNo,
  onExportarMarkdown,
}: ReviewScreenProps) {
  const [mostrarEspecificacao, setMostrarEspecificacao] = useState(false);

  const chaveParaNodeId = Object.fromEntries(
    resultado.atividades.filter((a) => a.origem.nodeId).map((a) => [a.chave, a.origem.nodeId!])
  );

  function irParaChave(chave: string) {
    const nodeId = chaveParaNodeId[chave];
    if (nodeId) {
      onSelecionarNo(nodeId);
      onFechar();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#ffffff",
        zIndex: 50,
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
        <strong style={{ fontSize: 14 }}>Revisão da quebra</strong>
        <span style={{ fontSize: 12, color: "#64748b" }}>{resultado.atividades.length} atividades</span>
        <div style={{ flex: 1 }} />
        <div data-tour="export-buttons" style={{ display: "flex", gap: 10 }}>
          <button onClick={onExportarMarkdown} style={botaoEstilo}>
            Exportar .md
          </button>
          <button onClick={() => setMostrarEspecificacao((v) => !v)} style={botaoEstilo}>
            {mostrarEspecificacao ? "fechar especificação" : "Especificação de entrega"}
          </button>
        </div>
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar ao canvas
        </button>
      </header>

      <div data-tour="review-table" style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {(resultado.ciclos.length > 0 || resultado.conflitos.length > 0) && (
          <div style={avisoEstilo}>
            <strong style={{ fontSize: 12 }}>
              {resultado.podeDerivar ? "Atenção" : "Não é possível derivar ainda"}
            </strong>
            {resultado.ciclos.length > 0 && (
              <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 12 }}>
                {resultado.ciclos.map((c, i) => (
                  <li key={i}>
                    Ciclo:{" "}
                    {c.caminho.map((chave, j) => (
                      <span key={j}>
                        {j > 0 && " → "}
                        <button style={linkEstilo} onClick={() => irParaChave(chave)}>
                          {chave}
                        </button>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {resultado.conflitos.length > 0 && (
              <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 12 }}>
                {resultado.conflitos.map((c, i) => (
                  <li key={i}>
                    <strong>{c.codigo}</strong>:{" "}
                    {c.atividades.map((chave, j) => (
                      <span key={j}>
                        {j > 0 && ", "}
                        <button style={linkEstilo} onClick={() => irParaChave(chave)}>
                          {chave}
                        </button>
                      </span>
                    ))}
                    {c.alvo && <> (alvo inexistente: {c.alvo})</>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mostrarEspecificacao && (
          <EspecificacaoGerada
            atividades={resultado.atividades}
            diagrama={diagrama}
            config={config}
            regras={regras}
            template={especificacaoTemplate.conteudo}
            demandInfo={demandInfo}
          />
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              {["#", "Tipo", "Tamanho", "Descrição", "Techs", "Contextos", "Dependências", "Times", "Detalhes"].map(
                (h) => (
                  <th key={h} style={{ padding: "8px 6px", color: "#475569" }}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {resultado.atividades.map((a) => (
              <Fragment key={a.chave}>
                <tr style={{ borderBottom: "1px solid #f1f5f9", background: a.timesEnvolvidos?.length ? "#fffbeb" : undefined }}>
                  <td style={celulaEstilo}>
                    {chaveParaNodeId[a.chave] ? (
                      <button style={linkEstilo} onClick={() => irParaChave(a.chave)}>
                        {a.rotulo}
                      </button>
                    ) : (
                      a.rotulo
                    )}
                  </td>
                  <td style={celulaEstilo}>{a.tipo}</td>
                  <td style={celulaEstilo}>{a.tamanho}</td>
                  <td style={celulaEstilo}>{a.descricao}</td>
                  <td style={celulaEstilo}>{a.techs.join(", ")}</td>
                  <td style={celulaEstilo}>{a.contextos.join(", ")}</td>
                  <td style={celulaEstilo}>{descreverDependencia(a)}</td>
                  <td style={celulaEstilo}>
                    {a.timesEnvolvidos?.length ? (
                      <span style={{ color: "#92400e", fontWeight: 600 }}>{a.timesEnvolvidos.join(", ")}</span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td style={{ ...celulaEstilo, color: "#64748b" }}>{descreverSpecResumo(a)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Documento único da quebra inteira (SPEC-14) — não mais um artefato por
 * atividade: Contexto/Visão geral aparecem uma vez, cada atividade vira uma
 * seção numerada dentro do mesmo texto.
 */
function EspecificacaoGerada({
  atividades,
  diagrama,
  config,
  regras,
  template,
  demandInfo,
}: {
  atividades: Atividade[];
  diagrama: Diagrama;
  config: DiagramaConfig;
  regras?: RegrasConfig;
  template: string;
  demandInfo?: string;
}) {
  const documento = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras, demandInfo, template });

  return (
    <div style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 10 }}>
        <strong style={{ fontSize: 11, color: "#475569" }}>
          Especificação de entrega — documento único da quebra, pronto pra refinar (ex.: num subagente Claude Code) e
          enviar pra quem faz o upload
        </strong>
        <button style={linkEstilo} onClick={() => void navigator.clipboard.writeText(documento)}>
          copiar
        </button>
      </div>
      <pre style={preEstilo}>{documento}</pre>
    </div>
  );
}

const preEstilo: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 12,
  margin: "4px 0 0",
  color: "#334155",
  maxHeight: 480,
  overflow: "auto",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4f46e5",
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#4f46e5",
  padding: 0,
  fontSize: "inherit",
  textDecoration: "underline",
};

const celulaEstilo: React.CSSProperties = {
  padding: "8px 6px",
  verticalAlign: "top",
};

const avisoEstilo: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 14,
  color: "#7f1d1d",
};
