import { useRef, useState } from "react";
import type { DiagramaConfig, PerfisConfig } from "@gerador/engine";
import { apiIa, type DiagramaProposto } from "../api/client";
import { BotaoFalar } from "./BotaoFalar";
import { useVozNaEntrada } from "./useVozNaEntrada";

export interface ConversaPanelProps {
  config: DiagramaConfig;
  perfisTime?: PerfisConfig;
  timeAtivo?: string;
  techs?: string[];
  contextos?: string[];
  /** O que o usuário já escreveu no "Contexto do épico" — a conversa começa
   * com isso na caixa, em vez de pedir que ele digite tudo de novo. */
  contextoInicial?: string;
  onAplicar: (proposta: DiagramaProposto) => void;
  onFechar: () => void;
}

interface Mensagem {
  autor: "voce" | "agente";
  texto: string;
  /** Presente na resposta do agente: a proposta estruturada que dá pra aplicar. */
  proposta?: DiagramaProposto;
}

/**
 * SPEC-27 Fase 1 — a conversa do desenho.
 *
 * A primitiva que faltava no produto: uma janela onde se descreve a demanda em
 * português e um agente responde com o DIAGRAMA proposto. Até aqui a ferramenta
 * ajudava a especificar o que já tinha sido desenhado, e não ajudava a desenhar
 * — o botão "Contexto do épico" só guardava o texto, ninguém o lia pra propor
 * arquitetura.
 *
 * **Uma conversa por fase** (SPEC-27 §3): esta é só sobre o desenho. A da
 * especificação (alterar item, revisar os demais) é outra, começa limpa, e é
 * assim de propósito — no modelo local, estourar a janela não dá erro claro,
 * dá resposta pior em silêncio. Quem monta o histórico enviado é o app, então
 * o que entra na janela é decisão de produto.
 *
 * A resposta nunca é aplicada sozinha: vira um cartão com o porquê de cada nó
 * e um botão. Confirmar é do usuário.
 */
export function ConversaPanel({
  config,
  perfisTime,
  timeAtivo,
  techs,
  contextos,
  contextoInicial,
  onAplicar,
  onFechar,
}: ConversaPanelProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      autor: "agente",
      texto:
        "Descreva a demanda: o que precisa ser construído, quais sistemas participam, o que muda. Eu proponho o diagrama com os tipos que este projeto tem configurados, e você decide se aplica.",
    },
  ]);
  const [entrada, setEntrada] = useState(contextoInicial?.trim() ?? "");
  // SPEC-30 Fase 1a — mesmo hook da `JanelaConversa`; o texto ditado cai neste
  // mesmo campo, editável antes de enviar.
  const { podeFalar, gravacao } = useVozNaEntrada(setEntrada);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const tiposDeNo = Object.entries(config.nodeTypes).map(([id, cfg]) => ({ id, rotulo: cfg.label ?? id }));
  const tiposDeConexao = Object.entries(config.edgeTypes ?? {}).map(([id, cfg]) => ({
    id,
    rotulo: (cfg as { label?: string }).label ?? id,
  }));

  /** A stack do time vira uma frase — é contexto que o usuário não deveria ter
   * que repetir a cada demanda (é justamente pra isso que perfis-time existe). */
  function descreverPerfil(): string | undefined {
    const perfil = timeAtivo ? perfisTime?.[timeAtivo] : undefined;
    if (!perfil) return undefined;
    const partes = Object.entries(perfil).flatMap(([tipoNo, valores]) =>
      Object.entries(valores as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([campo, v]) => `${tipoNo}.${campo}: ${String(v)}`)
    );
    return partes.length > 0 ? partes.join("; ") : undefined;
  }

  async function enviar() {
    const descricao = entrada.trim();
    if (!descricao || pensando) return;
    setMensagens((m) => [...m, { autor: "voce", texto: descricao }]);
    setEntrada("");
    setPensando(true);
    setErro(null);
    try {
      const proposta = await apiIa.proporDiagrama({
        descricao,
        tiposDeNo,
        tiposDeConexao,
        techs,
        contextos,
        perfilTime: descreverPerfil(),
      });
      setMensagens((m) => [
        ...m,
        {
          autor: "agente",
          texto: `Proposta: ${proposta.nos.length} componente(s) e ${proposta.arestas.length} conexão(ões).`,
          proposta,
        },
      ]);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Não foi possível propor o diagrama.";
      setErro(mensagem);
      setMensagens((m) => [...m, { autor: "agente", texto: `Não consegui: ${mensagem}` }]);
    } finally {
      setPensando(false);
      fimRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }

  return (
    <aside style={painelEstilo} data-testid="conversa-desenho" aria-label="Conversa do desenho">
      <header style={cabecalhoEstilo}>
        <strong style={{ fontSize: 13 }}>Desenhar conversando</strong>
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>fase: desenho</span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={botaoFecharEstilo} aria-label="Fechar conversa">
          ×
        </button>
      </header>

      <div style={listaEstilo}>
        {mensagens.map((m, i) => (
          <div key={i} style={m.autor === "voce" ? balaoVoceEstilo : balaoAgenteEstilo}>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.proposta && (
              <div style={cartaoEstilo} data-testid={`proposta-${i}`}>
                <ul style={{ margin: "0 0 8px", paddingLeft: 16, fontSize: 12, lineHeight: 1.7 }}>
                  {m.proposta.nos.map((n) => (
                    <li key={n.id}>
                      <strong>{n.rotulo}</strong>{" "}
                      <span style={{ color: "var(--texto-mudo)" }}>({config.nodeTypes[n.tipo]?.label ?? n.tipo})</span>
                      <div style={{ color: "var(--texto-2)", fontSize: 11.5 }}>{n.motivo}</div>
                    </li>
                  ))}
                </ul>
                {m.proposta.arestas.length > 0 && (
                  <ul style={{ margin: "0 0 8px", paddingLeft: 16, fontSize: 12, lineHeight: 1.7 }}>
                    {m.proposta.arestas.map((a, j) => {
                      const de = m.proposta!.nos.find((n) => n.id === a.de)?.rotulo ?? a.de;
                      const para = m.proposta!.nos.find((n) => n.id === a.para)?.rotulo ?? a.para;
                      return (
                        <li key={j}>
                          {de} → {para} <span style={{ color: "var(--texto-mudo)" }}>({a.tipo})</span>
                          <div style={{ color: "var(--texto-2)", fontSize: 11.5 }}>{a.motivo}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button onClick={() => onAplicar(m.proposta!)} style={botaoAplicarEstilo}>
                  Aplicar ao canvas
                </button>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--texto-mudo)" }}>
                  Os nós entram como qualquer outro — dá pra editar, renomear e apagar depois.
                </p>
              </div>
            )}
          </div>
        ))}
        {pensando && (
          <div style={balaoAgenteEstilo} data-testid="conversa-pensando">
            pensando…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <p style={{ margin: "0 12px", fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</p>}

      {/* SPEC-30 Fase 1a — falar a demanda em vez de digitar. É AQUI que o
          pedido nasceu ("botão falar, com animações em Desenhar conversando"),
          e esta janela não reusa a `JanelaConversa`: as duas plugam o mesmo
          hook, cada uma no seu rodapé. */}
      {podeFalar && (
        <div style={{ padding: "0 12px 6px" }}>
          <BotaoFalar gravacao={gravacao} />
        </div>
      )}

      <div style={rodapeEstilo}>
        <textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha — convenção de chat.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={3}
          disabled={pensando}
          placeholder="ex.: precisamos que o checkout consulte o saldo de pontos de fidelidade antes de fechar o pedido"
          aria-label="Descreva a demanda"
          style={entradaEstilo}
        />
        <button onClick={() => void enviar()} disabled={pensando || !entrada.trim()} style={botaoEnviarEstilo}>
          {pensando ? "pensando…" : "Enviar"}
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
  width: 420,
  maxWidth: "100vw",
  display: "flex",
  flexDirection: "column",
  background: "var(--painel)",
  borderLeft: "1px solid var(--borda-forte)",
  zIndex: 40,
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--borda)",
  color: "var(--texto)",
};

const listaEstilo: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const balaoBase: React.CSSProperties = {
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  lineHeight: 1.6,
  border: "1px solid var(--borda)",
};

const balaoAgenteEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto-2)",
};

const balaoVoceEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "transparent",
  borderColor: "var(--acento)",
  color: "var(--texto)",
  alignSelf: "flex-end",
  maxWidth: "90%",
};

const cartaoEstilo: React.CSSProperties = {
  marginTop: 8,
  padding: 8,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
};

const botaoAplicarEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

const rodapeEstilo: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  padding: 12,
  borderTop: "1px solid var(--borda)",
};

const entradaEstilo: React.CSSProperties = {
  flex: 1,
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12.5,
  resize: "vertical",
};

const botaoEnviarEstilo: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoFecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};
