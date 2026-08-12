-- SPEC-38 Fase 3 — papéis portados por TIME: o papel entra e sai da permissão
-- junto com a composição do time. Herdam os membros de nível OWNER do time
-- portador (D3: editar configuração pede owner ou delegação — um `operar` do
-- time de arquitetura opera, não edita prompts).
CREATE TABLE "time_papel" (
  "time_id" text NOT NULL REFERENCES "times"("id"),
  "papel_id" uuid NOT NULL REFERENCES "papeis_acesso"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX "time_papel_chave_unica" ON "time_papel" ("time_id", "papel_id");
