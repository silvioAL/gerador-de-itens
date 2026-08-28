-- SPEC-71 — o que se salva tem que voltar.
--
-- Medido contra o servidor real antes de escrever esta migração: uma quebra
-- gravada com todo campo do tipo preenchido voltava sem SEIS deles, em
-- silêncio, e um sétimo derrubava o POST inteiro com 400.
--
--   PERDEU  volumetria
--   PERDEU  cenariosDeLentidao (inteiro)
--   PERDEU  leiturasDispensadas
--   PERDEU  necessidades[].limiteMs
--   PERDEU  decisoes[].ensaioIds
--   PERDEU  excecoes[].contradicao
--   400     anexosContexto  ("Expected string, received object")
--
-- Três dessas perdas eram por falta de COLUNA, e são estas aqui. As outras
-- quatro eram o Zod da borda descartando chave desconhecida em silêncio — a
-- mesma história que a migração 0011 já conta no comentário desta tabela.
-- Corrigiu-se o caso; não se corrigiu a classe. Agora corrige-se a classe: o
-- teste da fatia C deixa a suíte vermelha quando um campo novo do tipo `Quebra`
-- não chega à borda.
--
-- `jsonb`, e não tabela própria, pelo mesmo raciocínio anotado em cada uma das
-- seis coleções irmãs: pertencem à quebra e não há consulta transversal que
-- justifique. A SPEC-69 §5 não pede nenhuma.
ALTER TABLE "quebras" ADD COLUMN "cenarios_de_lentidao" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "quebras" ADD COLUMN "leituras_dispensadas" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Objeto e não lista, e por isso é a primeira coluna de coleção que aceita
-- NULL: "esta demanda não declarou volume" é afirmação diferente de "declarou
-- uma lista vazia", e um default apagaria a diferença. Nada no motor inventa
-- volume — sem declaração, a Lei de Little simplesmente não se faz.
ALTER TABLE "quebras" ADD COLUMN "volumetria" jsonb;

-- SPEC-71 §4 — a pergunta que a SPEC deixou em aberto ("não medi"), respondida
-- por evidência: o modelo diz `{ nome, conteudo }[]` e a coluna dizia
-- `string[]`. O lado a mudar é o servidor, porque o nome do arquivo é
-- informação que a tela mostra e que a pessoa usa para remover o anexo certo.
--
-- A conversão dos dados existentes vai junto: linha gravada antes disto tem uma
-- lista de strings, e reabri-la depois desta migração devolveria texto onde a
-- tela espera objeto. O nome de um anexo antigo não existe em lugar nenhum —
-- `anexo-N.txt` é o mesmo rótulo que `usePersistencia` já inventava na leitura,
-- então quem já usava não vê diferença.
UPDATE "quebras"
SET "anexos_contexto" = (
  SELECT COALESCE(
    jsonb_agg(
      -- `WITH ORDINALITY` já conta a partir de 1, que é o mesmo número que o
      -- rótulo inventado na leitura usava.
      jsonb_build_object('nome', 'anexo-' || idx || '.txt', 'conteudo', valor #>> '{}')
      ORDER BY idx
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("anexos_contexto") WITH ORDINALITY AS t(valor, idx)
)
WHERE jsonb_typeof("anexos_contexto") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("anexos_contexto") AS e(valor)
    WHERE jsonb_typeof(e.valor) = 'string'
  );
