import { useCallback, useEffect, useMemo, useState } from "react";
import {
  gerarDiagramaHtml,
  gerarEspecificacaoEntrega,
  montarFichaItem,
  type Atividade,
  type Diagrama,
  type DiagramaConfig,
  type FichaEspecificacaoNo,
  type FichaItem,
  type FichaPlaceholder,
  type RegrasConfig,
  type ValorSpec,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import { apiIa, type EspecificacaoTemplate, type PapelPipeline, type PlaceholderPedidoItemIa } from "../api/client";
import { baixarArquivoTexto } from "../persistence/baixarArquivo";
import { DiagramaCompacto } from "./DiagramaCompacto";
import { PAPEIS_PIPELINE, ROTULO_PAPEL, useEsteiraDeAgentes, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

export interface ReviewScreenProps {
  resultado: ResultadoDependenciasDe<Atividade>;
  diagrama: Diagrama;
  config: DiagramaConfig;
  regras?: RegrasConfig;
  /** Efetivo pro time ativo — template do time se existir, senão o global (SPEC-14 §6). */
  especificacaoTemplate: EspecificacaoTemplate;
  /** `quebra.demandInfo` — de onde vem a demanda. Além da seção "Contexto" do
   * documento (SPEC-14 §4), desde a Fase 1b (SPEC-23) também alimenta o
   * prompt real de `/ia/sugerir`. */
  demandInfo?: string;
  /** `quebra.anexosContexto` — anexos de texto do contexto do épico (Fase 1b,
   * SPEC-23), mesmo tratamento de `demandInfo`. */
  anexosContexto?: { nome: string; conteudo: string }[];
  /** `quebra.time` — toda atividade já carrega esse time em `timesEnvolvidos` por padrão
   * (achado do usuário: só aparecer no item excepcional lia como dado quebrado); usado aqui
   * só pra filtrar o que já é óbvio e destacar de verdade quando é outro time. */
  time?: string;
  /** `quebra.respostasItens` — respostas já salvas aos placeholders de
   * refinamento (Fase 1, SPEC-23), pra saber o que já está confirmado e não
   * precisa mais aparecer pendente na ficha. */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;
  onFechar: () => void;
  onSelecionarNo: (id: string) => void;
}

function descreverDependencia(a: Atividade): string {
  return a.dependencias.map((d) => (d.alvoChave ? `${d.type}→${d.alvoChave}` : d.type)).join(", ");
}

/** Só conta como "resolvido" resposta manual ou sugestão já confirmada —
 * mesma régua do engine (`gerarRefinamento.ts`), usada aqui pra decidir
 * status do item (rascunho/revisar/refinado) e o que mostrar como pendente. */
function respostaConfirmada(resp: ValorSpec | undefined): boolean {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/** Agrupa os placeholders da ficha pelo papel da esteira responsável
 * (SPEC-24) — PO escreve história/critérios, Arquiteto o contrato,
 * Especialista técnico o checklist/volumetria (mecanismo já existente,
 * reencaixado como papel), QA as regras de teste/cenário Gherkin. Fonte
 * única usada pra montar a fila da esteira, os pips por item e as seções da
 * aba Refinamento — nunca uma segunda lista hardcoded de "quais campos
 * existem". */
function placeholdersPorPapel(ficha: FichaItem): Record<PapelPipeline, FichaPlaceholder[]> {
  return {
    po: [ficha.historiaUsuario, ficha.criteriosAceiteContextual],
    arquiteto: [ficha.contrato.noVinculado, ficha.contrato.request, ficha.contrato.response, ficha.contrato.erros, ficha.contrato.dependencias],
    especialista: [...ficha.checklistTecnico, ...ficha.volumetria],
    qa: [ficha.regrasTeste, ficha.cenarioFeature],
  };
}

type StatusItem = "rascunho" | "revisar" | "refinado";

/** Status derivado só da UI (não persistido) — nenhum placeholder aplicável
 * já é "refinado" trivialmente; com pendência mas alguma resposta (mesmo que
 * sugerida e ainda não confirmada) já é "revisar", não fica preso em
 * "rascunho" pra sempre. SPEC-24: agora conta os 9 placeholders (os 4 papéis
 * da esteira), não só história/critérios/checklist — existe orquestração
 * real (Fase B/C) capaz de preenchê-los, então contá-los como pendência não
 * é mais uma regressão de UX sem ferramenta pra resolver. */
function statusDoItem(ficha: FichaItem): StatusItem {
  const placeholders = Object.values(placeholdersPorPapel(ficha)).flat();
  if (placeholders.length === 0) return "refinado";
  const pendentes = placeholders.filter((p) => !respostaConfirmada(p.resposta));
  if (pendentes.length === 0) return "refinado";
  const algumaResposta = placeholders.some((p) => p.resposta !== undefined);
  return algumaResposta ? "revisar" : "rascunho";
}

const CORES_STATUS: Record<StatusItem, string> = {
  rascunho: "#5C6A7E",
  revisar: "#e8b339",
  refinado: "#3ecf8e",
};

const ROTULO_STATUS: Record<StatusItem, string> = {
  rascunho: "rascunho",
  revisar: "revisar",
  refinado: "refinado",
};

/** Contexto compacto do(s) nó(s) de origem da atividade, mandado ao LLM junto
 * com o requisito — sem isso a sugestão seria genérica demais pra ser útil
 * (Fase 1, SPEC-23). */
function contextoDoPlaceholder(ficha: FichaEspecificacaoNo[]): string {
  return ficha
    .map((no) => {
      const campos = no.camposEscalares
        .filter((c) => c.valor !== undefined && c.valor !== "")
        .map((c) => `${c.key}: ${String(c.valor)}`)
        .join(", ");
      return `${no.label} (${no.tipoLabel}, ${no.status})${campos ? ` — ${campos}` : ""}`;
    })
    .join(" | ");
}

/** `demandInfo` + conteúdo dos anexos (Fase 1b, SPEC-23), concatenados num
 * único texto pra mandar como contexto real ao `/ia/sugerir` — antes disso
 * `demandInfo` só entrava na seção "Contexto" do documento exportado, nunca
 * alimentava a geração de verdade. */
function contextoEpicoCompleto(demandInfo?: string, anexos?: { nome: string; conteudo: string }[]): string | undefined {
  const partes = [
    demandInfo?.trim() ? demandInfo.trim() : undefined,
    ...(anexos ?? []).map((a) => (a.conteudo.trim() ? `[Anexo: ${a.nome}]\n${a.conteudo.trim()}` : undefined)),
  ].filter((p): p is string => !!p);
  return partes.length > 0 ? partes.join("\n\n") : undefined;
}

type Aba = "especificacao" | "contrato" | "refinamento" | "testes";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "especificacao", rotulo: "Especificação" },
  { id: "contrato", rotulo: "Contrato" },
  { id: "refinamento", rotulo: "Refinamento" },
  { id: "testes", rotulo: "Testes" },
];

/**
 * Revisão e especificação de solução são uma coisa só (achado do usuário: o
 * fluxo anterior — tabela resumida + botão separado "Especificação de
 * entrega" com preview em texto puro + "copiar" — não fazia sentido; ninguém
 * precisa copiar nada à mão). A única saída é o documento completo
 * (`gerarEspecificacaoEntrega`), pensado pra ser o input de outro agente —
 * nunca duas fontes de verdade pro mesmo conteúdo.
 *
 * Layout reestilizado (Fase 1d-i, SPEC-23) seguindo referência de protótipo
 * fornecida pelo usuário: tema escuro, lista de itens à esquerda, ficha à
 * direita com abas (Especificação/Contrato/Refinamento/Testes), montada a
 * partir do dado estruturado do engine (`montarFichaItem`, Fase 1a) em vez
 * de um bloco de markdown único.
 *
 * Esteira de agentes (SPEC-24): assim que a tela monta, se o modelo local
 * estiver instalado, dispara sozinha a esteira real (`useEsteiraDeAgentes`)
 * — 4 papéis (PO/Arquiteto/Especialista técnico/QA) em sequência fixa, cada
 * um processando TODOS os itens antes do próximo começar (não item por item,
 * como a Fase 1d-ii processava). A ficha do item em andamento segue
 * automaticamente ("Seguindo a geração"), quebrando o auto-follow só quando o
 * usuário clica manualmente noutro item. Diferença deliberada do protótipo de
 * referência (que anima itens "pousando" um a um): os itens já existem TODOS
 * de verdade assim que `derivar()` roda (síncrono, determinístico) — não tem
 * processo real de "descobrir itens" pra narrar, só o preenchimento do
 * refinamento via IA. `DiagramaCompacto` fica sempre visível no topo
 * (substitui o antigo atrás-de-alternância da 1d-i, que não tinha processo
 * real pra sincronizar); o diagrama completo (`gerarDiagramaHtml`, SPEC-21,
 * com seletor de sequência e painel lateral próprios) continua
 * acessível via "🔍 Ver diagrama completo".
 */
export function ReviewScreen({
  resultado,
  diagrama,
  config,
  regras,
  especificacaoTemplate,
  demandInfo,
  anexosContexto,
  time,
  respostasItens,
  onResponderItem,
  onFechar,
  onSelecionarNo,
}: ReviewScreenProps) {
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("especificacao");
  const [seguindoGeracao, setSeguindoGeracao] = useState(true);

  const diagramaHtml = useMemo(
    () => gerarDiagramaHtml(resultado.atividades, diagrama, config),
    [resultado.atividades, diagrama, config]
  );

  const fichas = useMemo(
    () =>
      new Map(
        resultado.atividades.map((a, i) => [
          a.chave,
          montarFichaItem(i + 1, a, diagrama, config, regras, respostasItens?.[a.chave]),
        ])
      ),
    [resultado.atividades, diagrama, config, regras, respostasItens]
  );

  function baixarDiagrama() {
    baixarArquivoTexto(diagramaHtml, "diagrama-da-solucao.html", "text/html");
  }

  const contextoEpico = contextoEpicoCompleto(demandInfo, anexosContexto);

  // SPEC-24 Fase C: fila de trabalho da esteira — um item por ATIVIDADE,
  // com os placeholders já separados por papel (`ItemFilaEsteira`).
  // `apenasPendentes` false é usado por "Gerar de novo" (regenera tudo,
  // inclusive já confirmado).
  const montarFilaEsteira = useCallback(
    (apenasPendentes: boolean): ItemFilaEsteira[] => {
      const filaNova: ItemFilaEsteira[] = [];
      for (const a of resultado.atividades) {
        const ficha = fichas.get(a.chave);
        if (!ficha) continue;
        const contextoNo = contextoDoPlaceholder(ficha.especificacaoTecnica);
        const porPapel = placeholdersPorPapel(ficha);
        const placeholdersPedido = Object.fromEntries(
          PAPEIS_PIPELINE.map((papel) => {
            const relevantes = apenasPendentes ? porPapel[papel].filter((p) => !respostaConfirmada(p.resposta)) : porPapel[papel];
            return [papel, relevantes.map((p) => ({ chave: p.chave, tech: p.tech, rotulo: p.rotulo }))];
          })
        ) as Record<PapelPipeline, PlaceholderPedidoItemIa[]>;
        const temTrabalho = PAPEIS_PIPELINE.some((papel) => placeholdersPedido[papel].length > 0);
        if (!temTrabalho) continue;
        filaNova.push({ atividadeChave: a.chave, atividadeRotulo: a.rotulo, contextoNo, placeholdersPorPapel: placeholdersPedido });
      }
      return filaNova;
    },
    [resultado.atividades, fichas]
  );

  const esteira = useEsteiraDeAgentes({
    contextoEpico,
    onResponderItem: (atividadeChave, chavePlaceholder, resposta) => onResponderItem?.(atividadeChave, chavePlaceholder, resposta),
  });

  useEffect(() => {
    // Só na montagem: dispara sozinha quando o modelo já está instalado E há
    // placeholder pendente — sem modelo, cai no comportamento manual de
    // sempre (botão "✨ Sugerir" continua funcionando igual). Reagir a
    // fichas/resultado mudando de novo a cada resposta reiniciaria a
    // esteira sem sentido — "Gerar de novo" já cobre o caso de refazer.
    let cancelado = false;
    apiIa
      .status()
      .then((status) => {
        if (cancelado || !status.pronto) return;
        const filaInicial = montarFilaEsteira(true);
        if (filaInicial.length > 0) esteira.iniciar(filaInicial);
      })
      .catch(() => {
        // Servidor sem essa rota ainda, ou indisponível — sem geração automática.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!seguindoGeracao || !esteira.atual) return;
    setSelecionada(esteira.atual.atividadeChave);
    setAba("refinamento");
  }, [esteira.atual, seguindoGeracao]);

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

  function selecionar(chave: string) {
    setSeguindoGeracao(false);
    setSelecionada(chave);
    setAba("especificacao");
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

  const contagens = regras
    ? resultado.atividades.reduce(
        (acc, a) => {
          acc[statusDoItem(fichas.get(a.chave)!)]++;
          return acc;
        },
        { rascunho: 0, revisar: 0, refinado: 0 } as Record<StatusItem, number>
      )
    : null;

  const atividadeSelecionada = selecionada ? resultado.atividades.find((a) => a.chave === selecionada) : undefined;
  const fichaSelecionada = selecionada ? fichas.get(selecionada) : undefined;

  return (
    <div style={telaEstilo}>
      <header style={headerEstilo}>
        <strong style={{ fontSize: 14 }}>Revisão da quebra</strong>
        {esteira.rodando && esteira.atual && esteira.papelAtual ? (
          <div style={faseBarraEstilo} role="status" aria-live="polite">
            <div style={handoffEstilo}>
              {PAPEIS_PIPELINE.map((papel, i) => (
                <span key={papel} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span style={{ color: "#5C6A7E" }}>→</span>}
                  <span
                    data-testid={`handoff-${papel}`}
                    aria-current={papel === esteira.papelAtual ? "step" : undefined}
                    style={papel === esteira.papelAtual ? handoffPapelAtivoEstilo : handoffPapelEstilo}
                  >
                    {ROTULO_PAPEL[papel]}
                  </span>
                </span>
              ))}
            </div>
            <span style={{ fontSize: 12 }}>
              {`${esteira.pausado ? "Pausado — " : ""}item ${esteira.progresso.feito + 1} de ${esteira.progresso.total} · ${esteira.atual.atividadeRotulo}`}
            </span>
            <div style={progressoTrilhoEstilo}>
              <div
                style={{
                  ...progressoBarraEstilo,
                  width: `${(esteira.progresso.feito / Math.max(1, esteira.progresso.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--dim, #8D9BB0)" }}>{resultado.atividades.length} itens</span>
        )}
        {contagens && (
          <div role="status" aria-live="polite" style={contadoresEstilo}>
            {(Object.keys(contagens) as StatusItem[]).map((s) => (
              <span key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <i style={{ width: 6, height: 6, borderRadius: "50%", background: CORES_STATUS[s], display: "inline-block" }} />
                {contagens[s]} {ROTULO_STATUS[s]}
              </span>
            ))}
          </div>
        )}
        {esteira.rodando ? (
          <button onClick={esteira.pausado ? esteira.continuar : esteira.pausar} style={botaoEstilo}>
            {esteira.pausado ? "▶ Continuar" : "⏸ Pausar"}
          </button>
        ) : (
          <button
            onClick={() => {
              setSeguindoGeracao(true);
              esteira.iniciar(montarFilaEsteira(false));
            }}
            style={botaoEstilo}
          >
            🔄 Gerar de novo
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setMostrarDiagrama((v) => !v)} style={botaoEstilo}>
          {mostrarDiagrama ? "Voltar à lista" : "🔍 Ver diagrama completo"}
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
        <iframe title="Diagrama animado da solução" srcDoc={diagramaHtml} style={{ flex: 1, border: "none" }} />
      ) : (
        <>
          <DiagramaCompacto
            diagrama={diagrama}
            config={config}
            noAtivoId={esteira.atual ? chaveParaNodeId[esteira.atual.atividadeChave] : undefined}
          />
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <section data-tour="review-table" style={listaEstilo}>
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

            {resultado.atividades.map((a) => {
              const ficha = fichas.get(a.chave)!;
              const status = statusDoItem(ficha);
              const cruzaOutroTime = outrosTimes(a).length > 0;
              const sel = a.chave === selecionada;
              const porPapel = placeholdersPorPapel(ficha);
              return (
                <button
                  key={a.chave}
                  data-testid={`item-${a.chave}`}
                  onClick={() => selecionar(a.chave)}
                  aria-pressed={sel}
                  style={{ ...itemRailEstilo, ...(sel ? itemRailSelEstilo : {}), ...(cruzaOutroTime ? { borderColor: "#e8b339" } : {}) }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: CORES_STATUS[status], flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.rotulo}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--dim, #8D9BB0)", marginTop: 3 }}>
                    {a.tipo} · {a.tamanho}
                    {a.dependencias.length > 0 && ` · depende de ${descreverDependencia(a)}`}
                  </div>
                  {a.timesEnvolvidos?.length ? (
                    <div style={{ fontSize: 11, color: cruzaOutroTime ? "#e8b339" : "var(--dim, #8D9BB0)", marginTop: 2 }}>
                      {a.timesEnvolvidos.join(", ")}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }} title="Por onde este item já passou na esteira">
                    {PAPEIS_PIPELINE.map((papel) => {
                      const placeholders = porPapel[papel];
                      const passou = placeholders.length > 0 && placeholders.every((p) => p.resposta !== undefined);
                      return (
                        <i
                          key={papel}
                          data-testid={`pip-${a.chave}-${papel}`}
                          title={ROTULO_PAPEL[papel]}
                          style={{ ...pipEstilo, ...(passou ? pipOnEstilo : {}) }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </section>

          <section style={fichaWrapEstilo}>
            {!atividadeSelecionada || !fichaSelecionada ? (
              <div style={fichaVaziaEstilo}>Selecione um item na lista pra ver a ficha técnica.</div>
            ) : (
              <>
                <div style={fichaHeaderEstilo}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button style={{ ...linkEstilo, fontSize: 16, fontWeight: 600 }} onClick={() => irParaChave(atividadeSelecionada.chave)} disabled={!chaveParaNodeId[atividadeSelecionada.chave]}>
                      {atividadeSelecionada.rotulo}
                    </button>
                    {seguindoGeracao && esteira.rodando && (
                      <span style={seguindoBadgeEstilo}>● Seguindo a geração</span>
                    )}
                  </div>
                  <nav style={{ display: "flex", gap: 4, marginTop: 10 }}>
                    {ABAS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setAba(t.id)}
                        style={{ ...tabBotaoEstilo, ...(aba === t.id ? tabBotaoOnEstilo : {}) }}
                      >
                        {t.rotulo}
                      </button>
                    ))}
                  </nav>
                </div>
                <div style={fichaBodyEstilo}>
                  {aba === "especificacao" && <AbaEspecificacao ficha={fichaSelecionada} />}
                  {aba === "contrato" && <AbaContrato ficha={fichaSelecionada} />}
                  {aba === "refinamento" && (
                    <AbaRefinamento
                      ficha={fichaSelecionada}
                      contextoEpico={contextoEpico}
                      onResponder={(chave, resposta) => onResponderItem?.(atividadeSelecionada.chave, chave, resposta)}
                      papelEmGeracao={
                        esteira.rodando && esteira.atual?.atividadeChave === atividadeSelecionada.chave ? esteira.papelAtual ?? undefined : undefined
                      }
                    />
                  )}
                  {aba === "testes" && <AbaTestes ficha={fichaSelecionada} />}
                </div>
              </>
            )}
          </section>
          </div>
        </>
      )}
    </div>
  );
}

function AbaEspecificacao({ ficha }: { ficha: FichaItem }) {
  return (
    <div>
      <div style={metaGridEstilo}>
        <div>
          <span style={lblEstilo}>Tipo</span>
          <p style={valEstilo}>{ficha.tipo}</p>
        </div>
        <div>
          <span style={lblEstilo}>Tamanho</span>
          <p style={valEstilo}>{ficha.tamanho}</p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span style={lblEstilo}>Techs</span>
          <p style={valEstilo}>{ficha.techs.join(", ") || "—"}</p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span style={lblEstilo}>Contextos</span>
          <p style={valEstilo}>{ficha.contextos.join(", ") || "—"}</p>
        </div>
      </div>
      <div style={secaoEstilo}>
        <span style={lblEstilo}>Descrição</span>
        <p style={proseEstilo}>{ficha.descricao}</p>
      </div>
      <div style={secaoEstilo}>
        <span style={lblEstilo}>Critérios de aceite (Gherkin)</span>
        <pre style={preEstilo}>{ficha.criteriosAceiteMarkdown}</pre>
      </div>
    </div>
  );
}

function AbaContrato({ ficha }: { ficha: FichaItem }) {
  if (ficha.especificacaoTecnica.length === 0) {
    return <p style={proseEstilo}>Nenhum nó de origem associado a esta atividade.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {ficha.especificacaoTecnica.map((no) => (
        <div key={no.noId}>
          <span style={lblEstilo}>
            {no.label} ({no.tipoLabel}, {no.status})
          </span>
          {!no.tipoConhecido ? (
            <p style={proseEstilo}>Tipo "{no.tipoLabel}" não encontrado na config carregada.</p>
          ) : no.camposEscalares.length === 0 && no.camposLista.length === 0 ? (
            <p style={proseEstilo}>Nenhum campo aplicável.</p>
          ) : (
            <>
              {no.camposEscalares.length > 0 && (
                <table style={tabelaEstilo}>
                  <thead>
                    <tr>
                      <th style={thEstilo}>Campo</th>
                      <th style={thEstilo}>Valor</th>
                      <th style={thEstilo}>Proveniência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {no.camposEscalares.map((c) => (
                      <tr key={c.key}>
                        <td style={tdEstilo}>{c.label}</td>
                        <td style={tdEstilo}>
                          {c.na !== undefined
                            ? `N/A — ${c.na || "(sem motivo)"}`
                            : c.origem === undefined
                              ? "(não preenchido)"
                              : formatarValorCampo(c.valor)}
                        </td>
                        <td style={tdEstilo}>{c.na !== undefined || c.origem === undefined ? "—" : c.origem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {no.camposLista.map((c) => (
                <div key={c.key} style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: 12 }}>{c.label}:</strong>
                  {c.na !== undefined ? (
                    <p style={proseEstilo}>N/A — {c.na || "(sem motivo)"}</p>
                  ) : c.itens.length === 0 ? (
                    <p style={proseEstilo}>(nenhum item)</p>
                  ) : (
                    <ol style={{ margin: "6px 0", paddingLeft: 20, fontSize: 12.5, color: "var(--mist, #C5CEDA)" }}>
                      {c.itens.map((item, i) => (
                        <li key={i}>
                          {c.itemSpec.map((s) => `${s.label}: ${formatarValorCampo(item[s.key])}`).join(" · ")}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function formatarValorCampo(valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "(não preenchido)";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

interface AbaRefinamentoProps {
  ficha: FichaItem;
  /** Contexto do épico/demanda (Fase 1b, SPEC-23) — mandado junto no `/ia/sugerir` real. */
  contextoEpico?: string;
  onResponder?: (chavePlaceholder: string, resposta: ValorSpec) => void;
  /** SPEC-24 — qual papel da esteira está gerando ESTE item agora (se
   * algum). Só o grupo daquele papel mostra "gerando…" nos campos ainda sem
   * resposta; os demais grupos (já passados ou ainda não chegou a vez) ficam
   * no estado normal de rascunho/confirmação — diferente de 1d-ii (uma
   * chamada só, "gerando a ficha inteira" valia pra tudo de uma vez), agora
   * cada papel tem seu próprio momento. */
  papelEmGeracao?: PapelPipeline;
}

/**
 * Requisitos de refinamento (fluxo 3, Fase 1, SPEC-23), agrupados por papel
 * da esteira (SPEC-24): PO (história/critérios), Arquiteto (contrato),
 * Especialista técnico (checklist/volumetria, filtrado por tech/contexto —
 * mecanismo já existente), QA (regras de teste/cenário Gherkin). Cada
 * placeholder respondido à mão ou via "✨ Sugerir" (modelo local). Sugestão
 * fica `origem: "sugerido", confirmado: false` até o usuário clicar
 * "Confirmar" — só aí passa a valer pro documento final (mesma disciplina
 * "nada sugerido conta até confirmado" já usada pro semáforo de prontidão
 * dos nós).
 */
function AbaRefinamento({ ficha, contextoEpico, onResponder, papelEmGeracao }: AbaRefinamentoProps) {
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const grupos = placeholdersPorPapel(ficha);

  async function sugerir(p: FichaPlaceholder) {
    setErro(null);
    setCarregando(p.chave);
    setRascunhos((r) => ({ ...r, [p.chave]: "" }));
    try {
      // Fase 1c (SPEC-23): onPedaco atualiza o campo a cada pedaço que chega
      // — o texto aparece sendo escrito em tempo real, não "Gerando..." e
      // depois um pop-in do texto inteiro.
      const { valor } = await apiIa.sugerir(
        {
          tech: p.tech,
          rotulo: p.rotulo,
          contextoNo: contextoDoPlaceholder(ficha.especificacaoTecnica),
          contextoEpico,
        },
        (pedaco) => setRascunhos((r) => ({ ...r, [p.chave]: (r[p.chave] ?? "") + pedaco }))
      );
      setRascunhos((r) => ({ ...r, [p.chave]: valor }));
      onResponder?.(p.chave, { valor, origem: "sugerido", confirmado: false });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a sugestão.");
    } finally {
      setCarregando(null);
    }
  }

  function confirmar(chave: string) {
    const valor = rascunhos[chave];
    if (typeof valor !== "string" || valor.trim() === "") return;
    onResponder?.(chave, { valor, origem: "manual" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {erro && <div style={{ fontSize: 11, color: "#f87171" }}>{erro}</div>}
      {PAPEIS_PIPELINE.map((papel) => {
        const placeholders = grupos[papel];
        if (placeholders.length === 0) return null;
        return (
          <div key={papel}>
            <span style={lblEstilo}>{ROTULO_PAPEL[papel]}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {placeholders.map((p) => {
                const confirmada = respostaConfirmada(p.resposta);
                const aguardandoGeracao = papelEmGeracao === papel && p.resposta === undefined;
                const rascunho = rascunhos[p.chave] ?? (typeof p.resposta?.valor === "string" ? p.resposta.valor : "");
                return (
                  <div key={p.chave} data-testid={`placeholder-${p.chave}`} style={{ ...reqEstilo, ...(confirmada ? reqPreenchidoEstilo : {}) }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ ...marcaEstilo, ...(confirmada ? marcaOnEstilo : {}) }}>{confirmada ? "✓" : ""}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{p.rotulo}</span>
                      <span style={origemEstilo}>{p.tech || "Geral"}</span>
                    </div>
                    {confirmada ? (
                      <pre style={{ ...preEstilo, marginTop: 8 }}>{String(p.resposta?.valor)}</pre>
                    ) : aguardandoGeracao ? (
                      <div style={{ marginTop: 8 }}>
                        <pre style={preEstilo}>…</pre>
                        <span style={{ fontSize: 10.5, color: "#38bdf8" }}>✨ {ROTULO_PAPEL[papel]} gerando…</span>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          value={rascunho}
                          onChange={(e) => setRascunhos((r) => ({ ...r, [p.chave]: e.target.value }))}
                          placeholder="Resposta manual, ou clique em Sugerir"
                          rows={3}
                          style={textareaEstilo}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => sugerir(p)} disabled={carregando === p.chave} style={botaoEstilo}>
                            {carregando === p.chave ? "Gerando..." : "✨ Sugerir"}
                          </button>
                          <button onClick={() => confirmar(p.chave)} disabled={!rascunho.trim()} style={botaoEstilo}>
                            Confirmar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AbaTestes({ ficha }: { ficha: FichaItem }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <span style={lblEstilo}>Ciclos de teste</span>
        {ficha.ciclosTesteMarkdown ? (
          <pre style={preEstilo}>{ficha.ciclosTesteMarkdown}</pre>
        ) : (
          <p style={proseEstilo}>Sem regra de teste pra esta combinação.</p>
        )}
      </div>
      <div>
        <span style={lblEstilo}>Checklist de processo</span>
        {ficha.checklistProcessoMarkdown ? (
          <pre style={preEstilo}>{ficha.checklistProcessoMarkdown}</pre>
        ) : (
          <p style={proseEstilo}>Nenhum item de processo pra esta combinação.</p>
        )}
      </div>
    </div>
  );
}

const telaEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#0C111A",
  color: "#E8EEF8",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, sans-serif",
};

const headerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "12px 16px",
  borderBottom: "1px solid #1B2533",
  background: "#0C111A",
};

const contadoresEstilo: React.CSSProperties = {
  display: "flex",
  gap: 10,
  background: "#101823",
  border: "1px solid #1B2533",
  borderRadius: 8,
  padding: "4px 10px",
};

const faseBarraEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 220,
};

const progressoTrilhoEstilo: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  background: "#1B2533",
  overflow: "hidden",
};

const progressoBarraEstilo: React.CSSProperties = {
  height: "100%",
  background: "#38bdf8",
  transition: "width 200ms ease",
};

const seguindoBadgeEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "#38bdf8",
  fontWeight: 600,
};

// SPEC-24 — handoff visual entre os 4 papéis da esteira (PO→Arquiteto→
// Especialista técnico→QA): o papel atual fica destacado, os demais em
// tom apagado, uma seta entre cada um — comunica visualmente que a esteira
// avança papel a papel, não item a item (achado real do usuário: sem isso,
// "não tem os mesmos feedback visuais do protótipo").
const handoffEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10.5,
};

const handoffPapelEstilo: React.CSSProperties = {
  color: "#5C6A7E",
};

const handoffPapelAtivoEstilo: React.CSSProperties = {
  color: "#38bdf8",
  fontWeight: 700,
};

const pipEstilo: React.CSSProperties = {
  width: 14,
  height: 4,
  borderRadius: 2,
  background: "#1B2533",
  display: "inline-block",
};

const pipOnEstilo: React.CSSProperties = {
  background: "#3ecf8e",
};

const listaEstilo: React.CSSProperties = {
  width: "30%",
  minWidth: 260,
  maxWidth: 380,
  borderRight: "1px solid #1B2533",
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const itemRailEstilo: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #1B2533",
  background: "#101823",
  color: "#E8EEF8",
  cursor: "pointer",
  fontFamily: "inherit",
};

const itemRailSelEstilo: React.CSSProperties = {
  borderColor: "#38bdf8",
  background: "#15202D",
};

const fichaWrapEstilo: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const fichaVaziaEstilo: React.CSSProperties = {
  margin: "auto",
  color: "#5C6A7E",
  fontSize: 13,
  maxWidth: 300,
  textAlign: "center",
};

const fichaHeaderEstilo: React.CSSProperties = {
  padding: "16px 24px 0",
  borderBottom: "1px solid #1B2533",
  background: "#0C111A",
};

const fichaBodyEstilo: React.CSSProperties = {
  padding: "18px 24px 40px",
  overflowY: "auto",
  flex: 1,
};

const tabBotaoEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "#8D9BB0",
  padding: "9px 4px",
  marginRight: 16,
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

const tabBotaoOnEstilo: React.CSSProperties = {
  color: "#E8EEF8",
  borderBottom: "2px solid #38bdf8",
};

const metaGridEstilo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 1,
  background: "#1B2533",
  border: "1px solid #1B2533",
  borderRadius: 10,
  overflow: "hidden",
  marginBottom: 20,
};

const lblEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#5C6A7E",
  marginBottom: 4,
};

const valEstilo: React.CSSProperties = {
  margin: 0,
  fontFamily: "ui-monospace, monospace",
  fontSize: 12.5,
  padding: "9px 12px",
  background: "#0C111A",
};

const secaoEstilo: React.CSSProperties = {
  marginBottom: 20,
};

const proseEstilo: React.CSSProperties = {
  margin: 0,
  color: "#8D9BB0",
  fontSize: 13,
  lineHeight: 1.6,
};

const preEstilo: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 12,
  margin: 0,
  color: "#C5CEDA",
  padding: "10px 12px",
  background: "#0C111A",
  border: "1px solid #1B2533",
  borderRadius: 8,
};

const tabelaEstilo: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
};

const thEstilo: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #1B2533",
  padding: "6px 8px",
  color: "#5C6A7E",
  fontWeight: 600,
};

const tdEstilo: React.CSSProperties = {
  borderBottom: "1px solid #1B2533",
  padding: "6px 8px",
  color: "#C5CEDA",
};

const reqEstilo: React.CSSProperties = {
  border: "1px solid #1B2533",
  borderRadius: 10,
  background: "#101823",
  padding: "10px 12px",
};

const reqPreenchidoEstilo: React.CSSProperties = {
  borderColor: "#3ecf8e55",
};

const marcaEstilo: React.CSSProperties = {
  width: 15,
  height: 15,
  borderRadius: 4,
  border: "1px solid #1B2533",
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 10,
  color: "#3ecf8e",
  marginTop: 2,
};

const marcaOnEstilo: React.CSSProperties = {
  background: "#3ecf8e30",
  borderColor: "#3ecf8e70",
};

const origemEstilo: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#5C6A7E",
  border: "1px solid #1B2533",
  borderRadius: 4,
  padding: "1px 5px",
  flexShrink: 0,
};

// Achado real (SPEC-24): história de usuário/critérios de aceite são texto
// longo — um `<input>` de uma linha só truncava o conteúdo, ilegível. `<pre>`
// (texto confirmado) já usa `whiteSpace: pre-wrap`; o textarea replica isso
// no estado de edição.
const textareaEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #263344",
  background: "#0C111A",
  color: "#E8EEF8",
  fontFamily: "inherit",
  resize: "vertical",
  boxSizing: "border-box",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #263344",
  background: "#101823",
  color: "#E8EEF8",
  cursor: "pointer",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#38bdf8",
  color: "#0A0D14",
  border: "1px solid #38bdf8",
  fontWeight: 600,
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#38bdf8",
  padding: 0,
  fontSize: "inherit",
  textDecoration: "underline",
};

const avisoEstilo: React.CSSProperties = {
  background: "#3a1d1d",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 6,
  color: "#fca5a5",
};
