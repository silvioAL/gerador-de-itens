import { useEffect, useMemo, useState } from "react";
import type { DiagramaConfig, OperacaoDeAjuste, RegrasConfig } from "@gerador/engine";
import { descreverOperacao } from "@gerador/engine";
import { apiIa, apiPdca, apiRegras, type FeedbackPdca, type SolicitacaoAjuste } from "../api/client";
import type { AreaConfig } from "../navegacao/rota";
import { simularItemComAjuste } from "./previaDoAjuste";

/**
 * SPEC-45 — a tela do ciclo, na ordem em que se anda: o que disseram →
 * virar sugestão (com prévia num item de exemplo) → revisar → aplicar →
 * cadência. Antes eram dois campos numéricos, e o feedback que o agente
 * coletava não aparecia em lugar nenhum (§194).
 */
export interface PdcaTabProps {
  config: DiagramaConfig;
  timeAtivo: string;
  /** Abrir a configuração alvo de uma solicitação (deep-link, SPEC-40). */
  onAbrirArea?: (area: AreaConfig) => void;
}

const CADENCIA_PADRAO = { cadenciaUsos: 5, cadenciaFeedback: 3 };

/** A área da configuração de cada recurso solicitável — o "abrir e editar". */
const AREA_DO_RECURSO: Record<string, AreaConfig> = {
  regras: "regras",
  "pipeline-agentes": "pipeline",
  "especificacao-template": "especificacao",
  "campos-no": "campos",
  "campos-aresta": "camposAresta",
};

export function PdcaTab({ config, timeAtivo, onAbrirArea }: PdcaTabProps) {
  const [cadencia, setCadencia] = useState<typeof CADENCIA_PADRAO | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackPdca[]>([]);
  const [ajustes, setAjustes] = useState<SolicitacaoAjuste[]>([]);
  const [regras, setRegras] = useState<RegrasConfig | null>(null);
  const [emEstudio, setEmEstudio] = useState<FeedbackPdca | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    const [cfg, fbs, ajs, regs] = await Promise.all([
      apiPdca.config().catch(() => CADENCIA_PADRAO),
      apiPdca.listarFeedback().catch(() => []),
      apiPdca.listarAjustes().catch(() => []),
      apiRegras.obter().catch(() => null),
    ]);
    setCadencia(cfg);
    setFeedbacks(fbs);
    setAjustes(ajs);
    setRegras(regs);
  }

  useEffect(() => {
    void recarregar();
  }, []);

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const novos = feedbacks.filter((f) => f.estado === "novo");
  const tratados = feedbacks.filter((f) => f.estado !== "novo");
  const pendentes = ajustes.filter((a) => a.estado === "pendente");
  const decididos = ajustes.filter((a) => a.estado !== "pendente");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", margin: 0 }}>{erro}</p>}

      {/* ── 1. O que disseram (o Check que não existia) ── */}
      <section data-testid="feedbacks-do-ciclo">
        <h3 style={tituloEstilo}>O que disseram ({novos.length} sem tratar)</h3>
        <p style={proseEstilo}>
          O que as pessoas responderam ao assistente depois de gerar uma especificação. Cada um pode virar uma
          solicitação de ajuste — com prévia do efeito num item de exemplo antes de qualquer decisão.
        </p>

        {feedbacks.length === 0 && (
          <p style={vazioEstilo} data-testid="sem-feedback">
            Ninguém deixou feedback ainda. Ele é pedido pelo assistente a cada N especificações geradas (a cadência está
            no fim desta tela).
          </p>
        )}

        {novos.map((f) => (
          <article key={f.id} style={cardEstilo} data-testid={`feedback-${f.id}`}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{f.texto}</p>
            <p style={metaEstilo}>
              {f.email} · {new Date(f.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {f.timeId ? ` · ${f.timeId}` : ""}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setEmEstudio(f)} style={botaoPrimarioEstilo} data-testid={`propor-${f.id}`}>
                ✨ Propor ajuste
              </button>
              <button
                onClick={() => void executar(() => apiPdca.descartarFeedback(f.id))}
                style={botaoEstilo}
                data-testid={`descartar-${f.id}`}
              >
                Descartar
              </button>
            </div>
          </article>
        ))}

        {tratados.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 12, color: "var(--texto-fraco)", cursor: "pointer" }}>
              {tratados.length} já tratado(s)
            </summary>
            {tratados.map((f) => (
              <p key={f.id} style={{ ...metaEstilo, marginTop: 6 }}>
                {f.estado === "virou-ajuste" ? "→ virou solicitação" : "descartado"}: “{f.texto}”
              </p>
            ))}
          </details>
        )}
      </section>

      {/* ── 2. O estúdio: propor com prévia iterativa ── */}
      {emEstudio && regras && (
        <EstudioDeAjuste
          feedback={emEstudio}
          config={config}
          regras={regras}
          timeAtivo={timeAtivo}
          onCancelar={() => setEmEstudio(null)}
          onSalvo={() => {
            setEmEstudio(null);
            void recarregar();
          }}
        />
      )}

      {/* ── 3. Revisar e 4. Aplicar ── */}
      <section data-testid="solicitacoes-do-pdca">
        <h3 style={tituloEstilo}>Solicitações de ajuste ({pendentes.length} aguardando decisão)</h3>
        {ajustes.length === 0 && <p style={vazioEstilo}>Nenhuma solicitação ainda.</p>}
        {[...pendentes, ...decididos].map((a) => (
          <article key={a.id} style={cardEstilo} data-testid={`ajuste-${a.id}`}>
            <p style={{ margin: 0, fontSize: 13 }}>{a.descricao}</p>
            {a.operacao && <p style={{ ...metaEstilo, color: "var(--texto-2)" }}>{descreverOperacao(a.operacao)}</p>}
            <p style={metaEstilo}>
              {a.solicitante} · {a.recurso} · <strong>{a.estado}</strong>
              {a.aplicadaPor ? ` · aplicada por ${a.aplicadaPor}` : ""}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {a.estado === "pendente" && (
                <>
                  <button
                    onClick={() => void executar(() => apiPdca.decidirAjuste(a.id, true))}
                    style={botaoPrimarioEstilo}
                    data-testid={`aprovar-${a.id}`}
                  >
                    Aprovar
                  </button>
                  <button onClick={() => void executar(() => apiPdca.decidirAjuste(a.id, false))} style={botaoEstilo}>
                    Recusar
                  </button>
                </>
              )}
              {a.estado === "aprovada" && a.operacao && (
                <button
                  onClick={() => void executar(() => apiPdca.aplicarAjuste(a.id))}
                  style={botaoPrimarioEstilo}
                  data-testid={`aplicar-${a.id}`}
                  title="Aplica a mudança no documento de configuração e fecha o ciclo"
                >
                  Aplicar agora
                </button>
              )}
              {a.estado === "aprovada" && !a.operacao && onAbrirArea && AREA_DO_RECURSO[a.recurso] && (
                <button onClick={() => onAbrirArea(AREA_DO_RECURSO[a.recurso])} style={botaoEstilo}>
                  Abrir a configuração ↗
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* ── 5. Cadência (o ajuste fino do ciclo) ── */}
      <section>
        <h3 style={tituloEstilo}>Cadência</h3>
        <p style={proseEstilo}>
          De quantos em quantos usos o assistente pergunta o que mudar na configuração, e de quantas em quantas
          especificações geradas vem o pedido de feedback.
        </p>
        {cadencia && (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--texto-2)" }}>
              Entrevista a cada
              <input
                type="number"
                min={1}
                aria-label="Cadência da entrevista (usos)"
                value={cadencia.cadenciaUsos}
                onChange={(e) => setCadencia({ ...cadencia, cadenciaUsos: Number(e.target.value) })}
                style={{ ...inputEstilo, width: 70, marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--texto-2)" }}>
              Feedback a cada
              <input
                type="number"
                min={1}
                aria-label="Cadência do feedback (especificações)"
                value={cadencia.cadenciaFeedback}
                onChange={(e) => setCadencia({ ...cadencia, cadenciaFeedback: Number(e.target.value) })}
                style={{ ...inputEstilo, width: 70, marginLeft: 8 }}
              />
            </label>
            <button onClick={() => void executar(() => apiPdca.salvarConfig(cadencia))} style={botaoPrimarioEstilo}>
              Salvar cadência
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * O estúdio: escrever a mudança de um lado, ver o efeito num item de exemplo
 * do outro — e iterar. A prévia é determinística e recalcula a cada tecla; o
 * ✨ redige o texto do item de checklist a partir do feedback, e o "simular
 * com a IA" preenche a história do item de exemplo pra a leitura ficar real.
 */
function EstudioDeAjuste({
  feedback,
  config,
  regras,
  timeAtivo,
  onCancelar,
  onSalvo,
}: {
  feedback: FeedbackPdca;
  config: DiagramaConfig;
  regras: RegrasConfig;
  timeAtivo: string;
  onCancelar: () => void;
  onSalvo: () => void;
}) {
  const tipos = Object.entries(config.nodeTypes);
  const [tipoNo, setTipoNo] = useState(tipos[0]?.[0] ?? "");
  const techsDoTipo = config.nodeTypes[tipoNo]?.techs ?? [];
  const [operacaoTipo, setOperacaoTipo] = useState<OperacaoDeAjuste["tipo"]>("adicionar-checklist");
  const [tech, setTech] = useState(techsDoTipo[0] ?? "");
  const [texto, setTexto] = useState("");
  const [descricao, setDescricao] = useState(`A partir do feedback: “${feedback.texto}”`);
  const [contextual, setContextual] = useState(true);
  const [simulandoIa, setSimulandoIa] = useState<"texto" | "item" | null>(null);
  const [historiaSimulada, setHistoriaSimulada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Trocar de componente troca a tech alvo: manter a antiga produziria uma
  // regra que o item simulado nunca mostra (o erro mais fácil de cometer aqui).
  useEffect(() => {
    if (techsDoTipo.length > 0 && !techsDoTipo.includes(tech)) setTech(techsDoTipo[0]);
  }, [tipoNo]);

  const operacao: OperacaoDeAjuste | null = useMemo(() => {
    if (!tech || !texto.trim()) return null;
    return operacaoTipo === "adicionar-checklist"
      ? { tipo: "adicionar-checklist", tech, contextos: contextual ? config.nodeTypes[tipoNo]?.contextos ?? [] : [], texto: texto.trim() }
      : { tipo: "remover-checklist", tech, texto: texto.trim() };
  }, [operacaoTipo, tech, texto, contextual, tipoNo, config]);

  const previa = useMemo(
    () => (tipoNo ? simularItemComAjuste(config, regras, tipoNo, operacao) : null),
    [config, regras, tipoNo, operacao]
  );

  const itensDaTech = regras.porTech[tech]?.checklistTecnico ?? [];

  async function redigirComIa() {
    setErro(null);
    setSimulandoIa("texto");
    try {
      const { valor } = await apiIa.sugerir(
        {
          tech: tech || "Geral",
          rotulo: "item de checklist técnico a partir do feedback do time",
          contextoNo: `Feedback recebido: "${feedback.texto}". Escreva UMA linha de checklist técnico, objetiva e verificável.`,
        },
        (pedaco) => setTexto((t) => t + pedaco)
      );
      setTexto(valor.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redigir agora.");
    } finally {
      setSimulandoIa(null);
    }
  }

  async function simularItemComIa() {
    setErro(null);
    setSimulandoIa("item");
    setHistoriaSimulada("");
    try {
      const { valor } = await apiIa.sugerir(
        {
          tech: tech || "Geral",
          rotulo: "história de usuário de um item de exemplo",
          contextoNo: `Componente: ${config.nodeTypes[tipoNo]?.label ?? tipoNo}. Time: ${timeAtivo}.`,
        },
        (pedaco) => setHistoriaSimulada((h) => (h ?? "") + pedaco)
      );
      setHistoriaSimulada(valor.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível simular agora.");
    } finally {
      setSimulandoIa(null);
    }
  }

  async function salvar() {
    if (!operacao || !descricao.trim()) return;
    setErro(null);
    try {
      await apiPdca.criarAjuste({
        recurso: "regras",
        descricao: descricao.trim(),
        timeId: timeAtivo,
        operacao,
        feedbackId: feedback.id,
      });
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section style={estudioEstilo} data-testid="estudio-de-ajuste">
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Coluna 1 — a proposta */}
        <div style={{ flex: "1 1 320px", minWidth: 300 }}>
          <h3 style={tituloEstilo}>Propor ajuste</h3>
          <p style={{ ...proseEstilo, fontStyle: "italic" }}>“{feedback.texto}”</p>

          <label style={labelEstilo}>O que fazer</label>
          <select
            aria-label="Tipo de ajuste"
            value={operacaoTipo}
            onChange={(e) => setOperacaoTipo(e.target.value as OperacaoDeAjuste["tipo"])}
            style={inputEstilo}
          >
            <option value="adicionar-checklist">Adicionar item ao checklist técnico</option>
            <option value="remover-checklist">Remover item do checklist técnico</option>
          </select>

          <label style={labelEstilo}>Componente de exemplo (o item que vou simular)</label>
          <select aria-label="Componente de exemplo" value={tipoNo} onChange={(e) => setTipoNo(e.target.value)} style={inputEstilo}>
            {tipos.map(([tipo, cfg]) => (
              <option key={tipo} value={tipo}>
                {cfg.label}
              </option>
            ))}
          </select>

          <label style={labelEstilo}>Tecnologia alvo</label>
          <select aria-label="Tecnologia alvo" value={tech} onChange={(e) => setTech(e.target.value)} style={inputEstilo}>
            {[...new Set([...techsDoTipo, ...Object.keys(regras.porTech)])].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label style={labelEstilo}>Texto do item</label>
          {operacaoTipo === "remover-checklist" && itensDaTech.length > 0 ? (
            <select aria-label="Texto do item" value={texto} onChange={(e) => setTexto(e.target.value)} style={inputEstilo}>
              <option value="">— escolha o item a remover —</option>
              {itensDaTech.map((c) => (
                <option key={c.texto} value={c.texto}>
                  {c.texto}
                </option>
              ))}
            </select>
          ) : (
            <>
              <textarea
                aria-label="Texto do item"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                placeholder="ex.: Política de DLQ definida e monitorada"
                style={{ ...inputEstilo, resize: "vertical" }}
              />
              <button onClick={() => void redigirComIa()} disabled={simulandoIa !== null} style={botaoEstilo} data-testid="redigir-com-ia">
                {simulandoIa === "texto" ? "escrevendo…" : "✨ Redigir com o assistente"}
              </button>
            </>
          )}

          {operacaoTipo === "adicionar-checklist" && (
            <label style={{ ...labelEstilo, display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <input type="checkbox" checked={contextual} onChange={(e) => setContextual(e.target.checked)} />
              vale só nos contextos deste componente ({(config.nodeTypes[tipoNo]?.contextos ?? []).join(", ") || "nenhum"})
            </label>
          )}

          <label style={labelEstilo}>O pedido, em uma frase</label>
          <textarea
            aria-label="Descrição do pedido"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            style={{ ...inputEstilo, resize: "vertical" }}
          />

          {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => void salvar()} disabled={!operacao} style={botaoPrimarioEstilo} data-testid="salvar-ajuste">
              Salvar como solicitação
            </button>
            <button onClick={onCancelar} style={botaoEstilo}>
              Cancelar
            </button>
          </div>
        </div>

        {/* Coluna 2 — a prévia iterativa */}
        <div style={{ flex: "1 1 320px", minWidth: 300 }} data-testid="previa-do-ajuste">
          <h3 style={tituloEstilo}>Como fica um item de {config.nodeTypes[tipoNo]?.label ?? tipoNo}</h3>
          {!previa ? (
            <p style={vazioEstilo}>Este componente não gera item — escolha outro para ver a prévia.</p>
          ) : (
            <>
              {previa.adicionados.length === 0 && previa.removidos.length === 0 ? (
                <p style={{ ...proseEstilo, color: "var(--texto-mudo)" }} data-testid="previa-sem-efeito">
                  {operacao
                    ? "Nenhuma mudança neste item — a tecnologia escolhida não é a deste componente."
                    : "Escreva o item para ver o efeito aqui."}
                </p>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  {previa.adicionados.map((l) => (
                    <p key={l} style={{ ...diffEstilo, color: "var(--verde, #3ecf8e)" }} data-testid="previa-adicionado">
                      + {l.replace(/^- /, "")}
                    </p>
                  ))}
                  {previa.removidos.map((l) => (
                    <p key={l} style={{ ...diffEstilo, color: "var(--vermelho, #f87171)" }} data-testid="previa-removido">
                      − {l.replace(/^- /, "")}
                    </p>
                  ))}
                </div>
              )}

              <button onClick={() => void simularItemComIa()} disabled={simulandoIa !== null} style={botaoEstilo} data-testid="simular-item-ia">
                {simulandoIa === "item" ? "simulando…" : "✨ Simular o item com a IA"}
              </button>
              {historiaSimulada !== null && (
                <pre style={preEstilo} data-testid="historia-simulada">
                  {historiaSimulada || "…"}
                </pre>
              )}

              <pre style={{ ...preEstilo, maxHeight: 360 }} data-testid="previa-markdown">
                {previa.markdown}
              </pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const tituloEstilo: React.CSSProperties = { fontSize: 13, margin: "0 0 4px", color: "var(--texto)" };
const proseEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, margin: "0 0 10px", maxWidth: 700 };
const vazioEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-mudo)", margin: 0 };
const metaEstilo: React.CSSProperties = { fontSize: 11, color: "var(--texto-fraco)", margin: "4px 0 0" };
const cardEstilo: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  marginTop: 10,
};
const estudioEstilo: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid var(--acento)",
  background: "var(--painel-alto)",
};
const labelEstilo: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--texto-fraco)", margin: "10px 0 2px" };
const inputEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};
const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
  marginTop: 6,
};
const botaoPrimarioEstilo: React.CSSProperties = { ...botaoEstilo, border: "none", background: "var(--acento)", color: "#fff" };
const diffEstilo: React.CSSProperties = { fontSize: 12, margin: "2px 0", fontFamily: "ui-monospace, monospace" };
const preEstilo: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
  fontSize: 11.5,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  overflow: "auto",
  maxHeight: 220,
};
