-- Quebras salvas viravam "time · data" numa lista sem nome nenhum pra
-- reconhecer depois (achado real: usuário não consegue achar quebra antiga
-- numa lista assim). `titulo` é opcional no banco (linhas antigas não têm) —
-- a obrigatoriedade é decisão de UI (packages/web exige antes de salvar),
-- mesmo tratamento que `time` já tem.
ALTER TABLE "quebras" ADD COLUMN IF NOT EXISTS "titulo" text;
