import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  analisarLacunas,
  avaliarConformidade,
  avisosDaDerivacao,
  compararDocumentos,
  contar,
  volumetriaEmVigor,
  type VolumetriaDoProduto,
  MARCADOR_ESPECIFICAR,
  exemploDeMedicao,
  derivar,
  estruturarDocumento,
  ensaiosAssumidos,
  gerarEspecificacaoEntrega,
  gerarSpec,
  coberturaDaSpec,
  resolverDependencias,
  violacoesEmAberto,
  type Atividade,
  type DiagramaConfig,
  type No,
  type Quebra,
  type StatusDocumento,
  type SpecEscrita,
  type ResultadoDependenciasDe,
  elementosComTempo,
  gerarItensDeTrabalho,
  lerDesenho,
  marcasPorNo,
  percursoManual,
  reguaDaLeitura,
  type RequisitoDeTopologia,
  type ItemDeTrabalho,
} from "@gerador/engine";
import { carregarConfig, type ConfigCarregada } from "./config/loadConfig";
import { carregarCenarios, type Cenario } from "./demo/scenarios";
import {
  apiCamposAresta,
  apiCamposNo,
  apiProdutos,
  apiEspecificacaoTemplate,
  apiPipelineAgentes,
  apiTimes,
  apiVersao,
  type CampoAresta,
  type CampoNo,
  type ConfigPipelineAgentes,
  type DadosCampoAresta,
  type DadosCampoNo,
  type EspecificacaoTemplate,
  type SessaoUsuario,
  apiPdca,
  apiItensGerados,
  apiQuebras,
  type ItemGerado,
  apiStacks,
  apiExportador,
  type SugestoesDeStack,
  apiIa,
} from "./api/client";
import { useSessao } from "./auth/useSessao";
import { LoginScreen } from "./auth/LoginScreen";
import { useQuebra } from "./state/useQuebra";
import { quebraVazia, mesclarDiagrama } from "./state/factory";
import { usePersistencia } from "./persistence/usePersistencia";
import { AbrirQuebraScreen } from "./persistence/AbrirQuebraScreen";
import { Canvas } from "./canvas/Canvas";
import { PropertiesPanel } from "./panel/PropertiesPanel";
import { EdgePanel } from "./panel/EdgePanel";
import { ReadinessSummary } from "./summary/ReadinessSummary";
import { calcularResumoProntidao } from "./summary/prontidaoResumo";
import { ReviewScreen } from "./review/ReviewScreen";
import { ContextoEpicoPanel } from "./review/ContextoEpicoPanel";
import { ConversaPanel } from "./conversa/ConversaPanel";
import { AssistenteFlutuante, type AbaAssistente } from "./assistente/AssistenteFlutuante";
import { EnsaiosScreen } from "./ensaios/EnsaiosScreen";
import { idDaRegraDeForma } from "./config/FormaDoDesenho";
import { ConfigurarPanel } from "./assistente/ConfigurarPanel";
import { JourneyModal, type AbaJornada } from "./demo/JourneyModal";
import { contextoDoProdutoEmTexto, montarMapaDoSistema, type ExecucaoDoPapel } from "@gerador/aplicacao";
import { ConfigScreen, type AbaConfig } from "./config/ConfigScreen";
import { TourOverlay } from "./demo/TourOverlay";
import { useTour, passosDeConfiguracao } from "./demo/useTour";
import { CONVERSA_DO_TOUR, DECISOES_DO_TOUR, REGRAS_DO_TOUR, ehDecisaoDeDemonstracao } from "./demo/dadosDoTour";
import { DocumentoScreen } from "./documento/DocumentoScreen";
import { SistemaScreen } from "./sistema/SistemaScreen";
import { AvisosDaDerivacao } from "./summary/AvisosDaDerivacao";
import { baixarArquivoTexto } from "./persistence/baixarArquivo";
import { SpecScreen } from "./spec/SpecScreen";
import { LandingPage } from "./demo/LandingPage";
import { EscolherTimeScreen } from "./auth/EscolherTimeScreen";
import { lembrarTime, lerTimeLembrado } from "./auth/timeLembrado";
import { SemTimeScreen } from "./auth/SemTimeScreen";
import { RECURSO_DA_ABA, RECURSO_DA_SECAO_DE_REGRAS, usePermissoes } from "./auth/usePermissoes";
import { momentoDaConfig, momentoDoCanvas } from "./assistente/momentos";
import { MenuLateral } from "./navegacao/MenuLateral";
import { useRotaHash } from "./navegacao/rota";

const CHAVE_JORNADA_VISTA = "gerador:jornada-vista";

function lerTokenConviteDaUrl(): string | null {
  return new URLSearchParams(window.location.search).get("convite");
}

/**
 * Portão de sessão: sem login válido, nada do app (nem config) é carregado.
 * `?convite=TOKEN` na URL (SPEC-09 §3) é lido uma vez no boot — com ou sem
 * sessão já existente, o convite é aceito assim que uma sessão existir
 * (login pode acontecer antes ou depois de chegar aqui com o link). Login em
 * si nunca escolhe time (SPEC-09 revisado: um e-mail pode pertencer a mais de
 * um, e não tem como saber de antemão a quais — só depois da sessão existir
 * é que dá pra decidir, `EscolherTimeScreen`/`SemTimeScreen` abaixo).
 */
export function App() {
  const { sessao, modo, erro, expirou, entrar, sair } = useSessao();
  const [tokenConvite] = useState<string | null>(() => lerTokenConviteDaUrl());
  const [aceitandoConvite, setAceitandoConvite] = useState(false);
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  // Landing pública (SPEC-11) vem antes do formulário de login — só pra quem
  // chega sem sessão E sem convite pendente (um link de convite já é contexto
  // suficiente, ir pra landing antes seria fricção extra sem necessidade).
  const [mostrarLogin, setMostrarLogin] = useState(false);
  // Time ativo inicial, só quando a sessão tem mais de um (EscolherTimeScreen) —
  // com um só, nem chega a perguntar, usa esse direto.
  // Começa do que ficou lembrado da sessão anterior (#280) — sem isso, um F5
  // acidental jogava de volta no "Qual time?" no meio do trabalho. Só é usado
  // se o time ainda estiver na sessão; ver `timeLembrado.ts`.
  const [timeEscolhido, setTimeEscolhido] = useState<string | undefined>(undefined);
  const timeLembrado = sessao ? lerTimeLembrado(sessao.email, sessao.timeIds) : undefined;
  const timeInicial = timeEscolhido ?? timeLembrado;

  const escolherTime = useCallback(
    (timeId: string) => {
      if (sessao) lembrarTime(sessao.email, timeId);
      setTimeEscolhido(timeId);
    },
    [sessao]
  );

  // Compartilhado entre o auto-aceite (?convite=TOKEN na URL) e o formulário
  // manual da SemTimeScreen (colar link/código) — mesmo efeito, duas entradas.
  const aceitarToken = useCallback(async (token: string) => {
    setErroConvite(null);
    setAceitandoConvite(true);
    try {
      await apiTimes.aceitarConvite(token);
      // Recarrega do zero, sem o token na URL — a sessão em memória não sabe
      // do time novo; um reload busca `/auth/me` de novo já atualizado.
      window.location.href = window.location.pathname;
    } catch (e) {
      setErroConvite(e instanceof Error ? e.message : String(e));
      setAceitandoConvite(false);
    }
  }, []);

  useEffect(() => {
    if (!tokenConvite || !sessao) return;
    void aceitarToken(tokenConvite);
  }, [tokenConvite, sessao]);

  // Bootstrap sem depender de ninguém já existir (SPEC-13, correção do
  // SPEC-09 §3.3) — qualquer sessão pode criar um time novo direto da
  // SemTimeScreen. Erro fica só local nela (não usa erroConvite, ação diferente).
  const criarTime = useCallback(async (timeId: string) => {
    await apiTimes.criarTime(timeId);
    window.location.href = window.location.pathname;
  }, []);

  if (sessao === undefined) {
    return <div style={telaCentralizadaEstilo}>Verificando sessão…</div>;
  }
  if (aceitandoConvite) {
    return <div style={telaCentralizadaEstilo}>Aceitando convite…</div>;
  }
  if (sessao === null) {
    // §267 — quem teve a sessão expirada NÃO volta para a landing: ela é para
    // quem está chegando, e mandar alguém que estava trabalhando ler a página
    // de vendas esconde a única informação que importa naquele momento (que é
    // só entrar de novo).
    if (!tokenConvite && !mostrarLogin && !expirou) {
      return <LandingPage onEntrar={() => setMostrarLogin(true)} />;
    }
    return <LoginScreen erro={erro} modo={modo} aceitandoConvite={!!tokenConvite} onEntrar={entrar} />;
  }
  if (sessao.timeIds.length === 0) {
    // Sem convite em andamento — ex.: chegou por login direto (não por link),
    // ou o auto-aceite acima falhou. Deixa colar um link/código manualmente
    // em vez de só dizer "peça um convite" sem dar jeito de usá-lo aqui.
    return <SemTimeScreen onAceitarToken={aceitarToken} onCriarTime={criarTime} onSair={sair} erro={erroConvite} />;
  }
  if (sessao.timeIds.length > 1 && !timeInicial) {
    return <EscolherTimeScreen timeIds={sessao.timeIds} onEscolher={escolherTime} onSair={sair} />;
  }
  return <AppComSessao sessao={sessao} modo={modo} onSair={sair} timeInicial={timeInicial} />;
}

interface DadosCarregados extends ConfigCarregada {
  cenarios: Cenario[];
  sugestoesDeStack: SugestoesDeStack;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  especificacaoTemplate: EspecificacaoTemplate;
  /** SPEC-47 — template do corpo do item; `null` = o padrão do engine. */
  templateItem: EspecificacaoTemplate | null;
  pipelineAgentes: ConfigPipelineAgentes;
}

/**
 * `timeAtivo` é sempre um dos times da sessão (nunca mais texto livre — SPEC-08
 * §2.3) e dirige duas coisas ao mesmo tempo: qual perfil de stack sugerir, e
 * quais campos customizados (`campos_no`) mesclar na config. Trocar de time
 * recarrega os dois; `key={timeAtivo}` no `AppCarregado` abaixo garante que o
 * componente remonta do zero nessa troca, em vez de arrastar estado do time anterior.
 */
function AppComSessao({
  sessao,
  modo,
  onSair,
  timeInicial,
}: {
  sessao: SessaoUsuario;
  modo: "dev" | "oidc" | "local" | undefined;
  onSair: () => Promise<void>;
  timeInicial?: string;
}) {
  const [timeAtivo, setTimeAtivo] = useState(timeInicial ?? sessao.timeIds[0]);
  const [dados, setDados] = useState<DadosCarregados | null>(null);

  // A troca pelo seletor também precisa ser lembrada (#280). Sem isto, quem
  // trocasse de time e desse F5 voltava calado pro primeiro da lista — e as
  // sugestões e campos customizados passavam a vir do time errado, que é uma
  // falha muito mais difícil de perceber do que cair no "Qual time?".
  const trocarTimeAtivo = useCallback(
    (timeId: string) => {
      lembrarTime(sessao.email, timeId);
      setTimeAtivo(timeId);
    },
    [sessao.email]
  );
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    Promise.all([
      carregarConfig(timeAtivo),
      carregarCenarios(),
      apiStacks.sugestoes(),
      apiCamposNo.listar(timeAtivo),
      // Mesmo motivo do catch em loadConfig.ts: /campos-aresta não existe no
      // modo hospedado (packages/server fica dormente, SPEC-21 §2) — ausência
      // da rota vira "sem campos customizados", nunca erro fatal de carregamento.
      apiCamposAresta.listar(timeAtivo).catch(() => []),
      apiEspecificacaoTemplate.buscar(timeAtivo),
      // SPEC-47 — o template do CORPO de cada item (nulo = o padrão do engine).
      apiEspecificacaoTemplate.buscar(timeAtivo, "item").catch(() => null),
      // Mesmo motivo do catch de campos-aresta acima — rota só existe no modo
      // local (SPEC-24 Fase E); no hospedado cai no default seguro.
      apiPipelineAgentes.obter().catch(() => ({ confirmacaoObrigatoria: true })),
    ])
      .then(([config, cenarios, sugestoesDeStack, camposNo, camposAresta, especificacaoTemplate, templateItem, pipelineAgentes]) => {
        setDados({ ...config, cenarios, sugestoesDeStack, camposNo, camposAresta, especificacaoTemplate, templateItem, pipelineAgentes });
      })
      .catch((e: unknown) => setErroConfig(e instanceof Error ? e.message : String(e)));
  }, [timeAtivo]);

  if (erroConfig) {
    return (
      <div style={telaCentralizadaEstilo}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <strong style={{ fontSize: 15, color: "#b91c1c" }}>Não foi possível carregar a configuração</strong>
          <p style={{ fontSize: 13, color: "var(--texto-2)", marginTop: 8 }}>{erroConfig}</p>
        </div>
      </div>
    );
  }

  if (!dados) {
    return <div style={telaCentralizadaEstilo}>Carregando…</div>;
  }

  return (
    <AppCarregado
      key={timeAtivo}
      {...dados}
      sessao={sessao}
      modo={modo}
      timeAtivo={timeAtivo}
      onTrocarTimeAtivo={trocarTimeAtivo}
      onSair={onSair}
    />
  );
}

function AppCarregado({
  diagramaConfig: diagramaConfigInicial,
  appConfig,
  regrasConfig: regrasConfigInicial,
  /** SPEC-79 fatia A — os tokens do design system do time. Vazio = não
   * configurado, e a régua de pertencimento se cala sozinha. */
  tokens,
  cenarios,
  sugestoesDeStack: sugestoesInicial,
  camposNo: camposNoInicial,
  camposAresta: camposArestaInicial,
  especificacaoTemplate: especificacaoTemplateInicial,
  templateItem: templateItemInicial,
  pipelineAgentes: pipelineAgentesInicial,
  sessao,
  modo,
  timeAtivo,
  onTrocarTimeAtivo,
  onSair,
}: ConfigCarregada & {
  cenarios: Cenario[];
  sugestoesDeStack: SugestoesDeStack;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  especificacaoTemplate: EspecificacaoTemplate;
  templateItem: EspecificacaoTemplate | null;
  pipelineAgentes: ConfigPipelineAgentes;
  sessao: SessaoUsuario;
  modo: "dev" | "oidc" | "local" | undefined;
  timeAtivo: string;
  onTrocarTimeAtivo: (timeId: string) => void;
  onSair: () => Promise<void>;
}) {
  const [diagramaConfig, setDiagramaConfig] = useState<DiagramaConfig>(diagramaConfigInicial);
  /** SPEC-63 — estado, e não prop: uma régua criada na tela de configuração
   * precisa valer na mesa sem F5. Ver `recarregarConfig`. */
  const [regrasConfig, setRegrasConfig] = useState(regrasConfigInicial);
  // SPEC-38 — o nível no time ativo. `visualizar` esconde o Salvar (a negação
  // real mora no servidor; aqui é só não oferecer o que seria 403).
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });
  const somenteLeitura = permissoes.nivel === "visualizar";
  const [sugestoesDeStack, setSugestoesDeStack] = useState(sugestoesInicial);
  const [camposNo, setCamposNo] = useState(camposNoInicial);
  const [camposAresta, setCamposAresta] = useState(camposArestaInicial);
  /** SPEC-53 — os produtos que este time enxerga. Carregados à parte do boot
   * (e não junto de `carregarConfig`) porque produto não é configuração de
   * time: é entidade da organização, e o vínculo com o time só RESTRINGE. */
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    apiProdutos
      .listar(timeAtivo)
      .then((lista) => setProdutos(lista.map((p) => ({ id: p.id, nome: p.nome }))))
      // Instalação sem produto nenhum não é erro: o seletor some e tudo segue
      // como antes (SPEC-53 §4, Fase 1).
      .catch(() => setProdutos([]));
  }, [timeAtivo]);
  const [especificacaoTemplate, setEspecificacaoTemplate] = useState(especificacaoTemplateInicial);
  const [templateItem, setTemplateItem] = useState(templateItemInicial);
  const [pipelineAgentes, setPipelineAgentes] = useState(pipelineAgentesInicial);

  // Só o modo local (`gerador open`) tem a rota — hospedado/dev não têm nada
  // aqui, o que é esperado, não some/quebra a tela. Achado real: sem isso
  // visível, o usuário não tinha como confirmar que "npm install -g
  // gerador-de-itens@latest" trouxe a versão nova.
  const [versao, setVersao] = useState<string | undefined>(undefined);
  useEffect(() => {
    void apiVersao.buscar().then(setVersao);
  }, []);
  const quebraState = useQuebra(quebraVazia(timeAtivo), diagramaConfig);
  const {
    quebra,
    setQuebra,
    selecionadoId,
    setSelecionadoId,
    arestaSelecionadaId,
    adicionarNo,
    edgeRejeitada,
    limparEdgeRejeitada,
    responderItem,
    aplicarDiagramaProposto,
  } = quebraState;

  /**
   * SPEC-53 Fase 2 — o contexto do produto ESCOLHIDO, já em texto.
   *
   * Buscado sob demanda (e não junto da lista) porque a lista é só nome: o
   * contexto inteiro de todos os produtos da organização seria carregado a
   * cada boot para usar, no máximo, um.
   */
  const [contextoDoProduto, setContextoDoProduto] = useState<string | undefined>(undefined);
  /**
   * SPEC-77 — o volume PERENE, que a demanda herda quando não declara o seu.
   *
   * Vem do mesmo `obter` do contexto: uma busca só, e o número não precisa de
   * uma segunda fonte. Guardado à parte do texto porque não é texto — ele
   * alimenta a Lei de Little, e o contexto alimenta o prompt.
   */
  const [volumetriaDoProduto, setVolumetriaDoProduto] = useState<VolumetriaDoProduto | undefined>(undefined);
  useEffect(() => {
    if (!quebra.produtoId) {
      setContextoDoProduto(undefined);
      setVolumetriaDoProduto(undefined);
      return;
    }
    apiProdutos
      .obter(quebra.produtoId)
      .then((p) => {
        setContextoDoProduto(contextoDoProdutoEmTexto(p) || undefined);
        setVolumetriaDoProduto(p.volumetria);
      })
      // Produto apagado depois de a demanda apontar pra ele: a demanda
      // continua valendo, só sem o contexto (a FK é ON DELETE SET NULL, mas a
      // quebra em memória pode estar mais velha que o banco).
      .catch(() => {
        setContextoDoProduto(undefined);
        setVolumetriaDoProduto(undefined);
      });
  }, [quebra.produtoId]);

  /**
   * SPEC-77 fatia B — o volume que VALE nesta demanda, e de onde ele veio.
   *
   * Resolvido UMA vez, aqui, e distribuído: o `quebra.volumetria` era lido em
   * quatro lugares, e um `??` repetido quatro vezes é a definição de duas
   * versões da mesma régua (§263). Quem decide é o engine.
   */
  const volumetriaEmVigorAgora = useMemo(
    () => volumetriaEmVigor(quebra.volumetria, volumetriaDoProduto),
    [quebra.volumetria, volumetriaDoProduto]
  );

  const aoAbrir = useCallback(
    (q: Quebra) => {
      setQuebra(q);
      setSelecionadoId(null);
      /**
       * §210 — RELATO REAL: abrir outra demanda e encontrar, em "Itens
       * escritos", os itens da demanda ANTERIOR.
       *
       * O item pertence a uma quebra (é o que a rota `/quebras/:id/itens`
       * diz), mas a lista vivia no estado do App e só era recarregada ao
       * ENTRAR na tela — com uma porta de saída (`if (!quebraId) return`) que,
       * numa demanda ainda sem id, deixava na tela o que estava lá antes.
       *
       * A limpeza mora aqui porque `aoAbrir` é o evento "troquei de demanda"
       * (abrir uma salva ou começar uma nova) — e não em `quebraId`, que
       * também muda quando ESTA demanda é salva pela primeira vez, hora em que
       * apagar os itens recém-gerados seria perder trabalho à toa.
       */
      setItensGerados([]);
      /**
       * §213 — o mesmo defeito do §210 noutro lugar, achado varrendo a classe:
       * o painel do assistente guarda o texto num `useState(demandInfo)`,
       * inicializado UMA vez. Com ele aberto durante a troca, o campo
       * continuava exibindo o contexto da demanda anterior — e o próximo
       * "Salvar" gravaria esse texto na demanda nova.
       *
       * Fechar a aba desmonta o painel: quando a pessoa reabrir, ele lê o
       * contexto de quem está aberto agora. Vale para as três abas — a
       * conversa e a de configurar têm rascunho pelo mesmo motivo.
       */
      setAbaAssistente(null);
      /**
       * §300 — RELATO REAL: *"carreguei um cenário pronto, os componentes do
       * novo desenho apareceram, mas sumiram do nada do canvas em seguida"*.
       *
       * Eles não sumiram: ficaram **fora da vista**. Medido — 8 nós no DOM, 4
       * dentro da área visível, e a câmera em `scale(2)`, que era o
       * enquadramento do desenho ANTERIOR (dois nós cabem com zoom 2×; oito,
       * não).
       *
       * O comentário do `adicionarCenario` dizia "os TRÊS caminhos que inserem
       * nós em lote pedem enquadramento", e só dois pediam: adicionar à mesa e
       * a proposta da IA. **Trocar a demanda inteira ficou de fora** — e é o
       * caso mais forte de todos, porque o desenho não é uma adição ao que
       * havia, é outro desenho.
       *
       * Vale para carregar cenário E para abrir uma quebra salva: os dois
       * passam por aqui, e os dois herdavam a câmera de quem estava aberto
       * antes.
       */
      quebraState.pedirEnquadramento();
    },
    [setQuebra, setSelecionadoId, quebraState.pedirEnquadramento]
  );

  const persistencia = usePersistencia(quebra, aoAbrir);

  const [mostrarJornada, setMostrarJornada] = useState(false);
  const [abaJornadaAlvo, setAbaJornadaAlvo] = useState<AbaJornada | undefined>(undefined);
  // SPEC-40 F1 — a tela de config é ROTA (#/config/…), não estado; o menu
  // (☰) é o caminho pra ela. F5 mantém o lugar; condutores navegam por rota.
  const { rota, navegar } = useRotaHash();
  const mostrarConfig = rota.tela === "config";
  const mostrarDocumento = rota.tela === "documento";
  const mostrarSistema = rota.tela === "sistema";
  const mostrarEnsaios = rota.tela === "ensaios";
  const mostrarSpec = rota.tela === "spec";
  // SPEC-41 Parte B — os itens materializados da quebra aberta. A fonte de
  // verdade é o server (persistem por quebra); o estado local é o espelho da
  // última geração/carga desta sessão.
  const [itensGerados, setItensGerados] = useState<ItemGerado[]>([]);
  // SPEC-44 — deep-link da seção dos itens pra revisão: o item a selecionar.
  const [itemInicialRevisao, setItemInicialRevisao] = useState<string | null>(null);
  /**
   * SPEC-64 fatias B e C — a declaração de caminho em curso.
   *
   * `nos` é a sequência clicada até agora. `corrigindo` guarda o id do caminho
   * INFERIDO que originou a correção: ao concluir, ele fica recusado — senão o
   * inferidor o devolveria a cada render e a pessoa corrigiria a mesma
   * sugestão para sempre.
   */
  const [declaracaoDeCaminho, setDeclaracaoDeCaminho] = useState<{ nos: string[]; corrigindo?: string } | null>(null);
  /** SPEC-67 — a régua montada a partir de um fato, esperando o construtor.
   * Some ao ser consumida: ponto de partida que persiste viraria formulário
   * que reabre preenchido com a régua da semana passada. */
  const [reguaDePartida, setReguaDePartida] = useState<RequisitoDeTopologia | null>(null);
  // SPEC-49 — pra onde os itens vão; só pra tela DIZER o destino (a exportação
  // em si é do servidor, que lê a mesma config).
  const [destinoDaExportacao, setDestinoDaExportacao] = useState<string | null>(null);
  /**
   * SPEC-81 fatia B — há para onde publicar o documento?
   *
   * Vem da MESMA busca do destino de itens: são o mesmo documento de
   * configuração, e duas chamadas trariam o mesmo dado duas vezes. Falso = o
   * botão não aparece, em vez de aparecer e falhar (a disciplina da SPEC-49).
   */
  const [podePublicarDocumento, setPodePublicarDocumento] = useState(false);
  useEffect(() => {
    if (!mostrarDocumento) return;
    apiExportador
      .obter()
      .then((c) => {
        setDestinoDaExportacao(c.endpoint ? c.rotulo || c.endpoint : null);
        setPodePublicarDocumento((c.destinos ?? []).some((d) => d.operacao === "documento" && !!d.endpoint));
      })
      .catch(() => {
        setDestinoDaExportacao(null);
        setPodePublicarDocumento(false);
      });
  }, [mostrarDocumento]);
  // SPEC-45 — quantos feedbacks do ciclo ainda esperam alguém: é o que faz o
  // assistente chamar pra tratar (M15) em vez de o texto morrer no banco.
  const [feedbacksNovos, setFeedbacksNovos] = useState(0);
  /** SPEC-59 — a esteira tem com quem falar? É o que separa "papel ativo" de
   * "papel ativo e mudo", que é o defeito mais silencioso da configuração.
   * Buscado só quando a tela abre, como a exportação faz para os itens. */
  const [temCredencialDeIa, setTemCredencialDeIa] = useState(false);
  /** §265 — o rastro da esteira. `undefined` = não foi lido (tela nunca aberta,
   * chamada que falhou), e é diferente de lista vazia — que é "ninguém rodou
   * nada ainda". O mapa trata os dois casos, e misturá-los faria um avatar
   * dizer "nunca rodou" por causa de um erro de rede. */
  const [execucoesDaEsteira, setExecucoesDaEsteira] = useState<ExecucaoDoPapel[] | undefined>(undefined);

  useEffect(() => {
    if (!mostrarSistema) return;
    let cancelado = false;
    apiIa
      .execucoes()
      .then(({ porPapel }) => {
        if (!cancelado) setExecucoesDaEsteira(porPapel);
      })
      .catch(() => {});
    apiIa
      .status()
      .then((st) => {
        // `pronto` cobre os dois modos: gateway configurado ou modelo local
        // instalado. Perguntar por um só deixaria metade das instalações
        // acusando falta de credencial que existe.
        if (!cancelado) setTemCredencialDeIa(Boolean(st.pronto || st.gateway));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [mostrarSistema]);

  const [erroAoSalvarSistema, setErroAoSalvarSistema] = useState<string | null>(null);

  /**
   * §260 — as duas edições que o MAPA provoca, aplicadas de onde se vê o
   * problema.
   *
   * Ver que um papel está desligado e ter que ir a outra tela para ligá-lo é o
   * mapa apontando e cobrando pedágio. Estas duas ações fecham o laço ali.
   *
   * O estado local muda primeiro e o servidor confirma depois — é o padrão do
   * resto do app. Mas a falha **não** pode sumir: sem o aviso, a tela mostraria
   * o estado novo com o servidor guardando o velho, que é a pior combinação
   * possível numa tela de configuração.
   */
  async function salvarPipeline(papeis: ConfigPipelineAgentes["papeis"]) {
    const anterior = pipelineAgentes;
    const novo = { ...pipelineAgentes, papeis };
    setPipelineAgentes(novo);
    setErroAoSalvarSistema(null);
    try {
      await apiPipelineAgentes.salvar(novo);
    } catch (e) {
      // Volta ao que era: deixar a tela otimista sobre uma escrita que falhou
      // é mentir com mais confiança do que não ter salvado.
      setPipelineAgentes(anterior);
      setErroAoSalvarSistema(
        e instanceof Error ? `Não deu para salvar: ${e.message}` : "Não deu para salvar a mudança na esteira."
      );
    }
  }

  /** SPEC-59 fatia A — a ferramenta lida a partir da própria configuração.
   * Usa a config REAL, nunca a de demonstração: esta tela responde "como o meu
   * ambiente está montado", e a do tour mentiria sobre isso. */
  const mapaDoSistema = useMemo(
    () =>
      montarMapaDoSistema({
        papeis: pipelineAgentes.papeis,
        regras: regrasConfig,
        temCredencialDeIa,
        feedbacksAbertos: feedbacksNovos,
        execucoes: execucoesDaEsteira,
      }),
    [pipelineAgentes, regrasConfig, temCredencialDeIa, feedbacksNovos, execucoesDaEsteira]
  );

  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarAbrir, setMostrarAbrir] = useState(false);
  // #298 — a conversa do desenho (SPEC-27 Fase 1) e o contexto do épico moram
  // no mesmo assistente flutuante, cada um numa aba; `null` = fechado. A
  // conversa da especificação continua separada, de propósito (SPEC-27 §3) —
  // ela pertence à tela de revisão, não ao canvas.
  const [abaAssistente, setAbaAssistente] = useState<AbaAssistente | null>(null);
  /** §235 — enquanto o tour percorre telas que leem do servidor (produto,
   * exportação), elas mostram dado de DEMONSTRAÇÃO em vez de tela vazia — e
   * não escrevem nada. Desligado no fim do tour, sempre. */
  const [demonstracaoDoTour, setDemonstracaoDoTour] = useState(false);
  /** §246 — no tour, as decisões de demonstração ENTRAM junto das reais em vez
   * de substituí-las: quem registra uma decisão durante o tour precisa ver a
   * própria aparecer, senão a demonstração ensina que o botão não funciona. */
  const decisoesVisiveis = demonstracaoDoTour
    ? [...DECISOES_DO_TOUR, ...(quebra.decisoes ?? [])]
    : quebra.decisoes;
  /** §251 — a régua da demonstração precisa chegar a TODA superfície que diz
   * mostrá-la. O tour alimentava só o placar e o painel do nó; o documento
   * lia a config real e saía sem decisão nenhuma, contradizendo o passo que
   * acabara de prometê-las. Terceira vez que a demonstração fica pela metade
   * (§244, §245) — daí uma variável só, em vez de um ternário por chamada. */
  const regrasVisiveis = demonstracaoDoTour ? REGRAS_DO_TOUR : regrasConfig;
  // SPEC-37 M9 — "agora não" silencia o momento até a próxima mudança real de
  // estado (recarregar/derivar); condução dispensada não insiste.
  const [derivarDispensado, setDerivarDispensado] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(CHAVE_JORNADA_VISTA)) setMostrarJornada(true);
  }, []);
  function fecharJornada() {
    localStorage.setItem(CHAVE_JORNADA_VISTA, "1");
    setMostrarJornada(false);
  }
  /** Usado pelo tour guiado pra abrir a tela de config já numa aba específica (ou
   * trocar de aba com a tela já aberta), sem o usuário precisar navegar manualmente. */
  function abrirConfigNaAba(aba: AbaConfig) {
    navegar({ tela: "config", area: aba });
  }

  const noSelecionado = quebra.diagrama.nodes.find((n) => n.id === selecionadoId);
  const arestaSelecionada = quebra.diagrama.edges.find((e) => e.id === arestaSelecionadaId);
  const tiposDeNo = Object.entries(diagramaConfig.nodeTypes);

  const [resultado, setResultado] = useState<ResultadoDependenciasDe<Atividade> | null>(null);
  const { vermelhos } = calcularResumoProntidao(quebra.diagrama, diagramaConfig);

  /**
   * SPEC-65 fatia C — a leitura do desenho, calculada UMA vez.
   *
   * Ela alimenta o chip da faixa e as marcas do canvas. Duas chamadas
   * produziriam dois objetos iguais em valor e diferentes em identidade — o que
   * no canvas custa caro, porque o memo das arestas compara por referência (é o
   * §"piscar" que já mordeu este arquivo).
   */
  const leituraDoDesenho = useMemo(
    () => lerDesenho(quebra.diagrama, diagramaConfig),
    [quebra.diagrama, diagramaConfig]
  );
  // As dispensas entram AQUI, e não só no painel: sem elas, calar uma leitura
  // tirava a linha do popover e deixava a marca de pé no canvas — o silêncio
  // pedido valendo em metade da tela. Foi o E2E que pegou.
  const marcasDaLeitura = useMemo(
    () => marcasPorNo(leituraDoDesenho, quebra.leiturasDispensadas),
    [leituraDoDesenho, quebra.leiturasDispensadas]
  );

  // SPEC-37 Fase 3 — M2 (canvas vazio), M3 (proposta aplicada, campos por
  // preencher) e M8 (config aberta sem padrões do time). A DECISÃO de qual
  // momento vale mora em `momentos.ts` (pura, com a prioridade testada);
  // aqui só se coletam os fatos e se guardam os dispensados da sessão.
  const [momentosDispensados, setMomentosDispensados] = useState<string[]>([]);
  const [aplicouProposta, setAplicouProposta] = useState(false);
  const dispensar = (m: string) => setMomentosDispensados((d) => [...d, m]);

  const momentoCanvas = momentoDoCanvas({
    nodes: quebra.diagrama.nodes.length,
    vermelhos: vermelhos.length,
    temResultado: !!resultado,
    aplicouProposta,
    // §270 — passou a significar "documento já aprovado alguma vez": aprovar é
    // o único escritor de `especificacao` desde que a geração de especificação
    // saiu (era o mesmo markdown por outra porta).
    temDocumentoAprovado: !!quebra.especificacao,
    dispensados: derivarDispensado ? [...momentosDispensados, "m9"] : momentosDispensados,
  });
  useEffect(() => {
    if (!mostrarConfig) return;
    apiPdca
      .listarFeedback()
      .then((fs) => setFeedbacksNovos(fs.filter((f) => f.estado === "novo").length))
      .catch(() => {});
  }, [mostrarConfig, rota]);

  const momentoConfig = momentoDaConfig({
    configAberta: mostrarConfig,
    feedbacksNovos,
    // "Padrões do time" = algum campo customizado DESTE time ou alguma regra
    // já configurada — instalação com o exemplo de fábrica não é nua.
    temPadroesDoTime:
      camposNo.some((c) => c.timeId === timeAtivo) || Object.keys(regrasConfig?.porTech ?? {}).length > 0,
    dispensados: momentosDispensados,
  });

  // SPEC-37 M9 — a condição do momento: há diagrama, está todo verde, e a
  // derivação ainda não aconteceu. Some sozinho ao derivar ou ao dispensar.
  const momentoDerivarAtivo = momentoCanvas === "m9";

  // SPEC-37 (pedido do usuário) — o rascunho é livre, mas derivar é o momento
  // do compromisso: sem título, o assistente pergunta o nome da demanda ANTES,
  // porque é ele que permite o auto-save depois de gerar os itens. "Derivar
  // sem salvar" continua a um clique — rascunho que não quer virar registro
  // não é obrigado a virar.
  // O campo "Título" saiu do header (pedido do usuário: o nome é mapeado só
  // via agente). A pergunta do balão ganhou INTENÇÃO: "derivar" (M10, com
  // auto-save) ou "salvar" (o Salvar sem título pergunta em vez de travar).
  const [pedindoNomeDaDemanda, setPedindoNomeDaDemanda] = useState<false | "derivar" | "salvar">(false);
  const [autoSalvarPendente, setAutoSalvarPendente] = useState(false);
  const [salvarAposNome, setSalvarAposNome] = useState(false);

  // SPEC-39 M11 — a entrevista do PDCA: o servidor conta os usos e diz
  // quando é o momento; a fala cita as últimas quebras do time.
  const [entrevistaPdca, setEntrevistaPdca] = useState<string[] | null>(null);

  function executarDerivacao(salvarDepois: boolean) {
    apiPdca
      .uso("derivacao", timeAtivo)
      .then((r) => {
        if (r.momento) setEntrevistaPdca(r.ultimosItens);
      })
      .catch(() => {});
    // §240 — as regras entram na derivação: é delas que saem os itens de
    // conformidade. Sem passá-las aqui, a violação apareceria no placar e
    // nunca chegaria ao backlog, que é justamente onde ela precisa chegar.
    const atividades = derivar(quebra.diagrama, diagramaConfig, {
      time: quebra.time,
      regras: regrasConfig,
      // §242 — violação já decidida não vira item de novo.
      excecoes: quebra.excecoes,
      // §249 — sem os caminhos aqui, a violação de percurso apareceria no
      // placar e nunca chegaria ao backlog (mesmo achado do §240).
      percursos: quebra.percursos,
      // SPEC-79 fatia C — mesmo achado, terceira vez: sem os tokens aqui, a
      // violação de design system apareceria no placar e nunca viraria item.
      tokens,
    });
    setResultado(resolverDependencias(atividades));
    setPedindoNomeDaDemanda(false);
    if (salvarDepois) setAutoSalvarPendente(true);
  }

  /**
   * §261 — o que se está IGNORANDO ao derivar.
   *
   * O portão consultava só completude, e as quatro dimensões novas (propósito,
   * padrão, caminho, decisões) eram amarelas que ninguém lia no momento da
   * decisão — o que é o mesmo que medida nenhuma.
   *
   * Não bloqueia: a régua de que bloquear cedo ensina a ignorar a cor continua
   * valendo desde o §230. O que muda é o silêncio virar **reconhecimento**.
   */
  const avisosParaDerivar = useMemo(
    () =>
      avisosDaDerivacao(quebra.diagrama, diagramaConfig, {
        regras: regrasVisiveis,
        // SPEC-63 — quem já aceitou a violação de forma com motivo não precisa
        // reconhecê-la de novo a cada derivação.
        excecoes: quebra.excecoes,
        necessidades: quebra.necessidades,
        decisoes: decisoesVisiveis,
        percursos: quebra.percursos,
      }),
    [quebra, diagramaConfig, regrasVisiveis, decisoesVisiveis]
  );
  const [avisosPendentes, setAvisosPendentes] = useState(false);

  function derivarQuebra() {
    // SPEC-38 — visualizar deriva (é leitura computada do diagrama), mas sem a
    // pergunta do nome nem auto-save: salvar seria 403 no servidor.
    if (somenteLeitura) {
      executarDerivacao(false);
      return;
    }
    // O reconhecimento vem ANTES da pergunta do nome: nomear a demanda para só
    // depois descobrir o que ficou para trás inverteria a ordem das decisões.
    if (avisosParaDerivar.length > 0) {
      setAvisosPendentes(true);
      return;
    }
    if (!(quebra.titulo ?? "").trim()) {
      // O balão só existe com o assistente fechado — fechar garante que a
      // pergunta apareça mesmo se o chat estava aberto.
      setAbaAssistente(null);
      setPedindoNomeDaDemanda("derivar");
      return;
    }
    executarDerivacao(true);
  }

  /** Seguir depois de ver os avisos: é um clique, e não um formulário. O preço
   * do reconhecimento tem que ser baixo, senão ele vira obstáculo e a pessoa
   * aprende a odiar a medição em vez de usá-la. */
  function derivarMesmoAssim() {
    setAvisosPendentes(false);
    if (somenteLeitura) return executarDerivacao(false);
    if (!(quebra.titulo ?? "").trim()) {
      setAbaAssistente(null);
      setPedindoNomeDaDemanda("derivar");
      return;
    }
    executarDerivacao(true);
  }

  function confirmarNome(nome: string) {
    const intencao = pedindoNomeDaDemanda;
    setQuebra((q) => ({ ...q, titulo: nome }));
    setPedindoNomeDaDemanda(false);
    if (intencao === "derivar") executarDerivacao(true);
    else setSalvarAposNome(true);
  }

  /** O Salvar do header: com título salva direto; sem, o agente pergunta. */
  /**
   * SPEC-57 M4 — o agente propõe decisões lendo o desenho **medido**.
   *
   * O que vai no pedido é o ponto da fatia: além do diagrama, vão as violações
   * de padrão (com o porquê de cada padrão) e as lacunas de propósito. Um
   * agente que recebe só o desenho devolve decisão genérica de blog; um que
   * recebe o que está fora da régua devolve decisão sobre ESTE desenho — que é
   * a tese da SPEC-56 §0.7, o motor mede e o agente explica.
   *
   * Chega como `proposta`/`sugerido`, sempre: a regra 2 cuida do resto.
   */
  async function pedirDecisoesAoAgente() {
    const violacoes = violacoesEmAberto(
      avaliarConformidade(quebra.diagrama, diagramaConfig, regrasConfig, quebra.excecoes ?? [], tokens)
    );
    const lacunas = analisarLacunas(quebra.diagrama, quebra.necessidades ?? []);
    const textoDaLacuna = (id: string) => quebra.necessidades?.find((n) => n.id === id)?.texto ?? id;

    const { decisoes } = await apiIa.proporDecisoes({
      contextoEpico: quebra.demandInfo,
      componentes: quebra.diagrama.nodes.map((n) => ({
        id: n.id,
        rotulo: n.label,
        tipo: diagramaConfig.nodeTypes[n.type]?.label ?? n.type,
        // Só os campos preenchidos, e resumidos: mandar o spec inteiro gastaria
        // token descrevendo vazio.
        campos:
          Object.entries(n.spec)
            .filter(([, v]) => v.valor !== undefined && v.valor !== "")
            .map(([k, v]) => `${k}=${String(v.valor)}`)
            .join(", ") || undefined,
      })),
      violacoes: violacoes.map((v) => ({
        noId: v.noId,
        campo: v.campo,
        esperado: v.esperado,
        atual: v.atual,
        porque: v.porque,
      })),
      lacunas: lacunas.semElemento.map(textoDaLacuna),
      // Sem isto o agente re-litiga o que já foi decidido, e a pessoa aprende a
      // ignorar as propostas.
      jaDecididas: (quebra.decisoes ?? []).filter((d) => d.status !== "substituida").map((d) => d.titulo),
    });

    // A régua das duas alternativas é do PRODUTO, não do modelo: `minItems` é
    // removido do esquema antes de chegar ao provedor (Structured Outputs não
    // o aceita — ver `provedorOpenAI`), então o prompt pede e nada garante.
    // Proposta com uma opção só é opinião vestida de decisão, e ela para aqui.
    const comAlternativaReal = decisoes.filter((p) => p.alternativas.length >= 2);

    setQuebra((q) => ({
      ...q,
      decisoes: [
        ...(q.decisoes ?? []),
        ...comAlternativaReal.map((p, i) => ({
          id: `d-agente-${Date.now()}-${i}`,
          noId: p.noId,
          titulo: p.titulo,
          contexto: p.contexto,
          alternativas: p.alternativas,
          escolhida: p.escolhida,
          porque: p.porque,
          status: "proposta" as const,
          origem: "sugerido" as const,
          autor: "agente",
          em: new Date().toISOString(),
        })),
      ],
    }));
  }

  /**
   * SPEC-58 — o documento montado a partir da MESMA estrutura que alimenta a
   * tela, o HTML e (pelos mesmos dados) o markdown. Três montagens paralelas
   * divergiriam na primeira mudança, e o jeito de descobrir seria alguém
   * reclamar que o arquivo exportado não tem o que a tela tinha (§7.3).
   *
   * `useMemo` porque isto roda medição de verdade — conformidade, percursos,
   * lacunas — e a tela é grande.
   */
  /**
   * SPEC-58 — o documento DERIVA por conta própria, em vez de esperar que
   * alguém tenha clicado "Derivar Quebra" nesta sessão.
   *
   * Achado pelo E2E: ao reabrir uma demanda salva, `resultado` é `null`, e o
   * documento saía sem item nenhum — dizendo "nenhum item derivado" sobre uma
   * demanda que tem itens. Pior: a comparação com a foto da aprovação passava a
   * não enxergar mudança de desenho, porque o texto comparado não continha o
   * desenho.
   *
   * Derivar aqui é barato e puro (é o mesmo motor determinístico), e a
   * referência memoizada é o que impede o `srcDoc` do diagrama de recarregar a
   * cada tecla — o que roubava o foco de quem estivesse escrevendo.
   */
  const atividadesDoDocumento = useMemo(() => {
    if (resultado) return resultado.atividades;
    try {
      return derivar(quebra.diagrama, diagramaConfig, {
        time: quebra.time,
        regras: regrasConfig,
        excecoes: quebra.excecoes,
        percursos: quebra.percursos,
        tokens,
      });
    } catch {
      // Diagrama que a config atual não sabe ler não é motivo para a tela
      // inteira sumir — o documento sai sem itens, e as outras seções ficam.
      return [];
    }
  }, [resultado, quebra.diagrama, quebra.time, quebra.excecoes, quebra.percursos, diagramaConfig, regrasConfig]);
  const documentoDaDemanda = useMemo(
    () =>
      estruturarDocumento(atividadesDoDocumento, quebra.diagrama, diagramaConfig, {
        titulo: quebra.titulo?.trim() || "Documento de desenho",
        demandInfo: quebra.demandInfo,
        contextoDoProduto,
        time: quebra.time,
        regras: regrasVisiveis,
        necessidades: quebra.necessidades,
        decisoes: decisoesVisiveis,
        excecoes: quebra.excecoes,
        percursos: quebra.percursos,
      }),
    [atividadesDoDocumento, quebra, diagramaConfig, contextoDoProduto, regrasVisiveis, decisoesVisiveis]
  );

  /* SPEC-61 §3 — o `gerarDiagramaHtml` deixou de alimentar o documento: o
     desenho lá é FIGURA (o mesmo React Flow da mesa, em leitura), e o iframe
     animado trazia junto um painel lateral que mudava de tamanho sozinho. Ele
     não morreu — continua sendo o "Baixar diagrama (.html)" da revisão (§6.5),
     que é o artefato para quem não tem acesso à ferramenta. */

  /**
   * SPEC-58 §5 — o CARIMBO da aprovação, e o que ele resolve.
   *
   * O documento é montado ao vivo: não há "regenerar" a clicar. Então "aprovar"
   * guarda o markdown do momento em `quebra.especificacao` — a coluna que
   * existia desde o §184 e servia só de booleano, e que agora tem um propósito
   * real: ser a FOTO do que foi aprovado.
   *
   * Comparar a foto com o documento de agora responde a pergunta que faz
   * "aprovado" não virar carimbo: *mudou algo depois?* Sem isso o selo diria
   * "aprovado" sobre um desenho que ninguém aprovou.
   */
  /**
   * SPEC-69 fatia D — os ensaios ASSUMIDOS, calculados uma vez.
   *
   * A conta roda uma simulação por ensaio aceito, e o documento é montado ao
   * vivo a cada render — sem o `useMemo` isso seria refeito a cada tecla
   * digitada na seção de riscos. Depende do desenho e dos ensaios, e de mais
   * nada: mudar o texto do documento não muda o número.
   */
  const ensaiosDaQuebra = useMemo(
    () =>
      ensaiosAssumidos(
        quebra.diagrama,
        diagramaConfig,
        quebra.cenariosDeLentidao ?? [],
        quebra.necessidades ?? [],
        undefined,
        volumetriaEmVigorAgora?.valor
      ),
    [quebra.diagrama, diagramaConfig, quebra.cenariosDeLentidao, quebra.necessidades, volumetriaEmVigorAgora]
  );

  const markdownDoDocumento = useMemo(
    () =>
      gerarEspecificacaoEntrega(atividadesDoDocumento, quebra.diagrama, diagramaConfig, {
        regras: regrasVisiveis,
        demandInfo: quebra.demandInfo,
        contextoDoProduto,
        template: especificacaoTemplate.conteudo,
        templateItem: templateItem?.conteudo,
        time: quebra.time,
        respostasItens: quebra.respostasItens,
        necessidades: quebra.necessidades,
        decisoes: decisoesVisiveis,
        excecoes: quebra.excecoes,
        percursos: quebra.percursos,
        visaoGeral: quebra.artefatosEscritos?.documento?.visaoGeral,
        tradeOffs: quebra.artefatosEscritos?.documento?.tradeOffs,
        riscos: quebra.artefatosEscritos?.documento?.riscos,
        ensaios: ensaiosDaQuebra,
      }),
    [atividadesDoDocumento, quebra, diagramaConfig, contextoDoProduto, regrasVisiveis, decisoesVisiveis, especificacaoTemplate, templateItem, ensaiosDaQuebra]
  );

  const documentoDesatualizado =
    quebra.documentoStatus === "aprovado" && !!quebra.especificacao && quebra.especificacao !== markdownDoDocumento;

  /**
   * SPEC-73 fatia D — quantas lacunas vão junto desta aprovação.
   *
   * A mesma contagem que já existia por ITEM, agora sobre o documento INTEIRO:
   * a visão geral e o Gherkin genérico são de topo, e por isso nunca passavam
   * por ela. Aprovar com lacuna **contada** é decisão; aprovar com lacuna
   * invisível é acidente — e o §248 chama isso de verde falso.
   *
   * Não bloqueia (§230). Um documento com três lacunas declaradas pode ser
   * aprovado de propósito, e o produto inteiro é construído sobre essa
   * distinção. O que não pode é a lacuna ser invisível.
   */
  const lacunasDoDocumento = useMemo(
    () => contar(markdownDoDocumento, MARCADOR_ESPECIFICAR),
    [markdownDoDocumento]
  );

  /**
   * SPEC-84 fatia A — a spec, montada no cliente como o documento é.
   *
   * O mesmo desenho do §313: motor determinístico dentro de um `useMemo`, e o
   * markdown que a tela mostra é o MESMO que o download entrega. Duas montagens
   * fariam o arquivo baixado divergir do que a pessoa leu antes de baixar.
   *
   * A `medicao` reusa o que o documento já apurou (`saude`, lado "atencao") em
   * vez de recalcular: duas leituras da mesma pergunta divergem na primeira
   * mudança, e é a régua do §263.
   */
  const specDaDemanda = quebra.artefatosEscritos?.spec ?? {};

  const coberturaDaSpecAtual = useMemo(
    () => coberturaDaSpec(atividadesDoDocumento, specDaDemanda),
    [atividadesDoDocumento, specDaDemanda]
  );

  const markdownDaSpec = useMemo(
    () =>
      gerarSpec({
        titulo: quebra.titulo?.trim() || "Spec",
        escrita: specDaDemanda,
        contexto: [contextoDoProduto, quebra.demandInfo].filter((t) => t?.trim()).join("\n\n"),
        medicao: documentoDaDemanda.saude.filter((s) => s.lado === "atencao").map((s) => s.rotulo),
        itens: atividadesDoDocumento,
      }),
    [quebra.titulo, quebra.demandInfo, specDaDemanda, contextoDoProduto, documentoDaDemanda, atividadesDoDocumento]
  );

  /** A mesma régua do §313, no segundo artefato: lacuna contada, nunca estimada. */
  const lacunasDaSpec = useMemo(() => contar(markdownDaSpec, MARCADOR_ESPECIFICAR), [markdownDaSpec]);

  function mudarSpecEscrita(spec: SpecEscrita) {
    setQuebra((q) => ({ ...q, artefatosEscritos: { ...q.artefatosEscritos, spec } }));
  }

  /**
   * Marcar e desmarcar são o MESMO gesto, de propósito: a lista de itens
   * cobertos é um conjunto, e dar dois botões para entrar e sair dele
   * duplicaria a regra de "o que já está lá" em dois lugares.
   */
  function alternarItemDaSpec(chave: string) {
    const cobertos = specDaDemanda.itensCobertos ?? [];
    mudarSpecEscrita({
      ...specDaDemanda,
      itensCobertos: cobertos.includes(chave) ? cobertos.filter((c) => c !== chave) : [...cobertos, chave],
    });
  }

  function baixarSpecMarkdown() {
    baixarArquivoTexto(markdownDaSpec, "spec.md", "text/markdown");
  }

  // §264 — e O QUÊ mudou. Só quando há o que comparar: rodar a comparação num
  // documento em dia seria trabalho para produzir lista vazia a cada render.
  const mudancasDesdeAprovacao = useMemo(
    () => (documentoDesatualizado ? compararDocumentos(quebra.especificacao ?? "", markdownDoDocumento) : undefined),
    [documentoDesatualizado, quebra.especificacao, markdownDoDocumento]
  );

  function mudarStatusDoDocumento(documentoStatus: StatusDocumento) {
    setQuebra((q) => ({
      ...q,
      documentoStatus,
      // Aprovar carimba; sair de aprovado NÃO apaga a foto — ela é o histórico
      // do que já foi aprovado uma vez, e apagá-la perderia a única referência
      // que existe para comparar.
      especificacao: documentoStatus === "aprovado" ? markdownDoDocumento : q.especificacao,
    }));
  }

  function baixarDocumentoMarkdown() {
    // O MESMO markdown que o carimbo usa: duas montagens fariam o arquivo
    // baixado divergir da foto da aprovação sem ninguém notar.
    baixarArquivoTexto(markdownDoDocumento, "documento-de-desenho.md", "text/markdown");
  }

  /**
   * SPEC-81 fatia B — manda o documento para a base de conhecimento da casa.
   *
   * O markdown é o MESMO que o download entrega e que o carimbo da aprovação
   * usa: remontá-lo no servidor seria uma segunda implementação da geração, e as
   * duas divergiriam na primeira mudança (§263).
   *
   * O 409 de "há mais de um destino" chega como mensagem — a escolha entre dois
   * espaços de documentação é da pessoa, e o servidor recusa escolher por ela.
   */
  async function publicarDocumento() {
    return apiQuebras.publicarDocumento(persistencia.quebraId!, {
      markdown: markdownDoDocumento,
      desatualizado: !!documentoDesatualizado,
    });
  }

  function salvarQuebra() {
    if ((quebra.titulo ?? "").trim()) {
      void persistencia.salvar();
      return;
    }
    setAbaAssistente(null);
    setPedindoNomeDaDemanda("salvar");
  }

  // O auto-save espera o RENDER com o título aplicado (setQuebra é assíncrono
  // — salvar no mesmo tick gravaria a quebra sem nome, status "sem-titulo").
  useEffect(() => {
    if (autoSalvarPendente && resultado && (quebra.titulo ?? "").trim()) {
      setAutoSalvarPendente(false);
      void persistencia.salvar();
    }
  }, [autoSalvarPendente, resultado, quebra.titulo]);

  // O mesmo tick-de-render do auto-save, para o Salvar-com-pergunta: o nome
  // precisa estar APLICADO na quebra antes de gravar.
  useEffect(() => {
    if (salvarAposNome && (quebra.titulo ?? "").trim()) {
      setSalvarAposNome(false);
      void persistencia.salvar();
    }
  }, [salvarAposNome, quebra.titulo]);

  // Entrar no documento (menu, deep-link ou F5) recarrega os itens do server —
  // o que está salvo é o que vale; a geração local só espelha na hora.
  useEffect(() => {
    // Demanda sem id não tem o que buscar: o que estiver na tela são os itens
    // LOCAIS desta mesma demanda (gerados antes de ela ser salva), e apagá-los
    // aqui seria perder trabalho — a limpeza de §210 mora em `aoAbrir`, que é
    // o evento "troquei de demanda".
    if (!mostrarDocumento || !persistencia.quebraId) return;
    let cancelado = false;
    apiItensGerados
      .listar(persistencia.quebraId)
      .then((itens) => {
        if (!cancelado) setItensGerados(itens);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [mostrarDocumento, persistencia.quebraId]);

  /**
   * SPEC-41 Parte B — o clique "Gerar itens" da revisão: persiste o conjunto
   * (quando a quebra está salva) e leva a quem os mostra. Sem id ainda, os
   * itens vivem no estado — salvos na próxima geração com a quebra salva.
   *
   * SPEC-61 §6.2 — o destino passou a ser `#/documento`, na seção dos itens.
   * `#/itens` deixou de existir, e gerar continua sendo ato da REVISÃO: o
   * documento é onde se lê o resultado, nunca onde se pede por ele.
   */
  function aoGerarItens(itens: ItemDeTrabalho[]) {
    const locais: ItemGerado[] = itens.map((it) => ({
      ...it,
      id: it.chave,
      quebraId: persistencia.quebraId ?? "",
      estado: "gerado",
      linkExterno: null,
      criadoEm: new Date().toISOString(),
    }));
    setItensGerados(locais);
    if (persistencia.quebraId) {
      apiItensGerados
        .regerar(persistencia.quebraId, itens)
        .then(setItensGerados)
        .catch(() => {});
    }
    navegar({ tela: "documento" });
  }

  const opcoesTour = {
    cenarios,
    carregarCenario: (q: Quebra) => aoAbrir(q),
    selecionarNo: setSelecionadoId,
    // O tour/demo deriva DIRETO, sem a pergunta do nome nem auto-save — é uma
    // demonstração, não uma quebra de verdade para registrar. Fecha o
    // reconhecimento junto: o passo anterior o abriu de propósito, e deixá-lo
    // aberto sobre a revisão seria o tour se atropelando.
    derivarQuebra: () => {
      setAvisosPendentes(false);
      executarDerivacao(false);
    },
    mostrarAvisos: () => setAvisosPendentes(true),
    fecharRevisao: () => setResultado(null),
    abrirConfigNaAba,
    /**
     * §251 — o tour passa pelo DOCUMENTO. NÃO limpa `resultado`: o passo
     * seguinte é a SEÇÃO dos itens, que só tem o que mostrar se a derivação
     * continuar de pé (§234). A revisão não atrapalha porque ela se esconde
     * para o documento.
     *
     * SPEC-48 + SPEC-61 §6.3 — e ele ESCREVE os itens antes de abrir, como o
     * `abrirItens` fazia antes da fusão e como faz o botão da revisão. Navegar
     * sozinho mostraria uma seção de "ainda não escrito", contradizendo o texto
     * do passo, que promete os cards (§234).
     */
    abrirDocumento: () => {
      if (resultado) {
        aoGerarItens(
          gerarItensDeTrabalho(resultado.atividades, quebra.diagrama, diagramaConfig, {
            regras: regrasConfig,
            respostasItens: quebra.respostasItens,
            templateItem: templateItem?.conteudo,
          })
        );
      } else {
        navegar({ tela: "documento" });
      }
    },
    abrirSistema: () => navegar({ tela: "sistema" }),
    abrirProposito: () => setAbaAssistente("contexto"),
    fecharAssistente: () => setAbaAssistente(null),
    abrirConversa: () => setAbaAssistente("conversa"),
    ligarDemonstracao: setDemonstracaoDoTour,
    fecharJornada,
    fecharConfig: () => navegar({ tela: "canvas" }),
  };

  const tour = useTour(opcoesTour);
  /** §236 — o segundo tour: o que se molda pro time. Separado para o primeiro
   * continuar respondendo "isto serve pra quê?" em vez de virar 25 passos. */
  const tourDeConfiguracao = useTour(opcoesTour, passosDeConfiguracao);

  function iniciarTour() {
    fecharJornada();
    tour.iniciar();
  }

  function iniciarTourDeConfiguracao() {
    fecharJornada();
    tourDeConfiguracao.iniciar();
  }

  // Os três caminhos que inserem nós em LOTE pedem enquadramento pelo mesmo
  // motivo: sem isso o material novo cai fora da área visível (ver
  // `pedirEnquadramento` em useQuebra).
  function adicionarCenario(q: Quebra) {
    setQuebra((atual) => ({ ...atual, diagrama: mesclarDiagrama(atual.diagrama, q.diagrama) }));
    quebraState.pedirEnquadramento();
  }

  /** SPEC-43 — captura os campos preenchidos de um nó real como stack
   * CONHECIDA do catálogo global (não mais "padrão do time"): os valores
   * viram sugestão pra todo mundo assim que salvos. */
  function salvarComoStackConhecida(tipoNo: string, valores: Record<string, unknown>) {
    const soStrings = Object.fromEntries(
      Object.entries(valores)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    );
    void apiStacks
      .capturar(tipoNo, soStrings)
      .then(() => apiStacks.sugestoes().then(setSugestoesDeStack))
      .catch(() => {});
  }

  /** Compartilhado entre o <select> (sessão hospedada) e o <input> de texto
   * livre (modo local) do campo "Time" do header — trocar sempre atualiza os
   * dois: o time da quebra em si e o timeAtivo (que dirige sugestões e campos
   * customizados carregados). */
  function aoMudarTime(novoTime: string) {
    setQuebra((q) => ({ ...q, time: novoTime }));
    onTrocarTimeAtivo(novoTime);
  }

  /** Depois de qualquer CRUD de campo customizado, recarrega a config mesclada
   * (loadConfig.ts) em vez de duplicar a lógica de merge aqui — o servidor é a
   * única fonte de verdade de como global+time se combinam (SPEC-08 §3.3). */
  async function recarregarConfig() {
    const nova = await carregarConfig(timeAtivo);
    setDiagramaConfig(nova.diagramaConfig);
    // SPEC-63 — as REGRAS também. Elas eram prop e nunca eram relidas: uma
    // régua criada na tela de configuração só passava a valer depois de um F5,
    // e régua que não vale quando se cria é régua em que o time não confia. É
    // o mesmo buraco que a SPEC-52 fechou para a ficha (onFichaMudou), na
    // outra metade da config.
    setRegrasConfig(nova.regrasConfig);
  }

  async function criarCampoNo(dadosCampo: DadosCampoNo) {
    const criado = await apiCamposNo.criar(dadosCampo);
    setCamposNo((atual) => [...atual, criado]);
    await recarregarConfig();
  }

  async function atualizarCampoNo(id: string, dadosCampo: Partial<DadosCampoNo>) {
    const atualizado = await apiCamposNo.atualizar(id, dadosCampo);
    setCamposNo((atual) => atual.map((c) => (c.id === id ? atualizado : c)));
    await recarregarConfig();
  }

  async function excluirCampoNo(id: string) {
    await apiCamposNo.excluir(id);
    setCamposNo((atual) => atual.filter((c) => c.id !== id));
    await recarregarConfig();
  }

  async function criarCampoAresta(dadosCampo: DadosCampoAresta) {
    const criado = await apiCamposAresta.criar(dadosCampo);
    setCamposAresta((atual) => [...atual, criado]);
    await recarregarConfig();
  }

  async function atualizarCampoAresta(id: string, dadosCampo: Partial<DadosCampoAresta>) {
    const atualizado = await apiCamposAresta.atualizar(id, dadosCampo);
    setCamposAresta((atual) => atual.map((c) => (c.id === id ? atualizado : c)));
    await recarregarConfig();
  }

  async function excluirCampoAresta(id: string) {
    await apiCamposAresta.excluir(id);
    setCamposAresta((atual) => atual.filter((c) => c.id !== id));
    await recarregarConfig();
  }

  /** Recarrega o efetivo (global+override do time) depois de salvar — mesmo
   * raciocínio de `recarregarConfig`: o servidor é a única fonte de verdade
   * de como global+time se combinam, não duplica o merge aqui. */
  async function salvarEspecificacaoTemplate(dados: { timeId?: string; conteudo: string }) {
    await apiEspecificacaoTemplate.salvar(dados);
    setEspecificacaoTemplate(await apiEspecificacaoTemplate.buscar(timeAtivo));
  }

  async function salvarPipelineAgentes(dados: ConfigPipelineAgentes) {
    setPipelineAgentes(await apiPipelineAgentes.salvar(dados));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          rowGap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--borda)",
          background: "var(--painel)",
        }}
      >
        {/* A autoria fica no título, não num rodapé: rodapé de app de tela
            cheia é o lugar onde nada é lido. `title` em vez de texto visível
            porque o cabeçalho é estreito — mas o dado viaja no HTML, e é o que
            sobrevive a alguém copiar a pasta e chamar de seu. */}
        {/* SPEC-40 F1 — frequência no header, gestão no menu: tudo que é
            administração/aprendizado mora atrás do ☰. */}
        {/* Só quando o canvas é a tela — a tela de config tem o SEU ☰; dois
            no DOM viravam strict-violation em todo clique de menu. */}
        {!mostrarConfig && (
          <button onClick={() => setMenuAberto(true)} data-tour="menu-botao" style={botaoEstilo}>
            ☰ Menu
          </button>
        )}
        <strong
          title="Gerador de Itens — Silvio Allgayer Trindade (Apache-2.0). github.com/silvioAL/gerador-de-itens"
          style={{ fontSize: 14, color: "var(--texto)" }}
        >
          Gerador de Itens
        </strong>
        {versao && (
          <span
            title="Versão do pacote gerador-de-itens instalado — mesma versão da tag no GitHub"
            style={{
              fontSize: 10.5,
              color: "var(--texto-fraco)",
              background: "var(--painel-alto)",
              borderRadius: 999,
              padding: "1px 7px",
              marginRight: 8,
            }}
          >
            v{versao}
          </span>
        )}


        <div style={{ width: 1, height: 20, background: "var(--borda-forte)" }} />

        {/* O campo de digitar título MORREU: o nome da demanda é mapeado pelo
            agente (balão-pergunta no derivar/salvar). Aqui só se LÊ. */}
        {(quebra.titulo ?? "").trim() !== "" && (
          <span
            data-testid="titulo-da-quebra"
            title="O nome da demanda — perguntado pelo assistente ao derivar ou salvar."
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--texto)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {quebra.titulo}
          </span>
        )}

        <div style={{ width: 1, height: 20, background: "var(--borda-forte)" }} />

        {/* §198 — as duas portas de EXPERIMENTAR, separadas uma da outra e da
            paleta: "cenários prontos" (material pra carregar) e
            "demonstração & tour" (o produto se explicando) eram a mesma
            entrada escondida no menu. Ficam antes da paleta, que reflui em
            duas linhas — assim a posição delas não muda com o tamanho da
            janela. O estilo é deliberadamente outro: quem chega distingue
            "isto me ensina" de "isto adiciona um componente". */}
        <button
          onClick={() => {
            setAbaJornadaAlvo("cenarios");
            setMostrarJornada(true);
          }}
          data-testid="abrir-cenarios"
          title="Diagramas prontos pra carregar na mesa de projeto e experimentar"
          style={botaoExperimentarEstilo}
        >
          ✦ Cenários prontos
        </button>
        <button
          onClick={() => {
            setAbaJornadaAlvo("jornada");
            setMostrarJornada(true);
          }}
          data-testid="abrir-como-funciona"
          title="Como o produto funciona — a jornada, os cenários prontos e os dois tours"
          style={botaoExperimentarEstilo}
        >
          ▶ Como funciona
        </button>

        <div style={{ width: 1, height: 20, background: "var(--borda-forte)" }} />

        {tiposDeNo.map(([tipo, cfg]) => (
          <button
            key={tipo}
            onClick={() => {
              const indice = quebra.diagrama.nodes.length;
              const coluna = indice % 4;
              const linha = Math.floor(indice / 4);
              adicionarNo(tipo, 120 + coluna * 240, 100 + linha * 180);
            }}
            style={botaoEstilo}
          >
            + {cfg.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />


        <span style={{ fontSize: 11, color: "var(--texto-mudo)", whiteSpace: "nowrap" }}>
          {persistencia.quebraId ? quebra.time ?? "sem time" : "nova quebra"} ·{" "}
          {{
            "sem-arquivo": "não salva",
            salvo: "salva",
            salvando: "salvando…",
            "nao-salvo": "alterações pendentes",
            "sem-titulo": "dê um título antes de salvar",
            erro: "erro ao salvar",
          }[persistencia.status]}
        </span>
        {!somenteLeitura && (
          <button
            onClick={salvarQuebra}
            title="Salvar a quebra — sem nome ainda, o assistente pergunta primeiro."
            style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}
          >
            Salvar
          </button>
        )}
        <button
          data-tour="derivar-button"
          onClick={derivarQuebra}
          disabled={vermelhos.length > 0}
          title={
            vermelhos.length > 0
              ? `Faltam resolver: ${vermelhos.map((v) => v.no.label).join(", ")}`
              : "Deriva os itens a partir do diagrama atual"
          }
          style={{
            ...botaoEstilo,
            ...botaoPrimarioEstilo,
            ...(vermelhos.length > 0 ? botaoDesabilitadoEstilo : {}),
          }}
        >
          Derivar Quebra
        </button>
      </header>

      <MenuLateral
        aberto={menuAberto}
        onFechar={() => setMenuAberto(false)}
        timeAtivo={quebra.time ?? timeAtivo}
        timeIds={sessao.timeIds}
        email={sessao.email}
        onTrocarTime={aoMudarTime}
        onNavegar={(area) => abrirConfigNaAba(area)}
        podeEditarArea={(area) => {
          // Regras é a exceção de sempre: uma tela, QUATRO recursos — quem
          // cuida de uma seção só continua entrando sem cadeado.
          if (area === "regras") return Object.values(RECURSO_DA_SECAO_DE_REGRAS).some((r) => permissoes.pode(r));
          if (area === "pdca" || area === "exportacao") return true;
          const recurso = RECURSO_DA_ABA[area];
          return recurso ? permissoes.pode(recurso) : true;
        }}
        onNovaQuebra={() => {
          navegar({ tela: "canvas" });
          persistencia.nova(quebraVazia(timeAtivo));
        }}
        onAbrirQuebras={() => {
          navegar({ tela: "canvas" });
          setMostrarAbrir(true);
        }}
        onDocumento={() => navegar({ tela: "documento" })}
          onSpec={() => navegar({ tela: "spec" })}
        onSistema={() => navegar({ tela: "sistema" })}
        onSair={() => void onSair()}
      />

      {edgeRejeitada && (
        <div
          style={{
            padding: "6px 16px",
            background: "#3a1d1d",
            color: "var(--vermelho)",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{edgeRejeitada.motivo}</span>
          <button onClick={limparEdgeRejeitada} style={{ ...linkEstilo, color: "var(--vermelho)" }}>
            fechar
          </button>
        </div>
      )}

      {/* SPEC-64 fatias B e C — a declaração em curso mora AQUI, e não dentro
          do popover dos caminhos: o gesto é clicar nós no canvas, e o popover
          fecha ao primeiro clique fora dele. Uma barra que sumisse no primeiro
          nó seria uma barra inútil. */}
      {declaracaoDeCaminho && (
        <div data-testid="declaracao-de-caminho" style={barraDeDeclaracaoEstilo}>
          <strong style={{ fontSize: 12 }}>
            {declaracaoDeCaminho.corrigindo ? "Corrigindo o caminho" : "Declarando um caminho"}
          </strong>
          <span style={{ fontSize: 11.5, color: "var(--texto-2)" }}>
            {declaracaoDeCaminho.nos.length === 0
              ? "clique os componentes na ordem em que a requisição passa"
              : declaracaoDeCaminho.nos
                  .map((id) => quebra.diagrama.nodes.find((n) => n.id === id)?.label || id)
                  .join(" → ")}
          </span>
          <div style={{ flex: 1 }} />
          {declaracaoDeCaminho.nos.length > 0 && (
            <button
              onClick={() => setDeclaracaoDeCaminho((d) => d && { ...d, nos: d.nos.slice(0, -1) })}
              style={botaoEstilo}
              data-testid="declaracao-desfazer"
            >
              ← tirar o último
            </button>
          )}
          <button
            onClick={() => {
              const declaracao = declaracaoDeCaminho;
              setDeclaracaoDeCaminho(null);
              if (declaracao.nos.length < 2) return;
              const manual = percursoManual(declaracao.nos, quebra.diagrama);
              setQuebra((q) => ({
                ...q,
                percursos: [
                  // O que já havia sobre ESTE caminho sai (o manual manda), e o
                  // inferido que originou a correção fica recusado — não
                  // apagado: apagá-lo faria o inferidor devolvê-lo no render
                  // seguinte, e a pessoa corrigiria a mesma sugestão para sempre.
                  ...(q.percursos ?? [])
                    .filter((p) => p.id !== manual.id)
                    .map((p) => (p.id === declaracao.corrigindo ? { ...p, confirmado: false } : p)),
                  manual,
                ],
              }));
            }}
            disabled={declaracaoDeCaminho.nos.length < 2}
            title={declaracaoDeCaminho.nos.length < 2 ? "Um caminho precisa de pelo menos dois componentes" : undefined}
            style={
              declaracaoDeCaminho.nos.length < 2
                ? { ...botaoEstilo, opacity: 0.5 }
                : { ...botaoEstilo, background: "var(--acento)", borderColor: "var(--acento)", color: "#fff" }
            }
            data-testid="declaracao-concluir"
          >
            Concluir
          </button>
          <button onClick={() => setDeclaracaoDeCaminho(null)} style={botaoEstilo} data-testid="declaracao-cancelar">
            Cancelar
          </button>
        </div>
      )}

      <ReadinessSummary
        diagrama={quebra.diagrama}
        config={diagramaConfig}
        /**
         * SPEC-69 §4.1 — os ensaios COBRAM no placar enquanto ninguém os
         * assumiu. É a inversão que dá nome à SPEC: se só o aceito cobrasse, o
         * débito que ninguém olhou seguiria invisível — e é esse o
         * "inconsciente" que ela existe para acabar.
         */
        cenarios={quebra.cenariosDeLentidao}
        /* SPEC-70 — o volume que a saturação usa. Sem ele a Lei de Little só
           fecha onde alguém digitou a taxa, e era esse o trabalho que sobrava
           para quem usa. */
        volumetria={volumetriaEmVigorAgora?.valor}
        // SPEC-65 — a mesma leitura das marcas do canvas, calculada uma vez.
        leitura={leituraDoDesenho}
        /**
         * SPEC-65 fatia D — calar uma leitura NESTE desenho.
         *
         * Registrada com quem e quando, e reversível pela lista de caladas: é
         * decisão, e o §283 vale para toda decisão deste produto.
         *
         * `onVirarRegua` NÃO é passado, e a ausência é a mensagem. A régua de
         * forma (§287) sabe `exige-conexao` e `proibe-conexao`; um fan-out
         * viraria `limita-grau`, que não existe ainda. Um botão que abre um
         * formulário onde a regra não cabe é pior que botão nenhum (§244) — a
         * prop fica de pé no painel, esperando a checagem.
         */
        /**
         * SPEC-67 — o "um clique" que a SPEC-65 §6.3 prometeu e o §292 não
         * entregou, porque `limita-grau` não existia.
         *
         * A régua é montada a partir do FATO e guardada; a navegação leva à
         * tela de regras, onde o construtor abre preenchido. Navegar (e não
         * abrir um construtor na mesa) é decisão do §7.1 da SPEC: uma régua
         * nova sem ver as que já existem é como se cria a segunda que
         * contradiz a primeira.
         *
         * Nada é GRAVADO aqui: "um clique" é sobre não reconstruir à mão o que
         * o produto acabou de medir, não sobre pular a decisão de publicar.
         */
        onVirarRegua={(m) => {
          const no = quebra.diagrama.nodes.find((n) => n.id === m.noId);
          if (!no) return;
          const rotulo = diagramaConfig.nodeTypes[no.type]?.label ?? no.type;
          const partida = reguaDaLeitura(m, no.type, rotulo);
          if (!partida) return;
          setReguaDePartida({ id: idDaRegraDeForma(partida.texto), ...partida });
          navegar({ tela: "config", area: "regras" });
        }}
        leiturasDispensadas={quebra.leiturasDispensadas}
        onDispensarLeitura={(m) =>
          setQuebra((q) => ({
            ...q,
            leiturasDispensadas: [
              ...(q.leiturasDispensadas ?? []).filter((d) => !(d.noId === m.noId && d.tipo === m.tipo)),
              { noId: m.noId, tipo: m.tipo, autor: sessao.email, em: new Date().toISOString() },
            ],
          }))
        }
        onRestaurarLeitura={(d) =>
          setQuebra((q) => ({
            ...q,
            leiturasDispensadas: (q.leiturasDispensadas ?? []).filter(
              (x) => !(x.noId === d.noId && x.tipo === d.tipo)
            ),
          }))
        }
        onSimular={() => navegar({ tela: "ensaios" })}
        onSelecionar={setSelecionadoId}
        necessidades={quebra.necessidades}
        onAbrirProposito={() => setAbaAssistente("contexto")}
        // §245 — no tour, o padrão vem da demonstração: a conformidade
        // depende de `regras` com `checagem`, e a config de quem está vendo
        // raramente tem uma (§244).
        regras={regrasVisiveis}
        onSelecionarViolacao={setSelecionadoId}
        // SPEC-64 — o `timeoutMs` que falta pode ser da CONEXÃO; selecionar a
        // aresta abre o painel dela, que é onde se preenche.
        onSelecionarAresta={(id) => {
          setSelecionadoId(null);
          quebraState.setArestaSelecionadaId(id);
        }}
        excecoes={quebra.excecoes}
        /**
         * SPEC-63 fatia C — a exceção de FORMA mora na mesma coleção das de
         * valor. O que as separa é o par que identifica: `(noId, campo)` para
         * valor, `(elemento, regraId)` para forma. Duas coleções seriam duas
         * verdades sobre o mesmo assunto.
         *
         * `noId` recebe o id da ARESTA quando a violação mora na seta — o campo
         * se chama `noId` por história, e generalizá-lo é dívida anotada, não
         * paga aqui.
         */
        onAceitarViolacaoDeForma={(v, motivo) =>
          setQuebra((q) => ({
            ...q,
            excecoes: [
              ...(q.excecoes ?? []),
              {
                noId: v.noId ?? v.arestaId ?? "",
                campo: "",
                regraId: v.regraId,
                motivo,
                autor: sessao.email,
                em: new Date().toISOString(),
              },
            ],
          }))
        }
        decisoes={decisoesVisiveis}
        onSelecionarDecisao={setSelecionadoId}
        percursos={quebra.percursos}
        onMudarPercursos={(percursos) => setQuebra((q) => ({ ...q, percursos }))}
        // SPEC-64 fatias B e C — declarar do zero, ou corrigir o que o motor
        // leu usando a sequência dele como ponto de partida.
        onDeclarar={() => setDeclaracaoDeCaminho({ nos: [] })}
        // O percurso vem inteiro, e não pelo id: o inferido é recalculado a
        // cada render e NÃO está em `quebra.percursos` — procurá-lo lá achava
        // nada, e a correção começava vazia (achado do E2E).
        onAjustar={(percurso) => setDeclaracaoDeCaminho({ nos: [...percurso.nos], corrigindo: percurso.id })}
        /**
         * §307 — a válvula do §242 chegando às contradições de resiliência.
         *
         * A chave é o par ELEMENTO + TIPO: uma contradição não é identificada
         * por campo (nasce da RELAÇÃO entre dois) nem por regra do time (é
         * aritmética). Guardar por campo faria um "aceito" calar o que ninguém
         * olhou.
         */
        onAceitarContradicao={(c, motivo) =>
          setQuebra((q) => ({
            ...q,
            excecoes: [
              ...(q.excecoes ?? []).filter(
                (e) => !(e.noId === (c.noId ?? c.arestaId ?? "") && e.contradicao === c.tipo)
              ),
              {
                noId: c.noId ?? c.arestaId ?? "",
                campo: "",
                contradicao: c.tipo,
                motivo,
                autor: sessao.email,
                em: new Date().toISOString(),
              },
            ],
          }))
        }
        onAceitarViolacao={(v, motivo) =>
          setQuebra((q) => ({
            ...q,
            // Sem `em`/`autor` a exceção seria só o vermelho desligado — o
            // registro é o que a torna aceitável (regra 3 da SPEC-57).
            excecoes: [
              ...(q.excecoes ?? []).filter((e) => !(e.noId === v.noId && e.campo === v.campo)),
              { noId: v.noId, campo: v.campo, motivo, autor: sessao.email, em: new Date().toISOString() },
            ],
          }))
        }
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          <ReactFlowProvider>
            <Canvas
              diagramaState={quebraState}
              config={diagramaConfig}
              timePadrao={quebra.time}
              // SPEC-65 fatia C — a mesma leitura que alimenta o chip da faixa.
              // Calcular de novo aqui daria duas verdades sobre o mesmo desenho
              // na mesma tela.
              marcas={marcasDaLeitura}
              // SPEC-64 — com uma declaração em curso, o clique no nó compõe a
              // sequência em vez de selecionar. Fora dela, `undefined`: o canvas
              // volta a ser o de sempre.
              aoClicarNo={
                declaracaoDeCaminho
                  ? (id) =>
                      setDeclaracaoDeCaminho((d) =>
                        // Clicar duas vezes no mesmo nó em sequência é engano de
                        // clique, não um trajeto que passa duas vezes seguidas
                        // pelo mesmo lugar.
                        d && d.nos[d.nos.length - 1] === id ? d : d && { ...d, nos: [...d.nos, id] }
                      )
                  : undefined
              }
            />
          </ReactFlowProvider>
        </div>
        {arestaSelecionada ? (
          <EdgePanel aresta={arestaSelecionada} config={diagramaConfig} quebraState={quebraState} />
        ) : (
          <PropertiesPanel
            no={noSelecionado}
            arestas={quebra.diagrama.edges}
            config={diagramaConfig}
            quebraState={quebraState}
            sugestoesDeStack={sugestoesDeStack}
            time={quebra.time}
            onSalvarStack={salvarComoStackConhecida}
            decisoes={decisoesVisiveis}
            autor={sessao.email}
            onPedirDecisoesAoAgente={pedirDecisoesAoAgente}
            ehDeDemonstracao={demonstracaoDoTour ? ehDecisaoDeDemonstracao : undefined}
            onRegistrarDecisao={(d) => setQuebra((q) => ({ ...q, decisoes: [...(q.decisoes ?? []), d] }))}
            onAceitarDecisao={(id) =>
              setQuebra((q) => ({
                ...q,
                decisoes: (q.decisoes ?? []).map((d) =>
                  // Aceitar transfere a autoria: a proposta era do agente, a
                  // decisão é de quem aceitou (regra 2 da SPEC-57).
                  d.id === id ? { ...d, status: "aceita", autor: sessao.email, em: new Date().toISOString() } : d
                ),
              }))
            }
            onSubstituirDecisao={(idAntiga, nova) =>
              setQuebra((q) => ({
                ...q,
                // A anterior NÃO é apagada — quem apaga a decisão revista faz o
                // time repetir o ciclo que a produziu.
                decisoes: [
                  ...(q.decisoes ?? []).map((d) =>
                    d.id === idAntiga ? { ...d, status: "substituida" as const, substituidaPor: nova.id } : d
                  ),
                  nova,
                ],
              }))
            }
          />
        )}
      </div>

      {/* display:none (e não desmontar): o documento cobre a revisão sem
          perder o estado dela — os balões da revisão (zIndex 62) não vazam. */}
      {resultado && (
        <div style={{ display: mostrarDocumento ? "none" : "contents" }}>
        <ReviewScreen
          onDocumento={() => navegar({ tela: "documento" })}
          onConfigurarModeloIa={() => abrirConfigNaAba("modeloIa")}
          onItensGerados={aoGerarItens}
          documentoJaAprovado={!!quebra.especificacao}
          resultado={resultado}
          diagrama={quebra.diagrama}
          config={diagramaConfig}
          regras={regrasConfig}
          especificacaoTemplate={especificacaoTemplate}
          templateItem={templateItem?.conteudo}
          demandInfo={quebra.demandInfo}
          necessidades={quebra.necessidades}
          decisoes={quebra.decisoes}
          excecoes={quebra.excecoes}
          percursos={quebra.percursos}
          anexosContexto={quebra.anexosContexto}
          contextoDoProduto={contextoDoProduto}
          time={quebra.time}
          respostasItens={quebra.respostasItens}
          onResponderItem={responderItem}
          itemInicial={itemInicialRevisao}
          onFechar={() => setResultado(null)}
          onSelecionarNo={setSelecionadoId}
        />
        </div>
      )}

      {avisosPendentes && (
        <AvisosDaDerivacao
          avisos={avisosParaDerivar}
          onDerivar={derivarMesmoAssim}
          onVoltar={() => setAvisosPendentes(false)}
        />
      )}

      {mostrarSistema && (
        <SistemaScreen
          mapa={mapaDoSistema}
          // §268 — a régua para explicar a cadeia. Os NÚMEROS do mapa seguem
          // vindo da config real (esta tela responde "como o MEU ambiente está
          // montado"); só o exemplo usa `regrasVisiveis`, porque durante o tour
          // o time de quem assiste pode não ter régua conferível nenhuma — e um
          // "não há o que explicar" no meio da demonstração não ensina nada.
          //
          // As duas coisas convivem porque a caixa DIZ quando o exemplo é de
          // demonstração (§235). Sem essa marca isto seria a mentira que o
          // §259 evitou de propósito.
          exemploDeMedicao={exemploDeMedicao(regrasVisiveis)}
          exemploDeDemonstracao={demonstracaoDoTour}
          onAbrirConfig={(area) => abrirConfigNaAba(area)}
          onVoltar={() => navegar({ tela: "canvas" })}
          erroAoSalvar={erroAoSalvarSistema}
          onAlternarAgente={(id) =>
            void salvarPipeline((pipelineAgentes.papeis ?? []).map((p) => (p.id === id ? { ...p, ativo: !p.ativo } : p)))
          }
          onMoverAgente={(id, direcao) => {
            const papeis = [...(pipelineAgentes.papeis ?? [])];
            const de = papeis.findIndex((p) => p.id === id);
            const para = de + direcao;
            // Fora da lista não é erro nem no-op silencioso: os botões das
            // pontas já vêm desabilitados, e chegar aqui seria bug de quem
            // chamou — não vale gravar por isso.
            if (de < 0 || para < 0 || para >= papeis.length) return;
            [papeis[de], papeis[para]] = [papeis[para], papeis[de]];
            void salvarPipeline(papeis);
          }}
        />
      )}

      {/* SPEC-66 — a bancada de ensaio. Rota própria: o assistente é onde se
          CONVERSA para produzir desenho, e aqui não se produz nada, se ensaia.
          E rota é linkável, que é metade do valor. */}
      {/* SPEC-84 fatia A — a spec. Tela própria pelo mesmo motivo do documento:
          rota é linkável, e "olha a spec desta demanda" é uma URL que se manda. */}
      {mostrarSpec && (
        <SpecScreen
          titulo={quebra.titulo?.trim() || "Spec"}
          markdown={markdownDaSpec}
          escrita={specDaDemanda}
          onMudarEscrita={mudarSpecEscrita}
          cobertura={coberturaDaSpecAtual}
          onAlternarItem={alternarItemDaSpec}
          lacunas={lacunasDaSpec}
          onBaixarMarkdown={baixarSpecMarkdown}
          onVoltar={() => navegar({ tela: "canvas" })}
        />
      )}

      {mostrarEnsaios && (
        <EnsaiosScreen
          diagrama={quebra.diagrama}
          config={diagramaConfig}
          cenarios={quebra.cenariosDeLentidao ?? []}
          volumetria={volumetriaEmVigorAgora?.valor}
          onMudar={(cenariosDeLentidao) => setQuebra((q) => ({ ...q, cenariosDeLentidao }))}
          /**
           * SPEC-69 — o que o NEGÓCIO exige. É o que faz o número técnico
           * decidir: "24 s" sozinho não decide nada, "24 s contra os 5 s que
           * prometemos" decide. Sem necessidade com prazo, a conclusão do
           * ensaio compara com hoje e não inventa julgamento.
           */
          necessidades={quebra.necessidades}
          // Quem assume o débito — é o que separa consciente de anônimo.
          autor={sessao.email}
          /**
           * SPEC-69 fatia D — o elo. Assumir já põe o ensaio na seção de riscos
           * do documento; ANEXAR a uma decisão é o que o leva ao item, ao lado
           * do critério de aceite de quem vai implementar.
           *
           * Só as decisões VIGENTES: anexar evidência a uma decisão que já foi
           * substituída seria juntar o número de hoje ao porquê de ontem.
           */
          decisoes={decisoesVisiveis}
          onAnexar={(ensaioId, decisaoId) =>
            setQuebra((q) => ({
              ...q,
              // O ensaio sai de qualquer outra decisão antes de entrar nesta:
              // a mesma evidência sustentando duas escolhas diferentes é o tipo
              // de coisa que só se descobre lendo o documento pronto.
              decisoes: (q.decisoes ?? []).map((d) => {
                const sem = (d.ensaioIds ?? []).filter((id) => id !== ensaioId);
                return { ...d, ensaioIds: d.id === decisaoId ? [...sem, ensaioId] : sem };
              }),
            }))
          }
          onVoltar={() => navegar({ tela: "canvas" })}
          /**
           * SPEC-66 fatia D — a pauta vem do modelo; a conta, do motor.
           *
           * O botão está sempre presente, e isso NÃO contraria o §244: sem
           * modelo configurado ele não fica inerte, devolve o motivo escrito
           * pelo servidor, que a tela mostra. O que o §244 proíbe é o botão que
           * não faz nada — não o que explica por que não deu.
           *
           * A tela inteira segue funcionando sem ele: cenário à mão é o caminho
           * principal, sugestão é atalho.
           */
          onSugerir={async () => {
            const elementos = elementosComTempo(quebra.diagrama, diagramaConfig);
            const t = leituraDoDesenho.tempoDoPiorTrecho;
            const { cenarios } = await apiIa.proporCenariosDeLentidao({
              contextoEpico: quebra.demandInfo,
              elementos: elementos.map((e) => ({
                tipo: e.tipo,
                id: e.id,
                rotulo: e.rotulo,
                msAtual: e.msAtual,
                externo: e.externo,
              })),
              respostaAtualMs: t?.ms,
              respostaEhPiso: t ? !t.completo : undefined,
              jaExistentes: (quebra.cenariosDeLentidao ?? []).map((c) => c.nome),
            });
            // O `tipo` vem do DESENHO, não do modelo: ele devolve só o id, e
            // quem sabe se aquele id é nó ou conexão é quem montou a lista.
            // Ajuste com id desconhecido é descartado — `simularCenario` também
            // o declararia, mas deixá-lo entrar encheria a tabela de linha que
            // não mede nada.
            const porId = new Map(elementos.map((e) => [e.id, e.tipo]));
            return cenarios.map((c, i) => ({
              id: `cen-ia-${i}-${c.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
              nome: c.nome,
              porque: c.porque,
              origem: "sugerido" as const,
              aceito: false,
              ajustes: c.ajustes
                .filter((a) => porId.has(a.id))
                .map((a) => ({ tipo: porId.get(a.id)!, id: a.id, fator: a.fator })),
            }));
          }}
        />
      )}

      {mostrarDocumento && (
        <DocumentoScreen
          documento={documentoDaDemanda}
          config={diagramaConfig}
          escrito={quebra.artefatosEscritos?.documento ?? {}}
          status={quebra.documentoStatus ?? null}
          onMudarEscrito={(documento) =>
            setQuebra((q) => ({ ...q, artefatosEscritos: { ...q.artefatosEscritos, documento } }))
          }
          onMudarStatus={mudarStatusDoDocumento}
          desatualizado={documentoDesatualizado}
          lacunas={lacunasDoDocumento}
          mudancasDesdeAprovacao={mudancasDesdeAprovacao}
          onBaixarMarkdown={baixarDocumentoMarkdown}
          onPublicar={podePublicarDocumento && persistencia.quebraId ? publicarDocumento : undefined}
          onVoltar={() => navegar({ tela: "canvas" })}
          // SPEC-61 — o que era a tela `#/itens`, agora seção deste documento.
          itensEscritos={itensGerados}
          onExportar={
            persistencia.quebraId
              ? async () => {
                  const r = await apiItensGerados.exportar(persistencia.quebraId!);
                  setItensGerados(await apiItensGerados.listar(persistencia.quebraId!));
                  return r;
                }
              : undefined
          }
          destinoDaExportacao={destinoDaExportacao}
          /**
           * SPEC-69 §4.4 — o débito assumido chega a quem APROVA o desenho.
           *
           * A mesma lista que alimenta o markdown: a tela e o arquivo baixado
           * não podem discordar sobre o que se está aceitando correr.
           */
          ensaios={ensaiosDaQuebra}
          decisaoDoEnsaio={(ensaioId) =>
            (decisoesVisiveis ?? []).find((d) => (d.ensaioIds ?? []).includes(ensaioId))?.titulo
          }
          onRevisarItem={
            resultado
              ? (chave) => {
                  setItemInicialRevisao(chave);
                  navegar({ tela: "canvas" });
                }
              : undefined
          }
        />
      )}

      {mostrarJornada && (
        <JourneyModal
          config={diagramaConfig}
          cenarios={cenarios}
          onFechar={fecharJornada}
          onCarregarCenario={(q) => aoAbrir(q)}
          onAdicionarCenario={adicionarCenario}
          onIniciarTour={iniciarTour}
          onIniciarTourDeConfiguracao={iniciarTourDeConfiguracao}
          abaForcada={abaJornadaAlvo}
        />
      )}

      {mostrarConfig && (
        <ConfigScreen
          // SPEC-67 — a régua que veio do clique da leitura, a caminho do
          // construtor. Ela não é gravada por chegar: conferir e publicar
          // continuam sendo gestos de quem assina.
          reguaDePartida={reguaDePartida ?? undefined}
          config={diagramaConfig}
          camposNo={camposNo}
          camposAresta={camposAresta}
          especificacaoTemplate={especificacaoTemplate}
          templateItem={templateItem}
          pipelineAgentes={pipelineAgentes}
          timeAtivo={timeAtivo}
          timeIds={sessao.timeIds}
          onAbrirArea={(area) => abrirConfigNaAba(area)}
          // §274 — o botão da aba de produto abre a MESMA conversa do FAB, na
          // aba de configuração: um lugar só para pedir, e a proposta volta
          // como cartão com "aplicar".
          onConversarComAssistente={() => setAbaAssistente("configurar")}
          onPerfisMudaram={() => {
            void apiStacks.sugestoes().then(setSugestoesDeStack);
          }}
          /* SPEC-52 — aplicar um ajuste de ficha muda os campos pelo lado do
             PDCA, não pela tela de campos: sem este canal, a pessoa aplicava,
             voltava ao canvas e o campo aprovado não estava lá (só depois de
             um F5) — o ciclo parecia não ter fechado. */
          onFichaMudou={() => {
            void apiCamposNo.listar(timeAtivo).then(setCamposNo);
            void apiCamposAresta.listar(timeAtivo).then(setCamposAresta);
            // A LISTA não é o que o painel lê: quem manda ali é a config
            // MESCLADA (global + time, resolvida pelo servidor). Recarregar só
            // a lista deixava o campo aprovado invisível até um F5 — foi o que
            // o E2E pegou.
            void recarregarConfig();
          }}
          onSalvarEspecificacaoTemplate={salvarEspecificacaoTemplate}
          onSalvarPipelineAgentes={salvarPipelineAgentes}
          onCriarCampoNo={criarCampoNo}
          onAtualizarCampoNo={atualizarCampoNo}
          onExcluirCampoNo={excluirCampoNo}
          onCriarCampoAresta={criarCampoAresta}
          onAtualizarCampoAresta={atualizarCampoAresta}
          onExcluirCampoAresta={excluirCampoAresta}
          onFechar={() => navegar({ tela: "canvas" })}
          area={rota.tela === "config" ? rota.area : "perfis"}
          demonstracao={demonstracaoDoTour}
          onAbrirMenu={() => setMenuAberto(true)}
          techs={appConfig.techs}
          contextos={appConfig.contextos}
        />
      )}

      <AssistenteFlutuante
        aba={abaAssistente}
        onMudarAba={setAbaAssistente}
        // Dentro de Configurações o mesmo bubble flutua SOBRE a tela e abre
        // direto na conversa de configuração — o contexto de quem está ali.
        abaPrimaria={mostrarConfig ? "configurar" : "conversa"}
        sobreposto={mostrarConfig}
        // SPEC-37 M9 — tudo verde e nada derivado: o momento certo de conduzir
        // ao Derivar, com o chip executando a mesma ação do botão do header.
        chamando={pedindoNomeDaDemanda !== false || momentoConfig !== null || (!mostrarConfig && momentoCanvas !== null)}
        balao={
          pedindoNomeDaDemanda
            ? {
                texto:
                  pedindoNomeDaDemanda === "derivar"
                    ? "Antes de derivar: qual é o nome da demanda? Com ele eu salvo a quebra automaticamente depois de gerar os itens."
                    : "Pra salvar a quebra eu preciso de um nome — qual é o nome da demanda?",
                entrada: {
                  placeholder: "ex.: Fatura mensal em lote",
                  rotulo: pedindoNomeDaDemanda === "derivar" ? "Derivar e salvar" : "Salvar",
                  onConfirmar: confirmarNome,
                },
                acaoSecundaria:
                  pedindoNomeDaDemanda === "derivar"
                    ? { rotulo: "Derivar sem salvar", onExecutar: () => executarDerivacao(false) }
                    : undefined,
                onDispensar: () => setPedindoNomeDaDemanda(false),
              }
            : entrevistaPdca !== null && !mostrarConfig && !resultado
              ? {
                  texto: `Já usamos a derivação algumas vezes${entrevistaPdca.length > 0 ? ` (últimos itens do time: ${entrevistaPdca.join(", ")})` : ""}. Sentiu falta — ou sobra — de algum item de checklist, regra de refinamento ou campo do formulário? ${somenteLeitura || permissoes.nivel !== "owner" ? "Escreva aqui: entra no ciclo do time, e quem configura transforma em ajuste vendo o efeito num item antes de aplicar." : "Posso ajustar com você, conversando."}`,
                  ...(permissoes.nivel === "owner"
                    ? { acao: { rotulo: "Revisar configurações", onExecutar: () => { setEntrevistaPdca(null); setAbaAssistente("configurar"); } } }
                    : {
                        entrada: {
                          placeholder: "ex.: faltou item de DLQ no checklist",
                          rotulo: "Enviar ao ciclo",
                          /**
                           * SPEC-62 §1 — grava FEEDBACK, e não solicitação.
                           *
                           * Isto chamava `criarAjuste` direto: o texto pulava o
                           * *Check* e caía na fila de decisão como pedido
                           * `pendente`, sem operação e sem prévia. A tela do
                           * ciclo então dizia "Ninguém deixou feedback ainda" e,
                           * logo abaixo, "1 aguardando decisão" (relato do
                           * usuário: *"só aparece direto para aprovar antes de
                           * conseguir ver o pdca"*).
                           *
                           * A promessa não encolhe — o texto continua chegando a
                           * quem configura. Muda a porta, não o destino: agora
                           * ele entra por "O que disseram" e vira pedido no
                           * estúdio, com o efeito à vista.
                           */
                          onConfirmar: (texto: string) => {
                            void apiPdca.feedback(texto, timeAtivo).catch(() => {});
                            // O M15 ("tem N feedbacks esperando") nunca acendia
                            // por este caminho, porque feedback nenhum era
                            // criado. Contar o que acabou de entrar é o que faz
                            // a condução seguinte existir.
                            setFeedbacksNovos((n) => n + 1);
                            setEntrevistaPdca(null);
                          },
                        },
                      }),
                  onDispensar: () => setEntrevistaPdca(null),
                }
              : momentoConfig === "m15"
              ? {
                  texto: `Tem ${feedbacksNovos} ${feedbacksNovos === 1 ? "feedback" : "feedbacks"} do time esperando: dá pra transformar em ajuste e ver o efeito num item de exemplo antes de decidir.`,
                  acao: { rotulo: "Ver os feedbacks", onExecutar: () => abrirConfigNaAba("pdca") },
                  onDispensar: () => dispensar("m15"),
                }
              : momentoConfig === "m8"
              ? {
                  texto: "Este ambiente ainda está sem padrões do time — posso te ajudar a configurar conversando, por texto ou voz (🎤).",
                  acao: { rotulo: "Configurar conversando", onExecutar: () => setAbaAssistente("configurar") },
                  onDispensar: () => dispensar("m8"),
                }
              : mostrarConfig
                ? undefined
                : momentoCanvas === "m14"
                  ? {
                      // §270 — o campo `especificacao` perdeu o outro escritor:
                      // agora ele só guarda a FOTO DA APROVAÇÃO do documento
                      // (§264). O texto passou a dizer isso, em vez de citar um
                      // artefato que não existe mais.
                      texto: "Esta demanda já teve o documento de desenho aprovado. Quer abrir a revisão? Se algo mudou, eu aplico os ajustes e o documento acusa o que ficou diferente.",
                      acao: { rotulo: "Abrir revisão", onExecutar: derivarQuebra },
                      onDispensar: () => dispensar("m14"),
                    }
                : momentoCanvas === "m9"
                  ? {
                      texto: "Tudo verde — a quebra está pronta para derivar os itens de trabalho.",
                      acao: { rotulo: "Derivar Quebra", onExecutar: derivarQuebra },
                      onDispensar: () => setDerivarDispensado(true),
                    }
                  : momentoCanvas === "m3"
                    ? {
                        texto: "Diagrama na mesa de projeto. Agora é preencher os campos de cada componente — o semáforo mostra o que falta; vermelho trava a derivação.",
                        onDispensar: () => dispensar("m3"),
                      }
                    : momentoCanvas === "m2"
                      ? {
                          texto: "Quer começar conversando? Descreva a demanda — por texto ou voz (🎤) — e eu proponho o diagrama.",
                          acao: { rotulo: "Desenhar conversando", onExecutar: () => setAbaAssistente("conversa") },
                          onDispensar: () => dispensar("m2"),
                        }
                      : undefined
        }
      >
        {abaAssistente === "conversa" && (
          <ConversaPanel
            // SPEC-81 fatia D — sem demanda salva não há o que perguntar ao
            // gateway, e o botão de trazer as decisões da casa não aparece.
            quebraId={persistencia.quebraId}
            config={diagramaConfig}
            sugestoesDeStack={sugestoesDeStack}
            timeAtivo={quebra.time}
            techs={appConfig.techs}
            contextos={appConfig.contextos}
            contextoInicial={quebra.demandInfo}
            mensagensDeDemonstracao={demonstracaoDoTour ? CONVERSA_DO_TOUR : undefined}
            onAplicar={(proposta) => {
              aplicarDiagramaProposto(proposta);
              // SPEC-37 M3 — a proposta aplicada é o gatilho da fala de
              // "agora preencha os campos" (a decisão mora em momentos.ts).
              setAplicouProposta(true);
              setAbaAssistente(null);
            }}
          />
        )}
        {abaAssistente === "contexto" && (
          <ContextoEpicoPanel
            demandInfo={quebra.demandInfo}
            anexosContexto={quebra.anexosContexto}
            produtoId={quebra.produtoId}
            produtos={produtos}
            necessidades={quebra.necessidades}
            /* SPEC-70 — o volume da demanda, dito uma vez e distribuído pelo
               motor. É o que faz a Lei de Little fechar sem ninguém digitar
               taxa em componente nenhum.

               SPEC-77 — aqui vai o que a DEMANDA declarou, cru, e não o volume
               em vigor. Este painel é o EDITOR: mostrar o número herdado nos
               campos faria o próximo "Salvar" gravá-lo como declarado, e a
               demanda congelaria a versão do produto do dia em que foi aberta.
               É a armadilha que o `PipelineAgentesTab` já documenta para o
               preâmbulo herdado, e aqui ela é pior — o volume do produto muda
               uma vez por trimestre, e as demandas em aberto precisam mudar
               junto. O herdado aparece como FRASE, logo abaixo. */
            volumetria={quebra.volumetria}
            volumetriaEmVigor={volumetriaEmVigorAgora}
            elementos={quebra.diagrama.nodes.map((n) => ({ id: n.id, label: n.label || n.id }))}
            onProporNecessidades={async (jaDeclaradas, contextoEpico) => {
              const { necessidades } = await apiIa.proporNecessidades({
                contextoEpico,
                // O mesmo texto que já alimenta a esteira — o agente do propósito não pode
                // ler um contexto de produto diferente do que escreve os itens.
                contextoDoProduto,
                componentes: quebra.diagrama.nodes.map((n) => ({
                  id: n.id,
                  rotulo: n.label || n.id,
                  tipo: n.type,
                })),
                jaDeclaradas,
              });
              // Tudo o que o agente propõe entra como `sugerido` e SEM
              // confirmação: a regra 2 é aplicada aqui, na fronteira, e não
              // depende de o modelo ter sido bem-comportado.
              return necessidades.map((p, i) => ({
                id: `nec-ia-${Date.now().toString(36)}-${i}`,
                texto: p.texto,
                prioridade: p.prioridade,
                origem: "sugerido" as const,
                confirmado: false,
                atendidaPor: (p.atendidaPor ?? []).filter((id) =>
                  quebra.diagrama.nodes.some((n) => n.id === id)
                ),
              }));
            }}
            onSalvar={(demandInfo, anexosContexto, produtoId, necessidades, volumetria) =>
              setQuebra((q) => ({ ...q, demandInfo, anexosContexto, produtoId, necessidades, volumetria }))
            }
            onFechar={() => setAbaAssistente(null)}
          />
        )}
        {abaAssistente === "configurar" && (
          <ConfigurarPanel
            config={diagramaConfig}
            camposNo={camposNo}
            camposAresta={camposAresta}
            pipelineAgentes={pipelineAgentes}
            techs={appConfig.techs}
            timeAtivo={timeAtivo}
            onCriarCampoNo={criarCampoNo}
            onCriarCampoAresta={criarCampoAresta}
            onSalvarPipelineAgentes={salvarPipelineAgentes}
            // §274 — o contexto do produto proposto pela conversa do FAB.
            produtos={produtos}
            onAplicarContextoDoProduto={async (produtoId, contexto) => {
              const atual = produtos.find((p) => p.id === produtoId);
              if (!atual) throw new Error("produto não encontrado");
              // Só o que veio preenchido, como no §271: a proposta acrescenta,
              // nunca apaga o que já estava escrito.
              const preenchidos = Object.fromEntries(
                Object.entries(contexto).filter(([, v]) => String(v).trim() !== "")
              );
              await apiProdutos.atualizar(produtoId, { nome: atual.nome, ...preenchidos });
            }}
          />
        )}
      </AssistenteFlutuante>

      {mostrarAbrir && (
        <AbrirQuebraScreen
          lista={persistencia.lista}
          onAbrir={(id) => {
            void persistencia.abrirPorId(id);
            setMostrarAbrir(false);
          }}
          onFechar={() => setMostrarAbrir(false)}
        />
      )}

      {tour.ativo && tour.passoAtual && (
        <TourOverlay
          passo={tour.passoAtual}
          indice={tour.indice}
          total={tour.total}
          ultimo={tour.ultimo}
          onProximo={tour.proximo}
          onPular={tour.pular}
          pausado={tour.pausado}
          segurado={tour.segurado}
          duracao={tour.duracao}
          onAlternarPausa={tour.alternarPausa}
          onSegurar={tour.segurar}
        />
      )}

      {tourDeConfiguracao.ativo && tourDeConfiguracao.passoAtual && (
        <TourOverlay
          passo={tourDeConfiguracao.passoAtual}
          indice={tourDeConfiguracao.indice}
          total={tourDeConfiguracao.total}
          ultimo={tourDeConfiguracao.ultimo}
          onProximo={tourDeConfiguracao.proximo}
          onPular={tourDeConfiguracao.pular}
          pausado={tourDeConfiguracao.pausado}
          segurado={tourDeConfiguracao.segurado}
          duracao={tourDeConfiguracao.duracao}
          onAlternarPausa={tourDeConfiguracao.alternarPausa}
          onSegurar={tourDeConfiguracao.segurar}
        />
      )}

    </div>
  );
}


const telaCentralizadaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  color: "var(--texto-fraco)",
  padding: 24,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** SPEC-64 — a barra da declaração de caminho em curso. Acento na borda porque
 * ela muda o que o clique no canvas faz, e isso precisa ser visível o tempo
 * todo — não é um painel a mais, é um MODO. */
const barraDeDeclaracaoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  borderBottom: "1px solid var(--acento)",
  background: "var(--painel-alto)",
};

/** §198 — as portas de experimentar: contorno de acento e fundo tingido, pra
 * não parecerem "mais um componente" ao lado dos `+ Serviço`. */
const botaoExperimentarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--acento)",
  background: "rgba(99, 102, 241, 0.14)",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "var(--acento-indigo)",
  color: "#fff",
  border: "1px solid var(--acento-indigo)",
};

const botaoJornadaEstilo: React.CSSProperties = {
  background: "rgba(99, 102, 241, 0.14)",
  color: "#a5b4fc",
  border: "1px solid rgba(99, 102, 241, 0.45)",
  fontWeight: 600,
};

const botaoDesabilitadoEstilo: React.CSSProperties = {
  background: "var(--painel-alto)",
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-mudo)",
  cursor: "not-allowed",
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
};
