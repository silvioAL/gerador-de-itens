-- SPEC-77 — a volumetria que é do PRODUTO, não da chamada.
--
-- Existiam duas volumetrias, e nenhuma era do produto: a do checklist é do
-- ITEM ("que número este item precisa cumprir"), e a da SPEC-70 é da DEMANDA
-- ("quanto esta entrega atende"). As duas morrem quando a demanda termina.
--
-- "Este produto atende 2 milhões de consultas por dia" não muda a cada
-- demanda. Muda uma vez por trimestre — e quando muda, muda o julgamento de
-- todas as demandas em aberto. É o tipo de fato que o contexto do produto
-- (SPEC-53) existe para guardar: o que é perene.
--
-- Colunas NOMEADAS e não um jsonb, seguindo o comentário desta tabela: as
-- seções do produto são fixas e escolhidas, e nomeá-las é o que deixa tela,
-- prompt e documento falarem da mesma coisa sem combinar chave de JSON.
--
-- Todas anuláveis, e isso é uma afirmação, não descuido: nem todo produto tem
-- esse número, e cobrar de todos ensinaria a ignorar a cor (§230 — a mesma
-- razão pela qual a SPEC §6.3 recusou tratar produto sem volume como lacuna).
ALTER TABLE "produtos" ADD COLUMN "volumetria_quantidade" integer;
ALTER TABLE "produtos" ADD COLUMN "volumetria_por" text;

-- "no pico, N vezes isto". Conhecimento de negócio, declarado por quem sabe —
-- nunca estimado a partir da média, que é o que a SPEC §4 recusa em voz alta.
--
-- Ele NÃO entra na conta do motor: o `fatorDeVolume` do ensaio continua sendo
-- quem responde "e se o volume for N×?", porque aquilo é uma pergunta
-- hipotética que alguém faz de propósito. Este é um fato que o produto declara.
ALTER TABLE "produtos" ADD COLUMN "volumetria_pico_de" integer;

-- Quando o número foi declarado.
--
-- Volume ENVELHECE SOZINHO: uma regra de refinamento continua válida até
-- alguém mudá-la, mas um volume declarado há um ano provavelmente está errado
-- hoje, e nada avisava. Um número desatualizado alimentando a Lei de Little
-- produz saturação falsa — ou, pior, silêncio falso. Sem esta data, o ciclo
-- não tem como perguntar "isto ainda vale?".
ALTER TABLE "produtos" ADD COLUMN "volumetria_declarada_em" timestamptz;
