import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tratarApiLocal } from "./openApiLocal.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
// Empacotado dentro do próprio pacote (packages/cli/web-dist, copiado no build
// por scripts/copy-web-dist.mjs) — é o caminho real de quem instalou via npm.
const DIST_WEB_BUNDLADO = resolve(AQUI, "../web-dist");
// Fallback pro build direto do monorepo (packages/web/dist), útil rodando a
// CLI de dentro do repositório antes/sem o passo de empacotamento.
const DIST_WEB_MONOREPO = resolve(AQUI, "../../web/dist");
const DIST_WEB = existsSync(DIST_WEB_BUNDLADO) ? DIST_WEB_BUNDLADO : DIST_WEB_MONOREPO;

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
    const dicaMonorepo = existsSync(resolve(AQUI, "../../web"))
      ? ' Rodando de dentro do repositório clonado: "npm run build --workspace=packages/web".'
      : ' Atualize o pacote: "npm install -g gerador-de-itens@latest" (versões antes do empacotamento do editor visual não têm isso).';
    throw new Error(`build do app não encontrado em ${DIST_WEB}.${dicaMonorepo}`);
  }

  // config/ vem sempre do diretório onde `gerador open` foi chamado (process.cwd()),
  // nunca do repositório desta ferramenta — é o que faz o mesmo bundle estático
  // servir qualquer projeto, cada um com seu próprio diagrama.json/app.json.
  const DIR_CONFIG = resolve("config");

  const servidor = createServer((req, res) => {
    void (async () => {
      const caminhoLimpo = (req.url ?? "/").split("?")[0];

      // API local (sessão fixa, sem login, sem servidor — SPEC-17): faz o
      // mesmo build do modo hospedado funcionar sem packages/server nenhum.
      if (await tratarApiLocal(req, res, process.cwd())) return;

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

      // index.html nunca é cacheado pelo browser (achado real: os assets em
      // /assets/*.js|css têm hash de conteúdo no nome — cache normal é seguro
      // e desejável ali — mas index.html referencia esses nomes; se o browser
      // guardar um index.html velho depois de "npm install -g ...@latest" +
      // reiniciar `gerador open`, ele aponta pra um JS com hash que não existe
      // mais no disco, e a tela fica em branco sem erro visível pro usuário).
      const semCache = extname(caminhoArquivo) === ".html";

      try {
        const conteudo = await readFile(caminhoArquivo);
        res.writeHead(200, {
          "Content-Type": MIME[extname(caminhoArquivo)] ?? "application/octet-stream",
          ...(semCache ? { "Cache-Control": "no-cache" } : {}),
        });
        res.end(conteudo);
      } catch {
        // SPA sem essa rota estática — cai para index.html.
        try {
          const conteudo = await readFile(join(DIST_WEB, "index.html"));
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
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
