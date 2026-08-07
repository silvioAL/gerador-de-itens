import type { StatusNo, Tamanho } from "../model/types.js";

/**
 * Condição de visibilidade (`when`) — de campo (`FieldSpec.when`) ou de item de
 * checklist de processo (`ItemProcesso.when`). Ver SPEC-01 §6 e SPEC-20.
 * `field/preenchido` aceita `true` (preenchido) ou `false` (vazio).
 *
 * Eram sete operadores; `nodeType` e `listaContem` entraram com o checklist de
 * processo (SPEC-20), que precisa condicionar por coisas que campo de nó nunca
 * precisou: "se o componente é serviço" (num campo de `spec`, o tipo de nó já é
 * implícito — num item de processo, não) e "se algum endpoint é novo" (olhar
 * dentro de um campo `type: "lista"`).
 */
export type Condicao =
  | { field: string; equals: unknown }
  | { field: string; notEquals: unknown }
  | { field: string; preenchido: boolean }
  | { hasIncomingEdge: string[] }
  | { hasOutgoingEdge: string[] }
  | { nodeStatus: StatusNo }
  | { nodeType: string[] }
  | { listaContem: { field: string; sub: string; equals: unknown } }
  | { allOf: Condicao[] }
  | { anyOf: Condicao[] }
  | { not: Condicao };

/** "textarea": mesmo valor string que "text", só que a UI reserva mais espaço
 * vertical e oferece expandir pra uma área maior — pra campos de conteúdo
 * longo (contrato de payload, schema de documento), onde uma linha só
 * esconde o que a pessoa escreveu. "lista": repetível — zero ou mais itens,
 * cada um com a forma de `FieldSpec.itemSpec` (ex.: os endpoints de um
 * serviço, cada um com method/path/request/response). Achado real: o
 * protótipo original tinha várias dessas listas hardcoded (endpoints, stages
 * de Camunda, motores/rulesets do FICO, regras de negócio) — cada uma com seu
 * próprio HTML/JS de repetição. Aqui é um mecanismo genérico só, configurável
 * em `diagrama.json`/`campos-no.json`, não um componente por domínio. */
export type TipoCampo = "text" | "textarea" | "number" | "boolean" | "select" | "lista";

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
  /** Identifica a instância (ex.: nome do serviço, tópico, tabela) em vez de
   * descrever uma característica compartilhada de stack — todo tipo de nó tem
   * um. Marcado pra excluir da sugestão de perfil de time (`PerfisTimeTab`,
   * "salvar como padrão do time"): um valor fixo sugerido pra esse campo em
   * todo nó novo do tipo não faz sentido, já que cada instância precisa do
   * seu próprio nome único — achado real (usuário tentou e "não aconteceu
   * nada" de útil). Não afeta exibição/edição de valores já salvos. */
  identificador?: boolean;
  /** Só relevante quando `type === "lista"` — a forma de cada item da lista
   * (sem `type: "lista"` aninhado; não suporta lista-de-lista, complexidade
   * que ninguém pediu). O valor do campo (`ValorSpec.valor`) é
   * `Record<string, unknown>[]`, um objeto por item, chaveado por
   * `itemSpec[].key`. */
  itemSpec?: FieldSpec[];
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

/**
 * Item de refinamento técnico por tech. `contextos: []` aplica sempre que a tech
 * estiver presente; caso contrário, só aparece quando um dos contextos da
 * atividade contém (ou é contido por) algum destes — mesmo casamento parcial
 * do legado, deliberado: "Backend-mensagens" bate com "Backend-mensagens rabbitmq".
 *
 * Achado real: existia um `tipo: "checklist" | "fill-now" | "texto"` que
 * mudava a renderização (`- [ ] texto` vs `texto <- especificar`) — mas o
 * agente de IA que valida os itens (documentação em Confluence) exige que
 * **toda** linha de "Requisitos de refinamento" termine com o mesmo marcador
 * `<- ✍️ especificar`, sem formato de checklist. Removido — todo requisito
 * renderiza igual agora, o campo não tinha mais efeito nenhum que fizesse
 * sentido manter.
 */
export interface Requisito {
  texto: string;
  contextos: string[];
}

export interface TesteAutomatizado {
  tipo: string;
  validacao: string;
  contextos: string[];
  dev: boolean;
  hlg: boolean;
}

/**
 * Item de checklist de **processo** — o que o time precisa *fazer* pra
 * conseguir executar e testar (configurar mock, levantar massa, repontar
 * serviço), diferente do checklist técnico (`Requisito`), que é o que precisa
 * ser *decidido/especificado* no desenho.
 *
 * Achado real (SPEC-20): os dois estavam misturados numa lista só, e isso
 * violava o próprio padrão do agente validador, que lista "atividades de
 * teste" entre o que **não** é requisito de refinamento. Separar não é só
 * organização — é o que deixa a seção "Requisitos de refinamento" correta.
 */
export interface ItemProcesso {
  texto: string;
  /** Mesmo casamento parcial de contexto do checklist técnico. */
  contextos: string[];
  /** Avaliada contra os nós de origem da atividade — o item aparece se
   * **algum** deles satisfizer (mesma régua de `.some()` do casamento de
   * contexto). Sem `when`, basta tech + contexto baterem. */
  when?: Condicao;
}

export interface RegrasPorTech {
  /** Checklist técnico: o que precisa ser decidido/especificado no desenho.
   * Renderizado como "Requisitos de refinamento técnico". */
  checklistTecnico: Requisito[];
  /** Checklist de processo: o que o time precisa fazer pra executar/testar. */
  checklistProcesso?: ItemProcesso[];
  testes: TesteAutomatizado[];
  /** Quando presente, ativa o bloco fixo "Requisitos de volumetria" (Response
   * time/Max error/RPS/Test duration, sempre em branco pra preenchimento
   * manual — formato exigido pelo agente de validação, nunca inventado aqui).
   * `contextos: []` = sempre que a tech estiver presente; mesmo casamento
   * parcial de `Requisito.contextos`. */
  volumetria?: { contextos: string[] };
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
