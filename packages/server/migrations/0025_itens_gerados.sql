-- SPEC-41 Parte B — os itens de trabalho materializados dentro da ferramenta.
-- Um conjunto por quebra; gerar é REGERAR (substitui o conjunto). `chave` é a
-- Atividade.chave, estável entre regenerações — é por ela que o rastro de
-- exportação (estado/link_externo, Fase 2) sobrevive à regeneração.
CREATE TABLE "itens_gerados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quebra_id" uuid NOT NULL REFERENCES "quebras"("id") ON DELETE CASCADE,
	"ordem" integer NOT NULL DEFAULT 0,
	"chave" text NOT NULL,
	"titulo" text NOT NULL,
	"tipo" text NOT NULL,
	"tamanho" text NOT NULL,
	"dependencias" jsonb NOT NULL DEFAULT '[]',
	"corpo_markdown" text NOT NULL,
	"pendencias" integer NOT NULL DEFAULT 0,
	"sugestoes" integer NOT NULL DEFAULT 0,
	"estado" text NOT NULL DEFAULT 'gerado' CHECK ("estado" IN ('gerado', 'exportado')),
	"link_externo" text,
	"criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "itens_gerados_chave_unica" ON "itens_gerados" ("quebra_id", "chave");
