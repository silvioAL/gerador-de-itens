/**
 * Modelo de domínio do engine. TS puro — nenhuma dependência de framework,
 * de Node (`fs`/`http`) ou de browser. Ver packages/engine/README para a regra de fronteira.
 */

export type StatusNo = "novo" | "existente";

export type Origem = "manual" | "extraido" | "inferido" | "sugerido";

export interface ValorSpec {
  valor: unknown;
  origem: Origem;
  evidencia?: string; // origem = extraido
  confianca?: number; // origem = inferido
  confirmado?: boolean; // origem = inferido ou sugerido
  padrao?: string; // id do padrão que preencheu, se houver
  /** SPEC-26 Bloco 1 — procedência: rótulo do insumo → hash do valor dele no
   * momento em que esta resposta foi escrita. Comparar com o estado atual diz
   * se a resposta nasceu de um desenho que já mudou (ver
   * `procedencia/procedencia.ts`). Ausente em resposta escrita antes deste
   * mecanismo existir, e nesse caso nada se afirma sobre ela. */
  baseadoEm?: Record<string, string>;
}

export interface JustificativaNA {
  motivo: string;
}

/** Forma de cada item de um campo `spec` do tipo "lista" chamado `endpoints`
 * (ex.: `service.spec` em `diagrama.json`) — não mais um campo especial do
 * `No`, é só um `ValorSpec.valor: Endpoint[]` como qualquer outro campo
 * `type: "lista"`. `request`/`response` opcionais: nem todo endpoint precisa
 * documentar payload (ex.: um DELETE sem corpo). */
export interface Endpoint {
  method: string;
  path: string;
  action: string;
  request?: string;
  response?: string;
}

export interface Ponto {
  x: number;
  y: number;
}

export interface No {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
  status: StatusNo;
  time?: string;
  spec: Record<string, ValorSpec>;
  specNA: Record<string, JustificativaNA>;
  /** Coleções estruturadas de outros domínios (ex.: stages de um processo Camunda) — genérico de propósito. */
  data?: Record<string, unknown>;
  knownInfo?: string;
}

export interface Aresta {
  id: string;
  source: string;
  target: string;
  type: string;
  /** Lado do nó de onde a conexão foi arrastada/chega (ex.: "source-right", "target-left") —
   * sem isso o canvas sempre renderiza a partir do primeiro handle declarado no nó. */
  sourceHandle?: string;
  targetHandle?: string;
  note?: string;
  reversed?: boolean;
  routingMode?: string;
  waypoints?: Ponto[];
  labelOffset?: Ponto;
  /** Valores dos campos de `EdgeTypeConfig.spec` desta conexão (SPEC-21) —
   * mesma forma de `No.spec`/`No.specNA`, um `Aresta` a mais que pode carregar
   * dado próprio em vez de só ligar dois nós. */
  spec?: Record<string, ValorSpec>;
  specNA?: Record<string, JustificativaNA>;
}

export interface Diagrama {
  nodes: No[];
  edges: Aresta[];
}

export interface Quebra {
  /** Curto, pra achar essa quebra depois numa lista/busca — diferente de
   * `demandInfo` (a descrição longa do contexto). Não é chave: duas quebras
   * podem ter o mesmo título, cada uma com seu próprio id de persistência. */
  titulo?: string;
  demandInfo?: string;
  time?: string;
  diagrama: Diagrama;
  /** Respostas (humanas ou sugeridas por IA) aos placeholders "<- ✍️ especificar"
   * do refinamento técnico/volumetria (Fase 1, SPEC-23) — chave externa é
   * `Atividade.chave` (estável entre derivações), chave interna é
   * `${tech}::${texto do requisito}` ou `${tech}::volumetria::${campo}`.
   * Sobrevive a uma nova derivação porque mora na quebra, não na atividade
   * recalculada. Não passa por `calcularProntidao()` — é reuso da FORMA de
   * `ValorSpec`/`Origem`, não do semáforo de prontidão em si. */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
  /** Anexos de texto do contexto do épico (Fase 1b, SPEC-23) — nome do
   * arquivo + conteúdo já extraído (`FileReader.readAsText`, só arquivos de
   * texto). Junto com `demandInfo`, alimenta o prompt real de `/ia/sugerir`,
   * não só a seção "Contexto" do documento exportado. */
  anexosContexto?: { nome: string; conteudo: string }[];
}

export type TipoItem = "História" | "Task" | "Débito Técnico";

export type Tamanho = "PP" | "P" | "M" | "G";

export type TipoDependencia = "independent" | "enabler" | "dependent";

export interface Dependencia {
  type: TipoDependencia;
  alvoChave?: string;
  detalhe?: string;
}

export interface OrigemAtividade {
  nodeId?: string;
  edgeId?: string;
}

export interface Atividade {
  /** Estável: deriva da origem, nunca muda quando um nó é inserido no meio. */
  chave: string;
  /** Sequencial de exibição, recalculado a cada derivação. */
  rotulo: string;
  tipo: TipoItem;
  tamanho: Tamanho;
  descricao: string;
  techs: string[];
  contextos: string[];
  dependencias: Dependencia[];
  origem: OrigemAtividade;
  specResumo?: Record<string, unknown>;
  timesEnvolvidos?: string[];
}

export type NivelProntidao = "vermelho" | "amarelo" | "verde";

export type CodigoErroSpec = "NA_SEM_MOTIVO" | "NA_NAO_PERMITIDO";

export interface ErroSpec {
  campo: string;
  codigo: CodigoErroSpec;
}

export interface Prontidao {
  nivel: NivelProntidao;
  obrigatoriosEmAberto: string[];
  inferidosPendentes: string[];
  erros: ErroSpec[];
}

export interface Ciclo {
  caminho: string[];
}

export type CodigoConflito =
  | "ENABLER_E_DEPENDENT"
  | "INDEPENDENT_COM_DEPENDENCIA"
  | "ALVO_INEXISTENTE";

export interface Conflito {
  codigo: CodigoConflito;
  atividades: string[];
  alvo?: string;
}

export interface ResultadoDependencias {
  atividades: Atividade[];
  ciclos: Ciclo[];
  conflitos: Conflito[];
  ordemTopologica: string[];
  podeDerivar: boolean;
}
