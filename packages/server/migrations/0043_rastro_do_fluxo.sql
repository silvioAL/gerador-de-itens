-- SPEC-105 fatia D — o rastro de execução do fluxo, por nó.
--
-- Uma linha por execução; `nos` é o rastro por nó (estado, erro, duração),
-- SEM as saídas — a resposta de um conector pode carregar dado de negócio do
-- outro lado, e o rastro é diagnóstico, não armazém.
--
-- `hash` é a impressão digital do fluxo que rodou (§9.5): responde "este
-- resultado saiu de qual fiação?" depois que alguém editar o fluxo.
--
-- `fluxo_id`/`time_id` sem FK de propósito: o fluxo mora em jsonb de
-- config_documentos, e o rastro sobrevive ao fluxo apagado.
CREATE TABLE IF NOT EXISTS "fluxo_execucoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fluxo_id" text NOT NULL,
  "time_id" text NOT NULL,
  "hash" text NOT NULL,
  "email" text,
  "em" timestamp with time zone DEFAULT now() NOT NULL,
  "nos" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fluxo_execucoes_fluxo_em" ON "fluxo_execucoes" ("fluxo_id", "em");
