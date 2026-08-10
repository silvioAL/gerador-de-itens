import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAMPO_GLOBAL,
  type CampoNo,
  type DadosCampoNo,
  type RepositorioDeCamposNo,
} from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 2 — adaptador de arquivo da porta de Campos por tipo de nó.
 * Tudo num `config/campos-no.json`: é config de projeto, versionável junto com
 * o resto do `config/`, e um arquivo por campo só espalharia o que se lê junto.
 */
export function criarRepositorioDeCamposNoEmArquivo(dirProjeto: string): RepositorioDeCamposNo {
  const arquivo = resolve(dirProjeto, "config", "campos-no.json");

  async function ler(): Promise<CampoNo[]> {
    try {
      return JSON.parse(await readFile(arquivo, "utf-8")) as CampoNo[];
    } catch {
      // Arquivo ausente é projeto sem campo customizado, não erro.
      return [];
    }
  }

  async function gravar(campos: CampoNo[]): Promise<void> {
    await mkdir(resolve(dirProjeto, "config"), { recursive: true });
    await writeFile(arquivo, JSON.stringify(campos, null, 2), "utf-8");
  }

  return {
    async listar(timeId) {
      const campos = await ler();
      return campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
    },

    async obter(id) {
      return (await ler()).find((c) => c.id === id) ?? null;
    },

    async salvar(dados: DadosCampoNo) {
      const campos = await ler();
      const existente = campos.find(
        (c) => c.timeId === dados.timeId && c.tipoNo === dados.tipoNo && c.key === dados.key
      );
      const salvo: CampoNo = { ...dados, id: existente?.id ?? randomUUID() };
      await gravar([...campos.filter((c) => c.id !== salvo.id), salvo]);
      return salvo;
    },

    async atualizar(id, parcial) {
      const campos = await ler();
      const alvo = campos.find((c) => c.id === id);
      if (!alvo) return null;

      const atualizado: CampoNo = { ...alvo, ...parcial, id: alvo.id };
      await gravar(campos.map((c) => (c.id === id ? atualizado : c)));
      return atualizado;
    },

    async excluir(id) {
      const campos = await ler();
      if (!campos.some((c) => c.id === id)) return false;
      await gravar(campos.filter((c) => c.id !== id));
      return true;
    },
  };
}
