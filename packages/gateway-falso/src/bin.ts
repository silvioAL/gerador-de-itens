import { criarGatewayFalso, CHAVE_GATEWAY_FALSO, PORTA_GATEWAY_FALSO } from "./gatewayFalso.js";

/**
 * Entrypoint separado de propósito: `playwright.config.ts` sobe isto como um
 * `webServer`, e o spec importa `gatewayFalso.ts` só pelas constantes. Se o
 * `listen` morasse lá, importar as constantes no processo do teste abriria um
 * segundo servidor na mesma porta.
 *
 * SPEC-74 fatia B — este é o ÚNICO lugar que lê `process.env`, e todo default é
 * o valor de hoje. Rodar sem variável nenhuma (o caso da suíte E2E) tem que
 * continuar dando exatamente o mesmo processo de antes.
 *
 * `GATEWAY_FALSO_HOST` existe por um motivo concreto: `127.0.0.1` dentro de um
 * container o torna inalcançável pelos vizinhos da rede do compose — o servidor
 * receberia "connection refused" de um serviço que está de pé. O default segue
 * sendo o endereço fechado, porque abrir por engano na máquina de alguém é pior
 * do que uma variável a mais no `docker-compose.yml`.
 */
const host = process.env.GATEWAY_FALSO_HOST ?? "127.0.0.1";
const porta = Number(process.env.GATEWAY_FALSO_PORTA ?? PORTA_GATEWAY_FALSO);
const chave = process.env.GATEWAY_FALSO_CHAVE ?? CHAVE_GATEWAY_FALSO;
// Qualquer valor que não seja exatamente `plausivel` mantém o esqueleto. Um
// default frouxo aqui ligaria o modo novo por typo, e o typo apareceria como
// suíte E2E vermelha em outro lugar.
const respostas = process.env.GATEWAY_FALSO_RESPOSTAS === "plausivel" ? "plausivel" : "esqueleto";
const latenciaMs = Number(process.env.GATEWAY_FALSO_LATENCIA_MS ?? 0) || 0;

criarGatewayFalso({ chave, respostas, latenciaMs }).listen(porta, host, () => {
  console.log(`gateway falso ouvindo em http://${host}:${porta} (respostas: ${respostas}, latência: ${latenciaMs}ms)`);
});
