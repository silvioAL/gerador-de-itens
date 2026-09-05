import { analisarCaminho } from "./caminho.js";
import {
  ConfigInvalida,
  destinosDaOperacao,
  METODO_PADRAO,
  METODOS_DO_GATEWAY,
  OPERACOES_DO_GATEWAY,
  type ConfigExportador,
  type MetodoDoGateway,
  type OperacaoDoGateway,
} from "./normalizacao.js";

/**
 * SPEC-105 fatia A — **o conector como DADO.**
 *
 * A medição da §0.2 (conferida de novo antes desta fatia) deu pior que a SPEC
 * escreveu: uma integração nova custa **oito** lugares — a lista fechada
 * (`OPERACOES_DO_GATEWAY` + `ENVELOPE_PADRAO`), uma porta, um adaptador, uma
 * rota, o client, a afordância na tela, o endpoint no dublê e os testes de
 * cada camada. E o modo de falhar é o silêncio: o §349 entregou 4 das peças e
 * esqueceu a rota; ninguém notou por dias.
 *
 * Um `Conector` é o mesmo endereço-com-forma que `DestinoResolvido` já é, mais
 * o que faltava para ele ser LIGÁVEL: `entrada` e `saida` declaradas. É o
 * raciocínio que `camposNo` já aplica ao diagrama — a forma de um tipo é dado,
 * não código. Sem declarar o que sai, não há como a fatia D ligar a resposta
 * de um conector à entrada de um agente: a aresta não teria o que carregar.
 *
 * O catálogo é ORGANIZACIONAL e o `timeId` é sempre `CAMPO_GLOBAL` (§9.2,
 * mesmo argumento da SPEC-102 §5.3): "a empresa fala com este endereço" é fato
 * da infraestrutura, não preferência de time.
 */

/**
 * §9.4 estendeu a lista da primeira escrita da SPEC com `booleano`: o contrato
 * do publicador de documento já manda `desatualizado: boolean` hoje, e nascer
 * com o conector de fábrica mentindo o tipo seria nascer com o catálogo errado.
 */
export const TIPOS_DE_CAMPO_DO_CONECTOR = ["texto", "numero", "booleano", "lista", "objeto"] as const;
export type TipoDeCampoDoConector = (typeof TIPOS_DE_CAMPO_DO_CONECTOR)[number];

export interface CampoDoConector {
  chave: string;
  rotulo: string;
  tipo: TipoDeCampoDoConector;
  /**
   * Onde este campo mora na RESPOSTA — subconjunto declarado de JSONPath
   * (`$.a.b[0]`, ver `caminho.ts`). Ausente = `$.{chave}`. Só faz sentido em
   * `saida`; em `entrada` é ignorado.
   */
  caminho?: string;
  obrigatorio?: boolean;
}

/**
 * Como `DestinoResolvido`: `metodo`, `envelope` e `cabecalhos` já resolvidos,
 * com o padrão aplicado na normalização. Quem chama não decide de novo — duas
 * resoluções do mesmo default divergem na primeira mudança (§263).
 */
export interface Conector {
  id: string;
  nome: string;
  descricao?: string;
  endpoint: string;
  metodo: MetodoDoGateway;
  cabecalhos: Record<string, string>;
  /** O campo que embrulha o corpo. `""` = corpo na raiz (o contrato comum). */
  envelope: string;
  /** O que MANDAR: os campos do corpo da chamada. */
  entrada: CampoDoConector[];
  /** O que VOLTA: como ler a resposta. */
  saida: CampoDoConector[];
}

/** No catálogo em vigor, cada conector diz de onde veio: cadastrado na chave
 * `conectores` ou derivado de um destino do gateway já configurado. */
export interface ConectorEmVigor extends Conector {
  origem: "declarado" | "fabrica";
}

export interface ConfigConectores {
  conectores: Conector[];
}

function sanearCampos(entrada: unknown): CampoDoConector[] {
  if (!Array.isArray(entrada)) return [];
  const campos: CampoDoConector[] = [];
  for (const bruto of entrada as Partial<CampoDoConector>[]) {
    const chave = typeof bruto?.chave === "string" ? bruto.chave.trim() : "";
    // Sem chave não há o que mandar nem o que ler; repetida, a segunda leria
    // por cima da primeira em silêncio.
    if (!chave || campos.some((c) => c.chave === chave)) continue;
    const caminho = typeof bruto.caminho === "string" ? bruto.caminho.trim() : "";
    campos.push({
      chave,
      rotulo: typeof bruto.rotulo === "string" && bruto.rotulo.trim() ? bruto.rotulo.trim() : chave,
      // Tipo desconhecido cai em "texto" (o mais tolerante), como grupo
      // desconhecido cai em "especialista" na esteira: a leitura degrada.
      tipo: (TIPOS_DE_CAMPO_DO_CONECTOR as readonly string[]).includes(bruto.tipo as string)
        ? (bruto.tipo as TipoDeCampoDoConector)
        : "texto",
      // Caminho fora do subconjunto é descartado na leitura (o campo volta ao
      // default `$.{chave}`) e RECUSADO na escrita — SPEC-35, como sempre.
      ...(caminho && analisarCaminho(caminho) ? { caminho } : {}),
      ...(bruto.obrigatorio === true ? { obrigatorio: true } : {}),
    });
  }
  return campos;
}

export function normalizarConectores(documento: unknown): ConfigConectores {
  const bruto = (documento ?? {}) as Partial<ConfigConectores>;
  const conectores: Conector[] = [];
  const idsVistos = new Set<string>();

  for (const cru of Array.isArray(bruto.conectores) ? bruto.conectores : []) {
    if (!cru || typeof cru !== "object") continue;
    const id = typeof cru.id === "string" ? cru.id.trim() : "";
    const endpoint = typeof cru.endpoint === "string" ? cru.endpoint.trim() : "";
    // As mesmas três razões dos destinos do gateway: o que sobra não dá para
    // chamar (sem endereço), não dá para achar (sem id) ou apontaria para dois
    // lugares (id repetido).
    if (!id || !endpoint || idsVistos.has(id)) continue;
    idsVistos.add(id);

    const metodo = (METODOS_DO_GATEWAY as readonly string[]).includes(cru.metodo as string)
      ? (cru.metodo as MetodoDoGateway)
      : METODO_PADRAO;
    const cabecalhos =
      cru.cabecalhos && typeof cru.cabecalhos === "object" && !Array.isArray(cru.cabecalhos)
        ? Object.fromEntries(Object.entries(cru.cabecalhos as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
        : {};

    conectores.push({
      id,
      nome: typeof cru.nome === "string" && cru.nome.trim() ? cru.nome.trim() : id,
      ...(typeof cru.descricao === "string" && cru.descricao.trim() ? { descricao: cru.descricao.trim() } : {}),
      endpoint,
      metodo,
      cabecalhos,
      // `""` = corpo na raiz, que é o contrato de 3 das 4 operações de hoje
      // (`ENVELOPE_PADRAO`) — por isso é o default do conector também.
      envelope: typeof cru.envelope === "string" ? cru.envelope.trim() : "",
      entrada: sanearCampos(cru.entrada),
      saida: sanearCampos(cru.saida),
    });
  }

  return { conectores };
}

function validarCampos(lado: "entrada" | "saida", posicao: number, lista: unknown): void {
  if (lista === undefined) return;
  if (!Array.isArray(lista)) {
    throw new ConfigInvalida(`no conector na posição ${posicao}, "${lado}" precisa ser uma lista de campos`);
  }
  const vistas = new Set<string>();
  for (const [i, campo] of (lista as Partial<CampoDoConector>[]).entries()) {
    const chave = typeof campo?.chave === "string" ? campo.chave.trim() : "";
    if (!chave) {
      throw new ConfigInvalida(
        `no conector na posição ${posicao}, o campo ${i + 1} de "${lado}" está sem "chave" — seria descartado em silêncio ao salvar`
      );
    }
    if (vistas.has(chave)) {
      throw new ConfigInvalida(`no conector na posição ${posicao}, "${lado}" tem duas vezes a chave "${chave}"`);
    }
    vistas.add(chave);
    if (campo.tipo !== undefined && !(TIPOS_DE_CAMPO_DO_CONECTOR as readonly string[]).includes(campo.tipo)) {
      throw new ConfigInvalida(
        `no conector na posição ${posicao}, o campo "${chave}" tem tipo desconhecido "${String(campo.tipo)}" (aceitos: ${TIPOS_DE_CAMPO_DO_CONECTOR.join(", ")})`
      );
    }
    if (campo.caminho !== undefined && campo.caminho !== "" && !analisarCaminho(String(campo.caminho))) {
      throw new ConfigInvalida(
        `no conector na posição ${posicao}, o campo "${chave}" tem um caminho fora do subconjunto aceito — use a forma "$.a.b[0]" (sem wildcard, filtro ou expressão)`
      );
    }
  }
}

/**
 * SPEC-35 — a escrita recusa o que a leitura tolera. Catálogo vazio é
 * legítimo (`conectores: []` desliga tudo de propósito); conector pela metade
 * não é — seria descartado em silêncio na leitura seguinte.
 */
export function validarEscritaConectores(documento: unknown): void {
  const bruto = (documento ?? {}) as Partial<ConfigConectores>;
  if (bruto.conectores === undefined) return;
  if (!Array.isArray(bruto.conectores)) {
    throw new ConfigInvalida("`conectores` precisa ser uma lista de conectores");
  }
  const vistos = new Set<string>();
  for (const [i, c] of (bruto.conectores as Partial<Conector>[]).entries()) {
    const posicao = i + 1;
    const id = typeof c?.id === "string" ? c.id.trim() : "";
    if (!id) {
      throw new ConfigInvalida(`o conector na posição ${posicao} está sem "id" — seria descartado em silêncio ao salvar`);
    }
    if (vistos.has(id)) {
      throw new ConfigInvalida(`há dois conectores com o id "${id}" — o segundo seria descartado em silêncio ao salvar`);
    }
    vistos.add(id);
    const endpoint = typeof c.endpoint === "string" ? c.endpoint.trim() : "";
    if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
      // Mesma régua do exportador: endereço inválido só apareceria na hora de
      // executar, com o fluxo na mão.
      throw new ConfigInvalida(
        `o conector "${id}" precisa de um endpoint começando com http:// ou https:// (veio "${endpoint}")`
      );
    }
    if (c.metodo !== undefined && !(METODOS_DO_GATEWAY as readonly string[]).includes(c.metodo)) {
      throw new ConfigInvalida(
        `o conector "${id}" tem método desconhecido "${String(c.metodo)}" (aceitos: ${METODOS_DO_GATEWAY.join(", ")})`
      );
    }
    validarCampos("entrada", posicao, c.entrada);
    validarCampos("saida", posicao, c.saida);
  }
}

/**
 * O contrato de `entrada`/`saida` de cada operação do gateway, COMO DADO.
 *
 * Cada linha transcreve o que o adaptador correspondente já faz hoje
 * (`gatewayDoTime.ts`, `exportadorViaAgente.ts`) — é a §3.3 da SPEC: as
 * operações da lista fechada viram conectores de fábrica, e o `Record`
 * exaustivo cobra o contrato de qualquer operação nova no mesmo commit em que
 * ela nascer (a disciplina do `ENVELOPE_PADRAO`).
 */
export const CONTRATO_DA_OPERACAO: Record<
  OperacaoDoGateway,
  { entrada: CampoDoConector[]; saida: CampoDoConector[] }
> = {
  itens: {
    entrada: [{ chave: "itens", rotulo: "Itens da quebra", tipo: "lista", obrigatorio: true }],
    // O agente exportador responde só o status: não há campo que o produto
    // leia da resposta hoje (`exportadorViaAgente` ignora o corpo).
    saida: [],
  },
  documento: {
    entrada: [
      { chave: "demandaId", rotulo: "Id da demanda", tipo: "texto", obrigatorio: true },
      { chave: "demandaTitulo", rotulo: "Título da demanda", tipo: "texto" },
      { chave: "markdown", rotulo: "Documento (markdown)", tipo: "texto", obrigatorio: true },
      { chave: "geradoEm", rotulo: "Gerado em", tipo: "texto" },
      { chave: "demandaAtualizadaEm", rotulo: "Demanda atualizada em", tipo: "texto" },
      { chave: "desatualizado", rotulo: "Desatualizado", tipo: "booleano" },
    ],
    saida: [
      { chave: "linkExterno", rotulo: "Link da página", tipo: "texto", caminho: "$.linkExterno", obrigatorio: true },
      { chave: "atualizada", rotulo: "Atualizou página existente", tipo: "booleano", caminho: "$.atualizada" },
    ],
  },
  adr: {
    entrada: [],
    saida: [{ chave: "adrs", rotulo: "Decisões (ADRs)", tipo: "lista", caminho: "$.adrs", obrigatorio: true }],
  },
  documentoExterno: {
    entrada: [{ chave: "link", rotulo: "Link do documento", tipo: "texto", obrigatorio: true }],
    saida: [
      { chave: "conteudo", rotulo: "Conteúdo", tipo: "texto", caminho: "$.conteudo", obrigatorio: true },
      { chave: "titulo", rotulo: "Título", tipo: "texto", caminho: "$.titulo" },
      { chave: "atualizadoEm", rotulo: "Atualizado em", tipo: "texto", caminho: "$.atualizadoEm" },
      { chave: "link", rotulo: "Link canônico", tipo: "texto", caminho: "$.link" },
    ],
  },
};

const NOME_DA_OPERACAO: Record<OperacaoDoGateway, string> = {
  itens: "Exportação de itens",
  documento: "Publicação de documento",
  adr: "Decisões da casa (ADR)",
  documentoExterno: "Documento da casa por link",
};

/**
 * §3.3 — os destinos do gateway já configurados, vistos como conectores.
 *
 * Derivados, não copiados: quem edita o destino na aba de exportação vê a
 * mudança aqui sem migração nenhuma — e a §7 recusou migrar as quatro
 * operações antes de o grafo existir, então o caminho antigo delas não muda.
 */
export function conectoresDeFabrica(config: ConfigExportador): ConectorEmVigor[] {
  const fabrica: ConectorEmVigor[] = [];
  for (const operacao of OPERACOES_DO_GATEWAY) {
    for (const destino of destinosDaOperacao(config, operacao)) {
      fabrica.push({
        id: destino.id,
        // O rótulo ecoa o nome que a pessoa cadastrou no destino; sem rótulo,
        // o nome da operação diz o que ele faz.
        nome: destino.rotulo || NOME_DA_OPERACAO[operacao],
        descricao: `Destino "${operacao}" do gateway do time`,
        endpoint: destino.endpoint,
        metodo: destino.metodo,
        cabecalhos: destino.cabecalhos,
        envelope: destino.envelope,
        entrada: CONTRATO_DA_OPERACAO[operacao].entrada,
        saida: CONTRATO_DA_OPERACAO[operacao].saida,
        origem: "fabrica",
      });
    }
  }
  return fabrica;
}

/**
 * O catálogo EM VIGOR: os declarados na chave `conectores` mais os de fábrica.
 * Declarado vence fábrica no mesmo `id` — é a única forma de ajustar a forma
 * de um destino sem mexer no destino.
 */
export function conectoresEmVigor(
  configExportador: ConfigExportador,
  documentoConectores: unknown
): ConectorEmVigor[] {
  const declarados: ConectorEmVigor[] = normalizarConectores(documentoConectores).conectores.map((c) => ({
    ...c,
    origem: "declarado",
  }));
  const ids = new Set(declarados.map((c) => c.id));
  return [...declarados, ...conectoresDeFabrica(configExportador).filter((c) => !ids.has(c.id))];
}
