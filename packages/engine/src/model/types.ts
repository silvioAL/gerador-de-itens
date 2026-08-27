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

/**
 * SPEC-57 M1/M6 — o PROPÓSITO da demanda: o que ela precisa resolver.
 *
 * Chama-se `Necessidade` e não `Requisito` porque `Requisito` já é outra coisa
 * neste projeto (`config/types.ts`): o item do checklist técnico de
 * refinamento. Dois conceitos legítimos, o mesmo nome em português — e um
 * `Requisito2` seria pior que escolher a palavra certa para o novo.
 *
 * `atendidaPor` guarda ids de nó/aresta. Id que não existe mais no diagrama
 * **não** satisfaz — a necessidade volta a ser lacuna, sem limpeza nenhuma
 * (mesma disciplina do `ALVO_INEXISTENTE` em `dependencias.ts`): apagar o nó
 * que respondia por uma necessidade é exatamente o evento que precisa
 * reaparecer, não ser silenciado por um `delete` em cascata.
 */
export interface Necessidade {
  /** Estável — é por ele que o vínculo e a citação na spec sobrevivem a edições. */
  id: string;
  texto: string;
  prioridade?: "alta" | "media" | "baixa";
  /** Mesma escala de `ValorSpec`: proposta de agente entra como `sugerido`. */
  origem: Origem;
  /** Regra 2 da SPEC-57: `sugerido`/`inferido` não confirmado não conta. */
  confirmado?: boolean;
  /** ids de `No.id` ou `Aresta.id` que respondem por esta necessidade. */
  atendidaPor: string[];
  /**
   * SPEC-69 — o tempo que o NEGÓCIO exige desta necessidade, em ms.
   *
   * É o que transforma leitura em decisão: sem ele, "a resposta soma 3 s" é um
   * fato sem consequência; com ele, é "3 s contra os 2 s que prometemos".
   *
   * **Por que aqui e não no percurso.** O percurso já sabe cobrar tempo
   * (`ChecagemDePercurso`), mas aquilo é a régua **do time** — "isto segue o
   * padrão da casa?". Esta é a exigência **do negócio** para ESTA demanda —
   * "isto entrega o que prometemos?". Um desenho passa numa e falha na outra.
   *
   * Ausente = ninguém prometeu prazo, e nada se afirma. Um limite padrão seria
   * o produto decidindo o SLA do time.
   */
  limiteMs?: number;
}

/**
 * §242 — a válvula da regra 3 da SPEC-57: *"violar o padrão é permitido — e
 * fica registrado. Sem essa saída, a pessoa aprende a ignorar o vermelho, e a
 * medição inteira morre junto."*
 *
 * Não é concessão, é o que mantém o mecanismo vivo. Às vezes a resposta certa é
 * violar: o parceiro é lento, o prazo é regulatório, o legado não muda. O que
 * não pode é isso acontecer em silêncio — daí `motivo` e `autor` obrigatórios.
 *
 * Efeito colateral que vale por si: exceção repetida é dado de melhoria. Se
 * cinco times violam o mesmo padrão, o padrão está errado, não os times — e é
 * exatamente o que o PDCA (SPEC-39/45) sabe processar.
 */
export interface ExcecaoDePadrao {
  /** Elemento onde a violação foi aceita. Nó, ou ARESTA (SPEC-63: uma conexão
   * proibida é uma violação que mora na seta). */
  noId: string;
  /** Campo conferido — junto com `noId`, identifica a violação de VALOR.
   * Vazio quando a exceção é de FORMA: ali quem identifica é `regraId`. */
  campo: string;
  /**
   * SPEC-63 — id da regra de topologia aceita.
   *
   * Aponta para o `id` da regra, e não para o `texto`, porque texto é
   * editável: renomear a regra desligaria em silêncio as exceções que alguém
   * registrou com motivo. Mesma disciplina de `Atividade.chave` × `rotulo`.
   */
  regraId?: string;
  /** Por que foi aceita. Sem isto a exceção é só o vermelho desligado. */
  motivo: string;
  autor: string;
  /** ISO-8601. */
  em: string;
}

/**
 * SPEC-57 M5 caso 2 (fatia C) — a ESCOLHA ENTRE ALTERNATIVAS, ancorada no
 * elemento que ela decide.
 *
 * **A régua que impede isto de virar wiki:** ADR nasce de escolha entre
 * alternativas ou de exceção consciente — *nunca* de "preencher um campo".
 * `timeout = 300ms` é valor com proveniência e continua sendo; "Rabbit e não
 * Kafka, porque X" é decisão. Sem essa régua todo campo vira ADR e o mecanismo
 * morre de excesso, que é como a maioria dos repositórios de ADR morre.
 *
 * `alternativas` é o que separa isto de um campo `observacao`: registrar só a
 * escolhida documenta o que foi feito e perde o que a torna útil daqui a um
 * ano — **o que foi descartado e por quê**. Quem reabre a decisão sem isso
 * refaz a análise inteira, ou pior, troca por uma opção que já tinha sido
 * rejeitada por um motivo que ninguém escreveu.
 */
export interface Alternativa {
  titulo: string;
  /** Por que não foi escolhida. Vazio é permitido — meia memória é melhor que nenhuma. */
  consequencia?: string;
}

/**
 * `status` segue a tradição de ADR e existe por um motivo prático: decisão
 * revista **não se apaga**. `substituida` mantém o rastro de que houve troca,
 * que é exatamente o que faz alguém não repetir o ciclo. Ver `substituidaPor`.
 *
 * `proposta` é o que a regra 2 da SPEC-57 exige do agente: ele pode PROPOR uma
 * decisão a partir do desenho medido, e ela não vale nada até alguém aceitar.
 */
export type StatusDecisao = "proposta" | "aceita" | "substituida";

export interface Decisao {
  id: string;
  /** Ancorada em um nó (o caso comum) ou em uma aresta. Ambos ausentes = decisão da quebra inteira. */
  noId?: string;
  arestaId?: string;
  titulo: string;
  /** O que forçava a escolha. É o que evita reabrir a decisão por não lembrar do aperto. */
  contexto?: string;
  /** Inclui a escolhida — a lista é o leque inteiro que estava na mesa. */
  alternativas: Alternativa[];
  /** `titulo` da alternativa escolhida. Título e não índice: reordenar a lista não pode trocar a decisão. */
  escolhida: string;
  /** O porquê. É a fatia C inteira em um campo — sem ele isto é só um registro de escolha. */
  porque: string;
  status: StatusDecisao;
  /** id da decisão que substituiu esta. Só faz sentido com `status: "substituida"`. */
  substituidaPor?: string;
  /** Mesma escala de `ValorSpec`: proposta de agente entra como `sugerido`. */
  origem: Origem;
  autor: string;
  /** ISO-8601. */
  em: string;
}

/**
 * SPEC-57 fatia E — o CAMINHO que uma requisição faz pelo desenho.
 *
 * Existe porque uma classe inteira de defeito não mora em elemento nenhum:
 * cinco saltos de 400ms são cinco nós dentro do padrão e um percurso de dois
 * segundos. Nenhuma medida por nó vê isso.
 *
 * `origem: "inferido"` é o caso normal — o motor lê o grafo e propõe. É a
 * resposta à pergunta 4 do §5 da SPEC-57: declarar dá precisão e custa
 * trabalho, inferir é grátis e erra, então **infere e pede confirmação**, que é
 * o padrão de proveniência que a casa já usa.
 */
export interface Percurso {
  /** Derivado dos nós do caminho, e por isso estável entre inferências. */
  id: string;
  /** "web → api-pedidos → fila → worker" — o caminho como alguém o reconhece. */
  rotulo: string;
  /** Ids de nó, em ordem de travessia. */
  nos: string[];
  origem: Origem;
  /**
   * Regra 2: `inferido` não conta até alguém confirmar. Três estados, e o
   * terceiro importa: `undefined` = o motor inferiu e ninguém olhou; `true` =
   * confirmado; `false` = **a pessoa disse que não é caminho**. Sem o terceiro,
   * recusar um caminho não teria efeito nenhum — o inferidor o devolveria
   * idêntico no render seguinte, para sempre.
   */
  confirmado?: boolean;
}

/**
 * SPEC-58 fatia 3 — o ciclo do documento de desenho.
 *
 * Sem status, o documento não se encaixa em rito nenhum do time — é o que
 * "órfão em termos de processo" queria dizer. Quatro estados e nenhum a mais:
 * cada um responde "posso confiar nisto?" de um jeito diferente.
 *
 * A regra que os mantém honestos está em `documentoStatus` da quebra:
 * **regenerar um documento aprovado o devolve a "em revisão"**. Não a rascunho
 * — o trabalho de revisão não se perdeu —, mas dizer que continua aprovado
 * depois que o desenho mudou seria mentira, e é assim que "aprovado" vira
 * carimbo.
 */
export type StatusDocumento = "rascunho" | "em-revisao" | "aprovado" | "implementado";

/**
 * SPEC-58 fatia 2 — o que uma PESSOA escreve no documento, e que a máquina
 * nunca sobrescreve.
 *
 * São exatamente as seções que a demanda sem ADR não tinha onde registrar. Se
 * a regeneração apagar isto uma única vez, ninguém escreve de novo — e o
 * documento volta a ser o export de antes.
 *
 * Chaves fixas e não lista livre: seção arbitrária viraria um editor de
 * documento, e aí o template configurável (SPEC-47) e o texto solto passariam a
 * disputar quem manda na estrutura.
 */
export interface DocumentoEscrito {
  /** O que se ganhou e o que se perdeu — e o que ficou de fora de propósito. */
  tradeOffs?: string;
  /** O que pode dar errado, e o que se está aceitando correr. */
  riscos?: string;
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
  /** SPEC-53 — de que PRODUTO é esta demanda (undefined/null = nenhum).
   *
   * Só o id: o contexto em si mora no produto, e copiá-lo para dentro da
   * quebra faria cada demanda carregar uma versão congelada do glossário —
   * exatamente o que esta SPEC existe para acabar. */
  produtoId?: string | null;
  /** §184 — a especificação de solução GERADA (markdown completo, com o
   * material do momento da geração). Persistida na quebra: é o que permite o
   * agente reconhecer uma demanda já especificada ao reabri-la. */
  especificacao?: string | null;
  /** SPEC-57 fatia A — o propósito da demanda. Ausente em quebra antiga, e
   * nesse caso nada se afirma sobre ela: sem necessidade declarada não há
   * lacuna a apontar (ver `analisarLacunas`). */
  necessidades?: Necessidade[];
  /** §242 — as violações de padrão aceitas DE PROPÓSITO nesta quebra. */
  excecoes?: ExcecaoDePadrao[];
  /** SPEC-57 fatia C — as escolhas entre alternativas, com o porquê. Ausente em
   * quebra antiga, e nesse caso nada se afirma sobre ela. */
  decisoes?: Decisao[];
  /** SPEC-57 fatia E — os caminhos do desenho, inferidos e confirmados. Só os
   * confirmados são guardados: reguardar toda inferência encheria a quebra de
   * caminho que ninguém olhou. */
  percursos?: Percurso[];
  /** SPEC-58 fatia 2 — as seções escritas por gente. Sobrevivem à regeneração:
   * é a regra 3 da SPEC-58, e sem ela a fatia inteira não existe. */
  documentoEscrito?: DocumentoEscrito;
  /** SPEC-58 fatia 3 — o estado do documento. Ausente = nunca gerado. */
  documentoStatus?: StatusDocumento;
  /**
   * SPEC-65 fatia D — as leituras que o time mandou calar NESTE desenho.
   *
   * Dispensar é decisão, e por isso fica registrada com quem e quando — e é
   * reversível (§283: nenhuma decisão é de mão única). A chave é o par
   * `(nó, tipo de leitura)`: silenciar todas de uma vez é o que transforma
   * sinal em ruído aceito.
   */
  leiturasDispensadas?: LeituraDispensada[];
  /**
   * SPEC-66 — os ensaios de lentidão desta demanda.
   *
   * Persistidos pelo mesmo motivo dos percursos: "bureau degradado" é o mesmo
   * ensaio toda sprint, e refazê-lo à mão é atrito puro. O RESULTADO nunca é
   * guardado — ele é recalculado do desenho de agora, senão a tabela mostraria
   * o número de um desenho que já mudou.
   */
  cenariosDeLentidao?: CenarioDeLentidaoGuardado[];
}

/** SPEC-66 — a definição do ensaio, sem nenhum número calculado. */
export interface CenarioDeLentidaoGuardado {
  id: string;
  nome: string;
  origem: "manual" | "sugerido";
  porque?: string;
  aceito?: boolean;
  ajustes: { tipo: "no" | "aresta"; id: string; fator?: number; ms?: number }[];
}

/** SPEC-65 fatia D — o silêncio pedido, com dono e data. */
export interface LeituraDispensada {
  noId: string;
  /** `fan-out` | `cadeia` — o tipo, e não o número: o número muda quando o
   * desenho muda, e a dispensa não deveria voltar por isso. */
  tipo: string;
  autor?: string;
  em?: string;
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
