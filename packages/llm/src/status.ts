import { stat } from "node:fs/promises";
import { caminhoDoModelo, diretorioDeModelos } from "./cache.js";
import { lerCredenciais, resumirCredencial } from "./credenciais.js";
import {
  ID_PROVEDOR_GATEWAY,
  MODELOS_CHAT,
  MODELO_EMBEDDING,
  NOME_PROVEDOR_GATEWAY,
  PAPEL_PROVEDOR_GATEWAY,
  PRESETS_GATEWAY,
  modeloChatPorId,
  type ModeloRegistrado,
  type PresetGateway,
} from "./modelos.js";

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
  /** Provedor remoto (SPEC-25 Fase 2): não se baixa, se CONFIGURA. Aqui
   * `instalado` quer dizer "credencial preenchida", e a UI mostra os três
   * campos em vez do botão de download. */
  remoto?: boolean;
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
  /** O que dá pra mostrar da credencial do gateway sem expor a chave —
   * `chaveMascarada`, nunca a chave. Sempre presente (com
   * `configurado: false` quando não há nada), pra UI não precisar de guarda. */
  gateway: ReturnType<typeof resumirCredencial>;
  /**
   * Destinos conhecidos do gateway, pra UI preencher base URL e modelo. Vem do
   * servidor em vez de uma cópia no front pelo mesmo motivo do catálogo de
   * acessos: lista duplicada envelhece em silêncio, e `packages/web` não pode
   * importar `@gerador/llm` — o pacote arrasta `node-llama-cpp` (binário
   * nativo) pro bundle do navegador.
   */
  presetsGateway: PresetGateway[];
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
  const gatewaySelecionado = idChatSelecionado === ID_PROVEDOR_GATEWAY;
  const selecionado: ModeloRegistrado = modeloChatPorId(idChatSelecionado);
  const [instaladosChat, embeddingInstalado, credenciais] = await Promise.all([
    Promise.all(MODELOS_CHAT.map((m) => existeArquivoNaoVazio(caminhoDoModelo(m, baseDir)))),
    existeArquivoNaoVazio(caminhoDoModelo(MODELO_EMBEDDING, baseDir)),
    lerCredenciais(baseDir),
  ]);
  const gateway = resumirCredencial(credenciais[ID_PROVEDOR_GATEWAY]);

  const modelosChat: StatusModeloChat[] = MODELOS_CHAT.map((modelo, i) => ({
    id: modelo.id,
    nome: modelo.nome,
    papel: modelo.papel,
    instalado: instaladosChat[i],
    tamanhoAproximadoBytes: modelo.tamanhoAproximadoBytes,
    raciocinador: modelo.raciocinador === true,
    selecionado: modelo.id === selecionado.id && !gatewaySelecionado,
  }));

  // O gateway entra na MESMA lista dos locais porque a aba é uma lista só de
  // cards com um radio — mas com `remoto: true`, que é o que faz a UI mostrar
  // "base URL / chave / modelo" no lugar de "2,5 GB, baixar".
  modelosChat.push({
    id: ID_PROVEDOR_GATEWAY,
    nome: NOME_PROVEDOR_GATEWAY,
    papel: PAPEL_PROVEDOR_GATEWAY,
    // "instalado", pra um provedor remoto, é ter credencial — é a mesma
    // pergunta que o card responde ("dá pra usar isto agora?").
    instalado: gateway.configurado,
    tamanhoAproximadoBytes: 0,
    raciocinador: false,
    selecionado: gatewaySelecionado,
    remoto: true,
  });

  const chatInstalado = gatewaySelecionado ? gateway.configurado : (instaladosChat[MODELOS_CHAT.indexOf(selecionado)] ?? false);
  return {
    chatInstalado,
    embeddingInstalado,
    // O embedding local só serve ao RAG de retrospectivas — exigir 650 MB
    // baixados de quem escolheu rodar tudo por gateway travaria a esteira sem
    // motivo. Por isso o gate do gateway é só a credencial.
    pronto: gatewaySelecionado ? gateway.configurado : chatInstalado && embeddingInstalado,
    caminhoModelos: diretorioDeModelos(baseDir),
    provedor: gatewaySelecionado ? ID_PROVEDOR_GATEWAY : selecionado.id,
    modelosChat,
    gateway,
    presetsGateway: PRESETS_GATEWAY,
  };
}
