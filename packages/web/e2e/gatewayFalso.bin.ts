import { criarGatewayFalso, PORTA_GATEWAY_FALSO } from "./gatewayFalso";

/**
 * Entrypoint separado de propósito: `playwright.config.ts` sobe isto como um
 * `webServer`, e o spec importa `gatewayFalso.ts` só pelas constantes. Se o
 * `listen` morasse lá, importar as constantes no processo do teste abriria um
 * segundo servidor na mesma porta.
 */
criarGatewayFalso().listen(PORTA_GATEWAY_FALSO, "127.0.0.1", () => {
  console.log(`gateway falso ouvindo em http://127.0.0.1:${PORTA_GATEWAY_FALSO}`);
});
