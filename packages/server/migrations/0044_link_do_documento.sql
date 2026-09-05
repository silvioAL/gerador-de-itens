-- SPEC-106 fatia C — a demanda guarda o LINK do documento publicado.
-- A publicação (SPEC-81) sempre devolveu `linkExterno`; ele morria na memória
-- da tela. "Apenas armazenar o link no sistema" — pedido literal do usuário.
ALTER TABLE "quebras" ADD COLUMN IF NOT EXISTS "documento_link_externo" text;
