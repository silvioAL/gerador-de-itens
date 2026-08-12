-- SPEC-39 Fase 1 — PDCA de configurações: contadores de uso por usuário,
-- feedback livre e solicitações de ajuste com VERSÃO-ALVO (a validade da
-- aprovação tardia).
CREATE TABLE "pdca_usos" (
  "email" text NOT NULL,
  "tipo" text NOT NULL,
  "contagem" integer NOT NULL DEFAULT 0
);--> statement-breakpoint
CREATE UNIQUE INDEX "pdca_usos_chave_unica" ON "pdca_usos" ("email", "tipo");--> statement-breakpoint
CREATE TABLE "pdca_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "time_id" text,
  "texto" text NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "solicitacoes_ajuste" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
  "time_id" text,
  "solicitante" text NOT NULL,
  "recurso" text NOT NULL,
  "descricao" text NOT NULL,
  "versao_alvo" timestamptz,
  "estado" text NOT NULL DEFAULT 'pendente',
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "decidido_por" text,
  "decidido_em" timestamptz
);
