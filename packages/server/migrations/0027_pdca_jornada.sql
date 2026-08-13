-- SPEC-45 — a jornada do PDCA: o feedback deixa de ser escrita-só e a
-- solicitação passa a carregar a OPERAÇÃO aplicável (o que permite prever o
-- efeito antes de decidir e aplicar sozinho depois de aprovada).
ALTER TABLE "pdca_feedback" ADD COLUMN "estado" text NOT NULL DEFAULT 'novo';--> statement-breakpoint
ALTER TABLE "pdca_feedback" ADD COLUMN "solicitacao_id" uuid REFERENCES "solicitacoes_ajuste"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "solicitacoes_ajuste" ADD COLUMN "operacao" jsonb;--> statement-breakpoint
ALTER TABLE "solicitacoes_ajuste" ADD COLUMN "aplicada_em" timestamptz;--> statement-breakpoint
ALTER TABLE "solicitacoes_ajuste" ADD COLUMN "aplicada_por" text;
