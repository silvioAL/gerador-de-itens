-- SPEC-28 Fase 1 — gestão de acessos.
--
-- Nenhuma linha é criada aqui de propósito: uma organização SEM papel nenhum
-- continua se comportando como antes (todo membro edita o que já editava,
-- SPEC-28 §4.3). Ligar o RBAC é ato explícito de quem administra, não efeito
-- colateral de aplicar a migração — que é o jeito clássico de trancar todo
-- mundo para fora no dia do deploy.

CREATE TABLE IF NOT EXISTS "papeis_acesso" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizacao_id" uuid NOT NULL REFERENCES "organizacoes"("id"),
  "nome" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "papeis_acesso_nome_unico"
  ON "papeis_acesso" ("organizacao_id", "nome");

CREATE TABLE IF NOT EXISTS "papel_permissao" (
  "papel_id" uuid NOT NULL REFERENCES "papeis_acesso"("id") ON DELETE CASCADE,
  "recurso" text NOT NULL,
  "acao" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "papel_permissao_chave_unica"
  ON "papel_permissao" ("papel_id", "recurso", "acao");

CREATE TABLE IF NOT EXISTS "usuario_papel" (
  "email" text NOT NULL,
  "papel_id" uuid NOT NULL REFERENCES "papeis_acesso"("id") ON DELETE CASCADE,
  "escopo_time_id" text REFERENCES "times"("id")
);

-- `NULLS NOT DISTINCT`: sem isso o Postgres trata NULL≠NULL e a mesma pessoa
-- poderia receber o mesmo papel de escopo organizacional várias vezes (a
-- mesma armadilha que motivou o sentinela `__global__` em `campos_no`).
CREATE UNIQUE INDEX IF NOT EXISTS "usuario_papel_chave_unica"
  ON "usuario_papel" ("email", "papel_id", "escopo_time_id") NULLS NOT DISTINCT;
