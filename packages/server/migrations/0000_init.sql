CREATE TABLE IF NOT EXISTS "quebras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto" text NOT NULL,
	"time" text,
	"diagrama" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfis_time" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_id" text NOT NULL,
	"tipo_no" text NOT NULL,
	"campo" text NOT NULL,
	"valor" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "perfis_time_chave_unica" ON "perfis_time" USING btree ("time_id","tipo_no","campo");
--> statement-breakpoint
-- Mesmo exemplo que antes vivia em config/perfis-time.example.json — times de
-- exemplo pra jornada/demo funcionar pronta do zero (o tour guiado e o cenário
-- de "perfil de stack sugere linguagem" dependem de "time-pagamentos" existir).
INSERT INTO "perfis_time" ("time_id", "tipo_no", "campo", "valor") VALUES
	('time-pagamentos', 'service', 'linguagem', 'Java'),
	('time-pagamentos', 'service', 'framework', 'Spring Boot'),
	('time-pagamentos', 'camunda', 'framework', 'Camunda 7'),
	('time-pagamentos', 'fico', 'motorPadrao', 'FICO Blaze Advisor'),
	('time-portabilidade', 'service', 'linguagem', 'Node');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_id" text,
	"titulo" text NOT NULL,
	"racional" text NOT NULL,
	"design_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link_confluence" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Referência ilustrativa (não é dado de teste): mesmo exemplo real do padrão
-- "tabela de regras" usado pelo próprio importador do Graphify deste projeto —
-- ver packages/engine/src/adapters/graphify/importarGrafo.ts. Antes vivia como
-- arquivo em config/referencias/; agora que referências são uma tabela
-- compartilhada, o jeito de "vir com um exemplo pronto" é semear uma linha.
INSERT INTO "referencias" ("titulo", "racional", "design_patterns")
VALUES (
	'Import Graphify -> nós tipados (mapeamento por regra, sem inferência)',
	'Como este próprio projeto traduz o graph.json que o Graphify produz (que não tem "tipo de entidade" nenhum, só rótulo + arquivo-fonte) em nós tipados do diagrama. É um exemplo real do padrão "tabela de regras": uma lista ordenada de (regex de caminho → tipo), percorrida em ordem, primeira que bate vence. O ponto que faz isso valer como referência não é a mecânica da regex, é a decisão ao redor dela: todo arquivo que não bate com regra nenhuma vai para naoMapeados, explícito e visível — nunca um tipo adivinhado por heurística. Ver packages/engine/src/adapters/graphify/importarGrafo.ts.',
	'["Rule table / strategy", "Anti-corruption layer", "Fail loud sobre inferência"]'::jsonb
);
