-- Reversão da SPEC-34 Fase 2, a pedido do usuário ("quero remover isso"):
-- a seção de anotações do time saiu da conversa de configuração, e manter a
-- tabela sem rota nem tela seria material invisível — pior que não existir.
-- A 0017 fica no histórico (migração aplicada não se apaga); esta desfaz.
DROP TABLE IF EXISTS "retrospectivas";
