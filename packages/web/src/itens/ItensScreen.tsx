import { useState } from "react";
import type { ItemGerado } from "../api/client";

/**
 * SPEC-41 Parte B — a tela dos itens de trabalho (`#/itens`), no padrão de
 * telas da SPEC-40 (☰ Menu · título · Voltar ao canvas). O card responde as
 * três perguntas de quem vai levar o item adiante, nesta ordem: "o que é?"
 * (título + tipo/tamanho), "posso exportar?" (a régua de completude — quantos
 * ✍️ restam e quantas sugestões aguardam confirmação) e "o que vem antes?"
 * (badges de dependência). O corpo completo abre sob demanda — o markdown é
 * material de leitura, não de varredura.
 */
export interface ItensScreenProps {
  itens: ItemGerado[];
  tituloDaQuebra: string | null;
  /** Momento da geração (do primeiro item) — a "versão" do conjunto. */
  onAbrirMenu: () => void;
  onFechar: () => void;
  /** Regenerar = voltar pra revisão, onde o material mora. */
  onIrParaRevisao?: () => void;
}

function completudeDoItem(item: ItemGerado): { rotulo: string; cor: string; fundo: string } {
  if (item.estado === "exportado") return { rotulo: "Exportado", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0 && item.sugestoes === 0)
    return { rotulo: "Pronto pra exportar", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0)
    return {
      rotulo: `${item.sugestoes} sugestão${item.sugestoes === 1 ? "" : "s"} a confirmar`,
      cor: "var(--amarelo, #facc15)",
      fundo: "rgba(250, 204, 21, 0.12)",
    };
  return {
    rotulo: `✍️ ${item.pendencias} campo${item.pendencias === 1 ? "" : "s"} a especificar`,
    cor: "var(--laranja, #fb923c)",
    fundo: "rgba(251, 146, 60, 0.12)",
  };
}

export function ItensScreen({ itens, tituloDaQuebra, onAbrirMenu, onFechar, onIrParaRevisao }: ItensScreenProps) {
  const [aberto, setAberto] = useState<string | null>(null);

  const prontos = itens.filter((i) => i.pendencias === 0 && i.sugestoes === 0).length;
  const geradoEm = itens[0]?.criadoEm ? new Date(itens[0].criadoEm) : null;

  return (
    <div style={telaEstilo} data-testid="itens-screen">
      <header style={headerEstilo}>
        <button onClick={onAbrirMenu} style={botaoEstilo}>
          ☰ Menu
        </button>
        <strong style={{ fontSize: 14 }}>Itens de trabalho</strong>
        <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
          {tituloDaQuebra ? `Demanda: ${tituloDaQuebra}` : "Itens gerados da demanda"}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar ao canvas
        </button>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }} data-testid="corpo-dos-itens">
        {itens.length === 0 ? (
          <div style={vazioEstilo} data-testid="itens-vazio">
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Nenhum item gerado ainda.</p>
            <p style={{ fontSize: 13, color: "var(--texto-2)", maxWidth: 460, lineHeight: 1.6 }}>
              Os itens de trabalho nascem na revisão da quebra: derive a demanda, refine com a esteira e peça ao
              assistente para <em>gerar os itens</em>. Cada item vira um card aqui — com o corpo completo da
              especificação, pronto pra ser levado ao seu tracker.
            </p>
            {onIrParaRevisao && (
              <button onClick={onIrParaRevisao} style={{ ...botaoEstilo, ...botaoPrimarioEstilo, marginTop: 8 }}>
                Ir para a demanda
              </button>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            {/* A régua do conjunto: quantos já podem sair daqui. */}
            <div style={resumoEstilo} data-testid="itens-resumo">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <strong style={{ fontSize: 14 }}>
                  {prontos} de {itens.length} {itens.length === 1 ? "item pronto" : "itens prontos"} pra exportar
                </strong>
                {geradoEm && (
                  <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>
                    gerados em {geradoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
              <div style={trilhoEstilo} aria-hidden="true">
                <div style={{ ...barraEstilo, width: `${itens.length > 0 ? (prontos / itens.length) * 100 : 0}%` }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: "6px 0 0" }}>
                Um item fica pronto quando nenhum campo pede “✍️ especificar” e nenhuma sugestão da esteira está sem
                confirmação. A exportação pro seu tracker (Jira etc.) chega na próxima fase — os corpos já saem
                completos daqui.
              </p>
            </div>

            {itens.map((item, i) => {
              const completude = completudeDoItem(item);
              const expandido = aberto === item.chave;
              return (
                <article key={item.chave} style={cardEstilo} data-testid={`item-gerado-${i}`}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={numeroEstilo}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{item.titulo}</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <span style={chipEstilo}>{item.tipo}</span>
                        <span style={chipEstilo}>tamanho {item.tamanho}</span>
                        <span
                          style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent" }}
                          data-testid={`item-completude-${i}`}
                        >
                          {completude.rotulo}
                        </span>
                        {item.estado === "exportado" && item.linkExterno && (
                          <a href={item.linkExterno} target="_blank" rel="noreferrer" style={{ ...chipEstilo, textDecoration: "none" }}>
                            abrir no tracker ↗
                          </a>
                        )}
                      </div>
                      {item.dependencias.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {item.dependencias.map((dep) => (
                            <span key={dep} style={depEstilo} title="Este item depende do outro — puxe na ordem.">
                              ⛓ {dep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setAberto(expandido ? null : item.chave)}
                      style={botaoEstilo}
                      aria-expanded={expandido}
                      data-testid={`item-expandir-${i}`}
                    >
                      {expandido ? "Fechar" : "Ver corpo"}
                    </button>
                  </div>
                  {expandido && (
                    <pre style={corpoEstilo} data-testid={`item-corpo-${i}`}>
                      {item.corpoMarkdown}
                    </pre>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const telaEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--painel)",
  zIndex: 55,
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, sans-serif",
};

const headerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderBottom: "1px solid var(--borda)",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "var(--acento)",
  borderColor: "var(--acento)",
  color: "#fff",
};

const vazioEstilo: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  textAlign: "center",
};

const resumoEstilo: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  marginBottom: 16,
};

const trilhoEstilo: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: "var(--fundo)",
  marginTop: 10,
  overflow: "hidden",
};

const barraEstilo: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "var(--verde, #4ade80)",
  transition: "width 300ms ease",
};

const cardEstilo: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  marginBottom: 12,
};

const numeroEstilo: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--texto-fraco)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 999,
  minWidth: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 1,
};

const chipEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-2)",
  background: "var(--fundo)",
};

const depEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px dashed var(--borda-forte)",
  color: "var(--texto-fraco)",
  background: "transparent",
};

const corpoEstilo: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 0,
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
  maxHeight: 420,
  overflow: "auto",
};
