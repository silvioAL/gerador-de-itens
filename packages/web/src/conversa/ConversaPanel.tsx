import { useEffect, useRef, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import type { SugestoesDeStack } from "../api/client";
import { apiIa, type DiagramaProposto } from "../api/client";
import { AnexoDeImagem, type ImagemAnexada } from "./AnexoDeImagem";
import { BotaoFalar } from "./BotaoFalar";
import { useVozNaEntrada } from "./useVozNaEntrada";
import { useAdrNaEntrada } from "./useAdrNaEntrada";

export interface ConversaPanelProps {
  config: DiagramaConfig;
  sugestoesDeStack?: SugestoesDeStack;
  timeAtivo?: string;
  techs?: string[];
  contextos?: string[];
  /** O que o usuário já escreveu no "Contexto da demanda" — a conversa começa
   * com isso na caixa, em vez de pedir que ele digite tudo de novo. */
  contextoInicial?: string;
  /** §235 — conversa EXCLUSIVA do tour: uma troca já pronta, com a proposta
   * que "produziu" o desenho que a mesa já tem. Abrir a conversa vazia no tour
   * mostraria uma caixa de texto e nada mais — e chamar o modelo de verdade
   * faria a demonstração depender de credencial e de rede. */
  mensagensDeDemonstracao?: Mensagem[];
  /**
   * SPEC-81 fatia D — a demanda aberta, para trazer os ADRs da casa.
   *
   * Ausente = demanda ainda não salva, e sem id não há o que perguntar ao
   * gateway. O botão simplesmente não aparece — como o de falar quando o
   * provedor não transcreve.
   */
  quebraId?: string | null;
  onAplicar: (proposta: DiagramaProposto) => void;
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
 * — o botão "Contexto da demanda" só guardava o texto, ninguém o lia pra propor
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
 *
 * Desde o #298 este painel não tem casca própria (posição, cabeçalho, fechar):
 * ele preenche a janela do `AssistenteFlutuante`, que é quem abre e fecha.
 */
export function ConversaPanel({
  config,
  sugestoesDeStack,
  timeAtivo,
  techs,
  contextos,
  contextoInicial,
  mensagensDeDemonstracao,
  quebraId,
  onAplicar,
}: ConversaPanelProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(
    mensagensDeDemonstracao ?? [
      {
        autor: "agente",
        texto:
          "Descreva a demanda — por texto ou por voz (🎤): o que precisa ser construído, quais sistemas participam, o que muda. Eu proponho o diagrama com os tipos que este projeto tem configurados, e você decide se aplica.",
      },
    ]
  );
  const [entrada, setEntrada] = useState(contextoInicial?.trim() ?? "");
  // SPEC-30 Fase 1a — mesmo hook da `JanelaConversa`; o texto ditado cai neste
  // mesmo campo, editável antes de enviar. A config vai junto: é dela que sai o
  // vocabulário técnico que a transcrição precisa conhecer.
  const { podeFalar, gravacao } = useVozNaEntrada(setEntrada, { config });
  const adr = useAdrNaEntrada(setEntrada, quebraId ?? null);
  // SPEC-30 Fase 2 — prints anexados a esta conversa.
  const [imagens, setImagens] = useState<ImagemAnexada[]>([]);
  const [podeAnexar, setPodeAnexar] = useState(false);
  const [destinoIa, setDestinoIa] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    apiIa
      .status()
      .then((s) => {
        if (cancelado) return;
        setPodeAnexar(s.capacidades?.visao === true);
        setDestinoIa(s.gateway?.baseUrl);
      })
      .catch(() => {
        // Sem status = sem anexo. Falhar para "não tem" pelo mesmo motivo do
        // microfone: oferecer o que o sistema não faz custa mais que esconder.
        if (!cancelado) setPodeAnexar(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const tiposDeNo = Object.entries(config.nodeTypes).map(([id, cfg]) => ({ id, rotulo: cfg.label ?? id }));
  const tiposDeConexao = Object.entries(config.edgeTypes ?? {}).map(([id, cfg]) => ({
    id,
    rotulo: (cfg as { label?: string }).label ?? id,
  }));

  /** SPEC-43 — as stacks conhecidas viram uma frase de contexto: o agente fica
   * sabendo os valores usuais sem o usuário repetir a cada demanda. */
  function descreverPerfil(): string | undefined {
    if (!sugestoesDeStack) return undefined;
    const partes = Object.entries(sugestoesDeStack).flatMap(([tipoNo, campos]) =>
      Object.entries(campos)
        .filter(([, valores]) => valores.length > 0)
        .map(([campo, valores]) => `${tipoNo}.${campo}: ${valores.join(" | ")}`)
    );
    return partes.length > 0 ? partes.join("; ") : undefined;
  }

  async function enviar() {
    const descricao = entrada.trim();
    // SPEC-30 Fase 2: um print JÁ É a descrição. Exigir texto junto obrigaria a
    // pessoa a redigitar o que a imagem mostra — o trabalho que anexar deveria
    // evitar. O montador aceita o mesmo (`montarPedidoDiagrama`).
    if ((!descricao && imagens.length === 0) || pensando) return;
    setMensagens((m) => [
      ...m,
      { autor: "voce", texto: descricao || `(${imagens.length} imagem(ns) anexada(s))` },
    ]);
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
        imagens: imagens.length ? imagens.map((i) => i.dataUrl) : undefined,
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
      // Os anexos são do TURNO, não da conversa: mantê-los reenviaria a mesma
      // imagem (e o mesmo custo de tokens) a cada mensagem seguinte.
      setImagens([]);
      fimRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }

  return (
    <aside style={painelEstilo} data-testid="conversa-desenho" aria-label="Conversa do desenho">
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
                  Aplicar à mesa de projeto
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
      {(podeFalar || podeAnexar || adr.podeTrazerAdr) && (
        <div style={{ padding: "0 12px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
          {podeFalar && <BotaoFalar gravacao={gravacao} />}
          {/**
           * SPEC-81 fatia D — o ADR da casa entra por aqui, **como a voz entra**.
           *
           * Ele não vira decisão flutuante: vira texto nesta caixa, editável, e
           * segue o caminho que já existe — a pessoa conversa, o motor propõe o
           * desenho, e a decisão nasce ancorada nos nós que ela criou.
           */}
          {adr.podeTrazerAdr && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => void adr.trazer()}
                disabled={adr.trazendo || pensando}
                data-testid="trazer-adr"
                style={botaoDeInsumoEstilo}
              >
                {adr.trazendo ? "buscando…" : "↙ Decisões da casa"}
              </button>
              {adr.ultimoTotal !== null && (
                <span style={{ fontSize: 11, color: "var(--texto-fraco)" }} data-testid="adr-trazidos">
                  {adr.ultimoTotal === 0 ? "nenhuma decisão nova" : `${adr.ultimoTotal} na caixa — revise antes de enviar`}
                </span>
              )}
              {adr.erro && (
                <span style={{ fontSize: 11, color: "var(--vermelho)" }} data-testid="adr-erro">
                  {adr.erro}
                </span>
              )}
            </div>
          )}
          {/* SPEC-30 Fase 2: um print de diagrama vira proposta de nós, com os
              tipos que existem na config. A imagem é insumo, não saída nova. */}
          {podeAnexar && (
            <AnexoDeImagem imagens={imagens} onMudar={setImagens} destino={destinoIa} desabilitado={pensando} />
          )}
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
        <button
          onClick={() => void enviar()}
          disabled={pensando || (!entrada.trim() && imagens.length === 0)}
          style={botaoEnviarEstilo}
        >
          {pensando ? "pensando…" : "Enviar"}
        </button>
      </div>
    </aside>
  );
}

const painelEstilo: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
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

/** SPEC-81 fatia D — insumo, não envio: mesmo peso visual do botão de falar. */
const botaoDeInsumoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};
