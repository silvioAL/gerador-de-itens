import type { ChaveConfig } from "../portas/repositorioDeConfig.js";

/**
 * SPEC-31 Fase 3 — a coerção de entrada de cada documento de config.
 *
 * Isto morava só no `openApiLocal.ts`. O modo hospedado não tinha rota nenhuma
 * de config, então quando ganhou uma (esta fase) herdaria zero validação: um
 * `PUT` torto poderia deixar a esteira sem papel nenhum e ninguém saberia
 * até a próxima quebra sair vazia.
 *
 * A régua é a mesma de sempre no projeto: entrada inválida **degrada campo a
 * campo**, nunca derruba a config inteira. Só o que impediria a config de
 * existir vira erro.
 */
export class ConfigInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ConfigInvalida";
  }
}

export const GRUPOS_FICHA = ["po", "arquiteto", "especialista", "qa"] as const;
export type GrupoFicha = (typeof GRUPOS_FICHA)[number];

export interface PapelConfigurado {
  id: string;
  nome: string;
  descricao?: string;
  grupo: GrupoFicha;
  preambulo?: string;
  ativo: boolean;
  contextos: string[];
}

export interface ConfigPipelineAgentes {
  confirmacaoObrigatoria: boolean;
  papeis: PapelConfigurado[];
}

/** A esteira de fábrica (SPEC-24 Fase F). */
export const PAPEIS_PADRAO: PapelConfigurado[] = [
  { id: "po", nome: "PO", descricao: "Escreve a história e os critérios de aceite", grupo: "po", ativo: true, contextos: [] },
  { id: "arquiteto", nome: "Arquiteto", descricao: "Amarra o item ao nó e escreve o contrato", grupo: "arquiteto", ativo: true, contextos: [] },
  { id: "especialista", nome: "Especialista técnico", descricao: "Aplica a tabela de regras do contexto", grupo: "especialista", ativo: true, contextos: [] },
  { id: "qa", nome: "QA", descricao: "Deriva as regras de teste e escreve os cenários", grupo: "qa", ativo: true, contextos: [] },
];

/**
 * Coage a lista de papéis para um shape sempre válido: id vazio descarta o
 * papel, grupo desconhecido cai em "especialista", nome vazio cai no id,
 * id repetido fica com a primeira ocorrência.
 */
export function sanearPapeis(entrada: unknown): PapelConfigurado[] | undefined {
  if (!Array.isArray(entrada)) return undefined;

  const papeis: PapelConfigurado[] = [];
  for (const bruto of entrada as Partial<PapelConfigurado>[]) {
    const id = typeof bruto?.id === "string" ? bruto.id.trim() : "";
    if (!id || papeis.some((p) => p.id === id)) continue;

    const grupo = GRUPOS_FICHA.includes(bruto.grupo as GrupoFicha) ? (bruto.grupo as GrupoFicha) : "especialista";
    papeis.push({
      id,
      nome: typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim() : id,
      ...(typeof bruto.descricao === "string" && bruto.descricao.trim() ? { descricao: bruto.descricao.trim() } : {}),
      grupo,
      ...(typeof bruto.preambulo === "string" && bruto.preambulo.trim() ? { preambulo: bruto.preambulo.trim() } : {}),
      ativo: bruto.ativo !== false,
      contextos: Array.isArray(bruto.contextos)
        ? bruto.contextos.filter((c): c is string => typeof c === "string" && c.trim() !== "")
        : [],
    });
  }
  return papeis.length > 0 ? papeis : undefined;
}

export function normalizarPipelineAgentes(documento: unknown): ConfigPipelineAgentes {
  const bruto = (documento ?? {}) as Partial<ConfigPipelineAgentes>;
  return {
    confirmacaoObrigatoria: bruto.confirmacaoObrigatoria !== false,
    // Config antiga (só o toggle, pré-Fase F) ou papéis todos inválidos:
    // esteira de fábrica — nunca uma esteira vazia por acidente.
    papeis: sanearPapeis(bruto.papeis) ?? PAPEIS_PADRAO,
  };
}

function normalizarRegras(documento: unknown): unknown {
  const bruto = documento as { porTech?: unknown } | null;
  // `porTech` é o que faz a tabela de regras ser uma tabela de regras. Sem
  // ela, gravar apagaria a config de refinamento inteira em silêncio.
  if (!bruto || typeof bruto.porTech !== "object" || bruto.porTech === null || Array.isArray(bruto.porTech)) {
    throw new ConfigInvalida("corpo precisa ter `porTech` (objeto tech → regras)");
  }
  return bruto;
}

/**
 * SPEC-35 — a ESCRITA recusa o que a LEITURA tolera. `sanearPapeis` continua
 * saneando config antiga na exibição; mas num PUT o corpo é a intenção do
 * usuário, e descartar parte dela em silêncio (papel sem id, id duplicado,
 * esteira apagada) era exatamente o "sistema quebra sem avisar" do pedido.
 */
export function validarEscritaPipelineAgentes(documento: unknown): void {
  const bruto = (documento ?? {}) as Partial<ConfigPipelineAgentes>;
  // Sem a chave `papeis` é o formato antigo (só o toggle) — legítimo.
  if (bruto.papeis === undefined) return;
  if (!Array.isArray(bruto.papeis)) throw new ConfigInvalida("`papeis` precisa ser uma lista de papéis");
  if (bruto.papeis.length === 0) {
    throw new ConfigInvalida(
      "`papeis` vazio apagaria a esteira inteira — para voltar à esteira de fábrica, remova a chave `papeis`"
    );
  }
  const vistos = new Set<string>();
  for (const [i, p] of (bruto.papeis as Partial<PapelConfigurado>[]).entries()) {
    const id = typeof p?.id === "string" ? p.id.trim() : "";
    if (!id) {
      throw new ConfigInvalida(`o papel na posição ${i + 1} está sem "id" — seria descartado em silêncio ao salvar`);
    }
    if (vistos.has(id)) {
      throw new ConfigInvalida(`há dois papéis com o id "${id}" — o segundo seria descartado em silêncio ao salvar`);
    }
    vistos.add(id);
  }
}

/**
 * SPEC-49 — a configuração da exportação: pra ONDE vão os itens. Endereço
 * vazio = exportação desligada, e a tela diz isso em vez de oferecer um
 * botão que falharia.
 */
export interface ConfigExportador {
  endpoint: string;
  /** Como o destino se chama pra quem lê a tela ("Jira do time de pagamentos"). */
  rotulo: string;
  /** Token/autenticação do agente — cabeçalhos livres, como o gateway de IA. */
  cabecalhos: Record<string, string>;
  /**
   * SPEC-81 — os demais destinos, e eles são uma LISTA.
   *
   * Não é "um gateway com N operações": é **N endereços**, cada um podendo
   * estar na frente de um MCP diferente. Um gateway configurado para falar com
   * o MCP do Jira; outro para o do Confluence; outro para os agentes da casa.
   * Rotas diferentes, payloads diferentes, autenticações possivelmente
   * diferentes.
   *
   * Lista e não `Record<operacao, destino>` porque o mapa **cabe em um por
   * operação**, e nada garante que a organização tenha um só — dois trackers em
   * migração, dois espaços de documentação por unidade de negócio. Lista degrada
   * para um-por-operação sem migração; o contrário exigiria uma.
   *
   * O `endpoint` de topo continua sendo o dos itens: quem já configurou
   * exportação não reconfigura nada.
   */
  destinos?: DestinoDoGateway[];
}

/**
 * SPEC-81 §1.1 — o que o produto sabe MANDAR, e são coisas diferentes porque
 * diferem em ciclo de vida, idempotência, modo de falhar e permissão.
 *
 * O destino declara qual é a sua: sem isso o produto teria um endereço e nenhuma
 * ideia de que payload montar. É o `operacao` que torna a lista utilizável — um
 * endereço sem propósito declarado é um endereço que ninguém consegue chamar.
 */
export const OPERACOES_DO_GATEWAY = ["itens", "documento", "adr", "arquiteturaDeNegocio"] as const;
export type OperacaoDoGateway = (typeof OPERACOES_DO_GATEWAY)[number];

export interface DestinoDoGateway {
  /** Estável, e é por ele que a tela lembra qual destino foi escolhido. */
  id: string;
  /** O que o produto manda (ou busca) aqui. */
  operacao: OperacaoDoGateway;
  endpoint: string;
  /** Como se chama para quem lê a tela: "Confluence de Engenharia". */
  rotulo: string;
  /**
   * Ausente = usa os cabeçalhos compartilhados.
   *
   * **Declarado vence herdado** (§306, reafirmado pela SPEC-77): a organização
   * com um gateway só configura a autenticação uma vez; a que aponta para três
   * MCPs distintos declara por destino, e a tela diz qual é qual.
   */
  cabecalhos?: Record<string, string>;
}

function normalizarCabecalhos(bruto: unknown): Record<string, string> | undefined {
  if (!bruto || typeof bruto !== "object") return undefined;
  return Object.fromEntries(Object.entries(bruto as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export function normalizarExportador(documento: unknown): ConfigExportador {
  const bruto = (documento ?? {}) as Partial<ConfigExportador>;
  const operacoesValidas: readonly string[] = OPERACOES_DO_GATEWAY;

  const destinos: DestinoDoGateway[] = [];
  const idsVistos = new Set<string>();
  for (const cru of Array.isArray(bruto.destinos) ? bruto.destinos : []) {
    if (!cru || typeof cru !== "object") continue;
    const endpoint = typeof cru.endpoint === "string" ? cru.endpoint.trim() : "";
    const id = typeof cru.id === "string" ? cru.id.trim() : "";
    // Três razões de descartar, e as três são a mesma: o que sobra não dá para
    // chamar. Endereço vazio não tem para onde ir; operação desconhecida não
    // tem payload que o produto saiba montar; id repetido faria a tela guardar
    // uma escolha que aponta para dois destinos.
    if (!endpoint || !id || idsVistos.has(id)) continue;
    if (!operacoesValidas.includes(cru.operacao as string)) continue;
    idsVistos.add(id);
    const cabecalhos = normalizarCabecalhos(cru.cabecalhos);
    destinos.push({
      id,
      operacao: cru.operacao,
      endpoint,
      rotulo: typeof cru.rotulo === "string" ? cru.rotulo.trim() : "",
      ...(cabecalhos ? { cabecalhos } : {}),
    });
  }

  return {
    endpoint: typeof bruto.endpoint === "string" ? bruto.endpoint.trim() : "",
    rotulo: typeof bruto.rotulo === "string" ? bruto.rotulo.trim() : "",
    cabecalhos: normalizarCabecalhos(bruto.cabecalhos) ?? {},
    ...(destinos.length > 0 ? { destinos } : {}),
  };
}

/** Um destino com os cabeçalhos já resolvidos — é o que o adaptador chama. */
export interface DestinoResolvido {
  id: string;
  operacao: OperacaoDoGateway;
  endpoint: string;
  rotulo: string;
  cabecalhos: Record<string, string>;
}

/**
 * Os destinos de uma operação, com a herança de cabeçalhos já aplicada.
 *
 * Devolve **lista**, e não o primeiro: a organização pode ter dois trackers numa
 * migração ou dois espaços de documentação. Quem chama decide — e a tela, tendo
 * mais de um, pergunta em vez de escolher sozinha. Escolher por ela publicaria
 * no lugar errado em silêncio, que é o pior desfecho de uma publicação.
 *
 * Mora aqui, e não na tela nem no adaptador, pela razão de sempre (§263): a tela
 * precisa saber se oferece o botão e o adaptador precisa saber para onde mandar.
 * Duas leituras da mesma pergunta divergem na primeira mudança, e esta
 * divergência seria muda — o botão apareceria e a chamada iria para outro lugar.
 */
export function destinosDaOperacao(config: ConfigExportador, operacao: OperacaoDoGateway): DestinoResolvido[] {
  const daLista = (config.destinos ?? [])
    .filter((d) => d.operacao === operacao)
    .map((d) => ({
      id: d.id,
      operacao: d.operacao,
      endpoint: d.endpoint,
      rotulo: d.rotulo,
      cabecalhos: d.cabecalhos ?? config.cabecalhos,
    }));

  /**
   * O `endpoint` de topo é o destino de ITENS de quem configurou antes da
   * SPEC-81, e continua valendo sem migração nenhuma. Entra no fim: se a
   * organização declarou destinos de item na lista, os dela vêm primeiro.
   */
  if (operacao === "itens" && config.endpoint) {
    daLista.push({
      id: "exportador",
      operacao: "itens",
      endpoint: config.endpoint,
      rotulo: config.rotulo,
      cabecalhos: config.cabecalhos,
    });
  }

  return daLista;
}

/** O portão de escrita por chave — chamado só no `salvar` dos casos de uso. */
export function validarEscritaConfig(chave: string, documento: unknown): void {
  if (chave === "pipeline-agentes") validarEscritaPipelineAgentes(documento);
  if (chave === "exportador") {
    const { endpoint } = normalizarExportador(documento);
    // Endereço vazio é legítimo (desliga a exportação); endereço inválido
    // não: o erro apareceria só na hora de exportar, com item na mão.
    if (endpoint && !/^https?:\/\//i.test(endpoint)) {
      throw new ConfigInvalida(`o endereço do exportador precisa começar com http:// ou https:// (veio "${endpoint}")`);
    }
  }
}

/** Aplica a coerção da chave. O que não tem regra própria passa como veio. */
export function normalizarDocumentoConfig(chave: ChaveConfig, documento: unknown): unknown {
  switch (chave) {
    case "regras":
      return normalizarRegras(documento);
    case "pipeline-agentes":
      return normalizarPipelineAgentes(documento);
    case "exportador":
      return normalizarExportador(documento);
  }
}
