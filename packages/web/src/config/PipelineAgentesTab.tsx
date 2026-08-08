import { useState } from "react";
import { PAPEIS_PADRAO, type ConfigPipelineAgentes, type GrupoFicha, type PapelConfigurado } from "../api/client";

export interface PipelineAgentesTabProps {
  config: ConfigPipelineAgentes;
  onSalvar: (dados: ConfigPipelineAgentes) => Promise<void>;
}

const ROTULO_GRUPO: Record<GrupoFicha, string> = {
  po: "História e critérios de aceite (seção PO)",
  arquiteto: "Contrato técnico (seção Arquiteto)",
  especialista: "Checklist técnico e volumetria (seção Especialista)",
  qa: "Regras de teste e cenário Gherkin (seção QA)",
};

/**
 * SPEC-24 Fase F — o funil é configurável, como o usuário pediu desde o
 * início: reordenar/desabilitar papéis, editar nome/descrição/prompt de cada
 * um, e criar agentes contextuais (papel custom preso a techs/contextos
 * específicos, que "rouba" os itens do contexto dele do papel geral quando
 * vem antes na ordem). As SEÇÕES da ficha continuam fixas — todo papel
 * escreve numa delas (`grupo`).
 */
export function PipelineAgentesTab({ config, onSalvar }: PipelineAgentesTabProps) {
  const [confirmacaoObrigatoria, setConfirmacaoObrigatoria] = useState(config.confirmacaoObrigatoria);
  const [papeis, setPapeis] = useState<PapelConfigurado[]>(config.papeis?.length ? config.papeis : PAPEIS_PADRAO);
  // Texto CRU do campo de contextos por papel — normalizar (split/trim/join)
  // a cada tecla apagava a vírgula que o usuário acabou de digitar (input
  // controlado re-renderiza com o valor normalizado). O parse de verdade
  // acontece no onChange pro estado canônico, mas o input mostra o cru.
  const [textoContextos, setTextoContextos] = useState<Record<string, string>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);

  function editarPapeis(novos: PapelConfigurado[]) {
    setPapeis(novos);
    setSujo(true);
  }

  function editarPapel(id: string, mudanca: Partial<PapelConfigurado>) {
    editarPapeis(papeis.map((p) => (p.id === id ? { ...p, ...mudanca } : p)));
  }

  function mover(id: string, direcao: -1 | 1) {
    const i = papeis.findIndex((p) => p.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= papeis.length) return;
    const novos = [...papeis];
    [novos[i], novos[j]] = [novos[j], novos[i]];
    editarPapeis(novos);
  }

  function adicionarCustom() {
    const base = "agente-custom";
    let id = base;
    for (let n = 2; papeis.some((p) => p.id === id); n++) id = `${base}-${n}`;
    editarPapeis([
      ...papeis,
      { id, nome: "Agente custom", descricao: "", grupo: "especialista", preambulo: "", ativo: true, contextos: [] },
    ]);
    setExpandido(id);
  }

  function remover(id: string) {
    editarPapeis(papeis.filter((p) => p.id !== id));
  }

  async function alternarConfirmacao(valor: boolean) {
    setConfirmacaoObrigatoria(valor);
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ confirmacaoObrigatoria: valor, papeis });
    } catch (e) {
      setConfirmacaoObrigatoria(!valor);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPapeis() {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ confirmacaoObrigatoria, papeis });
      setSujo(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Controla a esteira de agentes da tela de revisão: a ordem em que os papéis rodam, o que cada um escreve
        (nome, descrição e prompt), em quais contextos se aplica — e se as respostas pausam pra sua confirmação ou
        são aplicadas direto.
      </p>

      <div style={cardEstilo}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={confirmacaoObrigatoria}
            onChange={(e) => void alternarConfirmacao(e.target.checked)}
            disabled={salvando}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ fontSize: 13, color: "var(--texto)", display: "block" }}>Confirmação obrigatória</strong>
            <span style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6 }}>
              {confirmacaoObrigatoria
                ? "Ligado — cada campo sugerido pela IA fica pendente até você revisar e confirmar, um a um."
                : "Desligado — a esteira aplica cada campo direto, sem pausa, avançando sozinha até o fim. Você ainda pode revisar e editar qualquer campo depois."}
            </span>
          </span>
        </label>
      </div>

      <div style={{ ...cardEstilo, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <strong style={{ fontSize: 13, color: "var(--texto)" }}>Papéis da esteira (na ordem em que rodam)</strong>
          <button onClick={adicionarCustom} style={botaoEstilo} disabled={salvando}>
            + Agente contextual
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {papeis.map((p, i) => {
            const aberto = expandido === p.id;
            const ehPadrao = PAPEIS_PADRAO.some((padrao) => padrao.id === p.id);
            return (
              <div key={p.id} data-testid={`papel-config-${p.id}`} style={{ ...papelEstilo, ...(p.ativo ? {} : papelInativoEstilo) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={ordemEstilo}>{String(i + 1).padStart(2, "0")}</span>
                  <input
                    type="checkbox"
                    checked={p.ativo}
                    onChange={(e) => editarPapel(p.id, { ativo: e.target.checked })}
                    title={p.ativo ? "Desativar este papel (a esteira pula ele)" : "Ativar este papel"}
                    aria-label={`Papel ${p.nome} ativo`}
                  />
                  <button onClick={() => setExpandido(aberto ? null : p.id)} style={nomeBotaoEstilo}>
                    <b style={{ color: "var(--texto)" }}>{p.nome}</b>
                    {p.contextos.length > 0 && <span style={tagContextoEstilo}>{p.contextos.join(", ")}</span>}
                    {p.preambulo?.trim() ? <span style={tagPromptEstilo}>prompt custom</span> : null}
                  </button>
                  <button onClick={() => mover(p.id, -1)} disabled={i === 0 || salvando} style={setaEstilo} aria-label={`Subir ${p.nome}`}>
                    ↑
                  </button>
                  <button
                    onClick={() => mover(p.id, 1)}
                    disabled={i === papeis.length - 1 || salvando}
                    style={setaEstilo}
                    aria-label={`Descer ${p.nome}`}
                  >
                    ↓
                  </button>
                  {!ehPadrao && (
                    <button onClick={() => remover(p.id)} style={{ ...setaEstilo, color: "var(--vermelho)" }} aria-label={`Remover ${p.nome}`}>
                      ×
                    </button>
                  )}
                </div>

                {aberto && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, paddingLeft: 30 }}>
                    <label style={campoEstilo}>
                      Nome
                      <input value={p.nome} onChange={(e) => editarPapel(p.id, { nome: e.target.value })} style={inputEstilo} />
                    </label>
                    <label style={campoEstilo}>
                      Descrição (subtítulo na faixa de agentes)
                      <input
                        value={p.descricao ?? ""}
                        onChange={(e) => editarPapel(p.id, { descricao: e.target.value })}
                        style={inputEstilo}
                      />
                    </label>
                    <label style={campoEstilo}>
                      Seção da ficha que este papel escreve
                      <select
                        value={p.grupo}
                        onChange={(e) => editarPapel(p.id, { grupo: e.target.value as GrupoFicha })}
                        disabled={ehPadrao}
                        title={ehPadrao ? "Papéis padrão têm seção fixa — crie um agente contextual pra variar" : undefined}
                        style={inputEstilo}
                      >
                        {(Object.keys(ROTULO_GRUPO) as GrupoFicha[]).map((g) => (
                          <option key={g} value={g}>
                            {ROTULO_GRUPO[g]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={campoEstilo}>
                      Contextos/techs em que se aplica (separados por vírgula — vazio = todos os itens)
                      <input
                        value={textoContextos[p.id] ?? p.contextos.join(", ")}
                        onChange={(e) => {
                          setTextoContextos((t) => ({ ...t, [p.id]: e.target.value }));
                          editarPapel(p.id, {
                            contextos: e.target.value
                              .split(",")
                              .map((c) => c.trim())
                              .filter(Boolean),
                          });
                        }}
                        placeholder="ex.: Backend-mensagens, Kafka"
                        style={inputEstilo}
                      />
                    </label>
                    <label style={campoEstilo}>
                      Prompt do papel (preâmbulo — vazio usa o padrão da seção)
                      <textarea
                        value={p.preambulo ?? ""}
                        onChange={(e) => editarPapel(p.id, { preambulo: e.target.value })}
                        rows={3}
                        placeholder="Ex.: Você é o especialista em mensageria do time. Aplique nossos padrões de DLQ e retry..."
                        style={{ ...inputEstilo, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={dicaEstilo}>
          Quando dois papéis escrevem na mesma seção, o PRIMEIRO da lista cujos contextos casarem com o item leva —
          coloque o agente contextual antes do papel geral pra ele assumir os itens do contexto dele.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button onClick={() => void salvarPapeis()} disabled={!sujo || salvando} style={{ ...botaoEstilo, ...(sujo ? botaoPrimarioEstilo : {}) }}>
            {salvando ? "Salvando…" : "Salvar papéis"}
          </button>
          {sujo && <span style={{ fontSize: 11.5, color: "var(--amarelo)" }}>alterações não salvas</span>}
        </div>
        {erro && <p style={erroEstilo}>{erro}</p>}
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
  maxWidth: 680,
};

const papelEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--painel-alto)",
};

const papelInativoEstilo: React.CSSProperties = { opacity: 0.55 };

const ordemEstilo: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  color: "var(--texto-mudo)",
  width: 20,
  flexShrink: 0,
};

const nomeBotaoEstilo: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
  padding: 0,
};

const tagContextoEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--acento)",
  background: "rgba(56, 189, 248, 0.12)",
  borderRadius: 999,
  padding: "1px 8px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const tagPromptEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "#a5b4fc",
  background: "rgba(99, 102, 241, 0.16)",
  borderRadius: 999,
  padding: "1px 8px",
  whiteSpace: "nowrap",
};

const setaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  borderRadius: 6,
  width: 26,
  height: 24,
  cursor: "pointer",
  flexShrink: 0,
};

const campoEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11.5,
  color: "var(--texto-fraco)",
};

const inputEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "var(--acento-indigo)",
  border: "1px solid var(--acento-indigo)",
  color: "#fff",
};

const dicaEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--texto-mudo)",
  lineHeight: 1.5,
  marginBottom: 0,
};

const erroEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--vermelho)",
  marginTop: 8,
  marginBottom: 0,
};
