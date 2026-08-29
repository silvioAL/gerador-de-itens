import type { Rota } from "../navegacao/rota";

/**
 * SPEC-76 fatia A — **o ciclo, escrito.**
 *
 * ## Por que isto é dado, e não prosa numa página
 *
 * A régua da SPEC é uma frase: **a página não pode prometer o que o produto não
 * faz.** Ela é a mesma que o produto cobra de todo mundo lá dentro —
 * proveniência, lacuna contável, "sugerido" que não vira fato. Uma landing que
 * desenhasse doze estágios como se todos existissem seria o produto violando,
 * na porta de entrada, a única coisa que ele exige.
 *
 * Régua escrita em prosa envelhece calada. Escrita como DADO, com `rota`, ela
 * pode ser conferida: o teste da fatia D cruza cada estágio marcado como
 * existente com o roteador de verdade, e um estágio que perder a tela derruba a
 * suíte. Foi por isso que este arquivo não é um `.md`.
 *
 * ## O que mudou desde a SPEC ser escrita
 *
 * A SPEC contou **nove de doze**. São **dez**, porque a rodada da SPEC-77 —
 * três dias depois de a tabela ser escrita — fez a volumetria de produto que
 * ela mesma listava como ausente. É exatamente o motivo de isto ser dado: uma
 * página em prosa continuaria dizendo "não existe" sobre algo entregue.
 *
 * ## A ordem
 *
 * O ciclo **fecha**: a coleta de oportunidades volta como ajuste na camada
 * determinística, que muda as regras, que mudam o próximo documento. Esse
 * retorno é o coração do produto (é o PDCA), e um diagrama linear o perderia —
 * por isso a lista é circular na tela, e o último estágio aponta para o
 * primeiro.
 */
/**
 * `completo` — existe e está inteiro. `parcial` — existe e a SPEC diz onde ele
 * para. `ausente` — não existe, e a página diz isso em voz alta.
 *
 * SPEC-83 — virou tipo nomeado porque ganhou um **segundo cliente**: as conexões
 * do mapa (`conceito.ts`) fazem a mesma pergunta sobre outra coisa. Responder
 * com duas escalas diferentes obrigaria quem lê a aprender duas legendas.
 */
export type EstadoDoEstagio = "completo" | "parcial" | "ausente";

export interface EstagioDoCiclo {
  id: string;
  titulo: string;
  /** Uma frase: é o que cabe numa fatia do círculo. */
  resumo: string;
  /** O desdobramento, que abre ao clique. */
  detalhe: string;
  /**
   * `completo` — existe e está inteiro. `parcial` — existe e a SPEC diz onde
   * ele para. `ausente` — não existe, e a página diz isso em voz alta.
   *
   * Os três aparecem na tela. Mostrar só o que existe seria uma história forte
   * e incompleta; mostrar tudo sem distinguir seria mentira. A marca é o que
   * torna o mapa honesto — e ela diz para onde o produto vai.
   */
  estado: EstadoDoEstagio;
  /**
   * Para onde este estágio leva, depois do login. Obrigatório em tudo que não
   * é `ausente`: estágio que existe e não tem endereço é promessa sem porta, e
   * o teste da fatia D recusa.
   */
  rota?: Rota;
  /** O que falta, quando falta. Só em `parcial` e `ausente`. */
  oQueFalta?: string;
}

export const ESTAGIOS_DO_CICLO: EstagioDoCiclo[] = [
  {
    id: "contexto",
    titulo: "Captar o que é perene",
    resumo: "O que o produto é, quem usa, as regras que valem sempre.",
    detalhe:
      "O contexto do produto não se recola a cada demanda: objetivo, personas, regras de negócio permanentes, sistemas com quem conversa, restrições regulatórias e o glossário da casa. É o material que todo item gerado vai citar, e é o que impede a IA de inventar a razão de ser do que você está construindo. Aqui também mora o volume que o produto atende — o número perene que toda demanda herda.",
    estado: "completo",
    rota: { tela: "config", area: "produtos" },
  },
  {
    id: "padroes",
    titulo: "Analisar o contexto técnico",
    resumo: "As stacks, os padrões por componente, os campos de cada tipo — e o design system.",
    detalhe:
      "Que tecnologias o time usa, que padrão cada tipo de componente precisa seguir, que campos uma fila ou um banco tem que declarar, e quais são os tokens do design system da casa. É a configuração determinística que o motor lê para medir o seu desenho — e é dela que sai toda cobrança que a ferramenta faz. A parte visual entra pela mesma porta das outras: contraste é aritmética, e pertencer ao sistema é conferível. O que não dá para calcular continua sendo checklist de gente.",
    /**
     * SPEC-79 — deixou de ser `parcial`.
     *
     * O que faltava era nomeado: *"um design system de verdade — tokens,
     * componentes de interface, régua visual — ainda não é modelado aqui"*. O
     * que estava ausente era a **régua**: tokens não eram dado, e nada do lado
     * visual era conferível. Os dois existem agora, e o critério que a SPEC-79
     * §2 declarou para esta marca virar está sob teste: **um desenho que
     * contraria o design system deriva item de trabalho**, como qualquer outro
     * padrão. Régua que acusa e não gera trabalho é régua que o time aprende a
     * ignorar.
     *
     * O *tipo* de componente de interface o time declara como declara qualquer
     * outro — a ferramenta não envia um pronto, e a rodada mediu por que: pôr
     * regras de Frontend no template de fábrica muda, em silêncio, o que uma
     * instalação limpa é. A própria SPEC-79 §5 já recomendava o contrário.
     */
    estado: "completo",
    rota: { tela: "config", area: "tokens" },
  },
  {
    id: "desenho",
    titulo: "Desenhar a solução",
    resumo: "A mesa de projeto: componentes tipados, conexões com regra própria.",
    detalhe:
      "O diagrama técnico é o artefato central, não uma ilustração. Cada componente carrega os campos do seu tipo, cada conexão tem regras sobre o que pode ligar em quê, e todo valor guarda de onde veio — manual, extraído, inferido ou sugerido. É o desenho que o motor mede, e dele que os itens nascem.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "prontidao",
    titulo: "Medir o que está pronto",
    resumo: "O motor mede a cada mudança, e diz o que falta e onde.",
    detalhe:
      "Não é só 'os campos estão cheios?'. É: cada necessidade declarada tem um componente que responda por ela? O desenho respeita os padrões do time? Algum caminho inteiro estoura a régua acordada? As decisões tomadas têm o porquê registrado? Cada componente ganha um semáforo, e nada some em silêncio — um campo pode virar N/A, mas só com motivo escrito.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "volumetria",
    titulo: "Declarar o volume",
    resumo: "Quanto o produto atende, e quanto esta demanda atende.",
    detalhe:
      "O volume entra uma vez e o motor o distribui pelo desenho — ninguém digita taxa componente a componente. Com ele, a conta de saturação (Lei de Little) fecha sozinha e a ferramenta passa a dizer 'este serviço não aguenta o que você está prometendo'. O número do produto é perene; a demanda pode discordar, e a tela diz qual é qual.",
    estado: "completo",
    rota: { tela: "config", area: "produtos" },
  },
  {
    id: "ensaios",
    titulo: "Ensaiar o que pode dar errado",
    resumo: "E se o parceiro ficar lento? E se o volume for cinco vezes?",
    detalhe:
      "A bancada de ensaios responde perguntas hipotéticas com aritmética, não com opinião: trocar um número e recalcular o grafo é determinístico e dá o mesmo resultado toda vez. Retry, pico de tráfego, disjuntor desligado, timeout do cliente menor que a soma dos internos. E um ensaio que dói pode ser assumido como débito — com quem assumiu e por quê.",
    estado: "completo",
    rota: { tela: "ensaios" },
  },
  {
    id: "decisoes",
    titulo: "Registrar o porquê",
    resumo: "As escolhas entre alternativas, com o que foi descartado.",
    detalhe:
      "Decisão de arquitetura nasce de escolha entre alternativas ou de exceção consciente — nunca de 'preencher um campo'. Registrar só a escolhida documenta o que foi feito e perde o que torna isso útil daqui a um ano: o que foi rejeitado, e por quê. Quem reabre a decisão sem isso refaz a análise inteira.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "itens",
    titulo: "Derivar os itens",
    resumo: "O desenho vira backlog — calculado, não digitado.",
    detalhe:
      "Um item por componente, um por conexão, um para cada padrão que o desenho contraria, um para cada caminho que estoura a régua. As dependências entre eles vêm das setas. O mesmo desenho sempre produz os mesmos itens, e a chave de cada um é estável: rederivar depois de mudar uma coisa não perde o que você já escreveu.",
    estado: "completo",
    rota: { tela: "documento" },
  },
  {
    id: "especificacao",
    titulo: "Especificar com a IA",
    resumo: "A esteira de agentes escreve o texto; você confirma.",
    detalhe:
      "Quatro papéis — PO, arquiteto, especialista, QA — escrevem história de usuário, contrato, checklist técnico e cenários de teste. Nada disso conta antes de alguém confirmar: a IA propõe, e a confirmação é humana. E o que ela escreveu continua marcado como dela, mesmo depois de confirmado.",
    estado: "completo",
    rota: { tela: "documento" },
  },
  {
    id: "checklists",
    titulo: "Conferir processo, técnica e testes",
    resumo: "As regras de refinamento do time, aplicadas por tecnologia e contexto.",
    detalhe:
      "Cada item carrega o checklist que o time acordou para aquela tecnologia naquele contexto — DLQ configurada, idempotência, plano de migração, ciclos de teste. Toda lacuna que o documento entrega é contável: se o motor escreve algo esperando que alguém complete, isso aparece na conta e no momento da aprovação.",
    estado: "completo",
    rota: { tela: "config", area: "regras" },
  },
  {
    id: "specs-para-ia",
    titulo: "Gerar specs para construir com IA",
    resumo: "O documento vira instrução executável para um agente de código.",
    detalhe:
      "O documento de desenho já é o insumo de quem implementa. O passo que falta é o formato que um agente de código consome direto — a ponte entre 'está especificado' e 'está sendo construído'.",
    estado: "ausente",
    oQueFalta: "Avaliado na SPEC-75, ainda não construído.",
  },
  {
    id: "mcp",
    titulo: "Integrar com as ferramentas do time",
    resumo: "Publicar e consumir por MCP, além do tracker.",
    detalhe:
      "Hoje o item sai para o issue tracker por um agente configurável. Falta o caminho de mão dupla com as ferramentas onde o time já trabalha.",
    estado: "ausente",
    oQueFalta: "Não avaliado ainda.",
  },
  {
    id: "pdca",
    titulo: "Fechar o ciclo",
    resumo: "O que se aprendeu vira ajuste na camada determinística.",
    detalhe:
      "É o retorno que faz disto um ciclo e não uma esteira. O uso gera feedback, o feedback vira solicitação de ajuste com prévia e aprovação, e o ajuste aplicado muda as regras — que mudam o próximo documento, o próximo item, a próxima medição. Sem esta volta, a ferramenta seria um gerador; com ela, ela aprende com o time.",
    estado: "completo",
    rota: { tela: "config", area: "pdca" },
  },
];

/** Quantos estágios existem, para a página dizer o número sem contá-lo à mão. */
export function contagemDoCiclo(): { existem: number; total: number } {
  return {
    existem: ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente").length,
    total: ESTAGIOS_DO_CICLO.length,
  };
}
