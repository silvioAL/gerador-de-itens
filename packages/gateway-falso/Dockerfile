# SPEC-74 fatia B — o dublê de IA como serviço da stack.
#
# Trivial de propósito: o gateway falso é `node:http` puro, sem UMA dependência
# de runtime. Por isso não há `npm ci` aqui, não há `node_modules` na imagem
# final e não há lockfile a manter em dia — só o TypeScript no estágio de
# build, e `node dist/bin.js` no fim.
#
# Compare com `packages/server/Dockerfile` (que precisa do CLI do Infisical, de
# migrações e de meia dúzia de pacotes): a diferença de tamanho é a razão de
# este serviço poder subir no `docker compose up` normal, enquanto o `ollama`
# fica atrás de `--profile ia`.
FROM node:20-alpine AS build
WORKDIR /repo

# O layout do repositório é preservado porque `tsconfig.json` estende
# `../../tsconfig.base.json` — achatar as pastas aqui exigiria um segundo
# tsconfig só para o container, e dois tsconfig divergem na primeira mudança.
COPY tsconfig.base.json ./
COPY packages/gateway-falso ./packages/gateway-falso

# O compilador e os tipos do Node instalados na RAIZ do build, e não dentro do
# pacote — isto foi medido, não escolhido por gosto:
#
# - `npm install` DENTRO do pacote lê o `package.json` dele, encontra
#   `@gerador/aplicacao` e `@gerador/llm` nas devDependencies (usadas só pelo
#   teste que confere o dublê contra os pedidos de verdade), procura-as no
#   registro público e morre em 404. Copiar o monorepo inteiro para resolver os
#   workspaces seria pagar muito caro por um compilador.
# - `npm install -g` resolve o `tsc`, mas não o `@types/node`: a busca por tipos
#   sobe pelos `node_modules` a partir do projeto, e nunca chega no global.
#
# Instalar em `/repo` resolve os dois: é ancestral do pacote, então a resolução
# normal de módulos o alcança.
RUN npm install --no-save --ignore-scripts typescript@5.6.3 @types/node@22.9.0

WORKDIR /repo/packages/gateway-falso
RUN /repo/node_modules/.bin/tsc -p tsconfig.build.json

FROM node:20-alpine
WORKDIR /app
# `type: module` vem no package.json, e sem ele o node lê `dist/bin.js` como
# CommonJS e morre no primeiro `import`.
COPY --from=build /repo/packages/gateway-falso/package.json ./package.json
COPY --from=build /repo/packages/gateway-falso/dist ./dist

ENV GATEWAY_FALSO_HOST=0.0.0.0
EXPOSE 4123
CMD ["node", "dist/bin.js"]
