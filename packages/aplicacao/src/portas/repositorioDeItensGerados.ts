/**
 * SPEC-41 Parte B — a porta dos itens gerados. Um item é a materialização de
 * uma atividade derivada como work item persistido: o corpo é a MESMA seção
 * que o documento de especificação renderiza (fonte única, engine), e o
 * conjunto pertence à quebra. "Gerar" é REGERAR: substituir o conjunto da
 * quebra inteiro — item não tem vida própria fora de uma geração, exceto o
 * rastro de exportação (Fase 2), que sobrevive via `chave` estável.
 */

/** O que um item gerado É, independente de onde está guardado. */
export interface ItemGeradoSalvo {
  id: string;
  quebraId: string;
  /** `Atividade.chave` — estável entre regenerações da mesma quebra. */
  chave: string;
  titulo: string;
  tipo: string;
  tamanho: string;
  dependencias: string[];
  corpoMarkdown: string;
  /** Quantos `✍️ especificar` restam no corpo — 0 = pronto pra exportar. */
  pendencias: number;
  /** Quantas respostas entraram como sugestão da esteira, a confirmar. */
  sugestoes: number;
  /** `gerado` → `exportado` (Fase 2, via ExportadorDeItens). */
  estado: "gerado" | "exportado";
  /** Link no tracker externo quando exportado (Fase 2). */
  linkExterno: string | null;
  /** SPEC-114 — a segunda chamada (a spec DESTE item foi anexada ao issue). */
  specAnexada: boolean;
  /**
   * SPEC-115 fatia E — quando o envio da spec DESTE item começou. Não nulo com
   * `specAnexada` falso e `specErro` nulo = **está indo agora**, e é o estado
   * que a SPEC-98 §3.2 exigiu que morasse fora da memória da aba: um envio de
   * minutos não pode desaparecer porque alguém trocou de tela.
   */
  specEnviadaEm: string | null;
  /** SPEC-115 fatia E — por que a spec deste item não chegou. Nulo = nenhum
   * erro pendente; toda nova tentativa limpa antes de começar. */
  specErro: string | null;
  criadoEm: string;
}

/** O que se manda ao (re)gerar: a identidade e os carimbos são do repositório. */
export type DadosItemGerado = Omit<
  ItemGeradoSalvo,
  "id" | "quebraId" | "estado" | "linkExterno" | "specAnexada" | "specEnviadaEm" | "specErro" | "criadoEm"
>;

export interface RepositorioDeItensGerados {
  /** Ordem de geração (a numeração do documento). */
  listarDaQuebra(quebraId: string): Promise<ItemGeradoSalvo[]>;
  /**
   * Substitui o conjunto da quebra pelo novo — atomicamente. Item exportado
   * de mesma `chave` preserva `estado`/`linkExterno`/`specAnexada` (o rastro
   * externo não evapora porque o material foi regenerado).
   */
  substituirDaQuebra(quebraId: string, itens: DadosItemGerado[]): Promise<ItemGeradoSalvo[]>;
  /** SPEC-49 — o item virou issue lá fora: guarda o link e o estado. */
  marcarExportado(quebraId: string, chave: string, linkExterno: string): Promise<ItemGeradoSalvo | null>;
  /** SPEC-114 — a spec deste item chegou ao issue que a exportação criou.
   * SPEC-115 — e o que chegou não está mais "indo": limpa o envio e o erro. */
  marcarSpecAnexada(quebraId: string, chave: string): Promise<ItemGeradoSalvo | null>;
  /**
   * SPEC-115 fatia E — **antes de chamar o gateway, o banco já sabe.**
   *
   * É o que faz o envio sobreviver ao F5: quem recarrega no meio lê itens
   * marcados como "indo" e continua exibindo de onde parou, em vez de
   * recomeçar. Marca em lote porque o pedido é um lote — e limpa o `specErro`
   * de cada um, porque toda tentativa nova começa sem a cicatriz da anterior.
   */
  marcarSpecEnviando(quebraId: string, chaves: string[]): Promise<void>;
  /** SPEC-115 fatia E — a spec deste item não chegou, e o motivo fica. Sai do
   * estado "indo" (senão a tela esperaria para sempre por algo que já acabou). */
  marcarFalhaDeSpec(quebraId: string, chave: string, erro: string): Promise<ItemGeradoSalvo | null>;
}
