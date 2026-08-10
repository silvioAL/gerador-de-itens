-- SPEC-31 Fase 3: configuração no modo hospedado.
--
-- Até aqui `regras`, `pipeline-agentes` e `prompt-unico` só existiam como
-- arquivo no modo local. Quem subia o Docker ficava com o default compilado,
-- sem rota nem tela para mudar — e sem como saber que estava com um default.
--
-- `versao_template` é o carimbo de qual versão do gerador semeou o documento.
-- Nulo é legítimo e informativo: config gravada antes desta fase.
CREATE TABLE IF NOT EXISTS "config_documentos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "time_id" text DEFAULT '__global__' NOT NULL,
  "documento" jsonb NOT NULL,
  "versao_template" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "config_documentos_chave_unica"
  ON "config_documentos" USING btree ("chave", "time_id");
