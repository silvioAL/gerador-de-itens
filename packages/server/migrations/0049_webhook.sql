-- SPEC-110 fatia L (D1) — o endereço de um webhook: alguém de fora nos chama.
--
-- O molde é a tabela de agendamentos da fatia E: uma linha por nó de gatilho,
-- com o que NÃO cabe no documento do fluxo. E o que não cabe aqui é o segredo
-- (D18: "conexões de banco/segredos → cofre; NUNCA no documento" — a mesma
-- régua vale para um token que dispara execução).
--
-- `token_hash` e não `token`: quem tem o valor dispara o fluxo sem sessão, o
-- que faz dele uma chave de API. Guardamos o hash, mostramos o valor UMA vez
-- na geração, e regenerar sobrescreve o hash — invalidando o anterior por
-- construção, não por uma coluna "revogado" que alguém esquece de checar.
-- Perdeu, gera outro; não existe recuperar.
CREATE TABLE IF NOT EXISTS "fluxo_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fluxo_id" text NOT NULL,
  "no_id" text NOT NULL,
  "time_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "criado_por" text,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "ultima_em" timestamptz
);

-- A chamada de fora chega com o token e nada mais: a busca é POR ELE, e é o
-- caminho quente da rota. Único porque dois nós com o mesmo hash tornariam
-- ambíguo qual fluxo disparar — e "disparou o errado" é pior que "não disparou".
CREATE UNIQUE INDEX IF NOT EXISTS "fluxo_webhooks_token_hash_idx" ON "fluxo_webhooks" ("token_hash");

-- Um nó de gatilho tem UM endereço. Regenerar atualiza a linha; salvar o fluxo
-- de novo não cria uma segunda.
CREATE UNIQUE INDEX IF NOT EXISTS "fluxo_webhooks_no_idx" ON "fluxo_webhooks" ("time_id", "fluxo_id", "no_id");
