/**
 * SPEC-74 — a porta de entrada do dublê de IA.
 *
 * Quem consome isto são os specs do Playwright (pelas constantes) e o `bin.ts`
 * (pela fábrica). Não há dependência de runtime nenhuma: o dublê é `node:http`
 * puro, e é isso que o torna barato o bastante para subir junto da stack.
 */
export {
  BASE_URL_GATEWAY_FALSO,
  CHAVE_GATEWAY_FALSO,
  criarGatewayFalso,
  MARCA_GATEWAY_FALSO,
  MARCA_VIU_IMAGEM,
  MODELO_GATEWAY_FALSO,
  PEDIR_FALHA_AO_GATEWAY,
  PORTA_GATEWAY_FALSO,
  TEXTO_TRANSCRITO_FALSO,
} from "./gatewayFalso.js";
