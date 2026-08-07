-- Novo tipo de campo "lista" (repetível) em campos_no.type — achado real: um
-- projeto Camunda de verdade quase não gerava nó via import-graphify, e o
-- editor de "Endpoints" (method/path/request/response por endpoint) que o
-- protótipo original tinha nunca foi portado pro app. item_spec guarda a
-- forma de cada item de uma "lista" (nulo pros outros tipos de campo).
ALTER TABLE "campos_no" ADD COLUMN "item_spec" jsonb;
