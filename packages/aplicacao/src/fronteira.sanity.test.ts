import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPEC-31 §8 — o equivalente a ArchUnit para a camada de aplicação, irmão do
 * `boundary.sanity.test.ts` do engine.
 *
 * A camada de aplicação é portas e orquestração. Se ela adquirir I/O, deixa de
 * ser substituível e o hexágono vira desenho no papel: `criarCasosDeUsoDeQuebras`
 * passaria a só funcionar com o banco que o autor tinha em mente.
 */
const PROIBIDOS = [
  { padrao: /from "node:fs/, o_que: "acesso a arquivo" },
  { padrao: /from "node:http/, o_que: "servidor HTTP" },
  { padrao: /from "pg"|drizzle-orm/, o_que: "driver de banco" },
  { padrao: /\bfetch\s*\(/, o_que: "chamada de rede" },
  { padrao: /process\.env/, o_que: "leitura de ambiente" },
];

async function arquivosDeProducao(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const encontrados: string[] = [];
  for (const e of entradas) {
    const caminho = resolve(dir, e.name);
    if (e.isDirectory()) encontrados.push(...(await arquivosDeProducao(caminho)));
    // O contrato importa `vitest` de propósito (é suíte compartilhada, roda nos
    // adaptadores); testes idem. Nenhum dos dois é código de produção.
    else if (e.name.endsWith(".ts") && !e.name.includes(".test.") && !e.name.startsWith("contrato")) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

describe("fronteira da camada de aplicação (SPEC-31)", () => {
  it("nenhum caso de uso ou porta faz I/O — quem faz é adaptador", async () => {
    const arquivos = await arquivosDeProducao(resolve(import.meta.dirname));
    expect(arquivos.length).toBeGreaterThan(0);

    const violacoes: string[] = [];
    for (const arquivo of arquivos) {
      // Sem comentários: os próprios cabeçalhos deste pacote citam `process.env`
      // e `node:fs` para dizer que são proibidos. A regra é sobre código.
      const conteudo = (await readFile(arquivo, "utf-8"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const { padrao, o_que } of PROIBIDOS) {
        if (padrao.test(conteudo)) violacoes.push(`${arquivo.split(/[\/]/).pop()}: ${o_que}`);
      }
    }
    expect(violacoes, `a aplicação não pode conhecer infraestrutura: ${violacoes.join("; ")}`).toEqual([]);
  });
});
