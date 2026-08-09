import { useCallback, useEffect, useMemo, useState } from "react";
import {
  carimbarInsumos,
  gerarDiagramaHtml,
  gerarEspecificacaoEntrega,
  insumosDivergentes,
  insumosDoItem,
  montarFichaItem,
  resumirAchados,
  revisarQuebra,
  type Atividade,
  type Achado,
  type InsumoDivergente,
  type Diagrama,
  type DiagramaConfig,
  type FichaEspecificacaoNo,
  type FichaItem,
  type FichaPlaceholder,
  type RegrasConfig,
  type ValorSpec,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import {
  PAPEIS_PADRAO,
  apiIa,
  apiPipelineAgentes,
  type EspecificacaoTemplate,
  type GrupoFicha,
  type PapelConfigurado,
  type PapelPipeline,
  type PlaceholderPedidoItemIa,
} from "../api/client";
import { baixarArquivoTexto } from "../persistence/baixarArquivo";
import { DiagramaCompacto } from "./DiagramaCompacto";
import { EsteiraAgentes } from "./EsteiraAgentes";
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
function placeholdersPorPapel(ficha: FichaItem): Record<GrupoFicha, FichaPlaceholder[]> {
  return {
    po: [ficha.historiaUsuario, ficha.criteriosAceiteContextual],
    arquiteto: [ficha.contrato.noVinculado, ficha.contrato.request, ficha.contrato.response, ficha.contrato.erros, ficha.contrato.dependencias],
    especialista: [...ficha.checklistTecnico, ...ficha.volumetria],
    qa: [ficha.regrasTeste, ficha.cenarioFeature],
  };
}

const GRUPOS_FICHA: GrupoFicha[] = ["po", "arquiteto", "especialista", "qa"];

/** SPEC-24 Fase F — qual papel CONFIGURADO leva a seção `grupo` de um item:
 * o primeiro papel ativo da lista com esse grupo cujos contextos casem com
 * as techs/contextos da atividade (lista vazia casa com tudo). É assim que
 * um agente contextual "rouba" os itens do contexto dele — basta estar
 * ANTES do papel geral na ordem configurada. Casamento parcial e sem case,
 * a MESMA semântica do `contextoBate()` do engine (regras.json): configurar
 * "Backend-mensagens" casa com "Backend-mensagens rabbitmq" e "... kafka". */
function papelDoGrupo(
  papeisAtivos: PapelConfigurado[],
  grupo: GrupoFicha,
  atividade: { techs: string[]; contextos: string[] }
): PapelConfigurado | undefined {
  return papeisAtivos.find(
    (p) =>
      p.grupo === grupo &&
      (p.contextos.length === 0 ||
        p.contextos.some((c) =>
          [...atividade.contextos, ...atividade.techs].some((sel) => sel.toLowerCase().includes(c.toLowerCase()))
        ))
  );
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
  // SPEC-24 Fase D: clique num nó do DiagramaCompacto filtra a lista de
  // itens por aquele nó; segundo clique no mesmo nó limpa (toggle).
  const [filtroNoId, setFiltroNoId] = useState<string | null>(null);
  // SPEC-24 Fase E: altura do diagrama controlada pela divisória arrastável
  // ("usuário pode clicar e arrastar pra cima e pra baixo, assim ganha mais
  // espaço pra ver melhor o conteúdo"). `null` = default proporcional (30vh).
  const [alturaDiagrama, setAlturaDiagrama] = useState<number | null>(null);

  function iniciarArrastoDivisoria(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const alvo = e.currentTarget;
    try {
      alvo.setPointerCapture(e.pointerId);
    } catch {
      // jsdom não implementa pointer capture — os listeners abaixo já bastam.
    }
    const inicioY = e.clientY ?? 0;
    const alturaInicial = (alvo.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().height ?? 200;
    const aoMover = (ev: PointerEvent) => {
      const y = ev.clientY ?? 0;
      setAlturaDiagrama(Math.min(Math.max(alturaInicial + (y - inicioY), 120), window.innerHeight * 0.7));
    };
    const aoSoltar = () => alvo.removeEventListener("pointermove", aoMover);
    alvo.addEventListener("pointermove", aoMover);
    alvo.addEventListener("pointerup", aoSoltar, { once: true });
    alvo.addEventListener("pointercancel", aoSoltar, { once: true });
  }
  // SPEC-24 Fase E: default seguro (pausa pra confirmação manual) até o
  // valor real carregar — nunca aplica direto sem saber a config de verdade.
  const [confirmacaoObrigatoria, setConfirmacaoObrigatoria] = useState(true);
  // SPEC-24 Fase F: papéis da esteira vindos da config (ordem/ativo/
  // contextos/prompt) — default de fábrica até (e se) a config carregar.
  const [papeisConfig, setPapeisConfig] = useState<PapelConfigurado[]>(PAPEIS_PADRAO);

  const papeisAtivos = useMemo(() => papeisConfig.filter((p) => p.ativo), [papeisConfig]);

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

  // SPEC-26 Bloco 1 — procedência. Toda resposta gravada leva junto o carimbo
  // dos insumos que a produziram; comparar esse carimbo com o estado atual do
  // desenho é o que permite dizer, depois, quais respostas ficaram para trás
  // ("mudou especificação na história X, aí preciso atualizar tudo
  // manualmente"). O carimbo é aplicado AQUI, e não no `useQuebra`, porque é
  // aqui que existem as atividades derivadas — o hook guarda estado, não
  // deriva.
  const carimboDoItem = useCallback(
    (atividadeChave: string): Record<string, string> | undefined => {
      const atividade = resultado.atividades.find((a) => a.chave === atividadeChave);
      if (!atividade) return undefined;
      return carimbarInsumos(insumosDoItem(atividade, diagrama, contextoEpico));
    },
    [resultado.atividades, diagrama, contextoEpico]
  );

  const responderComProcedencia = useCallback(
    (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => {
      onResponderItem?.(atividadeChave, chavePlaceholder, {
        ...resposta,
        baseadoEm: carimboDoItem(atividadeChave),
      });
    },
    [onResponderItem, carimboDoItem]
  );

  /** Quais insumos mudaram desde que cada resposta do item foi escrita. Vazio
   * = alinhado com o desenho (ou resposta sem carimbo, de antes deste bloco —
   * ver `insumosDivergentes`). */
  const desatualizadosPorItem = useMemo(() => {
    const mapa = new Map<string, Map<string, InsumoDivergente[]>>();
    for (const atividade of resultado.atividades) {
      const insumos = insumosDoItem(atividade, diagrama, contextoEpico);
      const porChave = new Map<string, InsumoDivergente[]>();
      for (const [chave, resposta] of Object.entries(respostasItens?.[atividade.chave] ?? {})) {
        const divergentes = insumosDivergentes(resposta.baseadoEm, insumos);
        if (divergentes.length > 0) porChave.set(chave, divergentes);
      }
      if (porChave.size > 0) mapa.set(atividade.chave, porChave);
    }
    return mapa;
  }, [resultado.atividades, diagrama, contextoEpico, respostasItens]);

  const totalDesatualizados = useMemo(
    () => [...desatualizadosPorItem.values()].reduce((soma, m) => soma + m.size, 0),
    [desatualizadosPorItem]
  );

  // SPEC-26 Bloco 4a — o revisor determinístico. Roda a cada render (é conta
  // pura sobre dados já em memória) e NUNCA escreve nada: aponta.
  const achados = useMemo(
    () => revisarQuebra(resultado.atividades, diagrama, config, regras, respostasItens),
    [resultado.atividades, diagrama, config, regras, respostasItens]
  );
  const resumo = useMemo(() => resumirAchados(achados), [achados]);
  const achadosPorItem = useMemo(() => {
    const mapa = new Map<string, Achado[]>();
    for (const a of achados) mapa.set(a.atividadeChave, [...(mapa.get(a.atividadeChave) ?? []), a]);
    return mapa;
  }, [achados]);
  const [mostrarAchados, setMostrarAchados] = useState(false);

  // SPEC-24 Fase C: fila de trabalho da esteira — um item por ATIVIDADE,
  // com os placeholders já separados por papel (`ItemFilaEsteira`).
  // `apenasPendentes` false é usado por "Gerar de novo" (regenera tudo,
  // inclusive já confirmado).
  const montarFilaEsteira = useCallback(
    (apenasPendentes: boolean, papeis?: PapelConfigurado[]): ItemFilaEsteira[] => {
      // O auto-start passa os papéis RECÉM-resolvidos da config — o estado
      // ainda não re-renderizou nesse instante (mesma corrida do
      // confirmacaoObrigatoria, Fase E). Os demais chamadores usam o estado.
      const lista = papeis ?? papeisAtivos;
      const filaNova: ItemFilaEsteira[] = [];
      for (const a of resultado.atividades) {
        const ficha = fichas.get(a.chave);
        if (!ficha) continue;
        const contextoNo = contextoDoPlaceholder(ficha.especificacaoTecnica);
        const porGrupo = placeholdersPorPapel(ficha);
        // Fase F: cada seção da ficha vai pro papel CONFIGURADO que a leva
        // neste item (contextos) — chaveado pelo id do papel, não pelo grupo.
        const placeholdersPedido: Record<string, PlaceholderPedidoItemIa[]> = Object.fromEntries(
          lista.map((p) => [p.id, [] as PlaceholderPedidoItemIa[]])
        );
        for (const grupo of GRUPOS_FICHA) {
          const dono = papelDoGrupo(lista, grupo, a);
          if (!dono) continue;
          const relevantes = apenasPendentes ? porGrupo[grupo].filter((p) => !respostaConfirmada(p.resposta)) : porGrupo[grupo];
          placeholdersPedido[dono.id].push(...relevantes.map((p) => ({ chave: p.chave, tech: p.tech, rotulo: p.rotulo })));
        }
        const temTrabalho = lista.some((p) => placeholdersPedido[p.id].length > 0);
        if (!temTrabalho) continue;
        // Encadeamento: tudo que JÁ está respondido e NÃO vai ser regenerado
        // nesta corrida entra como insumo dos papéis (o Arquiteto lê a
        // história que o PO escreveu — "a ideia de pipeline é justamente
        // essa"). As respostas geradas durante a corrida o hook acumula.
        const chavesNaFila = new Set(Object.values(placeholdersPedido).flat().map((p) => p.chave));
        const respostasExistentes = GRUPOS_FICHA.flatMap((grupo) => porGrupo[grupo])
          .filter((p) => typeof p.resposta?.valor === "string" && p.resposta.valor !== "" && !chavesNaFila.has(p.chave))
          .map((p) => ({ rotulo: p.rotulo, valor: String(p.resposta?.valor) }));
        filaNova.push({
          atividadeChave: a.chave,
          atividadeRotulo: a.rotulo,
          contextoNo,
          placeholdersPorPapel: placeholdersPedido,
          respostasExistentes,
        });
      }
      return filaNova;
    },
    [resultado.atividades, fichas, papeisAtivos]
  );

  const esteira = useEsteiraDeAgentes({
    contextoEpico,
    papeis: papeisAtivos,
    confirmacaoObrigatoria,
    // SPEC-26 Bloco 1: o que a esteira escreve também nasce carimbado.
    onResponderItem: responderComProcedencia,
  });

  // "O usuário poderá revisar, alterar e aí roda de novo o ciclo a partir
  // daquela alteração" (registrado desde a Fase E, possível agora que os
  // papéis são encadeados): regenera, SÓ pra este item, os papéis que vêm
  // DEPOIS do dono da seção alterada — a alteração (e todo o resto já
  // respondido fora do que será regenerado) entra como insumo via
  // `respostasExistentes`.
  const reRodarSeguintes = useCallback(
    (atividadeChave: string, grupoAlterado: GrupoFicha) => {
      const a = resultado.atividades.find((x) => x.chave === atividadeChave);
      const ficha = fichas.get(atividadeChave);
      if (!a || !ficha) return;
      const dono = papelDoGrupo(papeisAtivos, grupoAlterado, a);
      if (!dono) return;
      const seguintes = papeisAtivos.slice(papeisAtivos.findIndex((p) => p.id === dono.id) + 1);
      if (seguintes.length === 0) return;
      const porGrupo = placeholdersPorPapel(ficha);
      const placeholdersPedido: Record<string, PlaceholderPedidoItemIa[]> = Object.fromEntries(
        papeisAtivos.map((p) => [p.id, [] as PlaceholderPedidoItemIa[]])
      );
      for (const grupo of GRUPOS_FICHA) {
        const donoGrupo = papelDoGrupo(papeisAtivos, grupo, a);
        if (!donoGrupo || !seguintes.some((p) => p.id === donoGrupo.id)) continue;
        // Regenera TUDO dos papéis seguintes (mesmo confirmado) — a montante mudou.
        placeholdersPedido[donoGrupo.id].push(...porGrupo[grupo].map((p) => ({ chave: p.chave, tech: p.tech, rotulo: p.rotulo })));
      }
      const chavesNaFila = new Set(Object.values(placeholdersPedido).flat().map((p) => p.chave));
      if (chavesNaFila.size === 0) return;
      const respostasExistentes = GRUPOS_FICHA.flatMap((g) => porGrupo[g])
        .filter((p) => typeof p.resposta?.valor === "string" && p.resposta.valor !== "" && !chavesNaFila.has(p.chave))
        .map((p) => ({ rotulo: p.rotulo, valor: String(p.resposta?.valor) }));
      esteira.iniciar([
        {
          atividadeChave,
          atividadeRotulo: a.rotulo,
          contextoNo: contextoDoPlaceholder(ficha.especificacaoTecnica),
          placeholdersPorPapel: placeholdersPedido,
          respostasExistentes,
        },
      ]);
    },
    [resultado.atividades, fichas, papeisAtivos, esteira]
  );

  useEffect(() => {
    // Só na montagem: dispara sozinha quando o modelo já está instalado E há
    // placeholder pendente — sem modelo, cai no comportamento manual de
    // sempre (botão "✨ Sugerir" continua funcionando igual). Reagir a
    // fichas/resultado mudando de novo a cada resposta reiniciaria a
    // esteira sem sentido — "Gerar de novo" já cobre o caso de refazer.
    //
    // Fase F: espera o status E a config de papéis JUNTOS antes de arrancar
    // — sem isso a fila era montada com os 4 papéis de fábrica numa corrida
    // com o fetch da config (papel desativado rodava mesmo assim se a config
    // resolvesse depois do status). A fila e a esteira recebem os papéis
    // recém-resolvidos explicitamente: o estado ainda não re-renderizou aqui.
    let cancelado = false;
    void Promise.allSettled([apiIa.status(), apiPipelineAgentes.obter()]).then(([status, cfg]) => {
      if (cancelado) return;
      let papeisResolvidos = PAPEIS_PADRAO;
      if (cfg.status === "fulfilled") {
        setConfirmacaoObrigatoria(cfg.value.confirmacaoObrigatoria);
        if (cfg.value.papeis?.length) {
          setPapeisConfig(cfg.value.papeis);
          papeisResolvidos = cfg.value.papeis;
        }
      }
      // Config indisponível mantém os defaults seguros (confirmação
      // obrigatória, pipeline de fábrica); status indisponível/não pronto =
      // sem geração automática.
      if (status.status !== "fulfilled" || !status.value.pronto) return;
      const ativos = papeisResolvidos.filter((p) => p.ativo);
      const filaInicial = montarFilaEsteira(true, ativos);
      if (filaInicial.length > 0) esteira.iniciar(filaInicial, ativos);
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

  // Badge de contagem por card do diagrama (o `.cnt` do protótipo): quantos
  // itens cada nó originou — derivado da mesma origem que o filtro usa.
  const contagemPorNo: Record<string, number> = {};
  for (const nodeId of Object.values(chaveParaNodeId)) {
    contagemPorNo[nodeId] = (contagemPorNo[nodeId] ?? 0) + 1;
  }

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

  function clicarNoDiagrama(nodeId: string) {
    setFiltroNoId((atual) => (atual === nodeId ? null : nodeId));
  }

  const atividadesFiltradas = filtroNoId
    ? resultado.atividades.filter((a) => chaveParaNodeId[a.chave] === filtroNoId)
    : resultado.atividades;
  const noFiltrado = filtroNoId ? diagrama.nodes.find((n) => n.id === filtroNoId) : undefined;

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

  // Altura do brilho da timeline: fração de itens que já saíram do rascunho
  // (ou seja, algum papel já escreveu algo neles). Derivado do mesmo
  // `statusDoItem` da lista — sem estado paralelo de "progresso visual" que
  // pudesse divergir do que os cards mostram.
  const tocados = atividadesFiltradas.filter((a) => statusDoItem(fichas.get(a.chave)!) !== "rascunho").length;
  const pctTimeline = atividadesFiltradas.length > 0 ? (tocados / atividadesFiltradas.length) * 100 : 0;

  return (
    <div style={telaEstilo}>
      <header style={headerEstilo}>
        <strong style={{ fontSize: 14 }}>Revisão da quebra</strong>
        {esteira.rodando ? (
          <div style={progressoTrilhoEstilo}>
            <div
              style={{
                ...progressoBarraEstilo,
                width: `${(esteira.progresso.feito / Math.max(1, esteira.progresso.total)) * 100}%`,
              }}
            />
          </div>
        ) : (
          <span data-testid="contagem-itens" style={{ fontSize: 12, color: "var(--dim, #8D9BB0)" }}>
            {filtroNoId ? (
              <>
                {atividadesFiltradas.length} de {resultado.atividades.length} itens · {noFiltrado?.label ?? filtroNoId}{" "}
                <button onClick={() => setFiltroNoId(null)} style={linkEstilo}>
                  × limpar filtro
                </button>
              </>
            ) : (
              `${resultado.atividades.length} itens`
            )}
          </span>
        )}
        {contagens && (
          <div data-testid="contadores" role="status" aria-live="polite" style={contadoresEstilo}>
            {(Object.keys(contagens) as StatusItem[]).map((s) => (
              <span key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <i style={{ width: 6, height: 6, borderRadius: "50%", background: CORES_STATUS[s], display: "inline-block" }} />
                {contagens[s]} {ROTULO_STATUS[s]}
              </span>
            ))}
          </div>
        )}
        {totalDesatualizados > 0 && (
          // SPEC-26 Bloco 1: o aviso existe pra você parar de precisar LEMBRAR
          // o que ficou pra trás quando o desenho muda.
          <span data-testid="contador-desatualizados" style={avisoDesatualizadoEstilo} title="Respostas escritas antes de o desenho mudar">
            ⚠ {totalDesatualizados} {totalDesatualizados === 1 ? "campo desatualizado" : "campos desatualizados"}
          </span>
        )}
        {achados.length > 0 && (
          <button
            data-testid="abrir-revisor"
            onClick={() => setMostrarAchados((v) => !v)}
            style={{ ...botaoEstilo, borderColor: resumo.erros > 0 ? "var(--vermelho)" : "var(--borda-forte)" }}
            title="Checagens determinísticas — o revisor aponta, não corrige"
          >
            {resumo.erros > 0 ? `✕ ${resumo.erros} erro(s)` : ""}
            {resumo.erros > 0 && resumo.avisos > 0 ? " · " : ""}
            {resumo.avisos > 0 ? `⚠ ${resumo.avisos} aviso(s)` : ""}
          </button>
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

      {!mostrarDiagrama && (
        <EsteiraAgentes
          papeis={papeisAtivos}
          papelAtual={esteira.rodando ? esteira.papelAtual : null}
          atividadeAtual={
            esteira.rodando && esteira.atual
              ? esteira.escrevendoChaves.length > 1
                ? `itens ${esteira.progresso.feito + 1}–${esteira.progresso.feito + esteira.escrevendoChaves.length} de ${esteira.progresso.total} · ${esteira.atual.atividadeRotulo}`
                : `item ${esteira.progresso.feito + 1} de ${esteira.progresso.total} · ${esteira.atual.atividadeRotulo}`
              : undefined
          }
          pausado={esteira.pausado}
        />
      )}

      {mostrarDiagrama ? (
        <iframe title="Diagrama animado da solução" srcDoc={diagramaHtml} style={{ flex: 1, border: "none" }} />
      ) : (
        <>
          <DiagramaCompacto
            diagrama={diagrama}
            config={config}
            noAtivoId={
              esteira.atual
                ? chaveParaNodeId[esteira.atual.atividadeChave]
                : selecionada
                  ? chaveParaNodeId[selecionada]
                  : undefined
            }
            noFiltradoId={filtroNoId ?? undefined}
            onClickNo={clicarNoDiagrama}
            contagemPorNo={contagemPorNo}
            altura={alturaDiagrama ?? undefined}
            animado={esteira.rodando}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Ajustar altura do diagrama"
            data-testid="divisoria-diagrama"
            onPointerDown={iniciarArrastoDivisoria}
            style={divisoriaEstilo}
          >
            <span style={divisoriaGripEstilo} />
          </div>
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <section data-tour="review-table" className="review-lista" style={listaEstilo}>
            {mostrarAchados && achados.length > 0 && (
              // SPEC-26 Bloco 4a: cada achado leva ao item. O revisor aponta
              // — não escreve, não corrige, não sugere texto.
              <div style={avisoEstilo} data-testid="painel-achados">
                <strong style={{ fontSize: 12 }}>Revisão automática (sem IA)</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
                  {achados.map((achado, i) => (
                    <li key={i} style={{ color: achado.severidade === "erro" ? "var(--vermelho)" : "var(--amarelo)" }}>
                      <button style={linkEstilo} onClick={() => irParaChave(achado.atividadeChave)}>
                        {resultado.atividades.find((a) => a.chave === achado.atividadeChave)?.rotulo ?? achado.atividadeChave}
                      </button>{" "}
                      <span style={{ color: "var(--texto-2)" }}>{achado.mensagem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

            {filtroNoId && atividadesFiltradas.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--dim, #8D9BB0)", padding: "8px 4px" }}>
                Nenhum item derivado desse nó.
              </div>
            )}

            <div className="review-rail" style={railEstilo}>
              <div className="review-rail-progresso" style={{ height: `${pctTimeline}%` }} />
            {atividadesFiltradas.map((a) => {
              const ficha = fichas.get(a.chave)!;
              const status = statusDoItem(ficha);
              const cruzaOutroTime = outrosTimes(a).length > 0;
              const sel = a.chave === selecionada;
              const porPapel = placeholdersPorPapel(ficha);
              const escrevendo = esteira.rodando && esteira.escrevendoChaves.includes(a.chave);
              return (
                <button
                  key={a.chave}
                  data-testid={`item-${a.chave}`}
                  onClick={() => selecionar(a.chave)}
                  aria-pressed={sel}
                  className={[
                    "review-item-rail",
                    escrevendo ? "review-item-rail-escrevendo" : "",
                    status === "refinado" ? "review-item-rail-refinado" : "",
                    sel ? "review-item-rail-sel" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ ...itemRailEstilo, ...(sel ? itemRailSelEstilo : {}), ...(cruzaOutroTime ? { borderColor: "#e8b339" } : {}) }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: CORES_STATUS[status], flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.rotulo}</span>
                    {desatualizadosPorItem.has(a.chave) && (
                      <span
                        data-testid={`desatualizado-${a.chave}`}
                        style={seloDesatualizadoEstilo}
                        title={`${desatualizadosPorItem.get(a.chave)!.size} campo(s) escrito(s) antes de o desenho mudar`}
                      >
                        ⚠ desatualizado
                      </span>
                    )}
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
                    {papeisAtivos.map((papel) => {
                      // Fase F: um pip por papel CONFIGURADO. Papel que não
                      // leva este item (contexto não casa, outro papel do
                      // grupo leva) conta como não-aplicável — pip apagado.
                      const aplicavel = papelDoGrupo(papeisAtivos, papel.grupo, a)?.id === papel.id;
                      const placeholders = aplicavel ? porPapel[papel.grupo] : [];
                      const passou = placeholders.length > 0 && placeholders.every((p) => p.resposta !== undefined);
                      // Pip do papel/item em processamento agora pulsa — o
                      // resto do card já mostra estático (Fase E: "faltava
                      // efeito de alternância conforme os itens são
                      // preenchidos"). Com o lote, o grupo INTEIRO em
                      // geração pulsa, não um item só.
                      const emProcessamento =
                        esteira.rodando && esteira.papelAtual === papel.id && esteira.escrevendoChaves.includes(a.chave);
                      return (
                        <i
                          key={papel.id}
                          data-testid={`pip-${a.chave}-${papel.id}`}
                          title={papel.nome}
                          className={emProcessamento ? "pip-pulsando" : undefined}
                          style={{ ...pipEstilo, ...(passou || emProcessamento ? pipOnEstilo : {}) }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
            </div>
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
                      desatualizados={desatualizadosPorItem.get(atividadeSelecionada.chave)}
                      ficha={fichaSelecionada}
                      contextoEpico={contextoEpico}
                      onResponder={(chave, resposta) => responderComProcedencia(atividadeSelecionada.chave, chave, resposta)}
                      papelEmGeracao={
                        esteira.rodando && esteira.escrevendoChaves.includes(atividadeSelecionada.chave)
                          ? papeisAtivos.find((p) => p.id === esteira.papelAtual)?.grupo
                          : undefined
                      }
                      nomePapelEmGeracao={papeisAtivos.find((p) => p.id === esteira.papelAtual)?.nome}
                      respostasAoVivo={
                        esteira.rodando && esteira.escrevendoChaves.includes(atividadeSelecionada.chave)
                          ? esteira.respostasAoVivoPorItem[atividadeSelecionada.chave]
                          : undefined
                      }
                      gruposComSeguinte={GRUPOS_FICHA.filter((g) => {
                        const dono = papelDoGrupo(papeisAtivos, g, atividadeSelecionada);
                        return !!dono && papeisAtivos.findIndex((p) => p.id === dono.id) < papeisAtivos.length - 1;
                      })}
                      onReRodarSeguintes={
                        esteira.rodando ? undefined : (grupo) => reRodarSeguintes(atividadeSelecionada.chave, grupo)
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
  /** SPEC-26 Bloco 1: chave do placeholder → insumos que mudaram desde que a
   * resposta foi escrita. Ausente/vazio = alinhado com o desenho. */
  desatualizados?: Map<string, InsumoDivergente[]>;
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
  papelEmGeracao?: GrupoFicha;
  /** Nome do papel CONFIGURADO em geração (Fase F) — pro "✨ escrevendo…".
   * Ausente cai no rótulo fixo da seção. */
  nomePapelEmGeracao?: string;
  /** Seções cujo dono tem papéis DEPOIS na esteira — só nelas faz sentido o
   * "re-rodar a partir daqui". */
  gruposComSeguinte?: GrupoFicha[];
  /** "Revisar, alterar e rodar de novo o ciclo a partir daquela alteração":
   * regenera os papéis seguintes deste item usando esta seção como insumo.
   * `undefined` enquanto a esteira roda (sem reentrada no meio). */
  onReRodarSeguintes?: (grupo: GrupoFicha) => void;
  /** SPEC-24 Fase E — o que o modelo está ESCREVENDO agora, por chave
   * (extraído do JSON parcial streamado). O campo em geração mostra esse
   * texto digitando com um caret, em vez de "…" parado — achado real do
   * usuário: "fica só o ícone de gerando e 3 pontos, é um tanto pobre...
   * mostrar o que está rodando no modelo, tal como a experiência do
   * Claude". */
  respostasAoVivo?: Record<string, string>;
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
function AbaRefinamento({
  ficha,
  contextoEpico,
  desatualizados,
  onResponder,
  papelEmGeracao,
  nomePapelEmGeracao,
  respostasAoVivo,
  gruposComSeguinte,
  onReRodarSeguintes,
}: AbaRefinamentoProps) {
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

  function confirmar(p: FichaPlaceholder) {
    // O textarea mostra o rascunho digitado OU a resposta sugerida pela IA
    // (fallback). O handler precisa do MESMO fallback: sem ele, confirmar uma
    // sugestão da esteira que o usuário não editou virava um no-op silencioso.
    const valor = rascunhos[p.chave] ?? (typeof p.resposta?.valor === "string" ? p.resposta.valor : undefined);
    if (typeof valor !== "string" || valor.trim() === "") return;
    onResponder?.(p.chave, { valor, origem: "manual" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {erro && <div style={{ fontSize: 11, color: "#f87171" }}>{erro}</div>}
      {PAPEIS_PIPELINE.map((papel) => {
        const placeholders = grupos[papel];
        if (placeholders.length === 0) return null;
        return (
          <div key={papel}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={lblEstilo}>{ROTULO_PAPEL[papel]}</span>
              {onReRodarSeguintes &&
                gruposComSeguinte?.includes(papel) &&
                placeholders.some((p) => p.resposta !== undefined) && (
                  <button
                    onClick={() => onReRodarSeguintes(papel)}
                    title="Regenera os papéis seguintes deste item usando esta seção (com as suas alterações) como insumo"
                    style={reRodarEstilo}
                  >
                    ↻ Re-rodar papéis seguintes
                  </button>
                )}
            </div>
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
                    {desatualizados?.get(p.chave)?.length ? (
                      // O "por quê" navegável: qual insumo mudou depois desta
                      // resposta. Não mostra o valor ANTIGO de propósito —
                      // procedência não é versionamento (SPEC-26 §6).
                      <div data-testid={`desatualizado-campo-${p.chave}`} style={motivoDesatualizadoEstilo}>
                        ⚠ escrito antes de mudar:{" "}
                        {desatualizados
                          .get(p.chave)!
                          .map((d) => `${d.rotulo}${d.tipo === "novo" ? " (novo)" : d.tipo === "removido" ? " (removido)" : ""}`)
                          .join(", ")}
                      </div>
                    ) : null}
                    {confirmada ? (
                      <pre style={{ ...preEstilo, marginTop: 8 }}>{String(p.resposta?.valor)}</pre>
                    ) : aguardandoGeracao ? (
                      <div style={{ marginTop: 8 }}>
                        {/* O texto do modelo digitando em tempo real, com caret —
                            não mais "…" parado. Antes do primeiro token desse
                            campo chegar, um indicador pulsante de pensamento. */}
                        {respostasAoVivo?.[p.chave] !== undefined ? (
                          <pre data-testid={`ao-vivo-${p.chave}`} className="texto-ao-vivo" style={preEstilo}>
                            {respostasAoVivo[p.chave]}
                          </pre>
                        ) : (
                          <pre className="pensando-ao-vivo" style={preEstilo}>
                            ●●●
                          </pre>
                        )}
                        <span style={{ fontSize: 10.5, color: "#38bdf8" }}>✨ {nomePapelEmGeracao ?? ROTULO_PAPEL[papel]} escrevendo…</span>
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
                          <button onClick={() => confirmar(p)} disabled={!rascunho.trim()} style={botaoEstilo}>
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

const avisoDesatualizadoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--amarelo, #fbbf24)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 6,
  padding: "3px 8px",
  whiteSpace: "nowrap",
};

const seloDesatualizadoEstilo: React.CSSProperties = {
  fontSize: 10,
  color: "var(--amarelo, #fbbf24)",
  border: "1px solid var(--amarelo, #fbbf24)",
  borderRadius: 4,
  padding: "1px 5px",
  whiteSpace: "nowrap",
};

const motivoDesatualizadoEstilo: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "var(--amarelo, #fbbf24)",
  lineHeight: 1.5,
};

const contadoresEstilo: React.CSSProperties = {
  display: "flex",
  gap: 10,
  background: "#101823",
  border: "1px solid #1B2533",
  borderRadius: 8,
  padding: "4px 10px",
};

// Trilho fino de progresso no header (mesma ideia do `.track` do protótipo):
// o detalhe de QUEM está trabalhando mora na faixa de agentes logo abaixo
// (`EsteiraAgentes`), aqui fica só o avanço bruto.
const progressoTrilhoEstilo: React.CSSProperties = {
  flex: 1,
  maxWidth: 320,
  height: 3,
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

// Divisória arrastável entre o diagrama e a metade de baixo (Fase E) —
// área de 10px com um grip central, cursor de redimensionar.
const divisoriaEstilo: React.CSSProperties = {
  height: 10,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  cursor: "ns-resize",
  background: "#0C111A",
  borderBottom: "1px solid #1B2533",
  touchAction: "none",
};

const divisoriaGripEstilo: React.CSSProperties = {
  width: 44,
  height: 3,
  borderRadius: 2,
  background: "#263344",
};

const railEstilo: React.CSSProperties = {
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

const reRodarEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "3px 10px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  color: "var(--acento)",
  cursor: "pointer",
  whiteSpace: "nowrap",
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
