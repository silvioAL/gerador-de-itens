-- SPEC-80 fatia A — a quebra deixa de produzir UM artefato.
--
-- `documento_escrito` guardava as seções escritas do documento de solução:
-- `{ "visaoGeral": "...", "tradeOffs": "...", "riscos": "..." }`.
--
-- Passa a guardar um conjunto de seções POR artefato:
-- `{ "documento": { "visaoGeral": "..." }, "spec": { "origem": "..." } }`.
--
-- ## Por que a coluna manteve o nome
--
-- Renomear coluna custa uma migração, quebra toda query escrita à mão e não
-- compra nada: o drizzle já separava nome de campo de nome de coluna aqui. O
-- campo TypeScript virou `artefatosEscritos`; a coluna continua
-- `documento_escrito`, e o comentário no `schema.ts` diz isso em voz alta.
--
-- ## Por que conversão no lugar, e não coluna nova
--
-- Coluna nova criaria DUAS casas para a mesma coisa — as seções do documento de
-- um lado, as dos outros artefatos do outro — e alguém teria que lembrar de
-- olhar as duas. É o §263, e o §310 já pagou o preço de campo que mora em dois
-- lugares. A SPEC-71 fez exatamente esta conversão em `anexos_contexto` na
-- migração 0037, e é o molde.
--
-- ## A condição do UPDATE
--
-- Só converte o que TEM forma antiga: objeto não vazio que ainda não tem a
-- chave `documento`. Quebra com `{}` fica `{}` (a conversão não inventa
-- artefato para quem nunca escreveu nada), e rodar duas vezes não faz mal —
-- a segunda passada não encontra nada para converter.
UPDATE "quebras"
SET "documento_escrito" = jsonb_build_object('documento', "documento_escrito")
WHERE "documento_escrito" IS NOT NULL
  AND jsonb_typeof("documento_escrito") = 'object'
  AND "documento_escrito" <> '{}'::jsonb
  AND NOT ("documento_escrito" ? 'documento');
