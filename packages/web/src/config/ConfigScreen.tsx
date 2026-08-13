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
import { PdcaTab } from "./PdcaTab";

export type AbaConfig =
  | "perfis"
  | "campos"
  | "camposAresta"
  | "regras"
  | "membros"
  | "acessos"
  | "especificacao"
  | "pipeline"
  | "modeloIa" | "pdca";

export interface ConfigScreenProps {
  config: DiagramaConfig;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  especificacaoTemplate: EspecificacaoTemplate;
  /** SPEC-47 — template do corpo do item (null = ainda o padrão). */
  templateItem?: EspecificacaoTemplate | null;
  pipelineAgentes: ConfigPipelineAgentes;
  timeAtivo: string;
  /** false no modo local (CLI) — sem servidor não existe conceito de outros
   * membros pra administrar; a aba não faz sentido. */
  /** SPEC-38 F2 — apontar/trocar perfil de stack muda a projeção; o App recarrega. */
  onPerfisMudaram: () => void;
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
  onPerfisMudaram,
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
    ] satisfies { id: AbaConfig; rotulo: string; existe: boolean }[]
  ).filter((a) => a.existe && podeVerAba(a.id, permissoes.pode));

  // A aba ativa pode ter sumido (papel trocado, ou `abaForcada` do tour
  // apontando pra algo negado). Cair na primeira visível evita a tela em branco.
  // A área da rota pode estar negada pro papel — cai na primeira visível
  // (mesma régua de antes, agora dirigida pela rota).
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
          Voltar ao canvas
        </button>
      </header>

      {/* `data-testid` no CORPO da aba, e não em cada conteúdo: é o que permite
          a um teste só perguntar "toda aba visível mostra alguma coisa?" — a
          pergunta que ninguém tinha feito quando o gate ficou pela metade. */}
      <div data-testid="corpo-da-aba" style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {abaAtiva === "pdca" && <PdcaTab config={config} timeAtivo={timeAtivo} onAbrirArea={onAbrirArea} />}
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
