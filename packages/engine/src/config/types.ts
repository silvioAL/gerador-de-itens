import type { StatusNo, Tamanho } from "../model/types.js";

/**
 * Condição de visibilidade de campo (`when`). Sete operadores, nada mais —
 * ver SPEC-01 §6. `field/preenchido` aceita `true` (preenchido) ou `false` (vazio).
 */
export type Condicao =
  | { field: string; equals: unknown }
  | { field: string; notEquals: unknown }
  | { field: string; preenchido: boolean }
  | { hasIncomingEdge: string[] }
  | { hasOutgoingEdge: string[] }
  | { nodeStatus: StatusNo }
  | { allOf: Condicao[] }
  | { anyOf: Condicao[] }
  | { not: Condicao };

/** "textarea": mesmo valor string que "text", só que a UI reserva mais espaço
 * vertical e oferece expandir pra uma área maior — pra campos de conteúdo
 * longo (contrato de payload, schema de documento), onde uma linha só
 * esconde o que a pessoa escreveu. */
export type TipoCampo = "text" | "textarea" | "number" | "boolean" | "select";

export interface FieldSpec {
  key: string;
  label: string;
  type: TipoCampo;
  required?: boolean;
  default?: unknown;
  when?: Condicao;
  ajuda?: string;
  permiteNA?: boolean;
  options?: string[];
}

export interface NodeTypeConfig {
  label: string;
  derives: string;
  techs: string[];
  contextos: string[];
  spec: FieldSpec[];
  color?: string;
  /**
   * Ícone mostrado num badge colorido no cabeçalho do nó no canvas —
   * puramente visual, nunca usado por nenhuma regra do engine. Duas formas:
   * (1) nome de um ícone SVG do catálogo fixo em `packages/web/src/canvas/icones.ts`
   * (ex.: "Database", "Server") — renderiza um ícone vetorial de verdade,
   * sem depender de fonte de emoji/GPU do SO (motivo: emoji colorido já se
   * mostrou pouco confiável entre máquinas, ver JOURNEY.md §18.2-18.3);
   * (2) qualquer outro texto curto (1-2 caracteres) vira um badge de texto
   * simples. Sem `icon`, cai na primeira letra de `label`.
   */
  icon?: string;
  /**
   * Chaves de `spec` a resumir na atividade de CRIAÇÃO deste nó — nunca
   * hardcoded no engine, porque cada tecnologia decide seu resumo relevante
   * (SPEC-01 §9.4 regra 3). Ex.: para uma fila, o que importa ao criá-la
   * (`dlq`, `ack`) é diferente do que importa ao descrever um consumo dela.
   */
  specResumo?: string[];
  /**
   * Chaves de `spec` a resumir na atividade derivada de uma ARESTA que tem
   * este nó como alvo, por tipo de aresta (`consumes`, `publishes`...) —
   * mesmo raciocínio de `specResumo`, mas o resumo de "quem consome" quase
   * sempre difere do resumo de "criar o recurso".
   */
  specResumoPorAresta?: Record<string, string[]>;
  /**
   * Cenário Gherkin de boas práticas pra este tipo de nó (SPEC-14 §4/§9) —
   * usado na seção "Critérios de aceite" da especificação de entrega. É um
   * molde de padrão de integração (REST retorna 2xx/4xx, mensageria tem DLQ,
   * dados validam constraint...), nunca o cenário de negócio real — isso
   * continua sendo trabalho do subagente de refino. Sem isso configurado,
   * cai no placeholder genérico `<contexto>/<ação>/<resultado esperado>`.
   */
  cenarioGherkinPadrao?: string;
  /**
   * Override por tipo de aresta de entrada — mesmo raciocínio de
   * `specResumoPorAresta`: o cenário de "publicar" e o de "consumir" numa
   * fila são comportamentos diferentes, não o mesmo texto genérico.
   */
  cenarioGherkinPorAresta?: Record<string, string>;
}

export interface EdgeTypeConfig {
  label: string;
  color?: string;
  /** Verbo usado na descrição da atividade derivada ("publica em", "lê de"...). Sem isso, usa `label`. */
  verbo?: string;
  /** Tamanho da atividade derivada desta aresta. Sem isso, "P". */
  tamanhoPadrao?: Tamanho;
  /** `false` para arestas puramente topológicas (ex.: `binding`) que não viram atividade própria — o padrão é gerar. */
  gerarAtividade?: boolean;
}

export interface EdgeRule {
  valid: string[];
  default?: string;
}

/** Contrato de genericidade: nenhum tipo de nó/aresta é hardcoded no engine. */
export interface DiagramaConfig {
  nodeTypes: Record<string, NodeTypeConfig>;
  edgeTypes: Record<string, EdgeTypeConfig>;
  /** Regras de conexão válida por tipo de nó de DESTINO. */
  edgeRules: Record<string, EdgeRule>;
}

export interface AppConfig {
  techs: string[];
  contextos: string[];
}

export type TipoRequisito = "checklist" | "fill-now" | "texto";

/**
 * Item de refinamento técnico por tech. `contextos: []` aplica sempre que a tech
 * estiver presente; caso contrário, só aparece quando um dos contextos da
 * atividade contém (ou é contido por) algum destes — mesmo casamento parcial
 * do legado, deliberado: "Backend-mensagens" bate com "Backend-mensagens rabbitmq".
 */
export interface Requisito {
  texto: string;
  tipo: TipoRequisito;
  contextos: string[];
}

export interface TesteAutomatizado {
  tipo: string;
  validacao: string;
  contextos: string[];
  dev: boolean;
  hlg: boolean;
}

export interface RegrasPorTech {
  requisitos: Requisito[];
  testes: TesteAutomatizado[];
}

export interface RegrasConfig {
  tipos: string[];
  tamanhos: string[];
  /** Checklist de refinamento técnico + ciclos de teste, por tech. */
  porTech: Record<string, RegrasPorTech>;
}

/**
 * Base de conhecimento de stack por time: `nodeType -> fieldKey -> valor`.
 * Ex.: `{ service: { linguagem: "Java", framework: "Spring Boot" } }` — um
 * time que só usa Java/Spring não deveria reconfigurar isso a cada serviço novo.
 */
export type PerfilTime = Record<string, Record<string, unknown>>;

/** `config/perfis-time.json`: um `PerfilTime` por id de time. */
export type PerfisConfig = Record<string, PerfilTime>;

export interface ErroValidacaoConfig {
  campo: string;
  mensagem: string;
}
