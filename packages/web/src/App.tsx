import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  analisarLacunas,
  avaliarConformidade,
  derivar,
  estruturarDocumento,
  gerarDiagramaHtml,
  gerarDocumentoHtml,
  gerarEspecificacaoEntrega,
  resolverDependencias,
  violacoesEmAberto,
  type Atividade,
  type DiagramaConfig,
  type No,
  type Quebra,
  type StatusDocumento,
  type ResultadoDependenciasDe,
  gerarItensDeTrabalho,
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
import { ConfigurarPanel } from "./assistente/ConfigurarPanel";
import { JourneyModal, type AbaJornada } from "./demo/JourneyModal";
import { contextoDoProdutoEmTexto, montarMapaDoSistema } from "@gerador/aplicacao";
import { ConfigScreen, type AbaConfig } from "./config/ConfigScreen";
import { TourOverlay } from "./demo/TourOverlay";
import { useTour, passosDeConfiguracao } from "./demo/useTour";
import { CONVERSA_DO_TOUR, DECISOES_DO_TOUR, REGRAS_DO_TOUR, ehDecisaoDeDemonstracao } from "./demo/dadosDoTour";
import { DocumentoScreen } from "./documento/DocumentoScreen";
import { SistemaScreen } from "./sistema/SistemaScreen";
import { baixarArquivoTexto } from "./persistence/baixarArquivo";
import { LandingPage } from "./demo/LandingPage";
import { EscolherTimeScreen } from "./auth/EscolherTimeScreen";
import { lembrarTime, lerTimeLembrado } from "./auth/timeLembrado";
import { SemTimeScreen } from "./auth/SemTimeScreen";
import { RECURSO_DA_ABA, RECURSO_DA_SECAO_DE_REGRAS, usePermissoes } from "./auth/usePermissoes";
import { momentoDaConfig, momentoDoCanvas } from "./assistente/momentos";
import { MenuLateral } from "./navegacao/MenuLateral";
import { ItensScreen } from "./itens/ItensScreen";
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
  const { sessao, modo, erro, entrar, sair } = useSessao();
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
    if (!tokenConvite && !mostrarLogin) {
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
  regrasConfig,
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
  useEffect(() => {
    if (!quebra.produtoId) {
      setContextoDoProduto(undefined);
      return;
    }
    apiProdutos
      .obter(quebra.produtoId)
      .then((p) => setContextoDoProduto(contextoDoProdutoEmTexto(p) || undefined))
      // Produto apagado depois de a demanda apontar pra ele: a demanda
      // continua valendo, só sem o contexto (a FK é ON DELETE SET NULL, mas a
      // quebra em memória pode estar mais velha que o banco).
      .catch(() => setContextoDoProduto(undefined));
  }, [quebra.produtoId]);

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
    },
    [setQuebra, setSelecionadoId]
  );

  const persistencia = usePersistencia(quebra, aoAbrir);

  const [mostrarJornada, setMostrarJornada] = useState(false);
  const [abaJornadaAlvo, setAbaJornadaAlvo] = useState<AbaJornada | undefined>(undefined);
  // SPEC-40 F1 — a tela de config é ROTA (#/config/…), não estado; o menu
  // (☰) é o caminho pra ela. F5 mantém o lugar; condutores navegam por rota.
  const { rota, navegar } = useRotaHash();
  const mostrarConfig = rota.tela === "config";
  const mostrarItens = rota.tela === "itens";
  const mostrarDocumento = rota.tela === "documento";
  const mostrarSistema = rota.tela === "sistema";
  // SPEC-41 Parte B — os itens materializados da quebra aberta. A fonte de
  // verdade é o server (persistem por quebra); o estado local é o espelho da
  // última geração/carga desta sessão.
  const [itensGerados, setItensGerados] = useState<ItemGerado[]>([]);
  // SPEC-44 — deep-link da tela de itens pra revisão: o item a selecionar.
  const [itemInicialRevisao, setItemInicialRevisao] = useState<string | null>(null);
  // SPEC-49 — pra onde os itens vão; só pra tela DIZER o destino (a exportação
  // em si é do servidor, que lê a mesma config).
  const [destinoDaExportacao, setDestinoDaExportacao] = useState<string | null>(null);
  useEffect(() => {
    if (!mostrarItens) return;
    apiExportador
      .obter()
      .then((c) => setDestinoDaExportacao(c.endpoint ? c.rotulo || c.endpoint : null))
      .catch(() => setDestinoDaExportacao(null));
  }, [mostrarItens]);
  // SPEC-45 — quantos feedbacks do ciclo ainda esperam alguém: é o que faz o
  // assistente chamar pra tratar (M15) em vez de o texto morrer no banco.
  const [feedbacksNovos, setFeedbacksNovos] = useState(0);
  /** SPEC-59 — a esteira tem com quem falar? É o que separa "papel ativo" de
   * "papel ativo e mudo", que é o defeito mais silencioso da configuração.
   * Buscado só quando a tela abre, como a exportação faz para os itens. */
  const [temCredencialDeIa, setTemCredencialDeIa] = useState(false);

  useEffect(() => {
    if (!mostrarSistema) return;
    let cancelado = false;
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
      }),
    [pipelineAgentes, regrasConfig, temCredencialDeIa, feedbacksNovos]
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
    temEspecificacaoSalva: !!quebra.especificacao,
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
    });
    setResultado(resolverDependencias(atividades));
    setPedindoNomeDaDemanda(false);
    if (salvarDepois) setAutoSalvarPendente(true);
  }

  function derivarQuebra() {
    // SPEC-38 — visualizar deriva (é leitura computada do diagrama), mas sem a
    // pergunta do nome nem auto-save: salvar seria 403 no servidor.
    if (somenteLeitura) {
      executarDerivacao(false);
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
      avaliarConformidade(quebra.diagrama, diagramaConfig, regrasConfig, quebra.excecoes ?? [])
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

  /** O diagrama animado que já existe (SPEC-21), embutido no documento — o
   * maior ganho visual possível, e sem gerador novo. Só quando há nó: um
   * `iframe` com diagrama vazio é pior que a frase que explica a ausência. */
  const diagramaHtmlDaDemanda = useMemo(
    () =>
      quebra.diagrama.nodes.length > 0
        ? gerarDiagramaHtml(atividadesDoDocumento, quebra.diagrama, diagramaConfig, {
            titulo: quebra.titulo ?? "Diagrama da solução",
          })
        : undefined,
    [atividadesDoDocumento, quebra.diagrama, quebra.titulo, diagramaConfig]
  );

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
        tradeOffs: quebra.documentoEscrito?.tradeOffs,
        riscos: quebra.documentoEscrito?.riscos,
      }),
    [atividadesDoDocumento, quebra, diagramaConfig, contextoDoProduto, regrasVisiveis, decisoesVisiveis, especificacaoTemplate, templateItem]
  );

  const documentoDesatualizado =
    quebra.documentoStatus === "aprovado" && !!quebra.especificacao && quebra.especificacao !== markdownDoDocumento;

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

  function baixarDocumentoHtml() {
    baixarArquivoTexto(
      gerarDocumentoHtml(documentoDaDemanda, {
        diagramaHtml: diagramaHtmlDaDemanda,
        status: quebra.documentoStatus ?? undefined,
        escritas: [
          { titulo: "Trade-offs e o que ficou de fora", texto: quebra.documentoEscrito?.tradeOffs ?? "" },
          { titulo: "Riscos e o que pode dar errado", texto: quebra.documentoEscrito?.riscos ?? "" },
        ],
      }),
      "documento-de-desenho.html",
      "text/html"
    );
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

  // Entrar na tela de itens (menu, deep-link ou F5) recarrega do server — o
  // que está salvo é o que vale; a geração local só espelha na hora.
  useEffect(() => {
    // Demanda sem id não tem o que buscar: o que estiver na tela são os itens
    // LOCAIS desta mesma demanda (gerados antes de ela ser salva), e apagá-los
    // aqui seria perder trabalho — a limpeza de §210 mora em `aoAbrir`, que é
    // o evento "troquei de demanda".
    if (!mostrarItens || !persistencia.quebraId) return;
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
  }, [mostrarItens, persistencia.quebraId]);

  /** SPEC-41 Parte B — o clique "Gerar itens" da revisão: persiste o conjunto
   * (quando a quebra está salva) e abre a tela `#/itens`. Sem id ainda, os
   * itens vivem no estado — salvos na próxima geração com a quebra salva. */
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
    navegar({ tela: "itens" });
  }

  const opcoesTour = {
    cenarios,
    carregarCenario: (q: Quebra) => aoAbrir(q),
    selecionarNo: setSelecionadoId,
    // O tour/demo deriva DIRETO, sem a pergunta do nome nem auto-save — é uma
    // demonstração, não uma quebra de verdade para registrar.
    derivarQuebra: () => executarDerivacao(false),
    fecharRevisao: () => setResultado(null),
    abrirConfigNaAba,
    // SPEC-48 — o tour passa pela tela dos itens escritos. GERA os itens antes
    // de abrir, como faz o botão da revisão: `navegar({tela:"itens"})` sozinho
    // abria a tela vazia ("ainda não existe nenhum item"), contradizendo o
    // texto do passo, que promete os cards (§234).
    abrirItens: () => {
      if (resultado) {
        aoGerarItens(
          gerarItensDeTrabalho(resultado.atividades, quebra.diagrama, diagramaConfig, {
            regras: regrasConfig,
            respostasItens: quebra.respostasItens,
            templateItem: templateItem?.conteudo,
          })
        );
      } else {
        navegar({ tela: "itens" });
      }
    },
    // Fechar a REVISÃO junto: sem isso, sair dos itens caía de volta na
    // revisão (o `resultado` continua setado e ela cobre o canvas), e o passo
    // seguinte falava do menu ☰ numa tela que não tem menu ☰ (§234).
    fecharItens: () => {
      setResultado(null);
      navegar({ tela: "canvas" });
    },
    // §251 — o tour passa pelo DOCUMENTO. NÃO limpa `resultado`: o passo
    // seguinte é a tela de itens, que só tem o que mostrar se a derivação
    // continuar de pé (§234). A revisão não atrapalha porque ela se esconde
    // para o documento, como já fazia para os itens.
    abrirDocumento: () => navegar({ tela: "documento" }),
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
        {/* §197 — e nem com a tela de ITENS: dois ☰ no DOM foi o defeito que a
            SPEC-40 corrigiu pra config, e a tela nova repetiu (achado do
            smoke: strict violation em todo clique de menu). */}
        {!mostrarConfig && !mostrarItens && (
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
        onItens={() => navegar({ tela: "itens" })}
        onDocumento={() => navegar({ tela: "documento" })}
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

      <ReadinessSummary
        diagrama={quebra.diagrama}
        config={diagramaConfig}
        onSelecionar={setSelecionadoId}
        necessidades={quebra.necessidades}
        onAbrirProposito={() => setAbaAssistente("contexto")}
        // §245 — no tour, o padrão vem da demonstração: a conformidade
        // depende de `regras` com `checagem`, e a config de quem está vendo
        // raramente tem uma (§244).
        regras={regrasVisiveis}
        onSelecionarViolacao={setSelecionadoId}
        excecoes={quebra.excecoes}
        decisoes={decisoesVisiveis}
        onSelecionarDecisao={setSelecionadoId}
        percursos={quebra.percursos}
        onMudarPercursos={(percursos) => setQuebra((q) => ({ ...q, percursos }))}
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
            <Canvas quebraState={quebraState} config={diagramaConfig} />
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

      {/* display:none (e não desmontar): a tela de itens cobre a revisão sem
          perder o estado dela — os balões da revisão (zIndex 62) não vazam. */}
      {resultado && (
        <div style={{ display: mostrarItens || mostrarDocumento ? "none" : "contents" }}>
        <ReviewScreen
          onConfigurarModeloIa={() => abrirConfigNaAba("modeloIa")}
          onItensGerados={aoGerarItens}
          especificacaoJaGerada={!!quebra.especificacao}
          onEspecificacaoGerada={(md) => {
            setQuebra((q) => ({ ...q, especificacao: md }));
            // Fica salvo de verdade quando a quebra tem nome (mesmo tick-de-
            // render do auto-save); sem nome, mora no estado até salvar.
            setSalvarAposNome(true);
          }}
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

      {mostrarSistema && (
        <SistemaScreen
          mapa={mapaDoSistema}
          onAbrirConfig={(area) => abrirConfigNaAba(area)}
          onVoltar={() => navegar({ tela: "canvas" })}
        />
      )}

      {mostrarDocumento && (
        <DocumentoScreen
          documento={documentoDaDemanda}
          config={diagramaConfig}
          diagramaHtml={diagramaHtmlDaDemanda}
          escrito={quebra.documentoEscrito ?? {}}
          status={quebra.documentoStatus ?? null}
          onMudarEscrito={(documentoEscrito) => setQuebra((q) => ({ ...q, documentoEscrito }))}
          onMudarStatus={mudarStatusDoDocumento}
          desatualizado={documentoDesatualizado}
          onBaixarMarkdown={baixarDocumentoMarkdown}
          onBaixarHtml={baixarDocumentoHtml}
          onVoltar={() => navegar({ tela: "canvas" })}
        />
      )}

      {mostrarItens && (
        <ItensScreen
          itens={itensGerados}
          tituloDaQuebra={quebra.titulo ?? null}
          onAbrirMenu={() => setMenuAberto(true)}
          onFechar={() => navegar({ tela: "canvas" })}
          onIrParaRevisao={() => navegar({ tela: "canvas" })}
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
          config={diagramaConfig}
          camposNo={camposNo}
          camposAresta={camposAresta}
          especificacaoTemplate={especificacaoTemplate}
          templateItem={templateItem}
          pipelineAgentes={pipelineAgentes}
          timeAtivo={timeAtivo}
          timeIds={sessao.timeIds}
          onAbrirArea={(area) => abrirConfigNaAba(area)}
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
                  texto: `Já usamos a derivação algumas vezes${entrevistaPdca.length > 0 ? ` (últimos itens do time: ${entrevistaPdca.join(", ")})` : ""}. Sentiu falta — ou sobra — de algum item de checklist, regra de refinamento ou campo do formulário? ${somenteLeitura || permissoes.nivel !== "owner" ? "Descreva o ajuste que eu encaminho pra aprovação de quem configura." : "Posso ajustar com você, conversando."}`,
                  ...(permissoes.nivel === "owner"
                    ? { acao: { rotulo: "Revisar configurações", onExecutar: () => { setEntrevistaPdca(null); setAbaAssistente("configurar"); } } }
                    : {
                        entrada: {
                          placeholder: "ex.: faltou item de DLQ no checklist",
                          rotulo: "Pedir ajuste",
                          onConfirmar: (texto: string) => {
                            void apiPdca.criarAjuste({ descricao: texto, timeId: timeAtivo }).catch(() => {});
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
                      texto: "Esta demanda já tem a especificação de solução completa. Quer abrir a revisão? Se algo mudou, eu aplico os ajustes e gero a especificação de novo.",
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
            onSalvar={(demandInfo, anexosContexto, produtoId, necessidades) =>
              setQuebra((q) => ({ ...q, demandInfo, anexosContexto, produtoId, necessidades }))
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
