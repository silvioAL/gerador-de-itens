FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/engine/package.json packages/engine/package.json
# #296 — o web passou a depender de `@gerador/aplicacao` (preâmbulos dos papéis
# e a anatomia do prompt). Sem o package.json dele aqui, o `npm install` abaixo
# não resolve o workspace, cai no registry e acaba puxando `node-llama-cpp`,
# que exige git no container e derruba o build inteiro.
COPY packages/aplicacao/package.json packages/aplicacao/package.json
COPY packages/web/package.json packages/web/package.json
# `--ignore-scripts`: este estágio só compila um frontend estático. O lock do
# monorepo alcança `node-llama-cpp`, cujo postinstall tenta compilar llama.cpp e
# exige git no container — binário nativo que a imagem do web nunca usa.
RUN npm install --ignore-scripts

COPY . .
# Vite resolve import.meta.env.VITE_API_URL em build time, não em runtime
# (diferente de config/*.json — ver loadConfig.ts) — produção (SPEC-15) passa
# --build-arg VITE_API_URL=/api pra rotear pela mesma origem via Caddy; o
# default preserva o comportamento de dev/E2E de quem não passa o build-arg.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=packages/web

# O app carrega config/ via fetch em runtime (não bundlado) — precisa de
# /config/*.json servido junto do estático. Este repositório só tem os
# templates *.example.json na raiz (nunca um "projeto real"), então o nome
# puro é criado aqui, no build da imagem; um projeto de verdade rodando
# `gerador open` já tem config/diagrama.json de verdade e não passa por isso.
RUN mkdir -p packages/web/dist/config && \
    cp config/diagrama.example.json packages/web/dist/config/diagrama.json && \
    cp config/app.example.json packages/web/dist/config/app.json && \
    cp config/regras.example.json packages/web/dist/config/regras.json && \
    cp config/perfis-time.example.json packages/web/dist/config/perfis-time.json && \
    cp -r config/cenarios packages/web/dist/config/cenarios

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
