FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm install

COPY . .
RUN npm run build --workspace=packages/server

FROM node:20-slim AS runtime
WORKDIR /app
# CLI do Infisical (SPEC-12) — instalação via apt é a via oficial mais estável
# (o instalador Alpine tem incompatibilidades conhecidas de libc — troca de
# base de node:20-alpine pra node:20-slim só por causa disso). Só é chamada
# quando INFISICAL_CLIENT_ID está setado (docker-entrypoint.sh abaixo); em
# AUTH_MODE=dev fica instalada mas nunca invocada.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash && \
    apt-get install -y --no-install-recommends infisical && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/server/migrations ./migrations
COPY packages/server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
CMD ["./docker-entrypoint.sh"]
