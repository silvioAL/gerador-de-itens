import { createWriteStream, existsSync } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { caminhoDoModelo, garantirDiretorioDeModelos } from "./cache.js";
import { urlDownload, type ModeloRegistrado } from "./modelos.js";
import { buscarComProxy, explicarFalhaDeRede } from "./rede.js";

export interface ProgressoDownload {
  modelo: ModeloRegistrado;
  bytesBaixados: number;
  /** `undefined` quando o servidor não manda `Content-Length` — acontece,
   * não é motivo pra falhar o download, só pra não dar pra calcular %. */
  bytesTotais: number | undefined;
}

export interface OpcoesDownload {
  onProgresso?: (progresso: ProgressoDownload) => void;
  /** Só testes — injeta um `fetch` fake em vez de bater na rede de verdade. */
  fetchImpl?: typeof fetch;
  baseDir?: string;
}

/**
 * Baixa um modelo pro cache local, com retomada simples via arquivo `.part`:
 * escreve nesse nome temporário e só renomeia pro nome final quando o
 * download termina por completo — assim `verificarStatus()` nunca enxerga um
 * download pela metade como "instalado" (achado que motivou o `.part`: sem
 * isso, uma queda de rede no meio deixaria um arquivo com o nome certo mas
 * conteúdo incompleto, e a checagem de "existe = instalado" mentiria).
 *
 * Verificação de integridade nesta v1 é só por tamanho (`Content-Length`
 * batendo com o que foi escrito) — não por hash. Registrado como possível
 * evolução futura (SPEC-23), não bloqueante pro Fase 0.
 */
export async function baixarModelo(modelo: ModeloRegistrado, opcoes: OpcoesDownload = {}): Promise<string> {
  const fetchReal = opcoes.fetchImpl ?? fetch;
  await garantirDiretorioDeModelos(opcoes.baseDir);
  const caminhoFinal = caminhoDoModelo(modelo, opcoes.baseDir);
  const caminhoParcial = `${caminhoFinal}.part`;

  if (existsSync(caminhoFinal)) return caminhoFinal;

  const url = urlDownload(modelo);

  // ACHADO que custou uma investigacao inteira: o `fetch` do Node **ignora
  // proxy**, enquanto o `npm` honra. Numa rede corporativa isso faz o npm
  // funcionar e este download morrer com um `fetch failed` de tres palavras —
  // e a leitura facil ("a rede bloqueia o Hugging Face") manda consertar a
  // coisa errada. O dispatcher abaixo e o que faltava.
  let resposta: Response;
  try {
    resposta = await (opcoes.fetchImpl ? fetchReal(url) : buscarComProxy(url));
  } catch (erro) {
    // `fetch failed` nao diz nada; a causa real mora em `error.cause`.
    throw explicarFalhaDeRede(erro, url);
  }

  if (!resposta.ok || !resposta.body) {
    throw new Error(`Falha ao baixar ${modelo.nomeArquivo}: HTTP ${resposta.status}`);
  }

  const cabecalhoTamanho = resposta.headers.get("content-length");
  const bytesTotais = cabecalhoTamanho ? Number(cabecalhoTamanho) : undefined;
  let bytesBaixados = 0;

  const origem = Readable.fromWeb(resposta.body as import("node:stream/web").ReadableStream);
  origem.on("data", (pedaco: Buffer) => {
    bytesBaixados += pedaco.length;
    opcoes.onProgresso?.({ modelo, bytesBaixados, bytesTotais });
  });

  try {
    await pipeline(origem, createWriteStream(caminhoParcial));
  } catch (erro) {
    await rm(caminhoParcial, { force: true });
    throw erro;
  }

  if (bytesTotais !== undefined) {
    const tamanhoEscrito = (await stat(caminhoParcial)).size;
    if (tamanhoEscrito !== bytesTotais) {
      await rm(caminhoParcial, { force: true });
      throw new Error(
        `Download de ${modelo.nomeArquivo} incompleto: esperado ${bytesTotais} bytes, recebido ${tamanhoEscrito}.`
      );
    }
  }

  await rename(caminhoParcial, caminhoFinal);
  return caminhoFinal;
}
