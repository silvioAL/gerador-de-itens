import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_ESPECIFICACAO_PADRAO, type PerfisConfig, type Quebra } from "@gerador/engine";
import { MODELOS_CHAT, criarProvedorPorId, verificarStatus, type ProvedorIa } from "@gerador/llm";
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
type GrupoFichaLocal = "po" | "arquiteto" | "especialista" | "qa";
const GRUPOS_FICHA: GrupoFichaLocal[] = ["po", "arquiteto", "especialista", "qa"];

interface PapelConfiguradoLocal {
  id: string;
  nome: string;
  descricao?: string;
  grupo: GrupoFichaLocal;
  preambulo?: string;
  ativo: boolean;
  contextos: string[];
}

interface ConfigPipelineAgentesLocal {
  confirmacaoObrigatoria: boolean;
  papeis?: PapelConfiguradoLocal[];
}

/** O pipeline de fábrica (SPEC-24 Fase F) — mesmo shape/conteúdo do
 * `PAPEIS_PADRAO` do web (`api/client.ts`): a fonte da UI é a config servida
 * daqui, então os dois lados precisam concordar no default. */
const PAPEIS_PADRAO_LOCAL: PapelConfiguradoLocal[] = [
  { id: "po", nome: "PO", descricao: "Escreve a história e os critérios de aceite", grupo: "po", ativo: true, contextos: [] },
  { id: "arquiteto", nome: "Arquiteto", descricao: "Amarra o item ao nó e escreve o contrato", grupo: "arquiteto", ativo: true, contextos: [] },
  { id: "especialista", nome: "Especialista técnico", descricao: "Aplica a tabela de regras do contexto", grupo: "especialista", ativo: true, contextos: [] },
  { id: "qa", nome: "QA", descricao: "Deriva as regras de teste e escreve os cenários", grupo: "qa", ativo: true, contextos: [] },
];
const CONFIG_PIPELINE_AGENTES_PADRAO: Required<ConfigPipelineAgentesLocal> = {
  confirmacaoObrigatoria: true,
  papeis: PAPEIS_PADRAO_LOCAL,
};

/** Coage a lista de papéis vinda do PUT (ou de um arquivo editado à mão) pra
 * um shape sempre válido — entrada inválida degrada campo a campo, nunca
 * derruba a config inteira: id vazio descarta o papel, grupo desconhecido
 * cai em "especialista", nome vazio cai no id. */
function sanearPapeis(entrada: unknown): PapelConfiguradoLocal[] | undefined {
  if (!Array.isArray(entrada)) return undefined;
  const papeis: PapelConfiguradoLocal[] = [];
  for (const bruto of entrada as Partial<PapelConfiguradoLocal>[]) {
    const id = typeof bruto?.id === "string" ? bruto.id.trim() : "";
    if (!id || papeis.some((p) => p.id === id)) continue;
    const grupo = GRUPOS_FICHA.includes(bruto.grupo as GrupoFichaLocal) ? (bruto.grupo as GrupoFichaLocal) : "especialista";
    papeis.push({
      id,
      nome: typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim() : id,
      ...(typeof bruto.descricao === "string" && bruto.descricao.trim() ? { descricao: bruto.descricao.trim() } : {}),
      grupo,
      ...(typeof bruto.preambulo === "string" && bruto.preambulo.trim() ? { preambulo: bruto.preambulo.trim() } : {}),
      ativo: bruto.ativo !== false,
      contextos: Array.isArray(bruto.contextos) ? bruto.contextos.filter((c): c is string => typeof c === "string" && c.trim() !== "") : [],
    });
  }
  return papeis.length > 0 ? papeis : undefined;
}

async function lerConfigPipelineAgentes(dirProjeto: string): Promise<Required<ConfigPipelineAgentesLocal>> {
  const arquivo = resolve(dirProjeto, "config", "pipeline-agentes.json");
  const config = await lerJsonOpcional<ConfigPipelineAgentesLocal>(arquivo);
  if (!config) return CONFIG_PIPELINE_AGENTES_PADRAO;
  return {
    confirmacaoObrigatoria: config.confirmacaoObrigatoria !== false,
    // Config antiga (só o toggle, pré-Fase F) ou papéis todos inválidos:
    // pipeline de fábrica — nunca uma esteira vazia por acidente.
    papeis: sanearPapeis(config.papeis) ?? PAPEIS_PADRAO_LOCAL,
  };
}

async function tratarPipelineAgentes(req: IncomingMessage, res: ServerResponse, metodo: string, dirProjeto: string): Promise<void> {
  const arquivo = resolve(dirProjeto, "config", "pipeline-agentes.json");

  if (metodo === "GET") {
    return enviarJson(res, 200, await lerConfigPipelineAgentes(dirProjeto));
  }

  if (metodo === "PUT") {
    const corpo = await lerCorpoJson<ConfigPipelineAgentesLocal>(req);
    const config: Required<ConfigPipelineAgentesLocal> = {
      confirmacaoObrigatoria: !!corpo.confirmacaoObrigatoria,
      papeis: sanearPapeis(corpo.papeis) ?? PAPEIS_PADRAO_LOCAL,
    };
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, JSON.stringify(config, null, 2), "utf-8");
    return enviarJson(res, 200, config);
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- POST /ia/sugerir — fluxo 3 (Fase 1, SPEC-23): sugestão de texto pra um
// placeholder "<- ✍️ especificar" do checklist técnico/volumetria ---

// --- config/ia.json — qual provedor/modelo a IA usa (SPEC-25 Fase 0) ---

interface ConfigIaLocal {
  provedorPadrao: string;
}
const CONFIG_IA_PADRAO: ConfigIaLocal = { provedorPadrao: MODELOS_CHAT[0].id };

async function lerConfigIa(dirProjeto: string): Promise<ConfigIaLocal> {
  const config = await lerJsonOpcional<Partial<ConfigIaLocal>>(resolve(dirProjeto, "config", "ia.json"));
  const id = typeof config?.provedorPadrao === "string" ? config.provedorPadrao : undefined;
  return { provedorPadrao: id ?? CONFIG_IA_PADRAO.provedorPadrao };
}

async function tratarConfigIa(req: IncomingMessage, res: ServerResponse, metodo: string, dirProjeto: string): Promise<void> {
  const arquivo = resolve(dirProjeto, "config", "ia.json");
  if (metodo === "GET") {
    return enviarJson(res, 200, await lerConfigIa(dirProjeto));
  }
  if (metodo === "PUT") {
    const corpo = await lerCorpoJson<Partial<ConfigIaLocal>>(req);
    // Só aceita id de provedor conhecido — id inventado deixaria a esteira
    // silenciosamente no modelo padrão sem o usuário entender por quê.
    const conhecido = MODELOS_CHAT.some((m) => m.id === corpo.provedorPadrao);
    if (!conhecido) {
      return enviarJson(res, 400, { erro: `provedor desconhecido: ${String(corpo.provedorPadrao)}` });
    }
    const config: ConfigIaLocal = { provedorPadrao: corpo.provedorPadrao as string };
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, JSON.stringify(config, null, 2), "utf-8");
    // Troca de modelo derruba o provedor carregado — o próximo pedido sobe o
    // novo. Descartar aqui (e não só trocar a referência) libera os GB do
    // modelo antigo da memória em vez de deixar os dois carregados.
    void descartarProvedor();
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
// que não guarda estado escondido — quem chama decide). Desde a Fase 0 o
// singleton guarda TAMBÉM qual provedor foi carregado: trocar o modelo na
// config precisa recarregar, não reaproveitar o antigo.
let provedorSingleton: { id: string; provedor: Promise<ProvedorIa> } | undefined;

async function obterProvedor(dirProjeto: string): Promise<ProvedorIa> {
  const { provedorPadrao } = await lerConfigIa(dirProjeto);
  if (provedorSingleton?.id !== provedorPadrao) {
    void descartarProvedor();
    provedorSingleton = { id: provedorPadrao, provedor: criarProvedorPorId(provedorPadrao) };
  }
  return provedorSingleton.provedor;
}

async function descartarProvedor(): Promise<void> {
  const anterior = provedorSingleton;
  provedorSingleton = undefined;
  if (!anterior) return;
  // Falha ao descartar (modelo que nem chegou a carregar) não pode derrubar
  // a requisição que pediu a troca.
  await anterior.provedor.then((p) => p.descartar()).catch(() => undefined);
}

async function tratarIaSugerir(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
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

    const provedor = await obterProvedor(dirProjeto);

    // Fase 1c (SPEC-23): texto livre (sem GBNF) — o schema de sugestão sempre
    // foi um único campo string (`valor`), então "estrutura" era decorativa;
    // streamar um JSON sendo montado mostraria pontuação aparecendo antes do
    // texto de verdade (`{`, `"`, `v`, `a`, `l`...). Resposta vira texto puro
    // em pedaços — `res.write()` várias vezes faz o Node fazer chunked
    // transfer sozinho, sem precisar setar o header à mão.
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await provedor.completar(prompt, { onTexto: (pedaco) => res.write(pedaco) });
    res.end();
  } catch (erro) {
    // Achado real: sem este catch, uma falha no motor de IA (binário nativo
    // bloqueado pelo Windows Defender, modelo corrompido, etc.) virava
    // rejeição não tratada e derrubava o processo INTEIRO do `gerador open`
    // — não só essa requisição (open.ts chama tratarApiLocal sem try/catch
    // no request handler). Descarta o singleton pra tentar carregar de novo
    // na próxima chamada, sem precisar reiniciar o servidor.
    void descartarProvedor();
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

// --- POST /ia/sugerir-config — SPEC-23 Fluxo 2: configurar com apoio de IA.
// Pedido do usuário: "poder ajustar as configurações com apoio de IA". A
// diferença pro `/ia/sugerir` (texto livre, um campo) é que aqui a saída É um
// OBJETO de configuração — precisa sair no schema exato que o formulário já
// sabe editar, senão não dá pra pré-preencher.
//
// Decisão que evita a armadilha do JOURNEY §41 (a skill que virou ferramenta
// paralela): a IA NÃO grava configuração. Ela devolve o objeto, a UI preenche
// o formulário que já existe, e o usuário salva pelo caminho normal — mesma
// rota, mesma validação, mesmo arquivo. Sugestão é rascunho, nunca escrita.
//
// Os alvos ficam numa TABELA declarativa: adicionar um novo (ex.: regra de
// checklist na Fase 5) é uma entrada aqui, sem tocar no roteador nem na UI
// genérica do botão.
interface AlvoSugestaoConfig {
  /** O que a IA está escrevendo — entra no prompt em primeira linha. */
  descricao: string;
  schema: GbnfJsonSchema;
  /** Regras de preenchimento específicas do alvo (formato de chave, limites
   * de vocabulário) — o que um modelo pequeno erra se não for dito. */
  regras: string[];
}

const TIPOS_CAMPO = ["text", "textarea", "number", "boolean", "select", "lista"] as const;

const ALVOS_SUGESTAO_CONFIG: Record<string, AlvoSugestaoConfig> = {
  "campo-no": {
    descricao: "um campo de formulário de um TIPO DE NÓ do diagrama de arquitetura",
    schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { enum: [...TIPOS_CAMPO] },
        ajuda: { type: "string" },
        opcoes: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
        permiteNA: { type: "boolean" },
      },
      required: ["key", "label", "type", "ajuda", "opcoes", "required", "permiteNA"],
    },
    regras: [
      `"key" em camelCase, sem espaços nem acentos — é identificador, não texto de tela.`,
      `"label" é o texto que aparece pro usuário, em português.`,
      `"opcoes" só faz sentido com type "select"; nos outros, devolva lista vazia.`,
      `"ajuda" é uma frase curta explicando o que preencher, não a repetição do label.`,
    ],
  },
  "campo-aresta": {
    descricao: "um campo de formulário de um TIPO DE CONEXÃO entre nós do diagrama",
    schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { enum: [...TIPOS_CAMPO] },
        ajuda: { type: "string" },
        opcoes: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
        permiteNA: { type: "boolean" },
      },
      required: ["key", "label", "type", "ajuda", "opcoes", "required", "permiteNA"],
    },
    regras: [
      `"key" em camelCase, sem espaços nem acentos.`,
      `O campo descreve a CONEXÃO (contrato, timeout, autenticação, retry), não os nós das pontas.`,
      `"opcoes" só faz sentido com type "select"; nos outros, devolva lista vazia.`,
    ],
  },
  papel: {
    descricao: "um PAPEL (agente) da esteira que especifica os itens de trabalho",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        nome: { type: "string" },
        descricao: { type: "string" },
        preambulo: { type: "string" },
        contextos: { type: "array", items: { type: "string" } },
      },
      required: ["id", "nome", "descricao", "preambulo", "contextos"],
    },
    regras: [
      `"id" em minúsculas, sem espaços nem acentos (ex.: "seguranca").`,
      `"nome" é o título curto que aparece na esteira; "descricao" cabe em uma linha.`,
      `"preambulo" é a INSTRUÇÃO que esse agente recebe: diga o papel, o formato`,
      `esperado e a profundidade (quantos itens, o que cobrir) — é o que separa`,
      `uma resposta útil de uma resposta de duas linhas.`,
      `"contextos" limita em quais itens o papel atua; lista vazia = atua em todos.`,
    ],
  },
};

async function tratarIaSugerirConfig(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const { alvo, instrucao, contexto } = await lerCorpoJson<{
      alvo: string;
      instrucao: string;
      /** Onde a sugestão vai morar (tipo de nó, tipo de aresta, techs do time)
       * — sem isso o modelo escreve campo genérico, que é o que ninguém quer. */
      contexto?: string;
    }>(req);

    const definicao = ALVOS_SUGESTAO_CONFIG[alvo];
    // Alvo desconhecido é 400 de propósito (ao contrário de papel na esteira,
    // que cai no genérico): aqui o schema É o contrato com o formulário — sem
    // ele a resposta não teria onde ser preenchida.
    if (!definicao) {
      enviarJson(res, 400, {
        erro: `alvo desconhecido: "${alvo}" (conhecidos: ${Object.keys(ALVOS_SUGESTAO_CONFIG).join(", ")})`,
      });
      return;
    }
    if (!instrucao?.trim()) {
      enviarJson(res, 400, { erro: "instrucao vazia — descreva o que a IA deve propor" });
      return;
    }

    const prompt = [
      `Você ajuda a configurar uma ferramenta de refinamento de itens de trabalho de software.`,
      `Escreva ${definicao.descricao}.`,
      ``,
      `Pedido do usuário: ${instrucao.trim()}`,
      ...(contexto?.trim() ? [``, `Onde essa configuração vai valer:`, contexto.trim()] : []),
      ``,
      `Regras:`,
      ...definicao.regras.map((r) => `- ${r}`),
      `- Responda em português, com decisões concretas pro caso descrito — nunca genéricas.`,
    ].join("\n");

    const provedor = await obterProvedor(dirProjeto);
    // Mesmo contrato de `/ia/pipeline/:papel`: texto cru do JSON restrito por
    // grammar, streamado. A UI mostra o progresso e faz o parse no fim.
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await provedor.completarEstruturado(prompt, definicao.schema, { onTexto: (pedaco) => res.write(pedaco) });
    res.end();
  } catch (erro) {
    void descartarProvedor();
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida ao sugerir configuração.";
    console.error(`[ia/sugerir-config] falhou:`, mensagem);
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
// Preâmbulos padrão com FORMATO e PROFUNDIDADE explícitos (achado real do
// usuário: "as respostas do PO têm 2-3 linhas, muito distante da necessidade
// real — ~3-7 critérios de aceite"). Um modelo local pequeno responde o
// mínimo quando o prompt não prescreve estrutura; estes são o piso — cada
// papel pode ter o preâmbulo sobrescrito na config (Fase F).
const PREAMBULO_PADRAO_POR_PAPEL: Record<string, string> = {
  po: [
    `Você é o Product Owner num time de desenvolvimento de software.`,
    `Pra história de usuário: escreva no formato "Como <persona>, quero <capacidade>, para <benefício>",`,
    `específica pra ESTE item e este contexto — nunca genérica.`,
    `Pros critérios de aceite: escreva uma lista NUMERADA de 3 a 7 critérios, um por linha,`,
    `cada um objetivo e verificável. Cubra o caminho feliz, pelo menos um caso de erro/exceção`,
    `e pelo menos um limite ou regra de negócio do contexto (use os números e restrições`,
    `do épico quando existirem — latências, prazos, limites, regulações).`,
  ].join(" "),
  arquiteto: [
    `Você é o Arquiteto de software responsável pelo contrato técnico deste item.`,
    `Descreva o nó de arquitetura vinculado, o request (campos com tipos), o response`,
    `(campos com tipos), os erros possíveis (código + motivo + comportamento esperado, um por linha)`,
    `e as dependências nomeadas — decisões concretas, nunca genéricas.`,
  ].join(" "),
  especialista: [
    `Você é o Especialista técnico responsável pelos requisitos de refinamento`,
    `deste item, pra tech e contexto informados. Cada requisito precisa de uma`,
    `decisão concreta pra esse caso específico: a escolha, o valor/configuração`,
    `exata e o porquê em 1-2 frases.`,
  ].join(" "),
  qa: [
    `Você é o QA responsável pelas regras de teste e cenários Gherkin deste item.`,
    `Pras regras de teste: lista NUMERADA de 3 a 6 regras de teste automatizado, uma por linha,`,
    `cobrindo o contrato, os erros e os limites definidos pelos papéis anteriores.`,
    `Pro cenário: um cenário Gherkin completo (Dado/Quando/Então) específico do contexto`,
    `— não repita cenários óbvios de erro genérico.`,
  ].join(" "),
};
const PREAMBULO_GENERICO =
  `Você ajuda a especificar tecnicamente um item de trabalho de software.`;

/** Preâmbulo efetivo de um papel (SPEC-24 Fase F): o custom da config vence;
 * sem ele, o padrão do GRUPO do papel (que pros 4 padrão é o próprio id);
 * papel que nem existe na config cai no genérico — nunca 400. */
async function preambuloDoPapel(papel: string, dirProjeto: string): Promise<string> {
  const config = await lerConfigPipelineAgentes(dirProjeto);
  const configurado = config.papeis.find((p) => p.id === papel);
  if (configurado?.preambulo) return configurado.preambulo;
  return PREAMBULO_PADRAO_POR_PAPEL[configurado?.grupo ?? papel] ?? PREAMBULO_GENERICO;
}

async function tratarIaPipeline(req: IncomingMessage, res: ServerResponse, papel: string, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    // SPEC-24 Fase E (achado real: "os itens são gerados com chamadas
    // individuais... está muito lento; a ideia é passar todo o material em
    // uma chamada única para cada agente"): o pedido virou um LOTE de itens.
    // Quem decide o tamanho do lote é o cliente (`TAM_LOTE_ESTEIRA`) — a
    // rota aceita quantos vierem. O schema GBNF vira aninhado: um objeto por
    // item (chave = atividadeChave), cada um com um campo string por
    // placeholder — a resposta continua garantida pela grammar.
    const { contextoEpico, itens } = await lerCorpoJson<{
      contextoEpico?: string;
      itens: {
        chave: string;
        rotulo: string;
        contextoNo: string;
        placeholders: { chave: string; tech: string; rotulo: string }[];
        /** Encadeamento (achado real: "deveriam responder, pois está
         * preenchido — a ideia de pipeline é justamente essa"): o que os
         * papéis ANTERIORES já escreveram pra este item, pro papel atual
         * construir em cima em vez de trabalhar às cegas. */
        respostasAnteriores?: { rotulo: string; valor: string }[];
      }[];
    }>(req);

    if (!Array.isArray(itens) || itens.length === 0 || itens.every((i) => i.placeholders.length === 0)) {
      enviarJson(res, 400, { erro: "nenhum item com placeholder informado pra gerar" });
      return;
    }

    const schema: GbnfJsonSchema = {
      type: "object",
      properties: Object.fromEntries(
        itens.map((item) => [
          item.chave,
          {
            type: "object",
            properties: Object.fromEntries(item.placeholders.map((p) => [p.chave, { type: "string" }])),
            required: item.placeholders.map((p) => p.chave),
          },
        ])
      ),
      required: itens.map((item) => item.chave),
    } as GbnfJsonSchema;

    const blocosItens = itens.map((item) =>
      [
        `### Item "${item.rotulo}" (chave "${item.chave}")`,
        `Contexto do(s) nó(s) de arquitetura envolvidos:`,
        item.contextoNo || "(sem contexto adicional)",
        // Encadeamento entre papéis: o artefato dos anteriores é insumo, não
        // decoração. Valores longos são cortados em 600 chars só por defesa
        // da janela do modelo — o essencial de uma história/contrato cabe.
        ...(item.respostasAnteriores?.length
          ? [
              `O que os papéis anteriores já definiram pra este item (construa em cima disso, sem contradizer):`,
              ...item.respostasAnteriores.map(
                (r) => `- ${r.rotulo}: ${r.valor.length > 600 ? `${r.valor.slice(0, 600)}…` : r.valor}`
              ),
            ]
          : []),
        `Campos a responder (responda pela chave entre aspas):`,
        ...item.placeholders.map((p) => `- (chave "${p.chave}") ${p.tech ? `[${p.tech}] ` : ""}${p.rotulo}`),
      ].join("\n")
    );

    const prompt = [
      await preambuloDoPapel(papel, dirProjeto),
      ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
      `Você vai responder um LOTE de ${itens.length} item(ns) de uma vez.`,
      `Responda TODOS os campos de TODOS os itens, em português, cada um com`,
      `uma decisão concreta pro item específico naquele contexto — nunca`,
      `genérica, nunca repetindo o requisito, nunca copiando a resposta de um`,
      `item pro outro.`,
      ``,
      ...blocosItens,
    ].join("\n");

    const provedor = await obterProvedor(dirProjeto);
    // SPEC-24 Fase E (achado real: "fica só o ícone de gerando e 3 pontos...
    // mostrar o que está rodando no modelo seria a melhor coisa, tal como a
    // experiência que existe com o Claude"): a resposta vira o texto CRU do
    // JSON restrito por GBNF, transmitido em pedaços conforme o modelo
    // escreve. O corpo completo é sempre JSON válido (a grammar garante),
    // então o cliente acumula, mostra ao vivo, e faz o parse no final —
    // sem precisar de um segundo canal pra resposta estruturada.
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await provedor.completarEstruturado(prompt, schema, { onTexto: (pedaco) => res.write(pedaco) });
    res.end();
  } catch (erro) {
    void descartarProvedor();
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida ao gerar a ficha.";
    // ACHADO REAL (validação da Fase 1): o cliente engole falha de lote de
    // propósito (uma falha isolada não trava a esteira), então SEM este log
    // três papéis inteiros falharam sem deixar rastro em lugar nenhum — só
    // se descobriu olhando os pips apagados num screenshot. O servidor é o
    // único lugar que enxerga a causa.
    console.error(`[ia/pipeline/${papel}] falhou:`, mensagem);
    // Mesmo achado da Fase 1c: se o streaming já começou, não dá mais pra
    // trocar o status — encerra, e o cliente trata JSON incompleto como falha.
    if (res.headersSent) {
      res.end();
    } else {
      enviarJson(res, 500, { erro: `Não foi possível gerar a ficha: ${mensagem}` });
    }
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
    enviarJson(res, 200, await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao));
    return true;
  }
  if (caminho === "/ia/sugerir" && metodo === "POST") {
    await tratarIaSugerir(req, res, dirProjeto);
    return true;
  }
  if (caminho === "/ia/sugerir-config" && metodo === "POST") {
    await tratarIaSugerirConfig(req, res, dirProjeto);
    return true;
  }
  if (caminho === "/config/ia" && (metodo === "GET" || metodo === "PUT")) {
    await tratarConfigIa(req, res, metodo, dirProjeto);
    return true;
  }
  if (caminho === "/config/pipeline-agentes" && (metodo === "GET" || metodo === "PUT")) {
    await tratarPipelineAgentes(req, res, metodo, dirProjeto);
    return true;
  }
  const matchPipeline = metodo === "POST" && caminho.match(/^\/ia\/pipeline\/([^/]+)$/);
  if (matchPipeline) {
    await tratarIaPipeline(req, res, decodeURIComponent(matchPipeline[1]), dirProjeto);
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
