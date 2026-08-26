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
export const TIPOS_CAMPO = ["text", "textarea", "number", "boolean", "select", "lista"] as const;

/** Lista FECHADA, e agora também em RUNTIME (§237): o `validateConfig` nunca
 * conferiu o `type`, então um `"type": "lixo"` passava em silêncio e o campo
 * simplesmente não renderizava — a mesma "falha ABERTA e em silêncio" que o
 * comentário do `RECURSOS` nomeia no servidor. Tipo derivado da constante para
 * não haver duas listas para divergir. */
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

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
  /**
   * Campos customizáveis por conexão deste tipo (SPEC-21) — mesmo mecanismo
   * de `NodeTypeConfig.spec`, mas pro tipo de aresta. Sem isso, `[]`: nem toda
   * conexão precisa de campo próprio (ex.: `binding` é só topologia).
   */
  spec?: FieldSpec[];
  /**
   * Direção do fluxo de dados representado por este tipo de aresta, usada só
   * pra animação do diagrama exportável (SPEC-21) — nunca pelo motor de
   * derivação. "forward" (default, `source`→`target`, ex.: chama/publica),
   * "reverse" (`target`→`source` — o dado sai do recurso em direção ao nó, ex.:
   * `consumes`/`reads`: quem consome/lê recebe de quem guarda) ou
   * "bidirectional" (as duas direções ao mesmo tempo, ex.: `readwrite`/`pubsub`).
   */
  fluxo?: "forward" | "reverse" | "bidirectional";
  /**
   * SPEC-65 fatia A — quem chama por esta conexão **espera a resposta** antes
   * de seguir. É o que torna a latência somável e a falha propagável, e é o
   * que separa "quatro saltos" de "quatro saltos que o usuário sente".
   *
   * Ausente = **não se afirma nada**: a leitura pula a conexão e diz que
   * pulou, em vez de chutar. Sincronia não se infere de `fluxo` (que é
   * direção: `consumes` é `reverse` e assíncrono, `reads` é `reverse` e
   * síncrono) nem do nome do tipo (`http` normalmente espera, e `http`
   * fire-and-forget existe).
   *
   * Este é o PADRÃO do tipo. Uma conexão pode contrariá-lo respondendo o campo
   * `sincrono` no próprio `spec` — que já existe em `consumes` desde a
   * SPEC-21, e passa a valer aqui.
   */
  espera?: boolean;
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
export const OPERADORES_CHECAGEM = ["lte", "lt", "gte", "gt", "eq", "ne", "preenchido"] as const;
export type OperadorChecagem = (typeof OPERADORES_CHECAGEM)[number];

/**
 * SPEC-57 fatia B (§239) — a versão CONFERÍVEL de um requisito.
 *
 * A pergunta em aberto era "padrão vive onde?", com o alerta de que um quarto
 * lugar (além de `regras.json`, `camposNo` e `perfis-time.json`) provavelmente
 * seria erro. A resposta: **não é lugar novo, é um campo a mais no requisito
 * que já existe**. Um `Requisito` já sabe a tech, os contextos e o `when` —
 * só lhe faltava uma afirmação que a máquina consiga avaliar.
 *
 * "Chamada externa tem que ter timeout curto" é opinião; `timeout ≤ 500ms` é
 * padrão. O `texto` continua sendo o que a pessoa lê; a `checagem` é o que o
 * motor confere.
 *
 * `campo` é a chave de um campo do NÓ. Não dá pra validá-la contra um spec na
 * carga da config: a regra é por tech, e uma tech vale para vários tipos de nó
 * com specs diferentes. Campo inexistente num nó simplesmente não gera
 * violação ali — o mesmo tratamento que `when.field` já dá.
 */
export interface Checagem {
  campo: string;
  operador: OperadorChecagem;
  /** Ausente quando o operador é "preenchido" ou quando há `valorDe`. */
  valor?: number | string | boolean;
  /**
   * §241 — compara com OUTRO campo do mesmo nó em vez de um literal. É o que
   * torna conferível a classe de defeito que nenhum campo isolado revela: dois
   * valores individualmente razoáveis que se contradizem.
   *
   * O caso clássico: `ttl ≥ backoffInicialMs × retries`. Com `retries: 5` e
   * `backoffInicialMs: 2000`, um `ttl` de 5s parece sensato e garante que a
   * mensagem morre antes da última tentativa — ninguém percebe olhando um
   * campo de cada vez.
   */
  valorDe?: string;
  /** Multiplica `valorDe` por este campo. Só faz sentido com `valorDe`. */
  multiplicadoPor?: string;
  /** Só para a mensagem ("≤ 500ms"). O motor não converte unidade. */
  unidade?: string;
}

export interface Requisito {
  texto: string;
  contextos: string[];
  /**
   * §242 — POR QUE este padrão existe. A SPEC-56 §0.7 diz que a mesa deve
   * ENSINAR o padrão, não só cobrá-lo: "forçar a decisão sem explicar produz
   * obediência; explicar produz critério". Sem isto, uma violação é uma multa
   * sem lei publicada.
   *
   * Uma frase, e de preferência com a história: "veio do incidente de cobrança
   * dupla" convence mais que "é boa prática".
   */
  porque?: string;
  /** SPEC-57 fatia B — quando presente, este requisito é CONFERÍVEL. */
  checagem?: Checagem;
  /** Avaliada contra os nós de origem da atividade — o item aparece se
   * **algum** deles satisfizer (mesma régua de `.some()` do casamento de
   * contexto e do `when` de `ItemProcesso`). Sem `when`, basta tech + contexto
   * baterem. Existe pra diferenciar decisão de desenho do zero ("definir
   * schema") de decisão só cabível quando o recurso já existe ("definir plano
   * de migração") — achado real: os dois apareciam juntos pra todo nó do
   * contexto, novo ou existente. */
  when?: Condicao;
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

/** SPEC-57 fatia E — como o valor do caminho é apurado a partir dos nós dele. */
export const AGREGACOES_PERCURSO = ["soma", "maximo", "saltos"] as const;
export type AgregacaoPercurso = (typeof AGREGACOES_PERCURSO)[number];

/**
 * A régua aplicada ao CAMINHO, não ao nó.
 *
 * `soma` é a que justifica a fatia: cinco saltos de 400ms são cinco nós dentro
 * do padrão e um percurso de dois segundos, e nenhuma checagem por nó vê isso.
 * `maximo` pega o elo mais lento; `saltos` conta os nós e dispensa `campo`
 * ("no máximo 4 saltos entre a borda e o dado").
 *
 * Não converte unidade, pelo mesmo motivo de `Checagem`: somar ms com s
 * caladamente seria pior que não somar.
 */
export interface ChecagemDePercurso {
  /** Chave de campo do nó. Ausente — e obrigatoriamente ausente — em `saltos`. */
  campo?: string;
  agregacao: AgregacaoPercurso;
  operador: OperadorChecagem;
  valor?: number;
  unidade?: string;
}

/**
 * O requisito de percurso mora em `regras`, ao lado do checklist por tech — e
 * **não é um quarto lugar de padrão**, que o §5 da SPEC-57 já avisava ser
 * provável erro. É o mesmo arquivo com um segundo ESCOPO: o checklist vale por
 * tech, este vale por caminho. Um percurso cruza techs por definição, então
 * enfiá-lo dentro de `porTech` obrigaria a escolher arbitrariamente uma delas.
 */
export interface RequisitoDePercurso {
  texto: string;
  /** §242 — por que este padrão existe. É o que transforma cobrança em ensino. */
  porque?: string;
  checagem: ChecagemDePercurso;
}

/**
 * SPEC-63 — a régua sobre a FORMA do desenho.
 *
 * Dois operadores, e a recusa explícita de um terceiro. `exige-intermediario`
 * ("toda escrita no banco passa por um serviço") **não entra** porque já é
 * expressável: é proibir a conexão direta. O caminho desejado não precisa ser
 * afirmado — precisa ser o único que sobra.
 */
export type ChecagemDeTopologia =
  /** "Todo nó do tipo X precisa de uma conexão {entrando|saindo}, [do tipo A],
   *  [ligada a um nó do tipo Y]." Ex.: fila sem consumidor. */
  | {
      tipo: "exige-conexao";
      tipoNo: string;
      direcao: "entra" | "sai";
      tipoAresta?: string;
      tipoNoOposto?: string;
    }
  /** "Nenhuma conexão [do tipo A] pode ligar um nó do tipo X a um do tipo Y."
   *  Ex.: app falando direto com o banco. */
  | {
      tipo: "proibe-conexao";
      deTipoNo: string;
      paraTipoNo: string;
      tipoAresta?: string;
    };

export interface RequisitoDeTopologia {
  /**
   * Chave ESTÁVEL, e é o que separa esta regra do seu próprio texto. `texto` é
   * editável; a exceção aceita aponta para o `id`, e renomear a regra não pode
   * desligar em silêncio as exceções que alguém registrou com motivo. Mesma
   * disciplina de `Atividade.chave` × `rotulo`.
   */
  id: string;
  texto: string;
  /** §242 — por que este padrão existe. É o que transforma cobrança em ensino. */
  porque?: string;
  checagem: ChecagemDeTopologia;
}

export interface RegrasConfig {
  tipos: string[];
  tamanhos: string[];
  /** Checklist de refinamento técnico + ciclos de teste, por tech. */
  porTech: Record<string, RegrasPorTech>;
  /** SPEC-57 fatia E — as réguas que valem sobre o CAMINHO. Ausente = a
   * dimensão de percurso não mede nada, e não aparece. */
  percursos?: RequisitoDePercurso[];
  /**
   * SPEC-63 — as réguas que valem sobre a FORMA. Fora de `porTech` pela mesma
   * razão que o percurso ficou fora: uma regra de forma atravessa techs por
   * definição ("fila sem consumidor" é sobre o tipo da fila e sobre quem
   * consome, que quase nunca é da mesma tech), e enfiá-la ali obrigaria a
   * escolher uma arbitrariamente.
   */
  topologia?: RequisitoDeTopologia[];
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
