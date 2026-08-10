-- SPEC-31 (paridade): campos por tipo de CONEXÃO no modo hospedado.
--
-- SPEC-21 criou `config/campos-aresta.json` no modo local e nunca chegou ao
-- hospedado: nem rota, nem tabela. Quem sobe o Docker não consegue configurar
-- campo de conexão nenhum. Mesma forma de `campos_no`, sem `item_spec` —
-- `CampoAresta` não aceita campo do tipo "lista".
CREATE TABLE IF NOT EXISTS "campos_aresta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "time_id" text DEFAULT '__global__' NOT NULL,
  "tipo_aresta" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "type" text NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "valor_padrao" text,
  "opcoes" jsonb,
  "ajuda" text,
  "ordem" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "campos_aresta_chave_unica"
  ON "campos_aresta" USING btree ("time_id", "tipo_aresta", "key");
