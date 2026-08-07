import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Bundlado pelo tsup em dist/cli.js — templates ficam ao lado de dist/, não dentro.
const AQUI = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(AQUI, "../templates");

const ARQUIVOS = ["app.json", "diagrama.json", "regras.json", "perfis-time.json", "graphify-mapping.json"];

async function existe(caminho: string): Promise<boolean> {
  return access(caminho, constants.F_OK).then(
    () => true,
    () => false
  );
}

/** Nunca sobrescreve config existente — init é scaffold, não reset. */
export async function init(args: string[]): Promise<void> {
  const alvo = resolve(args[0] ?? ".", "config");
  await mkdir(alvo, { recursive: true });

  for (const nome of ARQUIVOS) {
    const destino = join(alvo, nome);
    if (await existe(destino)) {
      console.log(`- config/${nome} já existe, mantido.`);
      continue;
    }
    await copyFile(join(TEMPLATES, nome), destino);
    console.log(`+ config/${nome} criado.`);
  }

  // config/cenarios/ (exemplos ilustrativos dos tipos de nó deste template,
  // mesmo conjunto que domina config/diagrama.json — sem eles, "Cenários
  // prontos" fica vazio num projeto recém-criado) — mesma regra de sempre:
  // nunca sobrescreve o que já existir.
  const alvoCenarios = join(alvo, "cenarios");
  await mkdir(alvoCenarios, { recursive: true });
  for (const nome of await readdir(join(TEMPLATES, "cenarios"))) {
    const destino = join(alvoCenarios, nome);
    if (await existe(destino)) {
      console.log(`- config/cenarios/${nome} já existe, mantido.`);
      continue;
    }
    await copyFile(join(TEMPLATES, "cenarios", nome), destino);
    console.log(`+ config/cenarios/${nome} criado.`);
  }
}
