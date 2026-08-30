-- SPEC-86 — o eixo do PRODUTO nas regras.
--
-- A demanda do usuário: o checklist existe por processo (time → tech → contexto
-- → nó) e falta o eixo do produto. O bloqueio estava aqui: o índice único
-- `(chave, time_id)` só permite um documento de `regras` por time, então não
-- havia onde guardar o do produto.
--
-- ## Por que uma COLUNA, e não a chave codificada
--
-- Codificar o produto dentro de `chave` (`regras:produto-x`) faria toda leitura
-- de config precisar saber parsear a chave — e `ehChaveConfig` é justamente o
-- que impede chave inventada de entrar. O molde é o da migração 0028, que fez
-- `especificacao_templates` virar `(time_id, tipo)` pelo mesmo motivo.
--
-- ## Por que NULL é o documento de sempre
--
-- Toda linha que existe hoje continua valendo sem tocar em nada: `NULL` é "não
-- é de produto nenhum", que é exatamente o que essas linhas são. Um default
-- textual (`''`, `'global'`) obrigaria a migrar os dados para ganhar nada.
--
-- Postgres trata NULLs como distintos em índice único, então `(chave, time_id,
-- NULL)` não impediria duas linhas globais iguais. Daí o `NULLS NOT DISTINCT`:
-- sem ele, a garantia que existe hoje — um documento por chave e time — se
-- perderia em silêncio, que é o pior jeito de perder uma garantia.
ALTER TABLE "config_documentos" ADD COLUMN "produto_id" uuid REFERENCES "produtos"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "config_documentos_chave_unica";--> statement-breakpoint
CREATE UNIQUE INDEX "config_documentos_chave_unica" ON "config_documentos" ("chave", "time_id", "produto_id") NULLS NOT DISTINCT;
