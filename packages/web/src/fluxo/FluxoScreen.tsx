import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeCard, type NodeCardData } from "../canvas/NodeCard";
import { comoNoDaMesa, configDoFluxo } from "./vocabularioDoFluxo";
import {
  FUNCOES_DO_SISTEMA,
  funcaoDoSistema,
  GATILHOS_DO_SISTEMA,
  gatilhoDoSistema,
  ID_DO_NO_DE_GATILHO,
  noDeGatilhoManual,
  // SPEC-110 fatia E — o relógio: a expressão e a previsão da próxima.
  PARAMETRO_DA_EXPRESSAO,
  proximaOcorrenciaLegivel,
  telasEmVigor,
  type TelaEmVigor,
  PROJETO_DO_SISTEMA,
  // SPEC-110 fatia F — a demanda desdobrada: a direcao e do componente.
  AVISO_DO_PROJETO_LEGADO,
  DADOS_DO_SISTEMA,
  dadoDoSistema,
  REF_DA_DEMANDA_GRAVAR,
  REF_DA_DEMANDA_LER,
  REF_DO_PROJETO,
  sanearCamposDaTransformacao,
  avisosDeMapeamento,
  mensagemDeCiclo,
  NOME_DA_OPERACAO,
  planoDoFluxo,
  preambuloDoPapel,
  type ExecucaoDoPapel,
  type ArestaDoFluxo,
  type Fluxo,
  type NoDoFluxo,
  type OperacaoDoGateway,
} from "@gerador/aplicacao";
import {
  apiCatalogoDeConectores,
  apiExecucaoDeFluxo,
  apiFluxos,
  apiFluxosEmVigor,
  apiIa,
  apiPipelineAgentes,
  apiTelas,
  type ConectorDoCatalogo,
  type EventoDaExecucao,
  type FluxoEmVigor,
  type PapelConfigurado,
  type RastroDoNoExecutado,
} from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";

/**
 * SPEC-105 fatia C — **a tela do FLUXO: o outro grafo.**
 *
 * A mesa de projeto desenha a arquitetura que o time vai construir; esta tela
 * desenha o encanamento da ferramenta. **São telas separadas, com paletas
 * separadas e persistência separada (§1)** — o que se reusa é o motor (React
 * Flow, a ordenação topológica), nunca a superfície. Reusar a tela é o que
 * destruiria a régua "estou desenhando o meu sistema ou a minha automação?".
 *
 * A paleta nasce do CATÁLOGO (fatia A) e da esteira: um nó é um conector ou um
 * papel — nunca um tipo solto. A aresta carrega o `mapeamento`; sem ele é
 * decoração (§4.1), e a tela diz isso.
 */

/**
 * SPEC-107 fatia D — o fluxo renderiza com o MESMO cartão da mesa (§2.2):
 * paridade de LINGUAGEM, dirigida por um `DiagramaConfig` próprio (uma
 * família por tipo, cores e ícones travados por teste nos dois temas). O
 * refId técnico saiu do cartão de vez (§2.4-1) — ele vive no painel.
 */
const TIPOS_DE_NO = { noDeFluxo: NodeCard };
const CONFIG_DO_FLUXO = configDoFluxo();

/**
 * SPEC-110 fatia A (D1) — **todo fluxo COMEÇA num gatilho visível**, e isso
 * vale para o gesto de criar: o fluxo novo já nasce com o cartão que diz
 * quando ele roda (manual, o disparo de sempre), como um workflow novo do n8n
 * nasce pedindo o trigger. Quem quer outro gatilho troca no painel; quem não
 * quer nenhum apaga — a validação tolera zero (D8).
 */
const FLUXO_VAZIO = (id: string, nome: string): FluxoEmVigor => ({
  id,
  nome,
  nos: [noDeGatilhoManual({ x: 80, y: 120 })],
  arestas: [],
  origem: "declarado",
});

/**
 * SPEC-110 fatia A — **a cascata não nasce POR CIMA de ninguém.**
 *
 * A posição de um nó novo sempre foi `80 + n*60, 80 + n*40` sobre a CONTAGEM
 * de nós — o que bastava enquanto todo fluxo começava vazio. Com o gatilho já
 * no desenho (D1), o primeiro nó adicionado caía a 60px dele: cartões de 190px
 * empilhados, o de baixo intocável (medido na validação visual, e é o mesmo
 * sintoma que a §0.9 da SPEC anota para os handles na CI). O slot agora anda
 * até achar lugar livre.
 */
function proximaPosicao(nos: NoDoFluxo[]): { x: number; y: number } {
  const ocupado = (p: { x: number; y: number }) =>
    nos.some((no) => Math.abs(no.posicao.x - p.x) < 200 && Math.abs(no.posicao.y - p.y) < 90);
  let n = nos.length;
  let posicao = { x: 80 + n * 60, y: 80 + n * 40 };
  // O teto existe porque um desenho denso pode não ter slot na diagonal — e
  // um laço infinito ao clicar na paleta seria pior que um cartão sobreposto.
  while (ocupado(posicao) && n < nos.length + 40) {
    n++;
    posicao = { x: 80 + n * 60, y: 80 + n * 40 };
  }
  return posicao;
}

export function FluxoScreen({
  timeAtivo,
  onFechar,
  abrirFluxoId,
  demandaAberta,
  aoExecutarComDemanda,
  aoAbrirConfigDosPapeis,
  aoAbrirConfigDaEspecificacao,
  aoAbrirTelaDoStage,
  aoEditarTela,
}: {
  timeAtivo: string;
  onFechar: () => void;
  /** SPEC-107 G4 — abrir já num fluxo específico (a porta da bancada de
   * ensaios chega em `#/fluxo/ensaio` e o canvas mostra a fiação certa). */
  abrirFluxoId?: string;
  /**
   * ~~SPEC-107 G4 — `painel`: um painel sobre o canvas (a bancada de
   * ensaios), montado pelo App.~~ **SPEC-110 fatia B (D4) — a prop saiu.**
   *
   * A bancada deixou de ser um painel ad hoc SOBRE o canvas e virou a TELA
   * `bancada-de-ensaios` DENTRO da fiação do ensaio. Quem a mostra agora é o
   * stage (`#/tela/<execucaoId>`), com a moldura Retornar/Avançar por cima —
   * e o canvas voltou a ser só o canvas.
   */
  /**
   * SPEC-107 G5c — a DEMANDA ABERTA na mesa: quando a fiação tem o nó fonte
   * `demanda`, executar daqui aponta para ela (`parametrosPorNo`, como os
   * atalhos de exportar/publicar/ensaiar) em vez de cair n'"a ativa" do
   * servidor — assistir a esteira rodando é sobre a SUA demanda.
   */
  demandaAberta?: { id: string };
  /**
   * G5c — a fiação pode ESCREVER na demanda (o destino da esteira grava as
   * sugestões). O estado local da mesa não sabe disso — e o autosave gravaria
   * o estado velho POR CIMA (a corrida do §250, agora cliente×servidor).
   * Depois de uma execução que apontou a demanda aberta, o App ressincroniza.
   */
  aoExecutarComDemanda?: () => void;
  /**
   * SPEC-109 C — a porta para o catálogo COMPLETO dos papéis
   * (`#/config/pipeline`): a aba saiu do menu quando a esteira passou a se
   * editar daqui; criar papel contextual e sugerir com IA continuam lá.
   */
  aoAbrirConfigDosPapeis?: () => void;
  /**
   * SPEC-109 D — a porta para o template da especificação
   * (`#/config/especificacao`): a aba saiu do menu; o template é insumo da
   * GERAÇÃO DE ITENS, e a porta vive no nó dela.
   */
  aoAbrirConfigDaEspecificacao?: () => void;
  /**
   * SPEC-110 fatia B — a porta da TELA parada: o canvas diz "aguardando uma
   * tela" e o clique leva ao stage (`#/tela/<execucaoId>`). Quem navega é o
   * App — a FluxoScreen não conhece rotas, como nunca conheceu.
   */
  aoAbrirTelaDoStage?: (execucaoId: string) => void;
  /**
   * SPEC-110 fatia C — a porta para o EDITOR da tela declarada
   * (`#/config/telas/<id>`): a aba não está no menu, e quem a alcança é o nó
   * que a consome (§§388-389).
   */
  aoEditarTela?: (id: string) => void;
}) {
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });
  const podeEditar = permissoes.pode("fluxos", "editar");
  // §369 — editar o PAPEL de dentro do fluxo é editar a esteira: a permissão
  // é a dela, não a de fluxos.
  const podeEditarPapel = permissoes.pode("pipeline-agentes", "editar");

  const [catalogo, setCatalogo] = useState<ConectorDoCatalogo[]>([]);
  const [papeis, setPapeis] = useState<PapelConfigurado[]>([]);
  /**
   * SPEC-110 fatia C — as telas EM VIGOR do time: as do sistema mais as
   * declaradas. Quem monta um fluxo escolhe entre as duas no mesmo lugar —
   * o vocabulário é um só, e o prefixo do refId é que as distingue.
   */
  const [telas, setTelas] = useState<TelaEmVigor[]>(() => telasEmVigor());
  useEffect(() => {
    void apiTelas
      .obter(timeAtivo)
      .then((doc) => setTelas(telasEmVigor(doc)))
      // Sem o documento, as do sistema bastam: o canvas não fica sem telas
      // porque a config do time falhou (§244).
      .catch(() => setTelas(telasEmVigor()));
  }, [timeAtivo]);
  const [fluxos, setFluxos] = useState<FluxoEmVigor[] | null>(null);
  const [fluxoId, setFluxoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [rastro, setRastro] = useState<{
    nos: RastroDoNoExecutado[];
    saidas: Record<string, Record<string, unknown>>;
    hash: string;
    execucaoId?: string;
    /** SPEC-107 fatia C — a execução suspendeu no gate deste nó. */
    aguardandoEm?: string;
    /**
     * SPEC-110 fatia B — a execução parou numa TELA, e o valor é o id da
     * EXECUÇÃO (não do nó): o stage é endereçado por ela, e é isso que a
     * porta "abrir →" precisa carregar. As duas suspensões são distintas de
     * propósito — o gate decide aqui, a tela decide LÁ.
     */
    aguardandoTelaEm?: string;
    /** SPEC-110 B (D2) — a última execução TERMINOU num retornar. */
    retornada?: boolean;
  } | null>(null);
  /** SPEC-107 fatia D — o vivo (§2.4-9): que nó está rodando agora, e o
   * texto que o agente já escreveu, por nó. */
  const [vivo, setVivo] = useState<{ rodando: string | null; textos: Record<string, string> } | null>(null);
  const [selecao, setSelecao] = useState<{ tipo: "no" | "aresta"; id: string } | null>(null);
  const [novoFluxoNome, setNovoFluxoNome] = useState("");
  /** SPEC-109 C — a última corrida de cada papel (§265, herdada do mapa que
   * morreu): "falhou há pouco" continua sendo notícia, agora no painel do nó. */
  const [execucoesPorPapel, setExecucoesPorPapel] = useState<ExecucaoDoPapel[]>([]);
  useEffect(() => {
    void apiIa
      .execucoes()
      .then(({ porPapel }) => setExecucoesPorPapel(porPapel))
      .catch(() => {});
  }, [timeAtivo]);

  useEffect(() => {
    void (async () => {
      try {
        const [vigor, pipeline, emVigor] = await Promise.all([
          apiCatalogoDeConectores.listar(),
          apiPipelineAgentes.obter(timeAtivo),
          // SPEC-106 — o EM VIGOR: os declarados + a esteira DERIVADA dos
          // papéis. Abrir a tela num time novo já mostra o pipeline desenhado.
          apiFluxosEmVigor.listar(timeAtivo),
        ]);
        setCatalogo(vigor.conectores);
        setPapeis(pipeline.papeis ?? []);
        const lidos = emVigor.fluxos;
        // A tela abre NO CANVAS, sempre (referência: n8n) — sem fluxo salvo,
        // nasce um rascunho pronto para receber nós; ele só persiste no Salvar.
        if (lidos.length === 0) {
          setFluxos([FLUXO_VAZIO("fluxo-1", "Fluxo 1")]);
          setFluxoId("fluxo-1");
        } else {
          setFluxos(lidos);
          // G4 — quem chegou pela porta da bancada abre NO fluxo do ensaio;
          // um id que não existe no catálogo cai no primeiro, nunca em branco.
          setFluxoId(abrirFluxoId && lidos.some((f) => f.id === abrirFluxoId) ? abrirFluxoId : lidos[0].id);
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [timeAtivo]);

  // G4 — a porta muda com a tela aberta (#/fluxo → #/fluxo/ensaio): seguir o
  // pedido sem esperar recarga. Só a PORTA re-seleciona; recarregar a lista
  // não pode arrancar a pessoa do fluxo que ela escolheu olhar.
  useEffect(() => {
    if (abrirFluxoId) setFluxoId((atual) => (atual === abrirFluxoId ? atual : abrirFluxoId));
  }, [abrirFluxoId]);

  const fluxo = useMemo(() => fluxos?.find((f) => f.id === fluxoId) ?? null, [fluxos, fluxoId]);
  // Fluxo de fábrica é DERIVADO — editar exige uma cópia (que vence a fábrica
  // no mesmo id), como um conector declarado vence um destino.
  const editavel = podeEditar && fluxo?.origem === "declarado";

  // O ciclo é conferido a cada edição, com a MESMA mensagem do desenho (§4.4).
  const ciclo = useMemo(() => (fluxo ? planoDoFluxo(fluxo).ciclo : undefined), [fluxo]);

  /** SPEC-107 fatia F — a forma declarada de cada lado da aresta, quando há.
   * Agente e transformação não declaram tipos — ausência não é incompatível. */
  const contratoDoNo = useCallback(
    (no: NoDoFluxo) => {
      if (no.tipo === "conector") {
        const conector = catalogo.find((c) => c.id === no.refId);
        return conector ? { entrada: conector.entrada, saida: conector.saida } : null;
      }
      if (no.tipo === "funcao") {
        const funcao = funcaoDoSistema(no.refId);
        return funcao ? { entrada: funcao.entrada, saida: funcao.saida } : null;
      }
      // SPEC-110 fatia F — o contrato é do COMPONENTE escolhido. É por aqui
      // que o painel de mapeamento oferece campos: com o contrato fundido, um
      // nó de leitura oferecia "gravar o link publicado", e um de escrita
      // oferecia emitir o documento — pares que a execução nunca honraria.
      if (no.tipo === "projeto") {
        const dado = dadoDoSistema(no.refId);
        return dado ? { entrada: dado.entrada, saida: dado.saida } : { entrada: PROJETO_DO_SISTEMA.entrada, saida: PROJETO_DO_SISTEMA.saida };
      }
      // SPEC-110 A — o gatilho declara a saída dele (vazia no manual; o
      // webhook da fatia L emite o payload): entrada ele não tem, é o começo.
      if (no.tipo === "gatilho") {
        const gatilho = gatilhoDoSistema(no.refId);
        return gatilho ? { entrada: [], saida: gatilho.saida } : null;
      }
      // SPEC-110 B — a tela declara os dois lados: o que ela mostra e o que a
      // decisão devolve. É o que faz o aviso de tipo funcionar nela também.
      if (no.tipo === "tela") {
        const tela = telas.find((t) => t.refId === no.refId);
        return tela ? { entrada: tela.entrada, saida: tela.saida } : null;
      }
      return null;
    },
    [catalogo]
  );
  const avisosDoMapeamento = useMemo(
    () => (fluxo ? avisosDeMapeamento(fluxo, contratoDoNo) : []),
    [fluxo, contratoDoNo]
  );

  /** Fatia F — as chaves de saída com semântica de DOCUMENTO deste nó: é o
   * que o rastro renderiza como texto corrido (preview), não como JSON. */
  const chavesDeDocumento = useCallback(
    (n: { tipo: string; refId: string }): string[] =>
      (contratoDoNo(n as NoDoFluxo)?.saida ?? []).filter((c) => c.tipo === "documento").map((c) => c.chave),
    [contratoDoNo]
  );

  function mudarFluxo(mudar: (f: FluxoEmVigor) => FluxoEmVigor, opcoes?: { manterRastro?: boolean }) {
    if (!fluxoId) return;
    setFluxos((lista) => (lista ?? []).map((f) => (f.id === fluxoId ? mudar(f) : f)));
    // Editar a FIAÇÃO invalida o rastro (ele descreve outra forma). Arrastar
    // um nó não: a posição é layout, e apagar a execução que a pessoa está
    // lendo porque ela arrumou o desenho seria punir o gesto errado.
    if (!opcoes?.manterRastro) setRastro(null);
  }

  /** SPEC-109 fatia A — só os DECLARADOS persistem, e sem os selos de leitura
   * (`origem`, `sombreiaFabrica`): selo gravado viraria dado mentiroso no
   * documento. Uma função porque eram três cópias do mesmo filtro. */
  const declaradosParaSalvar = (lista: FluxoEmVigor[]): Fluxo[] =>
    lista.filter((f) => f.origem === "declarado").map(({ origem: _origem, sombreiaFabrica: _selo, ...f }) => f);

  /**
   * SPEC-109 fatia A — **a volta da fábrica.** Apaga a cópia declarada que
   * sombreia a derivada e recarrega o catálogo: a fábrica volta a valer na
   * hora, na forma ATUAL dela (foi assim que uma esteira pré-G5 ficou meses
   * congelada — "editar uma cópia" era porta sem volta).
   */
  async function voltarADerivada() {
    if (!fluxos || !fluxoId) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFluxos.salvar({ fluxos: declaradosParaSalvar(fluxos.filter((f) => f.id !== fluxoId)) }, timeAtivo);
      const emVigor = await apiFluxosEmVigor.listar(timeAtivo);
      setFluxos(emVigor.fluxos);
      setSelecao(null);
      setRastro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const rotuloDoRef = useCallback(
    (no: Pick<NoDoFluxo, "tipo" | "refId" | "componente" | "nome">) => {
      // SPEC-109 B — o nome que a PESSOA deu ao nó vence qualquer derivado:
      // o cartão ecoa o que ela escreveu, como tudo na casa.
      if (no.nome?.trim()) return no.nome.trim();
      // SPEC-110 A — o gatilho diz o GESTO que o dispara, não o tipo. No
      // CARTÃO vai o rótulo curto: a frase inteira estica o cartão e esconde
      // o vizinho (medido na validação visual desta fatia).
      if (no.tipo === "gatilho") return gatilhoDoSistema(no.refId)?.rotuloCurto ?? no.refId;
      // SPEC-110 B — a tela, pela mesma régua do rótulo curto.
      if (no.tipo === "tela") return telas.find((t) => t.refId === no.refId)?.rotuloCurto ?? no.refId;
      if (!no.refId)
        return no.componente && no.componente !== "livre"
          ? NOME_DA_OPERACAO[no.componente]
          : no.tipo === "agente"
            ? "(escolha o papel)"
            : "(escolha a integração)";
      if (no.tipo === "funcao") return funcaoDoSistema(no.refId)?.nome ?? no.refId;
      // SPEC-110 fatia F — o cartão diz a DIREÇÃO. Era aqui que a queixa M9
      // nascia: dois nós idênticos chamados "Mesa de projeto", um lendo e
      // outro gravando, e a única forma de saber qual era qual era seguir a
      // aresta com o dedo. O legado mantém o nome antigo — ele É o antigo.
      if (no.tipo === "projeto") return dadoDoSistema(no.refId)?.rotuloCurto ?? PROJETO_DO_SISTEMA.nome;
      if (no.tipo === "transformacao") {
        // O cartão diz O QUE ela produz — as chaves de saída declaradas.
        const campos = sanearCamposDaTransformacao((no as NoDoFluxo).parametros?.campos);
        return campos.length > 0 ? campos.map((c) => c.chave).join(", ") : "(declare os campos)";
      }
      return no.tipo === "conector"
        ? (catalogo.find((c) => c.id === no.refId)?.nome ?? no.refId)
        : (papeis.find((p) => p.id === no.refId)?.nome ?? no.refId);
    },
    [catalogo, papeis]
  );

  /**
   * SPEC-109 fatia A — **o grafo devolve o arrasto.** Antes, `nodes` era um
   * `useMemo` puro sobre o fluxo e não havia `onNodesChange`: durante o
   * arrasto nenhuma mudança de posição era aplicada — o nó ficava parado sob
   * o mouse e teleportava no `onNodeDragStop` (queixa literal: "não consigo
   * mover e arrastar com a mesma fluidez" da mesa, que sempre aplicou as
   * mudanças). Estado local + `applyNodeChanges` é o par que o React Flow
   * controlado exige; o fluxo continua dono da VERDADE das posições — o
   * efeito re-deriva a cada mudança dele, e o dragStop escreve de volta.
   */
  const [nodes, setNodes] = useState<Node<NodeCardData>[]>([]);
  useEffect(() => {
    setNodes(
      (fluxo?.nos ?? []).map((no) => ({
        id: no.id,
        type: "noDeFluxo",
        position: no.posicao,
        // O tamanho INICIAL (o do cartão em repouso): é o que o `fitView`
        // usa se rodar antes de o ResizeObserver medir — sem isso, sob carga,
        // o enquadramento calculado sobre nós de tamanho zero mandava o
        // viewport para o nada (canvas e minimapa vazios; flake medido).
        initialWidth: 190,
        initialHeight: 76,
        selected: selecao?.tipo === "no" && selecao.id === no.id,
        // O vivo é feedback: o nó que está rodando PULSA (§2.4-9).
        ...(vivo?.rodando === no.id ? { className: "no-do-fluxo-rodando" } : {}),
        data: {
          no: comoNoDaMesa(no, rotuloDoRef(no)),
          config: CONFIG_DO_FLUXO,
          arestas: [],
        } satisfies NodeCardData,
      }))
    );
  }, [fluxo, selecao, rotuloDoRef, vivo?.rodando]);
  const aoMudarNos = useCallback(
    (mudancas: NodeChange<Node<NodeCardData>>[]) => setNodes((atuais) => applyNodeChanges(mudancas, atuais)),
    []
  );

  const edges: Edge[] = useMemo(
    () =>
      (fluxo?.arestas ?? []).map((a) => ({
        id: `${a.de}->${a.para}`,
        source: a.de,
        target: a.para,
        // O NodeCard tem quatro pontos por lado; a fiação continua lendo da
        // esquerda para a direita, como sempre foi.
        sourceHandle: "source-right",
        targetHandle: "target-left",
        selected: selecao?.tipo === "aresta" && selecao.id === `${a.de}->${a.para}`,
        // A aresta que ALIMENTA o nó rodando anima o dado passando (§2.4-9).
        animated: vivo?.rodando === a.para,
        // Aresta sem mapeamento é decoração — e a tela diz isso na etiqueta.
        // SPEC-110 A — MENOS a que sai do gatilho: o gatilho manual não emite
        // dado (D1), então "sem mapeamento" ali seria acusação falsa. Ela não
        // é decoração: é o DISPARO, e a etiqueta diz isso.
        label:
          a.mapeamento.length > 0
            ? a.mapeamento.map((m) => `${m.saida}→${m.entrada}`).join(", ")
            : fluxo?.nos.find((n) => n.id === a.de)?.tipo === "gatilho"
              ? "dispara"
              : "sem mapeamento",
        style: { stroke: "var(--texto-mudo)" },
        labelStyle: { fill: "var(--texto-2)", fontSize: 10 },
        labelBgStyle: { fill: "var(--painel)" },
      })),
    [fluxo, selecao, vivo?.rodando]
  );

  /**
   * §368 — a paleta fala a língua da MESA: componentes (o tipo abstrato) e
   * adaptadores (o endereço/papel concreto, escolhido nas propriedades). O nó
   * nasce do componente; quando só existe UM adaptador compatível, ele já vem
   * escolhido — quando há vários (ou nenhum), o painel pede.
   *
   * SPEC-109 fatia B — a paleta COLAPSOU por família: um botão por operação
   * do gateway era a paleta falando por instância ("+ Envio de itens"…),
   * exatamente o que o §368 prometeu não fazer. "+ Integração externa"
   * (componente ausente) abre o catálogo INTEIRO no painel — a operação é do
   * conector escolhido, não do botão.
   */
  function adicionarComponente(tipo: NoDoFluxo["tipo"], componente?: OperacaoDoGateway | "livre" | "agente") {
    const compativeis =
      tipo === "agente"
        ? papeis.filter((p) => p.ativo).map((p) => p.id)
        : catalogo
            .filter((c) => (componente === undefined ? true : componente === "livre" ? !c.operacao : c.operacao === componente))
            .map((c) => c.id);
    const refId = compativeis.length === 1 ? compativeis[0] : "";
    const base =
      componente === "agente" ? "agente" : componente === undefined ? "integracao" : componente === "livre" ? "chamada" : componente;
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${base}-${n}`)) n++;
      const id = `${base}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          {
            id,
            tipo,
            refId,
            posicao: proximaPosicao(f.nos),
            parametros: {},
            ...(tipo === "conector" && componente !== undefined && componente !== "agente" ? { componente } : {}),
          },
        ],
      };
    });
  }

  /**
   * SPEC-107 fatia A — a FUNÇÃO entra pela paleta como os componentes, mas o
   * nó já nasce com o `refId`: o registro é fechado e a função É a capacidade
   * — não há adaptador a escolher (§2.4-10: escolha só quando há escolha).
   */
  function adicionarFuncao(funcaoId: string) {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${funcaoId}-${n}`)) n++;
      const id = `${funcaoId}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "funcao", refId: funcaoId, posicao: proximaPosicao(f.nos), parametros: {} },
        ],
      };
    });
  }

  /** SPEC-107 fatia E — a transformação nasce vazia e o Salvar cobra os
   * campos (a mesma régua do nó sem adaptador): declarar o que sai é o que a
   * torna uma transformação. */
  function adicionarTransformacao() {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `transformacao-${n}`)) n++;
      const id = `transformacao-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "transformacao", refId: "transformacao", posicao: proximaPosicao(f.nos), parametros: { campos: [] } },
        ],
      };
    });
  }

  /**
   * SPEC-110 fatia A — o gatilho nasce MANUAL: é o disparo que sempre
   * existiu (o botão), agora com nome e lugar no desenho. O id preferido é o
   * estável (`gatilho`, o mesmo das fábricas); só ganha sufixo se já houver um
   * nó com esse id — e a validação de escrita recusa o SEGUNDO gatilho, para
   * a pergunta "qual vale?" não existir (D1).
   */
  function adicionarGatilho() {
    mudarFluxo((f) => {
      let id = ID_DO_NO_DE_GATILHO;
      let n = 1;
      while (f.nos.some((no) => no.id === id)) id = `${ID_DO_NO_DE_GATILHO}-${++n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "gatilho", refId: "manual", posicao: proximaPosicao(f.nos), parametros: {} },
        ],
      };
    });
  }

  /**
   * SPEC-110 fatia B — a TELA entra como a função: o registro é fechado e a
   * tela É a capacidade, então o nó já nasce com o `refId` (§2.4-10).
   */
  function adicionarTela(refId: string, telaId: string) {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${telaId}-${n}`)) n++;
      const id = `${telaId}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        // O `refId` é o da tela EM VIGOR (`mesa` ou `tela:aprovacao`); o id do
        // NÓ usa só o id curto, para o cartão não virar um endereço.
        nos: [...f.nos, { id, tipo: "tela", refId, posicao: proximaPosicao(f.nos), parametros: {} }],
      };
    });
  }

  /**
   * SPEC-107 fatia B / SPEC-110 fatia F — o nó de dados nasce pronto E com a
   * DIREÇÃO escolhida. A paleta pergunta o que a pessoa quer fazer (ler ou
   * gravar) em vez de entregar um nó ambíguo que ela descobre depois pela
   * fiação. A demanda continua sendo o parâmetro `demandaId` (vazio = a ativa).
   */
  function adicionarDado(refId: string) {
    mudarFluxo((f) => {
      const prefixo = refId === REF_DA_DEMANDA_GRAVAR ? "grava" : refId === REF_DA_DEMANDA_LER ? "demanda" : "projeto";
      let n = 1;
      while (f.nos.some((no) => no.id === `${prefixo}-${n}`)) n++;
      const id = `${prefixo}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [...f.nos, { id, tipo: "projeto", refId, posicao: proximaPosicao(f.nos), parametros: {} }],
      };
    });
  }

  /**
   * §369 — o mesmo dado, editado de onde se vê (a régua do §260): o painel do
   * nó-agente grava NO documento da esteira (`pipeline-agentes`), por
   * read-modify-write do papel — a aba Pipeline de IA continua sendo o
   * catálogo, e as duas superfícies leem a mesma verdade.
   */
  async function salvarPapel(refId: string, mudanca: { nome: string; descricao: string; preambulo: string }) {
    setErro(null);
    try {
      const cfg = await apiPipelineAgentes.obter(timeAtivo);
      const papeisNovos = (cfg.papeis ?? []).map((p) =>
        p.id === refId
          ? {
              ...p,
              nome: mudanca.nome.trim() || p.nome,
              descricao: mudanca.descricao.trim() || undefined,
              preambulo: mudanca.preambulo.trim() || undefined,
            }
          : p
      );
      await apiPipelineAgentes.salvar({ ...cfg, papeis: papeisNovos }, timeAtivo);
      setPapeis(papeisNovos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * SPEC-109 C — ligar/desligar e reordenar papéis, herdados do mapa do
   * sistema que morreu (§260: editar de onde se vê o problema). O mesmo RMW
   * do `salvarPapel` — e depois a lista de fluxos RECARREGA, porque a esteira
   * derivada muda de forma na hora (um papel desligado sai da cadeia).
   */
  async function mudarEsteira(mudar: (papeis: PapelConfigurado[]) => PapelConfigurado[]) {
    setErro(null);
    try {
      const cfg = await apiPipelineAgentes.obter(timeAtivo);
      const papeisNovos = mudar(cfg.papeis ?? []);
      await apiPipelineAgentes.salvar({ ...cfg, papeis: papeisNovos }, timeAtivo);
      setPapeis(papeisNovos);
      const emVigor = await apiFluxosEmVigor.listar(timeAtivo);
      setFluxos(emVigor.fluxos);
      setRastro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function salvar() {
    if (!fluxos) return;
    setSalvando(true);
    setErro(null);
    try {
      // Só os DECLARADOS persistem: a esteira derivada continua nascendo da
      // configuração dos papéis — salvar uma cópia dela congelaria o desenho.
      await apiFluxos.salvar({ fluxos: declaradosParaSalvar(fluxos) }, timeAtivo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * SPEC-107 fatia C — o gate sobrevive a F5 e a outra máquina: ao abrir um
   * fluxo, a execução SUSPENSA mais recente reaparece com o stage persistido,
   * esperando quem revisa continuar ou descartar.
   */
  useEffect(() => {
    if (!fluxoId || fluxoId === "fluxo-1") return;
    void apiExecucaoDeFluxo
      .execucoes(fluxoId)
      .then(({ execucoes }) => {
        const pendente = execucoes[0];
        // SPEC-110 fatia B — a execução parada numa TELA também reaparece: é
        // o mesmo dado persistido, e a porta ("abrir →") é o que a distingue
        // do gate (que decide ali mesmo, com continuar/descartar).
        if (pendente?.estado === "aguardando-tela") {
          setRastro({
            nos: pendente.nos,
            saidas: pendente.saidas ?? {},
            hash: pendente.hash,
            execucaoId: pendente.id,
            aguardandoTelaEm: pendente.id,
          });
          return;
        }
        // O retornado não some da tela: quem decidiu retornar (ou quem chega
        // depois) precisa ver que a execução acabou ali, e por quê (D2).
        if (pendente?.estado === "retornada") {
          setRastro({ nos: pendente.nos, saidas: {}, hash: pendente.hash, execucaoId: pendente.id, retornada: true });
          return;
        }
        if (pendente?.estado !== "aguardando-confirmacao") return;
        const gate = [...pendente.nos].reverse().find((n) => n.estado === "sucesso");
        setRastro({
          nos: pendente.nos,
          saidas: pendente.saidas ?? {},
          hash: pendente.hash,
          execucaoId: pendente.id,
          aguardandoEm: gate?.noId,
        });
      })
      .catch(() => undefined);
  }, [fluxoId]);

  /** SPEC-107 fatia D — o que cada evento do stream faz na tela: o nó que
   * começou pulsa, o texto do agente cresce, o que terminou entra no rastro. */
  const aoEvento = useCallback((evento: EventoDaExecucao) => {
    if (evento.tipo === "no-comecou") {
      setVivo((v) => ({ rodando: evento.noId, textos: v?.textos ?? {} }));
    } else if (evento.tipo === "texto") {
      setVivo((v) => ({
        rodando: v?.rodando ?? evento.noId,
        textos: { ...(v?.textos ?? {}), [evento.noId]: `${v?.textos?.[evento.noId] ?? ""}${evento.pedaco}` },
      }));
    } else if (evento.tipo === "no-terminou") {
      setVivo((v) => ({ rodando: null, textos: v?.textos ?? {} }));
      setRastro((r) => ({
        nos: [...(r?.nos ?? []), evento.rastro],
        saidas: r?.saidas ?? {},
        hash: r?.hash ?? "",
        execucaoId: r?.execucaoId,
      }));
    }
  }, []);

  async function continuarExecucao() {
    if (!rastro?.execucaoId) return;
    setExecutando(true);
    setErro(null);
    try {
      const resultado = await apiExecucaoDeFluxo.continuarAoVivo(rastro.execucaoId, aoEvento);
      setRastro({
        nos: resultado.nos,
        saidas: resultado.saidas,
        hash: resultado.hash,
        execucaoId: resultado.execucaoId,
        aguardandoEm: resultado.aguardandoEm,
        // SPEC-110 fatia B — a execução pode ter parado numa TELA: a porta
        // "abrir →" aparece no rastro, e quem revisa decide LÁ.
        ...(resultado.aguardandoTela ? { aguardandoTelaEm: resultado.execucaoId } : {}),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
      setVivo(null);
    }
  }

  async function descartarExecucao() {
    if (!rastro?.execucaoId) return;
    setErro(null);
    try {
      await apiExecucaoDeFluxo.descartar(rastro.execucaoId);
      setRastro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function executar(ateNo?: string) {
    if (!fluxo) return;
    setExecutando(true);
    setErro(null);
    setRastro(null);
    try {
      // O que roda é o que está SALVO — executar rascunho seria rastro
      // mentindo. Só os DECLARADOS, como no Salvar: gravar a esteira derivada
      // junto a congelaria como cópia que ninguém pediu (§365) — defeito real,
      // pego pela corrida de dois specs no mesmo documento (SPEC-107 fatia A).
      await apiFluxos.salvar({ fluxos: declaradosParaSalvar(fluxos!) }, timeAtivo);
      // Fatia D — a execução é ASSISTÍVEL: os eventos chegam nó a nó e a
      // resposta final é a mesma do modo one-shot. G5c — com a demanda aberta
      // e o nó fonte `demanda` na fiação, a execução aponta para ELA.
      const daDemanda =
        demandaAberta && fluxo.nos.some((n) => n.tipo === "projeto" && n.id === "demanda")
          ? { demanda: { demandaId: demandaAberta.id } }
          : undefined;
      const resultado = await apiExecucaoDeFluxo.executarAoVivo(fluxo.id, timeAtivo, ateNo, aoEvento, daDemanda);
      setRastro({
        nos: resultado.nos,
        saidas: resultado.saidas,
        hash: resultado.hash,
        execucaoId: resultado.execucaoId,
        aguardandoEm: resultado.aguardandoEm,
        // SPEC-110 fatia B — a execução pode ter parado numa TELA: a porta
        // "abrir →" aparece no rastro, e quem revisa decide LÁ.
        ...(resultado.aguardandoTela ? { aguardandoTelaEm: resultado.execucaoId } : {}),
      });
      // A fiação pode ter GRAVADO na demanda aberta (o destino da esteira):
      // ressincronizar o estado da mesa ANTES que um autosave grave o velho
      // por cima (medido de verdade: o banco esvaziava ao voltar à mesa).
      if (daDemanda) aoExecutarComDemanda?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
      setVivo(null);
    }
  }

  const noSelecionado = selecao?.tipo === "no" ? (fluxo?.nos.find((n) => n.id === selecao.id) ?? null) : null;
  const arestaSelecionada =
    selecao?.tipo === "aresta" ? (fluxo?.arestas.find((a) => `${a.de}->${a.para}` === selecao.id) ?? null) : null;

  if (!fluxos) {
    return (
      <div data-testid="fluxo-screen" style={telaEstilo}>
        <div style={{ padding: 24 }}>{erro ?? "carregando…"}</div>
      </div>
    );
  }

  return (
    <div data-testid="fluxo-screen" style={telaEstilo}>
      {/* SPEC-110 fatia B (D4) — o painel ad hoc da bancada saiu daqui: ela
          virou a TELA no meio da fiação, e o canvas voltou a ser só o canvas. */}
      <header style={cabecalhoEstilo}>
        <strong style={{ fontSize: 14 }}>Fluxos de integração</strong>
        <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
          o encanamento da ferramenta — não o desenho do seu sistema · time: {timeAtivo}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botao, background: "var(--acento-gente)", color: "#fff", border: "1px solid var(--acento-gente)" }}>
          Voltar à mesa de projeto
        </button>
      </header>

      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid var(--borda)", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          Fluxo
          <select
            value={fluxoId ?? ""}
            onChange={(e) => {
              // Re-selecionar o MESMO fluxo não é troca: zerar o rastro aqui
              // apagava o gate recém-carregado do servidor (fatia C).
              if (e.target.value === fluxoId) return;
              setFluxoId(e.target.value || null);
              setSelecao(null);
              setRastro(null);
            }}
            data-testid="seletor-de-fluxo"
            style={campo}
          >
            {fluxos.length === 0 && <option value="">— nenhum ainda —</option>}
            {fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.origem === "fabrica" ? " · derivado" : ""}
              </option>
            ))}
          </select>
        </label>
        {podeEditar && (
          <>
            <input
              value={novoFluxoNome}
              onChange={(e) => setNovoFluxoNome(e.target.value)}
              placeholder="nome do fluxo novo"
              aria-label="Nome do fluxo novo"
              style={campo}
            />
            <button
              data-testid="criar-fluxo"
              disabled={!novoFluxoNome.trim()}
              onClick={() => {
                const nome = novoFluxoNome.trim();
                const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `fluxo-${fluxos.length + 1}`;
                if (fluxos.some((f) => f.id === id)) {
                  setErro(`já existe um fluxo com o id "${id}"`);
                  return;
                }
                setFluxos([...fluxos, FLUXO_VAZIO(id, nome)]);
                setFluxoId(id);
                setNovoFluxoNome("");
              }}
              style={botao}
            >
              + Novo fluxo
            </button>
            <span style={{ width: 12 }} />
            {/* SPEC-109 fatia B — a paleta fala por FAMÍLIA (integração
                externa → agente → …): um botão por operação era instância
                fantasiada de componente. A integração concreta (envio,
                publicação, ADR, leitor, chamada livre) se escolhe no painel,
                pelo catálogo — o hexagonal da casa, na tela. */}
            {/* SPEC-110 fatia A — o GATILHO abre a paleta porque ele abre o
                fluxo: a primeira pergunta de quem monta uma automação é
                "quando isso roda?". */}
            <button
              data-testid="add-gatilho"
              // Um fluxo diz UMA vez quando roda (D1): com o gatilho já no
              // desenho, o botão desliga com o motivo — deixar clicar para a
              // validação recusar no Salvar seria ensinar um gesto que não vale.
              disabled={!editavel || (fluxo?.nos ?? []).some((n) => n.tipo === "gatilho")}
              title={
                (fluxo?.nos ?? []).some((n) => n.tipo === "gatilho")
                  ? "este fluxo já tem um gatilho — um fluxo diz UMA vez quando roda"
                  : undefined
              }
              onClick={adicionarGatilho}
              style={botao}
            >
              + Gatilho
            </button>
            <button data-testid="add-integracao" disabled={!editavel} onClick={() => adicionarComponente("conector")} style={botao}>
              + Integração externa
            </button>
            <button data-testid="add-agente" disabled={!editavel} onClick={() => adicionarComponente("agente", "agente")} style={botao}>
              + Agente
            </button>
            {/* SPEC-107 fatia A — as funções do SISTEMA na paleta: o motor com
                contrato declarado, pelo registro fechado (rótulo genérico,
                §2.3 — "engine"/"derivar" não aparecem na tela). */}
            {FUNCOES_DO_SISTEMA.map((f) => (
              <button key={f.id} data-testid={`add-funcao-${f.id}`} disabled={!editavel} onClick={() => adicionarFuncao(f.id)} style={botao}>
                + {f.nome}
              </button>
            ))}
            {/* SPEC-107 fatia B / SPEC-110 F — a demanda como capacidade, com
                a direção NA PALETA: dois botões, dois componentes. O legado
                "Mesa de projeto" não é mais oferecido — ele existe para fluxos
                salvos, não para desenhos novos. */}
            {DADOS_DO_SISTEMA.map((d) => (
              // Na PALETA vai o nome inteiro ("Demanda — ler"): fora do
              // cartão não há cabeçalho de família para completar a frase, e
              // um botão "+ Ler" no meio de "+ Agente" não diz ler o quê.
              <button key={d.id} data-testid={`add-${d.id}`} disabled={!editavel} onClick={() => adicionarDado(d.id)} style={botao}>
                + {d.nome}
              </button>
            ))}
            {/* SPEC-107 fatia E — a transformação pura (o Set do n8n). */}
            <button data-testid="add-transformacao" disabled={!editavel} onClick={adicionarTransformacao} style={botao}>
              + Transformação
            </button>
            {/* SPEC-110 fatia B — a TELA: onde a pessoa entra no fluxo. Uma
                por botão como as funções (o registro é fechado e a tela É a
                capacidade — não há adaptador a escolher, §2.4-10). */}
            {telas.map((t) => (
              <button key={t.refId} data-testid={`add-tela-${t.id}`} disabled={!editavel} onClick={() => adicionarTela(t.refId, t.id)} style={botao}>
                + {t.rotuloCurto}
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        <button data-testid="salvar-fluxos" onClick={() => void salvar()} disabled={!podeEditar || salvando} style={botao}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          data-testid="executar-fluxo"
          onClick={() => void executar(undefined)}
          disabled={!fluxo || !!ciclo || executando || !podeEditar}
          style={{ ...botao, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
        >
          {/* SPEC-110 fatia A — o botão vira o GESTO do gatilho manual: a
              queixa era "não entendi qual o objetivo do botão executar", e o
              objetivo só fica legível quando o desenho diz quando o fluxo
              roda. O testid segue `executar-fluxo` (dezenas de E2Es o usam) —
              o que muda é a frase, não o contrato da tela. */}
          {executando ? "Rodando…" : "▶ Rodar agora"}
        </button>
      </div>

      {fluxo?.origem === "declarado" && fluxo.sombreiaFabrica && (
        <div data-testid="fluxo-sombreando" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          Esta é uma CÓPIA salva — a derivada da configuração continua evoluindo por baixo, e a cópia a esconde.{" "}
          <button data-testid="voltar-a-derivada" onClick={() => void voltarADerivada()} disabled={!podeEditar || salvando} style={{ ...botaoMiudo, pointerEvents: "auto" }}>
            voltar à derivada
          </button>{" "}
          apaga a cópia; a derivada volta a valer na hora, na forma atual dela.
        </div>
      )}
      {fluxo?.origem === "fabrica" && (
        <div data-testid="fluxo-derivado" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          Este fluxo é DERIVADO da configuração ({fluxo.id === "esteira-de-agentes" ? "os papéis da esteira, na ordem deles" : "da configuração"}) —
          mudar lá muda aqui sozinho. Para fiar por conta própria,{" "}
          <button
            data-testid="editar-copia"
            onClick={() =>
              mudarFluxo((f) => ({
                ...(f as FluxoEmVigor),
                origem: "declarado",
                // A cópia nasce sabendo que sombreia (SPEC-109 A): sem o selo
                // local, o aviso com o caminho de volta só apareceria depois
                // de salvar e recarregar — a janela exata em que a pessoa se
                // perde.
                sombreiaFabrica: true,
                nome: f.nome.replace(" (da configuração)", " (cópia)"),
              }))
            }
            style={{ ...botaoMiudo, pointerEvents: "auto" }}
          >
            editar uma cópia
          </button>{" "}
          — a cópia vence a derivada no mesmo id.
          {/* SPEC-109 C — a volta de quem desligou um papel: o nó desligado
              SOME da derivada, então religar precisa de uma porta que não
              dependa de clicar nele. */}
          {aoAbrirConfigDosPapeis && fluxo.id === "esteira-de-agentes" && (
            <>
              {" "}
              <button data-testid="abrir-config-dos-papeis-banner" onClick={aoAbrirConfigDosPapeis} style={{ ...botaoMiudo, pointerEvents: "auto" }}>
                configuração dos papéis →
              </button>
            </>
          )}
        </div>
      )}
      {/* SPEC-110 fatia A (D8) — gatilho NÃO é obrigatório: fluxo salvo antes
          desta fatia continua rodando pelo botão, sem migração de dado. Mas a
          tela sugere, porque um fluxo que não diz quando roda é justamente o
          desenho incompleto que a queixa apontou. */}
      {fluxo && fluxo.nos.length > 0 && !fluxo.nos.some((n) => n.tipo === "gatilho") && (
        <div data-testid="fluxo-sem-gatilho" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          Este fluxo não diz <strong>quando roda</strong> — ele funciona pelo “▶ Rodar agora”, mas adicionar um{" "}
          <strong>Gatilho</strong> pela paleta deixa isso escrito no desenho.
        </div>
      )}
      {ciclo && (
        <div data-testid="aviso-de-ciclo" style={avisoEstilo}>
          Não é possível executar ainda — {mensagemDeCiclo(ciclo)}
        </div>
      )}
      {/* SPEC-107 fatia F — AVISO, não bloqueio (§230: bloquear cedo ensina a
          ignorar a cor): o tipo declarado dos dois lados não combina, e quem
          fia decide sabendo. */}
      {avisosDoMapeamento.length > 0 && (
        <div data-testid="aviso-de-mapeamento" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          ⚠ Mapeamento com tipos que não combinam (a execução continua possível):{" "}
          {avisosDoMapeamento.map((a) => a.texto).join(" · ")}
        </div>
      )}
      {erro && (
        <div data-testid="erro-do-fluxo" style={avisoEstilo}>
          {erro}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {fluxo && fluxo.nos.length === 0 && (
            <div style={dicaVaziaEstilo}>
              Comece pelo <strong>gatilho</strong> (quando este fluxo roda) e ligue-o a uma{" "}
              <strong>integração externa</strong> ou a um <strong>agente</strong> — a aresta carrega o dado
              (saída → entrada), como no n8n.
            </div>
          )}
          {fluxo ? (
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={TIPOS_DE_NO}
                onNodeClick={(_e, node) => setSelecao({ tipo: "no", id: node.id })}
                onEdgeClick={(_e, edge) => setSelecao({ tipo: "aresta", id: edge.id })}
                onPaneClick={() => setSelecao(null)}
                onNodesChange={aoMudarNos}
                onNodeDragStop={(_e, node) =>
                  // A posição escreve de volta no fluxo — no derivado também:
                  // lá ela vive só na sessão (Salvar/Executar filtram os
                  // declarados), mas sem o write-back o próximo re-render
                  // devolveria o nó ao lugar antigo debaixo do mouse.
                  mudarFluxo(
                    (f) => ({
                      ...f,
                      nos: f.nos.map((no) => (no.id === node.id ? { ...no, posicao: { x: node.position.x, y: node.position.y } } : no)),
                    }),
                    { manterRastro: true }
                  )
                }
                nodesDraggable={podeEditar}
                nodesConnectable={editavel}
                onConnect={(conexao) => {
                  if (!conexao.source || !conexao.target || !editavel) return;
                  mudarFluxo((f) =>
                    f.arestas.some((a) => a.de === conexao.source && a.para === conexao.target)
                      ? f
                      : { ...f, arestas: [...f.arestas, { de: conexao.source!, para: conexao.target!, mapeamento: [] }] }
                  );
                  setSelecao({ tipo: "aresta", id: `${conexao.source}->${conexao.target}` });
                }}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                {/* As mesmas cores do canvas da mesa: os dois grafos são
                    superfícies diferentes, mas a casa é uma — e o bgColor é o
                    que impede o minimapa de ficar um retângulo branco no
                    tema escuro (a lição do §351 da mesa, repetida aqui). */}
                <Background color="var(--borda)" gap={26} size={1.4} />
                <Controls />
                <MiniMap
                  pannable
                  zoomable
                  bgColor="var(--painel)"
                  maskColor="var(--mascara-minimapa)"
                  nodeColor="var(--texto-mudo)"
                />
              </ReactFlow>
            </ReactFlowProvider>
          ) : null}
        </div>

        {(noSelecionado || arestaSelecionada || rastro || vivo?.rodando) && (
          <aside style={painelEstilo}>
            {noSelecionado && (
              <PainelDoNo
                no={noSelecionado}
                catalogo={catalogo}
                papeis={papeis}
                telas={telas}
                aoEditarTela={aoEditarTela}
                podeEditar={editavel}
                podeEditarPapel={podeEditarPapel}
                onSalvarPapel={salvarPapel}
                aoAbrirConfigDaEspecificacao={aoAbrirConfigDaEspecificacao}
                // SPEC-109 C — o lugar do papel NA ESTEIRA (herdado do mapa
                // que morreu): ligar/desligar, ordem e a última corrida.
                esteira={
                  noSelecionado.tipo === "agente" && papeis.some((p) => p.id === noSelecionado.refId)
                    ? {
                        papel: papeis.find((p) => p.id === noSelecionado.refId)!,
                        posicao: papeis.findIndex((p) => p.id === noSelecionado.refId),
                        total: papeis.length,
                        execucao: execucoesPorPapel.find((e) => e.papel === noSelecionado.refId),
                        podeEditar: podeEditarPapel,
                        onAlternar: () =>
                          void mudarEsteira((ps) =>
                            ps.map((p) => (p.id === noSelecionado.refId ? { ...p, ativo: !p.ativo } : p))
                          ),
                        onMover: (direcao: -1 | 1) =>
                          void mudarEsteira((ps) => {
                            const de = ps.findIndex((p) => p.id === noSelecionado.refId);
                            const para = de + direcao;
                            if (de < 0 || para < 0 || para >= ps.length) return ps;
                            const novos = [...ps];
                            [novos[de], novos[para]] = [novos[para], novos[de]];
                            return novos;
                          }),
                        aoAbrirConfig: aoAbrirConfigDosPapeis,
                      }
                    : undefined
                }
                onMudar={(mudanca) =>
                  mudarFluxo((f) => ({ ...f, nos: f.nos.map((n) => (n.id === noSelecionado.id ? { ...n, ...mudanca } : n)) }))
                }
                onRemover={() =>
                  mudarFluxo((f) => ({
                    ...f,
                    nos: f.nos.filter((n) => n.id !== noSelecionado.id),
                    arestas: f.arestas.filter((a) => a.de !== noSelecionado.id && a.para !== noSelecionado.id),
                  }))
                }
              />
            )}
            {arestaSelecionada && fluxo && (
              <PainelDaAresta
                aresta={arestaSelecionada}
                fluxo={fluxo}
                catalogo={catalogo}
                podeEditar={editavel}
                onMudar={(mapeamento) =>
                  mudarFluxo((f) => ({
                    ...f,
                    arestas: f.arestas.map((a) =>
                      a.de === arestaSelecionada.de && a.para === arestaSelecionada.para ? { ...a, mapeamento } : a
                    ),
                  }))
                }
                onRemover={() =>
                  mudarFluxo((f) => ({
                    ...f,
                    arestas: f.arestas.filter((a) => !(a.de === arestaSelecionada.de && a.para === arestaSelecionada.para)),
                  }))
                }
              />
            )}
            {rastro && (
              <div data-testid="rastro-da-execucao">
                <strong style={{ fontSize: 12.5 }}>Execução</strong>
                <div style={{ fontSize: 10.5, color: "var(--texto-fraco)" }}>fluxo {rastro.hash}</div>
                {/**
                 * SPEC-110 fatia B — **a porta da tela.** A execução parou num
                 * nó de tela: quem revisa não decide aqui (como no gate), ele
                 * ABRE a tela, age, e decide lá. O canvas só diz onde está.
                 */}
                {rastro.aguardandoTelaEm && (
                  <div
                    data-testid="aguardando-tela"
                    style={{ margin: "8px 0", padding: 8, border: "1px solid var(--borda-forte)", borderRadius: 8, fontSize: 12 }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      ⏸ Esta execução está <strong>aguardando uma tela</strong> — alguém precisa abrir, revisar e decidir
                      (avançar ou retornar). A decisão vale de qualquer máquina: a execução está guardada no servidor.
                    </div>
                    <button
                      data-testid="abrir-tela-do-stage"
                      onClick={() => aoAbrirTelaDoStage?.(rastro.aguardandoTelaEm!)}
                      disabled={!aoAbrirTelaDoStage}
                      style={{ ...botaoMiudo, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
                    >
                      abrir a tela →
                    </button>
                  </div>
                )}
                {/* SPEC-110 B — "retornado": a execução acabou na tela, e o
                    canvas diz o que fazer (D2 — sem re-rodar automático). */}
                {rastro.retornada && (
                  <div data-testid="execucao-retornada" style={{ ...avisoEstilo, color: "var(--texto-2)", margin: "8px 0" }}>
                    ↩ Retornado — ajuste o que precisa e rode de novo. O rastro acima é o desta execução, que terminou aqui.
                  </div>
                )}
                {/* SPEC-107 fatia C (§5.5) — o GATE: a execução suspendeu e o
                    resto só roda quando alguém, revisando o stage, decidir. */}
                {rastro.aguardandoEm && (
                  <div
                    data-testid="gate-de-confirmacao"
                    style={{ margin: "8px 0", padding: 8, border: "1px solid var(--borda-forte)", borderRadius: 8, fontSize: 12 }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      ⏸ Aguardando confirmação no nó <strong>{rastro.aguardandoEm}</strong> — revise a saída abaixo e
                      decida. A decisão vale de qualquer máquina: a execução está guardada no servidor.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        data-testid="continuar-execucao"
                        onClick={() => void continuarExecucao()}
                        disabled={!podeEditar || executando}
                        style={{ ...botaoMiudo, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
                      >
                        {executando ? "Continuando…" : "Continuar"}
                      </button>
                      <button data-testid="descartar-execucao" onClick={() => void descartarExecucao()} disabled={!podeEditar} style={botaoMiudo}>
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
                {rastro.nos.map((n) => (
                  <div key={n.noId} data-testid={`rastro-${n.noId}`} style={{ marginTop: 8, fontSize: 12 }}>
                    <span
                      style={{
                        color:
                          n.estado === "sucesso" ? "var(--verde)" : n.estado === "falhou" ? "var(--vermelho)" : "var(--texto-fraco)",
                      }}
                    >
                      {n.estado === "sucesso" ? "✓" : n.estado === "falhou" ? "✕" : "○"} {n.noId}
                    </span>
                    <span style={{ color: "var(--texto-fraco)" }}> · {n.duracaoMs}ms</span>
                    {n.erro && <div style={{ color: "var(--vermelho)", fontSize: 11.5 }}>{n.erro}</div>}
                    {/* SPEC-106 fatia A — o link do que SUBIU, clicável. */}
                    {n.linkExterno && (
                      <div style={{ fontSize: 11.5 }}>
                        <a href={n.linkExterno} target="_blank" rel="noreferrer" style={{ color: "var(--acento-texto, var(--acento))" }}>
                          ver o que subiu ↗
                        </a>
                      </div>
                    )}
                    {/* O artefato do agente é MARKDOWN — mostra como texto
                        corrido (o "antes de subir"), não como JSON. */}
                    {n.tipo === "agente" && typeof rastro.saidas[n.noId]?.texto === "string" ? (
                      <pre style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }} data-testid={`artefato-${n.noId}`}>
                        {String(rastro.saidas[n.noId].texto).slice(0, 4000)}
                      </pre>
                    ) : (
                      rastro.saidas[n.noId] && (
                        <>
                          {/* Fatia F — campo com semântica de DOCUMENTO ganha
                              preview como texto corrido, não JSON (§2.1). */}
                          {chavesDeDocumento(n)
                            .filter((chave) => typeof rastro.saidas[n.noId][chave] === "string")
                            .map((chave) => (
                              <pre
                                key={chave}
                                style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }}
                                data-testid={`documento-${n.noId}-${chave}`}
                              >
                                {String(rastro.saidas[n.noId][chave]).slice(0, 4000)}
                              </pre>
                            ))}
                          <pre style={saidaEstilo}>
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(rastro.saidas[n.noId]).filter(
                                  ([chave]) => !chavesDeDocumento(n).includes(chave) || typeof rastro.saidas[n.noId][chave] !== "string"
                                )
                              ),
                              null,
                              2
                            ).slice(0, 1200)}
                          </pre>
                        </>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* SPEC-107 fatia D — o nó RODANDO, ao vivo: o texto do agente
                cresce com o caret (a experiência da revisão), e antes do
                primeiro token os pontinhos respiram. */}
            {vivo?.rodando && (
              <div data-testid={`rastro-vivo-${vivo.rodando}`} style={{ marginTop: 8, fontSize: 12 }}>
                <span className="pip-pulsando" style={{ color: "var(--acento)" }}>
                  ⚡ {vivo.rodando} rodando…
                </span>
                {vivo.textos[vivo.rodando] ? (
                  <pre className="texto-ao-vivo" style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }}>
                    {vivo.textos[vivo.rodando].slice(-4000)}
                  </pre>
                ) : (
                  <pre className="pensando-ao-vivo">●●●</pre>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function PainelDoNo({
  no,
  catalogo,
  papeis,
  podeEditar,
  podeEditarPapel,
  onSalvarPapel,
  onMudar,
  onRemover,
  esteira,
  aoAbrirConfigDaEspecificacao,
  telas,
  aoEditarTela,
}: {
  no: NoDoFluxo;
  catalogo: ConectorDoCatalogo[];
  papeis: PapelConfigurado[];
  /** SPEC-110 fatia C — as telas em vigor: as do sistema e as do time. */
  telas: TelaEmVigor[];
  /** A PORTA (§§388-389): o painel do nó leva ao editor da tela declarada. */
  aoEditarTela?: (id: string) => void;
  podeEditar: boolean;
  podeEditarPapel: boolean;
  onSalvarPapel: (refId: string, mudanca: { nome: string; descricao: string; preambulo: string }) => Promise<void>;
  onMudar: (mudanca: Partial<NoDoFluxo>) => void;
  onRemover: () => void;
  /** SPEC-109 C — o lugar do papel NA ESTEIRA (ligar/desligar, ordem, última
   * corrida), herdado do mapa do sistema que morreu (§260/§265). */
  esteira?: {
    papel: PapelConfigurado;
    posicao: number;
    total: number;
    execucao?: ExecucaoDoPapel;
    podeEditar: boolean;
    onAlternar: () => void;
    onMover: (direcao: -1 | 1) => void;
    aoAbrirConfig?: () => void;
  };
  /** SPEC-109 D — a porta para o template da especificação, no nó que o
   * consome (a geração de itens). */
  aoAbrirConfigDaEspecificacao?: () => void;
}) {
  const conector = no.tipo === "conector" ? catalogo.find((c) => c.id === no.refId) : undefined;
  // SPEC-110 fatia A — o gatilho É o registro fechado, como a função: não há
  // adaptador a escolher enquanto a família tiver um só membro (§2.4-10).
  const gatilho = no.tipo === "gatilho" ? gatilhoDoSistema(no.refId) : undefined;
  // SPEC-110 fatia B — a tela: capacidade com contrato, executor de gente.
  const tela = no.tipo === "tela" ? telas.find((t) => t.refId === no.refId) : undefined;
  // SPEC-107 fatia A — a função É a capacidade: contrato do registro fechado,
  // sem adaptador a escolher.
  const funcao = no.tipo === "funcao" ? funcaoDoSistema(no.refId) : undefined;
  // SPEC-110 fatia F — o contrato do componente ESCOLHIDO; o legado cai no
  // fundido, que é exatamente o que ele é.
  const projeto = no.tipo === "projeto" ? (dadoDoSistema(no.refId) ?? PROJETO_DO_SISTEMA) : undefined;
  const camposDaTransformacao =
    no.tipo === "transformacao" ? sanearCamposDaTransformacao(no.parametros?.campos) : null;
  // §368 — o COMPONENTE diz quais adaptadores servem: mesma operação para os
  // do gateway, endereço livre para "chamada externa", papéis para agente.
  const adaptadores =
    no.tipo === "agente"
      ? papeis.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))
      : catalogo
          .filter((c) => (no.componente ? (no.componente === "livre" ? !c.operacao : c.operacao === no.componente) : true))
          .map((c) => ({ id: c.id, nome: c.nome }));
  return (
    <div data-testid="painel-do-no">
      <strong style={{ fontSize: 12.5 }}>{no.id}</strong>
      <div style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "4px 0 8px" }}>
        {no.tipo === "tela"
          ? // SPEC-110 B — o painel da tela diz o que ela PEDE de quem revisa:
            // a execução PARA aqui, e sem isso o cartão seria um nó mudo no
            // meio da fiação.
            (
              <span data-testid="proposito-da-tela">
                Tela — <strong>{tela?.nome ?? no.refId}</strong>. {tela?.descricao} A execução <strong>para</strong> neste
                nó: alguém abre, revisa e decide — <em>Avançar</em> segue a fiação com a saída da tela, <em>Retornar</em>{" "}
                encerra a execução.{" "}
                {/* SPEC-110 fatia C — a PORTA no nó que consome (§§388-389):
                    a tela DECLARADA se edita de onde ela é usada. As do
                    sistema não têm editor — elas são o produto. */}
                {tela?.origem === "declarada" && aoEditarTela && (
                  <button onClick={() => aoEditarTela(tela.id)} style={{ ...botao, marginLeft: 6 }} data-testid="editar-a-tela">
                    editar a tela →
                  </button>
                )}
              </span>
            )
          : no.tipo === "gatilho"
          ? // SPEC-110 A — o painel do gatilho diz o PROPÓSITO dele: era isso
            // que faltava ao botão ("não entendi qual o objetivo do executar").
            (
              <span data-testid="proposito-do-gatilho">
                Gatilho — <strong>{gatilho?.nome ?? no.refId}</strong>. {gatilho?.descricao}
              </span>
            )
          : no.tipo === "conector"
          ? // SPEC-109 B — a operação é do CONECTOR escolhido (a paleta virou
            // genérica); o componente antigo fica de fallback para nós de
            // fluxos salvos antes.
            (conector?.operacao
              ? NOME_DA_OPERACAO[conector.operacao]
              : no.componente && no.componente !== "livre"
                ? NOME_DA_OPERACAO[no.componente]
                : "Integração externa")
          : no.tipo === "funcao"
            ? `Função do sistema — ${funcao?.nome ?? no.refId}`
            : no.tipo === "projeto"
              ? (
                  <>
                    {/**
                     * SPEC-110 fatia F — o painel diz a direção e o que ela
                     * implica. A porta "Abrir a mesa de projeto" SAIU daqui
                     * (D12): quem quer DADO usa ler/gravar; quem quer que
                     * alguém entre no meio do fluxo põe a tela `mesa` da
                     * fatia B. Um nó de dados com botão de abrir tela era o
                     * mesmo cartão respondendo a duas perguntas.
                     */}
                    {/* O NOME, não a descrição: o bloco `contrato-do-projeto`
                        logo abaixo já a traz, e a validação visual mostrou o
                        mesmo parágrafo impresso duas vezes no painel. */}
                    {dadoDoSistema(no.refId)?.nome ?? PROJETO_DO_SISTEMA.nome}
                    {/* `--amarelo` tem par declarado nos dois temas
                        (styles.css). A validação visual pegou um
                        `var(--aviso)` que não existe: o aviso caía na cor do
                        texto comum e não se distinguia de nada. */}
                    {no.refId === REF_DO_PROJETO && (
                      <div data-testid="aviso-do-projeto-legado" style={{ marginTop: 4, color: "var(--amarelo)" }}>
                        {AVISO_DO_PROJETO_LEGADO}
                      </div>
                    )}
                  </>
                )
              : no.tipo === "transformacao"
                ? "Transformação (pura — re-mapeia, extrai, concatena)"
                : "Agente"}
      </div>
      {/* SPEC-109 B — o nome do nó é da pessoa (n8n): vazio, o cartão ecoa o
          que o nó referencia; escrito, ele manda. */}
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 8 }}>
        Nome do nó
        <input
          data-testid="nome-do-no"
          disabled={!podeEditar}
          value={no.nome ?? ""}
          placeholder="vazio = o nome do que ele referencia"
          onChange={(e) => onMudar({ nome: e.target.value || undefined })}
          style={campo}
        />
      </label>
      {/* SPEC-110 A — a família de gatilhos escolhe-se aqui, mas só quando há
          escolha (§2.4-10): com um membro só, o seletor seria uma pergunta de
          uma resposta. A fatia E (agendamento) o acende sozinha. */}
      {no.tipo === "gatilho" && GATILHOS_DO_SISTEMA.length > 1 && (
        <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 8 }}>
          Quando este fluxo roda
          <select
            data-testid="tipo-do-gatilho"
            disabled={!podeEditar}
            value={no.refId}
            onChange={(e) => onMudar({ refId: e.target.value })}
            style={campo}
          >
            {GATILHOS_DO_SISTEMA.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {/**
       * SPEC-110 fatia E (D7) — a EXPRESSÃO do agendamento, com a próxima
       * ocorrência ao lado. Um cron sozinho não é resposta para quem o
       * escreveu: "0 9 * * 1-5" só vira promessa quando a tela diz que a
       * próxima é segunda às 9h (§2.4-6 — o implícito em voz alta).
       */}
      {no.tipo === "gatilho" && no.refId === "agendamento" && (
        <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 8 }}>
          Quando rodar (cron de 5 campos, em UTC)
          <input
            data-testid="expressao-do-agendamento"
            disabled={!podeEditar}
            value={String(no.parametros[PARAMETRO_DA_EXPRESSAO] ?? "")}
            placeholder="0 9 * * 1-5   (dias úteis, 9h)"
            onChange={(e) => onMudar({ parametros: { ...no.parametros, [PARAMETRO_DA_EXPRESSAO]: e.target.value } })}
            style={campo}
          />
          <span data-testid="proxima-ocorrencia" style={{ color: "var(--texto-2)" }}>
            próxima: {proximaOcorrenciaLegivel(String(no.parametros[PARAMETRO_DA_EXPRESSAO] ?? ""), new Date())}
          </span>
          <span style={{ color: "var(--texto-fraco)" }}>
            minuto hora dia mês dia-da-semana · aceita <em>*</em>, listas (1,15), intervalos (1-5) e passos (*/15)
          </span>
        </label>
      )}
      {no.tipo !== "gatilho" && no.tipo !== "tela" && no.tipo !== "funcao" && no.tipo !== "projeto" && no.tipo !== "transformacao" && (
        <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 8 }}>
          {/* §359/§2.4-1 — o rótulo nomeia O QUE se escolhe ("adaptador" é
              jargão de arquitetura e o usuário estranhou, com razão): o nó
              agente executa um PAPEL configurado; a chamada externa usa um
              CONECTOR do catálogo. */}
          {no.tipo === "agente" ? "Papel (da configuração de agentes)" : "Integração externa (do catálogo)"}
          <select
            data-testid="adaptador-do-no"
            disabled={!podeEditar}
            value={no.refId}
            onChange={(e) => onMudar({ refId: e.target.value })}
            style={campo}
          >
            <option value="">— escolha —</option>
            {adaptadores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* O gate depois do GATILHO não teria o que revisar (o gatilho não
          produz nada, D1) — a caixa some em vez de convidar a um desenho que
          só faz o fluxo travar antes de começar. */}
      <label
        style={{
          fontSize: 11.5,
          display: no.tipo === "gatilho" ? "none" : "flex",
          gap: 6,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          data-testid="aguardar-confirmacao"
          disabled={!podeEditar}
          checked={no.confirmacao === "aguardar"}
          onChange={(e) => onMudar({ confirmacao: e.target.checked ? "aguardar" : undefined })}
        />
        {/* §368, generalizado na fatia C (§5.5): o gate é CONFIGURAÇÃO do
            fluxo, não um botão de ocasião — todo Executar suspende ali, e a
            execução guardada espera alguém continuar ou descartar. */}
        Aguardar confirmação depois deste nó (o resto só roda quando alguém continuar)
      </label>
      {conector && conector.entrada.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: "var(--texto-fraco)", marginBottom: 4 }}>
            Valores fixos (o que não vier de aresta):
          </div>
          {conector.entrada.map((campoDoConector) => (
            <label key={campoDoConector.chave} style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
              {campoDoConector.rotulo}
              {campoDoConector.obrigatorio ? " *" : ""}
              <input
                disabled={!podeEditar}
                value={String(no.parametros[campoDoConector.chave] ?? "")}
                onChange={(e) =>
                  onMudar({
                    parametros: e.target.value
                      ? { ...no.parametros, [campoDoConector.chave]: e.target.value }
                      : Object.fromEntries(Object.entries(no.parametros).filter(([k]) => k !== campoDoConector.chave)),
                  })
                }
                style={campo}
              />
            </label>
          ))}
        </>
      )}
      {camposDaTransformacao && (
        <div data-testid="campos-da-transformacao" style={{ fontSize: 11.5, marginBottom: 8 }}>
          {/* §2.4-6 — o implícito em voz alta: cada campo diz de onde sai. */}
          <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>
            Cada campo de saída vem de um <strong>modelo</strong> ("{"{entrada}"}" concatena o que chegou) ou de um{" "}
            <strong>caminho</strong> ("$.desenho.diagrama" extrai). Ausente não vira default — o nó falha com o nome
            (§9.3).
          </p>
          {camposDaTransformacao.map((campoDaLista, i) => (
            <div key={i} style={{ display: "grid", gap: 4, marginBottom: 8, padding: 6, border: "1px solid var(--borda)", borderRadius: 6 }}>
              <input
                aria-label={`Chave do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.chave}
                placeholder="chave de saída"
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) => (j === i ? { ...c, chave: e.target.value } : c)),
                    },
                  })
                }
                style={campo}
              />
              <input
                aria-label={`Modelo do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.modelo ?? ""}
                placeholder='modelo — ex.: "RPS {rps} — pico {pico}"'
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) =>
                        j === i ? { ...c, modelo: e.target.value || undefined } : c
                      ),
                    },
                  })
                }
                style={campo}
              />
              <input
                aria-label={`Caminho do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.caminho ?? ""}
                placeholder='caminho — ex.: "$.desenho.diagrama"'
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) =>
                        j === i ? { ...c, caminho: e.target.value || undefined } : c
                      ),
                    },
                  })
                }
                style={campo}
              />
              {podeEditar && (
                <button
                  onClick={() =>
                    onMudar({
                      parametros: { ...no.parametros, campos: camposDaTransformacao.filter((_c, j) => j !== i) },
                    })
                  }
                  style={botaoMiudo}
                >
                  Remover campo
                </button>
              )}
            </div>
          ))}
          {podeEditar && (
            <button
              data-testid="adicionar-campo-da-transformacao"
              onClick={() =>
                onMudar({
                  parametros: { ...no.parametros, campos: [...camposDaTransformacao, { chave: `campo${camposDaTransformacao.length + 1}` }] },
                })
              }
              style={botaoMiudo}
            >
              + campo de saída
            </button>
          )}
        </div>
      )}
      {projeto && (
        <div data-testid="contrato-do-projeto" style={{ fontSize: 11.5, marginBottom: 8 }}>
          <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>{projeto.descricao}</p>
          <label style={{ display: "grid", gap: 2, marginBottom: 6 }}>
            Demanda (id) — vazio = a mais recentemente atualizada do time
            <input
              data-testid="demanda-do-projeto"
              disabled={!podeEditar}
              value={String(no.parametros.demandaId ?? "")}
              onChange={(e) =>
                onMudar({
                  parametros: e.target.value
                    ? { ...no.parametros, demandaId: e.target.value }
                    : Object.fromEntries(Object.entries(no.parametros).filter(([k]) => k !== "demandaId")),
                })
              }
              style={campo}
            />
          </label>
          {/* SPEC-110 F — quem só grava não tem saída para listar, e listar
              "Saídas: (nenhuma)" seria ruído. Cada componente mostra o lado
              que ele tem. */}
          {projeto.saida.length > 0 && (
            <div style={{ color: "var(--texto-fraco)" }}>Saídas: {projeto.saida.map((c) => c.rotulo).join(", ")}</div>
          )}
          {no.refId === REF_DA_DEMANDA_GRAVAR && (
            <div style={{ color: "var(--texto-fraco)" }}>
              Aceita: {projeto.entrada.filter((c) => c.chave !== "demandaId").map((c) => c.rotulo).join(", ")}
            </div>
          )}
          {/* §2.4-4 e §2.4-14 — quem age no mundo se anuncia, e escrever na
              demanda NUNCA aplica direto: vira proposta (variante). */}
          {no.refId !== REF_DA_DEMANDA_LER && (
            <p style={{ color: "var(--texto-fraco)", margin: "6px 0 0" }}>
              Com "desenho" mapeado numa aresta de entrada, este nó ESCREVE: o desenho vira uma variante
              ("Proposta do fluxo…") — o desenho da demanda só muda se alguém adotar na mesa.
            </p>
          )}
        </div>
      )}
      {funcao && (
        <div data-testid="contrato-da-funcao" style={{ fontSize: 11.5, marginBottom: 8 }}>
          {funcao.descricao && <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>{funcao.descricao}</p>}
          {/* §2.4-6 — o implícito em voz alta: o contrato diz o que entra e o
              que sai; a entrada obrigatória vem do mapeamento de uma aresta. */}
          <div style={{ color: "var(--texto-fraco)" }}>
            Entradas:{" "}
            {funcao.entrada.map((c) => `${c.rotulo}${c.obrigatorio ? " *" : ""}`).join(", ") || "—"}
          </div>
          <div style={{ color: "var(--texto-fraco)" }}>
            Saídas: {funcao.saida.map((c) => c.rotulo).join(", ") || "—"}
          </div>
          <p style={{ color: "var(--texto-fraco)", margin: "6px 0 0" }}>
            As entradas vêm das arestas (mapeamento). Obrigatória ausente não vira default — o nó não roda (§9.3).
          </p>
          {/* SPEC-109 D — o template da especificação MOLDA o que este nó
              escreve (o `templateItem` da derivação): a porta vive onde o
              insumo é consumido, e a aba saiu do menu. */}
          {no.refId === "derivacao" && aoAbrirConfigDaEspecificacao && (
            <button
              data-testid="abrir-config-da-especificacao"
              onClick={aoAbrirConfigDaEspecificacao}
              style={{ ...botaoMiudo, marginTop: 6 }}
            >
              Template da especificação (molda os itens) →
            </button>
          )}
        </div>
      )}
      {no.tipo === "agente" && (
        <>
          <p style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
            As entradas vêm das arestas — o mapeamento diz o que ele recebe (§9.3: sem entrada, ele não roda).
          </p>
          {/* SPEC-109 C — o lugar na esteira, editado de onde se vê (§260):
              a SistemaScreen morreu e estes controles vieram para cá. */}
          {esteira && (
            <fieldset style={{ border: "1px solid var(--borda)", borderRadius: 8, padding: 10, margin: "0 0 8px" }}>
              <legend style={{ fontSize: 11, color: "var(--texto-fraco)" }}>Na esteira</legend>
              <label style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  data-testid="papel-ativo"
                  disabled={!esteira.podeEditar}
                  checked={esteira.papel.ativo}
                  onChange={esteira.onAlternar}
                />
                Ativo (desligado sai da cadeia — e da fiação derivada)
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
                  Ordem: {esteira.posicao + 1} de {esteira.total}
                </span>
                <button
                  data-testid="papel-mover-antes"
                  disabled={!esteira.podeEditar || esteira.posicao === 0}
                  onClick={() => esteira.onMover(-1)}
                  style={botaoMiudo}
                >
                  ← antes
                </button>
                <button
                  data-testid="papel-mover-depois"
                  disabled={!esteira.podeEditar || esteira.posicao >= esteira.total - 1}
                  onClick={() => esteira.onMover(1)}
                  style={botaoMiudo}
                >
                  depois →
                </button>
              </div>
              {/* §265 — a última corrida é notícia: casada pelo ID do papel,
                  como no mapa que morreu (renomear não órfã o rastro). */}
              {esteira.execucao && (
                <p data-testid="papel-ultima-corrida" style={{ fontSize: 11, color: esteira.execucao.ok ? "var(--texto-fraco)" : "var(--vermelho)", margin: "0 0 6px" }}>
                  Última corrida: {esteira.execucao.ok ? "ok" : `falhou${esteira.execucao.erro ? ` — ${esteira.execucao.erro}` : ""}`}
                </p>
              )}
              {esteira.aoAbrirConfig && (
                <button data-testid="abrir-config-dos-papeis" onClick={esteira.aoAbrirConfig} style={botaoMiudo}>
                  Catálogo completo dos papéis (criar, sugerir com IA) →
                </button>
              )}
            </fieldset>
          )}
          {/* §369 — o PAPEL editável de onde se vê (régua do §260): grava no
              mesmo documento da aba Pipeline de IA — uma verdade só. */}
          {no.refId && papeis.some((p) => p.id === no.refId) && (
            <EditorDoPapel
              key={no.refId}
              papel={papeis.find((p) => p.id === no.refId)!}
              podeEditar={podeEditarPapel}
              onSalvar={(mudanca) => onSalvarPapel(no.refId, mudanca)}
            />
          )}
        </>
      )}
      {podeEditar && (
        <button onClick={onRemover} style={{ ...botao, marginTop: 8 }}>
          Remover nó
        </button>
      )}
    </div>
  );
}

function EditorDoPapel({
  papel,
  podeEditar,
  onSalvar,
}: {
  papel: PapelConfigurado;
  podeEditar: boolean;
  onSalvar: (mudanca: { nome: string; descricao: string; preambulo: string }) => Promise<void>;
}) {
  const [nome, setNome] = useState(papel.nome);
  const [descricao, setDescricao] = useState(papel.descricao ?? "");
  const [preambulo, setPreambulo] = useState(papel.preambulo ?? "");
  const [salvando, setSalvando] = useState(false);
  const mudou = nome !== papel.nome || descricao !== (papel.descricao ?? "") || preambulo !== (papel.preambulo ?? "");
  /** SPEC-109 fatia A — o que este papel MANDA hoje, resolvido pela mesma
   * função da borda (`preambuloDoPapel`). O campo vazio lia como "este agente
   * não tem prompt" (queixa literal), quando o default estava indo no pedido
   * o tempo todo — o efetivo aparece como placeholder, e a nota diz de onde
   * ele vem. */
  const preambuloPadrao = preambuloDoPapel(papel.id, [{ id: papel.id, grupo: papel.grupo, preambulo: "" }]);

  return (
    <fieldset disabled={!podeEditar || salvando} style={{ border: "1px solid var(--borda)", borderRadius: 8, padding: 10, margin: "0 0 8px" }}>
      <legend style={{ fontSize: 11, color: "var(--texto-fraco)" }}>O papel (o mesmo do catálogo de papéis)</legend>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Nome
        <input data-testid="papel-nome" value={nome} onChange={(e) => setNome(e.target.value)} style={campo} />
      </label>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Descrição
        <input data-testid="papel-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} style={campo} />
      </label>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Prompt do papel (preâmbulo)
        <textarea
          data-testid="papel-preambulo"
          value={preambulo}
          onChange={(e) => setPreambulo(e.target.value)}
          rows={5}
          placeholder={preambuloPadrao}
          style={{ ...campo, resize: "vertical" }}
        />
      </label>
      {!preambulo.trim() && (
        <p data-testid="preambulo-padrao-em-uso" style={{ fontSize: 11, color: "var(--texto-fraco)", margin: "0 0 6px" }}>
          Vazio = o padrão acima é o que vai no pedido. Escrever aqui o substitui.
        </p>
      )}
      <button
        data-testid="salvar-papel"
        disabled={!mudou}
        onClick={() => {
          setSalvando(true);
          void onSalvar({ nome, descricao, preambulo }).finally(() => setSalvando(false));
        }}
        style={botaoMiudo}
      >
        {salvando ? "Salvando…" : "Salvar papel na esteira"}
      </button>
      {!podeEditar && (
        <p style={{ fontSize: 10.5, color: "var(--texto-fraco)", margin: "6px 0 0" }}>
          Editar o papel exige a permissão da esteira (pipeline-agentes).
        </p>
      )}
    </fieldset>
  );
}

function PainelDaAresta({
  aresta,
  fluxo,
  catalogo,
  podeEditar,
  onMudar,
  onRemover,
}: {
  aresta: ArestaDoFluxo;
  fluxo: Fluxo;
  catalogo: ConectorDoCatalogo[];
  podeEditar: boolean;
  onMudar: (mapeamento: ArestaDoFluxo["mapeamento"]) => void;
  onRemover: () => void;
}) {
  const origem = fluxo.nos.find((n) => n.id === aresta.de);
  const destino = fluxo.nos.find((n) => n.id === aresta.para);
  // O que a ORIGEM sabe entregar: a `saida` declarada do conector ou da
  // função (SPEC-107 — o mesmo contrato, outro transporte), ou o `texto` de
  // um agente. É a fatia A alimentando a C — sem forma declarada, este select
  // não teria opções, e a aresta não teria o que carregar (§3.2).
  const saidasDaOrigem =
    origem?.tipo === "conector"
      ? (catalogo.find((c) => c.id === origem.refId)?.saida.map((s) => s.chave) ?? [])
      : origem?.tipo === "funcao"
        ? (funcaoDoSistema(origem.refId)?.saida.map((s) => s.chave) ?? [])
        : origem?.tipo === "projeto"
          ? // SPEC-110 F — o que ESTE componente entrega: um nó de gravação
            // não oferece o acervo da demanda, porque ele não o emite.
            (dadoDoSistema(origem.refId) ?? PROJETO_DO_SISTEMA).saida.map((s) => s.chave)
          : origem?.tipo === "transformacao"
            ? sanearCamposDaTransformacao(origem.parametros?.campos).map((c) => c.chave)
            : ["texto"];
  const entradasDoDestino =
    destino?.tipo === "conector"
      ? (catalogo.find((c) => c.id === destino.refId)?.entrada.map((s) => s.chave) ?? [])
      : destino?.tipo === "funcao"
        ? (funcaoDoSistema(destino.refId)?.entrada.map((s) => s.chave) ?? [])
        : destino?.tipo === "projeto"
          ? // SPEC-110 F — e o que ele ACEITA: ligar uma aresta a um nó de
            // leitura não oferece mais "grave este desenho", que é o par que
            // a execução nunca honraria.
            (dadoDoSistema(destino.refId) ?? PROJETO_DO_SISTEMA).entrada.map((s) => s.chave)
          : null;

  return (
    <div data-testid="painel-da-aresta">
      <strong style={{ fontSize: 12.5 }}>
        {aresta.de} → {aresta.para}
      </strong>
      <p style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "4px 0 8px" }}>
        O mapeamento é o que faz a aresta carregar DADO, não só ordem: de qual saída para qual entrada.
      </p>
      {aresta.mapeamento.map((par, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <select
            disabled={!podeEditar}
            value={par.saida}
            aria-label={`Saída do par ${i + 1}`}
            onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, saida: e.target.value } : p)))}
            style={{ ...campo, flex: 1 }}
          >
            <option value="">saída…</option>
            {saidasDaOrigem.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11 }}>→</span>
          {entradasDoDestino ? (
            <select
              disabled={!podeEditar}
              value={par.entrada}
              aria-label={`Entrada do par ${i + 1}`}
              onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, entrada: e.target.value } : p)))}
              style={{ ...campo, flex: 1 }}
            >
              <option value="">entrada…</option>
              {entradasDoDestino.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              disabled={!podeEditar}
              value={par.entrada}
              aria-label={`Entrada do par ${i + 1}`}
              placeholder="nome no prompt"
              onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, entrada: e.target.value } : p)))}
              style={{ ...campo, flex: 1 }}
            />
          )}
          {podeEditar && (
            <button onClick={() => onMudar(aresta.mapeamento.filter((_p, j) => j !== i))} style={botaoMiudo}>
              ×
            </button>
          )}
        </div>
      ))}
      {podeEditar && (
        <div style={{ display: "flex", gap: 8 }}>
          <button data-testid="adicionar-mapeamento" onClick={() => onMudar([...aresta.mapeamento, { saida: "", entrada: "" }])} style={botaoMiudo}>
            + par
          </button>
          <button onClick={onRemover} style={botaoMiudo}>
            Remover aresta
          </button>
        </div>
      )}
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
  color: "var(--texto)",
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderBottom: "1px solid var(--borda)",
};

const painelEstilo: React.CSSProperties = {
  width: 320,
  borderLeft: "1px solid var(--borda)",
  padding: 14,
  overflow: "auto",
  background: "var(--painel)",
};

const dicaVaziaEstilo: React.CSSProperties = {
  position: "absolute",
  top: "42%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 5,
  fontSize: 13,
  color: "var(--texto-fraco)",
  border: "1px dashed var(--borda-forte)",
  borderRadius: 10,
  padding: "14px 18px",
  maxWidth: 420,
  textAlign: "center",
  pointerEvents: "none",
  background: "var(--painel)",
};

const avisoEstilo: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12.5,
  color: "var(--vermelho)",
  borderBottom: "1px solid var(--borda)",
};

const saidaEstilo: React.CSSProperties = {
  fontSize: 10.5,
  background: "var(--fundo)",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  padding: 8,
  overflow: "auto",
  maxHeight: 160,
  margin: "4px 0 0",
};

const campo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botao: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoMiudo: React.CSSProperties = { ...botao, fontSize: 11.5, padding: "3px 8px" };
