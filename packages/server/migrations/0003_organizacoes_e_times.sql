-- Organização → Times → Membros (JOURNEY.md, Fase B.2) — corrige SPEC-09 §3.3:
-- times deixam de existir só implicitamente como strings soltas em
-- usuario_time.time_id; ganham tabela própria, presa a uma organização.
-- Uma organização só por deploy (decisão do usuário — nada de multi-tenant de
-- verdade agora), mas com tabela de verdade, não só conceitual, porque o
-- projeto pode um dia ser usado por mais de uma empresa. `times.id` continua
-- sendo a mesma string de sempre (ex. "time-pagamentos"), globalmente única —
-- não uma chave composta (organizacao_id, slug) — porque com uma organização
-- só isso já é o comportamento certo, e virar composta no futuro é uma
-- migração pequena e isolada, não um redesenho.
CREATE TABLE IF NOT EXISTS "organizacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organizacoes" ("nome") VALUES ('Organização padrão')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "times" (
	"id" text PRIMARY KEY NOT NULL,
	"organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Backfill: um `times` pra cada time_id distinto já em uso, todos pra dentro
-- da organização única semeada acima (__global__ de campos_no fica de fora —
-- é sentinela, não time de verdade).
INSERT INTO "times" ("id", "organizacao_id", "nome")
SELECT DISTINCT t.time_id, (SELECT "id" FROM "organizacoes" LIMIT 1), t.time_id
FROM (
	SELECT "time_id" FROM "usuario_time"
	UNION
	SELECT "time_id" FROM "perfis_time"
	UNION
	SELECT "time_id" FROM "convites_time"
) AS t
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "usuario_time" ADD CONSTRAINT "usuario_time_time_id_times_id_fk"
	FOREIGN KEY ("time_id") REFERENCES "times"("id");
--> statement-breakpoint
ALTER TABLE "convites_time" ADD CONSTRAINT "convites_time_time_id_times_id_fk"
	FOREIGN KEY ("time_id") REFERENCES "times"("id");
--> statement-breakpoint
ALTER TABLE "perfis_time" ADD CONSTRAINT "perfis_time_time_id_times_id_fk"
	FOREIGN KEY ("time_id") REFERENCES "times"("id");
