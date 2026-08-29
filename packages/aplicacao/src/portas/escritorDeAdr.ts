import type { Decisao } from "@gerador/engine";

/**
 * SPEC-81 fatia E — **a decisão tomada aqui volta para o repositório da casa.**
 *
 * ## Por que esta é a fatia que justifica a anterior
 *
 * Ler ADR sem escrever de volta faz do produto um consumidor: ele aprende com o
 * que a casa decidiu e nunca devolve. E as decisões tomadas aqui são, em um
 * aspecto, **melhores que a maioria dos ADRs**: nascem ancoradas num elemento do
 * desenho (`noId`/`arestaId`) e ligadas à conta que as justificou (`ensaioIds`,
 * SPEC-69). Deixá-las presas neste produto é perder isso.
 *
 * ## O que NÃO se envia, e a razão é dura
 *
 * **Decisão importada não volta.** Ela veio de lá; reenviá-la criaria uma cópia
 * da decisão da casa dentro do repositório da própria casa, com outro
 * identificador. É a recusa da SPEC-81 §5 vista do outro lado, e `importadoDe`
 * é o campo que a torna verificável.
 *
 * **Decisão `proposta` não volta.** Um repositório de ADR é registro do que foi
 * decidido; encher de proposta faria dele um rascunho compartilhado. Volta o que
 * está `aceita` ou `substituida` — as duas são fatos.
 */
export interface AdrParaPublicar {
  /** `Decisao.id` — a identidade estável, para o gateway atualizar em vez de criar. */
  id: string;
  titulo: string;
  contexto?: string;
  alternativas: { titulo: string; consequencia?: string }[];
  escolhida: string;
  porque: string;
  status: "aceita" | "substituida";
  substituidaPor?: string;
  autor: string;
  em: string;
  /**
   * O que este produto tem e um ADR comum não: o elemento do desenho a que a
   * decisão se ancora, e os ensaios que a justificaram.
   *
   * Vai como texto porque do outro lado é uma página — e um id de nó só faz
   * sentido aqui dentro. O que atravessa é o rótulo, que uma pessoa lê.
   */
  ancoradaEm?: string;
  /** Quantos ensaios sustentam esta decisão (SPEC-69). */
  ensaios?: number;
}

export interface EscritorDeAdr {
  /**
   * Publica as decisões e devolve um resultado **por decisão**, na mesma ordem.
   *
   * Falha parcial é resposta, e não exceção — igual ao `ExportadorDeItens` e
   * diferente do `PublicadorDeDocumento`. A razão é a mesma de lá: são N coisas
   * independentes, e uma que não sobe não pode derrubar as que subiram.
   */
  publicar(adrs: AdrParaPublicar[]): Promise<Array<{ id: string; linkExterno: string } | { id: string; erro: string }>>;
}

/**
 * As decisões que PODEM voltar, já no formato de saída.
 *
 * Função pura e no pacote de aplicação pela razão de sempre (§263): a tela
 * precisa saber quantas vão para dizer o número no botão, e o caso de uso
 * precisa saber quais são. Dois filtros divergem na primeira mudança — e a
 * divergência aqui seria muda: o botão diria "3" e subiriam 5.
 */
export function decisoesQuePodemVoltar(
  decisoes: Decisao[],
  rotuloDoElemento: (id: string) => string | undefined = () => undefined
): AdrParaPublicar[] {
  return decisoes
    // Veio de lá: reenviar criaria uma cópia da decisão da casa dentro da casa.
    .filter((d) => !d.importadoDe)
    // Proposta não é fato. Um repositório de ADR cheio de rascunho deixa de ser
    // registro do que foi decidido.
    .filter((d): d is Decisao & { status: "aceita" | "substituida" } => d.status !== "proposta")
    .map((d) => {
      const elemento = d.noId ?? d.arestaId;
      const rotulo = elemento ? rotuloDoElemento(elemento) : undefined;
      return {
        id: d.id,
        titulo: d.titulo,
        contexto: d.contexto,
        alternativas: d.alternativas,
        escolhida: d.escolhida,
        porque: d.porque,
        status: d.status,
        substituidaPor: d.substituidaPor,
        autor: d.autor,
        em: d.em,
        ...(rotulo ? { ancoradaEm: rotulo } : {}),
        ...(d.ensaioIds?.length ? { ensaios: d.ensaioIds.length } : {}),
      };
    });
}
