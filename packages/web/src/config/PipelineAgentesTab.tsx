import { useState } from "react";
import { ANATOMIA_DO_PROMPT_PIPELINE, preambuloDoPapel } from "@gerador/aplicacao";
import { SeletorDeContextos } from "./SeletorDeContextos";
import {
  PAPEIS_PADRAO,
  type ConfigPipelineAgentes,
  type GrupoFicha,
  type PapelConfigurado,
  type SugestaoPapel,
} from "../api/client";
import { SugerirComIa } from "./SugerirComIa";

/** O preâmbulo que este papel manda hoje — o mesmo que a borda resolve na hora
 * do pedido. Importado da camada de aplicação em vez de recopiado aqui: uma
 * segunda cópia do texto envelheceria em silêncio, que é o defeito do #296
 * noutro lugar. */
function preambuloEfetivo(p: PapelConfigurado): string {
  return preambuloDoPapel(p.id, [{ id: p.id, grupo: p.grupo, preambulo: p.preambulo }]);
}

const ROTULO_ORIGEM: Record<string, string> = {
  configuravel: "você configura",
  "da-quebra": "vem da quebra",
  fixo: "fixo do produto",
};

export interface PipelineAgentesTabProps {
  config: ConfigPipelineAgentes;
  onSalvar: (dados: ConfigPipelineAgentes) => Promise<void>;
  /** Techs + contextos conhecidos — o campo de contextos do papel vira seleção
   * por clique, mesma correção da RegrasTab. Vazio = input livre. */
  opcoesDeContexto?: string[];
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
export function PipelineAgentesTab({ config, onSalvar, opcoesDeContexto }: PipelineAgentesTabProps) {
  const [confirmacaoObrigatoria, setConfirmacaoObrigatoria] = useState(config.confirmacaoObrigatoria);
  const [papeis, setPapeis] = useState<PapelConfigurado[]>(config.papeis?.length ? config.papeis : PAPEIS_PADRAO);
  const [expandido, setExpandido] = useState<string | null>(null);
  /**
   * Quem está com o editor de prompt ABERTO, independente do conteúdo.
   *
   * Derivar isso só de `preambulo` não-vazio parecia natural e tem um defeito
   * que o teste pegou: selecionar tudo e apagar pra reescrever esvazia o campo
   * por um instante, e o editor sumia no meio da digitação. O estado de "estou
   * editando" é do usuário, não do texto — só o botão de voltar ao padrão o
   * encerra.
   */
  const [editando, setEditando] = useState<Set<string>>(new Set());

  function abrirEditorDePrompt(p: PapelConfigurado) {
    editarPapel(p.id, { preambulo: preambuloEfetivo(p) });
    setEditando((atual) => new Set(atual).add(p.id));
  }

  function voltarAoPadrao(id: string) {
    editarPapel(id, { preambulo: "" });
    setEditando((atual) => {
      const novo = new Set(atual);
      novo.delete(id);
      return novo;
    });
  }
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

  /** SPEC-23 Fluxo 2 — a IA propõe o agente inteiro (id, nome, descrição,
   * preâmbulo e contextos). O preâmbulo é o que mais custa escrever à mão:
   * é ele que decide se o papel entrega três linhas ou uma especificação.
   * Entra como papel NOVO no fim da fila, já expandido pra revisão — e nada
   * é salvo até o usuário clicar em salvar, como qualquer edição manual. */
  function adicionarSugerido(sugestao: SugestaoPapel) {
    const base = sugestao.id?.trim() || "agente-custom";
    let id = base;
    for (let n = 2; papeis.some((p) => p.id === id); n++) id = `${base}-${n}`;
    editarPapeis([
      ...papeis,
      {
        id,
        nome: sugestao.nome || "Agente custom",
        descricao: sugestao.descricao ?? "",
        // Um papel novo escreve na seção do especialista: é a única das quatro
        // seções da ficha que aceita mais de um autor. Trocar de grupo continua
        // sendo escolha do usuário, no editor abaixo.
        grupo: "especialista",
        preambulo: sugestao.preambulo ?? "",
        ativo: true,
        contextos: sugestao.contextos ?? [],
      },
    ]);
    setExpandido(id);
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

        <SugerirComIa<SugestaoPapel>
          alvo="papel"
          contexto={`A esteira hoje tem os papéis: ${papeis.map((p) => p.nome).join(", ")}.`}
          exemplo="ex.: um agente de segurança que cobre LGPD e dados sensíveis"
          onSugestao={adicionarSugerido}
        />

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
                      Contextos/techs em que se aplica
                      {/* O estado de "texto cru" que vivia aqui (pra vírgula não
                          sumir a cada tecla) morreu junto com a digitação: com
                          seleção por clique, o valor canônico É o do gesto. */}
                      <SeletorDeContextos
                        valores={p.contextos}
                        opcoes={opcoesDeContexto ?? []}
                        onMudar={(contextos) => editarPapel(p.id, { contextos })}
                        rotuloVazio="vazio = todos os itens"
                        ariaLabel={`Contextos do papel ${p.nome}`}
                      />
                    </label>
                    {/**
                     * ACHADO REAL (#296): aqui havia só o `textarea` com
                     * `value={p.preambulo ?? ""}` — em branco pra todo papel não
                     * personalizado. O prompt que de fato ia pro modelo (o padrão
                     * da seção) era invisível, e a pessoa não tinha como editar o
                     * que não conseguia ler.
                     *
                     * Herdado continua sendo herdado: o texto aparece em modo
                     * leitura e só vira cópia editável quando alguém clica —
                     * salvar uma cópia do padrão sem querer congelaria o papel
                     * numa versão que não acompanha as melhorias do produto.
                     */}
                    <div style={campoEstilo}>
                      Prompt do papel (preâmbulo)
                      {p.preambulo?.trim() || editando.has(p.id) ? (
                        <>
                          <textarea
                            value={p.preambulo}
                            onChange={(e) => editarPapel(p.id, { preambulo: e.target.value })}
                            rows={6}
                            data-testid={`preambulo-${p.id}`}
                            style={{ ...inputEstilo, resize: "vertical", fontFamily: "inherit" }}
                          />
                          <button
                            onClick={() => voltarAoPadrao(p.id)}
                            style={{ ...botaoEstilo, alignSelf: "flex-start", marginTop: 6 }}
                          >
                            Voltar ao padrão da seção
                          </button>
                        </>
                      ) : (
                        <>
                          <pre data-testid={`preambulo-herdado-${p.id}`} style={promptHerdadoEstilo}>
                            {preambuloEfetivo(p)}
                          </pre>
                          <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
                            Padrão da seção — usado como está. Editar cria uma cópia só deste papel, que deixa de
                            acompanhar melhorias futuras do padrão.
                          </span>
                          <button
                            onClick={() => abrirEditorDePrompt(p)}
                            style={{ ...botaoEstilo, alignSelf: "flex-start", marginTop: 6 }}
                          >
                            Editar a partir deste texto
                          </button>
                        </>
                      )}
                    </div>
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

        {/**
         * A segunda metade do #296: "os locais das variáveis também parecem não
         * aparecer". O preâmbulo é só a CABEÇA do prompt — o resto é montado por
         * `montarPedidoPipeline` e era invisível. A lista vem da própria camada
         * de aplicação, e `pedidos.anatomia.test.ts` monta um prompt de verdade
         * pra provar que cada parte declarada existe nele.
         */}
        <details style={anatomiaEstilo} data-testid="anatomia-do-prompt">
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--texto)" }}>
            <strong>Como o prompt de cada papel é montado</strong> — onde entra o que você preenche
          </summary>
          <p style={{ ...dicaEstilo, marginTop: 10 }}>
            O preâmbulo acima é só o começo. Na hora de rodar, a esteira monta o prompt nesta ordem, e as partes
            opcionais somem quando não há o que colocar nelas:
          </p>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 10 }}>
            {ANATOMIA_DO_PROMPT_PIPELINE.map((parte) => (
              <li key={parte.id} style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>
                <strong style={{ color: "var(--texto)" }}>{parte.rotulo}</strong>{" "}
                <span style={tagOrigemEstilo}>{ROTULO_ORIGEM[parte.origem]}</span>
                {parte.ondeSeEdita ? <div style={{ marginTop: 3 }}>Onde se mexe: {parte.ondeSeEdita}.</div> : null}
              </li>
            ))}
          </ol>
        </details>

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
  color: "var(--acento-gente-texto)",
  background: "rgba(99, 102, 241, 0.16)",
  borderRadius: 999,
  padding: "1px 8px",
  whiteSpace: "nowrap",
};

const tagOrigemEstilo: React.CSSProperties = {
  ...tagPromptEstilo,
  color: "var(--texto-2)",
  background: "var(--fundo-2)",
  border: "1px solid var(--borda)",
};

/** O preâmbulo herdado, em leitura. `pre` porque os padrões são texto corrido
 * longo e quebrar por conta própria esconde onde uma frase termina. */
const promptHerdadoEstilo: React.CSSProperties = {
  margin: "4px 0 0",
  padding: 10,
  background: "var(--fundo-2)",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--texto-2)",
  whiteSpace: "pre-wrap",
  maxHeight: 200,
  overflowY: "auto",
  fontFamily: "inherit",
};

const anatomiaEstilo: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 8,
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
