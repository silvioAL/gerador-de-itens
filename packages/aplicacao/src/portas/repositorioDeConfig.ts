import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";

export { CAMPO_GLOBAL };

/**
 * SPEC-31 Fase 3 — a porta de Configuração.
 *
 * Os documentos de config que hoje só existem como arquivo no modo local:
 * a tabela de regras de refinamento, a esteira de agentes e o template do
 * prompt único. O modo hospedado não tem nenhum deles — não tem rota, não tem
 * tabela, e quem sobe o Docker fica com o default compilado, sem como mudar.
 *
 * O documento é opaco para a porta: quem sabe interpretar `regras` é o engine,
 * e duplicar essa validação no repositório criaria duas fontes de verdade
 * sobre o que é uma regra válida.
 */
export const CHAVES_CONFIG = ["regras", "pipeline-agentes", "prompt-unico"] as const;

export type ChaveConfig = (typeof CHAVES_CONFIG)[number];

export function ehChaveConfig(valor: string): valor is ChaveConfig {
  return (CHAVES_CONFIG as readonly string[]).includes(valor);
}

export interface DocumentoConfig {
  chave: ChaveConfig;
  timeId: string;
  documento: unknown;
  /**
   * A versão do gerador cujo template semeou este documento — `null` quando
   * veio de antes desta fase, que é justamente o caso interessante: config de
   * outra era, que a ferramenta nunca sobrescreve e, até agora, nunca comentava.
   */
  versaoTemplate: string | null;
  atualizadoEm: string;
}

export interface RepositorioDeConfig {
  /** O do time, se houver; senão o global; senão `null` (nunca editado). */
  obter(chave: ChaveConfig, timeId?: string): Promise<DocumentoConfig | null>;
  /** Upsert pela chave natural (`chave`, `timeId`). */
  salvar(
    chave: ChaveConfig,
    timeId: string,
    documento: unknown,
    versaoTemplate: string | null
  ): Promise<DocumentoConfig>;
}
