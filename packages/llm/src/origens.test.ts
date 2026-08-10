import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instalarDeArquivoLocal, instalarDePartesNpm } from "./origens.js";
import type { ModeloRegistrado } from "./modelos.js";

/**
 * SPEC-32. O que estes testes protegem não é "o arquivo foi copiado" — é o que
 * acontece quando NÃO deu certo. Instalar um modelo errado não estoura: gera
 * lixo depois, longe da causa. Por isso ordem das partes e hash são o centro.
 */
/**
 * Conteúdo NÃO periódico de propósito, e custou duas tentativas.
 *
 * A primeira usava `"gguf-de-mentira-".repeat(64)`; a segunda, `(i*37+11)%256`.
 * As duas fizeram o teste de "parte fora de ordem" passar verde por acidente:
 * num buffer periódico, trocar as metades devolve os MESMOS bytes, então o
 * hash batia e o teste não testava nada. (A segunda enganou porque parecia
 * aleatória — mas `37i+11 mod 256` tem período 256, e 1024 bytes são 4 blocos
 * iguais.)
 *
 * Fica registrado porque é o mesmo erro que o código evita: um fixture
 * repetitivo esconde exatamente o bug que este arquivo existe pra pegar.
 */
const CONTEUDO = randomBytes(1024);
const SHA = createHash("sha256").update(CONTEUDO).digest("hex");

function modelo(extra: Partial<ModeloRegistrado> = {}): ModeloRegistrado {
  return {
    id: "qwen-local",
    nome: "Modelo de teste",
    papel: "teste",
    repositorioHuggingFace: "fake/fake",
    nomeArquivo: "teste.gguf",
    tamanhoAproximadoBytes: CONTEUDO.length,
    ...extra,
  };
}

let base: string;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "gerador-origens-"));
});
afterEach(() => vi.restoreAllMocks());

describe("instalarDeArquivoLocal (SPEC-32)", () => {
  it("copia o gguf pro cache e devolve o caminho final", async () => {
    const origem = join(base, "origem.gguf");
    await writeFile(origem, CONTEUDO);

    const destino = await instalarDeArquivoLocal(modelo(), origem, { baseDir: base });

    expect(destino.endsWith("teste.gguf")).toBe(true);
    expect(await readFile(destino)).toEqual(CONTEUDO);
  });

  it("caminho inexistente diz o formato certo do comando, nao so 'nao encontrado'", async () => {
    await expect(instalarDeArquivoLocal(modelo(), join(base, "nao-existe.gguf"), { baseDir: base })).rejects.toThrow(
      /gerador ia instalar --de/
    );
  });

  it("apontar pra pasta sugere o caminho do arquivo — o erro mais provavel de todos", async () => {
    await expect(instalarDeArquivoLocal(modelo(), base, { baseDir: base })).rejects.toThrow(/é uma pasta/);
  });

  it("arquivo de tamanho absurdo e recusado antes de virar 'o modelo e ruim'", async () => {
    // O caso real: baixar de um link que devolveu HTML de erro, salvar com
    // nome .gguf, e passar a sessao achando que o modelo alucina.
    const origem = join(base, "errado.gguf");
    await writeFile(origem, Buffer.from("nada"));

    await expect(instalarDeArquivoLocal(modelo(), origem, { baseDir: base })).rejects.toThrow(/deveria ter perto de/);
  });

  it("hash divergente apaga o que escreveu — nao deixa meio modelo instalado", async () => {
    const origem = join(base, "origem.gguf");
    await writeFile(origem, CONTEUDO);

    await expect(
      instalarDeArquivoLocal(modelo({ sha256: "0".repeat(64) }), origem, { baseDir: base })
    ).rejects.toThrow(/corrompido/);
  });
});

describe("instalarDePartesNpm (SPEC-32)", () => {
  /** Monta o que o `npm install` teria deixado no prefixo. */
  function execFalso(partes: Buffer[]) {
    return async (_comando: string, args: string[]) => {
      const prefixo = args[args.indexOf("--prefix") + 1];
      const pacotes = args.slice(args.indexOf("--no-fund") + 1);
      for (const [i, pacote] of pacotes.entries()) {
        const dir = join(prefixo, "node_modules", ...pacote.split("/"));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "parte.bin"), partes[i]);
      }
    };
  }

  const metade = CONTEUDO.length / 2;
  const p1 = CONTEUDO.subarray(0, metade);
  const p2 = CONTEUDO.subarray(metade);

  it("remonta o arquivo a partir das partes, na ordem da lista", async () => {
    const m = modelo({ partesNpm: ["@x/parte-1", "@x/parte-2"], sha256: SHA });

    const destino = await instalarDePartesNpm(m, { baseDir: base, execImpl: execFalso([p1, p2]) });

    expect(await readFile(destino)).toEqual(CONTEUDO);
  });

  it("parte fora de ordem e pega pelo hash — sem isso o arquivo teria o tamanho certo", async () => {
    // A falha mais perigosa do desenho: readdir nao promete ordem, entao juntar
    // "o que estiver la" produziria um gguf integro em tamanho e corrompido em
    // conteudo. O sintoma seria o modelo respondendo lixo, longe daqui.
    const m = modelo({ partesNpm: ["@x/parte-1", "@x/parte-2"], sha256: SHA });

    await expect(instalarDePartesNpm(m, { baseDir: base, execImpl: execFalso([p2, p1]) })).rejects.toThrow(
      /corrompido/
    );
  });

  it("modelo sem partes publicadas manda usar o arquivo local, em vez de falhar seco", async () => {
    await expect(instalarDePartesNpm(modelo(), { baseDir: base })).rejects.toThrow(/--de <caminho do \.gguf>/);
  });

  it("registry sem os pacotes vira instrucao, nao stack trace do npm", async () => {
    const m = modelo({ partesNpm: ["@x/parte-1"], sha256: SHA });
    const exec = vi.fn().mockRejectedValue(new Error("E404 Not Found - GET https://registry/@x/parte-1"));

    await expect(instalarDePartesNpm(m, { baseDir: base, execImpl: exec })).rejects.toThrow(/use --de/);
  });

  it("relata as duas etapas — baixar e montar tem duracoes muito diferentes", async () => {
    const m = modelo({ partesNpm: ["@x/parte-1", "@x/parte-2"], sha256: SHA });
    const etapas: string[] = [];

    await instalarDePartesNpm(m, {
      baseDir: base,
      execImpl: execFalso([p1, p2]),
      onProgresso: (p) => etapas.push(p.etapa),
    });

    expect(etapas).toContain("baixando");
    expect(etapas).toContain("montando");
    expect(etapas).toContain("verificando");
  });
});
