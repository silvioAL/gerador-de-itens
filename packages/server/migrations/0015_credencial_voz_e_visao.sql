-- SPEC-30 (voz e imagem) — dois campos que a credencial passou a carregar.
--
-- ACHADO REAL: adicionei os dois ao tipo `CredencialIa` e ao formulário, a
-- suíte de unidade passou inteira, e o teste de NAVEGADOR falhou — o botão de
-- anexar imagem não aparecia. O adaptador Postgres tem colunas explícitas (não
-- é um `jsonb` genérico), então campo novo no tipo não vira campo novo na
-- tabela: o valor era gravado no ar e lido como `undefined`.
--
-- `base_url_transcricao`: o Ollama não transcreve, então a voz vai pro serviço
-- `whisper` do mesmo compose — endereço diferente do chat.
-- `visao`: marcado à mão, porque nenhum preset conhece o modelo que a empresa
-- batizou. Ausente = não vê (errar para "não" é a escolha segura).
ALTER TABLE "credenciais_ia" ADD COLUMN IF NOT EXISTS "base_url_transcricao" text;
ALTER TABLE "credenciais_ia" ADD COLUMN IF NOT EXISTS "visao" boolean NOT NULL DEFAULT false;
