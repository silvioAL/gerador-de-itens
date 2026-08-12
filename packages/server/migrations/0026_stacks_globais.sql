-- SPEC-43 — stacks conhecidas: catálogo global POR COMPONENTE, sem vínculo
-- por time. Cada (perfil × componente) vira uma stack com nome derivado dos
-- próprios valores ("Java + Spring Boot", "Camunda 7"...) — o nome para de
-- mentir porque o escopo é um componente só. `origem_perfil_id` é coluna
-- temporária de migração, derrubada no fim.
CREATE TABLE "stacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
	"tipo_no" text NOT NULL,
	"nome" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamptz NOT NULL DEFAULT now(),
	"origem_perfil_id" uuid
);--> statement-breakpoint
CREATE TABLE "stack_valores" (
	"stack_id" uuid NOT NULL REFERENCES "stacks"("id") ON DELETE CASCADE,
	"campo" text NOT NULL,
	"valor" text NOT NULL,
	"atualizado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "stack_valores_chave_unica" ON "stack_valores" ("stack_id", "campo");--> statement-breakpoint
INSERT INTO "stacks" ("organizacao_id", "tipo_no", "nome", "criado_por", "origem_perfil_id")
SELECT p."organizacao_id", t."tipo_no",
	(SELECT string_agg(v."valor", ' + ' ORDER BY v."campo" DESC)
	   FROM "perfil_stack_valores" v
	  WHERE v."perfil_id" = p."id" AND v."tipo_no" = t."tipo_no"),
	p."criado_por", p."id"
FROM "perfis_stack" p
JOIN (SELECT DISTINCT "perfil_id", "tipo_no" FROM "perfil_stack_valores") t ON t."perfil_id" = p."id";--> statement-breakpoint
INSERT INTO "stack_valores" ("stack_id", "campo", "valor")
SELECT s."id", v."campo", v."valor"
FROM "perfil_stack_valores" v
JOIN "stacks" s ON s."origem_perfil_id" = v."perfil_id" AND s."tipo_no" = v."tipo_no";--> statement-breakpoint
ALTER TABLE "stacks" DROP COLUMN "origem_perfil_id";--> statement-breakpoint
ALTER TABLE "times" DROP COLUMN "perfil_stack_id";--> statement-breakpoint
DROP TABLE "perfil_stack_valores";--> statement-breakpoint
DROP TABLE "perfis_stack";
