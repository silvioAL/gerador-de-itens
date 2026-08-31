import { useEffect, useMemo, useState } from "react";
import type {
  CampoDaFicha,
  DiagramaConfig,
  OperacaoDeAjuste,
  RecursoDeAjuste,
  RegrasConfig,
  RequisitoDeTopologia,
  SecaoDeRegras,
  TipoDeCampoProposto,
} from "@gerador/engine";
import { aplicarOperacaoNosCampos, descreverOperacao, diferencaDeCampos, recursoAlvoDaOperacao } from "@gerador/engine";
import {
  apiCamposAresta,
  apiCamposNo,
  apiIa,
  apiPdca,
  apiPipelineAgentes,
  apiRegras,
  type ConfigPipelineAgentes,
  type FeedbackPdca,
  type SolicitacaoAjuste,
  type CadenciaPdca,
  type MetricasDoCiclo,
} from "../api/client";
import type { AreaConfig } from "../navegacao/rota";
import { useMontado } from "../state/useMontado";
import { PainelDaAnalise } from "./PainelDaAnalise";
import { simularItemComAjuste } from "./previaDoAjuste";
import { ConstrutorDeForma, descreverForma } from "./FormaDoDesenho";

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
  /** SPEC-52 — um ajuste de FICHA foi aplicado: quem segura os campos em
   * memória (o App) precisa relê-los, senão o efeito só aparece num F5. */
  onFichaMudou?: () => void;
}

/** §276 — quantos tratados a lista mostra antes de pedir para ver o resto.
 * Oito cabe na tela e conta a história recente; o resto é arqueologia, e
 * arqueologia se pede. */
const TETO_DO_HISTORICO = 8;

const placarEstilo: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
};

const linkEstilo: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "var(--acento-gente-texto)",
  cursor: "pointer",
};

/**
 * SPEC-77 fatia D — `mesesParaRevisarVolume` fica aqui, junto da cadência.
 *
 * É a resposta da pergunta em aberto §6.2 ("qual é o N?"): não há número de uso
 * real para escolher, então ele é configurável, na mesma tela onde a cadência
 * já é. Seis meses é um começo, não uma régua.
 */
const CADENCIA_PADRAO = { cadenciaUsos: 5, cadenciaFeedback: 3, mesesParaRevisarVolume: 6 };

/** A área da configuração de cada recurso solicitável — o "abrir e editar". */
const AREA_DO_RECURSO: Record<string, AreaConfig> = {
  regras: "regras",
  "pipeline-agentes": "pipeline",
  "especificacao-template": "especificacao",
  "campos-no": "campos",
  "campos-aresta": "camposAresta",
};

export function PdcaTab({ config, timeAtivo, onAbrirArea, onFichaMudou }: PdcaTabProps) {
  const [cadencia, setCadencia] = useState<CadenciaPdca | null>(null);
  /** §276 — o histórico começa cortado: ele cresce para sempre, e a tela não é
   * um arquivo morto. */
  const [verTudoNoHistorico, setVerTudoNoHistorico] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackPdca[]>([]);
  const [ajustes, setAjustes] = useState<SolicitacaoAjuste[]>([]);
  const [regras, setRegras] = useState<RegrasConfig | null>(null);
  const [pipeline, setPipeline] = useState<ConfigPipelineAgentes | null>(null);
  const [emEstudio, setEmEstudio] = useState<FeedbackPdca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** SPEC-94 fatia Z — o ciclo medido. Recalculado a cada ação desta tela:
   *  decidir um pedido muda a fila e o tempo até a decisão. */
  const [metricas, setMetricas] = useState<MetricasDoCiclo | null>(null);

  /**
   * §281 — `recarregar` roda depois de TODA ação desta tela, e a resposta pode
   * chegar com a tela já fechada. Ref e não flag de efeito: a escrita nasce
   * fora do efeito (ver `useMontado`).
   */
  const montado = useMontado();

  async function recarregar() {
    const [cfg, fbs, ajs, regs, pipe, mets] = await Promise.all([
      apiPdca.config().catch(() => CADENCIA_PADRAO),
      apiPdca.listarFeedback().catch(() => []),
      apiPdca.listarAjustes(timeAtivo).catch(() => []),
      // §303 — SEM `timeAtivo`, e de propósito: esta tela mostra a PRÉVIA de
      // uma solicitação de ajuste, e quem a aplica (`POST /ajustes/:id/aplicar`)
      // grava em `configDocumentos` com `timeId: GLOBAL` fixo — um pedido de
      // ajuste vale para a organização. Ler o documento do time aqui mostraria
      // uma prévia sobre uma base que não é a que vai ser alterada.
      apiRegras.obter().catch(() => null),
      // SPEC-50 — o outro documento que o ajuste alcança: os papéis da esteira.
      apiPipelineAgentes.obter().catch(() => null),
      // SPEC-94 fatia Z — as métricas do ciclo. `null` no erro, e não um objeto
      // zerado: o painel precisa distinguir "não deu para medir" de "não há o
      // que medir", e um zero fabricado aqui apagaria a diferença.
      apiPdca.metricas(timeAtivo).catch(() => null),
    ]);
    // §266 — mesma régua do `ProdutosTab`: o formulário é de quem digita. O
    // `recarregar` roda depois de TODA ação desta tela (tratar feedback,
    // aplicar ajuste), e sobrescrever aqui apagaria a cadência que a pessoa
    // acabou de mudar por causa de um clique noutro canto da tela. Carrega uma
    // vez; depois disso, quem manda é o formulário.
    if (!montado.current) return;
    setCadencia((atual) => atual ?? cfg);
    setFeedbacks(fbs);
    setAjustes(ajs);
    setRegras(regs);
    setPipeline(pipe);
    setMetricas(mets);
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
  const descartados = tratados.filter((f) => f.estado !== "virou-ajuste");
  const pendentes = ajustes.filter((a) => a.estado === "pendente");
  const decididos = ajustes.filter((a) => a.estado !== "pendente");

  /**
   * SPEC-62 §4 — o placar mentia. Ele contava `virou-ajuste` como *"viraram
   * mudança na configuração"*, e um feedback cujo pedido foi RECUSADO entrava
   * na conta. O placar do §276 nasceu para responder "o que isto mudou";
   * contando recusa como mudança, respondia errado.
   *
   * "Virou mudança" passa a significar **solicitação aplicada**. O resto
   * aparece pelo que é — cada estado é uma pergunta diferente para uma pessoa
   * diferente, e somá-los é o que fazia a resposta ser falsa.
   */
  const estadoDoPedido = useMemo(() => new Map(ajustes.map((a) => [a.id, a.estado])), [ajustes]);
  const estadoDaOrigem = (f: FeedbackPdca) => (f.solicitacaoId ? estadoDoPedido.get(f.solicitacaoId) : undefined);
  const viraramMudanca = tratados.filter((f) => estadoDaOrigem(f) === "aplicada");
  const emAndamento = tratados.filter((f) => {
    const e = estadoDaOrigem(f);
    return e === "pendente" || e === "aprovada";
  });
  const recusados = tratados.filter((f) => estadoDaOrigem(f) === "rejeitada" || estadoDaOrigem(f) === "invalida");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", margin: 0 }}>{erro}</p>}

      {/**
       * ── 0. Como o ciclo está andando (SPEC-94 fatia Z) ──
       *
       * **Vem antes das listas, e a ordem é argumento.** As seções abaixo
       * mostram os itens um a um — é o material da decisão. Esta mostra o que só
       * se vê no conjunto: o que está parado, o que se repete, e o que foi
       * coletado e ninguém leu. Uma análise que começa pelo primeiro card da
       * lista é a que o §3 da SPEC-94 descreve como inexistente.
       */}
      <PainelDaAnalise metricas={metricas} />

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

        {/* §276 — o histórico deixou de ser uma lista solta.
            Como lista simples, ele piora com o tempo (cem linhas iguais) e não
            diz o que o ciclo produziu — que é o único motivo de guardá-lo. O
            que fica em cima é o PLACAR: quantos viraram mudança de verdade.
            A lista continua embaixo, recente primeiro e com teto. */}
        {tratados.length > 0 && (
          <div style={{ marginTop: 10 }} data-testid="historico-do-ciclo">
            <div style={placarEstilo}>
              <strong style={{ fontSize: 13 }} data-testid="placar-do-ciclo">
                {viraramMudanca.length} de {tratados.length} viraram mudança aplicada na configuração
              </strong>
              <div style={{ fontSize: 11.5, color: "var(--texto-fraco)", marginTop: 2 }}>
                {descartados.length > 0
                  ? `${descartados.length} foram lidos e descartados — decidir não mudar também é decisão.`
                  : "Nenhum feedback foi descartado até agora."}
                {emAndamento.length > 0 && ` ${emAndamento.length} viraram pedido e ainda esperam decisão ou aplicação.`}
                {/* Recusa contada como recusa. Ela entrava na conta de
                    "virou mudança" e fazia o placar afirmar o contrário do que
                    tinha acontecido. */}
                {recusados.length > 0 && ` ${recusados.length} viraram pedido e foram recusados.`}
              </div>
            </div>

            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: "var(--texto-fraco)", cursor: "pointer" }}>
                ver os {tratados.length} tratado(s)
              </summary>
              {/* Recente primeiro: o que aconteceu ontem explica o item de
                  hoje; o de seis meses atrás é arqueologia. */}
              {[...tratados]
                .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
                .slice(0, verTudoNoHistorico ? undefined : TETO_DO_HISTORICO)
                .map((f) => (
                  <p key={f.id} style={{ ...metaEstilo, marginTop: 6 }} data-testid={`tratado-${f.id}`}>
                    <span style={{ color: f.estado === "virou-ajuste" ? "var(--verde)" : "var(--texto-mudo)" }}>
                      {f.estado === "virou-ajuste" ? `→ virou pedido (${estadoDaOrigem(f) ?? "sem rastro"})` : "· descartado"}
                    </span>{" "}
                    “{f.texto}”
                    {/* SPEC-62 §3 — descartar tinha volta em lugar nenhum: o
                        feedback sumia da tela (para dentro deste histórico) e
                        não voltava a "sem tratar". Descarte silencioso é o que
                        ensina o time a parar de responder. */}
                    {f.estado === "descartado" && (
                      <button
                        onClick={() => void executar(() => apiPdca.reabrirFeedback(f.id))}
                        style={{ ...linkEstilo, marginLeft: 8 }}
                        data-testid={`reabrir-${f.id}`}
                      >
                        reabrir
                      </button>
                    )}
                  </p>
                ))}
              {!verTudoNoHistorico && tratados.length > TETO_DO_HISTORICO && (
                <button
                  onClick={() => setVerTudoNoHistorico(true)}
                  style={{ ...linkEstilo, marginTop: 6 }}
                  data-testid="ver-todo-o-historico"
                >
                  ver os {tratados.length - TETO_DO_HISTORICO} mais antigos
                </button>
              )}
            </details>
          </div>
        )}
      </section>

      {/* ── 2. O estúdio: propor com prévia iterativa ── */}
      {emEstudio && regras && (
        <EstudioDeAjuste
          feedback={emEstudio}
          config={config}
          regras={regras}
          pipeline={pipeline}
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
          <CartaoDeSolicitacao
            key={a.id}
            ajuste={a}
            // SPEC-62 §2 — de onde o pedido veio. O dado sempre existiu
            // (`pdca_feedback.solicitacao_id`) e nunca chegava a quem decide.
            origem={feedbacks.find((f) => f.solicitacaoId === a.id)}
            config={config}
            regras={regras}
            onDecidir={(aprovar, motivo) => void executar(() => apiPdca.decidirAjuste(a.id, aprovar, motivo))}
            onReconsiderar={() => void executar(() => apiPdca.reconsiderarAjuste(a.id))}
            onAplicar={() =>
              void executar(async () => {
                const resultado = await apiPdca.aplicarAjuste(a.id);
                // SPEC-52 — ajuste de ficha muda os campos que a app já tem em
                // memória: sem avisar, a pessoa aplica, volta ao canvas e o
                // campo aprovado não está lá.
                if (a.recurso === "campos-no" || a.recurso === "campos-aresta") onFichaMudou?.();
                return resultado;
              })
            }
            onAbrirArea={onAbrirArea}
          />
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
            <label style={{ fontSize: 12, color: "var(--texto-2)" }}>
              Revisar o volume do produto a cada
              <input
                type="number"
                min={0}
                aria-label="Meses para revisar o volume do produto"
                data-testid="meses-revisar-volume"
                value={cadencia.mesesParaRevisarVolume ?? 6}
                onChange={(e) => setCadencia({ ...cadencia, mesesParaRevisarVolume: Number(e.target.value) })}
                style={{ ...inputEstilo, width: 70, marginLeft: 8 }}
              />
              <span style={{ marginLeft: 6 }}>meses (0 desliga)</span>
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

/** Data curta — pedido de três semanas atrás era visualmente idêntico a um de
 * hoje, e foi por isso que o relato dizia "não gerei nenhuma nova". */
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * SPEC-62 §2 e §3 — o card de quem DECIDE.
 *
 * Ele mostrava `descricao`, `solicitante · recurso · estado` e dois botões.
 * Faltava tudo que uma decisão precisa:
 *
 * - **quando** o pedido foi feito;
 * - **de onde ele veio** — o feedback que o gerou, que o banco já ligava
 *   (`pdca_feedback.solicitacao_id`) e a tela nunca mostrou;
 * - **o efeito**, que o estúdio calcula para quem PROPÕE e sumia para quem
 *   DECIDE, ou seja, exatamente ao contrário de quem precisa dele;
 * - e o **porquê** de uma recusa, que não existia em lugar nenhum.
 *
 * Pedido sem `operacao` (o caminho da SPEC-51, "pedir ajuste" na tela sem
 * permissão) diz que aprovar registra a decisão e a mudança é à mão — o botão
 * parava de prometer o *Act* que `POST /aplicar` recusa com "este pedido é só
 * texto".
 */
function CartaoDeSolicitacao({
  ajuste,
  origem,
  config,
  regras,
  onDecidir,
  onReconsiderar,
  onAplicar,
  onAbrirArea,
}: {
  ajuste: SolicitacaoAjuste;
  origem?: FeedbackPdca;
  config: DiagramaConfig;
  regras: RegrasConfig | null;
  onDecidir: (aprovar: boolean, motivo?: string) => void;
  onReconsiderar: () => void;
  onAplicar: () => void;
  onAbrirArea?: (area: AreaConfig) => void;
}) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");

  /**
   * O componente que serve de exemplo para a prévia: o primeiro cuja tech é a
   * do pedido. Escolha explicável (a régua é por tech) e não arbitrária — e se
   * nenhum componente usa aquela tech, a ausência de prévia é o próprio aviso.
   */
  const efeito = useMemo(() => {
    const op = ajuste.operacao;
    if (!op || !regras || recursoAlvoDaOperacao(op) !== "regras") return null;
    const tech = (op as { tech?: string }).tech;
    if (!tech) return null;
    const tipoNo = Object.keys(config.nodeTypes).find((t) => (config.nodeTypes[t].techs ?? []).includes(tech));
    if (!tipoNo) return null;
    const previa = simularItemComAjuste(config, regras, tipoNo, op);
    return previa ? { previa, rotulo: config.nodeTypes[tipoNo]?.label ?? tipoNo } : null;
  }, [ajuste.operacao, config, regras]);

  const podeReconsiderar = ajuste.estado === "rejeitada" || ajuste.estado === "invalida";

  return (
    <article style={cardEstilo} data-testid={`ajuste-${ajuste.id}`}>
      <p style={{ margin: 0, fontSize: 13 }}>{ajuste.descricao}</p>
      {ajuste.operacao && <p style={{ ...metaEstilo, color: "var(--texto-2)" }}>{descreverOperacao(ajuste.operacao)}</p>}
      <p style={metaEstilo}>
        {ajuste.solicitante} · {quando(ajuste.criadoEm)} · {ajuste.recurso} · <strong>{ajuste.estado}</strong>
        {ajuste.aplicadaPor ? ` · aplicada por ${ajuste.aplicadaPor}` : ""}
      </p>

      {origem ? (
        <p style={{ ...metaEstilo, color: "var(--texto-2)" }} data-testid={`origem-${ajuste.id}`}>
          nasceu do feedback de {origem.email}: “{origem.texto}”
        </p>
      ) : (
        // Não é defeito: a SPEC-51 cria pedido em texto a partir da tela sem
        // permissão. Dizer isso é o que separa "veio pelo ciclo" de "veio
        // direto", que são pedidos de confiança diferente.
        <p style={{ ...metaEstilo, fontStyle: "italic" }} data-testid={`sem-origem-${ajuste.id}`}>
          escrito direto, sem passar pelo ciclo — não há feedback por trás dele
        </p>
      )}

      {ajuste.operacao ? (
        efeito && (efeito.previa.adicionados.length > 0 || efeito.previa.removidos.length > 0) ? (
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11.5, color: "var(--acento-gente-texto)", cursor: "pointer" }} data-testid={`ver-efeito-${ajuste.id}`}>
              ver o efeito num item de {efeito.rotulo}
            </summary>
            <div style={{ marginTop: 6 }} data-testid={`efeito-${ajuste.id}`}>
              {efeito.previa.adicionados.map((l) => (
                <p key={l} style={{ ...diffEstilo, color: "var(--verde)" }}>
                  + {l.replace(/^- /, "")}
                </p>
              ))}
              {efeito.previa.removidos.map((l) => (
                <p key={l} style={{ ...diffEstilo, color: "var(--vermelho)" }}>
                  − {l.replace(/^- /, "")}
                </p>
              ))}
            </div>
          </details>
        ) : null
      ) : (
        <p style={{ ...metaEstilo, color: "var(--amarelo)" }} data-testid={`so-texto-${ajuste.id}`}>
          pedido em texto: aprovar registra a decisão, mas a mudança é à mão na tela de configuração.
        </p>
      )}

      {ajuste.motivoDaDecisao && (
        <p style={{ ...metaEstilo, color: "var(--texto-2)" }} data-testid={`motivo-${ajuste.id}`}>
          {ajuste.estado === "pendente" ? "recusada antes" : "recusada"}
          {ajuste.decididoPor ? ` por ${ajuste.decididoPor}` : ""}: “{ajuste.motivoDaDecisao}”
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {ajuste.estado === "pendente" &&
          (recusando ? (
            <div style={{ width: "100%" }}>
              <label style={labelEstilo}>Por que não? (quem escreveu o pedido lê isto)</label>
              <textarea
                aria-label="Motivo da recusa"
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="ex.: já existe um item equivalente em observabilidade"
                style={{ ...inputEstilo, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setRecusando(false);
                    onDecidir(false, motivo);
                  }}
                  style={botaoEstilo}
                  data-testid={`confirmar-recusa-${ajuste.id}`}
                >
                  Confirmar recusa
                </button>
                <button onClick={() => setRecusando(false)} style={botaoEstilo}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => onDecidir(true)} style={botaoPrimarioEstilo} data-testid={`aprovar-${ajuste.id}`}>
                Aprovar
              </button>
              <button onClick={() => setRecusando(true)} style={botaoEstilo} data-testid={`recusar-${ajuste.id}`}>
                Recusar
              </button>
            </>
          ))}

        {ajuste.estado === "aprovada" && ajuste.operacao && (
          <button
            onClick={onAplicar}
            style={botaoPrimarioEstilo}
            data-testid={`aplicar-${ajuste.id}`}
            title="Aplica a mudança no documento de configuração e fecha o ciclo"
          >
            Aplicar agora
          </button>
        )}
        {ajuste.estado === "aprovada" && !ajuste.operacao && onAbrirArea && AREA_DO_RECURSO[ajuste.recurso] && (
          <button onClick={() => onAbrirArea(AREA_DO_RECURSO[ajuste.recurso])} style={botaoEstilo}>
            Abrir a configuração ↗
          </button>
        )}

        {/* SPEC-62 §3 — o caminho de volta. Recusar devolvia 409 a qualquer
            nova decisão: o pedido morria ali. E `invalida` era pior, porque a
            própria mensagem manda reavaliar sobre o estado atual. */}
        {podeReconsiderar && (
          <button onClick={onReconsiderar} style={botaoEstilo} data-testid={`reconsiderar-${ajuste.id}`}>
            Reconsiderar
          </button>
        )}
      </div>
    </article>
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
  pipeline,
  timeAtivo,
  onCancelar,
  onSalvo,
}: {
  feedback: FeedbackPdca;
  config: DiagramaConfig;
  regras: RegrasConfig;
  pipeline: ConfigPipelineAgentes | null;
  timeAtivo: string;
  onCancelar: () => void;
  onSalvo: () => void;
}) {
  const tipos = Object.entries(config.nodeTypes);
  const [tipoNo, setTipoNo] = useState(tipos[0]?.[0] ?? "");
  const techsDoTipo = config.nodeTypes[tipoNo]?.techs ?? [];
  // SPEC-46 — as quatro seções das regras de refinamento, não só o checklist
  // técnico: "sobrou volumetria" e "faltou repontar massa" são feedback real,
  // e cada seção tem dono próprio (SPEC-28).
  // SPEC-50 — o ajuste alcança dois documentos: as regras de refinamento e a
  // esteira de agentes ("esse papel sobra nos meus itens" é feedback comum).
  // SPEC-52 — e a FICHA: "falta um campo de SLA no serviço" é o pedido mais
  // comum de todos, e era o único que ainda terminava em "edite à mão".
  /**
   * SPEC-63 — `"forma"` não é um `RecursoDeAjuste`: no RBAC ela cai em
   * `regras` como as outras seções. É um alvo DA TELA, porque o formulário é
   * outro — e misturá-la no seletor de seção do checklist faria uma régua de
   * forma virar uma linha de texto por tech, que é o oposto do que ela é.
   */
  const [alvo, setAlvo] = useState<RecursoDeAjuste | "forma">("regras");
  const [regraDeForma, setRegraDeForma] = useState<RequisitoDeTopologia | null>(null);
  const [chaveDaFicha, setChaveDaFicha] = useState("");
  const [fichaAtual, setFichaAtual] = useState<CampoDaFicha[]>([]);
  const [campoKey, setCampoKey] = useState("");
  const [campoKeyEditada, setCampoKeyEditada] = useState(false);
  const [campoLabel, setCampoLabel] = useState("");
  const [campoTipo, setCampoTipo] = useState<TipoDeCampoProposto>("text");
  const [campoObrigatorio, setCampoObrigatorio] = useState(false);
  const [papelId, setPapelId] = useState("");
  const [ligarPapel, setLigarPapel] = useState(false);
  /**
   * SPEC-63 — as seções que este seletor de fato oferece, e não `SecaoDeRegras`
   * inteiro. A régua de FORMA virou uma seção do RBAC, mas ela não é uma lista
   * por tech: tem forma própria, e entra pelo seletor de ALVO logo acima. Deixar
   * o tipo largo fazia `topologia` escorregar para dentro de uma operação de
   * checklist, que não sabe o que fazer com ela.
   */
  const [secao, setSecao] = useState<Exclude<SecaoDeRegras, "topologia">>("checklistTecnico");
  const [acao, setAcao] = useState<"adicionar" | "remover">("adicionar");
  const [validacao, setValidacao] = useState("");
  const [dev, setDev] = useState(true);
  const [hlg, setHlg] = useState(false);
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

  const contextos = contextual ? config.nodeTypes[tipoNo]?.contextos ?? [] : [];
  const ehFicha = alvo === "campos-no" || alvo === "campos-aresta";
  const ehForma = alvo === "forma";

  /** As chaves de componente (ou de conexão) que a ficha aceita — sai do
   * diagrama configurado, não de uma lista escrita à mão aqui. */
  const chavesDaFicha: [string, string][] = useMemo(
    () =>
      alvo === "campos-aresta"
        ? Object.entries(config.edgeTypes ?? {}).map(([k, v]) => [k, v.label ?? k])
        : Object.entries(config.nodeTypes).map(([k, v]) => [k, v.label ?? k]),
    [alvo, config]
  );

  // Trocar de alvo (ou de componente) recarrega a ficha REAL — a prévia
  // compara contra o que está valendo, não contra uma lista imaginada.
  useEffect(() => {
    if (!ehFicha) return;
    const chave = chaveDaFicha || chavesDaFicha[0]?.[0] || "";
    if (!chaveDaFicha && chave) setChaveDaFicha(chave);
    if (!chave) return;
    const carregar =
      alvo === "campos-aresta"
        ? apiCamposAresta.listar(timeAtivo).then((cs) => cs.filter((c) => c.tipoAresta === chave))
        : apiCamposNo.listar(timeAtivo).then((cs) => cs.filter((c) => c.tipoNo === chave));
    carregar
      .then((cs) =>
        setFichaAtual(
          cs.map((c) => ({
            key: c.key,
            label: c.label,
            tipoCampo: c.type as CampoDaFicha["tipoCampo"],
            obrigatorio: c.required,
            ...(c.ajuda ? { ajuda: c.ajuda } : {}),
          }))
        )
      )
      .catch(() => setFichaAtual([]));
  }, [alvo, chaveDaFicha, chavesDaFicha, timeAtivo, ehFicha]);

  const operacao: OperacaoDeAjuste | null = useMemo(() => {
    // SPEC-63 — a régua de FORMA vem montada pelo construtor compartilhado.
    if (ehForma) return regraDeForma ? { tipo: "adicionar-topologia", requisito: regraDeForma } : null;
    if (ehFicha) {
      if (!chaveDaFicha) return null;
      if (acao === "remover") {
        if (!campoKey) return null;
        const label = fichaAtual.find((c) => c.key === campoKey)?.label;
        return alvo === "campos-aresta"
          ? { tipo: "remover-campo-aresta", tipoAresta: chaveDaFicha, key: campoKey, label }
          : { tipo: "remover-campo-no", tipoNo: chaveDaFicha, key: campoKey, label };
      }
      if (!campoKey.trim() || !campoLabel.trim()) return null;
      const campo = {
        key: campoKey.trim(),
        label: campoLabel.trim(),
        tipoCampo: campoTipo,
        obrigatorio: campoObrigatorio,
      };
      return alvo === "campos-aresta"
        ? { tipo: "adicionar-campo-aresta", tipoAresta: chaveDaFicha, campo }
        : { tipo: "adicionar-campo-no", tipoNo: chaveDaFicha, campo };
    }
    if (alvo === "pipeline-agentes") {
      if (!papelId) return null;
      const nome = (pipeline?.papeis ?? []).find((p) => p.id === papelId)?.nome;
      return ligarPapel
        ? { tipo: "ativar-papel", papelId, papelNome: nome }
        : { tipo: "desativar-papel", papelId, papelNome: nome };
    }
    if (!tech) return null;
    // Volumetria é liga/desliga por tech — não tem texto por item.
    if (secao === "volumetria") {
      return acao === "adicionar" ? { tipo: "definir-volumetria", tech, contextos } : { tipo: "remover-volumetria", tech };
    }
    if (!texto.trim()) return null;
    if (secao === "testes") {
      return acao === "adicionar"
        ? { tipo: "adicionar-teste", tech, contextos, tipoTeste: texto.trim(), validacao: validacao.trim() || "a definir", dev, hlg }
        : { tipo: "remover-teste", tech, tipoTeste: texto.trim() };
    }
    return acao === "adicionar"
      ? { tipo: "adicionar-checklist", secao, tech, contextos, texto: texto.trim() }
      : { tipo: "remover-checklist", secao, tech, texto: texto.trim() };
  }, [
    alvo,
    ehFicha,
    ehForma,
    regraDeForma,
    chaveDaFicha,
    campoKey,
    campoLabel,
    campoTipo,
    campoObrigatorio,
    fichaAtual,
    papelId,
    ligarPapel,
    pipeline,
    secao,
    acao,
    tech,
    texto,
    validacao,
    dev,
    hlg,
    contextos,
  ]);

  /**
   * SPEC-52 — os campos que vêm do COMPONENTE (o `spec` do tipo, no diagrama
   * configurado). Eles não moram na tabela de campos e a operação não os
   * alcança, mas aparecem na ficha de quem preenche — e uma prévia que os
   * omitisse mentiria por omissão sobre o que a pessoa vai ver.
   */
  const camposDoComponente: CampoDaFicha[] = useMemo(() => {
    if (!ehFicha || !chaveDaFicha) return [];
    const spec =
      alvo === "campos-aresta" ? config.edgeTypes?.[chaveDaFicha]?.spec ?? [] : config.nodeTypes[chaveDaFicha]?.spec ?? [];
    return spec.map((c) => ({
      key: c.key,
      label: c.label,
      tipoCampo: c.type as CampoDaFicha["tipoCampo"],
      obrigatorio: c.required ?? false,
    }));
  }, [ehFicha, alvo, chaveDaFicha, config]);

  /** SPEC-52 — a prévia da ficha: o que a pessoa VAI ter que preencher. Para
   * campos, simular o texto do item seria responder outra pergunta.
   *
   * A ficha DEPOIS sai da mesma função pura que o servidor usa pra decidir o
   * que gravar — o que se vê aqui é o que vai acontecer, não uma segunda
   * implementação que combina por enquanto. */
  const fichaDepois = useMemo(
    () => (ehFicha && operacao ? aplicarOperacaoNosCampos(fichaAtual, operacao) : fichaAtual),
    [ehFicha, operacao, fichaAtual]
  );
  const previaDaFicha = useMemo(
    () => (ehFicha && operacao ? diferencaDeCampos(fichaAtual, fichaDepois) : null),
    [ehFicha, operacao, fichaAtual, fichaDepois]
  );

  const previa = useMemo(
    () => (tipoNo && alvo === "regras" ? simularItemComAjuste(config, regras, tipoNo, operacao) : null),
    [config, regras, tipoNo, operacao, alvo]
  );

  /** SPEC-50 — a prévia do PIPELINE é outra pergunta: o que deixa (ou passa) a
   * ter dono no item. Desligar um papel não muda o texto do item de exemplo —
   * muda quem o escreve, e é isso que a pessoa precisa ver antes de decidir. */
  const papelEmFoco = (pipeline?.papeis ?? []).find((p) => p.id === papelId);

  const itensDaTech: string[] =
    secao === "testes"
      ? (regras.porTech[tech]?.testes ?? []).map((t) => t.tipo)
      : secao === "volumetria"
        ? []
        : (regras.porTech[tech]?.[secao] ?? []).map((c) => c.texto);

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
        recurso: recursoAlvoDaOperacao(operacao),
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

          <label style={labelEstilo}>O que ajustar</label>
          <select
            aria-label="Documento a ajustar"
            value={alvo}
            onChange={(e) => {
              setAlvo(e.target.value as RecursoDeAjuste | "forma");
              // A chave da ficha é de outro vocabulário (componente ou
              // conexão): manter a anterior ao trocar de alvo produziria um
              // pedido sobre algo que não existe do outro lado.
              setChaveDaFicha("");
              setCampoKey("");
            }}
            style={inputEstilo}
          >
            <option value="regras">Regras de refinamento (o conteúdo dos itens)</option>
            <option value="pipeline-agentes">Esteira de agentes (quem escreve o quê)</option>
            <option value="campos-no">Ficha do componente (o que se preenche em cada nó)</option>
            <option value="campos-aresta">Ficha da conexão (o que se preenche em cada seta)</option>
            <option value="forma">Forma do desenho (o que a arquitetura precisa respeitar)</option>
          </select>

          {ehForma ? (
            <ConstrutorDeForma config={config} onMudou={setRegraDeForma} />
          ) : ehFicha ? (
            <>
              <label style={labelEstilo}>{alvo === "campos-aresta" ? "Tipo de conexão" : "Componente"}</label>
              <select
                aria-label="Componente da ficha"
                value={chaveDaFicha}
                onChange={(e) => {
                  setChaveDaFicha(e.target.value);
                  setCampoKey("");
                }}
                style={inputEstilo}
              >
                {chavesDaFicha.map(([chave, rotulo]) => (
                  <option key={chave} value={chave}>
                    {rotulo}
                  </option>
                ))}
              </select>

              <label style={labelEstilo}>O que fazer</label>
              <select
                aria-label="Tipo de ajuste na ficha"
                value={acao}
                onChange={(e) => {
                  setAcao(e.target.value as "adicionar" | "remover");
                  setCampoKey("");
                }}
                style={inputEstilo}
              >
                <option value="adicionar">Adicionar um campo</option>
                <option value="remover">Remover um campo</option>
              </select>

              {acao === "remover" ? (
                <>
                  <label style={labelEstilo}>Campo a remover</label>
                  <select
                    aria-label="Campo a remover"
                    value={campoKey}
                    onChange={(e) => setCampoKey(e.target.value)}
                    style={inputEstilo}
                  >
                    <option value="">— escolha o campo —</option>
                    {fichaAtual.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {fichaAtual.length === 0 && (
                    <p style={{ ...metaEstilo, color: "var(--texto-mudo)" }} data-testid="sem-campo-removivel">
                      Esta ficha só tem os campos que vêm do próprio componente, e esses não saem por aqui — eles são
                      parte do que o tipo é. Dá pra propor campos novos, ou levar a conversa para quem edita o diagrama.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label style={labelEstilo}>Nome do campo (o rótulo que aparece na ficha)</label>
                  <input
                    aria-label="Rótulo do campo"
                    value={campoLabel}
                    onChange={(e) => {
                      setCampoLabel(e.target.value);
                      // A chave técnica nasce do rótulo enquanto ninguém a
                      // editar: obrigar a inventá-la seria pedir à pessoa
                      // errada, no momento errado.
                      if (!campoKeyEditada) setCampoKey(chaveTecnicaDe(e.target.value));
                    }}
                    placeholder="ex.: SLA acordado"
                    style={inputEstilo}
                  />

                  <label style={labelEstilo}>Chave técnica</label>
                  <input
                    aria-label="Chave do campo"
                    value={campoKey}
                    onChange={(e) => {
                      setCampoKeyEditada(true);
                      setCampoKey(e.target.value);
                    }}
                    placeholder="ex.: sla_acordado"
                    style={inputEstilo}
                  />

                  <label style={labelEstilo}>Tipo</label>
                  <select
                    aria-label="Tipo do campo"
                    value={campoTipo}
                    onChange={(e) => setCampoTipo(e.target.value as TipoDeCampoProposto)}
                    style={inputEstilo}
                  >
                    <option value="text">Texto curto</option>
                    <option value="textarea">Texto longo</option>
                    <option value="number">Número</option>
                    <option value="boolean">Sim/não</option>
                    <option value="select">Escolha de uma lista</option>
                  </select>

                  <label style={{ ...labelEstilo, display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={campoObrigatorio}
                      onChange={(e) => setCampoObrigatorio(e.target.checked)}
                    />
                    obrigatório (o item fica pendente enquanto estiver vazio)
                  </label>
                </>
              )}
            </>
          ) : alvo === "pipeline-agentes" ? (
            <>
              <label style={labelEstilo}>Papel</label>
              <select
                aria-label="Papel da esteira"
                value={papelId}
                onChange={(e) => {
                  setPapelId(e.target.value);
                  const p = (pipeline?.papeis ?? []).find((x) => x.id === e.target.value);
                  // Sugere o oposto do estado atual: quem abre o ajuste quer
                  // MUDAR o papel, não confirmar o que já está.
                  setLigarPapel(p ? !p.ativo : true);
                }}
                style={inputEstilo}
              >
                <option value="">— escolha o papel —</option>
                {(pipeline?.papeis ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} {p.ativo ? "(ligado)" : "(desligado)"}
                  </option>
                ))}
              </select>

              <label style={labelEstilo}>O que fazer</label>
              <select
                aria-label="Ligar ou desligar"
                value={ligarPapel ? "ligar" : "desligar"}
                onChange={(e) => setLigarPapel(e.target.value === "ligar")}
                style={inputEstilo}
              >
                <option value="desligar">Desligar da esteira</option>
                <option value="ligar">Ligar na esteira</option>
              </select>
            </>
          ) : (
          <>
          <label style={labelEstilo}>Onde (a seção das regras de refinamento)</label>
          <select
            aria-label="Seção das regras"
            value={secao}
            onChange={(e) => {
              setSecao(e.target.value as Exclude<SecaoDeRegras, "topologia">);
              setTexto("");
            }}
            style={inputEstilo}
          >
            <option value="checklistTecnico">Checklist técnico</option>
            <option value="checklistProcesso">Checklist de processo</option>
            <option value="testes">Ciclos de teste</option>
            <option value="volumetria">Requisitos de volumetria</option>
          </select>

          <label style={labelEstilo}>O que fazer</label>
          <select
            aria-label="Tipo de ajuste"
            value={acao}
            onChange={(e) => setAcao(e.target.value as "adicionar" | "remover")}
            style={inputEstilo}
          >
            <option value="adicionar">{secao === "volumetria" ? "Passar a exigir" : "Adicionar item"}</option>
            <option value="remover">{secao === "volumetria" ? "Deixar de exigir" : "Remover item"}</option>
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

          {secao !== "volumetria" && (
            <label style={labelEstilo}>{secao === "testes" ? "Tipo do ciclo de teste" : "Texto do item"}</label>
          )}
          {secao === "volumetria" ? null : acao === "remover" && itensDaTech.length > 0 ? (
            <select aria-label={secao === "testes" ? "Tipo do ciclo de teste" : "Texto do item"} value={texto} onChange={(e) => setTexto(e.target.value)} style={inputEstilo}>
              <option value="">— escolha o item a remover —</option>
              {itensDaTech.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <>
              <textarea
                aria-label={secao === "testes" ? "Tipo do ciclo de teste" : "Texto do item"}
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

          {secao === "testes" && acao === "adicionar" && (
            <>
              <label style={labelEstilo}>O que valida</label>
              <input
                aria-label="Validação do teste"
                value={validacao}
                onChange={(e) => setValidacao(e.target.value)}
                placeholder="ex.: contrato do publisher continua compatível"
                style={inputEstilo}
              />
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <label style={{ fontSize: 11.5, color: "var(--texto-2)" }}>
                  <input type="checkbox" checked={dev} onChange={(e) => setDev(e.target.checked)} /> roda em dev
                </label>
                <label style={{ fontSize: 11.5, color: "var(--texto-2)" }}>
                  <input type="checkbox" checked={hlg} onChange={(e) => setHlg(e.target.checked)} /> roda em hlg
                </label>
              </div>
            </>
          )}

          {/* §276 — a caixa só aparece quando há contexto para restringir.
              Relato do usuário: "por qual motivo aparece nenhum?". Porque é
              literal — "Serviço" é o único dos 16 tipos que não declara
              contexto —, e uma caixa marcada que restringe a uma lista VAZIA
              não restringe nada (lista vazia = vale sempre, pela régua do
              motor). Opção que não pode fazer nada não é opção: é ruído com
              cara de decisão. */}
          {acao === "adicionar" &&
            ((config.nodeTypes[tipoNo]?.contextos ?? []).length > 0 ? (
              <label style={{ ...labelEstilo, display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <input type="checkbox" checked={contextual} onChange={(e) => setContextual(e.target.checked)} />
                vale só nos contextos deste componente ({(config.nodeTypes[tipoNo]?.contextos ?? []).join(", ")})
              </label>
            ) : (
              <p style={{ ...labelEstilo, marginTop: 10 }} data-testid="sem-contexto-para-restringir">
                Este componente não tem contexto declarado, então o item vale para <strong>todo item</strong> da
                tecnologia escolhida. Contextos se declaram no tipo de componente, na configuração do diagrama.
              </p>
            ))}

          </>
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
          {ehForma ? (
            /**
             * SPEC-63 §7 pedia a prévia como "quantos elementos do desenho ATUAL
             * a regra acusaria". Ela não entra assim, e o motivo é honesto: esta
             * tela é de CONFIGURAÇÃO e não tem demanda aberta — não há desenho
             * para contar. Inventar um número sobre um desenho de exemplo seria
             * pior que não dar número, porque a pessoa decidiria sobre uma
             * medida que não é dela.
             *
             * O que dá para afirmar sem mentir é a frase: o que a régua vai
             * conferir, e onde ela vai aparecer.
             */
            <div data-testid="previa-da-forma">
              <h3 style={tituloEstilo}>O que esta régua vai conferir</h3>
              {regraDeForma ? (
                <>
                  <p style={proseEstilo}>{descreverForma(regraDeForma.checagem, config)}</p>
                  <p style={{ ...proseEstilo, color: "var(--texto-mudo)" }}>
                    Ela passa a valer sobre <strong>todas as demandas</strong> deste ambiente, e aparece no placar da
                    mesa (⚖) e no reconhecimento antes de derivar. Quem tiver o caso legítimo aceita a violação com
                    motivo, e ela sai do que cobra sem sair do histórico.
                  </p>
                  <p style={{ ...proseEstilo, color: "var(--texto-mudo)" }}>
                    Quantos pontos ela acusa depende do desenho de cada demanda — esta tela não tem uma aberta, e um
                    número sobre um desenho de exemplo não seria o seu.
                  </p>
                </>
              ) : (
                <p style={vazioEstilo}>Escreva a régua para ver o que ela vai conferir.</p>
              )}
            </div>
          ) : ehFicha ? (
            <div data-testid="previa-da-ficha">
              <h3 style={tituloEstilo}>
                Como fica a ficha de {chavesDaFicha.find(([k]) => k === chaveDaFicha)?.[1] ?? chaveDaFicha}
              </h3>
              {!previaDaFicha || (previaDaFicha.adicionados.length === 0 && previaDaFicha.removidos.length === 0) ? (
                <p style={vazioEstilo} data-testid="previa-ficha-sem-efeito">
                  {operacao ? "Nada muda — esse campo já está exatamente assim." : "Preencha o campo para ver a ficha mudar aqui."}
                </p>
              ) : (
                <p style={{ ...proseEstilo, color: "var(--texto-mudo)" }}>
                  Vale também para o que já está desenhado: a ficha é lida na hora de preencher, não copiada no desenho.
                </p>
              )}
              <ul style={{ fontSize: 12.5, color: "var(--texto-2)", paddingLeft: 18, lineHeight: 1.7 }}>
                {camposDoComponente.map((c) => (
                  <li key={`padrao-${c.key}`} style={{ color: "var(--texto-fraco)" }} data-testid="ficha-campo-do-componente">
                    {c.label}
                    {c.obrigatorio ? " (obrigatório)" : ""} <span style={{ fontSize: 11 }}>— do componente</span>
                  </li>
                ))}
                {fichaDepois.map((c) => {
                  const entrando = previaDaFicha?.adicionados.some((a) => a.key === c.key) ?? false;
                  return (
                    <li
                      key={c.key}
                      style={entrando ? { color: "var(--verde)" } : undefined}
                      data-testid={entrando ? "ficha-campo-novo" : "ficha-campo"}
                    >
                      {entrando ? "+ " : ""}
                      {c.label}
                      {c.obrigatorio ? " (obrigatório)" : ""}
                    </li>
                  );
                })}
                {(previaDaFicha?.removidos ?? []).map((c) => (
                  <li
                    key={c.key}
                    style={{ color: "var(--vermelho)", textDecoration: "line-through" }}
                    data-testid="ficha-campo-removido"
                  >
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : alvo === "pipeline-agentes" ? (
            <div data-testid="previa-do-pipeline">
              <h3 style={tituloEstilo}>O que muda na esteira</h3>
              {!papelEmFoco ? (
                <p style={vazioEstilo}>Escolha o papel para ver o efeito.</p>
              ) : (
                <>
                  <p style={proseEstilo}>
                    {ligarPapel ? (
                      <>
                        <strong>{papelEmFoco.nome}</strong> passa a escrever nos itens novos — a seção dele deixa de
                        chegar vazia na revisão.
                      </>
                    ) : (
                      <>
                        <strong>{papelEmFoco.nome}</strong> para de escrever: a seção dele fica sem dono e os campos
                        chegam em branco, pra quem quiser preencher à mão.
                      </>
                    )}
                  </p>
                  <p style={{ ...proseEstilo, color: "var(--texto-mudo)" }}>
                    Vale da PRÓXIMA geração em diante — o que já foi escrito continua onde está.
                  </p>
                  <ul style={{ fontSize: 12.5, color: "var(--texto-2)", paddingLeft: 18, lineHeight: 1.6 }}>
                    {(pipeline?.papeis ?? []).map((p) => (
                      <li key={p.id}>
                        {p.nome}: {p.id === papelId ? (ligarPapel ? "ligado (mudança)" : "desligado (mudança)") : p.ativo ? "ligado" : "desligado"}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
          <>
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
                    <p key={l} style={{ ...diffEstilo, color: "var(--verde)" }} data-testid="previa-adicionado">
                      + {l.replace(/^- /, "")}
                    </p>
                  ))}
                  {previa.removidos.map((l) => (
                    <p key={l} style={{ ...diffEstilo, color: "var(--vermelho)" }} data-testid="previa-removido">
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
          </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * SPEC-52 — a chave técnica derivada do rótulo. Quem propõe um campo pensa em
 * "SLA acordado", não em `sla_acordado`; a chave continua editável para quem
 * se importa, mas ninguém precisa inventá-la para seguir em frente.
 *
 * O servidor só aceita letras, números, hífen e underscore — o que sai daqui
 * já nasce dentro dessa régua, em vez de virar 400 depois de a pessoa
 * escrever o pedido inteiro.
 */
export function chaveTecnicaDe(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
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
