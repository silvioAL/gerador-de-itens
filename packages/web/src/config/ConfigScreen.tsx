import { useEffect, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import { TEMPLATE_ITEM_PADRAO } from "@gerador/engine";
import type { CampoAresta, CampoNo, ConfigPipelineAgentes, DadosCampoAresta, DadosCampoNo, EspecificacaoTemplate } from "../api/client";
import { PerfisStackTab } from "./PerfisStackTab";
import { CamposNoTab } from "./CamposNoTab";
import { CamposArestaTab } from "./CamposArestaTab";
import { MembrosTab } from "./MembrosTab";
import { AcessosTab } from "./AcessosTab";
import { EspecificacaoTemplateTab } from "./EspecificacaoTemplateTab";
import { PipelineAgentesTab } from "./PipelineAgentesTab";
import { ModeloIaTab } from "./ModeloIaTab";
import { RegrasTab } from "./RegrasTab";
import { RECURSO_DA_ABA, RECURSO_DA_SECAO_DE_REGRAS, usePermissoes } from "../auth/usePermissoes";
import { apiPdca } from "../api/client";
import { PdcaTab } from "./PdcaTab";
import { ExportacaoTab } from "./ExportacaoTab";
import { ProdutosTab } from "./ProdutosTab";

export type AbaConfig =
  | "produtos"
  | "perfis"
  | "campos"
  | "camposAresta"
  | "regras"
  | "membros"
  | "acessos"
  | "especificacao"
  | "pipeline"
  | "modeloIa" | "pdca" | "exportacao";

export interface ConfigScreenProps {
  config: DiagramaConfig;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  especificacaoTemplate: EspecificacaoTemplate;
  /** SPEC-47 — template do corpo do item (null = ainda o padrão). */
  templateItem?: EspecificacaoTemplate | null;
  pipelineAgentes: ConfigPipelineAgentes;
  timeAtivo: string;
  /** SPEC-53 — os times aos quais um produto pode ser amarrado. */
  timeIds: string[];
  /** false no modo local (CLI) — sem servidor não existe conceito de outros
   * membros pra administrar; a aba não faz sentido. */
  /** SPEC-38 F2 — apontar/trocar perfil de stack muda a projeção; o App recarrega. */
  onPerfisMudaram: () => void;
  /** SPEC-52 — a ficha mudou por um ajuste APLICADO na tela do PDCA (e não
   * pela tela de campos, que já tem os callbacks próprios). */
  onFichaMudou?: () => void;
  onCriarCampoNo: (dados: DadosCampoNo) => Promise<void>;
  onAtualizarCampoNo: (id: string, dados: Partial<DadosCampoNo>) => Promise<void>;
  onExcluirCampoNo: (id: string) => Promise<void>;
  onCriarCampoAresta: (dados: DadosCampoAresta) => Promise<void>;
  onAtualizarCampoAresta: (id: string, dados: Partial<DadosCampoAresta>) => Promise<void>;
  onExcluirCampoAresta: (id: string) => Promise<void>;
  onSalvarEspecificacaoTemplate: (dados: { timeId?: string; conteudo: string }) => Promise<void>;
  onSalvarPipelineAgentes: (dados: ConfigPipelineAgentes) => Promise<void>;
  onFechar: () => void;
  /** Troca a aba ativa de fora (tour guiado) sem fechar/reabrir a tela. */
  area: AbaConfig;
  /** Abre o menu (☰) por cima da tela — trocar de área é pelo menu. */
  onAbrirMenu: () => void;
  /** SPEC-45 — deep-link do PDCA para a configuração alvo de um pedido. */
  onAbrirArea?: (area: AbaConfig) => void;
  /** Techs e contextos conhecidos (`appConfig`) — alimentam os seletores de
   * contexto por clique de Regras e Pipeline. */
  techs?: string[];
  contextos?: string[];
}

/**
 * Regras é a exceção: uma tela, QUATRO recursos. Aparece se a pessoa puder
 * QUALQUER um dos quatro — esconder a aba inteira tiraria o checklist de
 * processo de quem cuida só dele, que é exatamente a delegação que a feature
 * existe para permitir. As seções internas são filtradas uma a uma.
 */
function podeVerAba(id: AbaConfig, pode: (recurso: string, acao?: string) => boolean): boolean {
  if (id === "regras") return Object.values(RECURSO_DA_SECAO_DE_REGRAS).some((r) => pode(r));
  const recurso = RECURSO_DA_ABA[id];
  return recurso ? pode(recurso) : true;
}

/**
 * Tela cheia (mesmo padrão de ReviewScreen.tsx), não mais aba dentro da
 * JourneyModal — o editor de campos por tipo de nó não cabe na densidade de
 * uma aba de onboarding (SPEC-08 §3.5). Reúne o que é config recorrente de
 * time: perfis de stack, campos de formulário.
 */
export function ConfigScreen({
  config,
  camposNo,
  camposAresta,
  especificacaoTemplate,
  templateItem,
  pipelineAgentes,
  timeAtivo,
  timeIds,
  onPerfisMudaram,
  onFichaMudou,
  onCriarCampoNo,
  onAtualizarCampoNo,
  onExcluirCampoNo,
  onCriarCampoAresta,
  onAtualizarCampoAresta,
  onExcluirCampoAresta,
  onSalvarEspecificacaoTemplate,
  onSalvarPipelineAgentes,
  onFechar,
  area,
  onAbrirMenu,
  onAbrirArea,
  techs,
  contextos,
}: ConfigScreenProps) {


  // tech → labels dos componentes que a usam — é o que deixa a aba de Regras
  // falar "vale para: Serviço, Fila Rabbit…" em vez de exibir um seletor de
  // "Tecnologia" (vocabulário interno que o usuário apontou como sem sentido).
  const componentesPorTech: Record<string, string[]> = {};
  for (const tipo of Object.values(config.nodeTypes)) {
    for (const tech of tipo.techs ?? []) {
      (componentesPorTech[tech] ??= []).push(tipo.label);
    }
  }


  // SPEC-33: só o hospedado existe — as props de modo (`mostrarMembros`/
  // `mostrarCamposAresta`) morreram junto com o ramo morto da §158, e a aba
  // de campos de conexão DESTRAVOU: as rotas existem desde a SPEC-31 e a
  // porta desde o #303, mas o gate `modo === "local"` a mantinha inalcançável.
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });

  /**
   * SPEC-28 Fase 2 — a aba some quando a permissão não existe.
   *
   * Duas condições diferentes, deliberadamente separadas:
   * - `existe`: a aba faz sentido NESTE MODO (local x hospedado). Nada a ver
   *   com permissão; é a régua que já existia.
   * - o `pode`: quem está logado tem a permissão. Só vale no hospedado com RBAC
   *   ligado — em qualquer outro caso o hook devolve `true` (falha aberta).
   */
  const abasVisiveis = (
    [
      // SPEC-53 — primeiro da lista de propósito: é o contexto que vale para
      // tudo o que vem depois (a stack, o checklist e o item são COMO se
      // constrói; o produto é PARA QUÊ).
      { id: "produtos", rotulo: "Contexto do produto", existe: true },
      { id: "perfis", rotulo: "Stacks conhecidas", existe: true },
      /**
       * "Campos por tipo de nó" era vocabulário do CÓDIGO: "nó" é jargão de
       * canvas e "campos" não diz o que se ganha. O nome novo é o do próprio
       * usuário — ele diz "componente", e chamou isto de "padrões técnicos
       * configuráveis (obrigatórios ou não)" ao explicar para que serve o RBAC.
       *
       * O contador diz "do time" porque "(0)" lia como "não existe nada",
       * quando há dezenas de campos padrão vindos do `diagrama.json`. Zero aqui
       * significa "este time ainda não personalizou", não "está vazio".
       */
      { id: "campos", rotulo: `Padrões por componente (${camposNo.length} do time)`, existe: true },
      { id: "camposAresta", rotulo: `Campos por tipo de conexão (${camposAresta.length})`, existe: true },
      { id: "membros", rotulo: "Membros", existe: true },
      // SPEC-28 §2: acessos só existem no hospedado — no local não há login, e
      // permissão em arquivo seria convenção, não segurança.
      { id: "acessos", rotulo: "Acessos", existe: true },
      /**
       * ACHADO desta rodada: esta aba estava atrás de `mostrarCamposAresta`, que
       * é "modo LOCAL". Fazia sentido quando ela nasceu (SPEC-23 fluxo 5), com
       * `regras` existindo só como arquivo. A SPEC-31 Fase 3 criou
       * `/config/regras` no hospedado depois, e ninguém revisitou o gate.
       *
       * O efeito era uma contradição silenciosa: o RBAC só existe no hospedado,
       * e a tela que edita os quatro `regras.*` só aparecia no local. "Agilidade
       * cuida do checklist de processo" — o pedido que originou a SPEC-28
       * inteira — não tinha por onde ser exercido.
       */
      { id: "regras", rotulo: "Regras de refinamento", existe: true },
      { id: "especificacao", rotulo: "Especificação de solução", existe: true },
      { id: "pipeline", rotulo: "Pipeline de IA", existe: true },
      { id: "modeloIa", rotulo: "Modelo de IA", existe: true },
      { id: "pdca", rotulo: "PDCA — melhoria contínua", existe: true },
      { id: "exportacao", rotulo: "Exportação", existe: true },
    ] satisfies { id: AbaConfig; rotulo: string; existe: boolean }[]
  ).filter((a) => a.existe && podeVerAba(a.id, permissoes.pode));

  // SPEC-51 — área NEGADA não cai mais em outra tela em silêncio: quem clicou
  // em "Modelo de IA" e foi parar em "Membros" não entende o que aconteceu (e
  // pensa que o produto está quebrado). Agora a tela DIZ que é permissão, e
  // oferece o caminho de pedir — que é o que a pessoa faria de qualquer jeito,
  // só que fora da ferramenta.
  const areaNegada = !abasVisiveis.some((a) => a.id === area) && !permissoes.carregando;
  const abaAtiva = abasVisiveis.some((a) => a.id === area) ? area : abasVisiveis[0]?.id;
  const rotuloDaArea = abasVisiveis.find((a) => a.id === abaAtiva)?.rotulo ?? "Configurações";

  return (
    <div
      data-tour="config-screen-content"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--painel)",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--borda)",
        }}
      >
        {/* SPEC-40 F1 — a régua de abas MORREU: cada área é uma tela com rota
            própria; trocar de área é pelo menu (☰), que também vive aqui. */}
        <button onClick={onAbrirMenu} data-tour="menu-botao" style={botaoEstilo}>
          ☰ Menu
        </button>
        <strong style={{ fontSize: 14 }}>{rotuloDaArea}</strong>
        <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>Configurações · time ativo: {timeAtivo}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar à mesa de projeto
        </button>
      </header>

      {/* `data-testid` no CORPO da aba, e não em cada conteúdo: é o que permite
          a um teste só perguntar "toda aba visível mostra alguma coisa?" — a
          pergunta que ninguém tinha feito quando o gate ficou pela metade. */}
      <div data-testid="corpo-da-aba" style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {areaNegada && <SemPermissao area={area} />}
        {abaAtiva === "pdca" && (
          <PdcaTab config={config} timeAtivo={timeAtivo} onAbrirArea={onAbrirArea} onFichaMudou={onFichaMudou} />
        )}
        {abaAtiva === "exportacao" && <ExportacaoTab />}
        {abaAtiva === "produtos" && <ProdutosTab timeIds={timeIds} />}
        {abaAtiva === "perfis" && (
          <PerfisStackTab config={config} onPerfisMudaram={onPerfisMudaram} />
        )}
        {abaAtiva === "campos" && (
          <CamposNoTab
            config={config}
            camposNo={camposNo}
            timeAtivo={timeAtivo}
            onCriar={onCriarCampoNo}
            onAtualizar={onAtualizarCampoNo}
            onExcluir={onExcluirCampoNo}
          />
        )}
        {abaAtiva === "camposAresta" && (
          <CamposArestaTab
            config={config}
            camposAresta={camposAresta}
            timeAtivo={timeAtivo}
            onCriar={onCriarCampoAresta}
            onAtualizar={onAtualizarCampoAresta}
            onExcluir={onExcluirCampoAresta}
          />
        )}
        {/**
         * ACHADO REAL do usuário: no modo HOSPEDADO a aba "Regras de refinamento"
         * abria em branco. O gate `mostrarCamposAresta` (que é "modo local") foi
         * removido da DECLARAÇÃO da aba na rodada do #289 — e continuou aqui, no
         * corpo. Resultado: o botão aparecia, o conteúdo não.
         *
         * Pior: o comentário que explica a correção está a oitenta linhas daqui,
         * ao lado da metade que foi corrigida. Dois lugares decidem se uma aba
         * existe, e só um foi revisado — a §145 outra vez.
         */}
        {abaAtiva === "regras" && (
          <RegrasTab
            podeSecao={(id) => permissoes.pode(RECURSO_DA_SECAO_DE_REGRAS[id])}
            contextos={contextos}
            componentesPorTech={componentesPorTech}
            techs={techs}
            nodeTypes={config.nodeTypes}
          />
        )}
        {abaAtiva === "membros" && <MembrosTab timeAtivo={timeAtivo} />}
        {abaAtiva === "acessos" && <AcessosTab timeAtivo={timeAtivo} />}
        {abaAtiva === "especificacao" && (
          <EspecificacaoTemplateTab
            template={especificacaoTemplate}
            timeAtivo={timeAtivo}
            onSalvar={onSalvarEspecificacaoTemplate}
          templateItem={templateItem}
            templateItemPadrao={TEMPLATE_ITEM_PADRAO}
          />
        )}
        {abaAtiva === "pipeline" && (
          <PipelineAgentesTab
            config={pipelineAgentes}
            onSalvar={onSalvarPipelineAgentes}
            // Papel casa tanto por tech quanto por contexto — as duas listas.
            opcoesDeContexto={[...(techs ?? []), ...(contextos ?? [])]}
          />
        )}
        {abaAtiva === "modeloIa" && <ModeloIaTab />}
      </div>
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4f46e5",
};

const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: "8px 8px 0 0",
  border: "none",
  borderBottom: "2px solid transparent",
  background: "none",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  color: "#a5b4fc",
  borderBottom: "2px solid #4f46e5",
};

/** Recurso do RBAC → recurso SOLICITÁVEL (a lista fechada do servidor). Nem
 * tudo se pede: acesso e credencial são decisão de quem administra, não
 * ajuste de configuração — pra esses a tela diz a quem falar. */
const RECURSO_SOLICITAVEL_DA_ABA: Record<string, string> = {
  campos: "campos-no",
  camposAresta: "campos-aresta",
  especificacao: "especificacao-template",
  pipeline: "pipeline-agentes",
  regras: "regras",
};

/**
 * SPEC-51 — a permissão que barra vira um PEDIDO, no lugar onde ela barrou.
 *
 * Antes, quem não podia editar simplesmente não via a área (e o item do menu
 * levava a outra tela). O caminho existia — a entrevista do PDCA — mas longe
 * do momento em que a pessoa quer a mudança. Pedir daqui já sabe o recurso.
 */
function SemPermissao({ area }: { area: AbaConfig }) {
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const recurso = RECURSO_SOLICITAVEL_DA_ABA[area];

  async function pedir() {
    setErro(null);
    try {
      await apiPdca.criarAjuste({ recurso, descricao: texto.trim() });
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={semPermissaoEstilo} data-testid="area-sem-permissao">
      <strong style={{ fontSize: 13.5 }}>🔒 Você não tem permissão para editar esta área.</strong>
      {recurso ? (
        enviado ? (
          <p style={{ fontSize: 12.5, color: "var(--verde, #3ecf8e)", margin: "8px 0 0" }} data-testid="pedido-enviado">
            Pedido enviado — quem cuida desta configuração vê e decide em Configurações → PDCA.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "8px 0" }}>
              Diga o que precisa mudar: vira uma solicitação de ajuste pra quem cuida desta configuração — com a
              mudança visível antes de decidir.
            </p>
            <textarea
              aria-label="O que precisa mudar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="ex.: falta o campo de DLQ no formulário da Fila Rabbit"
              style={textareaPedidoEstilo}
            />
            {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}
            <button
              onClick={() => void pedir()}
              disabled={!texto.trim()}
              style={botaoPedirEstilo}
              data-testid="pedir-ajuste"
            >
              Pedir ajuste
            </button>
          </>
        )
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "8px 0 0" }}>
          Esta área é de quem administra o time (acessos, membros e credenciais não se pedem por ajuste de
          configuração) — fale com um owner do time.
        </p>
      )}
    </div>
  );
}

const semPermissaoEstilo: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  maxWidth: 620,
};

const textareaPedidoEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  resize: "vertical",
};

const botaoPedirEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  marginTop: 8,
};
