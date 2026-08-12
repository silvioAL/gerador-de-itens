-- §184 — a especificação de solução gerada fica SALVA na quebra (com todo o
-- material do momento da geração), e a data marca a versão.
ALTER TABLE "quebras" ADD COLUMN "especificacao" text;--> statement-breakpoint
ALTER TABLE "quebras" ADD COLUMN "especificacao_gerada_em" timestamptz;
