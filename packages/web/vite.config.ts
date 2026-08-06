import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/**
 * Serve config/*.json do diretório atual (não deste pacote) em /config/ — mesmo
 * contrato que `gerador open` e o volume do Docker seguem em produção, pra dev
 * local (`npm run dev`) não precisar de um mock à parte nem copiar config pra
 * dentro de packages/web/public. Sem isso, o app só teria como carregar config
 * via import estático — o que travaria o bundle nos exemplos deste repo pra
 * sempre, mesmo servindo outro projeto via `gerador open`.
 */
function servirConfigEmDev(): Plugin {
  return {
    name: "servir-config-runtime",
    configureServer(servidor) {
      servidor.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/config/") || !url.endsWith(".json")) {
          next();
          return;
        }
        const nomeArquivo = url.slice("/config/".length);
        // repoRoot, não process.cwd(): "npm run dev" roda com cwd em
        // packages/web (padrão de script de workspace do npm) — e além disso
        // "dev" é sempre pra desenvolver esta ferramenta contra o próprio
        // config de exemplo, nunca contra outro projeto (isso é trabalho do
        // `gerador open` da CLI, que lê do cwd de onde foi chamado).
        //
        // Este repositório só tem config/*.example.json na raiz (são
        // templates, nunca um "projeto real" com config/*.json de verdade) —
        // por isso, só em dev, cai pro nome com .example se o nome puro não existir.
        const candidatos = [
          path.resolve(repoRoot, "config", nomeArquivo),
          path.resolve(repoRoot, "config", nomeArquivo.replace(/\.json$/, ".example.json")),
        ];
        let conteudo: string | undefined;
        for (const candidato of candidatos) {
          try {
            conteudo = await readFile(candidato, "utf-8");
            break;
          } catch {
            // tenta o próximo candidato
          }
        }
        if (conteudo === undefined) {
          res.statusCode = 404;
          res.end("não encontrado");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(conteudo);
      });
    },
  };
}

// @gerador/engine é um workspace TS-fonte (sem build próprio) — não deve ser
// pré-empacotado como se fosse um pacote publicado, senão o esbuild de dep
// optimization tenta tratá-lo como JS já compilado.
export default defineConfig({
  plugins: [react(), servirConfigEmDev()],
  optimizeDeps: {
    exclude: ["@gerador/engine"],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
