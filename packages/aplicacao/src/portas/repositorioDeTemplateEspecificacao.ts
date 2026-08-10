/**
 * SPEC-31 Fase 2 — a porta do template da especificação de entrega (SPEC-14).
 *
 * Um documento por quebra, logo um template por `timeId`, com um global de
 * fallback. Chave natural: o `timeId`. O `id` existe porque o Postgres tem
 * uma coluna dele e a `packages/web` já recebe o objeto inteiro — mas ninguém
 * busca por ele.
 */
import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";

export { CAMPO_GLOBAL };

export interface TemplateEspecificacao {
  id: string;
  timeId: string;
  conteudo: string;
  atualizadoEm: string;
}

export interface RepositorioDeTemplateEspecificacao {
  /** O do time, se houver; senão o global; senão `null`. */
  obter(timeId?: string): Promise<TemplateEspecificacao | null>;
  /** Upsert pela chave natural (`timeId`). */
  salvar(timeId: string, conteudo: string): Promise<TemplateEspecificacao>;
}
