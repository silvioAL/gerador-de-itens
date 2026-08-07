import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  derivar,
  gerarDiagramaHtml,
  gerarEspecificacaoEntrega,
  resolverDependencias,
  validateConfig,
  type AppConfig,
  type DiagramaConfig,
  type Quebra,
  type RegrasConfig,
} from "@gerador/engine";

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

/** Troca a extensão de um caminho (ex.: "especificacao.md" -> "especificacao.html").
 * Sem extensão nenhuma, só acrescenta — nunca inventa um separador duplicado. */
function comExtensao(caminho: string, novaExt: string): string {
  return /\.\w+$/.test(caminho) ? caminho.replace(/\.\w+$/, novaExt) : caminho + novaExt;
}

/** Gera a especificação de entrega da quebra inteira (SPEC-14) — não pede
 * mais uma atividade específica: um documento cobre todos os itens derivados. */
export async function implementar(args: string[]): Promise<void> {
  const caminhoQuebra = args[0];
  if (!caminhoQuebra || caminhoQuebra.startsWith("--")) {
    throw new Error("uso: gerador implementar <quebra.json> [--out arquivo]");
  }

  const idxOut = args.indexOf("--out");
  const caminhoOut = idxOut >= 0 ? args[idxOut + 1] : undefined;

  const diretorioConfig = resolve("config");
  const [app, diagrama, regras, quebra] = await Promise.all([
    lerJson<AppConfig>(resolve(diretorioConfig, "app.json")),
    lerJson<DiagramaConfig>(resolve(diretorioConfig, "diagrama.json")),
    lerJsonOpcional<RegrasConfig>(resolve(diretorioConfig, "regras.json")),
    lerJson<Quebra>(resolve(caminhoQuebra)),
  ]);

  const errosConfig = validateConfig(diagrama, app);
  if (errosConfig.length > 0) {
    throw new Error(
      "config/diagrama.json inválida:\n" + errosConfig.map((e) => `  - ${e.campo}: ${e.mensagem}`).join("\n")
    );
  }

  const atividades = derivar(quebra.diagrama, diagrama, { time: quebra.time });
  const resultado = resolverDependencias(atividades);

  const documento = gerarEspecificacaoEntrega(resultado.atividades, quebra.diagrama, diagrama, {
    regras,
    demandInfo: quebra.demandInfo,
    time: quebra.time,
  });

  if (caminhoOut) {
    await writeFile(resolve(caminhoOut), documento, "utf-8");
    // Sempre emite o diagrama animado pareado com a especificação — os dois
    // são o par de entrega (SPEC-21), não uma flag opcional fácil de esquecer.
    const caminhoHtml = comExtensao(caminhoOut, ".html");
    const diagramaHtml = gerarDiagramaHtml(resultado.atividades, quebra.diagrama, diagrama);
    await writeFile(resolve(caminhoHtml), diagramaHtml, "utf-8");
    console.log(
      `Especificação de solução gravada em ${caminhoOut}, diagrama animado em ${caminhoHtml} (${resultado.atividades.length} itens).`
    );
  } else {
    process.stdout.write(documento);
    // Sem --out, stdout é só o markdown (pra não misturar HTML no meio de um
    // pipe que espera texto puro) — o diagrama animado só sai com --out.
    console.error("\n(use --out <arquivo.md> para também gerar o diagrama animado pareado, <arquivo>.html)");
  }
}
