-- SPEC-38 Fase 2 — a stack deixa de ser atributo do time e vira PERFIL
-- APONTADO: um catálogo aberto de perfis nomeados ("Java + Spring Boot"), com
-- o time apontando um deles. Trocar de tecnologia é trocar o ponteiro, não
-- reescrever a identidade do time.
CREATE TABLE "perfis_stack" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
  "nome" text NOT NULL,
  "criado_por" text NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_stack_nome_unico" ON "perfis_stack" ("organizacao_id", "nome");--> statement-breakpoint
-- Mesma forma relacional do antigo perfis_time (uma linha por valor, pra
-- UPDATE pontual), só que pendurada no perfil.
CREATE TABLE "perfil_stack_valores" (
  "perfil_id" uuid NOT NULL REFERENCES "perfis_stack"("id") ON DELETE CASCADE,
  "tipo_no" text NOT NULL,
  "campo" text NOT NULL,
  "valor" text NOT NULL,
  "atualizado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_stack_valores_chave_unica" ON "perfil_stack_valores" ("perfil_id", "tipo_no", "campo");--> statement-breakpoint
ALTER TABLE "times" ADD COLUMN "perfil_stack_id" uuid REFERENCES "perfis_stack"("id");--> statement-breakpoint
-- D4 do debate: os perfis existentes podem ser zerados — nada a migrar.
DROP TABLE "perfis_time";
