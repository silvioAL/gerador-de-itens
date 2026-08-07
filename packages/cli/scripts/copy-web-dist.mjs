import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Empacota o editor visual dentro do próprio pacote da CLI, pra `gerador
// open` funcionar a partir do pacote instalado via npm, sem clonar o
// repositório. Builda a própria variante aqui (não reaproveita
// packages/web/dist do build genérico) porque o Vite resolve VITE_API_URL em
// build time: o build genérico aponta pra http://localhost:4000 (server do
// modo hospedado); esta variante usa "" (mesma origem) — as chamadas de API
// do app vão pro próprio servidor que `gerador open` sobe (packages/cli/src/
// commands/openApiLocal.ts), não pra um backend externo.
//
// Usa a API JS do Vite direto (não spawna "vite build" como subprocesso) —
// evita a diferença de resolução de .cmd no Windows (EINVAL ao spawnar
// "npx.cmd" sem shell; "shell: true" com array de args é um padrão que o
// próprio Node desaconselha). "vite" é devDependency de packages/web e fica
// hoisted no node_modules raiz do workspace, resolvível daqui também.
const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_WEB = resolve(AQUI, "../../web");
const ORIGEM = resolve(DIR_WEB, "dist-cli-local");
const DESTINO = resolve(AQUI, "../web-dist");

if (!existsSync(DIR_WEB)) {
  console.warn(
    `[copy-web-dist] packages/web não encontrado em ${DIR_WEB} — pulei o build. ` +
      `"gerador open" vai cair no fallback de monorepo (ou falhar, se rodado fora dele).`
  );
  process.exit(0);
}

process.env.VITE_API_URL = "";
const { build } = await import("vite");
await build({ root: DIR_WEB, build: { outDir: "dist-cli-local", emptyOutDir: true } });

rmSync(DESTINO, { recursive: true, force: true });
cpSync(ORIGEM, DESTINO, { recursive: true });
console.log(`[copy-web-dist] build local copiado de ${ORIGEM} para ${DESTINO}.`);
