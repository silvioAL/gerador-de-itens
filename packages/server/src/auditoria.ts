import type { BancoDeDados } from "./db/client.js";
import { auditoria } from "./db/schema.js";

/**
 * Log de auditoria simples (SPEC-10 §4): "quem mexeu em quê e quando", não um
 * sistema de histórico/diff. Fire-and-forget de propósito — chamado só depois
 * da escrita de verdade já ter tido sucesso, e uma falha aqui nunca deveria
 * virar um jeito novo da rota inteira falhar (por isso não é `await`ado pelo
 * chamador, e engole o próprio erro).
 */
export function registrarAuditoria(
  db: BancoDeDados,
  dados: { email: string; acao: string; recurso: string; recursoId?: string }
): void {
  void db
    .insert(auditoria)
    .values(dados)
    .catch(() => {
      // observabilidade, não bloqueia nem propaga — a escrita principal já aconteceu.
    });
}
