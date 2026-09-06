-- SPEC-107 fatia C — a execução de fluxo vira RETOMÁVEL (§5.5).
-- `estado`: 'concluida' (o que toda linha antiga é), 'aguardando-confirmacao'
-- (suspensa num gate, esperando alguém continuar) ou 'descartada'.
-- `saidas`: SÓ enquanto aguarda — é o stage que a revisão lê e o que a
-- retomada usa para não reexecutar ninguém; ao continuar/descartar, volta a
-- NULL (o rastro segue diagnóstico, não armazém).
-- `ate_no`: o corte da execução original, para a retomada respeitar o mesmo.
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "estado" text NOT NULL DEFAULT 'concluida';
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "saidas" jsonb;
ALTER TABLE "fluxo_execucoes" ADD COLUMN IF NOT EXISTS "ate_no" text;
