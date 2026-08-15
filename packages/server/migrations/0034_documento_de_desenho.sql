-- SPEC-58 — o documento de desenho: o que uma PESSOA escreve nele, e em que
-- estado ele está.
--
-- Por que duas colunas e não um campo dentro do markdown com marcadores: o
-- markdown é regerado inteiro a cada geração, e um marcador que alguém apague
-- editando o texto levaria junto o que a pessoa escreveu. A regra 3 da SPEC-58
-- ("a máquina nunca sobrescreve o que a pessoa escreveu") não sobrevive se o
-- que a pessoa escreveu mora dentro do que a máquina reescreve.
--
-- `documento_status` fica na quebra e não numa tabela de documento porque não
-- há versionamento nesta SPEC: uma quebra, um documento, um estado. Versão é
-- problema real e é o PRÓXIMO — resolvê-lo junto faria os dois saírem pela
-- metade.
ALTER TABLE "quebras" ADD COLUMN "documento_escrito" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "quebras" ADD COLUMN "documento_status" text;
