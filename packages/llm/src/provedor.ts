import type { GbnfJsonSchema } from "node-llama-cpp";
import { caminhoDoModelo } from "./cache.js";
import { lerCredenciais } from "./credenciais.js";
import { carregarModeloChat } from "./motor.js";
import { ID_PROVEDOR_GATEWAY, modeloChatPorId, type ModeloRegistrado } from "./modelos.js";
import { criarProvedorCompativelOpenAI } from "./provedorOpenAI.js";

export interface OpcoesGeracao {
  /** Texto da RESPOSTA sendo gerada, pedaço a pedaço. Raciocínio de modelo
   * raciocinador nunca chega aqui (ver `motor.ts`). */
  onTexto?: (pedaco: string) => void;
}

/**
 * SPEC-25 Fase 0 — a fronteira entre "de onde vem a inteligência" e o resto
 * do produto. Todo consumidor (rotas de `/ia/*`) fala só com esta interface;
 * trocar o modelo local pelo wrapper corporativo ou por um gateway remoto
 * (Fase 2) não toca em quem chama. Hoje existe um provedor local só — a
 * abstração não sobrevive por causa da pluralidade de modelos locais (essa
 * acabou na Fase 1, ver SPEC-25 §4.3), e sim por causa da Fase 2.
 *
 * O contrato que precisa valer em QUALQUER implementação: entra um prompt,
 * o texto streama, e no fim o corpo completo de `completarEstruturado` é
 * um JSON válido no schema pedido. Como cada provedor garante isso é
 * problema dele — GBNF nos locais, tool use forçado no Anthropic,
 * `json_object` + validação nos compatíveis com OpenAI.
 */
export interface ProvedorIa {
  readonly id: string;
  readonly nome: string;
  completar(prompt: string, opcoes?: OpcoesGeracao): Promise<string>;
  /** O tipo de retorno fica a cargo de quem chama (`as T` no call site) —
   * mesma limitação de generics de ordem superior documentada em `motor.ts`. */
  completarEstruturado(prompt: string, schema: GbnfJsonSchema, opcoes?: OpcoesGeracao): Promise<unknown>;
  descartar(): Promise<void>;
}

/**
 * Provedor local sobre `node-llama-cpp`, parametrizado pelo modelo — é o
 * mesmo caminho de código que existia antes da Fase 0 (nenhuma mudança de
 * comportamento pro Qwen), agora com o modelo vindo de fora em vez de fixo.
 */
export async function criarProvedorLocal(modelo: ModeloRegistrado, baseDir?: string): Promise<ProvedorIa> {
  const motor = await carregarModeloChat(caminhoDoModelo(modelo, baseDir), { raciocinador: modelo.raciocinador });
  return {
    id: modelo.id,
    nome: modelo.nome,
    completar: (prompt, opcoes) => motor.completar(prompt, opcoes),
    completarEstruturado: (prompt, schema, opcoes) => motor.completarComSchema(prompt, schema, opcoes),
    descartar: () => motor.descartar(),
  };
}

/**
 * Resolve o provedor a partir do id gravado em `config/ia.json`. Id
 * desconhecido cai no modelo local padrão (nunca deixa o servidor sem IA por
 * causa de config editada à mão).
 *
 * O gateway (Fase 2) é a única exceção que pode FALHAR em vez de cair no
 * padrão: se a pessoa selecionou "gateway" e não configurou a credencial,
 * silenciosamente rodar o Qwen local seria pior — ela veria respostas
 * diferentes das esperadas sem entender por quê. O erro diz o que fazer.
 */
export async function criarProvedorPorId(id: string | undefined, baseDir?: string): Promise<ProvedorIa> {
  if (id === ID_PROVEDOR_GATEWAY) {
    const credencial = (await lerCredenciais(baseDir))[ID_PROVEDOR_GATEWAY];
    if (!credencial?.baseUrl || !credencial?.chave || !credencial?.modelo) {
      throw new Error(
        "Gateway selecionado mas sem credencial — rode `gerador ia conectar` ou preencha o card na aba “Modelo de IA”."
      );
    }
    return criarProvedorCompativelOpenAI({
      baseUrl: credencial.baseUrl,
      chave: credencial.chave,
      modelo: credencial.modelo,
      cabecalhos: credencial.cabecalhos,
      formatoJson: credencial.formatoJson,
    });
  }
  return criarProvedorLocal(modeloChatPorId(id), baseDir);
}
