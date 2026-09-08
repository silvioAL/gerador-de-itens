-- SPEC-110 fatia E (D7) — o AGENDAMENTO de um fluxo.
--
-- Uma linha por nó de gatilho `agendamento`: o fluxo, o time, a expressão de
-- cron e QUANDO ele deve rodar da próxima vez. `proximo_em` é o que o runner
-- consulta e reescreve — o UPDATE atômico sobre ele É o lock (D7,
-- single-instance v1; multi-instância é dívida declarada).
--
-- `no_id` entra na chave porque um fluxo pode ganhar outro gatilho amanhã, e
-- porque é ele que o sincronizador usa para saber o que apagar quando o nó sai
-- do desenho.
CREATE TABLE IF NOT EXISTS "fluxo_agendamentos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fluxo_id" text NOT NULL,
  "no_id" text NOT NULL,
  "time_id" text NOT NULL,
  "expressao" text NOT NULL,
  "ativo" boolean NOT NULL DEFAULT true,
  -- Nulo = "ainda não calculado"; o runner o preenche no primeiro tick, e
  -- nunca dispara por causa dele (o filtro é `proximo_em <= now()`).
  "proximo_em" timestamptz,
  "ultima_em" timestamptz,
  "criado_por" text,
  CONSTRAINT "fluxo_agendamentos_unico" UNIQUE ("fluxo_id", "no_id", "time_id")
);

-- O tick roda a cada 30s e pergunta sempre a mesma coisa: quem já venceu?
CREATE INDEX IF NOT EXISTS "fluxo_agendamentos_proximo" ON "fluxo_agendamentos" ("proximo_em") WHERE "ativo";
