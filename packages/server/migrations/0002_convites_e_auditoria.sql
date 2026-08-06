CREATE TABLE IF NOT EXISTS "convites_time" (
	"token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_id" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_por" text,
	"usado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"acao" text NOT NULL,
	"recurso" text NOT NULL,
	"recurso_id" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
