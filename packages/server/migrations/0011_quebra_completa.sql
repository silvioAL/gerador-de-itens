-- SPEC-31 Fase 1 — a tabela `quebras` guardava SEIS colunas, e o modo local
-- persistia nove. Os três que faltavam (respostas da esteira, contexto do
-- épico e anexos) eram descartados em silêncio no Zod da borda: quem rodava os
-- agentes no modo hospedado salvava a quebra e perdia o trabalho.
--
-- Descoberto ao escrever a porta `RepositorioDeQuebras`, antes de qualquer
-- adaptador existir — a suíte de contrato reprovaria o Postgres na primeira
-- execução. Defaults não-nulos para as linhas que já existem lerem igual às
-- novas, sem o cliente precisar tratar dois formatos.
ALTER TABLE quebras
  ADD COLUMN IF NOT EXISTS respostas_itens jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS demand_info text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS anexos_contexto jsonb NOT NULL DEFAULT '[]'::jsonb;
