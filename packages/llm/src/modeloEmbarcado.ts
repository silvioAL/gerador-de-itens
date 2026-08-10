import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { caminhoDoModelo } from "./cache.js";
import { instalarDePartesNpm, type OpcoesInstalacao } from "./origens.js";
import type { ModeloRegistrado } from "./modelos.js";

/**
 * SPEC-32 — o modelo vem **junto com o pacote**, sem comando separado.
 *
 * ## Por que voltou a ser assim
 *
 * Decisão do usuário, reafirmada quatro vezes: *"melhor embarcar como nas
 * primeiras versões"*. O contexto que a justifica é concreto e não é técnico —
 * a rede da empresa bloqueia o Hugging Face, e pedir liberação de domínio exige
 * uma burocracia que não se justifica para algo ainda não validado o bastante
 * para apresentar. Uma ferramenta que só funciona depois de um chamado para a
 * infraestrutura não é usável ali.
 *
 * ## Como, dado que um pacote npm de 2,5 GB não publica
 *
 * Medido: o maior pacote real que achamos (`@qvac/llm-llamacpp`) tem **172 MB
 * de tarball**, e um de 229,9 MB já levou `413`. GGUF quase não comprime (são
 * pesos quantizados), então tarball ≈ tamanho do arquivo.
 *
 * Então o pacote principal declara as **partes** do modelo em `dependencies`.
 * O `npm install -g` puxa todas, e esta função remonta o GGUF no primeiro uso.
 * Do ponto de vista de quem instala é idêntico a estar embarcado: um comando,
 * nada de `ia instalar`.
 *
 * ## Por que na primeira leitura, e não num `postinstall`
 *
 * `postinstall` de dependência é justamente o que a política de `--allow-scripts`
 * desta ferramenta trata com desconfiança (ver README) — e um script que roda
 * automaticamente escrevendo 2,5 GB é exatamente o tipo de coisa que um
 * ambiente corporativo bloqueia. Remontar na primeira leitura não precisa de
 * permissão nenhuma: é o próprio processo do usuário, lendo arquivos que já
 * estão no `node_modules` dele.
 */

/** Onde as partes estariam se tivessem vindo junto com o pacote. */
function partesPresentes(modelo: ModeloRegistrado): boolean {
  if (!modelo.partesNpm?.length) return false;
  const requerer = createRequire(import.meta.url);
  return modelo.partesNpm.every((pacote) => {
    try {
      requerer.resolve(`${pacote}/package.json`);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Garante que o GGUF existe no cache, remontando das partes se preciso.
 *
 * Devolve `"ja-existia" | "remontado" | "sem-partes"` em vez de um booleano:
 * quem chama precisa saber se houve trabalho pra decidir se mostra progresso,
 * e "não deu" e "não precisava" são situações diferentes.
 */
export async function garantirModeloEmbarcado(
  modelo: ModeloRegistrado,
  opcoes: OpcoesInstalacao = {}
): Promise<"ja-existia" | "remontado" | "sem-partes"> {
  if (existsSync(caminhoDoModelo(modelo, opcoes.baseDir))) return "ja-existia";
  if (!partesPresentes(modelo)) return "sem-partes";

  // Reusa exatamente o caminho de `--origem npm`, incluindo a conferência de
  // SHA-256: partes vindas do `node_modules` não são mais confiáveis que
  // partes baixadas — podem estar truncadas por uma instalação interrompida.
  await instalarDePartesNpm(modelo, { ...opcoes, jaInstaladas: true });
  return "remontado";
}

/** Onde o pacote-parte foi instalado — usado por `instalarDePartesNpm` quando
 * as partes já vieram como dependência, em vez de um `npm install` novo. */
export function diretorioDaParte(pacote: string): string | undefined {
  try {
    return dirname(createRequire(import.meta.url).resolve(`${pacote}/package.json`));
  } catch {
    return undefined;
  }
}

/** Só para mensagens: quanto o `npm install -g` vai trazer a mais. */
export function tamanhoEmbarcado(modelos: ModeloRegistrado[]): number {
  return modelos.filter((m) => m.partesNpm?.length).reduce((soma, m) => soma + m.tamanhoAproximadoBytes, 0);
}

export { join };
