-- SPEC-60 fatia B — o RASTRO das execuções da esteira.
--
-- O mapa do sistema (§258) mostra os papéis com avatar e estado: ativo,
-- desligado, sem-credencial. Faltava o estado que interessa depois do primeiro
-- dia — "falhou da última vez" — e faltava porque o produto não guardava NADA
-- sobre execução. O comentário do `mapaDoSistema` dizia isso em voz alta:
-- inventar o estado a partir de nada seria pior que não tê-lo.
--
-- Tabela, e não coluna em jsonb como necessidades/decisões/percursos: aquelas
-- PERTENCEM a uma quebra e são lidas junto com ela. Isto é uma série temporal
-- que cresce sozinha, é consultada por papel atravessando todas as demandas, e
-- é podada. Nada disso cabe num campo de outra linha.
--
-- O que NÃO está aqui é a régua da fatia: sem prompt, sem resposta, sem token,
-- sem custo. Prompt e resposta carregam o contexto do produto e da demanda —
-- guardá-los cria um problema de privacidade que acender um avatar não precisa
-- ter. O que se guarda responde à pergunta que alguém realmente faz: este papel
-- rodou? deu certo? quando? demorou quanto?
CREATE TABLE IF NOT EXISTS "execucoes_ia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- O rótulo que a rota já usava no log: `ia/pipeline/refinador`, `ia/sugerir`.
  "rotulo" text NOT NULL,
  -- Preenchido só quando a chamada É de um papel da esteira. As outras chamadas
  -- ficam registradas (o funil é um só), mas não acendem avatar nenhum.
  "papel" text,
  "ok" boolean NOT NULL,
  "erro" text,
  "duracao_ms" integer NOT NULL,
  "email" text,
  "em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A poda varre por `em`, e a leitura do mapa busca a última por papel.
CREATE INDEX IF NOT EXISTS "execucoes_ia_em_idx" ON "execucoes_ia" ("em" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execucoes_ia_papel_idx" ON "execucoes_ia" ("papel", "em" DESC);
