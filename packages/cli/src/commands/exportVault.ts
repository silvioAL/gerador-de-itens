import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { exec } from "node:child_process";
import { gerarChecklistTecnico, gerarCiclosDeTeste, type DiagramaConfig, type RegrasConfig } from "@gerador/engine";

interface ReferenciaLocal {
  titulo: string;
  racional: string;
  designPatterns?: string[];
  codigoRelacionado?: string[];
  linkExterno?: string | null;
  criadoEm?: string;
}

interface NotaVault {
  /** Nome do arquivo sem `.md` — é também o alvo do wikilink `[[...]]` (o Graphify decide esse nome, não este comando — ver SPEC-16 §3). */
  titulo: string;
  sourceFile?: string;
}

async function lerJson<T>(caminho: string): Promise<T> {
  return JSON.parse(await readFile(caminho, "utf-8")) as T;
}

async function lerJsonOpcional<T>(caminho: string): Promise<T | undefined> {
  try {
    return await lerJson<T>(caminho);
  } catch {
    return undefined;
  }
}

/**
 * Lê `config/referencias/*.json` local — um arquivo por referência, texto
 * editável à mão (SPEC-17), mesma disciplina de `perfis-time.json`/
 * `diagrama.json`. Pasta ausente não é erro: referências são opcionais, igual
 * `regras.json` já é hoje.
 */
async function lerReferenciasLocais(diretorioReferencias: string): Promise<ReferenciaLocal[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorioReferencias);
  } catch {
    return [];
  }
  const referencias: ReferenciaLocal[] = [];
  for (const nome of arquivos) {
    if (!nome.endsWith(".json")) continue;
    referencias.push(await lerJson<ReferenciaLocal>(resolve(diretorioReferencias, nome)));
  }
  return referencias;
}

/**
 * Indexa as notas já geradas por `graphify export obsidian` (frontmatter
 * `source_file: "..."`), pra resolver o wikilink real — nunca reimplementa o
 * esquema de nomes do Graphify (achado real, SPEC-16 §3: colisão de nome
 * entre pastas vira `configtypes.ts`/`modeltypes.ts`, não previsível daqui).
 */
async function indexarVault(dirVault: string): Promise<NotaVault[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(dirVault);
  } catch {
    throw new Error(
      `Vault não encontrado em "${dirVault}". Rode primeiro: graphify export obsidian --dir ${dirVault}`
    );
  }

  const notas: NotaVault[] = [];
  for (const nome of arquivos) {
    if (!nome.endsWith(".md")) continue;
    const conteudo = await readFile(resolve(dirVault, nome), "utf-8");
    // `graphify export obsidian` grava com CRLF (achado real, validado contra
    // o vault gerado de verdade) — `\r?\n` tolera os dois, não só LF.
    const frontmatter = conteudo.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const sourceFile = frontmatter.match(/source_file:\s*"([^"]*)"/)?.[1];
    notas.push({ titulo: nome.slice(0, -3), sourceFile });
  }
  return notas;
}

/** Entre as notas com o mesmo `source_file` (arquivo inteiro + símbolos dentro
 * dele), a nota do arquivo é a que tem título igual ao nome base do caminho —
 * mesmo achado do §3: símbolos têm o mesmo `source_file`, título diferente. */
function resolverNotaDoArquivo(notas: NotaVault[], caminhoRepo: string): NotaVault | undefined {
  const candidatas = notas.filter((n) => n.sourceFile === caminhoRepo);
  if (candidatas.length === 0) return undefined;
  const base = basename(caminhoRepo);
  return candidatas.find((n) => n.titulo === base) ?? candidatas[0];
}

function slugify(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sem-titulo"
  );
}

function renderizarNotaReferencia(ref: ReferenciaLocal, notas: NotaVault[]): string {
  const linhas: string[] = [
    "---",
    `titulo: "${ref.titulo.replace(/"/g, '\\"')}"`,
    "tags:",
    "  - referencia",
    ...(ref.designPatterns ?? []).map((p) => `  - ${slugify(p)}`),
    ...(ref.criadoEm ? [`criadoEm: "${ref.criadoEm}"`] : []),
    "---",
    "",
    `# ${ref.titulo}`,
    "",
    ref.racional,
  ];

  const codigoRelacionado = ref.codigoRelacionado ?? [];
  if (codigoRelacionado.length > 0) {
    linhas.push("", "## Código relacionado", "");
    for (const caminho of codigoRelacionado) {
      const nota = resolverNotaDoArquivo(notas, caminho);
      linhas.push(
        nota
          ? `- [[${nota.titulo}]] (\`${caminho}\`)`
          : `- ${caminho} _(não encontrado no vault do Graphify — rode \`graphify export obsidian\` de novo?)_`
      );
    }
  }

  if (ref.linkExterno) {
    linhas.push("", `## Link externo`, "", ref.linkExterno);
  }

  return linhas.join("\n") + "\n";
}

function renderizarNotaPattern(tipo: string, cfg: DiagramaConfig["nodeTypes"][string], regras?: RegrasConfig): string {
  const linhas: string[] = ["---", `tipo: "${tipo}"`, "tags:", "  - padrao-default", "---", "", `# ${cfg.label}`, ""];

  if (cfg.specResumo && cfg.specResumo.length > 0) {
    linhas.push("## Campos-chave", "", ...cfg.specResumo.map((k) => `- \`${k}\``), "");
  }

  if (cfg.cenarioGherkinPadrao) {
    linhas.push("## Cenário Gherkin padrão", "", cfg.cenarioGherkinPadrao, "");
  }
  if (cfg.cenarioGherkinPorAresta) {
    for (const [aresta, cenario] of Object.entries(cfg.cenarioGherkinPorAresta)) {
      linhas.push(`### Por aresta: ${aresta}`, "", cenario, "");
    }
  }

  if (regras) {
    const checklist = gerarChecklistTecnico(regras, cfg.techs, cfg.contextos);
    const ciclos = gerarCiclosDeTeste(regras, cfg.techs, cfg.contextos);
    if (checklist) linhas.push("## Refinamento técnico relevante", "", checklist, "");
    if (ciclos) linhas.push("### Ciclos de teste", "", ciclos, "");
  }

  return linhas.join("\n").trimEnd() + "\n";
}

function lerFlag(args: string[], nome: string, padrao: string): string {
  const idx = args.indexOf(nome);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : padrao;
}

/** URI de abertura direta no Obsidian (SPEC-17) — resolve o "clica e já abre
 * lá" em vez de um visualizador próprio: o vault já É a interface. */
function montarUriObsidian(nomeVault: string, arquivoRelativo?: string): string {
  const params = new URLSearchParams({ vault: nomeVault });
  if (arquivoRelativo) params.set("file", arquivoRelativo);
  return `obsidian://open?${params.toString()}`;
}

/** Lança a URI no handler padrão do SO. Só Windows por ora (ambiente real
 * desta ferramenta) — a função fica isolada o bastante pra ganhar `open`
 * (macOS)/`xdg-open` (Linux) depois, sem tocar no resto do comando. */
function abrirNoSistema(uri: string): void {
  if (process.platform !== "win32") {
    console.log(`Abertura automática só suportada no Windows por ora. Abra manualmente: ${uri}`);
    return;
  }
  exec(`start "" "${uri}"`);
}

/**
 * Materializa referências e padrões default como notas Obsidian, dentro de um
 * vault que `graphify export obsidian` já gerou (SPEC-16) — complementa o
 * grafo de código que o Graphify extrai, não reimplementa extração nenhuma.
 * Referências vêm de `config/referencias/*.json` local (SPEC-17) — o comando
 * inteiro roda sem rede, sem servidor.
 */
export async function exportVault(args: string[]): Promise<void> {
  const dirVault = resolve(lerFlag(args, "--dir", "graphify-out/obsidian"));
  const nomeVault = lerFlag(args, "--vault-nome", basename(dirVault));
  const abrir = args.includes("--abrir");

  const diretorioConfig = resolve("config");
  const [diagrama, regras, referencias] = await Promise.all([
    lerJson<DiagramaConfig>(resolve(diretorioConfig, "diagrama.json")),
    lerJsonOpcional<RegrasConfig>(resolve(diretorioConfig, "regras.json")),
    lerReferenciasLocais(resolve(diretorioConfig, "referencias")),
  ]);

  const notas = await indexarVault(dirVault);

  const dirReferencias = resolve(dirVault, "referencias");
  const dirPatterns = resolve(dirVault, "patterns");
  await mkdir(dirReferencias, { recursive: true });
  await mkdir(dirPatterns, { recursive: true });

  let primeiroArquivoReferencia: string | undefined;
  for (const ref of referencias) {
    const slug = slugify(ref.titulo);
    const arquivo = resolve(dirReferencias, `${slug}.md`);
    await writeFile(arquivo, renderizarNotaReferencia(ref, notas), "utf-8");
    primeiroArquivoReferencia ??= `referencias/${slug}`;
  }

  for (const [tipo, cfg] of Object.entries(diagrama.nodeTypes)) {
    const arquivo = resolve(dirPatterns, `${slugify(tipo)}.md`);
    await writeFile(arquivo, renderizarNotaPattern(tipo, cfg, regras), "utf-8");
  }

  console.log(
    `Vault atualizado em ${dirVault}: ${referencias.length} referência(s) em referencias/, ${
      Object.keys(diagrama.nodeTypes).length
    } padrão(ões) em patterns/.`
  );

  const uri = montarUriObsidian(nomeVault, primeiroArquivoReferencia);
  console.log(`Abrir no Obsidian: ${uri}`);
  if (abrir) abrirNoSistema(uri);
}
