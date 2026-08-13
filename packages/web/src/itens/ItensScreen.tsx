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
  /** SPEC-44 — deep-link: abre a revisão JÁ no item deste card. */
  onRevisarItem?: (chave: string) => void;
}

function completudeDoItem(item: ItemGerado): { rotulo: string; cor: string; fundo: string } {
  if (item.estado === "exportado") return { rotulo: "Exportado", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0 && item.sugestoes === 0)
    return { rotulo: "Pronto pra exportar", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0)
    return {
      rotulo: `${item.sugestoes} ${item.sugestoes === 1 ? "sugestão" : "sugestões"} a confirmar`,
      cor: "var(--amarelo, #facc15)",
      fundo: "rgba(250, 204, 21, 0.12)",
    };
  return {
    rotulo: `✍️ ${item.pendencias} campo${item.pendencias === 1 ? "" : "s"} a especificar`,
    cor: "var(--laranja, #fb923c)",
    fundo: "rgba(251, 146, 60, 0.12)",
  };
}

export function ItensScreen({ itens, tituloDaQuebra, onAbrirMenu, onFechar, onIrParaRevisao, onRevisarItem }: ItensScreenProps) {
  // SPEC-47 — a escrita REAL do item aparece por padrão: a tela era uma lista
  // de títulos, e o que interessa a quem vai executar é o texto (§196). Quem
  // quiser varrer a lista fecha; o estado guarda quem está FECHADO.
  const [fechados, setFechados] = useState<string[]>([]);

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
              const expandido = !fechados.includes(item.chave);
              return (
                <article key={item.chave} style={cardEstilo} data-testid={`item-gerado-${i}`}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={numeroEstilo}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{item.titulo}</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <span style={chipEstilo}>{item.tipo}</span>
                        <span style={chipEstilo}>tamanho {item.tamanho}</span>
                        {/* SPEC-44 — item não-pronto: o chip é o caminho de
                            VOLTA pra revisão daquele item, não um beco. */}
                        {onRevisarItem && (item.pendencias > 0 || item.sugestoes > 0) && item.estado !== "exportado" ? (
                          <button
                            onClick={() => onRevisarItem(item.chave)}
                            title="Abrir a revisão já neste item pra resolver as pendências"
                            style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent", cursor: "pointer" }}
                            data-testid={`item-completude-${i}`}
                          >
                            {completude.rotulo} ↩
                          </button>
                        ) : (
                          <span
                            style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent" }}
                            data-testid={`item-completude-${i}`}
                          >
                            {completude.rotulo}
                          </span>
                        )}
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
                      onClick={() =>
                        setFechados((atuais) =>
                          expandido ? [...atuais, item.chave] : atuais.filter((c) => c !== item.chave)
                        )
                      }
                      style={botaoEstilo}
                      aria-expanded={expandido}
                      data-testid={`item-expandir-${i}`}
                    >
                      {expandido ? "Recolher" : "Ver a escrita"}
                    </button>
                  </div>
                  {expandido && (
                    <div style={corpoEstilo} data-testid={`item-corpo-${i}`}>
                      <EscritaDoItem markdown={item.corpoMarkdown} />
                    </div>
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

/**
 * SPEC-47 — a escrita do item, legível. O corpo vem em markdown (o MESMO
 * texto que vai pro documento e, na fase 2, pro tracker); aqui ele é lido
 * como texto formatado, não como código: títulos viram títulos, listas viram
 * listas, tabela e bloco de código continuam monoespaçados. Sem dependência
 * nova — o subconjunto que o gerador emite é pequeno e conhecido.
 */
function EscritaDoItem({ markdown }: { markdown: string }) {
  const blocos: React.ReactNode[] = [];
  const linhas = markdown.split("\n");
  let lista: string[] = [];
  let codigo: string[] | null = null;

  const fecharLista = (chave: string) => {
    if (lista.length === 0) return;
    blocos.push(
      <ul key={`ul-${chave}`} style={listaEstilo}>
        {lista.map((item, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {comNegrito(item)}
          </li>
        ))}
      </ul>
    );
    lista = [];
  };

  linhas.forEach((linha, i) => {
    if (linha.trim().startsWith("```")) {
      if (codigo === null) {
        fecharLista(String(i));
        codigo = [];
      } else {
        blocos.push(
          <pre key={`code-${i}`} style={blocoCodigoEstilo}>
            {codigo.join("\n")}
          </pre>
        );
        codigo = null;
      }
      return;
    }
    if (codigo !== null) {
      codigo.push(linha);
      return;
    }

    const titulo = /^(#{2,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharLista(String(i));
      const nivel = titulo[1].length;
      blocos.push(
        <p key={`h-${i}`} style={{ ...tituloSecaoEstilo, fontSize: nivel <= 3 ? 13 : 12 }}>
          {titulo[2]}
        </p>
      );
      return;
    }
    if (/^\s*[-*]\s+/.test(linha)) {
      lista.push(linha.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    fecharLista(String(i));
    if (linha.trim() === "") return;
    // Tabela do markdown: monoespaçada, senão as colunas não alinham.
    const ehTabela = linha.trim().startsWith("|");
    blocos.push(
      <p key={`p-${i}`} style={ehTabela ? linhaTabelaEstilo : paragrafoEstilo}>
        {comNegrito(linha)}
      </p>
    );
  });
  fecharLista("fim");

  return <>{blocos}</>;
}

/** `**negrito**` do markdown — o gerador usa em rótulo de campo e de seção. */
function comNegrito(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte
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
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
  maxHeight: 520,
  overflow: "auto",
};

const tituloSecaoEstilo: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--texto)",
  margin: "12px 0 4px",
};

const paragrafoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--texto-2)",
  margin: "0 0 6px",
  whiteSpace: "pre-wrap",
};

const linhaTabelaEstilo: React.CSSProperties = {
  ...paragrafoEstilo,
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
  fontSize: 11.5,
  margin: 0,
};

const listaEstilo: React.CSSProperties = {
  margin: "0 0 8px",
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--texto-2)",
};

const blocoCodigoEstilo: React.CSSProperties = {
  margin: "0 0 8px",
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--painel-alto)",
  fontSize: 11.5,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
};

