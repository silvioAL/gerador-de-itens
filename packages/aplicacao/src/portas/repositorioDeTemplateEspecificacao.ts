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

/** SPEC-47 — `documento` é a especificação inteira; `item` é o corpo de cada
 * item dentro dela (o que o time quer com "entrega final no fim"). */
export type TipoDeTemplate = "documento" | "item";

export interface TemplateEspecificacao {
  id: string;
  timeId: string;
  tipo: TipoDeTemplate;
  conteudo: string;
  atualizadoEm: string;
}

export interface RepositorioDeTemplateEspecificacao {
  /** O do time, se houver; senão o global; senão `null`. */
  obter(timeId?: string, tipo?: TipoDeTemplate): Promise<TemplateEspecificacao | null>;
  /** Upsert pela chave natural (`timeId`, `tipo`). */
  salvar(timeId: string, conteudo: string, tipo?: TipoDeTemplate): Promise<TemplateEspecificacao>;
}
