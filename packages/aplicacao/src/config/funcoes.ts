import type { CampoDoConector } from "./conectores.js";

/**
 * SPEC-107 fatia A — **as FUNÇÕES do sistema como catálogo, com o contrato
 * como dado.**
 *
 * Uma função é o mesmo "capacidade com contrato" que um conector já é
 * (`entrada`/`saida` em `CampoDoConector`), trocando o transporte: chamada em
 * processo no motor, não HTTP. O nó do fluxo vira UMA coisa só — capacidade
 * com contrato — com adaptadores diferentes por trás (§2.2 da SPEC).
 *
 * A lista é FECHADA e mora no código de propósito (§242): função nova entra
 * por decisão, com executor que a honre no mesmo commit — nunca por acidente.
 * O molde é `CONTRATO_DA_OPERACAO`: o registro é dado, e quem consome (a
 * paleta, o validador, o executor) deriva dele.
 *
 * ## Modo (b), dito em voz alta (§5.4)
 *
 * A função `derivacao` aceita QUALQUER `desenho` mapeado — um conector pode
 * trazer um desenho de fora e derivá-lo. A tese da SPEC-105 §6 ("mesmo
 * desenho → mesmos itens, sempre") fica formalmente REESCRITA: a promessa é
 * **"mesma fiação + mesmas entradas → mesmos itens"**, e a reprodutibilidade
 * ancora no rastro — o hash do fluxo (§9.5) mais as ENTRADAS gravadas por nó
 * de função (`RastroDoNo.entradas`).
 */

export interface GovernancaDaFuncao {
  /** O nível de acesso que executa esta função — atributo do registro, não
   * decisão de rota: quem monta portão lê daqui. */
  nivel: "operar";
  /** O recurso RBAC curável que a restringe quando algum papel o carrega —
   * hoje o mesmo da execução de fluxos, porque função só roda dentro de um. */
  recurso: "fluxos.executar";
}

export interface FuncaoDoSistema {
  id: string;
  /** O rótulo da interface nomeia a FUNÇÃO (§2.3) — "engine" e "derivar" não
   * aparecem em tela nenhuma. */
  nome: string;
  descricao: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  governanca: GovernancaDaFuncao;
  /**
   * SPEC-110 fatia F — **onde esta função roda**, como DADO do registro.
   *
   * `puro` (o default) é cálculo: `executarFuncao` o resolve sem rede e sem
   * banco, e é o que torna as funções testáveis à mão. `servidor` é a função
   * que ESCREVE — o executor mora na rota, junto do banco e da auditoria.
   *
   * Sem este campo, quem despacha teria de manter uma lista paralela de
   * "estas aqui são especiais", e a primeira função nova entraria só na
   * metade das listas — que é o §346 (meia-integração) esperando acontecer.
   */
  executor?: "puro" | "servidor";
}

/**
 * A lista fechada. `derivacao` e `ensaio` entram porque já existem puras e
 * testadas no motor (`derivar`, `simularCenarios`); as demais candidatas da
 * §2.2 esperam o caso real que as honre (§346: tipo sem executor é
 * meia-integração).
 */
export const FUNCOES_DO_SISTEMA: FuncaoDoSistema[] = [
  {
    id: "derivacao",
    nome: "Geração de itens (desenho → itens)",
    descricao: "Deriva os itens de trabalho de um desenho, com as regras e o design system do time.",
    entrada: [{ chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto", obrigatorio: true }],
    saida: [
      { chave: "itens", rotulo: "Itens derivados", tipo: "lista" },
      { chave: "avisos", rotulo: "Avisos da derivação", tipo: "lista" },
      { chave: "conformidade", rotulo: "Conformidade (ciclos, conflitos)", tipo: "objeto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
  {
    id: "ensaio",
    nome: "Ensaio de cenários",
    descricao: "Roda um cenário de lentidão sobre o desenho e devolve a leitura, com a âncora de hoje.",
    entrada: [
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto", obrigatorio: true },
      { chave: "cenario", rotulo: "Cenário de lentidão", tipo: "objeto" },
    ],
    saida: [{ chave: "leitura", rotulo: "Leitura do ensaio", tipo: "objeto" }],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
  {
    /**
     * SPEC-110 fatia F (D11) — **o feedback do PDCA como componente.**
     *
     * O ciclo de melhoria já tem porta (a aba PDCA) e gravação (`POST
     * /pdca/feedback`). O que faltava era ele ser FIÁVEL: sem isto, um fluxo
     * que termina perguntando "o que faltou aqui?" não tem onde pousar a
     * resposta, e a pessoa é mandada para outra tela — que é exatamente o
     * corte de contexto que o PDCA existe para fechar.
     *
     * O executor chama a MESMA gravação da rota (§263), com a mesma auditoria:
     * um segundo caminho de escrita para o mesmo dado seria a régua duplicada
     * que esta casa já pagou para aprender.
     */
    id: "pdca-feedback",
    nome: "Registrar feedback (PDCA)",
    descricao: "Grava um feedback no ciclo de melhoria do time — o mesmo que a aba PDCA mostra.",
    entrada: [
      { chave: "texto", rotulo: "O que registrar", tipo: "texto", obrigatorio: true },
      { chave: "contexto", rotulo: "Contexto (de onde veio)", tipo: "texto" },
    ],
    saida: [{ chave: "feedbackId", rotulo: "Feedback gravado (id)", tipo: "texto" }],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    // Escreve: o executor mora na rota, com o banco e a auditoria.
    executor: "servidor",
  },
];

export function funcaoDoSistema(id: string): FuncaoDoSistema | undefined {
  return FUNCOES_DO_SISTEMA.find((f) => f.id === id);
}
