import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_ESPECIFICACAO_PADRAO, type PerfisConfig, type Quebra } from "@gerador/engine";
import { caminhoDoModelo, carregarModeloChat, MODELO_CHAT, verificarStatus, type MotorChat } from "@gerador/llm";
import type { GbnfJsonSchema } from "node-llama-cpp";

const CAMPO_GLOBAL = "__global__";

/**
 * API local mínima que faz `packages/web` (o mesmo build do modo hospedado)
 * funcionar servida por `gerador open`, sem login e sem `packages/server`
 * (SPEC-17 — achado real: bundlar só os arquivos estáticos não bastava, o
 * app sempre travava em "Verificando sessão..." esperando um backend que não
 * existe no modo CLI). Sessão é sempre a mesma, fixa, sem conceito de time
 * (a decisão de simplificar auth fora do modelo CLI já estava registrada em
 * SPEC-17 antes desta rodada). Dados que hoje moram no Postgres do modo
 * hospedado viram arquivo local: `quebras/<id>.json` na raiz do projeto (uma
 * quebra por arquivo, mesmo formato que `gerador derive`/`implementar`
 * esperam como argumento — achado real: um arquivo fixo único fazia "Nova
 * quebra" + salvar sobrescrever a anterior sempre), `config/perfis-time.json`
 * (já existente, reaproveitado como está), e `config/campos-no.json` (novo —
 * mesma regra de merge global/por-time do modo hospedado, achado real: o
 * usuário queria configurar convenção de nomenclatura por essa tela mesmo
 * sem servidor nenhum).
 */

const SESSAO_LOCAL = { email: "local", timeIds: ["local"] };

// Achado real: sem isso, o usuário não tinha como saber, olhando o app, se
// `npm install -g gerador-de-itens@latest` de fato pegou a versão nova — a
// única forma era comparar a tag do GitHub com o que ele lembrava de ter
// instalado. `package.json` fica ao lado de `dist/cli.js` tanto no pacote
// publicado quanto no build local (mesmo layout que `open.ts` já assume pra
// achar `web-dist`), então ler daqui é a mesma versão que "npm view
// gerador-de-itens version" reportaria depois de instalada.
let versaoCli: string | undefined;
async function versaoDoPacote(): Promise<string | undefined> {
  if (versaoCli !== undefined) return versaoCli;
  const aqui = dirname(fileURLToPath(import.meta.url));
  // Dois layouts possíveis: bundlado (tsup junta tudo em dist/cli.js, um nível
  // acima de dist/ é a raiz do pacote) ou rodando direto de src/commands/ (dois
  // níveis acima) — mesma dualidade que DIST_WEB_BUNDLADO/DIST_WEB_MONOREPO em
  // open.ts já trata pro build web.
  for (const candidato of [resolve(aqui, "../package.json"), resolve(aqui, "../../package.json")]) {
    try {
      const pkg = JSON.parse(await readFile(candidato, "utf-8")) as { version?: string };
      if (pkg.version) {
        versaoCli = pkg.version;
        return versaoCli;
      }
    } catch {
      // tenta o próximo candidato
    }
  }
  return undefined;
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

// --- quebras/<id>.json — uma quebra por arquivo. Achado real: um único
// `quebra.json` fixo fazia "Nova quebra" + salvar sobrescrever a anterior
// sempre (não só "no mesmo dia" — todo segundo save perdia o primeiro). O
// cliente web já gera um id novo no primeiro POST e reusa via PUT no resto —
// só faltava o servidor local respeitar isso em vez de um id fixo "local".

async function listarQuebras(dirQuebras: string): Promise<{ id: string; arquivo: string }[]> {
  let nomes: string[];
  try {
    nomes = await readdir(dirQuebras);
  } catch {
    return [];
  }
  return nomes
    .filter((n) => n.endsWith(".json"))
    .map((n) => ({ id: n.slice(0, -".json".length), arquivo: resolve(dirQuebras, n) }));
}

async function comoQuebraSalva(id: string, arquivo: string) {
  const info = await stat(arquivo);
  const quebra = await lerJsonOpcional<Quebra>(arquivo);
  return {
    id,
    titulo: quebra?.titulo ?? null,
    time: quebra?.time ?? null,
    diagrama: quebra?.diagrama ?? { nodes: [], edges: [] },
    // Achado real: campo persistido no arquivo (JSON.stringify(quebra) grava
    // a quebra inteira) mas nunca devolvido aqui — GET /quebras/:id nunca
    // mostrava respostasItens salvo, mesmo já estando no disco (Fase 1, SPEC-23).
    respostasItens: quebra?.respostasItens ?? {},
    // Mesmo bug, achado de novo investigando a Fase 1b (SPEC-23): demandInfo
    // e anexosContexto sobreviviam no arquivo, mas nunca voltavam no GET.
    demandInfo: quebra?.demandInfo ?? "",
    anexosContexto: quebra?.anexosContexto ?? [],
    criadoEm: info.birthtime.toISOString(),
    atualizadoEm: info.mtime.toISOString(),
  };
}

async function tratarQuebras(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  const dirQuebras = resolve(dirProjeto, "quebras");

  if (metodo === "GET" && caminho === "/quebras") {
    const todas = await listarQuebras(dirQuebras);
    const salvas = await Promise.all(todas.map(({ id, arquivo }) => comoQuebraSalva(id, arquivo)));
    salvas.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    return enviarJson(
      res,
      200,
      salvas.map(({ id, titulo, time, criadoEm, atualizadoEm }) => ({ id, titulo, time, criadoEm, atualizadoEm }))
    );
  }

  const matchGet = metodo === "GET" && caminho.match(/^\/quebras\/([^/]+)$/);
  if (matchGet) {
    const id = decodeURIComponent(matchGet[1]);
    const arquivo = resolve(dirQuebras, `${id}.json`);
    if (!(await existeArquivo(arquivo))) return enviarJson(res, 404, { erro: "quebra não encontrada" });
    return enviarJson(res, 200, await comoQuebraSalva(id, arquivo));
  }

  if (metodo === "POST" && caminho === "/quebras") {
    const quebra = await lerCorpoJson<Quebra>(req);
    const id = randomUUID();
    await mkdir(dirQuebras, { recursive: true });
    const arquivo = resolve(dirQuebras, `${id}.json`);
    await writeFile(arquivo, JSON.stringify(quebra, null, 2), "utf-8");
    return enviarJson(res, 201, await comoQuebraSalva(id, arquivo));
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/quebras\/([^/]+)$/);
  if (matchPut) {
    const id = decodeURIComponent(matchPut[1]);
    const arquivo = resolve(dirQuebras, `${id}.json`);
    if (!(await existeArquivo(arquivo))) return enviarJson(res, 404, { erro: "quebra não encontrada" });
    const quebra = await lerCorpoJson<Quebra>(req);
    await writeFile(arquivo, JSON.stringify(quebra, null, 2), "utf-8");
    return enviarJson(res, 200, await comoQuebraSalva(id, arquivo));
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

// --- config/campos-no.json — campos por tipo de nó, global ou por time,
// mesmo modelo (e mesma regra de merge) que packages/server/src/routes/camposNo.ts
// já usa no modo hospedado: time sobrescreve global de mesma (tipoNo, key).

interface ItemSpecCampoLocal {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  options?: string[];
}

interface CampoNoLocal {
  id: string;
  timeId: string;
  tipoNo: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "lista";
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  permiteNA: boolean;
  ordem: number;
  /** Só quando `type === "lista"` — a forma de cada item. */
  itemSpec: ItemSpecCampoLocal[] | null;
}

async function lerCamposNo(dirProjeto: string): Promise<CampoNoLocal[]> {
  return (await lerJsonOpcional<CampoNoLocal[]>(resolve(dirProjeto, "config", "campos-no.json"))) ?? [];
}

async function salvarCamposNo(dirProjeto: string, campos: CampoNoLocal[]): Promise<void> {
  await mkdir(resolve(dirProjeto, "config"), { recursive: true });
  await writeFile(resolve(dirProjeto, "config", "campos-no.json"), JSON.stringify(campos, null, 2), "utf-8");
}

/** Efetivo: todo campo global + os do `timeId` pedido, time sobrescrevendo
 * global de mesma (tipoNo, key) — idêntico ao GET /campos-no do modo hospedado. */
function camposEfetivos(campos: CampoNoLocal[], timeId?: string): CampoNoLocal[] {
  const relevantes = campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
  const porChave = new Map<string, CampoNoLocal>();
  for (const c of [...relevantes].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
    porChave.set(`${c.tipoNo}::${c.key}`, c);
  }
  return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
}

async function tratarCamposNo(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, query: URLSearchParams, dirProjeto: string): Promise<void> {
  if (metodo === "GET" && caminho === "/campos-no") {
    const campos = await lerCamposNo(dirProjeto);
    return enviarJson(res, 200, camposEfetivos(campos, query.get("timeId") ?? undefined));
  }

  if (metodo === "POST" && caminho === "/campos-no") {
    const corpo = await lerCorpoJson<Partial<CampoNoLocal>>(req);
    if (!corpo.tipoNo || !corpo.key || !corpo.label || !corpo.type) {
      return enviarJson(res, 400, { erro: "tipoNo, key, label e type são obrigatórios" });
    }
    const campos = await lerCamposNo(dirProjeto);
    const timeId = corpo.timeId ?? CAMPO_GLOBAL;
    // Mesma key+tipoNo+timeId já existente vira upsert, não duplicata.
    const existente = campos.find((c) => c.timeId === timeId && c.tipoNo === corpo.tipoNo && c.key === corpo.key);
    const novo: CampoNoLocal = {
      id: existente?.id ?? randomUUID(),
      timeId,
      tipoNo: corpo.tipoNo,
      key: corpo.key,
      label: corpo.label,
      type: corpo.type,
      required: corpo.required ?? false,
      valorPadrao: corpo.valorPadrao ?? null,
      opcoes: corpo.opcoes ?? null,
      ajuda: corpo.ajuda ?? null,
      permiteNA: corpo.permiteNA ?? false,
      ordem: corpo.ordem ?? 0,
      itemSpec: corpo.itemSpec ?? null,
    };
    const restantes = campos.filter((c) => c.id !== novo.id);
    await salvarCamposNo(dirProjeto, [...restantes, novo]);
    return enviarJson(res, 201, novo);
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/campos-no\/([^/]+)$/);
  if (matchPut) {
    const id = decodeURIComponent(matchPut[1]);
    const campos = await lerCamposNo(dirProjeto);
    const alvo = campos.find((c) => c.id === id);
    if (!alvo) return enviarJson(res, 404, { erro: "campo não encontrado" });
    const corpo = await lerCorpoJson<Partial<CampoNoLocal>>(req);
    const atualizado: CampoNoLocal = { ...alvo, ...corpo, id: alvo.id, timeId: alvo.timeId, tipoNo: alvo.tipoNo, key: alvo.key };
    await salvarCamposNo(dirProjeto, campos.map((c) => (c.id === id ? atualizado : c)));
    return enviarJson(res, 200, atualizado);
  }

  const matchDelete = metodo === "DELETE" && caminho.match(/^\/campos-no\/([^/]+)$/);
  if (matchDelete) {
    const id = decodeURIComponent(matchDelete[1]);
    const campos = await lerCamposNo(dirProjeto);
    await salvarCamposNo(dirProjeto, campos.filter((c) => c.id !== id));
    res.writeHead(204);
    return res.end();
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- config/campos-aresta.json — campos por tipo de aresta (SPEC-21), mesmo
// modelo/merge de campos-no.json acima, sem type: "lista"/itemSpec (campo
// repetível numa conexão é caso hipotético que ninguém pediu ainda).

interface CampoArestaLocal {
  id: string;
  timeId: string;
  tipoAresta: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  ordem: number;
}

async function lerCamposAresta(dirProjeto: string): Promise<CampoArestaLocal[]> {
  return (await lerJsonOpcional<CampoArestaLocal[]>(resolve(dirProjeto, "config", "campos-aresta.json"))) ?? [];
}

async function salvarCamposAresta(dirProjeto: string, campos: CampoArestaLocal[]): Promise<void> {
  await mkdir(resolve(dirProjeto, "config"), { recursive: true });
  await writeFile(resolve(dirProjeto, "config", "campos-aresta.json"), JSON.stringify(campos, null, 2), "utf-8");
}

function camposArestaEfetivos(campos: CampoArestaLocal[], timeId?: string): CampoArestaLocal[] {
  const relevantes = campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
  const porChave = new Map<string, CampoArestaLocal>();
  for (const c of [...relevantes].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
    porChave.set(`${c.tipoAresta}::${c.key}`, c);
  }
  return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
}

async function tratarCamposAresta(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, query: URLSearchParams, dirProjeto: string): Promise<void> {
  if (metodo === "GET" && caminho === "/campos-aresta") {
    const campos = await lerCamposAresta(dirProjeto);
    return enviarJson(res, 200, camposArestaEfetivos(campos, query.get("timeId") ?? undefined));
  }

  if (metodo === "POST" && caminho === "/campos-aresta") {
    const corpo = await lerCorpoJson<Partial<CampoArestaLocal>>(req);
    if (!corpo.tipoAresta || !corpo.key || !corpo.label || !corpo.type) {
      return enviarJson(res, 400, { erro: "tipoAresta, key, label e type são obrigatórios" });
    }
    const campos = await lerCamposAresta(dirProjeto);
    const timeId = corpo.timeId ?? CAMPO_GLOBAL;
    const existente = campos.find((c) => c.timeId === timeId && c.tipoAresta === corpo.tipoAresta && c.key === corpo.key);
    const novo: CampoArestaLocal = {
      id: existente?.id ?? randomUUID(),
      timeId,
      tipoAresta: corpo.tipoAresta,
      key: corpo.key,
      label: corpo.label,
      type: corpo.type,
      required: corpo.required ?? false,
      valorPadrao: corpo.valorPadrao ?? null,
      opcoes: corpo.opcoes ?? null,
      ajuda: corpo.ajuda ?? null,
      ordem: corpo.ordem ?? 0,
    };
    const restantes = campos.filter((c) => c.id !== novo.id);
    await salvarCamposAresta(dirProjeto, [...restantes, novo]);
    return enviarJson(res, 201, novo);
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/campos-aresta\/([^/]+)$/);
  if (matchPut) {
    const id = decodeURIComponent(matchPut[1]);
    const campos = await lerCamposAresta(dirProjeto);
    const alvo = campos.find((c) => c.id === id);
    if (!alvo) return enviarJson(res, 404, { erro: "campo não encontrado" });
    const corpo = await lerCorpoJson<Partial<CampoArestaLocal>>(req);
    const atualizado: CampoArestaLocal = { ...alvo, ...corpo, id: alvo.id, timeId: alvo.timeId, tipoAresta: alvo.tipoAresta, key: alvo.key };
    await salvarCamposAresta(dirProjeto, campos.map((c) => (c.id === id ? atualizado : c)));
    return enviarJson(res, 200, atualizado);
  }

  const matchDelete = metodo === "DELETE" && caminho.match(/^\/campos-aresta\/([^/]+)$/);
  if (matchDelete) {
    const id = decodeURIComponent(matchDelete[1]);
    const campos = await lerCamposAresta(dirProjeto);
    await salvarCamposAresta(dirProjeto, campos.filter((c) => c.id !== id));
    res.writeHead(204);
    return res.end();
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

// --- GET/PUT /config/pipeline-agentes — SPEC-24 Fase E: se a esteira pausa
// pra confirmação manual campo a campo (`confirmacaoObrigatoria: true`,
// default — comportamento de hoje) ou avança sozinha até o fim aplicando
// direto (`false`, achado real do usuário: "pode avançar sozinho até o fim,
// ou ir parando conforme está hoje" — o mesmo protótipo de referência sempre
// aplicou direto, sem funil de aprovação). Mesmo arquivo que a Fase F
// (configurabilidade do pipeline — prompts/ordem/agentes contextuais, ainda
// não implementada) vai estender, não um arquivo novo por campo.
interface ConfigPipelineAgentesLocal {
  confirmacaoObrigatoria: boolean;
}
const CONFIG_PIPELINE_AGENTES_PADRAO: ConfigPipelineAgentesLocal = { confirmacaoObrigatoria: true };

async function tratarPipelineAgentes(req: IncomingMessage, res: ServerResponse, metodo: string, dirProjeto: string): Promise<void> {
  const arquivo = resolve(dirProjeto, "config", "pipeline-agentes.json");

  if (metodo === "GET") {
    const config = await lerJsonOpcional<ConfigPipelineAgentesLocal>(arquivo);
    return enviarJson(res, 200, config ?? CONFIG_PIPELINE_AGENTES_PADRAO);
  }

  if (metodo === "PUT") {
    const { confirmacaoObrigatoria } = await lerCorpoJson<{ confirmacaoObrigatoria: boolean }>(req);
    const config: ConfigPipelineAgentesLocal = { confirmacaoObrigatoria: !!confirmacaoObrigatoria };
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, JSON.stringify(config, null, 2), "utf-8");
    return enviarJson(res, 200, config);
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- POST /ia/sugerir — fluxo 3 (Fase 1, SPEC-23): sugestão de texto pra um
// placeholder "<- ✍️ especificar" do checklist técnico/volumetria ---

// Carrega o modelo de chat UMA VEZ por processo (lazy, no primeiro POST) —
// não por requisição, o que custaria segundos por sugestão. Sem cache de
// resposta entre chamadas diferentes: reiniciar `gerador open` descarrega o
// modelo, é o único "cache" que existe aqui (mesma decisão de `motor.ts`,
// que não guarda estado escondido — quem chama decide).
let motorChatSingleton: Promise<MotorChat> | undefined;
function obterMotorChat(): Promise<MotorChat> {
  motorChatSingleton ??= carregarModeloChat(caminhoDoModelo(MODELO_CHAT));
  return motorChatSingleton;
}

async function tratarIaSugerir(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const status = await verificarStatus();
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const { tech, rotulo, contextoNo, contextoEpico } = await lerCorpoJson<{
      tech: string;
      rotulo: string;
      contextoNo: string;
      contextoEpico?: string;
    }>(req);
    const prompt = [
      `Você ajuda a especificar um requisito técnico de refinamento de software.`,
      ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
      `Tecnologia: ${tech}`,
      `Requisito a especificar: "${rotulo}"`,
      `Contexto do(s) nó(s) de arquitetura envolvidos:`,
      contextoNo || "(sem contexto adicional)",
      ``,
      `Responda de forma curta, específica e em português, com uma decisão concreta pra esse requisito nesse contexto. Não repita o requisito, só a resposta.`,
    ].join("\n");

    const motor = await obterMotorChat();

    // Fase 1c (SPEC-23): texto livre (sem GBNF) — o schema de sugestão sempre
    // foi um único campo string (`valor`), então "estrutura" era decorativa;
    // streamar um JSON sendo montado mostraria pontuação aparecendo antes do
    // texto de verdade (`{`, `"`, `v`, `a`, `l`...). Resposta vira texto puro
    // em pedaços — `res.write()` várias vezes faz o Node fazer chunked
    // transfer sozinho, sem precisar setar o header à mão.
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await motor.completar(prompt, { onTexto: (pedaco) => res.write(pedaco) });
    res.end();
  } catch (erro) {
    // Achado real: sem este catch, uma falha no motor de IA (binário nativo
    // bloqueado pelo Windows Defender, modelo corrompido, etc.) virava
    // rejeição não tratada e derrubava o processo INTEIRO do `gerador open`
    // — não só essa requisição (open.ts chama tratarApiLocal sem try/catch
    // no request handler). Descarta o singleton pra tentar carregar de novo
    // na próxima chamada, sem precisar reiniciar o servidor.
    motorChatSingleton = undefined;
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida ao gerar sugestão.";
    // Achado real (Fase 1c): se o streaming já começou, `res.writeHead` já
    // rodou — não dá mais pra trocar o status code. Falha nessa janela é rara
    // (o modelo já carregou e estava respondendo); só encerra a conexão, o
    // cliente trata resposta incompleta como falha.
    if (res.headersSent) {
      res.end();
    } else {
      enviarJson(res, 500, { erro: `Não foi possível gerar a sugestão: ${mensagem}` });
    }
  }
}

// --- POST /ia/pipeline/:papel — SPEC-24 Fase B: esteira de agentes (PO →
// Arquiteto → Especialista técnico → QA). Substitui `/ia/sugerir-item`
// (Fase 1d-ii, removida — aquele mecanismo gerava a ficha inteira do item
// numa chamada só; a esteira processa por PAPEL, não por item inteiro de
// uma vez). Mesmo mecanismo de base (schema JSON dinâmico a partir de
// `placeholders[]`,
// GBNF via `completarComSchema`) — só o PREÂMBULO do prompt muda por papel,
// focando o que aquele papel deve produzir. Quem decide QUAIS placeholders
// mandar pra cada papel é o cliente (web, `useEsteiraDeAgentes` — cada papel
// só recebe os placeholders da sua própria seção: `_historiaUsuario`/
// `_criteriosAceite` pro PO, `_contrato*` pro Arquiteto, checklist técnico/
// volumetria pro Especialista, `_regrasTeste`/`_cenarioFeature` pro QA).
// `/ia/sugerir` (streaming, um placeholder, botão manual "✨ Sugerir")
// continua intocado. Papel desconhecido cai no preâmbulo genérico (nunca
// 400 — o pipeline é configurável, SPEC-24 Fase F vai permitir papel custom).
const PREAMBULO_PADRAO_POR_PAPEL: Record<string, string> = {
  po: [
    `Você é o Product Owner num time de desenvolvimento de software.`,
    `Escreva a história de usuário e os critérios de aceite deste item.`,
  ].join(" "),
  arquiteto: [
    `Você é o Arquiteto de software responsável pelo contrato técnico deste item.`,
    `Descreva o nó de arquitetura vinculado, o request, o response, os erros`,
    `possíveis e as dependências — decisões concretas, nunca genéricas.`,
  ].join(" "),
  especialista: [
    `Você é o Especialista técnico responsável pelos requisitos de refinamento`,
    `deste item, pra tech e contexto informados — cada requisito precisa de`,
    `uma decisão concreta pra esse caso específico.`,
  ].join(" "),
  qa: [
    `Você é o QA responsável pelas regras de teste e cenários Gherkin deste item.`,
    `Escreva regras de teste automatizado e um cenário Gherkin adicional`,
    `específico pro contexto — não repita cenários óbvios de erro genérico.`,
  ].join(" "),
};
const PREAMBULO_GENERICO =
  `Você ajuda a especificar tecnicamente um item de trabalho de software.`;

async function tratarIaPipeline(req: IncomingMessage, res: ServerResponse, papel: string): Promise<void> {
  try {
    const status = await verificarStatus();
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const { atividadeRotulo, contextoNo, contextoEpico, placeholders } = await lerCorpoJson<{
      atividadeRotulo: string;
      contextoNo: string;
      contextoEpico?: string;
      placeholders: { chave: string; tech: string; rotulo: string }[];
    }>(req);

    if (!Array.isArray(placeholders) || placeholders.length === 0) {
      enviarJson(res, 400, { erro: "nenhum placeholder informado pra gerar" });
      return;
    }

    const schema: GbnfJsonSchema = {
      type: "object",
      properties: Object.fromEntries(placeholders.map((p) => [p.chave, { type: "string" }])),
      required: placeholders.map((p) => p.chave),
    };

    const listaRequisitos = placeholders
      .map((p) => `- (chave "${p.chave}") ${p.tech ? `[${p.tech}] ` : ""}${p.rotulo}`)
      .join("\n");

    const prompt = [
      PREAMBULO_PADRAO_POR_PAPEL[papel] ?? PREAMBULO_GENERICO,
      ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
      `Item: "${atividadeRotulo}"`,
      `Contexto do(s) nó(s) de arquitetura envolvidos:`,
      contextoNo || "(sem contexto adicional)",
      ``,
      `Responda TODOS os campos abaixo, em português, cada um com uma decisão`,
      `concreta pra esse item nesse contexto — nunca genérica, nunca repetindo`,
      `o requisito.`,
      ``,
      `Campos a responder (responda pela chave entre aspas):`,
      listaRequisitos,
    ].join("\n");

    const motor = await obterMotorChat();
    const resultado = await motor.completarComSchema(prompt, schema);
    enviarJson(res, 200, resultado);
  } catch (erro) {
    motorChatSingleton = undefined;
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida ao gerar a ficha.";
    enviarJson(res, 500, { erro: `Não foi possível gerar a ficha: ${mensagem}` });
  }
}

/**
 * Roteador da API local — devolve `true` se tratou a requisição (`gerador
 * open` não deve cair pro fallback de arquivo estático nesse caso), `false`
 * pra deixar o resto (`/`, `/assets/*`, `/config/*.json`) seguir como já era.
 */
export async function tratarApiLocal(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<boolean> {
  const metodo = req.method ?? "GET";
  const [caminho, queryString] = (req.url ?? "/").split("?");
  const query = new URLSearchParams(queryString ?? "");

  if (caminho === "/auth/modo" && metodo === "GET") {
    enviarJson(res, 200, { modo: "local" });
    return true;
  }
  if (caminho === "/versao" && metodo === "GET") {
    enviarJson(res, 200, { versao: await versaoDoPacote() });
    return true;
  }
  if (caminho === "/ia/status" && metodo === "GET") {
    enviarJson(res, 200, await verificarStatus());
    return true;
  }
  if (caminho === "/ia/sugerir" && metodo === "POST") {
    await tratarIaSugerir(req, res);
    return true;
  }
  if (caminho === "/config/pipeline-agentes" && (metodo === "GET" || metodo === "PUT")) {
    await tratarPipelineAgentes(req, res, metodo, dirProjeto);
    return true;
  }
  const matchPipeline = metodo === "POST" && caminho.match(/^\/ia\/pipeline\/([^/]+)$/);
  if (matchPipeline) {
    await tratarIaPipeline(req, res, decodeURIComponent(matchPipeline[1]));
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
  if (caminho.startsWith("/campos-no")) {
    await tratarCamposNo(req, res, metodo, caminho, query, dirProjeto);
    return true;
  }
  if (caminho.startsWith("/campos-aresta")) {
    await tratarCamposAresta(req, res, metodo, caminho, query, dirProjeto);
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
