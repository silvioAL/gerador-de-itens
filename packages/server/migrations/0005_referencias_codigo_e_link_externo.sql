ALTER TABLE "referencias" RENAME COLUMN "link_confluence" TO "link_externo";
--> statement-breakpoint
ALTER TABLE "referencias" ADD COLUMN IF NOT EXISTS "codigo_relacionado" jsonb DEFAULT '[]'::jsonb NOT NULL;
