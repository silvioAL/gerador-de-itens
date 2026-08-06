ALTER TABLE "quebras" DROP COLUMN IF EXISTS "produto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campos_no" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_id" text DEFAULT '__global__' NOT NULL,
	"tipo_no" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"valor_padrao" text,
	"opcoes" jsonb,
	"ajuda" text,
	"permite_na" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campos_no_chave_unica" ON "campos_no" USING btree ("time_id","tipo_no","key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuario_time" (
	"email" text NOT NULL,
	"time_id" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usuario_time_chave_unica" ON "usuario_time" USING btree ("email","time_id");
--> statement-breakpoint
-- Usuários de exemplo pra login em AUTH_MODE=dev funcionar pronto do zero,
-- mesmo raciocínio da seed de perfis_time em 0000_init.sql — sem isso o tour
-- guiado e o E2E de login não têm com quem entrar. "dev@gerador.local"
-- pertence aos três times (pra exercitar troca de time ativo; "time-checkout"
-- não tem perfil de stack seedado em 0000_init.sql, de propósito — é o time
-- usado pelo E2E que demonstra declarar um valor pela primeira vez);
-- "outro@gerador.local" só a time-portabilidade (pra exercitar isolamento —
-- time A não edita time B).
INSERT INTO "usuario_time" ("email", "time_id") VALUES
	('dev@gerador.local', 'time-pagamentos'),
	('dev@gerador.local', 'time-portabilidade'),
	('dev@gerador.local', 'time-checkout'),
	('outro@gerador.local', 'time-portabilidade');
