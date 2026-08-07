import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TEMPLATE_ESPECIFICACAO_PADRAO, type PerfisConfig, type Quebra } from "@gerador/engine";
import { slugify } from "./exportVault.js";

/**
 * API local mínima que faz `packages/web` (o mesmo build do modo hospedado)
 * funcionar servida por `gerador open`, sem login e sem `packages/server`
 * (SPEC-17 — achado real: bundlar só os arquivos estáticos não bastava, o
 * app sempre travava em "Verificando sessão..." esperando um backend que não
 * existe no modo CLI). Sessão é sempre a mesma, fixa, sem conceito de time
 * (a decisão de simplificar auth fora do modelo CLI já estava registrada em
 * SPEC-17 antes desta rodada). Dados que hoje moram no Postgres do modo
 * hospedado viram arquivo local: `quebra.json` na raiz do projeto (o mesmo
 * arquivo que `gerador derive`/`implementar` já esperam — fecha o ciclo
 * entre editar no canvas e rodar via terminal), `config/perfis-time.json` e
 * `config/referencias/*.json` (já existentes, reaproveitados como estão).
 */

const SESSAO_LOCAL = { email: "local", timeIds: ["local"] };

interface ReferenciaLocal {
  titulo: string;
  racional: string;
  designPatterns?: string[];
  codigoRelacionado?: string[];
  linkExterno?: string | null;
  criadoEm?: string;
}

function enviarJson(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(corpo));
}

async function lerCorpoJson<T>(req: IncomingMessage): Promise<T> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  const texto = Buffer.concat(partes).toString("utf-8");
  return texto ? (JSON.parse(texto) as T) : ({} as T);
}

async function lerJsonOpcional<T>(caminho: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(caminho, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

async function existeArquivo(caminho: string): Promise<boolean> {
  return stat(caminho).then(
    (info) => info.isFile(),
    () => false
  );
}

// --- quebra.json — a mesma quebra única que gerador derive/implementar consomem ---

async function tratarQuebras(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  const arquivoQuebra = resolve(dirProjeto, "quebra.json");

  if (metodo === "GET" && caminho === "/quebras") {
    if (!(await existeArquivo(arquivoQuebra))) return enviarJson(res, 200, []);
    const info = await stat(arquivoQuebra);
    const quebra = await lerJsonOpcional<Quebra>(arquivoQuebra);
    return enviarJson(res, 200, [{ id: "local", time: quebra?.time ?? null, atualizadoEm: info.mtime.toISOString() }]);
  }

  if (metodo === "GET" && caminho === "/quebras/local") {
    if (!(await existeArquivo(arquivoQuebra))) return enviarJson(res, 404, { erro: "quebra não encontrada" });
    const info = await stat(arquivoQuebra);
    const quebra = await lerJsonOpcional<Quebra>(arquivoQuebra);
    return enviarJson(res, 200, {
      id: "local",
      time: quebra?.time ?? null,
      diagrama: quebra?.diagrama ?? { nodes: [], edges: [] },
      criadoEm: info.birthtime.toISOString(),
      atualizadoEm: info.mtime.toISOString(),
    });
  }

  if ((metodo === "POST" && caminho === "/quebras") || (metodo === "PUT" && caminho === "/quebras/local")) {
    const quebra = await lerCorpoJson<Quebra>(req);
    await writeFile(arquivoQuebra, JSON.stringify(quebra, null, 2), "utf-8");
    const info = await stat(arquivoQuebra);
    return enviarJson(res, metodo === "POST" ? 201 : 200, {
      id: "local",
      time: quebra.time ?? null,
      diagrama: quebra.diagrama,
      criadoEm: info.birthtime.toISOString(),
      atualizadoEm: info.mtime.toISOString(),
    });
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- config/perfis-time.json — mesmo arquivo que já existe hoje ---

async function tratarPerfisTime(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  const arquivo = resolve(dirProjeto, "config", "perfis-time.json");

  if (metodo === "GET" && caminho === "/perfis-time") {
    return enviarJson(res, 200, (await lerJsonOpcional<PerfisConfig>(arquivo)) ?? {});
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/perfis-time\/([^/]+)$/);
  if (matchPut) {
    const timeId = decodeURIComponent(matchPut[1]);
    const { tipoNo, valores } = await lerCorpoJson<{ tipoNo: string; valores: Record<string, unknown> }>(req);
    const perfis = ((await lerJsonOpcional<PerfisConfig>(arquivo)) ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
    perfis[timeId] ??= {};
    perfis[timeId][tipoNo] = { ...perfis[timeId][tipoNo], ...valores };
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, JSON.stringify(perfis, null, 2), "utf-8");
    return enviarJson(res, 200, perfis[timeId][tipoNo]);
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- config/referencias/*.json — mesmo formato que gerador init/export-vault usam ---

async function listarReferencias(dirReferencias: string): Promise<{ id: string; arquivo: string; dados: ReferenciaLocal }[]> {
  let nomes: string[];
  try {
    nomes = await readdir(dirReferencias);
  } catch {
    return [];
  }
  const resultado = [];
  for (const nome of nomes) {
    if (!nome.endsWith(".json")) continue;
    const arquivo = resolve(dirReferencias, nome);
    const dados = await lerJsonOpcional<ReferenciaLocal>(arquivo);
    if (dados) resultado.push({ id: nome.slice(0, -".json".length), arquivo, dados });
  }
  return resultado;
}

function comoReferenciaSalva(id: string, dados: ReferenciaLocal) {
  return {
    id,
    timeId: null,
    titulo: dados.titulo,
    racional: dados.racional,
    designPatterns: dados.designPatterns ?? [],
    codigoRelacionado: dados.codigoRelacionado ?? [],
    linkExterno: dados.linkExterno ?? null,
    criadoEm: dados.criadoEm ?? new Date().toISOString(),
  };
}

async function tratarReferencias(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  const dirReferencias = resolve(dirProjeto, "config", "referencias");

  if (metodo === "GET" && caminho === "/referencias") {
    const todas = await listarReferencias(dirReferencias);
    return enviarJson(res, 200, todas.map((r) => comoReferenciaSalva(r.id, r.dados)));
  }

  if (metodo === "POST" && caminho === "/referencias") {
    const corpo = await lerCorpoJson<{ titulo: string; racional: string; designPatterns?: string[]; codigoRelacionado?: string[] }>(req);
    const dados: ReferenciaLocal = { ...corpo, linkExterno: null, criadoEm: new Date().toISOString() };
    const id = slugify(corpo.titulo);
    await mkdir(dirReferencias, { recursive: true });
    await writeFile(resolve(dirReferencias, `${id}.json`), JSON.stringify(dados, null, 2), "utf-8");
    return enviarJson(res, 201, comoReferenciaSalva(id, dados));
  }

  const matchPatch = metodo === "PATCH" && caminho.match(/^\/referencias\/([^/]+)$/);
  if (matchPatch) {
    const id = decodeURIComponent(matchPatch[1]);
    const { linkExterno } = await lerCorpoJson<{ linkExterno: string }>(req);
    const todas = await listarReferencias(dirReferencias);
    const alvo = todas.find((r) => r.id === id);
    if (!alvo) return enviarJson(res, 404, { erro: "referência não encontrada" });
    const dados: ReferenciaLocal = { ...alvo.dados, linkExterno };
    await writeFile(alvo.arquivo, JSON.stringify(dados, null, 2), "utf-8");
    return enviarJson(res, 200, comoReferenciaSalva(id, dados));
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- especificação de entrega: template customizável opcional, default do engine ---

async function tratarEspecificacaoTemplate(req: IncomingMessage, res: ServerResponse, metodo: string, dirProjeto: string): Promise<void> {
  const arquivo = resolve(dirProjeto, "config", "especificacao-template.md");

  if (metodo === "GET") {
    const conteudo = await readFile(arquivo, "utf-8").catch(() => TEMPLATE_ESPECIFICACAO_PADRAO);
    return enviarJson(res, 200, { id: "local", timeId: "local", conteudo, atualizadoEm: new Date().toISOString() });
  }

  if (metodo === "PUT") {
    const { conteudo } = await lerCorpoJson<{ conteudo: string }>(req);
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, conteudo, "utf-8");
    return enviarJson(res, 200, { id: "local", timeId: "local", conteudo, atualizadoEm: new Date().toISOString() });
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

/**
 * Roteador da API local — devolve `true` se tratou a requisição (`gerador
 * open` não deve cair pro fallback de arquivo estático nesse caso), `false`
 * pra deixar o resto (`/`, `/assets/*`, `/config/*.json`) seguir como já era.
 */
export async function tratarApiLocal(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<boolean> {
  const metodo = req.method ?? "GET";
  const caminho = (req.url ?? "/").split("?")[0];

  if (caminho === "/auth/modo" && metodo === "GET") {
    enviarJson(res, 200, { modo: "local" });
    return true;
  }
  if (caminho === "/auth/me" && metodo === "GET") {
    enviarJson(res, 200, SESSAO_LOCAL);
    return true;
  }
  if (caminho === "/auth/logout" && metodo === "POST") {
    enviarJson(res, 200, { ok: true });
    return true;
  }
  if (caminho.startsWith("/quebras")) {
    await tratarQuebras(req, res, metodo, caminho, dirProjeto);
    return true;
  }
  if (caminho.startsWith("/perfis-time")) {
    await tratarPerfisTime(req, res, metodo, caminho, dirProjeto);
    return true;
  }
  if (caminho.startsWith("/referencias")) {
    await tratarReferencias(req, res, metodo, caminho, dirProjeto);
    return true;
  }
  if (caminho === "/campos-no" && metodo === "GET") {
    // Sem conceito de campo customizado por time no modo local — o spec de
    // cada tipo de nó é só o que config/diagrama.json já define (edição é
    // direto no arquivo, não por uma tela — SPEC-17).
    enviarJson(res, 200, []);
    return true;
  }
  if (caminho.startsWith("/campos-no")) {
    enviarJson(res, 501, { erro: "campos customizados por time não são suportados no modo local — edite config/diagrama.json diretamente." });
    return true;
  }
  if (caminho === "/especificacao-template") {
    await tratarEspecificacaoTemplate(req, res, metodo, dirProjeto);
    return true;
  }
  if (caminho.startsWith("/times") || caminho.startsWith("/convites")) {
    enviarJson(res, 501, { erro: "gerenciamento de time não é aplicável no modo local — não há conceito de múltiplos times/convites aqui." });
    return true;
  }

  return false;
}
