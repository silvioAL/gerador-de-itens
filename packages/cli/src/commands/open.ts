import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// dist/cli.js -> ../../web/dist (packages/cli/dist -> packages/cli -> packages -> packages/web/dist)
const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST_WEB = resolve(AQUI, "../../web/dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function ehDiretorio(caminho: string): Promise<boolean> {
  return stat(caminho).then(
    (info) => info.isDirectory(),
    () => false
  );
}

export async function open(args: string[]): Promise<void> {
  const idxPorta = args.indexOf("--port");
  const porta = idxPorta >= 0 ? Number(args[idxPorta + 1]) : 4321;

  if (!(await ehDiretorio(DIST_WEB))) {
    throw new Error(
      `build do app não encontrado em ${DIST_WEB} — rode "npm run build --workspace=packages/web" primeiro.`
    );
  }

  // config/ vem sempre do diretório onde `gerador open` foi chamado (process.cwd()),
  // nunca do repositório desta ferramenta — é o que faz o mesmo bundle estático
  // servir qualquer projeto, cada um com seu próprio diagrama.json/app.json.
  const DIR_CONFIG = resolve("config");

  const servidor = createServer((req, res) => {
    void (async () => {
      const caminhoLimpo = (req.url ?? "/").split("?")[0];

      if (caminhoLimpo.startsWith("/config/") && caminhoLimpo.endsWith(".json")) {
        try {
          const conteudo = await readFile(join(DIR_CONFIG, caminhoLimpo.slice("/config/".length)));
          // no-cache: config/ muda a cada edição no projeto alvo, sem reiniciar `gerador
          // open` — sem isso, um browser que já tem a aba aberta pode continuar mostrando
          // config velha até um hard refresh (mesmo bug já visto na imagem Docker).
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(conteudo);
        } catch {
          res.writeHead(404);
          res.end("não encontrado");
        }
        return;
      }

      let caminhoArquivo = join(DIST_WEB, caminhoLimpo === "/" ? "index.html" : caminhoLimpo);

      if (await ehDiretorio(caminhoArquivo)) {
        caminhoArquivo = join(caminhoArquivo, "index.html");
      }

      try {
        const conteudo = await readFile(caminhoArquivo);
        res.writeHead(200, { "Content-Type": MIME[extname(caminhoArquivo)] ?? "application/octet-stream" });
        res.end(conteudo);
      } catch {
        // SPA sem essa rota estática — cai para index.html.
        try {
          const conteudo = await readFile(join(DIST_WEB, "index.html"));
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(conteudo);
        } catch {
          res.writeHead(404);
          res.end("não encontrado");
        }
      }
    })();
  });

  await new Promise<void>((resolvePromise) => servidor.listen(porta, resolvePromise));
  console.log(`Gerador de Itens em http://localhost:${porta}`);
}
