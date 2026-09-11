import { lerCaminho } from "../config/caminho.js";
import { camposDoWebhook, type CampoDoWebhook } from "../config/gatilhos.js";

/**
 * SPEC-110 fatia L (D1) — **o corpo que chega vira a saída do gatilho.**
 *
 * A regra inteira, e ela é curta de propósito: cada campo declarado lê o corpo
 * pelo `caminho` (o subconjunto de JSONPath da SPEC-105 §9.4; ausente vale
 * `$.{chave}`), e **o resto do corpo é ignorado**. Um webhook que despejasse o
 * payload inteiro no fluxo pareceria generoso e seria o contrário: ninguém
 * saberia o que o desenho consome, e mudar o formato lá fora quebraria aqui em
 * silêncio. O que está declarado é o contrato; o que não está, não existe.
 *
 * **Campo ausente no corpo não vira default** (§9.3): ele fica FORA da saída, e
 * quem depende dele falha nomeando na hora de usar. Gravar `""` seria a mentira
 * que a casa recusa em todo lugar.
 */
export function extrairDoWebhook(campos: CampoDoWebhook[], corpo: unknown): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    const valor = lerCaminho(corpo, campo.caminho ?? `$.${campo.chave}`);
    if (valor !== undefined) saida[campo.chave] = valor;
  }
  return saida;
}

/** O mesmo, partindo dos parâmetros crus do nó — o caminho que o executor usa. */
export function saidaDoWebhook(parametros: Record<string, unknown> | undefined, corpo: unknown): Record<string, unknown> {
  return extrairDoWebhook(camposDoWebhook(parametros), corpo);
}
