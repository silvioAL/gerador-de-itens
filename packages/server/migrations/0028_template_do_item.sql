-- SPEC-47 — o corpo de CADA item também vira template configurável (antes
-- só o documento era). Mesma tabela, um tipo a mais: `documento` (o de
-- sempre) e `item`. O índice único passa a ser (time_id, tipo) — cada time
-- pode ter os dois.
ALTER TABLE "especificacao_templates" ADD COLUMN "tipo" text NOT NULL DEFAULT 'documento';--> statement-breakpoint
DROP INDEX IF EXISTS "especificacao_templates_chave_unica";--> statement-breakpoint
CREATE UNIQUE INDEX "especificacao_templates_chave_unica" ON "especificacao_templates" ("time_id", "tipo");
