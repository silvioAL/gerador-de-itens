import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  carimbarInsumos,
  gerarDiagramaHtml,
  gerarEspecificacaoEntrega,
  gerarItensDeTrabalho,
  type ItemDeTrabalho,
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
  apiPdca,
} from "../api/client";
import { baixarArquivoTexto } from "../persistence/baixarArquivo";
import { assinarSugestao, fraseDeCompletude, pendenciasDaRevisao, type PendenteDeConfirmacao } from "./pendencias";
import { FilaDeRevisao } from "./FilaDeRevisao";
import { ConversaEspecificacao } from "../conversa/ConversaEspecificacao";
import { useArrastavel } from "../assistente/useArrastavel";
import { momentoDaRevisao } from "../assistente/momentos";
import { DiagramaCompacto } from "./DiagramaCompacto";
import { EsteiraAgentes } from "./EsteiraAgentes";
import { SimulacaoEsteira } from "./SimulacaoEsteira";
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
  /** SPEC-44: `undefined` remove a resposta (Descartar da fila guiada). */
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => void;
  /** SPEC-44 — deep-link da tela de itens: seleciona este item ao abrir. */
  itemInicial?: string | null;
  onFechar: () => void;
  /** SPEC-37 F3 (M4) — abre Configurações na aba Modelo de IA por cima da revisão. */
  onConfigurarModeloIa?: () => void;
  /** §184 — o markdown gerado sobe pro App, que o salva NA QUEBRA. */
  onEspecificacaoGerada?: (md: string) => void;
  /** SPEC-41 Parte B — os itens materializados sobem pro App, que persiste e
   * abre a tela `#/itens`. Mesmo material do documento (fonte única). */
  onItensGerados?: (itens: ItemDeTrabalho[]) => void;
  /** §184 — a demanda reaberta já tem especificação: o chat abre com a fala adaptada. */
  especificacaoJaGerada?: boolean;
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

/**
 * As quatro abas fixas (Especificação / Contrato / Refinamento / Testes)
 * deixaram de existir. Achado do usuário: *"a IA vai preenchendo as
 * informações ali na tab Refinamento, e são as mesmas informações repetidas
 * nessas outras tabs, não faz sentido"* — e ele estava certo, todos os quatro
 * grupos tinham sombra em outra aba (o Arquiteto escrevia o contrato no
 * Refinamento e a aba Contrato seguia dizendo "(não preenchido)" pro mesmo
 * assunto).
 *
 * A causa era histórica: as abas nasceram como leitura do DETERMINÍSTICO
 * (campos do nó, tabela de regras), e o Refinamento nasceu depois como onde os
 * placeholders são respondidos. Ninguém reconciliou quando a esteira passou a
 * preencher tudo.
 *
 * Agora a ficha é uma só, e a ordem das seções vem da configuração do pipeline
 * — não de uma lista no código. O que era determinístico não sumiu: virou
 * "insumos", explicitamente rotulado como de onde os agentes partiram.
 */

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
  itemInicial,
  onFechar,
  onConfigurarModeloIa,
  onEspecificacaoGerada,
  onItensGerados,
  especificacaoJaGerada = false,
  onSelecionarNo,
}: ReviewScreenProps) {
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [seguindoGeracao, setSeguindoGeracao] = useState(true);
  // SPEC-24 Fase D: clique num nó do DiagramaCompacto filtra a lista de
  // itens por aquele nó; segundo clique no mesmo nó limpa (toggle).
  const [filtroNoId, setFiltroNoId] = useState<string | null>(null);
  // SPEC-24 Fase E: altura do diagrama controlada pela divisória arrastável
  // ("usuário pode clicar e arrastar pra cima e pra baixo, assim ganha mais
  // espaço pra ver melhor o conteúdo"). `null` = default proporcional (30vh).
  const [alturaDiagrama, setAlturaDiagrama] = useState<number | null>(null);
  // SPEC-25 §5.5 / Fase 2.1 — o prompt único pra colar no chat da empresa.

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
  const [mostrarSimulacao, setMostrarSimulacao] = useState(false);
  // Por que a esteira não arrancou. `null` enquanto não se sabe (o efeito de
  // montagem ainda não respondeu) e depois de ela ter arrancado — a faixa de
  // aviso é sobre ausência, não sobre progresso.
  const [iaIndisponivel, setIaIndisponivel] = useState<"sem-rota" | "sem-modelo" | null>(null);

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
    (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => {
      if (resposta === undefined) {
        onResponderItem?.(atividadeChave, chavePlaceholder, undefined);
        return;
      }
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
  const achadosBrutos = useMemo(
    () => revisarQuebra(resultado.atividades, diagrama, config, regras, respostasItens),
    [resultado.atividades, diagrama, config, regras, respostasItens]
  );
  const [mostrarAchados, setMostrarAchados] = useState(false);
  // SPEC-27 Fase 2 — a conversa da especificação. Fase própria, janela
  // própria: carrega os itens derivados, não o catálogo de tipos de nó.
  const [mostrarConversa, setMostrarConversa] = useState(false);
  // SPEC-37 M1 — a fala de condução do fim da esteira. Presente = o chat abriu
  // (ou deve pulsar) por condução, com esta mensagem no lugar da saudação.
  const [falaDeConducao, setFalaDeConducao] = useState<string | null>(null);
  const rodavaAntes = useRef(false);
  // SPEC-37 M7 — "agora não" do balão de gerar a especificação.
  const [m7Dispensado, setM7Dispensado] = useState(false);
  // SPEC-37 F3 — dispensados dos momentos M4/M5 (por sessão da revisão).
  const [momentosDispensados, setMomentosDispensados] = useState<string[]>([]);
  const dispensarMomento = (m: string) => setMomentosDispensados((d) => [...d, m]);
  // SPEC-39 M13 — o feedback pós-especificação (a cada N gerações do usuário).
  const [pedindoFeedback, setPedindoFeedback] = useState(false);
  const [textoFeedback, setTextoFeedback] = useState("");
  // O bubble da revisão também arrasta (mesma chave do App: o bubble É um só
  // conceito — movê-lo numa tela move nas duas).
  const { estiloArrasto, handlersDeArrasto } = useArrastavel("gerador:fab-assistente");

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

  // ACHADO REAL do usuário: "aparecem diversos erros e avisos desde o início,
  // enquanto a IA nem gerou todo o conteúdo — isso é certo?". Não é.
  //
  // Há dois tipos de achado, e só um é ruído nessa hora: os que falam do
  // DESENHO (dependência órfã, campo do nó em branco, tech sem ciclo de teste
  // configurado, item G) valem desde o primeiro segundo — a esteira não vai
  // mudá-los. Já os que falam de RESPOSTA que a esteira ainda está escrevendo
  // acusam algo em andamento. Enquanto ela roda, esses ficam de fora; ao
  // terminar aparecem sozinhos, porque o `useMemo` recalcula.
  const achados = useMemo(
    () => (esteira.rodando ? achadosBrutos.filter((a) => a.regra !== "volumetria-sem-valor") : achadosBrutos),
    [achadosBrutos, esteira.rodando]
  );
  const resumo = useMemo(() => resumirAchados(achados), [achados]);

  /** A esteira já passou por aqui? Se algum item tem QUALQUER resposta, sim.
   * É o que distingue "ainda não preenchido" de "a esteira rodou e deixou em
   * branco" — o segundo merece atenção, o primeiro é só a fila de trabalho. */
  const esteiraJaRodou = useMemo(
    () => Object.values(respostasItens ?? {}).some((campos) => Object.keys(campos ?? {}).length > 0),
    [respostasItens]
  );
  const achadosDePessoa = useMemo(() => achados.filter((a) => a.origem !== "esteira"), [achados]);
  const achadosDaEsteira = useMemo(() => achados.filter((a) => a.origem === "esteira"), [achados]);
  const achadosPorItem = useMemo(() => {
    const mapa = new Map<string, Achado[]>();
    for (const a of achados) mapa.set(a.atividadeChave, [...(mapa.get(a.atividadeChave) ?? []), a]);
    return mapa;
  }, [achados]);

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
      //
      // ACHADO REAL do usuário: no modo hospedado isto era um `return` mudo. O
      // servidor (packages/server) não registra rota `/ia/*` nenhuma — elas só
      // existem no `gerador open` (openApiLocal.ts) — então `/ia/status` dá 404,
      // a promessa rejeita, e a tela ficava com a esteira desenhada, os quatro
      // agentes com as bolinhas vazias e NADA acontecendo, sem uma palavra de
      // explicação. Distinguir os dois motivos importa: "não tem IA neste modo"
      // e "tem, mas o modelo não foi baixado" pedem ações opostas de quem lê.
      if (status.status !== "fulfilled") {
        setIaIndisponivel("sem-rota");
        return;
      }
      if (!status.value.pronto) {
        setIaIndisponivel("sem-modelo");
        return;
      }
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
  }, [esteira.atual, seguindoGeracao]);

  // SPEC-37 M1 — a condução do pedido original: a esteira que O USUÁRIO
  // disparou terminou; o chat abre sozinho com a fala do momento. É a única
  // conduta que abre sem clique (régua da SPEC-37 §2): conclusão de processo
  // iniciado pela pessoa, quando a atenção já espera um resultado.
  useEffect(() => {
    if (rodavaAntes.current && !esteira.rodando) {
      const n = resultado.atividades.length;
      setFalaDeConducao(
        `Pronto — ${n === 1 ? "o item foi gerado" : `os ${n} itens foram gerados`}. Revise cada um; se algo precisar mudar, me diga aqui (por texto ou por voz 🎤) que eu aplico a alteração e reviso a consistência dos itens que dependem dele.`
      );
      if (!selecionada) setSelecionada(resultado.atividades[0]?.chave ?? null);
      setMostrarConversa(true);
    }
    rodavaAntes.current = esteira.rodando;
  }, [esteira.rodando, resultado.atividades, selecionada]);

  // §184 — a demanda JÁ TEM a especificação completa (reaberta depois de
  // gerada): MESMA mecânica do M1 (o chat abre sozinho), só muda a fala —
  // aqui não há esteira terminando, há material pronto pra revisitar.
  const conduziuJaEspecificada = useRef(false);
  // Congelado na CHEGADA: gerar a especificação durante ESTA sessão da
  // revisão não pode reabrir o chat por cima do que a pessoa está fazendo —
  // a fala é pra quem REABRE uma demanda já especificada.
  const jaGeradaNaChegada = useRef(especificacaoJaGerada);
  useEffect(() => {
    if (!jaGeradaNaChegada.current || conduziuJaEspecificada.current || esteira.rodando) return;
    conduziuJaEspecificada.current = true;
    setFalaDeConducao(
      "Esta demanda já tem a especificação de solução completa. Revise os itens; se algo precisar mudar, me diga aqui (por texto ou por voz 🎤) que eu aplico a alteração, reviso a consistência dos itens que dependem — e gero a especificação de novo."
    );
    if (!selecionada) setSelecionada(resultado.atividades[0]?.chave ?? null);
    setMostrarConversa(true);
  }, [especificacaoJaGerada, esteira.rodando, resultado.atividades, selecionada]);

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
  }

  function clicarNoDiagrama(nodeId: string) {
    setFiltroNoId((atual) => (atual === nodeId ? null : nodeId));
  }

  const atividadesFiltradas = filtroNoId
    ? resultado.atividades.filter((a) => chaveParaNodeId[a.chave] === filtroNoId)
    : resultado.atividades;
  const noFiltrado = filtroNoId ? diagrama.nodes.find((n) => n.id === filtroNoId) : undefined;

  function registrarUsoDeEspecificacao() {
    apiPdca
      .uso("especificacao")
      .then((r) => {
        if (r.momento) setPedindoFeedback(true);
      })
      .catch(() => {});
  }

  function baixarEspecificacao() {
    registrarUsoDeEspecificacao();
    const documento = gerarEspecificacaoEntrega(resultado.atividades, diagrama, config, {
      regras,
      demandInfo,
      template: especificacaoTemplate.conteudo,
      time,
      respostasItens,
    });
    baixarArquivoTexto(documento, "especificacao-de-solucao.md", "text/markdown");
    // §184 — o documento gerado (com TODO o material do momento) sobe pro App
    // e fica salvo na quebra: gerar é publicar uma versão, não só baixar.
    onEspecificacaoGerada?.(documento);
  }

  // SPEC-41 Parte B — os itens de trabalho, do MESMO material do documento.
  function gerarItens() {
    registrarUsoDeEspecificacao();
    onItensGerados?.(
      gerarItensDeTrabalho(resultado.atividades, diagrama, config, { regras, respostasItens })
    );
  }

  // SPEC-44 — a régua única: sugestões aguardando assinatura x campos vazios,
  // agregadas sobre TODOS os itens (a barra, os chips e a fila leem daqui).
  const pend = regras
    ? pendenciasDaRevisao(
        resultado.atividades.map((a) => ({ chave: a.chave, rotulo: a.rotulo, ficha: fichas.get(a.chave)! }))
      )
    : null;
  const [filaAberta, setFilaAberta] = useState<PendenteDeConfirmacao[] | null>(null);

  function confirmarTodas() {
    for (const s of pend?.sugestoes ?? []) {
      responderComProcedencia(s.itemChave, s.chave, assinarSugestao(s.resposta));
    }
  }

  // Deep-link da tela de itens: chegar com um item alvo seleciona ele.
  useEffect(() => {
    if (itemInicial) setSelecionada(itemInicial);
  }, [itemInicial]);

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

  // SPEC-37 F3 — M4 (sem modelo de IA), M5 (derivou sem contexto do épico) e
  // M7 (tudo refinado): a prioridade mora em momentos.ts, testada pura.
  const momentoRevisao = momentoDaRevisao({
    semModeloDeIa: iaIndisponivel === "sem-modelo",
    demandInfoVazio: !(demandInfo ?? "").trim(),
    // Sem `regras` não há contagens — e uma revisão sem status calculado é,
    // por definição, intocada (ninguém confirmou nada).
    revisaoIntocada: !contagens || (contagens.refinado === 0 && contagens.revisar === 0),
    tudoRefinado:
      !!contagens && contagens.refinado > 0 && contagens.rascunho === 0 && contagens.revisar === 0,
    esteiraRodando: esteira.rodando,
    conversaAberta: mostrarConversa,
    dispensados: m7Dispensado ? [...momentosDispensados, "m7"] : momentosDispensados,
  });
  const momentoM7Ativo = momentoRevisao === "m7" && !pedindoFeedback;

  // Altura do brilho da timeline: fração de itens que já saíram do rascunho
  // (ou seja, algum papel já escreveu algo neles). Derivado do mesmo
  // `statusDoItem` da lista — sem estado paralelo de "progresso visual" que
  // pudesse divergir do que os cards mostram.
  const tocados = atividadesFiltradas.filter((a) => statusDoItem(fichas.get(a.chave)!) !== "rascunho").length;
  const pctTimeline = atividadesFiltradas.length > 0 ? (tocados / atividadesFiltradas.length) * 100 : 0;

  return (
    <>
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
            style={{ ...botaoEstilo, borderColor: achadosDePessoa.length > 0 ? "var(--vermelho)" : "var(--borda-forte)" }}
            title={
              "Checagens determinísticas — o revisor aponta, não corrige. " +
              `${achadosDePessoa.length} precisa(m) de você; ` +
              `${achadosDaEsteira.length} a esteira preenche ao rodar.`
            }
          >
            {/* ACHADO REAL: "20 aviso(s)" logo depois de derivar era lido como
                20 defeitos, quando quase todos eram a fila da esteira. Contar
                junto o que tem donos diferentes é o que criava a leitura
                errada — antes mesmo de alguém abrir o painel. */}
            {achadosDePessoa.length > 0 ? `⚠ ${achadosDePessoa.length} a resolver` : ""}
            {achadosDePessoa.length > 0 && achadosDaEsteira.length > 0 ? " · " : ""}
            {achadosDaEsteira.length > 0 ? `${achadosDaEsteira.length} na fila da esteira` : ""}
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
        {/* #299 — ao lado do botão que GASTA, de propósito: a pergunta "quanto
            isto vai custar e o que exatamente vai" se faz aqui, no momento de
            decidir, não numa tela de configuração à parte. */}
        {!esteira.rodando && (
          <button onClick={() => setMostrarSimulacao(true)} style={botaoEstilo} data-testid="abrir-simulacao">
            👁 Simular (sem gastar IA)
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
          ) : null /* SPEC-39 — o botão de gerar especificação MORREU: a
              geração é ação do agente (chip do M7 quando tudo refinado; M12
              nos demais casos). O contêiner fica pro spotlight do tour. */}
        </div>
        <button onClick={onFechar} style={botaoEstilo}>
          Voltar ao canvas
        </button>
      </header>

      {/* SPEC-44 — a barra de pendências: o agregado que faltava. Aceitar é
          barato (1 clique global); intervir é que merece clique. Some quando
          não há pendência, e espera a esteira terminar (os números mudariam
          sob o usuário). */}
      {pend && !esteira.rodando && (pend.sugestoes.length > 0 || pend.vazios > 0) && (
        <div style={barraPendenciasEstilo} data-testid="barra-pendencias">
          <span style={{ fontSize: 12.5, color: "var(--texto-2)" }}>
            {pend.sugestoes.length > 0 &&
              `${pend.sugestoes.length} ${pend.sugestoes.length === 1 ? "sugestão" : "sugestões"} da esteira aguardando`}
            {pend.sugestoes.length > 0 && pend.vazios > 0 && " · "}
            {pend.vazios > 0 && `${pend.vazios} campo${pend.vazios === 1 ? "" : "s"} vazio${pend.vazios === 1 ? "" : "s"}`}
          </span>
          <div style={trilhoPendenciasEstilo} aria-hidden="true">
            <div style={{ ...barraProgressoPendenciasEstilo, width: `${pend.totais > 0 ? (pend.confirmados / pend.totais) * 100 : 0}%` }} />
          </div>
          {pend.sugestoes.length > 0 && (
            <>
              <button onClick={confirmarTodas} style={botaoBarraEstilo} data-testid="confirmar-todas">
                Confirmar todas ({pend.sugestoes.length})
              </button>
              <button onClick={() => setFilaAberta(pend.sugestoes)} style={botaoBarraSecEstilo} data-testid="revisar-uma-a-uma">
                Revisar uma a uma
              </button>
            </>
          )}
        </div>
      )}

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

      {/* A esteira desenhada e parada, sem explicação, é pior que não ter
          esteira: parece produto quebrado. Diz o motivo e o que fazer. */}
      {!mostrarDiagrama && iaIndisponivel && !esteira.rodando && (
        <div style={avisoIaEstilo} data-testid={`ia-indisponivel-${iaIndisponivel}`}>
          {iaIndisponivel === "sem-rota" ? (
            <>
              <strong>Os agentes não rodam neste modo.</strong> Este servidor não expõe as rotas de IA — elas
              existem só no modo local (<code>gerador open</code>). A derivação, a revisão determinística e a
              especificação de solução continuam funcionando aqui; o que não roda é o preenchimento assistido.
            </>
          ) : (
            <>
              <strong>Modelo de IA não instalado.</strong> Rode <code>gerador ia instalar</code> (ou configure um
              gateway na aba <em>Modelo de IA</em>) pra esteira preencher os itens sozinha. Sem isso, o botão
              “✨ Sugerir” de cada campo continua disponível item a item.
            </>
          )}
        </div>
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
                {/* ACHADO REAL (print): canvas com as 8 bolinhas VERDES e este
                    painel vermelho com 20 avisos ao mesmo tempo. Não era
                    contradição — o verde responde "o nó dá pra derivar?" e os
                    avisos respondem "os itens já estão preenchidos?" — mas ler
                    "20 avisos" logo depois de derivar parece defeito quando é
                    pendência. Agora as duas coisas ficam separadas, e o que a
                    esteira preenche só vira lista quando ela já rodou. */}
                {achadosDePessoa.length > 0 && (
                  <div data-testid="pendencias-de-pessoa">
                    <strong style={{ fontSize: 12 }}>Precisa de você</strong>
                    <p style={explicacaoDoGrupoEstilo}>
                      Checagens determinísticas, sem IA. Nenhum agente resolve isto — são coisas que dependem de
                      uma decisão sua no diagrama ou nos campos do nó.
                    </p>
                    <ul style={listaDeAchadosEstilo}>
                      {achadosDePessoa.map((achado, i) => (
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

                {achadosDaEsteira.length > 0 && (
                  <div data-testid="pendencias-da-esteira" style={{ marginTop: achadosDePessoa.length > 0 ? 12 : 0 }}>
                    <strong style={{ fontSize: 12, color: "var(--texto-2)" }}>
                      {esteiraJaRodou
                        ? `A esteira rodou e ${achadosDaEsteira.length} campo(s) continuam em branco`
                        : `${achadosDaEsteira.length} campo(s) que a esteira ainda vai preencher`}
                    </strong>
                    <p style={explicacaoDoGrupoEstilo}>
                      {esteiraJaRodou
                        ? "Isto era pra ter sido preenchido pelos agentes e não foi — vale olhar, pode ser regra faltando na configuração ou resposta que não veio."
                        : "Não é erro: é a lista do que os agentes vão escrever quando a esteira rodar. Some sozinho."}
                    </p>
                    <ul style={listaDeAchadosEstilo}>
                      {achadosDaEsteira.map((achado, i) => (
                        <li key={i} style={{ color: esteiraJaRodou ? "var(--amarelo)" : "var(--texto-mudo)" }}>
                          <button style={linkEstilo} onClick={() => irParaChave(achado.atividadeChave)}>
                            {resultado.atividades.find((a) => a.chave === achado.atividadeChave)?.rotulo ?? achado.atividadeChave}
                          </button>{" "}
                          <span style={{ color: "var(--texto-2)" }}>{achado.mensagem}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
            {atividadesFiltradas.map((a, indice) => {
              const ficha = fichas.get(a.chave)!;
              const status = statusDoItem(ficha);
              // Pedido do usuário: a timeline sinaliza onde começa e onde
              // termina — primeiro card com marco de início, último com o de
              // fim; lista de UM item carrega os dois no mesmo card.
              const primeiro = indice === 0;
              const ultimo = indice === atividadesFiltradas.length - 1;
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
                    primeiro && ultimo
                      ? "review-item-rail-unico"
                      : primeiro
                        ? "review-item-rail-inicio"
                        : ultimo
                          ? "review-item-rail-fim"
                          : "",
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
                  {/* SPEC-44 — a MESMA frase de completude da tela de itens,
                      e o lote por item: assinar tudo deste item num clique. */}
                  {(() => {
                    const doItem = pendenciasDaRevisao([{ chave: a.chave, rotulo: a.rotulo, ficha }]);
                    return (
                      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={chipCompletudeEstilo} data-testid={`completude-${a.chave}`}>
                          {fraseDeCompletude(doItem.sugestoes.length, doItem.vazios)}
                        </span>
                        {doItem.sugestoes.length > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            data-testid={`confirmar-item-${a.chave}`}
                            title={`Assina as ${doItem.sugestoes.length} sugestões deste item`}
                            style={confirmarItemEstilo}
                            onClick={(e) => {
                              e.stopPropagation();
                              for (const s of doItem.sugestoes) responderComProcedencia(s.itemChave, s.chave, assinarSugestao(s.resposta));
                            }}
                          >
                            ✓ confirmar item
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {a.timesEnvolvidos?.length ? (
                    <div style={{ fontSize: 11, color: cruzaOutroTime ? "#e8b339" : "var(--dim, #8D9BB0)", marginTop: 2 }}>
                      {a.timesEnvolvidos.join(", ")}
                    </div>
                  ) : null}
                  {/* ACHADO #261 — "item n2::ep0 sem pips depois da esteira completa".
                      Ninguém falhou: ninguém ASSUMIU. `papelDoGrupo` só aceita
                      um papel se ele casa com os contextos/techs do item (ou
                      se tem contexto vazio, que casa com tudo). A atividade de
                      endpoint nasce com `contextos: []` quando o nó está sem
                      tech — então, se todos os papéis configurados forem
                      contextuais, nenhum pega o item e a esteira "completa"
                      deixando-o intocado.

                      Isso era invisível: pip apagado de "não assumido" é
                      idêntico ao de "nada a escrever". Aqui o card passa a
                      dizer a causa e onde corrigi-la. Não inventamos dono de
                      propósito — um agente de mensageria escrevendo sobre um
                      item HTTP produziria texto plausível e errado, que é pior
                      que texto nenhum. */}
                  {papeisAtivos.length > 0 &&
                  papeisAtivos.every((p) => papelDoGrupo(papeisAtivos, p.grupo, a) === undefined) ? (
                    <div data-testid={`sem-dono-${a.chave}`} style={semDonoEstilo}>
                      Nenhum agente assumiu este item
                      {a.techs.length === 0
                        ? " — o nó não tem tecnologia definida, então nenhum agente contextual o reconhece. Preencha a tech do nó no diagrama."
                        : " — nenhum agente configurado cobre este contexto. Ajuste os contextos na aba Pipeline de agentes."}
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
                      // ACHADO REAL do usuário: "o penúltimo stage não foi
                      // preenchido". Não foi — porque não tinha NADA pra
                      // preencher (a config de regras não cobre a tech/contexto
                      // daquele item), e o pip apagado era idêntico ao de um
                      // papel que falhou. Sem trabalho ≠ trabalho não feito:
                      // agora o terceiro estado existe e o title diz qual é.
                      const semTrabalho = placeholders.length === 0;
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
                          data-estado={passou ? "feito" : semTrabalho ? "sem-trabalho" : "pendente"}
                          title={
                            semTrabalho
                              ? `${papel.nome}: nada a escrever neste item (nenhuma regra configurada cobre ${
                                  a.techs.join("/") || "este item"
                                })`
                              : passou
                                ? `${papel.nome}: escrito`
                                : `${papel.nome}: pendente`
                          }
                          className={emProcessamento ? "pip-pulsando" : undefined}
                          style={{
                            ...pipEstilo,
                            ...(passou || emProcessamento ? pipOnEstilo : {}),
                            ...(semTrabalho && !emProcessamento ? pipSemTrabalhoEstilo : {}),
                          }}
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
                </div>
                <div style={fichaBodyEstilo}>
                  <FichaIdentificacao ficha={fichaSelecionada} />
                  <AbaRefinamento
                      papeis={papeisAtivos}
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
                  <Insumos ficha={fichaSelecionada} />
                </div>
              </>
            )}
          </section>
          </div>
        </>
      )}
    </div>
      {mostrarConversa && atividadeSelecionada && (
        <ConversaEspecificacao
          atividades={resultado.atividades}
          fichas={fichas}
          atividadeSelecionada={atividadeSelecionada}
          contextoEpico={contextoEpico}
          falaInicial={falaDeConducao ?? undefined}
          onAplicar={responderComProcedencia}
          onFechar={() => setMostrarConversa(false)}
        />
      )}
      {/* O mesmo bubble do resto do produto (#298), adaptado à revisão: abre o
          chat de refinamento, que é POR item — sem item selecionado, o clique
          seleciona o primeiro (a conversa precisa de um alvo). Substitui o
          botão "✦ Refinar conversando" que morava no header. zIndex 62: acima
          da própria JanelaConversa (60), senão a janela aberta cobriria o
          botão que a fecha. */}
      {/* SPEC-37 M7 — tudo refinado: o fechamento natural do ciclo é gerar a
          especificação de solução, e o chip executa o MESMO baixarEspecificacao
          do botão do header. Só com o chat fechado (aberto, quem fala é ele) e
          com a esteira parada — no meio da corrida os números ainda mudam. */}
      {filaAberta && (
        <FilaDeRevisao
          pendentes={filaAberta}
          onConfirmar={(itemChave, chave, resposta) => responderComProcedencia(itemChave, chave, resposta)}
          onDescartar={(itemChave, chave) => responderComProcedencia(itemChave, chave, undefined)}
          onFechar={() => setFilaAberta(null)}
        />
      )}
      {momentoM7Ativo && (
        <div className="assistente-janela" style={balaoM7Estilo} data-testid="balao-especificacao" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>
            Tudo refinado — os {contagens?.refinado} itens estão prontos. Quer gerar a especificação de solução?
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button onClick={baixarEspecificacao} style={chipM7Estilo} data-testid="balao-especificacao-acao">
              Gerar especificação de solução
            </button>
            {onItensGerados && (
              <button onClick={gerarItens} style={chipM7Estilo} data-testid="balao-especificacao-itens">
                Gerar itens de trabalho
              </button>
            )}
            <button
              onClick={() => setM7Dispensado(true)}
              aria-label="Dispensar sugestão"
              style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 999, border: "none", background: "transparent", color: "var(--texto-mudo)", cursor: "pointer" }}
            >
              agora não
            </button>
          </div>
        </div>
      )}
      {/* SPEC-37 F3 — M4: a esteira inteira parada por falta de credencial é o
          momento mais bloqueante da revisão; o chip abre a aba certa. */}
      {momentoRevisao === "m4" && !pedindoFeedback && (
        <div className="assistente-janela" style={balaoM7Estilo} data-testid="balao-sem-ia" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>
            A esteira de IA está desligada — sem credencial de gateway. Configuro com você? (aba Modelo de IA)
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            {onConfigurarModeloIa && (
              <button onClick={onConfigurarModeloIa} style={chipM7Estilo} data-testid="balao-sem-ia-acao">
                Abrir Modelo de IA
              </button>
            )}
            <button
              onClick={() => dispensarMomento("m4")}
              aria-label="Dispensar sugestão"
              style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 999, border: "none", background: "transparent", color: "var(--texto-mudo)", cursor: "pointer" }}
            >
              agora não
            </button>
          </div>
        </div>
      )}
      {/* M5 — derivou sem Contexto do épico: aviso de chegada, sem chip (o
          material se cola na aba 📎 do assistente, no canvas). */}
      {momentoRevisao === "m5" && !pedindoFeedback && (
        <div className="assistente-janela" style={balaoM7Estilo} data-testid="balao-sem-contexto" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>
            Sem o Contexto do épico, as sugestões de IA e o documento final saem mais pobres — quer colar o material
            da demanda? Fica na aba “📎 Contexto do épico” do assistente, lá no canvas.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => dispensarMomento("m5")}
              aria-label="Dispensar sugestão"
              style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 999, border: "none", background: "transparent", color: "var(--texto-mudo)", cursor: "pointer" }}
            >
              agora não
            </button>
          </div>
        </div>
      )}
      {/* SPEC-39 M12 — sem o botão do header, o agente é a porta da geração
          também fora do "tudo refinado". */}
      {momentoRevisao === "m12" && !pedindoFeedback && (
        <div className="assistente-janela" style={balaoM7Estilo} data-testid="balao-gerar" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>
            Quando quiser, eu gero a especificação de solução — mesmo com itens ainda em revisão.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button onClick={baixarEspecificacao} style={chipM7Estilo} data-testid="balao-gerar-acao">
              Gerar especificação de solução
            </button>
            {onItensGerados && (
              <button onClick={gerarItens} style={chipM7Estilo} data-testid="balao-gerar-itens">
                Gerar itens de trabalho
              </button>
            )}
            <button
              onClick={() => dispensarMomento("m12")}
              aria-label="Dispensar sugestão"
              style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 999, border: "none", background: "transparent", color: "var(--texto-mudo)", cursor: "pointer" }}
            >
              agora não
            </button>
          </div>
        </div>
      )}
      {/* SPEC-39 M13 — o feedback do ciclo: o que faltou ou sobrou? */}
      {pedindoFeedback && (
        <div className="assistente-janela" style={balaoM7Estilo} data-testid="balao-feedback" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>
            Especificação gerada! Me conta: faltou (ou sobrou) algum item de checklist, regra de refinamento ou campo
            no formulário? É assim que a configuração do time melhora.
          </p>
          <input
            aria-label="O que faltou ou sobrou"
            value={textoFeedback}
            onChange={(e) => setTextoFeedback(e.target.value)}
            placeholder="ex.: sobrou o campo de volumetria; faltou item de DLQ"
            style={{ width: "100%", marginTop: 8, fontSize: 12.5, padding: "6px 8px" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                if (!textoFeedback.trim()) return;
                void apiPdca.feedback(textoFeedback.trim()).catch(() => {});
                setPedindoFeedback(false);
                setTextoFeedback("");
              }}
              disabled={!textoFeedback.trim()}
              style={{ ...chipM7Estilo, ...(textoFeedback.trim() ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
              data-testid="balao-feedback-enviar"
            >
              Enviar feedback
            </button>
            <button
              onClick={() => setPedindoFeedback(false)}
              aria-label="Dispensar sugestão"
              style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 999, border: "none", background: "transparent", color: "var(--texto-mudo)", cursor: "pointer" }}
            >
              agora não
            </button>
          </div>
        </div>
      )}
      <button
        className={`assistente-fab${(falaDeConducao && !mostrarConversa) || momentoRevisao !== null ? " assistente-fab--chamando" : ""}`}
        data-testid="abrir-conversa-especificacao"
        {...handlersDeArrasto}
        onClick={() => {
          if (!atividadeSelecionada && resultado.atividades.length > 0) {
            setSelecionada(resultado.atividades[0].chave);
          }
          setMostrarConversa((v) => !v);
        }}
        aria-label="Refinar conversando"
        aria-expanded={mostrarConversa}
        title={
          mostrarConversa
            ? undefined
            : "Refinar conversando — por texto ou por voz: peça a alteração de um item e depois mande revisar os que dependem dele."
        }
        style={{ ...fabRefinarEstilo, ...estiloArrasto }}
      >
        <span
          style={{
            fontSize: 20,
            lineHeight: 1,
            transition: "transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1)",
            transform: mostrarConversa ? "rotate(135deg)" : "none",
          }}
          aria-hidden="true"
        >
          {mostrarConversa ? "+" : "✦"}
        </span>
      </button>
      {mostrarSimulacao && (
        <SimulacaoEsteira
          // `false` = a fila que "Gerar de novo" usaria: exatamente o que a
          // próxima corrida faria. Simular a fila de outro botão responderia
          // uma pergunta que ninguém fez.
          fila={montarFilaEsteira(false)}
          papeis={papeisAtivos}
          contextoEpico={contextoEpico}
          onFechar={() => setMostrarSimulacao(false)}
        />
      )}
    </>
  );
}

/**
 * O que o item É, derivado do desenho: nenhum agente escreve isto, e por isso
 * abre a ficha em vez de disputar espaço com o que é escrito.
 */
function FichaIdentificacao({ ficha }: { ficha: FichaItem }) {
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
    </div>
  );
}

/**
 * O material DETERMINÍSTICO de onde os agentes partem: campos preenchidos no
 * canvas, o scaffold Gherkin e a tabela de regras da combinação tech ×
 * contexto. Fica fechado por padrão e rotulado como insumo — antes isto morava
 * em três abas irmãs da de Refinamento, e parecia que a mesma informação
 * estava duplicada (parecia porque, lado a lado com o que o agente escreveu,
 * um campo vazio do nó lia-se como contradição, não como ponto de partida).
 */
function Insumos({ ficha }: { ficha: FichaItem }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ marginTop: 22, borderTop: "1px solid #1B2533", paddingTop: 12 }}>
      <button onClick={() => setAberto((a) => !a)} style={insumosBotaoEstilo} data-testid="alternar-insumos">
        {aberto ? "▾" : "▸"} Insumos — o que os agentes receberam
      </button>
      {aberto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
          <div>
            <span style={lblEstilo}>Critérios de aceite (scaffold Gherkin)</span>
            <pre style={preEstilo}>{ficha.criteriosAceiteMarkdown}</pre>
          </div>
          <div>
            <span style={lblEstilo}>Campos preenchidos no canvas</span>
            <AbaContrato ficha={ficha} />
          </div>
          <AbaTestes ficha={ficha} />
        </div>
      )}
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
  /** Papéis CONFIGURADOS e ativos, na ordem configurada (Fase F). É o que
   * define quais seções existem na ficha e em que ordem — a mesma lista que
   * dirige a esteira, pra não haver duas verdades sobre o fluxo. */
  papeis: PapelConfigurado[];
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
  papeis,
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
      {/* Achado do usuário: *"isso deveria ser flexível, se amanhã o usuário
          quiser configurar outro agente ou mudar a ordem, os outputs devem
          aparecer ali na ordem que o fluxo foi configurado"*. Antes esta lista
          era `PAPEIS_PIPELINE`, fixa no código, enquanto a esteira já rodava
          pela config (Fase F) — renomear ou reordenar um papel mudava quem
          escrevia e não mudava onde aparecia. Agora as duas leem a MESMA
          fonte. */}
      {papeis.map((papelConfig) => {
        const papel = papelConfig.grupo;
        const placeholders = grupos[papel];
        return (
          <div key={papelConfig.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={lblEstilo}>{papelConfig.nome}</span>
              {/* SPEC-44 — lote por seção: assinar tudo que o papel escreveu. */}
              {placeholders.some((p) => p.resposta !== undefined && !respostaConfirmada(p.resposta)) && (
                <button
                  onClick={() => {
                    for (const p of placeholders) {
                      if (p.resposta !== undefined && !respostaConfirmada(p.resposta)) {
                        onResponder?.(p.chave, { ...p.resposta, confirmado: true });
                      }
                    }
                  }}
                  style={reRodarEstilo}
                  data-testid={`confirmar-secao-${papelConfig.id}`}
                >
                  ✓ Confirmar seção
                </button>
              )}
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
            {/* Papel configurado que não tem o que escrever NESTE item vira
                uma linha explícita, não um sumiço. Foi o relato: o Especialista
                "não rodava", quando na verdade a tabela de regras carregada não
                cobria a combinação do item — invisível numa seção que some. */}
            {placeholders.length === 0 && (
              <p style={semTrabalhoEstilo} data-testid={`sem-trabalho-${papelConfig.id}`}>
                Nada a escrever neste item — a tabela de regras carregada não tem nada para{" "}
                {ficha.techs.join(", ") || "esta tech"}
                {ficha.contextos.length > 0 ? ` × ${ficha.contextos.join(", ")}` : ""}.
              </p>
            )}
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

// Amarelo de aviso, não vermelho de erro: a quebra derivou, a revisão rodou, a
// especificação sai. O que falta é o preenchimento assistido — e isso é uma
// ausência de recurso, não uma falha.
const avisoIaEstilo: React.CSSProperties = {
  margin: "0 16px 8px",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(232, 179, 57, 0.3)",
  background: "rgba(232, 179, 57, 0.06)",
  color: "#E8B339",
  fontSize: 12.5,
  lineHeight: 1.6,
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

/** Aviso de item órfão (#261). Cor de atenção, não de erro: não houve falha —
 * houve um buraco de configuração, e quem lê precisa saber onde mexer. */
const semDonoEstilo: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  lineHeight: 1.5,
  color: "#e8b339",
};

const pipEstilo: React.CSSProperties = {
  width: 14,
  height: 4,
  borderRadius: 2,
  background: "#1B2533",
  display: "inline-block",
};

/** "Nada a escrever aqui" ≠ "não escreveu": pip vazado, não sólido. Sem essa
 * distinção o usuário lê ausência de trabalho como falha do agente — e foi
 * exatamente o que aconteceu ("o penúltimo stage não foi preenchido"). */
const pipSemTrabalhoEstilo: React.CSSProperties = {
  background: "transparent",
  border: "1px dashed #2A3646",
  height: 2,
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

const insumosBotaoEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8A97AB",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};

const semTrabalhoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "#8A97AB",
  fontStyle: "italic",
  margin: "6px 0 0",
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

/** Balão do M7 — mesma âncora e desenho do balão do assistente no App. */
const balaoM7Estilo: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 80,
  width: 300,
  maxWidth: "calc(100vw - 40px)",
  padding: "10px 12px",
  background: "var(--painel)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 12,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
  zIndex: 62,
};

const chipM7Estilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 999,
  border: "1px solid var(--acento-indigo)",
  background: "var(--acento-indigo)",
  color: "#fff",
  cursor: "pointer",
};

/** O mesmo desenho do bubble do App (AssistenteFlutuante) — cor, tamanho e
 * hover vêm da classe `.assistente-fab`; aqui só o empilhamento muda. */
const fabRefinarEstilo: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 48,
  height: 48,
  borderRadius: "50%",
  border: "1px solid var(--acento-indigo)",
  background: "var(--acento-indigo)",
  color: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
  zIndex: 62,
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

const listaDeAchadosEstilo: React.CSSProperties = {
  margin: "6px 0 0",
  paddingLeft: 18,
  fontSize: 12,
  lineHeight: 1.7,
};

const explicacaoDoGrupoEstilo: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--texto-mudo)",
};

const barraPendenciasEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 16px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel-alto)",
};

const trilhoPendenciasEstilo: React.CSSProperties = {
  flex: 1,
  height: 5,
  borderRadius: 999,
  background: "var(--fundo)",
  overflow: "hidden",
  maxWidth: 220,
};

const barraProgressoPendenciasEstilo: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "var(--verde, #3ecf8e)",
  transition: "width 250ms ease",
};

const botaoBarraEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoBarraSecEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const chipCompletudeEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-fraco)",
  background: "var(--fundo)",
};

const confirmarItemEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "none",
  background: "rgba(62, 207, 142, 0.15)",
  color: "var(--verde, #3ecf8e)",
  cursor: "pointer",
};
