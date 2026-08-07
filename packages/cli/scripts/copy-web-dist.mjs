import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Empacota o build do editor visual dentro do próprio pacote da CLI, pra
// `gerador open` funcionar também a partir do pacote instalado via npm — sem
// isso, "web-dist" só existia como caminho relativo dentro do monorepo, e
// quem instalasse só a CLI (fora do repositório) nunca conseguia abrir o
// canvas.
const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEM = resolve(AQUI, "../../web/dist");
const DESTINO = resolve(AQUI, "../web-dist");

if (!existsSync(ORIGEM)) {
  console.warn(
    `[copy-web-dist] packages/web/dist não encontrado em ${ORIGEM} — pulei a cópia. ` +
      `"gerador open" vai cair no fallback de monorepo (ou falhar, se rodado fora dele). ` +
      `Rode "npm run build --workspace=packages/web" antes se quiser empacotar o editor visual.`
  );
  process.exit(0);
}

rmSync(DESTINO, { recursive: true, force: true });
cpSync(ORIGEM, DESTINO, { recursive: true });
console.log(`[copy-web-dist] copiado de ${ORIGEM} para ${DESTINO}.`);
