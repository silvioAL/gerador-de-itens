#!/bin/sh
# AUTH_MODE=dev (local/E2E, ver docker-compose.yml) nunca precisa do vault —
# só existe segredo real de verdade a buscar quando INFISICAL_CLIENT_ID está
# setado (produção, via docker-compose.secrets.yml — SPEC-12). Sem essa
# checagem, todo `docker compose up` local passaria a depender do Infisical
# estar de pé, quebrando o fluxo de dev/E2E que nunca precisou disso.
if [ -n "$INFISICAL_CLIENT_ID" ]; then
  # `infisical run` sozinho não aceita --client-id/--client-secret — precisa
  # de um INFISICAL_TOKEN pronto no ambiente primeiro (achado real: sem isso
  # ele cai num fluxo de login interativo via browser, que trava um container
  # sem TTY). `infisical login --method=universal-auth` troca client-id/secret
  # por esse token de curta duração.
  export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --domain="$INFISICAL_API_URL" --silent --plain)
  exec infisical run --domain "$INFISICAL_API_URL" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" -- node dist/server.cjs
else
  exec node dist/server.cjs
fi
