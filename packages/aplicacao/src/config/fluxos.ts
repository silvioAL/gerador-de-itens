import { resolverDependencias, type Dependencia } from "@gerador/engine";
import { sanearCamposDaTransformacao, validarCamposDaTransformacao } from "../casos-de-uso/transformacao.js";
import { FUNCOES_DO_SISTEMA, funcaoDoSistema } from "./funcoes.js";
import { REF_DO_PROJETO } from "./projeto.js";
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
 */
export const TIPOS_DE_NO_DO_FLUXO = ["conector", "agente", "funcao", "projeto", "transformacao"] as const;
export type TipoDeNoDoFluxo = (typeof TIPOS_DE_NO_DO_FLUXO)[number];

export interface NoDoFluxo {
  id: string;
  tipo: TipoDeNoDoFluxo;
  /** id do `Conector` (tipo "conector") ou do `PapelConfigurado` (tipo "agente"). */
  refId: string;
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

/** A mensagem do desenho, à letra — é a prova da fatia C. */
export function mensagemDeCiclo(caminho: string[]): string {
  return `Ciclo: ${caminho.join(" → ")}`;
}

/** No catálogo em vigor, cada fluxo diz de onde veio — o mesmo selo dos
 * conectores. */
export interface FluxoEmVigor extends Fluxo {
  origem: "declarado" | "fabrica";
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
    { id: "demanda", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 60, y: 120 }, parametros: {} },
    ...ativos.map((papel, i) => ({
      id: papel.id,
      tipo: "agente" as const,
      refId: papel.id,
      posicao: { x: 340 + i * 260, y: 120 },
      parametros: {},
    })),
    {
      id: "grava",
      tipo: "projeto",
      refId: REF_DO_PROJETO,
      posicao: { x: 340 + ativos.length * 260, y: 120 },
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
    nome: "Exportar prontos (da configuração)",
    nos: [
      { id: "demanda", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 60, y: 120 }, parametros: {} },
      { id: "envio", tipo: "conector", refId: destinos[0].id, componente: "itens", posicao: { x: 340, y: 120 }, parametros: {} },
      { id: "grava", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 620, y: 120 }, parametros: {} },
    ],
    arestas: [
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
    nome:
      destinos.length === 1
        ? "Publicar documento (da configuração)"
        : `Publicar documento — ${destino.rotulo || destino.id} (da configuração)`,
    nos: [
      { id: "demanda", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 60, y: 120 }, parametros: {} },
      { id: "publica", tipo: "conector", refId: destino.id, componente: "documento", posicao: { x: 340, y: 120 }, parametros: {} },
      { id: "grava", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 620, y: 120 }, parametros: {} },
    ],
    arestas: [
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
 */
export function fluxoDoEnsaio(): FluxoEmVigor {
  return {
    id: ID_DO_FLUXO_DO_ENSAIO,
    nome: "Ensaio de cenários",
    nos: [
      { id: "demanda", tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 60, y: 120 }, parametros: {} },
      { id: "ensaio", tipo: "funcao", refId: "ensaio", posicao: { x: 340, y: 120 }, parametros: {} },
    ],
    arestas: [{ de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
    origem: "fabrica",
  };
}

/** Declarados + as derivadas: a esteira (dos papéis), a exportação (do
 * destino de itens), a publicação (por destino de documento) e o ensaio
 * (sempre). Declarado vence fábrica no mesmo id. */
export function fluxosEmVigor(
  papeis: PapelConfigurado[],
  documentoFluxos: unknown,
  configExportador?: ConfigExportador
): FluxoEmVigor[] {
  const declarados: FluxoEmVigor[] = normalizarFluxos(documentoFluxos).fluxos.map((f) => ({
    ...f,
    origem: "declarado",
  }));
  const esteira = fluxoDaEsteira(papeis);
  if (esteira && !declarados.some((f) => f.id === esteira.id)) declarados.push(esteira);
  const exportacao = configExportador ? fluxoDaExportacao(configExportador) : null;
  if (exportacao && !declarados.some((f) => f.id === exportacao.id)) declarados.push(exportacao);
  for (const publicacao of configExportador ? fluxosDaPublicacao(configExportador) : []) {
    if (!declarados.some((f) => f.id === publicacao.id)) declarados.push(publicacao);
  }
  const ensaio = fluxoDoEnsaio();
  if (!declarados.some((f) => f.id === ensaio.id)) declarados.push(ensaio);
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
        throw new ConfigInvalida(`no fluxo "${id}", o nó "${noId}" está sem adaptador — escolha um nas propriedades do nó`);
      }
      // O registro de funções é fechado e vive no código — um refId fora dele
      // nunca vai ganhar executor, e falhar só na execução seria o silêncio
      // que a §9.3 recusa.
      if (no.tipo === "funcao" && !funcaoDoSistema(no.refId.trim())) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" aponta para a função "${no.refId.trim()}", que não existe (funções: ${FUNCOES_DO_SISTEMA.map((f) => f.id).join(", ")})`
        );
      }
      // O projeto não tem adaptador: o refId é o próprio "projeto", e qualquer
      // outra coisa seria um id que nunca vai ganhar executor (§9.3).
      if (no.tipo === "projeto" && no.refId.trim() !== REF_DO_PROJETO) {
        throw new ConfigInvalida(
          `no fluxo "${id}", o nó "${noId}" é de projeto e o refId precisa ser "${REF_DO_PROJETO}" (a demanda é o parâmetro "demandaId", não o adaptador)`
        );
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
}
