-- SPEC-38 Fase 1 — níveis de participação no time.
--
-- `usuario_time` deixa de ser um vínculo binário: cada participação carrega um
-- nível (visualizar | operar | owner). Membros EXISTENTES viram `owner` de
-- propósito: é o poder que já têm hoje de fato ("qualquer membro administra");
-- rebaixar alguém é decisão humana pós-migração, não efeito colateral.
--
-- O default da coluna é `operar` (não `owner`): um insert novo que esqueça o
-- nível deve nascer com o poder do dia a dia, nunca com o de configuração.
ALTER TABLE "usuario_time" ADD COLUMN "nivel" text NOT NULL DEFAULT 'operar';--> statement-breakpoint
UPDATE "usuario_time" SET "nivel" = 'owner';--> statement-breakpoint
ALTER TABLE "usuario_time" ADD CONSTRAINT "usuario_time_nivel_valido" CHECK ("nivel" IN ('visualizar', 'operar', 'owner'));--> statement-breakpoint
-- Convite carrega o nível com que o aceite entra no time (teto: quem convida
-- não escala privilégio acima do próprio — regra aplicada na rota).
ALTER TABLE "convites_time" ADD COLUMN "nivel" text NOT NULL DEFAULT 'operar';--> statement-breakpoint
ALTER TABLE "convites_time" ADD CONSTRAINT "convites_time_nivel_valido" CHECK ("nivel" IN ('visualizar', 'operar', 'owner'));
