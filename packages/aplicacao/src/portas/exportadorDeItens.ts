import type { ItemGeradoSalvo } from "./repositorioDeItensGerados.js";

/**
 * SPEC-41 Fase 2 — a porta de exportação para um issue tracker externo. O
 * adaptador concreto (MCP → agente que sobe pro Jira/tracker) chega na Fase
 * 2; a porta nasce agora para o contrato guiar a tela ("pronto pra exportar")
 * e para nenhum caso de uso acoplar em Jira diretamente.
 */
export interface ItemExportado {
  /** `ItemGeradoSalvo.chave` — o elo entre o item local e o issue criado. */
  chave: string;
  /** URL do issue criado no tracker. */
  linkExterno: string;
}

export interface ExportadorDeItens {
  /**
   * Sobe os itens para o tracker e devolve um resultado POR ITEM enviado, na
   * mesma ordem. Falha parcial é resposta, não exceção: quem exportou fica
   * exportado, quem falhou volta com `erro` — a tela decide o que reapresentar.
   */
  exportar(itens: ItemGeradoSalvo[]): Promise<Array<ItemExportado | { chave: string; erro: string }>>;
}
