import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  derivar,
  resolverDependencias,
  type Atividade,
  type DiagramaConfig,
  type No,
  type Quebra,
  type ResultadoDependenciasDe,
  gerarItensDeTrabalho,
  type ItemDeTrabalho,
} from "@gerador/engine";
import { carregarConfig, type ConfigCarregada } from "./config/loadConfig";
import { carregarCenarios, type Cenario } from "./demo/scenarios";
import {
  apiCamposAresta,
  apiCamposNo,
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
import { ConfigScreen, type AbaConfig } from "./config/ConfigScreen";
import { TourOverlay } from "./demo/TourOverlay";
import { useTour } from "./demo/useTour";
import { useAutoDemo } from "./demo/useAutoDemo";
import { CursorFantasma } from "./demo/CursorFantasma";
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

  const aoAbrir = useCallback(
    (q: Quebra) => {
      setQuebra(q);
      setSelecionadoId(null);
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
  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarAbrir, setMostrarAbrir] = useState(false);
  // #298 — a conversa do desenho (SPEC-27 Fase 1) e o contexto do épico moram
  // no mesmo assistente flutuante, cada um numa aba; `null` = fechado. A
  // conversa da especificação continua separada, de propósito (SPEC-27 §3) —
  // ela pertence à tela de revisão, não ao canvas.
  const [abaAssistente, setAbaAssistente] = useState<AbaAssistente | null>(null);
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
    const atividades = derivar(quebra.diagrama, diagramaConfig, { time: quebra.time });
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
    // SPEC-48 — o tour passa pela tela dos itens escritos.
    abrirItens: () => navegar({ tela: "itens" }),
    fecharItens: () => navegar({ tela: "canvas" }),
    fecharJornada,
    fecharConfig: () => navegar({ tela: "canvas" }),
  };

  const tour = useTour(opcoesTour);
  // Demonstração automática (aditiva ao tour clicável) — mesma lista de passos,
  // mesmos onEnter, só avança sozinha em vez de esperar clique (SPEC-17 Fase I).
  const demoAutomatica = useAutoDemo(opcoesTour);

  function iniciarTour() {
    fecharJornada();
    tour.iniciar();
  }

  function iniciarDemoAutomatica() {
    fecharJornada();
    demoAutomatica.play();
  }

  // Os três caminhos que inserem nós em LOTE pedem enquadramento pelo mesmo
  // motivo: sem isso o material novo cai fora da área visível (ver
  // `pedirEnquadramento` em useQuebra).
  function adicionarCenario(q: Quebra) {
    setQuebra((atual) => ({ ...atual, diagrama: mesclarDiagrama(atual.diagrama, q.diagrama) }));
    quebraState.pedirEnquadramento();
  }

  function importarGraphify(nodes: No[]) {
    setQuebra((atual) => ({
      ...atual,
      diagrama: mesclarDiagrama(atual.diagrama, { nodes, edges: [] }),
    }));
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
          title="Diagramas prontos pra carregar no canvas e experimentar"
          style={botaoExperimentarEstilo}
        >
          ✦ Cenários prontos
        </button>
        <button
          onClick={() => {
            setAbaJornadaAlvo("jornada");
            setMostrarJornada(true);
          }}
          data-testid="abrir-demonstracao"
          title="Como o produto funciona — com demonstração automática e tour guiado"
          style={botaoExperimentarEstilo}
        >
          ▶ Demonstração &amp; tour
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

      <ReadinessSummary diagrama={quebra.diagrama} config={diagramaConfig} onSelecionar={setSelecionadoId} />

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
          />
        )}
      </div>

      {/* display:none (e não desmontar): a tela de itens cobre a revisão sem
          perder o estado dela — os balões da revisão (zIndex 62) não vazam. */}
      {resultado && (
        <div style={{ display: mostrarItens ? "none" : "contents" }}>
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
          anexosContexto={quebra.anexosContexto}
          time={quebra.time}
          respostasItens={quebra.respostasItens}
          onResponderItem={responderItem}
          itemInicial={itemInicialRevisao}
          onFechar={() => setResultado(null)}
          onSelecionarNo={setSelecionadoId}
        />
        </div>
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
          onImportarGraphify={importarGraphify}
          onIniciarTour={iniciarTour}
          onIniciarDemoAutomatica={iniciarDemoAutomatica}
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
          onAbrirArea={(area) => abrirConfigNaAba(area)}
          onPerfisMudaram={() => {
            void apiStacks.sugestoes().then(setSugestoesDeStack);
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
                        texto: "Diagrama no canvas. Agora é preencher os campos de cada componente — o semáforo mostra o que falta; vermelho trava a derivação.",
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
            onSalvar={(demandInfo, anexosContexto) => setQuebra((q) => ({ ...q, demandInfo, anexosContexto }))}
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
        />
      )}

      {demoAutomatica.ativo && demoAutomatica.passoAtual && (
        <>
          <TourOverlay
            passo={demoAutomatica.passoAtual}
            indice={demoAutomatica.indice}
            total={demoAutomatica.total}
            ultimo={demoAutomatica.ultimo}
            onProximo={demoAutomatica.proximo}
            onPular={demoAutomatica.pularPraFim}
          />
          <CursorFantasma selector={demoAutomatica.passoAtual.selector} />
          <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 82, display: "flex", gap: 8 }}>
            <button onClick={demoAutomatica.rodando ? demoAutomatica.pausar : demoAutomatica.play} style={botaoDemoEstilo}>
              {demoAutomatica.rodando ? "⏸ Pausar" : "▶ Continuar"}
            </button>
            <button onClick={demoAutomatica.pularPraFim} style={botaoDemoEstilo}>
              Encerrar demo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const botaoDemoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
};

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
