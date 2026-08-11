import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import {
  TEMPLATE_ESPECIFICACAO_PADRAO,
  type PerfisConfig,
  type Quebra,
} from "@gerador/engine";
import {
  ID_PROVEDOR_GATEWAY,
  MODELOS_CHAT,
  criarProvedorCompativelOpenAI,
  formatoJsonPorBaseUrl,
  criarProvedorPorId,
  idsDeProvedorValidos,
  lerCredenciais,
  salvarCredencial,
  verificarStatus,
  type ProvedorIa,
} from "@gerador/llm";
import type { GbnfJsonSchema } from "node-llama-cpp";
import {
  criarCasosDeUsoDeCamposNo,
  criarCasosDeUsoDePerfisTime,
  criarCasosDeUsoDeQuebras,
  criarCasosDeUsoDeTemplateEspecificacao,
  TemplateInvalido,
  ConfigInvalida,
  criarCasosDeUsoDeConfig,
  ehChaveConfig,
  PAPEIS_PADRAO,
  montarPedidoAlterarItem,
  montarPedidoDiagrama,
  montarPedidoPipeline,
  montarPedidoSugerirConfig,
  preambuloDoPapel,
  PedidoInvalido,
  type PedidoIa,
  type ChaveConfig,
  type DadosCampoNo,
} from "@gerador/aplicacao";
import { criarRepositorioDeConfigEmArquivo } from "../adaptadores/configEmArquivo.js";
import { criarRepositorioDeQuebrasEmArquivo } from "../adaptadores/quebrasEmArquivo.js";
import { criarRepositorioDeCamposNoEmArquivo } from "../adaptadores/camposNoEmArquivo.js";
import { criarRepositorioDePerfisTimeEmArquivo } from "../adaptadores/perfisTimeEmArquivo.js";
import { criarRepositorioDeTemplateEspecificacaoEmArquivo } from "../adaptadores/templateEspecificacaoEmArquivo.js";

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

/**
 * Escritor de streaming que só manda o cabeçalho 200 no PRIMEIRO pedaço.
 *
 * ACHADO REAL, com o Claude ligado de verdade: as rotas escreviam
 * `writeHead(200)` ANTES de chamar o modelo. Quando a chamada falhava antes de
 * qualquer texto — foi o caso, com a Anthropic devolvendo 400 pro
 * `response_format` — o cliente recebia **HTTP 200 com corpo vazio**. Os
 * `catch` já sabiam mandar 500 quando `!res.headersSent`, mas esse ramo nunca
 * rodava. Na tela isso vira a esteira "rodando" e não escrevendo nada: o mesmo
 * silêncio que este projeto passou a rodada inteira caçando.
 *
 * Adiar o cabeçalho não muda nada pro caso feliz (o primeiro token chega e o
 * 200 sai junto) e devolve o erro de verdade pro caso triste.
 */
function escritorDeStream(res: ServerResponse): (pedaco: string) => void {
  return (pedaco: string) => {
    if (!res.headersSent) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    }
    res.write(pedaco);
  };
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



async function tratarQuebras(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  // SPEC-31 Fase 1: mesma camada de aplicação do modo hospedado. O que muda é
  // só o adaptador — arquivo aqui, Postgres lá. Antes eram duas implementações
  // do mesmo domínio, escritas separadamente, e uma sempre ficava para trás.
  const casos = criarCasosDeUsoDeQuebras(criarRepositorioDeQuebrasEmArquivo(dirProjeto));

  if (metodo === "GET" && caminho === "/quebras") {
    return enviarJson(res, 200, await casos.listar());
  }

  const matchGet = metodo === "GET" && caminho.match(/^\/quebras\/([^/]+)$/);
  if (matchGet) {
    const quebra = await casos.obter(decodeURIComponent(matchGet[1]));
    if (!quebra) return enviarJson(res, 404, { erro: "quebra não encontrada" });
    return enviarJson(res, 200, quebra);
  }

  if (metodo === "POST" && caminho === "/quebras") {
    return enviarJson(res, 201, await casos.criar(await lerCorpoJson(req)));
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/quebras\/([^/]+)$/);
  if (matchPut) {
    const atualizada = await casos.atualizar(decodeURIComponent(matchPut[1]), await lerCorpoJson(req));
    if (!atualizada) return enviarJson(res, 404, { erro: "quebra não encontrada" });
    return enviarJson(res, 200, atualizada);
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- config/perfis-time.json — mesmo arquivo que já existe hoje ---

async function tratarPerfisTime(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, dirProjeto: string): Promise<void> {
  // SPEC-31 Fase 2: mesmo caso de uso do modo hospedado, adaptador diferente.
  const casos = criarCasosDeUsoDePerfisTime(criarRepositorioDePerfisTimeEmArquivo(dirProjeto));

  if (metodo === "GET" && caminho === "/perfis-time") {
    return enviarJson(res, 200, await casos.listarTodos());
  }

  // Esta rota só existia no modo hospedado — a `packages/web` já sabia pedir.
  const matchGetTime = metodo === "GET" && caminho.match(/^\/perfis-time\/([^/]+)$/);
  if (matchGetTime) {
    return enviarJson(res, 200, await casos.obter(decodeURIComponent(matchGetTime[1])));
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/perfis-time\/([^/]+)$/);
  if (matchPut) {
    const timeId = decodeURIComponent(matchPut[1]);
    const { tipoNo, valores } = await lerCorpoJson<{ tipoNo: string; valores: Record<string, string> }>(req);
    return enviarJson(res, 200, await casos.definir(timeId, tipoNo, valores));
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- config/campos-no.json — campos por tipo de nó, global ou por time.
// SPEC-31 Fase 2: os tipos, a regra de sobreposição e o upsert por chave
// natural moram em `@gerador/aplicacao` agora; aqui sobrou o roteamento.

async function tratarCamposNo(req: IncomingMessage, res: ServerResponse, metodo: string, caminho: string, query: URLSearchParams, dirProjeto: string): Promise<void> {
  const casos = criarCasosDeUsoDeCamposNo(criarRepositorioDeCamposNoEmArquivo(dirProjeto));

  if (metodo === "GET" && caminho === "/campos-no") {
    return enviarJson(res, 200, await casos.listarEfetivos(query.get("timeId") ?? undefined));
  }

  if (metodo === "POST" && caminho === "/campos-no") {
    const corpo = await lerCorpoJson<Partial<DadosCampoNo>>(req);
    if (!corpo.tipoNo || !corpo.key || !corpo.label || !corpo.type) {
      return enviarJson(res, 400, { erro: "tipoNo, key, label e type são obrigatórios" });
    }
    return enviarJson(res, 201, await casos.salvar(corpo));
  }

  const matchPut = metodo === "PUT" && caminho.match(/^\/campos-no\/([^/]+)$/);
  if (matchPut) {
    const id = decodeURIComponent(matchPut[1]);
    const atualizado = await casos.atualizar(id, await lerCorpoJson<Partial<DadosCampoNo>>(req));
    if (!atualizado) return enviarJson(res, 404, { erro: "campo não encontrado" });
    return enviarJson(res, 200, atualizado);
  }

  const matchDelete = metodo === "DELETE" && caminho.match(/^\/campos-no\/([^/]+)$/);
  if (matchDelete) {
    await casos.excluir(decodeURIComponent(matchDelete[1]));
    res.writeHead(204);
    // `res.end()` devolve o próprio ServerResponse; `return` dele num handler
    // que promete `void` é o que o typecheck acusava. O `return` aqui é só
    // para sair do handler, não para entregar valor.
    res.end();
    return;
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
    // `res.end()` devolve o próprio ServerResponse; `return` dele num handler
    // que promete `void` é o que o typecheck acusava. O `return` aqui é só
    // para sair do handler, não para entregar valor.
    res.end();
    return;
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- especificação de entrega: template customizável opcional, default do engine ---

async function tratarEspecificacaoTemplate(req: IncomingMessage, res: ServerResponse, metodo: string, dirProjeto: string): Promise<void> {
  const casos = criarCasosDeUsoDeTemplateEspecificacao(criarRepositorioDeTemplateEspecificacaoEmArquivo(dirProjeto));

  if (metodo === "GET") {
    const salvo = await casos.obter();
    // Projeto que nunca editou o template usa o do engine — o default é da
    // borda, não da porta: o modo hospedado semeia o dele por migração.
    return enviarJson(
      res,
      200,
      salvo ?? { id: "local", timeId: "local", conteudo: TEMPLATE_ESPECIFICACAO_PADRAO, atualizadoEm: new Date().toISOString() }
    );
  }

  if (metodo === "PUT") {
    const { conteudo } = await lerCorpoJson<{ conteudo: string }>(req);
    try {
      // SPEC-31 Fase 2: a validação de variáveis passou a valer aqui também.
      // Antes, um `{{tipoErrado}}` era aceito em silêncio no modo local e
      // reaparecia como texto cru no documento entregue.
      return enviarJson(res, 200, await casos.salvar(undefined, conteudo));
    } catch (erro) {
      if (erro instanceof TemplateInvalido) return enviarJson(res, 400, { erro: erro.message });
      throw erro;
    }
  }

  enviarJson(res, 404, { erro: "não encontrado" });
}

// --- prompt único (SPEC-25 §5.5 / Fase 2.1): o template do prompt gigante
// que a pessoa cola no wrapper corporativo. Mesmo mecanismo do template de
// especificação — arquivo no projeto, default do engine quando não existe —
// mas com um acréscimo: o PUT VALIDA as variáveis. Aqui o custo de errar é
// alto e silencioso: um `{{tipoErrado}}` só apareceria como texto cru no meio
// do prompt já colado no chat da empresa.


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

/**
 * A raiz do pacote instalado — onde ficam `templates/` e o `package.json`.
 *
 * Compilado, este módulo vira `dist/cli.js`, então a raiz está UM nível acima.
 * Em desenvolvimento ele roda de `src/commands/`, dois níveis acima. Tentar os
 * dois é mais honesto que assumir um: errar aqui não quebra nada visivelmente
 * — só faz o diagnóstico comparar contra um template vazio e nunca acusar
 * nada, que foi exatamente o que aconteceu na primeira validação real.
 */
const DIR_ESTE_ARQUIVO = dirname(fileURLToPath(import.meta.url));

function raizDoPacote(): string {
  for (const candidato of [resolve(DIR_ESTE_ARQUIVO, ".."), resolve(DIR_ESTE_ARQUIVO, "..", "..")]) {
    if (existsSync(resolve(candidato, "package.json")) && existsSync(resolve(candidato, "templates"))) {
      return candidato;
    }
  }
  return resolve(DIR_ESTE_ARQUIVO, "..");
}

const RAIZ_DO_PACOTE = raizDoPacote();

/** A versão desta instalação — carimbo de quem gravou a config. */
const VERSAO_ATUAL: string | null = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(RAIZ_DO_PACOTE, "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
})();

/**
 * O template de fábrica desta versão: o que o pacote traz em `templates/`.
 * É contra ELE que a config em uso é comparada — sem nunca sobrescrevê-la.
 */
async function templateDaVersao(chave: ChaveConfig): Promise<unknown> {
  const candidatos = [
    resolve(RAIZ_DO_PACOTE, "templates", `${chave}.json`),
    resolve(RAIZ_DO_PACOTE, "..", "..", "config", `${chave}.example.json`),
  ];
  for (const candidato of candidatos) {
    const conteudo = await lerJsonOpcional<unknown>(candidato);
    if (conteudo) return conteudo;
  }
  // Sem template no disco (instalação podada), o default compilado responde.
  return chave === "pipeline-agentes"
    ? { confirmacaoObrigatoria: true, papeis: PAPEIS_PADRAO }
    : chave === "regras"
      ? { tipos: [], tamanhos: [], porTech: {} }
      : { conteudo: "" };
}

async function tratarConfigPorChave(
  req: IncomingMessage,
  res: ServerResponse,
  metodo: string,
  chave: ChaveConfig,
  dirProjeto: string
): Promise<void> {
  // SPEC-31 Fase 3: mesmo caso de uso do modo hospedado. O GET vem com o
  // diagnóstico contra o template DESTA versão — é o que faltava no §108,
  // quando um regras.json de outra era deixava o Especialista mudo.
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmArquivo(dirProjeto));

  if (metodo === "GET") {
    return enviarJson(res, 200, await casos.obter(chave, await templateDaVersao(chave), undefined));
  }

  if (metodo === "PUT") {
    try {
      // Mesmo corpo do modo hospedado: `{ documento }`. Simétrico com o GET,
      // que devolve o documento dentro de um envelope com o diagnóstico.
      const corpo = await lerCorpoJson<{ documento?: unknown }>(req);
      if (!corpo || corpo.documento === undefined) {
        return enviarJson(res, 400, { erro: "corpo precisa ter `documento`" });
      }
      const salvo = await casos.salvar(chave, corpo.documento, VERSAO_ATUAL, undefined);
      return enviarJson(res, 200, salvo);
    } catch (erro) {
      if (erro instanceof ConfigInvalida) return enviarJson(res, 400, { erro: erro.message });
      throw erro;
    }
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
    // Desde a Fase 2 a lista inclui o gateway remoto, que não é um modelo
    // baixável e por isso não está em `MODELOS_CHAT`.
    const conhecido = idsDeProvedorValidos().includes(String(corpo.provedorPadrao));
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

// --- PUT /ia/credencial — SPEC-25 Fase 2: os três campos do card do gateway.
//
// NÃO passa por `dirProjeto` de propósito: a credencial é da MÁQUINA
// (`~/.gerador/credenciais.json`), não do repositório. `config/` é
// versionável — chave de API ali seria vazamento esperando um `git push`.
// A resposta devolve só o resumo mascarado; a chave inteira nunca volta pela
// rede, nem pra tela que acabou de enviá-la.

async function tratarIaCredencial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const corpo = await lerCorpoJson<{ baseUrl?: string; chave?: string; modelo?: string }>(req);
  const baseUrl = (corpo.baseUrl ?? "").trim();
  const modelo = (corpo.modelo ?? "").trim();
  // Chave vazia com base URL preenchida = "quero manter a chave que já
  // está lá" (o card mostra a máscara, não a chave, então reenviá-la seria
  // impossível). Trocar de gateway sem trocar a chave é o caso comum.
  const chaveNova = (corpo.chave ?? "").trim();
  const atual = (await lerCredenciais())[ID_PROVEDOR_GATEWAY];
  const chave = chaveNova || atual?.chave || "";

  if (!baseUrl || !chave || !modelo) {
    enviarJson(res, 400, { erro: "informe base URL, chave e nome do modelo" });
    return;
  }
  // O dialeto de JSON é deduzido do destino, não pedido a quem configura:
  // ninguém precisa saber que a Anthropic exige `json_schema` pra usar Claude.
  await salvarCredencial(ID_PROVEDOR_GATEWAY, {
    baseUrl,
    chave,
    modelo,
    formatoJson: formatoJsonPorBaseUrl(baseUrl),
  });
  // A credencial mudou: o provedor carregado (se era o gateway) está velho.
  void descartarProvedor();
  enviarJson(res, 200, { ok: true });
}

/**
 * Testa a credencial contra o gateway de verdade, com um prompt mínimo.
 *
 * É o que transforma o card de "preenchi e torço" em "funciona". Testa a
 * credencial ENVIADA (não a salva), pra dar pra validar antes de gravar.
 */
async function tratarIaTestarCredencial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const corpo = await lerCorpoJson<{ baseUrl?: string; chave?: string; modelo?: string }>(req);
  const salva = (await lerCredenciais())[ID_PROVEDOR_GATEWAY];
  const baseUrl = (corpo.baseUrl ?? "").trim() || salva?.baseUrl || "";
  const chave = (corpo.chave ?? "").trim() || salva?.chave || "";
  const modelo = (corpo.modelo ?? "").trim() || salva?.modelo || "";
  if (!baseUrl || !chave || !modelo) {
    enviarJson(res, 400, { erro: "informe base URL, chave e nome do modelo" });
    return;
  }

  const provedor = criarProvedorCompativelOpenAI({
    baseUrl,
    chave,
    modelo,
    cabecalhos: salva?.cabecalhos,
    // Testar com o MESMO dialeto que o uso real vai usar — senão o teste passa
    // e a esteira falha, que é pior que não ter teste.
    formatoJson: formatoJsonPorBaseUrl(baseUrl),
  });
  const inicio = Date.now();
  try {
    const resposta = await provedor.completar("Responda apenas: ok");
    enviarJson(res, 200, {
      ok: true,
      // O trecho da resposta é o que prova que veio de um modelo, e não de um
      // proxy que devolve 200 pra qualquer coisa.
      amostra: resposta.trim().slice(0, 120),
      duracaoMs: Date.now() - inicio,
    });
  } catch (erro) {
    // 200 com `ok: false`: a falha É o resultado do teste, não um erro da
    // rota. A mensagem do provedor já vem pronta pra tela.
    enviarJson(res, 200, { ok: false, erro: erro instanceof Error ? erro.message : String(erro) });
  }
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
    const escrever = escritorDeStream(res);
    await provedor.completar(prompt, { onTexto: escrever });
    if (!res.headersSent) throw new Error("o modelo não devolveu conteúdo nenhum");
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

// --- POST /ia/diagrama — SPEC-27 Fase 1: a conversa do desenho.
//
// A maior lacuna do produto até aqui: a ferramenta ajudava a especificar o que
// já tinha sido desenhado, e não ajudava a DESENHAR. O botão "Contexto do
// épico" só guardava o texto; ninguém lia esse texto pra propor arquitetura.
//
// Decisão de desenho (SPEC-27 §4) — trilhos, não tool-calling livre: o `tipo`
// de cada nó e de cada conexão é um ENUM montado a partir da configuração REAL
// do projeto. O modelo não consegue propor um tipo que a ferramenta não tem,
// o que é o erro mais provável (e mais irritante) de um modelo pequeno. A
// validade do par origem→destino quem confere é o cliente, com as MESMAS
// `edgeRules` que validam um arrasto de mouse.
/**
 * SPEC-31 Fase 4 (conclusão) — o único caminho de execução das rotas de IA
 * que devolvem JSON estruturado streamado. Antes cada rota repetia este bloco;
 * agora a diferença entre elas é só qual `PedidoIa` foi montado — e o mesmo
 * pedido roda no modo hospedado, com outro provedor.
 */
async function executarPedidoIa(
  res: ServerResponse,
  dirProjeto: string,
  pedido: PedidoIa,
  rotulo: string
): Promise<void> {
  const provedor = await obterProvedor(dirProjeto);
  const escrever = escritorDeStream(res);
  await provedor.completarEstruturado(pedido.prompt, pedido.esquema as never, {
    // SPEC-30 Fase 2: se o pedido trouxe imagem, ela vai junto do prompt.
    imagens: pedido.imagens,
    onTexto: escrever,
    // Mesmo sinal do modo hospedado — o cliente é o mesmo e não deve precisar
    // saber em qual modo está. Só dispara com provedor de gateway; no local o
    // GBNF garante JSON válido de primeira.
    onReiniciar: () => escrever(" "),
  });
  // Resposta vazia sem erro: nada pra entregar, e 200 vazio viraria silêncio.
  if (!res.headersSent) throw new Error(`o modelo não devolveu conteúdo nenhum (${rotulo})`);
  res.end();
}

/** Traduz falha de pedido/geração em HTTP, preservando o comportamento de
 * sempre: 400 para entrada inválida, 500 para o resto, e `end()` cru se o
 * stream já começou (não dá pra trocar o status depois do cabeçalho). */
function responderFalhaIa(res: ServerResponse, erro: unknown, rotulo: string, acao: string): void {
  if (erro instanceof PedidoInvalido) {
    if (!res.headersSent) enviarJson(res, 400, { erro: erro.message });
    else res.end();
    return;
  }
  void descartarProvedor();
  const mensagem = erro instanceof Error ? erro.message : `Falha desconhecida ao ${acao}.`;
  console.error(`[${rotulo}] falhou:`, mensagem);
  if (res.headersSent) res.end();
  else enviarJson(res, 500, { erro: `Não foi possível ${acao}: ${mensagem}` });
}

async function tratarIaDiagrama(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const pedido = montarPedidoDiagrama(await lerCorpoJson(req));
    await executarPedidoIa(res, dirProjeto, pedido, "ia/diagrama");
  } catch (erro) {
    responderFalhaIa(res, erro, "ia/diagrama", "propor o diagrama");
  }
}

// --- POST /ia/alterar-item — SPEC-27 Fase 2: a conversa da especificação.
//
// Serve os dois pedidos do fluxo real ("altere o item X" e "revise os
// demais") com UMA rota, porque são a mesma operação vista de ângulos
// diferentes: dado um item e um motivo, o que muda nos campos dele.
//
// Decisões que vêm direto das lições anteriores:
// - **Uma chamada por item.** O lote grande foi o que truncou a resposta e
//   apagou o trabalho de um papel inteiro (JOURNEY §93). Aqui a resposta é
//   pequena por construção, e o progresso aparece item a item.
// - **`campo` é ENUM das chaves do próprio item.** O modelo não consegue
//   propor alteração num campo que não existe — mesmo trilho do diagrama.
// - **Lista vazia é resposta válida e esperada.** "Revise os demais" em um
//   item que não é afetado deve devolver nada; forçar alteração seria pior
//   que não revisar.
async function tratarIaAlterarItem(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const pedido = montarPedidoAlterarItem(await lerCorpoJson(req));
    await executarPedidoIa(res, dirProjeto, pedido, "ia/alterar-item");
  } catch (erro) {
    responderFalhaIa(res, erro, "ia/alterar-item", "propor a alteração");
  }
}

async function tratarIaSugerirConfig(req: IncomingMessage, res: ServerResponse, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const pedido = montarPedidoSugerirConfig(await lerCorpoJson(req));
    await executarPedidoIa(res, dirProjeto, pedido, "ia/sugerir-config");
  } catch (erro) {
    responderFalhaIa(res, erro, "ia/sugerir-config", "gerar a sugestão");
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


async function tratarIaPipeline(req: IncomingMessage, res: ServerResponse, papel: string, dirProjeto: string): Promise<void> {
  try {
    const status = await verificarStatus(undefined, (await lerConfigIa(dirProjeto)).provedorPadrao);
    if (!status.pronto) {
      enviarJson(res, 503, { erro: "modelos de IA não instalados — rode `gerador ia instalar`" });
      return;
    }

    const corpo = await lerCorpoJson<{ contextoEpico?: string; itens: Parameters<typeof montarPedidoPipeline>[0]["itens"] }>(req);
    // O preâmbulo sai da config da esteira (Fase 3) e entra no montador — que
    // não conhece arquivo nem banco, e por isso serve aos dois modos.
    const { papeis } = await lerConfigPipelineAgentes(dirProjeto);
    const pedido = montarPedidoPipeline({ preambulo: preambuloDoPapel(papel, papeis), ...corpo });

    await executarPedidoIa(res, dirProjeto, pedido, `ia/pipeline/${papel}`);
  } catch (erro) {
    responderFalhaIa(res, erro, `ia/pipeline/${papel}`, "gerar a ficha");
  }
}

/**
 * SPEC-30 Fase 1a — `POST /ia/transcrever`.
 *
 * O corpo é o áudio cru (o `Content-Type` diz o formato que o navegador
 * gravou), a resposta é `{ texto }`. Quem transcreve é o provedor selecionado,
 * e ele pode não saber: transcrição é capacidade OPCIONAL (`ProvedorIa`), e o
 * modelo local não tem — `node-llama-cpp` não expõe multimodal.
 *
 * 501 quando não sabe, não 500: "este provedor não faz" é uma resposta
 * legítima sobre a configuração, não uma falha do servidor. A tela usa isso
 * pra não desenhar o botão de microfone.
 */
async function tratarIaTranscrever(
  req: IncomingMessage,
  res: ServerResponse,
  dirProjeto: string,
  vocabulario?: string
): Promise<void> {
  try {
    const provedor = await obterProvedor(dirProjeto);
    if (!provedor.transcrever) {
      enviarJson(res, 501, {
        erro: `O modelo selecionado (${provedor.nome}) não transcreve áudio. Configure um gateway na aba "Modelo de IA".`,
      });
      return;
    }

    const audio = await lerCorpoBinario(req, LIMITE_AUDIO_BYTES);
    if (audio.length === 0) {
      enviarJson(res, 400, { erro: "nenhum áudio recebido" });
      return;
    }

    const texto = await provedor.transcrever(audio, {
      formato: (req.headers["content-type"] ?? "audio/webm").split(";")[0].trim(),
      // Português fixo: é o idioma do produto inteiro, e a dica é o que faz
      // sigla e nome de sistema serem reconhecidos.
      idioma: "pt",
      // O vocabulário vem de quem tem config E diagrama abertos: o navegador
      // (`montarVocabularioTranscricao`, no engine). É o que faz o modelo de
      // 145 MB acertar "RabbitMQ" e "idempotência" em vez de "rabitém IKEA" e
      // "idem potência" — medido, ver a doc daquela função.
      vocabulario,
    });
    enviarJson(res, 200, { texto });
  } catch (erro) {
    responderFalhaIa(res, erro, "ia/transcrever", "transcrever o áudio");
  }
}

/**
 * Teto de upload. Áudio longo é transcrição longa e cara — e sem teto explícito
 * o limite acaba sendo a memória do processo. ~10 MB de WebM/Opus são vários
 * minutos de fala, muito acima de "ditar uma demanda".
 *
 * A lição vem da SPEC-25 Fase 1 e está no JOURNEY: *toda ausência de teto virou
 * bug*. Este nasce com o primeiro commit da feature, não depois do incidente.
 */
const LIMITE_AUDIO_BYTES = 10 * 1024 * 1024;

/** Lê o corpo como bytes, abortando se passar do teto. */
async function lerCorpoBinario(req: IncomingMessage, limite: number): Promise<Uint8Array> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    const bloco = parte as Buffer;
    total += bloco.length;
    // Corta na hora, não depois de montar tudo: o ponto do teto é não guardar
    // o excesso na memória.
    if (total > limite) throw new Error(`Áudio grande demais (limite: ${Math.round(limite / 1024 / 1024)} MB).`);
    partes.push(bloco);
  }
  return new Uint8Array(Buffer.concat(partes));
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
  if (caminho === "/ia/diagrama" && metodo === "POST") {
    await tratarIaDiagrama(req, res, dirProjeto);
    return true;
  }
  if (caminho === "/ia/alterar-item" && metodo === "POST") {
    await tratarIaAlterarItem(req, res, dirProjeto);
    return true;
  }
  if (caminho === "/ia/transcrever" && metodo === "POST") {
    // O corpo é o áudio cru, então o vocabulário viaja na query — é texto
    // curto (teto de 850 chars no montador) e cabe folgado numa URL.
    await tratarIaTranscrever(req, res, dirProjeto, query.get("vocabulario") ?? undefined);
    return true;
  }
  if (caminho === "/config/ia" && (metodo === "GET" || metodo === "PUT")) {
    await tratarConfigIa(req, res, metodo, dirProjeto);
    return true;
  }
  if (caminho === "/ia/credencial" && metodo === "PUT") {
    await tratarIaCredencial(req, res);
    return true;
  }
  if (caminho === "/ia/credencial/testar" && metodo === "POST") {
    await tratarIaTestarCredencial(req, res);
    return true;
  }
  // SPEC-31 Fase 3: as três chaves de config passam pelo mesmo caminho — o
  // mesmo que o modo hospedado ganhou nesta fase.
  const matchConfig = (metodo === "GET" || metodo === "PUT") && caminho.match(/^\/config\/([^/]+)$/);
  if (matchConfig && ehChaveConfig(matchConfig[1])) {
    await tratarConfigPorChave(req, res, metodo, matchConfig[1], dirProjeto);
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
