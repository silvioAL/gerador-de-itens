import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { pdcaFeedback } from "../db/schema.js";

/**
 * SPEC-110 fatia F (D11) — **um gravador de feedback, duas portas.**
 *
 * A aba PDCA (`POST /pdca/feedback`) e o nó `pdca-feedback` de um fluxo
 * escrevem o MESMO dado. Duas inserções copiadas divergiriam na primeira
 * mudança — o campo novo entraria numa e não na outra, e o feedback vindo do
 * fluxo apareceria pela metade na aba que o mostra. §263: um caminho de
 * escrita, duas chamadas.
 *
 * A auditoria vem junto por isso mesmo: ela é parte da escrita, não uma
 * cortesia de quem chamou. Um feedback gravado sem linha de auditoria é um
 * registro que ninguém consegue explicar depois.
 */
export async function gravarFeedback(
  db: OpcoesApp["db"],
  entrada: { email: string; timeId?: string | null; texto: string }
): Promise<{ id: string }> {
  const [gravado] = await db
    .insert(pdcaFeedback)
    .values({ email: entrada.email, timeId: entrada.timeId ?? null, texto: entrada.texto })
    .returning();
  registrarAuditoria(db, { email: entrada.email, acao: "criar", recurso: "pdca_feedback", recursoId: gravado.id });
  return { id: gravado.id };
}
