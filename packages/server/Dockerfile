FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# Os workspaces que o server realmente usa. `packages/cli` fica de fora de
# propósito: ele declara `node-llama-cpp`, e um `npm install` de raiz instala
# a árvore inteira do lockfile — o postinstall tentaria COMPILAR llama.cpp
# neste Alpine (sem git, sem make) e o build morre antes de qualquer código
# rodar. Foi exatamente o que aconteceu, com a fronteira de imports já verde:
# o binário não entrava pelo `import`, entrava pelo `package.json`.
COPY packages/engine/package.json packages/engine/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/aplicacao/package.json packages/aplicacao/package.json
COPY packages/server/package.json packages/server/package.json
# `--ignore-scripts`: o lockfile da raiz descreve a árvore INTEIRA do monorepo,
# e `--workspace` filtra o que é instalado mas não impede o npm de materializar
# `node-llama-cpp` (dependência real de `packages/cli`) e rodar o postinstall
# dele — que tenta COMPILAR llama.cpp neste Alpine, sem git e sem make.
#
# Nenhuma dependência do server precisa de script de instalação (fastify,
# drizzle, pg, zod, openid-client são JS puro), e o estágio de runtime copia
# só `dist/` e `migrations/` — módulo nativo nenhum chega lá. Pular os scripts
# é preciso aqui, não uma gambiarra: o que se está pulando é a compilação de um
# binário que esta imagem, por decisão da SPEC-31 Fase 4, nunca vai executar.
RUN npm install --ignore-scripts --workspace=packages/server --include-workspace-root

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
