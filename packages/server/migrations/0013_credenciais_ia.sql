-- SPEC-31 Fase 4: credencial do provedor de IA no modo hospedado.
--
-- No modo local a credencial é da PESSOA e mora em ~/.gerador. Aqui não existe
-- "a máquina dela": a credencial é da organização e é usada por terceiros.
-- Uma linha por (organizacao, provedor).
--
-- A chave fica em claro na coluna, como qualquer segredo que a aplicação
-- precisa usar em runtime. A proteção real é a do banco (acesso, backup
-- cifrado) e o vault do SPEC-12 na frente — não uma cifra simétrica com a
-- senha no mesmo processo, que só moveria o problema.
CREATE TABLE IF NOT EXISTS "credenciais_ia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
  "provedor_id" text NOT NULL,
  "base_url" text,
  "chave" text,
  "modelo" text,
  "cabecalhos" jsonb,
  "formato_json" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "credenciais_ia_chave_unica"
  ON "credenciais_ia" USING btree ("organizacao_id", "provedor_id");
