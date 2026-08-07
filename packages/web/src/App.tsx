import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  derivar,
  resolverDependencias,
  paraMarkdown,
  type Atividade,
  type DiagramaConfig,
  type No,
  type PerfisConfig,
  type Quebra,
  type ResultadoDependenciasDe,
} from "@gerador/engine";
import { carregarConfig, type ConfigCarregada } from "./config/loadConfig";
import { carregarCenarios, type Cenario } from "./demo/scenarios";
import {
  apiCamposNo,
  apiEspecificacaoTemplate,
  apiPerfisTime,
  apiReferencias,
  apiTimes,
  type CampoNo,
  type DadosCampoNo,
  type EspecificacaoTemplate,
  type Referencia,
  type SessaoUsuario,
} from "./api/client";
import { useSessao } from "./auth/useSessao";
import { LoginScreen } from "./auth/LoginScreen";
import { useQuebra } from "./state/useQuebra";
import { quebraVazia, mesclarDiagrama } from "./state/factory";
import { usePersistencia } from "./persistence/usePersistencia";
import { baixarArquivoTexto } from "./persistence/baixarArquivo";
import { Canvas } from "./canvas/Canvas";
import { PropertiesPanel } from "./panel/PropertiesPanel";
import { EdgePanel } from "./panel/EdgePanel";
import { ReadinessSummary } from "./summary/ReadinessSummary";
import { calcularResumoProntidao } from "./summary/prontidaoResumo";
import { ReviewScreen } from "./review/ReviewScreen";
import { JourneyModal, type AbaJornada } from "./demo/JourneyModal";
import { ConfigScreen, type AbaConfig } from "./config/ConfigScreen";
import { TourOverlay } from "./demo/TourOverlay";
import { useTour } from "./demo/useTour";
import { useAutoDemo } from "./demo/useAutoDemo";
import { CursorFantasma } from "./demo/CursorFantasma";
import { TerminalAnimado } from "./demo/TerminalAnimado";
import { LandingPage } from "./demo/LandingPage";
import { EscolherTimeScreen } from "./auth/EscolherTimeScreen";
import { SemTimeScreen } from "./auth/SemTimeScreen";

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
  const [timeEscolhido, setTimeEscolhido] = useState<string | undefined>(undefined);

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
  if (sessao.timeIds.length > 1 && !timeEscolhido) {
    return <EscolherTimeScreen timeIds={sessao.timeIds} onEscolher={setTimeEscolhido} onSair={sair} />;
  }
  return <AppComSessao sessao={sessao} onSair={sair} timeInicial={timeEscolhido} />;
}

interface DadosCarregados extends ConfigCarregada {
  cenarios: Cenario[];
  referencias: Referencia[];
  perfisTime: PerfisConfig;
  camposNo: CampoNo[];
  especificacaoTemplate: EspecificacaoTemplate;
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
  onSair,
  timeInicial,
}: {
  sessao: SessaoUsuario;
  onSair: () => Promise<void>;
  timeInicial?: string;
}) {
  const [timeAtivo, setTimeAtivo] = useState(timeInicial ?? sessao.timeIds[0]);
  const [dados, setDados] = useState<DadosCarregados | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    Promise.all([
      carregarConfig(timeAtivo),
      carregarCenarios(),
      apiReferencias.listar(),
      apiPerfisTime.listar(),
      apiCamposNo.listar(timeAtivo),
      apiEspecificacaoTemplate.buscar(timeAtivo),
    ])
      .then(([config, cenarios, referencias, perfisTime, camposNo, especificacaoTemplate]) => {
        setDados({ ...config, cenarios, referencias, perfisTime, camposNo, especificacaoTemplate });
      })
      .catch((e: unknown) => setErroConfig(e instanceof Error ? e.message : String(e)));
  }, [timeAtivo]);

  if (erroConfig) {
    return (
      <div style={telaCentralizadaEstilo}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <strong style={{ fontSize: 15, color: "#b91c1c" }}>Não foi possível carregar a configuração</strong>
          <p style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>{erroConfig}</p>
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
      timeAtivo={timeAtivo}
      onTrocarTimeAtivo={setTimeAtivo}
      onSair={onSair}
    />
  );
}

function AppCarregado({
  diagramaConfig: diagramaConfigInicial,
  regrasConfig,
  cenarios,
  referencias: referenciasIniciais,
  perfisTime: perfisTimeInicial,
  camposNo: camposNoInicial,
  especificacaoTemplate: especificacaoTemplateInicial,
  sessao,
  timeAtivo,
  onTrocarTimeAtivo,
  onSair,
}: ConfigCarregada & {
  cenarios: Cenario[];
  referencias: Referencia[];
  perfisTime: PerfisConfig;
  camposNo: CampoNo[];
  especificacaoTemplate: EspecificacaoTemplate;
  sessao: SessaoUsuario;
  timeAtivo: string;
  onTrocarTimeAtivo: (timeId: string) => void;
  onSair: () => Promise<void>;
}) {
  const [diagramaConfig, setDiagramaConfig] = useState<DiagramaConfig>(diagramaConfigInicial);
  const [perfisTime, setPerfisTime] = useState(perfisTimeInicial);
  const [referencias, setReferencias] = useState(referenciasIniciais);
  const [camposNo, setCamposNo] = useState(camposNoInicial);
  const [especificacaoTemplate, setEspecificacaoTemplate] = useState(especificacaoTemplateInicial);
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
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [abaConfigAlvo, setAbaConfigAlvo] = useState<AbaConfig | undefined>(undefined);
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
    setAbaConfigAlvo(aba);
    setMostrarConfig(true);
  }

  const noSelecionado = quebra.diagrama.nodes.find((n) => n.id === selecionadoId);
  const arestaSelecionada = quebra.diagrama.edges.find((e) => e.id === arestaSelecionadaId);
  const tiposDeNo = Object.entries(diagramaConfig.nodeTypes);
  const perfilDoTime = quebra.time ? perfisTime[quebra.time] : undefined;

  const [resultado, setResultado] = useState<ResultadoDependenciasDe<Atividade> | null>(null);
  const { vermelhos } = calcularResumoProntidao(quebra.diagrama, diagramaConfig);

  function derivarQuebra() {
    const atividades = derivar(quebra.diagrama, diagramaConfig, { time: quebra.time });
    setResultado(resolverDependencias(atividades));
  }

  const opcoesTour = {
    cenarios,
    carregarCenario: (q: Quebra) => aoAbrir(q),
    selecionarNo: setSelecionadoId,
    derivarQuebra,
    fecharRevisao: () => setResultado(null),
    abrirConfigNaAba,
    fecharJornada,
    fecharConfig: () => setMostrarConfig(false),
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

  function adicionarCenario(q: Quebra) {
    setQuebra((atual) => ({ ...atual, diagrama: mesclarDiagrama(atual.diagrama, q.diagrama) }));
  }

  function importarGraphify(nodes: No[]) {
    setQuebra((atual) => ({
      ...atual,
      diagrama: mesclarDiagrama(atual.diagrama, { nodes, edges: [] }),
    }));
  }

  /**
   * Único jeito de "configurar a stack do time" hoje: captura os campos preenchidos
   * manualmente de um nó real (não um formulário à parte, desconectado do uso) e
   * grava no servidor — direto no perfil compartilhado do time, visível pro resto
   * da equipe assim que salvo.
   */
  async function atualizarPerfisTime(timeId: string, tipoNo: string, valores: Record<string, unknown>) {
    const camposAtualizados = await apiPerfisTime.atualizar(timeId, tipoNo, valores);
    setPerfisTime((atual) => ({
      ...atual,
      [timeId]: { ...atual[timeId], [tipoNo]: camposAtualizados },
    }));
  }

  function salvarComoPerfilDoTime(tipoNo: string, valores: Record<string, unknown>) {
    if (!quebra.time) return;
    void atualizarPerfisTime(quebra.time, tipoNo, valores);
  }

  /** Corrige um valor já capturado (ex.: time migrou de Java 11 pra 17) — não inventa
   * campo novo, só edita um que já existe porque alguém o capturou de um nó real antes. */
  function editarValorPerfilTime(timeId: string, tipoNo: string, campo: string, valor: string) {
    void atualizarPerfisTime(timeId, tipoNo, { [campo]: valor });
  }

  async function criarReferencia(dados: { titulo: string; racional: string; designPatterns: string[]; codigoRelacionado: string[] }) {
    const criada = await apiReferencias.criar({ ...dados, timeId: quebra.time });
    setReferencias((atual) => [...atual, criada]);
  }

  async function atualizarLinkExternoReferencia(id: string, linkExterno: string) {
    const atualizada = await apiReferencias.atualizarLinkExterno(id, linkExterno);
    setReferencias((atual) => atual.map((r) => (r.id === id ? atualizada : r)));
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

  /** Recarrega o efetivo (global+override do time) depois de salvar — mesmo
   * raciocínio de `recarregarConfig`: o servidor é a única fonte de verdade
   * de como global+time se combinam, não duplica o merge aqui. */
  async function salvarEspecificacaoTemplate(dados: { timeId?: string; conteudo: string }) {
    await apiEspecificacaoTemplate.salvar(dados);
    setEspecificacaoTemplate(await apiEspecificacaoTemplate.buscar(timeAtivo));
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
          borderBottom: "1px solid #e2e8f0",
          background: "#ffffff",
        }}
      >
        <strong style={{ fontSize: 14, color: "#0f172a", marginRight: 8 }}>Gerador de Itens</strong>

        <button onClick={() => setMostrarJornada(true)} style={{ ...botaoEstilo, ...botaoJornadaEstilo }}>
          ✦ Como funciona &amp; cenários
        </button>
        <button onClick={() => setMostrarConfig(true)} style={botaoEstilo}>
          ⚙ Configurações
        </button>

        <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />

        <select
          aria-label="Time (stack conhecida)"
          value={quebra.time ?? timeAtivo}
          onChange={(e) => {
            const novoTime = e.target.value;
            setQuebra((q) => ({ ...q, time: novoTime }));
            onTrocarTimeAtivo(novoTime);
          }}
          title="Times aos quais sua sessão pertence — pré-preenchem sugestões de stack e os campos customizados desse time."
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1", width: 170 }}
        >
          {sessao.timeIds.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>

        <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />

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

        <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{sessao.email}</span>
        <button onClick={() => void onSair()} style={botaoEstilo}>
          Sair
        </button>

        <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />

        <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
          {persistencia.quebraId ? quebra.time ?? "sem time" : "nova quebra"} ·{" "}
          {{
            "sem-arquivo": "não salva",
            salvo: "salva",
            salvando: "salvando…",
            "nao-salvo": "alterações pendentes",
            erro: "erro ao salvar",
          }[persistencia.status]}
        </span>
        <button onClick={() => persistencia.nova(quebraVazia(timeAtivo))} style={botaoEstilo}>
          Nova
        </button>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) void persistencia.abrirPorId(e.target.value);
          }}
          style={{ ...botaoEstilo, maxWidth: 160 }}
          title="Abrir uma quebra já salva no servidor"
        >
          <option value="" disabled>
            Abrir…
          </option>
          {persistencia.lista.map((q) => (
            <option key={q.id} value={q.id}>
              {q.time ?? "sem time"} · {new Date(q.atualizadoEm).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
        <button onClick={() => void persistencia.salvar()} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Salvar
        </button>
        <button
          data-tour="derivar-button"
          onClick={derivarQuebra}
          disabled={vermelhos.length > 0}
          title={
            vermelhos.length > 0
              ? `Faltam resolver: ${vermelhos.map((v) => v.no.label).join(", ")}`
              : "Deriva o backlog a partir do diagrama atual"
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

      {edgeRejeitada && (
        <div
          style={{
            padding: "6px 16px",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{edgeRejeitada.motivo}</span>
          <button onClick={limparEdgeRejeitada} style={{ ...linkEstilo, color: "#b91c1c" }}>
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
            perfilDoTime={perfilDoTime}
            time={quebra.time}
            onSalvarPerfilDoTime={salvarComoPerfilDoTime}
          />
        )}
      </div>

      {resultado && (
        <ReviewScreen
          resultado={resultado}
          diagrama={quebra.diagrama}
          config={diagramaConfig}
          regras={regrasConfig}
          especificacaoTemplate={especificacaoTemplate}
          demandInfo={quebra.demandInfo}
          time={quebra.time}
          onFechar={() => setResultado(null)}
          onSelecionarNo={setSelecionadoId}
          onExportarMarkdown={() =>
            baixarArquivoTexto(
              paraMarkdown(resultado.atividades, resultado.ciclos, resultado.conflitos, regrasConfig, quebra.time),
              "backlog.md",
              "text/markdown"
            )
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
          perfisTime={perfisTime}
          referencias={referencias}
          camposNo={camposNo}
          especificacaoTemplate={especificacaoTemplate}
          timeAtivo={timeAtivo}
          onEditarValorPerfilTime={editarValorPerfilTime}
          onSalvarEspecificacaoTemplate={salvarEspecificacaoTemplate}
          onCriarReferencia={criarReferencia}
          onAtualizarLinkExternoReferencia={atualizarLinkExternoReferencia}
          onCriarCampoNo={criarCampoNo}
          onAtualizarCampoNo={atualizarCampoNo}
          onExcluirCampoNo={excluirCampoNo}
          onFechar={() => setMostrarConfig(false)}
          abaForcada={abaConfigAlvo}
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
          {demoAutomatica.passoAtual.titulo === "Linha de comando" && (
            <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: "min(520px, 90vw)", zIndex: 82 }}>
              <TerminalAnimado />
            </div>
          )}
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
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#0f172a",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)",
};

const telaCentralizadaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  color: "#64748b",
  padding: 24,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4f46e5",
};

const botaoJornadaEstilo: React.CSSProperties = {
  background: "#f5f5ff",
  color: "#4f46e5",
  border: "1px solid #c7d2fe",
  fontWeight: 600,
};

const botaoDesabilitadoEstilo: React.CSSProperties = {
  background: "#c7d2fe",
  border: "1px solid #c7d2fe",
  cursor: "not-allowed",
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
};
