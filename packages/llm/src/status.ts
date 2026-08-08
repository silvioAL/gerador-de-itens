import { stat } from "node:fs/promises";
import { caminhoDoModelo, diretorioDeModelos } from "./cache.js";
import { MODELO_CHAT, MODELO_EMBEDDING } from "./modelos.js";

export interface StatusIa {
  chatInstalado: boolean;
  embeddingInstalado: boolean;
  /** `true` só quando os dois modelos estão presentes — é o que a UI/CLI
   * checam pra decidir se libera qualquer funcionalidade de IA. */
  pronto: boolean;
  caminhoModelos: string;
}

async function existeArquivoNaoVazio(caminho: string): Promise<boolean> {
  try {
    const info = await stat(caminho);
    // achado esperado: download.ts escreve em `.part` e só renomeia pro nome
    // final ao terminar — um arquivo final com tamanho 0 não deveria existir
    // em uso normal, mas checar mesmo assim evita "instalado" falso-positivo
    // se algo externo criar o arquivo vazio (ex.: `touch` manual).
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

/** Aceita `baseDir` opcional (só testes) — mesmo padrão de `cache.ts`. */
export async function verificarStatus(baseDir?: string): Promise<StatusIa> {
  const [chatInstalado, embeddingInstalado] = await Promise.all([
    existeArquivoNaoVazio(caminhoDoModelo(MODELO_CHAT, baseDir)),
    existeArquivoNaoVazio(caminhoDoModelo(MODELO_EMBEDDING, baseDir)),
  ]);
  return {
    chatInstalado,
    embeddingInstalado,
    pronto: chatInstalado && embeddingInstalado,
    caminhoModelos: diretorioDeModelos(baseDir),
  };
}
