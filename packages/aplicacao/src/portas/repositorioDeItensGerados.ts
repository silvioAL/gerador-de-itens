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
  criadoEm: string;
}

/** O que se manda ao (re)gerar: a identidade e os carimbos são do repositório. */
export type DadosItemGerado = Omit<ItemGeradoSalvo, "id" | "quebraId" | "estado" | "linkExterno" | "criadoEm">;

export interface RepositorioDeItensGerados {
  /** Ordem de geração (a numeração do documento). */
  listarDaQuebra(quebraId: string): Promise<ItemGeradoSalvo[]>;
  /**
   * Substitui o conjunto da quebra pelo novo — atomicamente. Item exportado
   * de mesma `chave` preserva `estado`/`linkExterno` (o rastro externo não
   * evapora porque o material foi regenerado).
   */
  substituirDaQuebra(quebraId: string, itens: DadosItemGerado[]): Promise<ItemGeradoSalvo[]>;
  /** SPEC-49 — o item virou issue lá fora: guarda o link e o estado. */
  marcarExportado(quebraId: string, chave: string, linkExterno: string): Promise<ItemGeradoSalvo | null>;
}
