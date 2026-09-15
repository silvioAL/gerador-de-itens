import type { Atividade, Decisao, Necessidade } from "../model/types.js";
import type { SecaoDeJulgamento } from "./gerarSpec.js";

/**
 * SPEC-115 (rodada §410) — **as seções de julgamento da spec, derivadas do que
 * já foi decidido.**
 *
 * ## A confusão que este módulo desfaz
 *
 * A rodada anterior encontrou o defeito certo — as três seções de julgamento
 * (`origem`, `recusas`, `fatias`) não tinham escritor, então toda spec saía com
 * lacuna e nenhuma subia — e o consertou do jeito errado: três caixas de texto
 * em branco. Isso é exatamente a "caixa em branco" que a SPEC-115 §1.1 argumenta
 * contra para os trade-offs, construída cinco minutos depois de a tese oposta
 * ter sido implementada na mesma tela.
 *
 * Correção do usuário: *"a expectativa é que seja possível gerar essas specs,
 * seja a partir de conversas com assistente sem ou com contexto dos componentes
 * e seus respectivos projetos, já que parte pode ser nova e parte existente"* —
 * e a caixa *"tem o objetivo dessa interação com o agente, onde se coloca input
 * e interage com o agente para passar contexto de projeto e tomar decisões que
 * depois vão derivar para as respectivas specs"*.
 *
 * ## A cadeia, e por que ela respeita a trava em vez de contorná-la
 *
 * ```
 * contexto do projeto → o agente PROPÕE decisões → a pessoa CONFIRMA → a spec DERIVA
 * ```
 *
 * A trava da SPEC-80 fatia D existe porque *"uma spec gerada por modelo, com
 * aparência de spec deste repositório e conteúdo plausível-mas-vazio, é pior que
 * nenhuma"*. Nada aqui a afrouxa: **o modelo continua sem escrever uma linha de
 * julgamento.** Ele propõe `Decisao` — que chega `status: "proposta"`,
 * `origem: "sugerido"`, e não vale nada até alguém aceitar (SPEC-57 fatia C). O
 * que este módulo faz é ler o que **uma pessoa já decidiu** e escrever a
 * consequência disso, deterministicamente.
 *
 * É a mesma mecânica da fatia A (trade-offs derivados de `Decisao`) e do
 * `RiscosMedidos` (riscos derivados dos ensaios): o motor não opina, ele só
 * deixa de exigir que alguém redigite o que o produto já sabe.
 *
 * ## Por que cada seção deriva do que deriva
 *
 * | Seção | Fonte | Por que ela responde a pergunta |
 * |---|---|---|
 * | `recusas` | as alternativas DESCARTADAS das decisões | *"o que NÃO entra, e por quê"* é literalmente a alternativa não escolhida mais a consequência dela |
 * | `origem` | o contexto da demanda e as necessidades declaradas | *"quem pediu, e com que palavras"* são as palavras que alguém digitou ao abrir a demanda |
 * | `fatias` | os itens que a spec cobre | cada item derivado JÁ É uma fatia, e a prova dela são os critérios que viajam no corpo do item |
 *
 * ## O que ele RECUSA
 *
 * Inventar para preencher. Seção sem material continua voltando `undefined`, e
 * `gerarSpec` a marca como lacuna — que é o comportamento de hoje e o que faz a
 * lacuna entrar na conta (SPEC-73). Derivação que não tem de onde derivar é
 * silêncio, nunca texto plausível.
 */

/** O material confirmado de onde as seções saem. Tudo aqui passou por gente. */
export interface MaterialDeJulgamento {
  /** O que alguém escreveu ao abrir a demanda — as palavras de quem pediu. */
  contextoDaDemanda?: string;
  /** SPEC-57 fatia A — os propósitos declarados, com a procedência de cada um. */
  necessidades?: Necessidade[];
  /** SPEC-57 fatia C — as decisões. Só as ACEITAS entram (ver `decisoesQueValem`). */
  decisoes?: Decisao[];
  /** As atividades que esta spec cobre — cada uma é uma fatia. */
  itens?: Atividade[];
  /**
   * SPEC-119 §2.3 — `No.id`/`Aresta.id` → o rótulo que a pessoa deu.
   *
   * Uma decisão sem onde vale é uma restrição que quem implementa aplica ao
   * componente errado, e `noId: "n3"` não localiza nada para ninguém. O mapa
   * chega de fora porque este módulo não conhece o diagrama, e não deve: id que
   * não estiver aqui volta como id cru, que é pior que o rótulo e melhor que
   * omitir onde a regra vale.
   */
  rotulos?: Record<string, string>;
  /**
   * SPEC-119 fatia F — onde o corpo do item está em relação a esta spec.
   *
   * É o que decide a frase da PROVA em `derivarFatias`. Ausente = `"fora"`: a
   * leitura conservadora, porque um arquivo baixado não leva o item junto.
   */
  corpoDoItem?: "mesmo-issue" | "fora";
}

/**
 * **Proposta não é decisão, e é por isso que esta função existe.**
 *
 * Uma `Decisao` proposta pelo agente chega `status: "proposta"` e fica
 * esperando alguém. Derivar a partir dela colocaria na spec, como recusa
 * assumida, uma alternativa que ninguém descartou — e seria a trava da SPEC-80
 * furada por um caminho novo, que é exatamente o que ela existe para impedir.
 *
 * `substituida` também sai: ela foi trocada por outra, e o que não vale mais não
 * pode voltar pela spec.
 */
function decisoesQueValem(decisoes: Decisao[]): Decisao[] {
  return decisoes.filter((d) => d.status === "aceita");
}

/**
 * SPEC-119 fatia E — os nomes pelos quais as restrições são citadas no fim da
 * spec.
 *
 * Exportado para que o fechamento e a seção `Decisões` citem **a mesma lista**.
 * Duas leituras da mesma pergunta divergem na primeira mudança (§263), e aqui
 * a divergência seria a pior possível: o fim da spec dizendo que três decisões
 * restringem enquanto a seção lista duas.
 */
export function titulosDasDecisoesQueValem(decisoes: Decisao[]): string[] {
  return decisoesQueValem(decisoes).map((d) => d.titulo);
}

/**
 * A marca que vai NO TEXTO do artefato, e não só na tela.
 *
 * A spec circula como markdown — ela sobe para o issue, alguém a lê fora da
 * ferramenta. Se a proveniência ficasse só na interface, o arquivo que chega ao
 * agente de código diria "recusas" sem dizer de onde elas saíram, e a régua de
 * proveniência valeria só para quem abriu o produto.
 */
function marcado(de: string, corpo: string): string {
  return `_(derivado ${de} — edite a seção para complementar)_\n\n${corpo}`;
}

/**
 * *"O que NÃO entra, e por quê."*
 *
 * Cada alternativa descartada, com a consequência de tê-la escolhido. Uma
 * decisão sem alternativa descartada não produz recusa nenhuma, e isso está
 * certo: escolher entre uma opção só não recusou nada.
 *
 * A consequência ausente não vira frase inventada — a linha sai sem ela, e quem
 * ler vê que aquela decisão foi registrada sem dizer o que se perdeu. É o mesmo
 * cobrar-em-silêncio do `CartaoDecisao` quando falta o porquê.
 */
function derivarRecusas(decisoes: Decisao[]): string | undefined {
  const linhas = decisoesQueValem(decisoes).flatMap((d) =>
    d.alternativas
      .filter((a) => a.titulo !== d.escolhida)
      .map((a) => `- **${a.titulo}** — fora porque escolhemos ${d.escolhida}${a.consequencia ? `: ${a.consequencia}` : ""} (decisão: ${d.titulo})`)
  );
  if (linhas.length === 0) return undefined;
  return marcado(`de ${linhas.length === 1 ? "1 alternativa descartada" : `${linhas.length} alternativas descartadas`}`, linhas.join("\n"));
}

/**
 * SPEC-119 fatia A — *"o que já foi decidido, e por quê."*
 *
 * ## A assimetria que o §410 deixou, e que esta função fecha
 *
 * A rodada anterior fez as decisões alimentarem a spec **só pelo lado
 * negativo**: a alternativa descartada vira `recusas`. A escolhida, com o
 * porquê, não ia a lugar nenhum.
 *
 * Para um humano isso quase se sustenta — quem lê *"síncrono ficou fora porque
 * acopla ao parceiro"* infere que ficou fila. **Para um agente de código é
 * exatamente a informação que falta**: ele precisa saber qual padrão USAR, não
 * qual evitar. Inferir a escolha a partir do descarte é o tipo de salto que
 * produz código plausível e errado.
 *
 * ## Por que o `onde` não é opcional na frase
 *
 * Uma decisão de arquitetura é restrição de implementação, e restrição sem alvo
 * se aplica ao componente errado. `noId`/`arestaId` ausentes **não** são falta
 * de dado: o tipo diz que decisão sem âncora é da quebra inteira, e a frase diz
 * isso em voz alta em vez de omitir a linha.
 *
 * O `porque` ausente também não vira frase inventada — a restrição sai sem
 * razão, e quem ler vê que ela foi registrada sem dizer por quê. É o mesmo
 * cobrar-em-silêncio de `derivarRecusas`.
 */
function derivarDecisoes(decisoes: Decisao[], rotulos: Record<string, string>): string | undefined {
  const valem = decisoesQueValem(decisoes);
  if (valem.length === 0) return undefined;

  const linhas = valem.map((d) => {
    const alvo = d.noId ?? d.arestaId;
    const onde = alvo ? `vale em **${rotulos[alvo] ?? alvo}**` : "vale na demanda inteira";
    const porque = d.porque?.trim() ? ` — porque ${d.porque.trim()}` : "";
    return `- **${d.titulo}**: use **${d.escolhida}**${porque}. _(${onde})_`;
  });

  return marcado(
    `de ${linhas.length === 1 ? "1 decisão aceita" : `${linhas.length} decisões aceitas`}`,
    linhas.join("\n")
  );
}

/**
 * *"Quem pediu, e com que palavras."*
 *
 * As palavras são as que alguém digitou: o contexto da demanda e os propósitos
 * declarados. A procedência de cada necessidade viaja junto — `extraido` de um
 * documento, `inferido` pelo motor e `manual` não são a mesma afirmação, e
 * apagar a diferença aqui seria dar a um palpite o peso de um pedido.
 *
 * Necessidade ainda não confirmada fica de fora: enquanto ninguém a assinou,
 * ela não é o que foi pedido — é o que alguém achou que foi.
 */
function derivarOrigem(contexto: string | undefined, necessidades: Necessidade[]): string | undefined {
  const partes: string[] = [];
  const texto = contexto?.trim();
  if (texto) partes.push(texto);

  const declaradas = necessidades.filter((n) => n.origem === "manual" || n.confirmado);
  if (declaradas.length > 0) {
    partes.push(
      ["O que se pediu que ficasse verdade:", ...declaradas.map((n) => `- ${n.texto}${n.origem === "manual" ? "" : ` _(${n.origem})_`}`)].join(
        "\n"
      )
    );
  }

  if (partes.length === 0) return undefined;
  return marcado("do contexto e dos propósitos declarados da demanda", partes.join("\n\n"));
}

/**
 * *"O que fica verdade em cada fatia, e como se prova."*
 *
 * Cada item derivado **é** uma fatia — foi assim que o desenho o produziu. A
 * prova não é reescrita aqui, e essa omissão é deliberada: os critérios de
 * aceite viajam no corpo do próprio item, no mesmo payload que sobe junto da
 * spec. Repeti-los criaria dois textos com o mesmo conteúdo, que divergem no
 * primeiro que alguém editar (§323).
 *
 * O que a seção acrescenta é o que o corpo do item não diz: **o recorte** — qual
 * fatia é esta, de que tipo e tamanho, e de que ela depende.
 */
function derivarFatias(itens: Atividade[], corpoDoItem: "mesmo-issue" | "fora"): string | undefined {
  if (itens.length === 0) return undefined;
  /**
   * SPEC-119 fatia F — **o ponteiro deixa de ser pendurado.**
   *
   * A frase era *"na seção dele"*, e ela presumia que o corpo do item viaja
   * junto. O §3.4 mediu: viaja no caminho da SPEC-114, não viaja no markdown
   * baixado, e a spec não dizia qual dos dois. Um agente que receba só a spec
   * segue um ponteiro para lugar nenhum e inventa o critério de aceite — que é
   * a pior das falhas possíveis aqui, porque produz algo que PARECE pronto.
   *
   * Agora quem chama declara onde o corpo está, e a frase afirma isso.
   */
  const ondeEstaAProva =
    corpoDoItem === "mesmo-issue"
      ? "Prova: os critérios de aceite deste item, no corpo do issue ao qual esta spec está anexada."
      : "Prova: os critérios de aceite deste item, no corpo do item — que não viaja neste arquivo.";

  const linhas = itens.map((a, i) => {
    // `alvoChave` é opcional — dependência sem alvo declarado existe (o tipo diz
    // ISSO), e listar `undefined` seria pior que omitir a linha.
    const alvos = a.dependencias.map((d) => d.alvoChave).filter((c): c is string => !!c);
    const dependencias = alvos.length > 0 ? ` — depende de ${alvos.join(", ")}` : "";
    return `${i + 1}. **${a.rotulo}** (${a.tipo}, ${a.tamanho})${dependencias}\n   ${ondeEstaAProva}`;
  });
  return marcado(`de ${linhas.length === 1 ? "1 item derivado do desenho" : `${linhas.length} itens derivados do desenho`}`, linhas.join("\n"));
}

/**
 * As três seções, derivadas do material que já passou por gente. Ausente = não
 * havia de onde derivar, e `gerarSpec` segue marcando lacuna.
 */
export function derivarSecoesDeJulgamento(material: MaterialDeJulgamento): Partial<Record<SecaoDeJulgamento, string>> {
  const derivado: Partial<Record<SecaoDeJulgamento, string>> = {};

  const origem = derivarOrigem(material.contextoDaDemanda, material.necessidades ?? []);
  if (origem) derivado.origem = origem;

  // SPEC-119 fatia A — o lado POSITIVO da mesma `Decisao` de onde saem as
  // recusas. As duas leem a mesma lista, pela mesma função de filtro.
  const decisoes = derivarDecisoes(material.decisoes ?? [], material.rotulos ?? {});
  if (decisoes) derivado.decisoes = decisoes;

  const recusas = derivarRecusas(material.decisoes ?? []);
  if (recusas) derivado.recusas = recusas;

  const fatias = derivarFatias(material.itens ?? [], material.corpoDoItem ?? "fora");
  if (fatias) derivado.fatias = fatias;

  return derivado;
}
