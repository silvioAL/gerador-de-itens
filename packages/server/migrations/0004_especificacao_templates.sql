CREATE TABLE IF NOT EXISTS "especificacao_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_id" text DEFAULT '__global__' NOT NULL,
	"conteudo" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "especificacao_templates_chave_unica" ON "especificacao_templates" USING btree ("time_id");
--> statement-breakpoint
-- Seed do template global (SPEC-14 §6) — conteúdo idêntico a
-- TEMPLATE_ESPECIFICACAO_PADRAO em
-- packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts. Mudar um
-- dos dois sem mudar o outro é uma divergência conhecida (mesmo raciocínio de
-- "os dois arquivos sempre sincronizados" já usado pra config/diagrama.json
-- vs packages/cli/templates/diagrama.json) — o CLI usa a constante do engine
-- direto (sem banco), o server/web usam esta seed.
INSERT INTO "especificacao_templates" ("time_id", "conteudo") VALUES
	('__global__', $$# {{titulo}}

## Contexto
{{contexto}}

## Visão geral
{{historiaPo}}

## Itens

{{itens}}

## Definition of Ready
{{definitionOfReady}}

## Definition of Done
{{definitionOfDone}}
$$);
