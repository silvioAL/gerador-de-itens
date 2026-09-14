import type { Decisao } from "@gerador/engine";

/**
 * SPEC-81 fatia C — **ler os ADRs da casa.**
 *
 * ## O que está do outro lado
 *
 * Um endereço REST, configurado como destino de operação `adr`. Quem fala com o
 * repositório de decisões — MCP do Confluence, um serviço interno, um n8n
 * lendo markdown de um repositório git — é o gateway. O produto não sabe nem
 * precisa saber: é a mesma disciplina do gateway de IA e do exportador, escrita
 * na SPEC-49 e reafirmada pela correção que reescreveu a SPEC-81.
 *
 * ## Por que o formato de entrada é frouxo
 *
 * `AdrExterno` tem quase tudo opcional. Não é desleixo: **ADR de verdade vem em
 * formatos diferentes** — MADR, Nygard, o template que a casa inventou em 2019 —
 * e um contrato rígido faria o produto recusar exatamente os repositórios que
 * ele existe para ler. O que é obrigatório é o mínimo sem o qual não dá para
 * fazer nada: um identificador e um título.
 *
 * O preço disso é que o resto vira **lacuna contável**, e não invenção. Ver
 * `comoDecisao`.
 */
export interface AdrExterno {
  /** O identificador na casa. É por ele que a reimportação reconhece o mesmo. */
  id: string;
  titulo: string;
  contexto?: string;
  /** As alternativas consideradas, se o formato da casa as registra. */
  alternativas?: { titulo: string; consequencia?: string }[];
  escolhida?: string;
  porque?: string;
  /** `proposta | aceita | substituida` — ou o que a casa chamar. Ver `statusDe`. */
  status?: string;
  substituidaPor?: string;
  autor?: string;
  /** ISO-8601, quando a casa registra. */
  em?: string;
  /** A URL do ADR, quando existe. É o que vai para `Decisao.importadoDe`. */
  link?: string;
}

export interface LeitorDeAdr {
  /**
   * Os ADRs do repositório da casa.
   *
   * Sem filtro por enquanto, e de propósito: o uso de maior valor é ler o
   * CONJUNTO — as restrições acumuladas — para responder *"o que estou
   * desenhando contraria alguma decisão já tomada?"*. Filtrar cedo tiraria
   * justamente essa resposta.
   */
  listar(): Promise<AdrExterno[]>;
}

/**
 * O status externo mapeado para o do produto.
 *
 * Só reconhece o que ele reconhece. Um status que a casa chama de outra coisa
 * vira `proposta` — o mais fraco dos três — porque **presumir "aceita" seria dar
 * força a uma decisão que ninguém aqui conferiu**, e força indevida é
 * exatamente o defeito que a SPEC-80 §2 nomeia.
 */
export function statusDe(bruto: string | undefined): Decisao["status"] {
  const texto = (bruto ?? "").trim().toLowerCase();
  if (["aceita", "accepted", "aceito", "approved"].includes(texto)) return "aceita";
  if (["substituida", "superseded", "substituído", "substituido", "deprecated"].includes(texto)) return "substituida";
  return "proposta";
}

/** O que uma decisão importada precisa ter para ser útil, e não tem. */
export const LACUNAS_DO_ADR = ["contexto", "alternativas", "escolhida", "porque"] as const;

/**
 * `AdrExterno` → `Decisao`, com a marca de origem.
 *
 * ## As três coisas que esta função garante
 *
 * 1. **`origem: "extraido"` e `importadoDe` preenchido.** ADR importado não
 *    aparece como decisão local — é a recusa central da SPEC-81 §5, e o teste
 *    que a guarda derruba se a marca sumir (§248).
 * 2. **Nada é inventado.** Campo que a casa não registrou fica vazio, e a lacuna
 *    é contável pela máquina da SPEC-73. Preencher com texto plausível seria o
 *    defeito que a SPEC-80 §2 recusa, aplicado a dado alheio.
 * 3. **O status nunca sobe de força** (ver `statusDe`).
 *
 * O `noId`/`arestaId` fica ausente de propósito: o vínculo com o elemento do
 * desenho nasce quando o ADR VIRA desenho (fatia D), e não na importação — um
 * ADR importado antes de existir desenho não tem a que se ancorar.
 */
export function comoDecisao(adr: AdrExterno, agora: string): Decisao {
  return {
    id: `adr:${adr.id}`,
    titulo: adr.titulo,
    contexto: adr.contexto,
    alternativas: adr.alternativas ?? [],
    escolhida: adr.escolhida ?? "",
    porque: adr.porque ?? "",
    status: statusDe(adr.status),
    substituidaPor: adr.substituidaPor,
    origem: "extraido",
    // Quem decidiu foi a casa, não quem importou. Pôr aqui o nome de quem
    // clicou "importar" seria atribuir a decisão à pessoa errada, para sempre.
    autor: adr.autor ?? "importado",
    em: adr.em ?? agora,
    importadoDe: adr.link ?? adr.id,
  };
}

/** O que falta numa decisão importada — a conta que a tela mostra. */
export function lacunasDaDecisaoImportada(decisao: Decisao): string[] {
  const faltando: string[] = [];
  if (!decisao.contexto?.trim()) faltando.push("contexto");
  if (decisao.alternativas.length === 0) faltando.push("alternativas");
  if (!decisao.escolhida.trim()) faltando.push("escolhida");
  if (!decisao.porque.trim()) faltando.push("porque");
  return faltando;
}
