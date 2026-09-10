import { resolverDependencias, type Dependencia } from "@gerador/engine";
import { sanearCamposDaTransformacao, validarCamposDaTransformacao } from "../casos-de-uso/transformacao.js";
import { FUNCOES_DO_SISTEMA, funcaoDoSistema } from "./funcoes.js";
import { GATILHOS_DO_SISTEMA, ID_DO_NO_DE_GATILHO, gatilhoDoSistema } from "./gatilhos.js";
// SPEC-110 fatia E — o relogio: a expressao do agendamento e validada na
// escrita, com a mesma regua pura que o painel usa para prever a proxima.
import { problemaNoCron } from "./cron.js";
// SPEC-110 fatia F — o no de dados deixou de ter um refId so.
import { REF_DA_DEMANDA_GRAVAR, REF_DA_DEMANDA_LER, REFS_DE_DADOS } from "./projeto.js";
import { TELAS_DO_SISTEMA, telaDoSistema } from "./telas.js";
import {
  ConfigInvalida,
  destinosDaOperacao,
  OPERACOES_DO_GATEWAY,
  type ConfigExportador,
  type OperacaoDoGateway,
  type PapelConfigurado,
} from "./normalizacao.js";

/**
 * SPEC-105 fatia C — **o FLUXO como grafo, sem execução.**
 *
 * O fluxo é a fiação: em que ordem, e o que alimenta o quê. Nó referencia um
 * `Conector` (catálogo, fatia A) ou um `PapelConfigurado` (esteira); a aresta
 * carrega o `mapeamento` — DE qual campo de saída PARA qual campo de entrada.
 * **Uma aresta sem mapeamento é decoração**; com ele, a resposta de um
 * conector vira a entrada de um agente (§4.1).
 *
 * É DO TIME (§9.2): dois times podem enriquecer de formas diferentes sem
 * ambiguidade, porque fluxo não deriva — a derivação continua determinística e
 * fora do fluxo (§6).
 *
 * ## Por que `conector`, `agente` e `funcao`
 *
 * A §4.1 desenhou quatro tipos; entra na lista quem TEM executor — um tipo
 * que a tela oferece e o executor ignora é a meia-integração que o §346 já
 * pagou para aprender. `funcao` (SPEC-107 fatia A) é a capacidade do motor
 * com contrato declarado: o `refId` aponta para o registro fechado de
 * `FUNCOES_DO_SISTEMA`, e o executor de fluxo a honra em processo. `projeto`
 * (fatia B) é a demanda como capacidade, nas duas direções — o `refId` é o
 * próprio `"projeto"` (não há adaptador a escolher; a demanda é parâmetro).
 * `transformacao` (fatia E) é a pura — re-mapeia/extrai/concatena, sem IA;
 * os campos de saída são dado do nó (`parametros.campos`).
 *
 * SPEC-110 fatia A — `gatilho` entra pelo mesmo critério: TEM executor (um
 * no-op deliberado, que carimba a origem do disparo no rastro). Ele não faz
 * trabalho; ele diz QUANDO o fluxo roda — e é o que dá propósito legível ao
 * botão, que virou o gesto do gatilho manual ("▶ Rodar agora").
 *
 * SPEC-110 fatia B — `tela` é o nó cujo executor é GENTE: a execução suspende
 * nele e só termina quando alguém decide (avançar/retornar). O executor
 * existe (a mecânica retomável da SPEC-107 C) — o que muda é quem o roda.
 */
/**
 * SPEC-110 fatia J (D16) — **`subfluxo`: um fluxo inteiro como um nó.**
 *
 * Motivação literal: *"quais fluxos estão relacionados ao quê? … faria mais
 * sentido ter um fluxo maior com pools ou algo assim"*. A relação entre fluxos
 * era conhecimento de quem os desenhou; agora ela é DESENHO navegável.
 *
 * Entra pelo mesmo critério dos outros: TEM executor (roda a execução do fluxo
 * referenciado inteira). O `refId` é o id de outro fluxo do catálogo em vigor.
 */
export const TIPOS_DE_NO_DO_FLUXO = [
  "gatilho",
  "conector",
  "agente",
  "funcao",
  "projeto",
  "transformacao",
  "tela",
  "subfluxo",
] as const;
export type TipoDeNoDoFluxo = (typeof TIPOS_DE_NO_DO_FLUXO)[number];

export interface NoDoFluxo {
  id: string;
  tipo: TipoDeNoDoFluxo;
  /** id do `Conector` (tipo "conector") ou do `PapelConfigurado` (tipo "agente"). */
  refId: string;
  /**
   * SPEC-109 fatia B — o NOME que a pessoa dá ao nó ("Ler volumetria do
   * legado", como no n8n). Ausente, o cartão mostra o nome do que o nó
   * referencia (papel, integração, função) — a régua da casa: o rótulo ecoa
   * o que a pessoa cadastrou.
   */
  nome?: string;
  /**
   * §368 — o COMPONENTE de que este nó nasceu (a paleta fala a língua da
   * mesa): uma operação do gateway, ou "livre" (chamada externa). É o que diz
   * quais ADAPTADORES são compatíveis quando se troca o `refId`. Ausente em
   * fluxos antigos e em nós de agente.
   */
  componente?: OperacaoDoGateway | "livre";
  posicao: { x: number; y: number };
  /** Valores fixos dos campos de entrada que não vêm de aresta. */
  parametros: Record<string, unknown>;
  /**
   * SPEC-107 fatia C (§5.5) — **o gate de confirmação DESENHÁVEL**, a
   * generalização do `pausarDepois` do §368: `"aguardar"` suspende a execução
   * depois deste nó — alguém revisa o stage e CONTINUA (ou descarta); ausente
   * (ou `"automatica"`) segue direto. É dado do fluxo, como o mapeamento:
   * quem fia decide UMA vez onde a revisão mora, e todo Executar respeita.
   * `pausarDepois: true` de fluxos salvos antes desta fatia é lido como
   * `"aguardar"` — o gesto configurado não se perde na migração.
   */
  confirmacao?: "aguardar" | "automatica";
}

export interface ArestaDoFluxo {
  de: string;
  para: string;
  /** DE qual campo de saída PARA qual campo de entrada. */
  mapeamento: { saida: string; entrada: string }[];
}

export interface Fluxo {
  id: string;
  nome: string;
  /**
   * SPEC-110 fatia H (D14) — **o rosto do fluxo na galeria.**
   *
   * Emoji, pelo precedente dos rostos dos papéis: zero asset para servir,
   * legível nos dois temas, e editável por quem não sabe desenhar ícone. A
   * ausência é legítima — a galeria põe um padrão por família, e um fluxo
   * salvo antes desta fatia não nasce feio nem quebrado.
   */
  icone?: string;
  nos: NoDoFluxo[];
  arestas: ArestaDoFluxo[];
}

export interface ConfigFluxos {
  fluxos: Fluxo[];
}

function sanearMapeamento(bruto: unknown): { saida: string; entrada: string }[] {
  if (!Array.isArray(bruto)) return [];
  return (bruto as { saida?: unknown; entrada?: unknown }[])
    .map((par) => ({
      saida: typeof par?.saida === "string" ? par.saida.trim() : "",
      entrada: typeof par?.entrada === "string" ? par.entrada.trim() : "",
    }))
    .filter((par) => par.saida && par.entrada);
}

export function normalizarFluxos(documento: unknown): ConfigFluxos {
  const bruto = (documento ?? {}) as Partial<ConfigFluxos>;
  const fluxos: Fluxo[] = [];
  const idsVistos = new Set<string>();

  for (const cru of Array.isArray(bruto.fluxos) ? bruto.fluxos : []) {
    if (!cru || typeof cru !== "object") continue;
    const id = typeof cru.id === "string" ? cru.id.trim() : "";
    if (!id || idsVistos.has(id)) continue;
    idsVistos.add(id);

    const nos: NoDoFluxo[] = [];
    const nosVistos = new Set<string>();
    for (const noCru of Array.isArray(cru.nos) ? (cru.nos as Partial<NoDoFluxo>[]) : []) {
      const noId = typeof noCru?.id === "string" ? noCru.id.trim() : "";
      const refId = typeof noCru?.refId === "string" ? noCru.refId.trim() : "";
      // Nó sem id não é ligável; sem refId não aponta para nada executável;
      // tipo desconhecido não tem executor — os três descartes são o mesmo:
      // o que sobra não roda.
      if (!noId || !refId || nosVistos.has(noId)) continue;
      if (!(TIPOS_DE_NO_DO_FLUXO as readonly string[]).includes(noCru.tipo as string)) continue;
      nosVistos.add(noId);
      nos.push({
        id: noId,
        tipo: noCru.tipo as TipoDeNoDoFluxo,
        refId,
        // O nome do nó é opcional e só existe quando diz algo (SPEC-109 B).
        ...(typeof noCru.nome === "string" && noCru.nome.trim() ? { nome: noCru.nome.trim() } : {}),
        posicao: {
          x: typeof noCru.posicao?.x === "number" ? noCru.posicao.x : 0,
          y: typeof noCru.posicao?.y === "number" ? noCru.posicao.y : 0,
        },
        parametros:
          noCru.parametros && typeof noCru.parametros === "object" && !Array.isArray(noCru.parametros)
            ? (noCru.parametros as Record<string, unknown>)
            : {},
        // O gate: o valor novo, ou o `pausarDepois` de antes da fatia C —
        // "automatica" é o default e não se grava (presença = aguardar).
        ...(noCru.confirmacao === "aguardar" || (noCru as { pausarDepois?: boolean }).pausarDepois === true
          ? { confirmacao: "aguardar" as const }
          : {}),
        ...((OPERACOES_DO_GATEWAY as readonly string[]).includes(noCru.componente as string) || noCru.componente === "livre"
          ? { componente: noCru.componente as OperacaoDoGateway | "livre" }
          : {}),
      });
    }

    const arestas: ArestaDoFluxo[] = [];
    for (const arestaCru of Array.isArray(cru.arestas) ? (cru.arestas as Partial<ArestaDoFluxo>[]) : []) {
      const de = typeof arestaCru?.de === "string" ? arestaCru.de.trim() : "";
      const para = typeof arestaCru?.para === "string" ? arestaCru.para.trim() : "";
      // Aresta para nó que não existe apontaria o dado para o vazio.
      if (!de || !para || !nosVistos.has(de) || !nosVistos.has(para)) continue;
      arestas.push({ de, para, mapeamento: sanearMapeamento(arestaCru.mapeamento) });
    }

    fluxos.push({
      id,
      nome: typeof cru.nome === "string" && cru.nome.trim() ? cru.nome.trim() : id,
      // SPEC-110 fatia H — o rosto só entra quando diz algo: vazio ou
      // só-espaço não vira dado, pela mesma régua do `nome` do nó.
      ...(typeof cru.icone === "string" && cru.icone.trim() ? { icone: cru.icone.trim() } : {}),
      nos,
      arestas,
    });
  }

  return { fluxos };
}

/**
 * O plano de execução: a mesma ordenação topológica do desenho
 * (`resolverDependencias`, engine) — um ciclo no fluxo é o MESMO erro que um
 * ciclo no desenho, e dá a mesma mensagem (§4.4).
 */
export function planoDoFluxo(fluxo: Fluxo): { ordem: string[]; ciclo?: string[] } {
  const atividades = fluxo.nos.map((no) => ({
    chave: no.id,
    dependencias: fluxo.arestas
      .filter((a) => a.para === no.id)
      .map((a) => ({ type: "dependent", alvoChave: a.de }) as Dependencia),
  }));
  const { ciclos, ordemTopologica } = resolverDependencias(atividades);
  if (ciclos.length > 0) return { ordem: [], ciclo: ciclos[0].caminho };
  return { ordem: ordemTopologica };
}

/**
 * SPEC-110 fatia J (D16) — **o contrato de um fluxo visto de fora.**
 *
 * Medido contra `planoDoFluxo`, como a SPEC mandou, e a regra é esta:
 *
 * - **entrada** = os campos que o fluxo NÃO preenche sozinho. **Medido contra
 *   as fábricas, não contra o que parecia razoável:** a primeira régua que
 *   escrevi foi "nó sem aresta chegando", e ela dava contrato VAZIO para
 *   todas as derivadas — porque a fatia A pôs um gatilho ligado ao primeiro
 *   nó de cada uma, e a aresta do gatilho existe para dizer ORDEM, não para
 *   trazer dado. Com essa régua, um subfluxo da esteira nunca receberia
 *   `demandaId`, e a jornada inteira rodaria sobre a demanda errada em
 *   silêncio.
 *
 *   A régua honesta é por CAMPO: um campo é externo quando nenhuma aresta
 *   chegando o mapeia e o nó não o fixou nos parâmetros. Quem fixou um valor
 *   dentro do subfluxo o fixou de propósito — perguntá-lo de novo lá fora
 *   seria oferecer duas fontes para a mesma coisa.
 *
 *   O gatilho continua fora: ele diz QUANDO o fluxo roda, e quem roda um
 *   subfluxo é o pai — o gatilho do filho não dispara nada.
 * - **saida** = a do ÚLTIMO nó da ordem topológica. É o que o fluxo entrega
 *   quando termina, e é o que o pai consegue mapear adiante.
 *
 * Fluxo com ciclo não tem contrato — `planoDoFluxo` devolve ordem vazia, e
 * um subfluxo sobre ele seria um nó que nunca roda.
 */
/**
 * O mínimo que este módulo precisa saber de um campo: chave e rótulo. O tipo é
 * GENÉRICO nos campos porque quem chama traz campos mais ricos — o
 * `CampoDoConector` do catálogo carrega `tipo`, e é dele que o aviso de
 * mapeamento da tela vive. Fixar o mínimo aqui apagaria o `tipo` na travessia
 * por um subfluxo, e o aviso sumiria justamente onde o desenho é mais fundo.
 */
export interface CampoDoContrato {
  chave: string;
  rotulo: string;
}

export type ContratoDeNo<C extends CampoDoContrato = CampoDoContrato> = (
  no: NoDoFluxo
) => { entrada: C[]; saida: C[] } | null;

/**
 * SPEC-110 fatia J — **o teto do aninhamento de subfluxos.**
 *
 * Quatro níveis já é um desenho que ninguém lê; e sem teto, um laço que a
 * escrita não pegou (um catálogo mudado entre a validação e a corrida) vira
 * pilha estourada em vez de falha nomeada. Mora aqui, e não no servidor, porque
 * a tela também precisa dele: o painel deriva o contrato pelo mesmo caminho, e
 * dois tetos diferentes ofereceriam campos que o executor recusaria (§263).
 */
export const LIMITE_DE_ANINHAMENTO_DE_SUBFLUXO = 4;

export function contratoDoSubfluxo<C extends CampoDoContrato>(
  fluxo: Fluxo,
  contratoDoNo: ContratoDeNo<C>
): { entrada: C[]; saida: C[] } {
  const plano = planoDoFluxo(fluxo);
  if (plano.ordem.length === 0) return { entrada: [], saida: [] };

  const entrada: C[] = [];
  const vistas = new Set<string>();
  for (const { campo } of camposExternosDoFluxo(fluxo, contratoDoNo)) {
    // A mesma chave pedida por dois nós entra UMA vez: o painel ofereceria
    // "desenho" duas vezes e a pessoa teria de adivinhar qual alimenta qual.
    if (vistas.has(campo.chave)) continue;
    vistas.add(campo.chave);
    entrada.push(campo);
  }

  const ultimo = fluxo.nos.find((n) => n.id === plano.ordem[plano.ordem.length - 1]);
  return { entrada, saida: ultimo ? (contratoDoNo(ultimo)?.saida ?? []) : [] };
}

/**
 * Os campos que este fluxo precisa receber de fora, **com o nó que os pede** —
 * é o que permite ao executor entregar cada valor a quem o declarou, em vez de
 * espalhar tudo por todos os nós (um `demandaId` no prompt de um agente é
 * ruído que ninguém pediu).
 */
export function camposExternosDoFluxo<C extends CampoDoContrato>(
  fluxo: Fluxo,
  contratoDoNo: ContratoDeNo<C>
): { noId: string; campo: C }[] {
  const externos: { noId: string; campo: C }[] = [];
  for (const no of fluxo.nos) {
    // O gatilho não é entrada: quem dispara um subfluxo é o fluxo de cima.
    if (no.tipo === "gatilho") continue;
    const alimentadas = new Set(
      fluxo.arestas.filter((a) => a.para === no.id).flatMap((a) => a.mapeamento.map((m) => m.entrada))
    );
    for (const campo of contratoDoNo(no)?.entrada ?? []) {
      if (alimentadas.has(campo.chave)) continue;
      // O parâmetro FIXADO no nó não se pergunta de novo lá fora: duas fontes
      // para o mesmo campo é a pessoa adivinhando qual vale.
      const fixado = no.parametros?.[campo.chave];
      if (fixado !== undefined && fixado !== "") continue;
      externos.push({ noId: no.id, campo });
    }
  }
  return externos;
}

/**
 * SPEC-110 fatia J — **ciclo entre FLUXOS, pela mesma régua do ciclo entre
 * nós.**
 *
 * A referencia B, B referencia A: a execução nunca termina. É o mesmo defeito
 * do ciclo de arestas num grafo de outro tamanho, então é o mesmo motor
 * (`resolverDependencias`) e a MESMA frase (`mensagemDeCiclo`) — duas
 * mensagens para o mesmo defeito fariam a pessoa achar que são dois.
 */
export function cicloEntreFluxos(fluxos: Fluxo[]): string[] | null {
  const atividades = fluxos.map((f) => ({
    chave: f.id,
    dependencias: f.nos
      .filter((no) => no.tipo === "subfluxo")
      .map((no) => ({ type: "dependent", alvoChave: no.refId }) as Dependencia),
  }));
  const { ciclos } = resolverDependencias(atividades);
  return ciclos.length > 0 ? ciclos[0].caminho : null;
}

/** A mensagem do desenho, à letra — é a prova da fatia C. */
export function mensagemDeCiclo(caminho: string[]): string {
  return `Ciclo: ${caminho.join(" → ")}`;
}

/** No catálogo em vigor, cada fluxo diz de onde veio — o mesmo selo dos
 * conectores. */
export interface FluxoEmVigor extends Fluxo {
  origem: "declarado" | "fabrica";
  /**
   * SPEC-109 fatia A — este declarado ESCONDE uma derivada com o mesmo id.
   *
   * "A cópia vence a derivada" é a regra certa (SPEC-70 §4) — mas sem este
   * selo ela é uma porta sem volta: a fábrica evolui SPEC após SPEC e o time
   * fica preso à forma do dia do clique em "editar uma cópia" (medido: uma
   * esteira de 4 nós pré-G5 congelada no banco escondendo a completa). A tela
   * usa o selo para avisar e oferecer o caminho de volta.
   */
  sombreiaFabrica?: boolean;
}

/**
 * SPEC-110 fatia A — **a fábrica sempre desenha o gatilho.** Toda derivada
 * começa pelo nó que diz quando ela roda (D1); o declarado ANTIGO, sem
 * gatilho, continua rodando pelo botão (D8) — compatibilidade sem migração.
 *
 * A aresta gatilho→primeiro-nó nasce SEM mapeamento de propósito: o gatilho
 * manual não emite dado, e a tela rotula essa aresta "dispara" em vez de "sem
 * mapeamento" — decoração ela não é.
 */
export function noDeGatilhoManual(posicao: { x: number; y: number }): NoDoFluxo {
  return { id: ID_DO_NO_DE_GATILHO, tipo: "gatilho", refId: "manual", posicao, parametros: {} };
}

export const ID_DO_FLUXO_DA_ESTEIRA = "esteira-de-agentes";

/**
 * SPEC-106 (o pedido: *"precisa ter o pipeline de IA também unificado — se
 * trata do desenho da mesma coisa"*) — **a esteira COMO fluxo, derivada.**
 *
 * Os papéis ativos de `pipeline-agentes`, na ordem do array (que sempre FOI a
 * ordem de execução), encadeados: o `texto` de cada um entra no seguinte com a
 * chave do papel de origem — exatamente o que `acumuladas` faz implícito na
 * revisão (SPEC-105 §0.4), agora visível e ligável.
 *
 * DERIVADA, nunca copiada (a régua de `conectoresDeFabrica`): renomear ou
 * reordenar um papel na configuração muda este fluxo sozinho. Um declarado com
 * o mesmo id vence a fábrica — é o "editar uma cópia" da tela. **A revisão
 * continua rodando pela esteira de sempre**: ela só troca de motor quando a
 * prova da SPEC-105 F (resultado idêntico item a item) passar — a recusa da
 * §7 segue de pé.
 */
export function fluxoDaEsteira(papeis: PapelConfigurado[]): FluxoEmVigor | null {
  const ativos = papeis.filter((p) => p.ativo);
  if (ativos.length === 0) return null;

  /**
   * SPEC-107 G5 — a esteira COMPLETA: `projeto.filaDaEsteira → agentes →
   * projeto(respostasItens)`. A FILA viaja pelas arestas (um item por
   * atividade, placeholders por papel, acumuladas em `respostasExistentes`) e
   * cada agente corre o papel dele em modo pipeline — os mesmos lotes, o
   * mesmo prompt e o mesmo esquema da revisão (§263). O destino grava as
   * sugestões PENDENTES na demanda (§5.5, decidida pelo usuário: o
   * julgamento fica na demanda).
   */
  const nos: NoDoFluxo[] = [
    noDeGatilhoManual({ x: 60, y: 120 }),
    { id: "demanda", tipo: "projeto", refId: REF_DA_DEMANDA_LER, posicao: { x: 340, y: 120 }, parametros: {} },
    ...ativos.map((papel, i) => ({
      id: papel.id,
      tipo: "agente" as const,
      refId: papel.id,
      posicao: { x: 620 + i * 260, y: 120 },
      parametros: {},
    })),
    {
      id: "grava",
      tipo: "projeto",
      refId: REF_DA_DEMANDA_GRAVAR,
      posicao: { x: 620 + ativos.length * 260, y: 120 },
      parametros: {},
    },
  ];
  const DO_PIPELINE = [
    { saida: "fila", entrada: "fila" },
    { saida: "respostasItens", entrada: "respostasItens" },
    { saida: "contextoEpico", entrada: "contextoEpico" },
    { saida: "contextoDoProduto", entrada: "contextoDoProduto" },
  ];
  const arestas: ArestaDoFluxo[] = [
    { de: ID_DO_NO_DE_GATILHO, para: "demanda", mapeamento: [] },
    {
      de: "demanda",
      para: ativos[0].id,
      mapeamento: [
        { saida: "filaDaEsteira", entrada: "fila" },
        { saida: "contextoEpico", entrada: "contextoEpico" },
        { saida: "contextoDoProduto", entrada: "contextoDoProduto" },
      ],
    },
    ...ativos.slice(1).map((papel, i) => ({
      de: ativos[i].id,
      para: papel.id,
      mapeamento: DO_PIPELINE,
    })),
    {
      de: ativos[ativos.length - 1].id,
      para: "grava",
      mapeamento: [{ saida: "respostasItens", entrada: "respostasItens" }],
    },
    { de: "demanda", para: "grava", mapeamento: [{ saida: "demandaId", entrada: "demandaId" }] },
  ];

  return {
    id: ID_DO_FLUXO_DA_ESTEIRA,
    icone: "🤖",
    nome: "Esteira de agentes (da configuração)",
    nos,
    arestas,
    origem: "fabrica",
  };
}

export const ID_DO_FLUXO_DA_EXPORTACAO = "exportar-prontos";

/**
 * SPEC-107 G1 — **a exportação COMO fiação, derivada** (a primeira
 * substituição da §3.1): `projeto.itensProntos → conector(itens) →
 * projeto(resultados)`. O botão "Exportar prontos" vira um ATALHO que a
 * dispara com a demanda aberta — a mesma régua de "pronto", o mesmo payload,
 * o mesmo grava-por-item, agora visíveis e fiáveis.
 *
 * DERIVADA como a esteira: nasce do destino de itens EM VIGOR
 * (`destinosDaOperacao`, que inclui o endereço legado de topo como
 * "exportador"); sem destino, não existe — a mesma semântica de sempre
 * (exportação desligada). Declarado vence fábrica no mesmo id.
 */
export function fluxoDaExportacao(configExportador: ConfigExportador): FluxoEmVigor | null {
  const destinos = destinosDaOperacao(configExportador, "itens");
  if (destinos.length === 0) return null;

  return {
    id: ID_DO_FLUXO_DA_EXPORTACAO,
    icone: "📤",
    nome: "Exportar prontos (da configuração)",
    nos: [
      noDeGatilhoManual({ x: 60, y: 120 }),
      { id: "demanda", tipo: "projeto", refId: REF_DA_DEMANDA_LER, posicao: { x: 340, y: 120 }, parametros: {} },
      { id: "envio", tipo: "conector", refId: destinos[0].id, componente: "itens", posicao: { x: 620, y: 120 }, parametros: {} },
      { id: "grava", tipo: "projeto", refId: REF_DA_DEMANDA_GRAVAR, posicao: { x: 900, y: 120 }, parametros: {} },
    ],
    arestas: [
      { de: ID_DO_NO_DE_GATILHO, para: "demanda", mapeamento: [] },
      { de: "demanda", para: "envio", mapeamento: [{ saida: "itensProntos", entrada: "itens" }] },
      // O destino recebe os resultados POR ITEM e também quem foi enviado —
      // é o que permite nomear "o agente não respondeu sobre este item".
      { de: "envio", para: "grava", mapeamento: [{ saida: "resultados", entrada: "resultados" }] },
      {
        de: "demanda",
        para: "grava",
        mapeamento: [
          { saida: "demandaId", entrada: "demandaId" },
          { saida: "itensProntos", entrada: "enviados" },
        ],
      },
    ],
    origem: "fabrica",
  };
}

export const ID_DO_FLUXO_DA_PUBLICACAO = "publicar-documento";

/**
 * SPEC-107 G2 — **publicar o documento COMO fiação, derivada** (a segunda
 * morte da §3.1): `projeto.markdown → conector(documento) →
 * projeto(linkExterno)`. O botão da tela vira atalho que salva a
 * especificação viva na demanda e dispara a fiação — o que se publica passa
 * a ficar persistido como especificação (SPEC-106 C, agora inteira).
 *
 * UMA fiação POR destino de documento: com um só, o id estável
 * `publicar-documento`; com vários, sufixado pelo id do destino — e o atalho
 * mantém a recusa de sempre ("diga em qual publicar") em vez de escolher
 * sozinho.
 */
export function fluxosDaPublicacao(configExportador: ConfigExportador): FluxoEmVigor[] {
  const destinos = destinosDaOperacao(configExportador, "documento");
  return destinos.map((destino) => ({
    id: destinos.length === 1 ? ID_DO_FLUXO_DA_PUBLICACAO : `${ID_DO_FLUXO_DA_PUBLICACAO}-${destino.id}`,
    icone: "📄",
    nome:
      destinos.length === 1
        ? "Publicar documento (da configuração)"
        : `Publicar documento — ${destino.rotulo || destino.id} (da configuração)`,
    nos: [
      noDeGatilhoManual({ x: 60, y: 120 }),
      { id: "demanda", tipo: "projeto", refId: REF_DA_DEMANDA_LER, posicao: { x: 340, y: 120 }, parametros: {} },
      { id: "publica", tipo: "conector", refId: destino.id, componente: "documento", posicao: { x: 620, y: 120 }, parametros: {} },
      { id: "grava", tipo: "projeto", refId: REF_DA_DEMANDA_GRAVAR, posicao: { x: 900, y: 120 }, parametros: {} },
    ],
    arestas: [
      { de: ID_DO_NO_DE_GATILHO, para: "demanda", mapeamento: [] },
      {
        de: "demanda",
        para: "publica",
        mapeamento: [
          { saida: "markdown", entrada: "markdown" },
          { saida: "demandaId", entrada: "demandaId" },
          { saida: "titulo", entrada: "demandaTitulo" },
        ],
      },
      // O link do que subiu volta para a DEMANDA (SPEC-106 C) — o destino
      // grava `documento_link_externo`, e "última publicação ↗" sobrevive.
      { de: "publica", para: "grava", mapeamento: [{ saida: "linkExterno", entrada: "linkExterno" }] },
      { de: "demanda", para: "grava", mapeamento: [{ saida: "demandaId", entrada: "demandaId" }] },
    ],
    origem: "fabrica",
  }));
}

export const ID_DO_FLUXO_DO_ENSAIO = "ensaio-de-cenarios";

/**
 * SPEC-107 G4 — **o ensaio COMO fiação, semeado** (a quarta morte da §3.1):
 * `projeto.desenho → funcao(ensaio)`. A bancada de cenários deixa de simular
 * no navegador: cada cenário vira UMA execução desta fiação (o cenário entra
 * por `parametrosPorNo`, que é entrada DESTA execução — não muda a fiação nem
 * o hash dela), e a leitura volta no rastro com a âncora de hoje inteira.
 *
 * Diferente da exportação e da publicação, não depende de destino nenhum:
 * ensaiar é capacidade do motor, então a fiação SEMPRE existe. Declarado
 * vence fábrica no mesmo id, como sempre.
 *
 * ## SPEC-110 fatia B (D4) — a cadeia que o usuário desenhou
 *
 * `gatilho → mesa(demanda) → ensaio → TELA bancada → (avançar) → derivação`,
 * nas palavras dele: *"o agente iria gerar o ensaio, e depois o usuário
 * revisa, e decide avançar para a derivação, ou retornar"*.
 *
 * **O mapeamento foi MEDIDO antes de fiar** (a SPEC mandava): `derivacao`
 * declara UMA entrada, `desenho (objeto, obrigatório)`; a bancada emite
 * `decisao` e `ensaioAprovado` — nenhum desenho. Então o desenho vai da
 * DEMANDA direto para a derivação, e a bancada entra como **gate no
 * caminho**: a aresta `bancada → derivacao` não carrega dado, carrega ORDEM
 * (a derivação não roda enquanto ninguém avançar). Fiar
 * `bancada.ensaioAprovado → derivacao.desenho` seria mentira de contrato —
 * uma leitura de ensaio não é um desenho.
 *
 * Quem gera o ensaio pode virar um agente amanhã sem tocar na tela (D4): a
 * bancada consome `ensaio` de QUALQUER produtor.
 */
export function fluxoDoEnsaio(): FluxoEmVigor {
  return {
    id: ID_DO_FLUXO_DO_ENSAIO,
    icone: "🧪",
    nome: "Ensaio de cenários",
    nos: [
      noDeGatilhoManual({ x: 60, y: 120 }),
      { id: "demanda", tipo: "projeto", refId: REF_DA_DEMANDA_LER, posicao: { x: 340, y: 120 }, parametros: {} },
      { id: "ensaio", tipo: "funcao", refId: "ensaio", posicao: { x: 620, y: 120 }, parametros: {} },
      { id: "bancada", tipo: "tela", refId: "bancada-de-ensaios", posicao: { x: 900, y: 120 }, parametros: {} },
      { id: "derivacao", tipo: "funcao", refId: "derivacao", posicao: { x: 1180, y: 120 }, parametros: {} },
    ],
    arestas: [
      { de: ID_DO_NO_DE_GATILHO, para: "demanda", mapeamento: [] },
      { de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
      {
        de: "ensaio",
        para: "bancada",
        mapeamento: [{ saida: "leitura", entrada: "ensaio" }],
      },
      { de: "demanda", para: "bancada", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
      // O GATE no caminho: sem dado, com ordem — a derivação espera o Avançar.
      { de: "bancada", para: "derivacao", mapeamento: [] },
      { de: "demanda", para: "derivacao", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
    ],
    origem: "fabrica",
  };
}

/**
 * SPEC-110 fatia H — **um fluxo novo nasce com o GATILHO**, venha ele do
 * canvas ou da galeria.
 *
 * A semente morava privada dentro da `FluxoScreen`. Quando a galeria passou a
 * criar fluxos (D14), ela nasceu criando `nos: []` — e o fluxo novo vinha sem
 * o cartão que diz quando ele roda, contradizendo a promessa da fatia A. Um
 * E2E pegou; a correção é a semente ter UM dono (§263), e ele ser a camada que
 * define o que um fluxo É.
 */
export function fluxoNovo(id: string, nome: string): Fluxo {
  return { id, nome, nos: [noDeGatilhoManual({ x: 80, y: 120 })], arestas: [] };
}

export const ID_DO_FLUXO_DO_PDCA = "pdca-melhoria";

/**
 * SPEC-110 fatia J — os ids que EXISTEM sem estar declarados. Um subfluxo pode
 * apontar para qualquer um deles, e a escrita precisa saber disso para não
 * recusar um desenho válido. A lista é derivada dos próprios ids, não uma
 * segunda cópia: id novo de fábrica entra aqui no mesmo commit (§242).
 */
export const ID_DO_FLUXO_DA_JORNADA = "jornada-da-demanda";

export const IDS_DE_FABRICA = [
  ID_DO_FLUXO_DA_ESTEIRA,
  ID_DO_FLUXO_DA_EXPORTACAO,
  ID_DO_FLUXO_DA_PUBLICACAO,
  ID_DO_FLUXO_DO_ENSAIO,
  ID_DO_FLUXO_DO_PDCA,
  ID_DO_FLUXO_DA_JORNADA,
] as const;

/**
 * SPEC-110 fatia G (D13) — **o ciclo de melhoria como DESENHO.**
 *
 * O PDCA era um lugar (a aba) e vira um caminho visível: ler o que o time
 * registrou, ler a configuração de hoje, um agente propor um ajuste, alguém
 * revisar numa tela, e aplicar. Cada passo é um cartão — e é isso que permite
 * ao time mudar o próprio ciclo sem código: trocar o gatilho para agendamento
 * (fatia E), pôr outro papel a propor, acrescentar uma segunda revisão.
 *
 * **Nada aqui escreve configuração direto (D13).** O nó de propor cria uma
 * SOLICITAÇÃO, com dono, versão-alvo e auditoria — o mesmo caminho de quem
 * pede pela aba. Aplicar é o passo DEPOIS da tela, e passa pelo portão de
 * sempre: sem permissão, o nó falha nomeando e o pedido fica pendente.
 *
 * Precisa de um papel ATIVO para ter quem proponha — sem agente, o ciclo
 * ficaria com um buraco no meio, e um fluxo de fábrica quebrado é pior que
 * fluxo nenhum (a mesma régua da esteira).
 */
export function fluxoDoPdca(papeis: PapelConfigurado[]): FluxoEmVigor | null {
  const proponente = papeis.find((p) => p.ativo);
  if (!proponente) return null;

  return {
    id: ID_DO_FLUXO_DO_PDCA,
    icone: "♻️",
    nome: "Melhoria contínua (PDCA)",
    nos: [
      noDeGatilhoManual({ x: 60, y: 140 }),
      { id: "feedbacks", tipo: "funcao", refId: "pdca-ler-feedbacks", posicao: { x: 340, y: 60 }, parametros: {} },
      // A configuração que o agente precisa ver para propor sobre ela — e não
      // sobre o que ele imagina que esteja lá.
      { id: "config", tipo: "funcao", refId: "config-ler", posicao: { x: 340, y: 260 }, parametros: { chave: "regras" } },
      { id: proponente.id, tipo: "agente", refId: proponente.id, posicao: { x: 620, y: 140 }, parametros: {} },
      { id: "revisao", tipo: "tela", refId: "revisao-do-ajuste", posicao: { x: 900, y: 140 }, parametros: {} },
      { id: "propoe", tipo: "funcao", refId: "config-propor-ajuste", posicao: { x: 1180, y: 140 }, parametros: {} },
      { id: "aplica", tipo: "funcao", refId: "config-aplicar-ajuste", posicao: { x: 1460, y: 140 }, parametros: {} },
    ],
    arestas: [
      { de: ID_DO_NO_DE_GATILHO, para: "feedbacks", mapeamento: [] },
      { de: ID_DO_NO_DE_GATILHO, para: "config", mapeamento: [] },
      // O agente lê os feedbacks em texto corrido e a config de hoje.
      { de: "feedbacks", para: proponente.id, mapeamento: [{ saida: "resumo", entrada: "feedbacks" }] },
      { de: "config", para: proponente.id, mapeamento: [{ saida: "documento", entrada: "configuracaoAtual" }] },
      // A tela mostra as três coisas: o que motivou, o que se propõe, e como
      // está hoje. Sem a configuração à vista, "aprovar" é aprovar no escuro.
      { de: "feedbacks", para: "revisao", mapeamento: [{ saida: "resumo", entrada: "feedbacks" }] },
      { de: proponente.id, para: "revisao", mapeamento: [{ saida: "texto", entrada: "proposta" }] },
      { de: "config", para: "revisao", mapeamento: [{ saida: "documento", entrada: "configuracaoAtual" }] },
      // Depois do Avançar: propor e aplicar. A descrição do pedido é o texto
      // que o agente escreveu — é o que a aba PDCA vai mostrar a quem não
      // estava na tela.
      { de: "revisao", para: "propoe", mapeamento: [] },
      { de: proponente.id, para: "propoe", mapeamento: [{ saida: "texto", entrada: "descricao" }] },
      { de: "propoe", para: "aplica", mapeamento: [{ saida: "solicitacaoId", entrada: "solicitacaoId" }] },
    ],
    origem: "fabrica",
  };
}

/**
 * SPEC-110 fatia J (D16) — **"Jornada da demanda": o fluxo maior de que as
 * quatro derivadas são etapas.**
 *
 * A queixa literal: *"quais fluxos estão relacionados ao quê? ficou complicada
 * essa parte de 'derivado', onde se configura isso? … faria mais sentido ter um
 * fluxo maior com pools ou algo assim"*. A resposta não é documentação: é o
 * DESENHO. Ensaiar, derivar, exportar e publicar deixam de ser quatro cartões
 * soltos no catálogo e viram quatro cartões ligados, com duplo-clique abrindo
 * cada um.
 *
 * **As arestas carregam ORDEM, não dado** — a mesma escolha do gate da bancada
 * (fatia B), e pela mesma razão medida: cada etapa lê a demanda por si
 * (`demanda-ler`), então mapear a saída de uma na entrada da outra seria
 * mentira de contrato. O que atravessa a jornada é a DEMANDA, e ela chega a
 * cada subfluxo pelo campo externo `demandaId` — que é exatamente o que
 * `contratoDoSubfluxo` expõe.
 *
 * **Derivada das etapas que EXISTEM**, não de uma lista fixa: sem destino de
 * exportação configurado não há nó de exportar, como não há o fluxo. Com menos
 * de duas etapas não há jornada — seria uma moldura em volta de uma etapa só,
 * e um cartão a mais no catálogo sem nada a dizer.
 */
export function fluxoDaJornada(etapas: FluxoEmVigor[]): FluxoEmVigor | null {
  const acha = (alvo: string) => etapas.find((f) => f.id === alvo) ?? null;
  // A ordem é a da jornada, não a do array: ensaiar antes de derivar, sempre.
  const sequencia = [acha(ID_DO_FLUXO_DO_ENSAIO), acha(ID_DO_FLUXO_DA_ESTEIRA)].filter(
    (f): f is FluxoEmVigor => f !== null
  );
  // Exportar e publicar são as SAÍDAS: paralelas entre si (artefatos
  // distintos, D15) e penduradas na última etapa da sequência.
  const saidas = etapas.filter((f) => f.id === ID_DO_FLUXO_DA_EXPORTACAO || f.id.startsWith(ID_DO_FLUXO_DA_PUBLICACAO));
  if (sequencia.length + saidas.length < 2) return null;

  const noDeEtapa = (fluxo: FluxoEmVigor, posicao: { x: number; y: number }): NoDoFluxo => ({
    id: fluxo.id,
    tipo: "subfluxo",
    refId: fluxo.id,
    posicao,
    parametros: {},
  });

  /**
   * O passo horizontal é MAIOR que o das outras fábricas (280) porque o cartão
   * de um subfluxo carrega o NOME DE UM FLUXO, e nomes de derivadas são longos:
   * "Esteira de agentes (da configuração)" mede 348px na tela contra os 190px
   * de um cartão comum. Medido na validação visual desta fatia — com 280 os
   * cartões se encavalavam, que é a lição da SPEC-109 (cartão largo esconde o
   * handle do vizinho) repetida noutro desenho.
   */
  const PASSO = 400;
  const nos: NoDoFluxo[] = [noDeGatilhoManual({ x: 60, y: 160 })];
  const arestas: ArestaDoFluxo[] = [];
  let anterior = ID_DO_NO_DE_GATILHO;
  sequencia.forEach((etapa, i) => {
    nos.push(noDeEtapa(etapa, { x: 340 + i * PASSO, y: 160 }));
    arestas.push({ de: anterior, para: etapa.id, mapeamento: [] });
    anterior = etapa.id;
  });
  const xDasSaidas = 340 + sequencia.length * PASSO;
  saidas.forEach((etapa, i) => {
    nos.push(noDeEtapa(etapa, { x: xDasSaidas, y: 60 + i * 200 }));
    arestas.push({ de: anterior, para: etapa.id, mapeamento: [] });
  });

  return { id: ID_DO_FLUXO_DA_JORNADA, icone: "🧭", nome: "Jornada da demanda", nos, arestas, origem: "fabrica" };
}

/** Declarados + as derivadas: a esteira (dos papéis), a exportação (do
 * destino de itens), a publicação (por destino de documento), o ensaio
 * (sempre), o PDCA (dos papéis) e a jornada (das etapas acima). Declarado
 * vence fábrica no mesmo id. */
export function fluxosEmVigor(
  papeis: PapelConfigurado[],
  documentoFluxos: unknown,
  configExportador?: ConfigExportador
): FluxoEmVigor[] {
  const etapas: FluxoEmVigor[] = [
    fluxoDaEsteira(papeis),
    configExportador ? fluxoDaExportacao(configExportador) : null,
    ...(configExportador ? fluxosDaPublicacao(configExportador) : []),
    fluxoDoEnsaio(),
    fluxoDoPdca(papeis),
  ].filter((f): f is FluxoEmVigor => f !== null);
  // O mestre vem DEPOIS porque é derivado das etapas — e o PDCA fica fora
  // dele: melhorar o processo é outro laço, não uma etapa da demanda (D13).
  const jornada = fluxoDaJornada(etapas);
  const fabricas: FluxoEmVigor[] = jornada ? [...etapas, jornada] : etapas;

  const declarados: FluxoEmVigor[] = normalizarFluxos(documentoFluxos).fluxos.map((f) => ({
    ...f,
    origem: "declarado",
    ...(fabricas.some((fab) => fab.id === f.id) ? { sombreiaFabrica: true } : {}),
  }));
  for (const fabrica of fabricas) {
    if (!declarados.some((f) => f.id === fabrica.id)) declarados.push(fabrica);
  }
  return declarados;
}

/** SPEC-35 — a escrita recusa o que a leitura tolera, ciclo incluído. */
export function validarEscritaFluxos(documento: unknown): void {
  const bruto = (documento ?? {}) as Partial<ConfigFluxos>;
  if (bruto.fluxos === undefined) return;
  if (!Array.isArray(bruto.fluxos)) throw new ConfigInvalida("`fluxos` precisa ser uma lista de fluxos");

  const vistos = new Set<string>();
  for (const [i, f] of (bruto.fluxos as Partial<Fluxo>[]).entries()) {
    const posicao = i + 1;
    const id = typeof f?.id === "string" ? f.id.trim() : "";
    if (!id) throw new ConfigInvalida(`o fluxo na posição ${posicao} está sem "id" — seria descartado em silêncio ao salvar`);
    if (vistos.has(id)) throw new ConfigInvalida(`há dois fluxos com o id "${id}" — o segundo seria descartado em silêncio ao salvar`);
    vistos.add(id);

    const nosVistos = new Set<string>();
    const gatilhos: string[] = [];
    for (const [j, no] of (Array.isArray(f.nos) ? (f.nos as Partial<NoDoFluxo>[]) : []).entries()) {
      const noId = typeof no?.id === "string" ? no.id.trim() : "";
      if (!noId) throw new ConfigInvalida(`no fluxo "${id}", o nó na posição ${j + 1} está sem "id"`);
      if (nosVistos.has(noId)) throw new ConfigInvalida(`no fluxo "${id}", há dois nós com o id "${noId}"`);
      nosVistos.add(noId);
      if (!(TIPOS_DE_NO_DO_FLUXO as readonly string[]).includes(no.tipo as string)) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" tem tipo desconhecido "${String(no.tipo)}" (aceitos: ${TIPOS_DE_NO_DO_FLUXO.join(", ")})`
        );
      }
      if (!(typeof no.refId === "string" && no.refId.trim())) {
        // §359 — a frase nomeia O QUE falta escolher ("adaptador" é jargão de
        // arquitetura; na tela o nó agente escolhe um PAPEL, a chamada
        // externa um CONECTOR).
        const oQueFalta =
          no.tipo === "agente" ? "papel" : no.tipo === "conector" ? "conector" : no.tipo === "gatilho" ? "tipo de gatilho" : "referência";
        throw new ConfigInvalida(`no fluxo "${id}", o nó "${noId}" está sem ${oQueFalta} — escolha nas propriedades do nó`);
      }
      /**
       * SPEC-110 fatia A — o registro de gatilhos é fechado como o de funções:
       * um refId fora dele nunca ganha executor, e falhar só na execução seria
       * o silêncio que a §9.3 recusa.
       */
      if (no.tipo === "gatilho") {
        if (!gatilhoDoSistema(no.refId.trim())) {
          throw new ConfigInvalida(
            `no fluxo "${id}", o nó "${noId}" aponta para o gatilho "${no.refId.trim()}", que não existe (gatilhos: ${GATILHOS_DO_SISTEMA.map((g) => g.id).join(", ")})`
          );
        }
        /**
         * SPEC-110 fatia E — o gatilho de AGENDAMENTO não vale sem expressão
         * válida: um cron torto só apareceria quando o relógio não disparasse,
         * e "não rodou" é o silêncio mais caro de diagnosticar.
         */
        if (no.refId.trim() === "agendamento") {
          const expressao = (no.parametros as { expressao?: unknown } | undefined)?.expressao;
          const problema = problemaNoCron(typeof expressao === "string" ? expressao : "");
          if (problema) throw new ConfigInvalida(`no fluxo "${id}", o nó "${noId}" agenda mal: ${problema}`);
        }
        gatilhos.push(noId);
      }
      /**
       * SPEC-110 fatia B — a tela também aponta para um registro. Hoje só as
       * do SISTEMA existem; a fatia C acrescenta as DECLARADAS pelo time, e
       * esta régua passa a consultar as duas (a validação de escrita não tem
       * o documento de telas em mãos aqui — quem valida a fiação contra as
       * declaradas é a rota, que tem).
       */
      if (no.tipo === "tela" && !telaDoSistema(no.refId.trim()) && !no.refId.trim().startsWith("tela:")) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" aponta para a tela "${no.refId.trim()}", que não existe (telas do sistema: ${TELAS_DO_SISTEMA.map((t) => t.id).join(", ")}; telas do time usam o prefixo "tela:")`
        );
      }
      // O registro de funções é fechado e vive no código — um refId fora dele
      // nunca vai ganhar executor, e falhar só na execução seria o silêncio
      // que a §9.3 recusa.
      if (no.tipo === "funcao" && !funcaoDoSistema(no.refId.trim())) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" aponta para a função "${no.refId.trim()}", que não existe (funções: ${FUNCOES_DO_SISTEMA.map((f) => f.id).join(", ")})`
        );
      }
      /**
       * SPEC-110 fatia F — a lista deixou de ter um item só. O nó de dados
       * aponta para `demanda-ler`, `demanda-gravar` ou o `projeto` LEGADO —
       * e nada mais, porque um refId sem executor é um nó que só falha na
       * execução (§9.3). O legado fica na lista de propósito: recusá-lo
       * trancaria fluxos já salvos, e a demanda de alguém não pode ficar
       * insalvável por uma decisão nossa de vocabulário.
       */
      if (no.tipo === "projeto" && !(REFS_DE_DADOS as readonly string[]).includes(no.refId.trim())) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" é de dados da demanda e o refId precisa ser um destes: ${REFS_DE_DADOS.join(", ")} (a demanda é o parâmetro "demandaId", não o adaptador)`
        );
      }
      /**
       * SPEC-110 fatia J — o subfluxo aponta para um fluxo que EXISTE no
       * mesmo documento. Um refId solto só falharia na execução, com o
       * desenho na mão — e "não conheço este fluxo" é a frase que a §9.3
       * pede na escrita, não no meio de uma corrida.
       */
      if (no.tipo === "subfluxo") {
        const alvo = no.refId.trim();
        if (alvo === id) {
          throw new ConfigInvalida(
            `no fluxo "${id}", o nó "${noId}" é um subfluxo que referencia o PRÓPRIO fluxo — a execução não terminaria`
          );
        }
        const declarados = new Set(
          (Array.isArray((documento as { fluxos?: { id?: unknown }[] })?.fluxos)
            ? (documento as { fluxos: { id?: unknown }[] }).fluxos
            : []
          )
            .map((f) => (typeof f?.id === "string" ? f.id.trim() : ""))
            .filter(Boolean)
        );
        /**
         * Só recusa quando o alvo não está NEM no documento NEM entre os
         * fluxos de fábrica: um subfluxo pode apontar para a esteira ou para
         * o ensaio, que existem sem estar declarados.
         */
        if (!declarados.has(alvo) && !(IDS_DE_FABRICA as readonly string[]).includes(alvo)) {
          throw new ConfigInvalida(
            `no fluxo "${id}", o nó "${noId}" é um subfluxo que aponta para "${alvo}", que não existe — nem declarado, nem de fábrica`
          );
        }
      }
      // A transformação sem campos (ou com campo pela metade) só falharia na
      // execução — a escrita recusa com o nome (SPEC-35, fatia E).
      if (no.tipo === "transformacao") {
        const campos = sanearCamposDaTransformacao((no.parametros as { campos?: unknown } | undefined)?.campos);
        const problema = validarCamposDaTransformacao(campos, noId);
        if (problema) throw new ConfigInvalida(`no fluxo "${id}", ${problema}`);
      }
      // Gate com valor desconhecido seria descartado em silêncio na leitura —
      // e um gate que some é escrita no mundo sem revisão (§2.4-14).
      const confirmacao = (no as { confirmacao?: unknown }).confirmacao;
      if (confirmacao !== undefined && confirmacao !== "aguardar" && confirmacao !== "automatica") {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" tem confirmação desconhecida "${String(confirmacao)}" (aceitas: aguardar, automatica)`
        );
      }
    }
    /**
     * SPEC-110 D1 — no máximo UM gatilho por fluxo: dois seria a pergunta sem
     * resposta ("qual vale?"), e a resposta silenciosa (o primeiro do array)
     * é exatamente o tipo de convenção escondida que esta fatia veio matar.
     * ZERO é tolerado (D8): o declarado antigo continua rodando pelo botão.
     */
    if (gatilhos.length > 1) {
      throw new ConfigInvalida(
        `o fluxo "${id}" tem ${gatilhos.length} gatilhos (${gatilhos.join(", ")}) — um fluxo diz UMA vez quando roda; remova os outros`
      );
    }
    for (const aresta of Array.isArray(f.arestas) ? (f.arestas as Partial<ArestaDoFluxo>[]) : []) {
      for (const ponta of [aresta?.de, aresta?.para]) {
        if (typeof ponta !== "string" || !nosVistos.has(ponta.trim())) {
          throw new ConfigInvalida(
            `no fluxo "${id}", há uma aresta apontando para o nó "${String(ponta)}", que não existe`
          );
        }
      }
    }

    // O ciclo é conferido sobre a forma NORMALIZADA — a mesma que será lida.
    const { fluxos } = normalizarFluxos({ fluxos: [f] });
    if (fluxos[0]) {
      const plano = planoDoFluxo(fluxos[0]);
      if (plano.ciclo) throw new ConfigInvalida(mensagemDeCiclo(plano.ciclo));
    }
  }

  /**
   * SPEC-110 fatia J — **o ciclo ENTRE fluxos**, conferido com o documento
   * inteiro em mãos (não dá para vê-lo olhando um fluxo de cada vez).
   *
   * A referencia B, B referencia A: a execução nunca terminaria. Mesmo motor e
   * MESMA frase do ciclo entre nós — duas mensagens para o mesmo defeito
   * fariam a pessoa achar que são dois problemas diferentes.
   */
  const cicloDeFluxos = cicloEntreFluxos(normalizarFluxos(documento).fluxos);
  if (cicloDeFluxos) {
    throw new ConfigInvalida(`${mensagemDeCiclo(cicloDeFluxos)} — um subfluxo não pode voltar a quem o chamou`);
  }
}
