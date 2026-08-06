import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  derivar,
  paraCsv,
  paraMarkdown,
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

export async function derive(args: string[]): Promise<void> {
  const caminhoQuebra = args[0];
  if (!caminhoQuebra || caminhoQuebra.startsWith("--")) {
    throw new Error("uso: gerador derive <quebra.json> [--out arquivo]");
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

  if (resultado.ciclos.length > 0 || resultado.conflitos.length > 0) {
    console.error(
      `atenção: ${resultado.ciclos.length} ciclo(s) e ${resultado.conflitos.length} conflito(s) detectado(s) — revise antes de usar o backlog.`
    );
  }

  const formato = caminhoOut && extname(caminhoOut) === ".csv" ? "csv" : "md";
  const conteudo =
    formato === "csv"
      ? paraCsv(resultado.atividades)
      : paraMarkdown(resultado.atividades, resultado.ciclos, resultado.conflitos, regras);

  if (caminhoOut) {
    await writeFile(resolve(caminhoOut), conteudo, "utf-8");
    console.log(`Backlog gravado em ${caminhoOut} (${resultado.atividades.length} atividades).`);
  } else {
    process.stdout.write(conteudo);
  }
}
