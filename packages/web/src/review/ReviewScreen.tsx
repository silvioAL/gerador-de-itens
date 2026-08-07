import { useState } from "react";
import {
  gerarEspecificacaoEntrega,
  renderizarItemEspecificacao,
  type Atividade,
  type Diagrama,
  type DiagramaConfig,
  type RegrasConfig,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";
import { baixarArquivoTexto } from "../persistence/baixarArquivo";

export interface ReviewScreenProps {
  resultado: ResultadoDependenciasDe<Atividade>;
  diagrama: Diagrama;
  config: DiagramaConfig;
  regras?: RegrasConfig;
  /** Efetivo pro time ativo — template do time se existir, senão o global (SPEC-14 §6). */
  especificacaoTemplate: EspecificacaoTemplate;
  /** `quebra.demandInfo` — de onde vem a demanda, pra seção "Contexto" do documento (SPEC-14 §4). */
  demandInfo?: string;
  /** `quebra.time` — toda atividade já carrega esse time em `timesEnvolvidos` por padrão
   * (achado do usuário: só aparecer no item excepcional lia como dado quebrado); usado aqui
   * só pra filtrar o que já é óbvio e destacar de verdade quando é outro time. */
  time?: string;
  onFechar: () => void;
  onSelecionarNo: (id: string) => void;
}

function descreverDependencia(a: Atividade): string {
  return a.dependencias.map((d) => (d.alvoChave ? `${d.type}→${d.alvoChave}` : d.type)).join(", ");
}

/**
 * Revisão e especificação de solução são uma coisa só (achado do usuário: o
 * fluxo anterior — tabela resumida + botão separado "Especificação de
 * entrega" com preview em texto puro + "copiar" — não fazia sentido; ninguém
 * precisa copiar nada à mão). Cada item expande inline (grid-template-rows
 * 0fr→1fr, transição suave) mostrando o mesmo texto que vai pro documento
 * final — nunca duas fontes de verdade pro mesmo conteúdo, sempre
 * `renderizarItemEspecificacao` do engine. Só existe UM export: o markdown
 * completo (`gerarEspecificacaoEntrega`), pensado pra ser o input de outro
 * agente (ex.: o que sobe os itens pro sistema de tracking do time) — não
 * mais um `.md` resumido e um documento à parte.
 */
export function ReviewScreen({
  resultado,
  diagrama,
  config,
  regras,
  especificacaoTemplate,
  demandInfo,
  time,
  onFechar,
  onSelecionarNo,
}: ReviewScreenProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const chaveParaNodeId = Object.fromEntries(
    resultado.atividades.filter((a) => a.origem.nodeId).map((a) => [a.chave, a.origem.nodeId!])
  );

  function outrosTimes(a: Atividade): string[] {
    return (a.timesEnvolvidos ?? []).filter((t) => t !== time);
  }

  function irParaChave(chave: string) {
    const nodeId = chaveParaNodeId[chave];
    if (nodeId) {
      onSelecionarNo(nodeId);
      onFechar();
    }
  }

  function alternarExpandido(chave: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function baixarEspecificacao() {
    const documento = gerarEspecificacaoEntrega(resultado.atividades, diagrama, config, {
      regras,
      demandInfo,
      template: especificacaoTemplate.conteudo,
      time,
    });
    baixarArquivoTexto(documento, "especificacao-de-solucao.md", "text/markdown");
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
        <span style={{ fontSize: 12, color: "#64748b" }}>{resultado.atividades.length} itens</span>
        <div style={{ flex: 1 }} />
        <div data-tour="export-buttons">
          <button onClick={baixarEspecificacao} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
            Gerar especificação de solução
          </button>
        </div>
        <button onClick={onFechar} style={botaoEstilo}>
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

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {resultado.atividades.map((a, i) => {
            const cruzaOutroTime = outrosTimes(a).length > 0;
            const temNo = !!chaveParaNodeId[a.chave];
            const expandido = expandidos.has(a.chave);
            return (
              <div key={a.chave} data-testid={`item-${a.chave}`} style={{ ...cardEstilo, background: cruzaOutroTime ? "#fffbeb" : "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => alternarExpandido(a.chave)}
                    aria-label={expandido ? `recolher ${a.rotulo}` : `expandir ${a.rotulo}`}
                    aria-expanded={expandido}
                    style={chevronEstilo}
                  >
                    {expandido ? "▾" : "▸"}
                  </button>
                  {temNo ? (
                    <button style={{ ...linkEstilo, fontWeight: 600, fontSize: 13 }} onClick={() => irParaChave(a.chave)}>
                      {a.rotulo}
                    </button>
                  ) : (
                    <strong style={{ fontSize: 13 }}>{a.rotulo}</strong>
                  )}
                  <span style={metaEstilo}>
                    {a.tipo} · {a.tamanho}
                    {a.dependencias.length > 0 && ` · depende de ${descreverDependencia(a)}`}
                  </span>
                  <div style={{ flex: 1 }} />
                  {a.timesEnvolvidos?.length ? (
                    temNo ? (
                      <button
                        style={{
                          ...linkEstilo,
                          color: cruzaOutroTime ? "#92400e" : "#64748b",
                          fontWeight: cruzaOutroTime ? 600 : 400,
                        }}
                        onClick={() => irParaChave(a.chave)}
                        title="Editar o time responsável no nó, no canvas"
                      >
                        {a.timesEnvolvidos.join(", ")}
                      </button>
                    ) : (
                      <span
                        style={{ fontSize: 12, color: cruzaOutroTime ? "#92400e" : "#64748b", fontWeight: cruzaOutroTime ? 600 : 400 }}
                      >
                        {a.timesEnvolvidos.join(", ")}
                      </span>
                    )
                  ) : null}
                </div>
                {expandido && (
                  <div className="review-item-expandido">
                    <pre style={preItemEstilo}>{renderizarItemEspecificacao(i + 1, a, diagrama, config, regras)}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const preItemEstilo: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 12,
  margin: "10px 0 2px",
  color: "#334155",
  paddingTop: 10,
  borderTop: "1px solid #e2e8f0",
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

const chevronEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#64748b",
  padding: 0,
  fontSize: 13,
  width: 16,
  flexShrink: 0,
};

const metaEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "10px 12px",
};

const avisoEstilo: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 14,
  color: "#7f1d1d",
};
