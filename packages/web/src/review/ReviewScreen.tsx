import { useMemo, useState } from "react";
import {
  gerarDiagramaHtml,
  gerarEspecificacaoEntrega,
  listarPlaceholders,
  nosDeOrigem,
  renderizarItemEspecificacao,
  type Atividade,
  type Diagrama,
  type DiagramaConfig,
  type RegrasConfig,
  type ValorSpec,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import { apiIa, type EspecificacaoTemplate } from "../api/client";
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
  /** `quebra.respostasItens` — respostas já salvas aos placeholders de
   * refinamento (Fase 1, SPEC-23), pra saber o que já está confirmado e não
   * precisa mais aparecer no painel de sugestão. */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;
  onFechar: () => void;
  onSelecionarNo: (id: string) => void;
}

function descreverDependencia(a: Atividade): string {
  return a.dependencias.map((d) => (d.alvoChave ? `${d.type}→${d.alvoChave}` : d.type)).join(", ");
}

/** Só entra no documento (via `renderizarItemEspecificacao`) resposta manual
 * ou sugestão já confirmada — mesma régua do engine (`gerarRefinamento.ts`),
 * repetida aqui só pra decidir o que ainda mostrar no painel de sugestão. */
function respostaConfirmada(resp: ValorSpec | undefined): boolean {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/** Contexto compacto do(s) nó(s) de origem da atividade, mandado ao LLM junto
 * com o requisito — sem isso a sugestão seria genérica demais pra ser útil
 * (Fase 1, SPEC-23). */
function contextoDoPlaceholder(atividade: Atividade, diagrama: Diagrama, config: DiagramaConfig): string {
  return nosDeOrigem(atividade, diagrama)
    .map((no) => {
      const cfg = config.nodeTypes[no.type];
      const campos = Object.entries(no.spec)
        .filter(([, v]) => v.valor !== undefined && v.valor !== "")
        .map(([k, v]) => `${k}: ${String(v.valor)}`)
        .join(", ");
      return `${no.label} (${cfg?.label ?? no.type}, ${no.status})${campos ? ` — ${campos}` : ""}`;
    })
    .join(" | ");
}

interface PainelSugestoesProps {
  atividade: Atividade;
  diagrama: Diagrama;
  config: DiagramaConfig;
  regras?: RegrasConfig;
  respostas?: Record<string, ValorSpec>;
  onResponder?: (chavePlaceholder: string, resposta: ValorSpec) => void;
}

/**
 * Painel dos requisitos de refinamento técnico/volumetria ainda sem resposta
 * confirmada (fluxo 3, Fase 1, SPEC-23) — cada um pode ser respondido à mão
 * ou via "✨ Sugerir" (chama o modelo local). Sugestão fica com
 * `origem: "sugerido", confirmado: false` até o usuário clicar "Confirmar" —
 * só aí ela sai deste painel e passa a aparecer no texto final (mesma
 * disciplina de "nada sugerido conta até confirmado" já usada pro semáforo
 * de prontidão dos campos de nó, aplicada aqui por convenção).
 */
function PainelSugestoes({ atividade, diagrama, config, regras, respostas, onResponder }: PainelSugestoesProps) {
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!regras) return null;
  const nos = nosDeOrigem(atividade, diagrama);
  const placeholders = listarPlaceholders(regras, atividade.techs, atividade.contextos, nos, diagrama.edges);
  const pendentes = placeholders.filter((p) => !respostaConfirmada(respostas?.[p.chave]));
  if (pendentes.length === 0) return null;

  async function sugerir(chave: string, tech: string, rotulo: string) {
    setErro(null);
    setCarregando(chave);
    try {
      const { valor } = await apiIa.sugerir({ tech, rotulo, contextoNo: contextoDoPlaceholder(atividade, diagrama, config) });
      setRascunhos((r) => ({ ...r, [chave]: valor }));
      onResponder?.(chave, { valor, origem: "sugerido", confirmado: false });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a sugestão.");
    } finally {
      setCarregando(null);
    }
  }

  function confirmar(chave: string) {
    const valor = rascunhos[chave] ?? respostas?.[chave]?.valor;
    if (typeof valor !== "string" || valor.trim() === "") return;
    onResponder?.(chave, { valor, origem: "manual" });
  }

  return (
    <div style={painelSugestoesEstilo}>
      <strong style={{ fontSize: 12 }}>Requisitos ainda sem resposta</strong>
      {erro && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>{erro}</div>}
      {pendentes.map((p) => {
        const respAtual = respostas?.[p.chave];
        const valor = rascunhos[p.chave] ?? (typeof respAtual?.valor === "string" ? respAtual.valor : "");
        return (
          <div key={p.chave} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{p.rotulo}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={valor}
                onChange={(e) => setRascunhos((r) => ({ ...r, [p.chave]: e.target.value }))}
                placeholder="Resposta manual, ou clique em Sugerir"
                style={{ flex: 1, fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}
              />
              <button onClick={() => sugerir(p.chave, p.tech, p.rotulo)} disabled={carregando === p.chave} style={botaoEstilo}>
                {carregando === p.chave ? "Gerando..." : "✨ Sugerir"}
              </button>
              <button onClick={() => confirmar(p.chave)} disabled={!valor.trim()} style={botaoEstilo}>
                Confirmar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
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
  respostasItens,
  onResponderItem,
  onFechar,
  onSelecionarNo,
}: ReviewScreenProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false);

  // Mesma função gera o preview ao vivo (iframe) e o arquivo baixado — nunca
  // duas fontes de verdade pro mesmo diagrama (mesma disciplina de
  // renderizarItemEspecificacao pro texto). Memoizado: é pura, mas gerar HTML
  // com SVG+script pra cada re-render (ex. digitar em outro campo) é
  // desperdício sem necessidade.
  const diagramaHtml = useMemo(
    () => gerarDiagramaHtml(resultado.atividades, diagrama, config),
    [resultado.atividades, diagrama, config]
  );

  function baixarDiagrama() {
    baixarArquivoTexto(diagramaHtml, "diagrama-da-solucao.html", "text/html");
  }

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
      respostasItens,
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
        <button onClick={() => setMostrarDiagrama((v) => !v)} style={botaoEstilo}>
          {mostrarDiagrama ? "Voltar à lista" : "🔀 Ver diagrama animado"}
        </button>
        <div data-tour="export-buttons">
          {mostrarDiagrama ? (
            <button onClick={baixarDiagrama} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
              Baixar diagrama (.html)
            </button>
          ) : (
            <button onClick={baixarEspecificacao} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
              Gerar especificação de solução
            </button>
          )}
        </div>
        <button onClick={onFechar} style={botaoEstilo}>
          Voltar ao canvas
        </button>
      </header>

      {mostrarDiagrama ? (
        <iframe
          title="Diagrama animado da solução"
          srcDoc={diagramaHtml}
          style={{ flex: 1, border: "none" }}
        />
      ) : (
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
                    <pre style={preItemEstilo}>
                      {renderizarItemEspecificacao(i + 1, a, diagrama, config, regras, respostasItens?.[a.chave])}
                    </pre>
                    <PainelSugestoes
                      atividade={a}
                      diagrama={diagrama}
                      config={config}
                      regras={regras}
                      respostas={respostasItens?.[a.chave]}
                      onResponder={(chave, resposta) => onResponderItem?.(a.chave, chave, resposta)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
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

const painelSugestoesEstilo: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#fffbeb",
  border: "1px solid #fde68a",
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
