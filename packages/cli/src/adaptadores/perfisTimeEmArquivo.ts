import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PerfilDeTime, PerfisDeTimes, RepositorioDePerfisTime } from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 2 — adaptador de arquivo dos perfis de time.
 * `config/perfis-time.json` já guarda exatamente a forma aninhada da porta,
 * então aqui não há tradução nenhuma — só leitura, mescla e gravação.
 */
export function criarRepositorioDePerfisTimeEmArquivo(dirProjeto: string): RepositorioDePerfisTime {
  const arquivo = resolve(dirProjeto, "config", "perfis-time.json");

  async function ler(): Promise<PerfisDeTimes> {
    try {
      return JSON.parse(await readFile(arquivo, "utf-8")) as PerfisDeTimes;
    } catch {
      return {};
    }
  }

  return {
    listarTodos: ler,

    async obter(timeId) {
      return (await ler())[timeId] ?? {};
    },

    async definir(timeId, tipoNo, valores) {
      const perfis = await ler();
      const doTime: PerfilDeTime = perfis[timeId] ?? {};
      doTime[tipoNo] = { ...doTime[tipoNo], ...valores };
      perfis[timeId] = doTime;

      await mkdir(resolve(dirProjeto, "config"), { recursive: true });
      await writeFile(arquivo, JSON.stringify(perfis, null, 2), "utf-8");
      return doTime[tipoNo];
    },
  };
}
