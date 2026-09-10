-- SPEC-110 fatia J — a OUTRA metade do subfluxo: o filho que parou numa TELA.
--
-- Migração separada da 0047 de propósito, e a razão é medida: a 0047 já tinha
-- sido aplicada nos bancos locais quando estas duas colunas apareceram, e o
-- drizzle não reaplica uma migração pelo conteúdo — ele a pula pelo `when` do
-- journal. Editar a 0047 deixou a suíte do server vermelha em 39 testes com
-- `column "subfluxo_parcial" does not exist`, e teria deixado o banco de
-- desenvolvimento quebrado do mesmo jeito, em silêncio. Uma fatia pode precisar
-- de duas migrações; um arquivo já aplicado não pode mudar de conteúdo.

-- A jornada da demanda começa por um subfluxo que contém a bancada de ensaios,
-- então "pausar lá dentro" não é caso de borda — é o primeiro passo. Quem fica
-- no banco é a execução do PAI (é ela que alguém continua), e por isso o
-- estado parcial do filho precisa viajar com ela: sem esta coluna, continuar
-- re-rodaria o filho do começo — os agentes de novo, os conectores de novo, a
-- conta de novo. Aninhado porque um filho pode ter parado dentro de um neto.
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "subfluxo_parcial" jsonb;

-- E os parâmetros DESTA execução, que a retomada perdia.
--
-- `parametrosPorNo` é como o atalho da tela aponta a demanda ABERTA sem
-- congelar nada na fiação (SPEC-107 G1). Até aqui ele sobrevivia por acaso:
-- quem os recebia era o primeiro nó, que já estava concluído quando alguém
-- continuava. A jornada da demanda quebra esse acaso — ela pausa na primeira
-- etapa e os nós que ainda vão rodar (derivar, exportar, publicar) também
-- precisam saber de qual demanda se fala. Sem esta coluna, continuar a jornada
-- cairia n'"a demanda ativa do time": a errada, em silêncio.
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "parametros_por_no" jsonb;
