import type { DiagramaConfig, RegrasConfig } from "../config/types.js";

/**
 * SPEC-30 Fase 1a — o vocabulário que a transcrição precisa conhecer.
 *
 * ## Por que isto existe (medido, não suposto)
 *
 * Ditando a mesma frase para o Whisper `base`, em CPU:
 *
 * ```
 * sem vocabulário:  "fila do rabitém IKEA … com dedileta arquil e idem potência"
 * com vocabulário:  "fila do RabbitMQ … com dead letter queue e idempotência"
 * ```
 *
 * O português comum já saía perfeito nos dois. O que o modelo errava era
 * **exatamente o jargão** — que é o vocabulário desta ferramenta. E subir o
 * modelo NÃO resolvia: o `large-v3-turbo` (1,6 GB, 11 s) continuava errando,
 * enquanto o `base` (145 MB, 1,1 s) com estas palavras acertava tudo.
 *
 * ## Por que derivar da config, e não uma lista fixa
 *
 * Porque a ferramenta **já sabe** o vocabulário dela: os rótulos dos tipos de
 * nó, as techs e os contextos das regras são exatamente os termos que a pessoa
 * fala ao descrever uma demanda. Um time de Camunda e FICO recebe um
 * vocabulário; um de Kafka e Redis recebe outro — sem ninguém manter lista.
 *
 * É a mesma regra do resto do produto: nada adivinhado, tudo derivado de
 * configuração explícita. E é o motivo de **fine-tuning não fazer sentido
 * aqui** — treinar um modelo para aprender termos que já estão num JSON seria
 * pagar caro, e em manutenção eterna, por algo que uma linha de prompt resolve.
 */

/**
 * Nomes de produto que aparecem em qualquer conversa de arquitetura.
 *
 * ACHADO REAL, validando contra o Whisper de verdade: o vocabulário derivado da
 * config sozinho não bastou para "RabbitMQ" — porque na config o rótulo é
 * **"Fila Rabbit"**, e o que a pessoa FALA é "RabbitMQ". Com só o label, o
 * modelo saiu de "rabitém IKEA" para "RabbitMiki": melhorou e continuou errado.
 *
 * A lição é geral e vale registrar: **o rótulo da tela nem sempre é a palavra
 * dita.** Derivar da config cobre o que o time nomeou; esta lista cobre o que a
 * indústria nomeou.
 */
const NOMES_DE_PRODUTO = [
  "RabbitMQ",
  "Kafka",
  "MongoDB",
  "PostgreSQL",
  "Redis",
  "Camunda",
  "Elasticsearch",
  "Kubernetes",
  "Spring Boot",
  "Spring Batch",
];

/** Termos que valem para qualquer projeto — o jargão do ofício, que não está
 * na config de ninguém mas aparece em toda conversa de arquitetura. */
const TERMOS_DE_BASE = [
  "microsserviço",
  "endpoint",
  "payload",
  "idempotência",
  "dead letter queue",
  "DLQ",
  "consumer",
  "producer",
  "tópico",
  "fila",
  "retentativa",
  "timeout",
  "webhook",
  "batch",
  "cache",
];

/**
 * Teto de tamanho. O `initial_prompt` do Whisper vive na janela de contexto do
 * modelo (224 tokens no padrão) — passar do teto não dá erro, o começo é
 * silenciosamente descartado, que é o pior tipo de falha. Cortar aqui, com
 * ordem previsível, é o que mantém o comportamento explicável.
 */
const LIMITE_CARACTERES = 850;

export interface OpcoesVocabulario {
  /** Rótulos do diagrama aberto (nomes de serviço, fila, banco). São os termos
   * mais específicos que existem — e os que nenhum modelo genérico conhece. */
  rotulos?: string[];
}

/**
 * Monta a frase de contexto que vai como `prompt` na transcrição.
 *
 * A ordem importa e é deliberada: **do mais específico para o mais genérico**.
 * Se o teto cortar, o que sobrevive é o que o modelo tem menos chance de
 * acertar sozinho — o nome do serviço do time, não a palavra "fila".
 */
export function montarVocabularioTranscricao(
  config: Pick<DiagramaConfig, "nodeTypes"> | undefined,
  regras?: Pick<RegrasConfig, "porTech"> | undefined,
  opcoes: OpcoesVocabulario = {}
): string {
  const termos: string[] = [];
  const vistos = new Set<string>();

  const adicionar = (valor: string | undefined) => {
    const termo = (valor ?? "").trim();
    if (!termo) return;
    // Case-insensitive: "Kafka" e "kafka" são o mesmo termo pro modelo, e
    // repetir gasta o orçamento de contexto sem ganhar nada.
    const chave = termo.toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    termos.push(termo);
  };

  // 1. Nomes próprios do desenho — o mais específico que existe.
  for (const rotulo of opcoes.rotulos ?? []) adicionar(rotulo);

  // 2. Rótulos dos tipos de nó ("Fila Rabbit", "Processo Camunda", "FICO").
  for (const tipo of Object.values(config?.nodeTypes ?? {})) adicionar(tipo?.label);

  // 3. Techs e contextos das regras — o vocabulário de processo do time.
  for (const [tech, regra] of Object.entries(regras?.porTech ?? {})) {
    adicionar(tech);
    for (const t of regra?.testes ?? []) for (const c of t.contextos ?? []) adicionar(c);
  }

  // 4. Nomes de produto. Vêm ANTES do jargão genérico porque a medição mostrou
  //    que é neles que o modelo mais erra — e o rótulo da config ("Fila
  //    Rabbit") não é a palavra que a pessoa fala ("RabbitMQ").
  for (const termo of NOMES_DE_PRODUTO) adicionar(termo);

  // 5. O jargão do ofício, por último: é o que o modelo tem mais chance de
  //    acertar sozinho, e portanto o que menos dói perder no corte.
  for (const termo of TERMOS_DE_BASE) adicionar(termo);

  if (termos.length === 0) return "";

  // A frase em português é de propósito: o `initial_prompt` também sinaliza
  // idioma e estilo pro modelo, e uma lista solta de palavras em inglês
  // empurraria a transcrição inteira pro inglês.
  const prefixo = "Vocabulário técnico usado nesta conversa: ";
  let frase = prefixo;
  for (const termo of termos) {
    const proximo = frase === prefixo ? `${frase}${termo}` : `${frase}, ${termo}`;
    if (proximo.length > LIMITE_CARACTERES - 1) break;
    frase = proximo;
  }
  return `${frase}.`;
}
