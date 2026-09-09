-- SPEC-110 fatia J (D16) — o subfluxo: um fluxo inteiro como um nó.
--
-- A execução do FILHO é linha própria, e não um pedaço do rastro do pai, por
-- duas razões medidas:
--
-- 1. a §4.J pede um link "ver execução do subfluxo" no rastro — e um link
--    precisa de um alvo, ou seja, de um id;
-- 2. o histórico de um fluxo responde "o que rodou aqui". Esconder as
--    execuções disparadas por um pai faria o histórico mentir por omissão.
--
-- Mas linha própria sem marca faria o contrário: alguém veria no histórico da
-- esteira uma execução que ninguém disparou à mão. `disparado_por` é a
-- resposta — o id da execução-pai. É a mesma disciplina do e-mail do relógio
-- na fatia E: a auditoria pergunta "quem fez?", e "apareceu sozinho" não é
-- resposta.
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "disparado_por" uuid;

-- Quem abre a execução de um pai quer listar as filhas dela.
CREATE INDEX IF NOT EXISTS "fluxo_execucoes_disparado_por_idx"
  ON "fluxo_execucoes" ("disparado_por")
  WHERE "disparado_por" IS NOT NULL;
