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
/**
 * SPEC-90 — **as fases da jornada**, na cadeia que o usuário nomeou:
 * *"produto e arquitetura de negócio → técnica → design da solução → ensaio,
 * etc."*
 *
 * Fase é AGRUPAMENTO do que existe, nunca uma caixa vazia bonita: há teste que
 * falha se uma fase declarada não tiver estágio nenhum.
 */
export const FASES_DA_JORNADA = ["negocio", "tecnica", "desenho", "ensaio", "entrega", "volta"] as const;
export type FaseDaJornada = (typeof FASES_DA_JORNADA)[number];

/** O rótulo de cada fase — o que a pessoa lê no diagrama. */
export const ROTULO_DA_FASE: Record<FaseDaJornada, string> = {
  negocio: "Negócio e produto",
  tecnica: "Arquitetura técnica",
  desenho: "Desenho da solução",
  ensaio: "Ensaio e decisão",
  entrega: "Entrega",
  volta: "A volta",
};

/**
 * SPEC-91 §2.1 — **nem todo estágio acontece em toda demanda.**
 *
 * O usuário: *"nem sempre uma demanda se trata de uma decisão que muda o fluxo de
 * negócio ou arquitetural — precisamos deixar claro, inclusive no diagrama, que
 * pode ser aplicável ou não."*
 *
 * Não é conceito novo: é o produto sendo coerente consigo. O documento já diz
 * *"nem toda mudança move arquitetura"* quando não há decisão, e há teste para a
 * frase. O que faltava era o diagrama parar de desenhar tudo como se acontecesse
 * sempre — o que promete processo pesado e afasta a demanda pequena, que é a
 * maioria.
 *
 * **A régua para marcar como condicional:** só entra o que o produto JÁ declara
 * como opcional em algum lugar do código. Não é opinião sobre o que parece
 * dispensável — e o `porQueCondicional` é obrigatório para provar isso.
 */
export type AplicacaoDoEstagio = "sempre" | "quando-se-aplica";

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
  /**
   * SPEC-91 — este estágio acontece em toda demanda, ou só quando cabe?
   *
   * Ausente = `sempre`, que é o caso da maioria e evita ruído no dado.
   */
  aplicacao?: AplicacaoDoEstagio;
  /** Obrigatório em `quando-se-aplica`: marcar sem explicar é não marcar. */
  porQueCondicional?: string;
  /** SPEC-90 — em que ponto da jornada este estágio acontece. */
  fase: FaseDaJornada;
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
    fase: "negocio",
    titulo: "Captar o que é perene",
    resumo: "O que o produto é, quem usa, as regras que valem sempre.",
    detalhe:
      "O contexto do produto não se recola a cada demanda: objetivo, personas, regras de negócio permanentes, sistemas com quem conversa, restrições regulatórias e o glossário da empresa. É o material que todo item gerado vai citar, e é o que impede a IA de inventar a razão de ser do que você está construindo. Aqui também mora o volume que o produto atende — o número perene que toda demanda herda.",
    estado: "completo",
    rota: { tela: "config", area: "produtos" },
  },
  {
    id: "padroes",
    fase: "tecnica",
    titulo: "Analisar o contexto técnico",
    resumo: "As stacks, os padrões por componente, os campos de cada tipo — e o design system.",
    detalhe:
      "Que tecnologias o time usa, que padrão cada tipo de componente precisa seguir, que campos uma fila ou um banco tem que declarar, e quais são os tokens do design system da empresa. É a configuração determinística que o motor lê para medir o seu desenho — e é dela que sai toda cobrança que a ferramenta faz. A parte visual entra pela mesma porta das outras: contraste é aritmética, e pertencer ao sistema é conferível. O que não dá para calcular continua sendo checklist de gente.",
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
    fase: "desenho",
    titulo: "Desenhar a solução",
    resumo: "A mesa de projeto: componentes tipados, conexões com regra própria.",
    detalhe:
      "O diagrama técnico é o artefato central, não uma ilustração. Cada componente carrega os campos do seu tipo, cada conexão tem regras sobre o que pode ligar em quê, e todo valor guarda de onde veio — manual, extraído, inferido ou sugerido. É o desenho que o motor mede, e dele que os itens nascem.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "prontidao",
    fase: "desenho",
    titulo: "Medir o que está pronto",
    resumo: "O motor mede a cada mudança, e diz o que falta e onde.",
    detalhe:
      "Não é só 'os campos estão cheios?'. É: cada necessidade declarada tem um componente que responda por ela? O desenho respeita os padrões do time? Algum caminho inteiro estoura a régua acordada? As decisões tomadas têm o porquê registrado? Cada componente ganha um semáforo, e nada some em silêncio — um campo pode virar N/A, mas só com motivo escrito.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "volumetria",
    aplicacao: "quando-se-aplica",
    porQueCondicional:
      "Uma demanda sem volume próprio herda o do produto — e sem volume nenhum a saturação segue calada, em vez de inventar número.",
    fase: "negocio",
    titulo: "Declarar o volume",
    resumo: "Quanto o produto atende, e quanto esta demanda atende.",
    detalhe:
      "O volume entra uma vez e o motor o distribui pelo desenho — ninguém digita taxa componente a componente. Com ele, a conta de saturação (Lei de Little) fecha sozinha e a ferramenta passa a dizer 'este serviço não aguenta o que você está prometendo'. O número do produto é perene; a demanda pode discordar, e a tela diz qual é qual.",
    estado: "completo",
    rota: { tela: "config", area: "produtos" },
  },
  {
    id: "ensaios",
    aplicacao: "quando-se-aplica",
    porQueCondicional:
      "Ensaio responde a um “e se…?”, e um desenho sem tempo declarado não tem o que ensaiar — a ferramenta diz isso em vez de cobrar.",
    fase: "ensaio",
    titulo: "Ensaiar o que pode dar errado",
    resumo: "E se o parceiro ficar lento? E se o volume for cinco vezes?",
    detalhe:
      "A bancada de ensaios responde perguntas hipotéticas com aritmética, não com opinião: trocar um número e recalcular o grafo é determinístico e dá o mesmo resultado toda vez. Retry, pico de tráfego, disjuntor desligado, timeout do cliente menor que a soma dos internos. E um ensaio que dói pode ser assumido como débito — com quem assumiu e por quê.",
    estado: "completo",
    rota: { tela: "ensaios" },
  },
  {
    id: "decisoes",
    aplicacao: "quando-se-aplica",
    porQueCondicional:
      "Nem toda mudança move arquitetura. Demanda sem decisão entre alternativas não fica incompleta por isso.",
    fase: "ensaio",
    titulo: "Registrar o porquê",
    resumo: "As escolhas entre alternativas, com o que foi descartado.",
    detalhe:
      "Decisão de arquitetura nasce de escolha entre alternativas ou de exceção consciente — nunca de 'preencher um campo'. Registrar só a escolhida documenta o que foi feito e perde o que torna isso útil daqui a um ano: o que foi rejeitado, e por quê. Quem reabre a decisão sem isso refaz a análise inteira.",
    estado: "completo",
    rota: { tela: "canvas" },
  },
  {
    id: "itens",
    fase: "entrega",
    titulo: "Derivar os itens",
    resumo: "O desenho vira backlog — calculado, não digitado.",
    detalhe:
      "Um item por componente, um por conexão, um para cada padrão que o desenho contraria, um para cada caminho que estoura a régua. As dependências entre eles vêm das setas. O mesmo desenho sempre produz os mesmos itens, e a chave de cada um é estável: rederivar depois de mudar uma coisa não perde o que você já escreveu.",
    estado: "completo",
    rota: { tela: "documento" },
  },
  {
    id: "especificacao",
    fase: "entrega",
    titulo: "Especificar com a IA",
    resumo: "A esteira de agentes escreve o texto; você confirma.",
    detalhe:
      "Quatro papéis — PO, arquiteto, especialista, QA — escrevem história de usuário, contrato, checklist técnico e cenários de teste. Nada disso conta antes de alguém confirmar: a IA propõe, e a confirmação é humana. E o que ela escreveu continua marcado como dela, mesmo depois de confirmado.",
    estado: "completo",
    rota: { tela: "documento" },
  },
  {
    id: "checklists",
    fase: "entrega",
    titulo: "Conferir processo, técnica e testes",
    resumo: "As regras de refinamento do time, aplicadas por tecnologia e contexto.",
    detalhe:
      "Cada item carrega o checklist que o time acordou para aquela tecnologia naquele contexto — DLQ configurada, idempotência, plano de migração, ciclos de teste. Toda lacuna que o documento entrega é contável: se o motor escreve algo esperando que alguém complete, isso aparece na conta e no momento da aprovação.",
    estado: "completo",
    rota: { tela: "config", area: "regras" },
  },
  {
    id: "specs-para-ia",
    fase: "entrega",
    titulo: "Gerar specs para construir com IA",
    resumo: "O documento vira instrução executável para um agente de código.",
    detalhe:
      "O documento é lido por quem decide; a spec é lida por quem — ou o que — implementa. Ela leva o contexto do produto, o que o motor mediu no desenho e os itens que cobre, mais três seções que nenhum modelo escreve: de onde veio o pedido, o que NÃO entra, e como se prova cada fatia. O motor que a monta existe e é conferido por teste; o que ainda não existe é o caminho dela até quem constrói.",
    /**
     * §346 — voltou a ser `parcial`, e a marca é honesta.
     *
     * ## A história das três marcas deste estágio
     *
     * `ausente` (SPEC-80): o motor existia — `gerarSpec`, `coberturaDaSpec`, a
     * trava do que a IA não escreve — e **nenhum consumidor**.
     *
     * `completo` (SPEC-84): ganhou uma tela. E era verdade, no sentido estreito
     * de que havia por onde chegar.
     *
     * **`parcial` (§346): a tela saiu.** O usuário chegou nela pelo menu e não
     * reconheceu o que era — *"não entendi como ela se conecta com o resto do
     * sistema… isso já está razoável nos itens, bastaria organizar"*. Medindo:
     * ela **não estava no tour**, e a única saída que oferecia era baixar um
     * markdown à mão.
     *
     * **Uma tela que ninguém alcança pelo percurso não é um consumidor** — é o
     * mesmo vazio da SPEC-80 com uma porta pintada por cima. O honesto é dizer
     * que o motor existe e o caminho não.
     *
     * A rota aponta para o `documento`: é onde os itens vivem, e é o item que a
     * spec vai acompanhar quando o caminho existir (SPEC-98 §3.2).
     */
    estado: "parcial",
    rota: { tela: "documento" },
    oQueFalta:
      "A spec sai como anexo do item, numa segunda chamada ao gateway depois que o issue existe — é a SPEC-98. Hoje o motor monta a spec e ninguém a leva para fora automaticamente.",
  },
  {
    id: "mcp",
    aplicacao: "quando-se-aplica",
    porQueCondicional:
      "Os destinos do gateway são configurados por time. Sem destino, o caminho simplesmente não se oferece.",
    fase: "entrega",
    titulo: "Integrar com as ferramentas do time",
    resumo: "Publicar e consumir por MCP, além do tracker.",
    detalhe:
      "O caminho é de mão dupla, e por gateways configuráveis — um na frente do issue tracker, outro da base de conhecimento, outro dos ADRs. O item sai para o tracker, o documento é publicado onde a empresa documenta, e o que já foi decidido volta: uma ADR entra pela conversa como texto editável, e a arquitetura de negócio chega como proposta campo a campo. O produto não implementa MCP — quem fala MCP é o gateway.",
    /**
     * SPEC-84 §0.1 — deixou de ser `ausente`, e a marca estava velha havia
     * quatro rodadas: §321 (a tela dos destinos), §324 (ler a arquitetura de
     * negócio), §325 (as telas de importação) e §326 (o ADR pela conversa).
     *
     * O comentário do topo deste arquivo previa a página em prosa envelhecer
     * dizendo "não existe" sobre algo entregue. O dado envelheceu igual — e a
     * trava não pegava, porque ela só cobrava a direção otimista. A da SPEC-84
     * fatia C cobra as duas.
     */
    estado: "completo",
    // SPEC-106 fatia B — o catálogo de Conectores absorveu a aba Exportação:
    // os destinos do gateway se cadastram e se editam num lugar só.
    rota: { tela: "config", area: "conectores" },
  },
  {
    id: "pdca",
    fase: "volta",
    titulo: "Fechar o ciclo",
    resumo: "O que se aprendeu vira ajuste na camada determinística.",
    detalhe:
      "É o retorno que faz disto um ciclo e não uma esteira. O uso gera feedback, o feedback vira solicitação de ajuste com prévia e aprovação, e o ajuste aplicado muda as regras — que mudam o próximo documento, o próximo item, a próxima medição. Sem esta volta, a ferramenta seria um gerador; com ela, ela aprende com o time.",
    estado: "completo",
    rota: { tela: "config", area: "pdca" },
  },
];

/**
 * Quantos estágios existem, para a página dizer o número sem contá-lo à mão.
 *
 * SPEC-84 fatia B — passou a receber a lista. A tela ganhou uma entrada para o
 * teste poder montar um ciclo com buraco (ver `CicloDoProduto`), e uma segunda
 * conta lá dentro divergiria desta na primeira mudança (§263). O default é o
 * ciclo real, então quem só quer o número continua chamando sem argumento.
 */
export function contagemDoCiclo(estagios: EstagioDoCiclo[] = ESTAGIOS_DO_CICLO): {
  existem: number;
  total: number;
  parciais: number;
} {
  return {
    existem: estagios.filter((e) => e.estado !== "ausente").length,
    total: estagios.length,
    /**
     * §346 — **os parciais precisavam ser contados à parte, e a falta disso era
     * um defeito que a própria rodada criou.**
     *
     * `existem` conta `!== "ausente"`, então um estágio `parcial` entra nele — e
     * está certo: parcial existe, incompleto. Mas a frase que a tela escolhia
     * com `existem === total` era *"quando um não existir, ele aparece aqui
     * marcado"*, no futuro — enquanto **já havia um marcado na tela**.
     *
     * Achado olhando a captura depois de o estágio da spec voltar a `parcial`.
     * Nenhum teste pegaria: os dois números continuavam certos, e o que estava
     * errado era a frase que eles escolhiam.
     */
    parciais: estagios.filter((e) => e.estado === "parcial").length,
  };
}
