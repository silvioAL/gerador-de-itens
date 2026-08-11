-- SPEC-34 Fase 2: retrospectivas do time, no hospedado, pela primeira vez.
--
-- O recurso `retrospectivas` existia no enum de RBAC desde a SPEC-28
-- antecipando exatamente isto (ver o comentário assinado que morava em
-- RECURSOS_SEM_ROTA). A ingestão do fluxo 5 (SPEC-23) nunca chegou ao
-- hospedado: nem tabela, nem rota. v1 deliberadamente sem embeddings — o
-- texto entra como contexto da conversa de configuração, e a proposta cita o
-- trecho de origem.
CREATE TABLE IF NOT EXISTS "retrospectivas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "time_id" text NOT NULL,
  "titulo" text NOT NULL,
  "texto" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "retrospectivas_por_time" ON "retrospectivas" USING btree ("time_id");
