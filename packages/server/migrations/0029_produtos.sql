-- SPEC-53 Fase 1 — o produto passa a existir.
--
-- Entidade PRÓPRIA, e não um campo do time: um time atende vários produtos e
-- um produto atravessa times (mesma lição da SPEC-42, quando "time" e "stack"
-- estavam misturados). Daí a tabela de ligação em vez de uma coluna `time_id`.
--
-- O contexto mora em colunas nomeadas, não num JSON solto: são seis seções
-- fixas e escolhidas (SPEC-53 §3), e nomeá-las é o que permite a tela, o
-- prompt e o documento falarem da mesma coisa sem combinar chave de JSON.
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
	"nome" text NOT NULL,
	"objetivo" text NOT NULL DEFAULT '',
	"quem_usa" text NOT NULL DEFAULT '',
	"regras_de_negocio" text NOT NULL DEFAULT '',
	"sistemas" text NOT NULL DEFAULT '',
	"restricoes" text NOT NULL DEFAULT '',
	"criado_por" text NOT NULL,
	"criado_em" timestamptz NOT NULL DEFAULT now(),
	"atualizado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- O glossário é a única seção ESTRUTURADA: termo → definição. É a que mais
-- muda a escrita de um item ("portabilidade", "fatura" e "carteira" querem
-- dizer coisas diferentes em cada casa), e estrutura aqui paga — dá pra
-- ordenar, editar um termo sem reescrever o texto e, na Fase 2, mandar só os
-- termos que cabem na janela.
CREATE TABLE "produto_glossario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL REFERENCES "produtos"("id") ON DELETE CASCADE,
	"termo" text NOT NULL,
	"definicao" text NOT NULL,
	"ordem" integer NOT NULL DEFAULT 0
);--> statement-breakpoint
CREATE UNIQUE INDEX "produto_glossario_termo_unico" ON "produto_glossario" ("produto_id", "termo");--> statement-breakpoint

-- N:N com times. `ON DELETE CASCADE` nos dois lados: a ligação não sobrevive
-- ao que ela liga.
CREATE TABLE "produto_time" (
	"produto_id" uuid NOT NULL REFERENCES "produtos"("id") ON DELETE CASCADE,
	"time_id" text NOT NULL REFERENCES "times"("id") ON DELETE CASCADE,
	CONSTRAINT "produto_time_pk" PRIMARY KEY ("produto_id", "time_id")
);--> statement-breakpoint

-- A quebra APONTA para um produto, e o vínculo é opcional: quem já usa a
-- ferramenta não pode ser obrigado a cadastrar produto para continuar fazendo
-- o que fazia. `ON DELETE SET NULL` — apagar o produto não apaga demanda de
-- ninguém.
ALTER TABLE "quebras" ADD COLUMN "produto_id" uuid REFERENCES "produtos"("id") ON DELETE SET NULL;
