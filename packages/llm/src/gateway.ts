/**
 * SPEC-31 Fase 4 — a porta de entrada do `@gerador/llm` **sem binário nativo**.
 *
 * O modo hospedado roda em container e nunca vai carregar um GGUF: `llama.cpp`
 * ali é 200 MB de binário que jamais executa. Este módulo exporta só o caminho
 * de gateway (HTTP para um endpoint compatível com a API da OpenAI — o wrapper
 * corporativo, a Anthropic, DeepSeek, Ollama) e nada que importe
 * `node-llama-cpp`, direta ou indiretamente.
 *
 * Quem quiser o modelo local importa `@gerador/llm` normalmente; é o modo
 * local, onde o binário faz sentido. A separação é por ARQUIVO, não por flag:
 * um `if` em runtime não impede o bundler de arrastar a dependência junto.
 */
export type { EsquemaJson } from "./esquema.js";
export {
  ehSimulado,
  formatoJsonPorBaseUrl,
  PRESETS_GATEWAY,
  presetGatewayPorId,
  presetsDoModo,
  temVisao,
  type PresetGateway,
} from "./presets.js";
export type { OpcoesGeracao, ProvedorIa } from "./tipos.js";
export {
  comAdditionalPropertiesFalse,
  criarProvedorCompativelOpenAI,
  validarContraSchema,
  type FormatoJson,
  type OpcoesProvedorOpenAI,
} from "./provedorOpenAI.js";
export {
  caminhoCredenciais,
  lerCredenciais,
  resumirCredencial,
  salvarCredencial,
  type CredencialProvedor,
  type Credenciais,
} from "./credenciais.js";
