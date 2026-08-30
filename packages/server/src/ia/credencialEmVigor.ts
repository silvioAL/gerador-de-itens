import { PRESETS_GATEWAY } from "@gerador/llm/gateway";
import type { CredencialIa } from "@gerador/aplicacao";

/**
 * SPEC-89 fatia A — **qual credencial vale agora, e de onde ela veio.**
 *
 * ## O problema que isto resolve
 *
 * O tour termina convidando: *"a conversa está aberta. Descreva a sua demanda e
 * o agente propõe os primeiros componentes."* Numa instalação sem credencial, o
 * servidor responde **503** — e a última frase que a pessoa lê antes de tentar é
 * uma promessa que o produto não cumpre. É a régua da SPEC-76 sendo violada pelo
 * próprio tour.
 *
 * O dublê já existe (SPEC-74), já responde plausível, e já sobe no
 * `docker compose up`. Faltava o produto usá-lo sem alguém configurar à mão.
 *
 * ## Por que o fallback é DECLARADO, e nunca adivinhado
 *
 * **É metade do valor da rodada, e é o risco inteiro dela.**
 *
 * "Sem credencial, use o dublê" seria fácil e perigoso: numa implantação de
 * produção sem gateway configurado, o produto passaria a responder com texto
 * **inventado** em vez de recusar — e ninguém notaria até alguém aprovar um
 * documento escrito por um dublê.
 *
 * Então o fallback só existe onde a implantação **declara** que o dublê está lá,
 * por `GATEWAY_FALSO_URL`. O `docker-compose.yml` declara (ele sobe o serviço);
 * uma implantação de produção simplesmente não declara, e o 503 continua sendo o
 * comportamento — idêntico ao de hoje.
 *
 * É o mesmo desenho da SPEC-74 fatia B para o serviço: quem tem o dublê diz que
 * tem.
 *
 * ## Por que NÃO importamos de `@gerador/gateway-falso`
 *
 * A SPEC-74 fatia A escolheu o dublê como pacote próprio justamente para ele
 * **não entrar na imagem de produção** — `packages/server/Dockerfile` copia o
 * `llm`, e um `import` daqui arrastaria o dublê junto. A fronteira que
 * `gateway.fronteira.test.ts` guarda existe para isso não acontecer.
 *
 * Os valores saem do PRESET, que é onde eles já viviam para a tela oferecer o
 * destino "Sem custo" — um dono só (§263).
 *
 * E o import é de `@gerador/llm/gateway`, **não** da raiz: a raiz alcança o
 * modelo local (`node-llama-cpp`), e importá-la daqui quebrou o build do
 * servidor com *"top-level await não é suportado com cjs"*. O subpath existe
 * exatamente para essa fronteira, e `routes/ia.ts` já o usava — eu é que
 * escrevi o caminho errado.
 */

const PRESET_SEM_CUSTO = PRESETS_GATEWAY.find((p) => p.id === "sem-custo");

/**
 * A chave do dublê é pública e não guarda segredo nenhum — ele existe
 * justamente para não haver o que guardar. Fica aqui como default para o
 * compose poder trocá-la sem o produto precisar saber.
 */
const CHAVE_PADRAO_DO_DUBLE = "chave-de-mentira-do-e2e";

export interface CredencialEmVigor {
  credencial: CredencialIa;
  /**
   * `true` quando o que responde é o dublê.
   *
   * Quem chama **precisa** repassar isto adiante: conteúdo simulado que não
   * chega marcado é exatamente o defeito que a SPEC-74 fatia D existe para
   * evitar, e a fatia D desta SPEC tem um teste que falha se algum caminho
   * esquecer.
   */
  simulado: boolean;
}

/** O endereço do dublê, quando a implantação declara que ele existe aqui. */
export function enderecoDoDuble(env: NodeJS.ProcessEnv = process.env): string | null {
  const declarado = env.GATEWAY_FALSO_URL?.trim();
  return declarado ? declarado : null;
}

/**
 * A credencial salva; na falta dela, a do dublê — **se e somente se** a
 * implantação declarou que o dublê está aqui.
 *
 * `null` quando não há nem uma nem outra: aí o 503 de sempre, com a mesma frase
 * de sempre. Nada muda para quem não tem o dublê.
 */
export function credencialEmVigor(
  salva: CredencialIa | null,
  env: NodeJS.ProcessEnv = process.env
): CredencialEmVigor | null {
  // Credencial de verdade SEMPRE vence. Quem configurou um gateway real não pode
  // ver o produto responder pelo dublê — é a mesma régua do §306 (declarado
  // vence herdado) e a promessa que a SPEC-74 fatia B fez em voz alta.
  if (salva?.baseUrl && salva.chave) return { credencial: salva, simulado: false };

  const endereco = enderecoDoDuble(env);
  if (!endereco) return null;

  return {
    simulado: true,
    credencial: {
      baseUrl: endereco,
      // A chave do dublê é pública e está no código dele: ele existe para não
      // guardar segredo nenhum.
      chave: env.GATEWAY_FALSO_CHAVE?.trim() || CHAVE_PADRAO_DO_DUBLE,
      modelo: PRESET_SEM_CUSTO?.modeloPadrao ?? "modelo-de-mentira",
      // O mesmo dialeto que `formatoJsonPorBaseUrl` daria a um endereço
      // desconhecido — os dois caminhos concordam de propósito (SPEC-74).
      formatoJson: "json_object",
    } as CredencialIa,
  };
}

/** O endereço padrão que o compose declara — exportado para o README e o teste
 * falarem do mesmo valor, em vez de duas cópias que divergem. */
export const URL_DO_DUBLE_NO_COMPOSE = PRESET_SEM_CUSTO?.baseUrl ?? "";
