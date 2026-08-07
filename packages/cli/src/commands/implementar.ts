import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  derivar,
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
    console.log(`Especificação de entrega gravada em ${caminhoOut} (${resultado.atividades.length} itens).`);
  } else {
    process.stdout.write(documento);
  }
}
