import { stat } from "node:fs/promises";
import { caminhoDoModelo, diretorioDeModelos } from "./cache.js";
import { MODELOS_CHAT, MODELO_EMBEDDING, modeloChatPorId, type ModeloRegistrado } from "./modelos.js";

/** Um modelo de chat e se ele está baixado — alimenta os cards da aba
 * "Modelo de IA" e o `gerador ia status` (SPEC-25). */
export interface StatusModeloChat {
  id: string;
  nome: string;
  papel: string;
  instalado: boolean;
  tamanhoAproximadoBytes: number;
  raciocinador: boolean;
  selecionado: boolean;
}

export interface StatusIa {
  /** Do modelo SELECIONADO — é o que decide se a esteira pode rodar. */
  chatInstalado: boolean;
  embeddingInstalado: boolean;
  /** `true` só quando o modelo de chat selecionado E o de embedding estão
   * presentes — é o que a UI/CLI checam pra liberar funcionalidade de IA. */
  pronto: boolean;
  caminhoModelos: string;
  /** Id do provedor/modelo selecionado (`config/ia.json`). */
  provedor: string;
  modelosChat: StatusModeloChat[];
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

/**
 * Aceita `baseDir` opcional (só testes) — mesmo padrão de `cache.ts`.
 * `idChatSelecionado` (SPEC-25) vem de `config/ia.json`; ausente/desconhecido
 * cai no modelo padrão, então o comportamento pré-Fase 0 é preservado.
 */
export async function verificarStatus(baseDir?: string, idChatSelecionado?: string): Promise<StatusIa> {
  const selecionado: ModeloRegistrado = modeloChatPorId(idChatSelecionado);
  const [instaladosChat, embeddingInstalado] = await Promise.all([
    Promise.all(MODELOS_CHAT.map((m) => existeArquivoNaoVazio(caminhoDoModelo(m, baseDir)))),
    existeArquivoNaoVazio(caminhoDoModelo(MODELO_EMBEDDING, baseDir)),
  ]);

  const modelosChat: StatusModeloChat[] = MODELOS_CHAT.map((modelo, i) => ({
    id: modelo.id,
    nome: modelo.nome,
    papel: modelo.papel,
    instalado: instaladosChat[i],
    tamanhoAproximadoBytes: modelo.tamanhoAproximadoBytes,
    raciocinador: modelo.raciocinador === true,
    selecionado: modelo.id === selecionado.id,
  }));

  const chatInstalado = modelosChat.find((m) => m.selecionado)?.instalado ?? false;
  return {
    chatInstalado,
    embeddingInstalado,
    pronto: chatInstalado && embeddingInstalado,
    caminhoModelos: diretorioDeModelos(baseDir),
    provedor: selecionado.id,
    modelosChat,
  };
}
