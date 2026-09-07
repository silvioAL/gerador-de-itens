import type { CampoDoConector } from "./conectores.js";

/**
 * SPEC-110 fatia B — **a TELA como nó: onde a pessoa entra no fluxo.**
 *
 * O desenho é do usuário, à letra: *"acho que esse tipo de coisa poderia ser
 * abstraído como screen… seria feita a conexão com essa screen, o agente iria
 * gerar o ensaio, e depois o usuário revisa, e decide avançar para a derivação
 * (conexão com próximo output), ou retornar"*.
 *
 * Uma tela é capacidade com contrato, como a função e o conector — trocando o
 * executor por GENTE: `entrada` é o que ela mostra, `saida` é a DECISÃO
 * (`avancar` | `retornar`) mais o que a pessoa preencheu ou aprovou.
 *
 * ## Por que ela não "roda"
 *
 * Quando a execução chega numa tela ela SUSPENDE (a mecânica da SPEC-107 C,
 * §5.5, que já sabia esperar gente e sobreviver a F5) — a diferença é que o
 * gate pausa DEPOIS de um nó que já rodou, e a tela pausa NELA: o nó só
 * termina quando alguém decide. Avançar continua o fluxo com a saída dela;
 * Retornar encerra a execução (D2: re-rodar o nó anterior automaticamente é
 * dívida declarada, não v1).
 *
 * ## O registro é fechado (§242)
 *
 * As três telas do SISTEMA são as que já existem como tela de verdade no
 * produto — a bancada, o documento e a mesa. Tela do usuário (blocos
 * declarados) é a fatia C, e entra no MESMO vocabulário: quem consome uma
 * tela não pergunta de onde ela veio.
 */

export interface TelaDoSistema {
  id: "bancada-de-ensaios" | "documento" | "mesa";
  /** O rótulo nomeia a TELA como a pessoa a conhece (§2.3). */
  nome: string;
  /** O mesmo nome em duas palavras, para o cartão do canvas — a frase inteira
   * estica o cartão e esconde o vizinho (lição da fatia A). */
  rotuloCurto: string;
  descricao: string;
  /** O que a tela MOSTRA (vem pelas arestas). */
  entrada: CampoDoConector[];
  /** A decisão + o que a pessoa aprovou/preencheu. */
  saida: CampoDoConector[];
}

/**
 * D2 — **toda tela emite a decisão**, seja do sistema ou declarada: é o que
 * torna "avançar para a derivação, ou retornar" fiável no desenho. Fica aqui,
 * num lugar só, porque duas listas divergiriam na primeira tela nova.
 */
export const CAMPO_DA_DECISAO: CampoDoConector = {
  chave: "decisao",
  rotulo: "Decisão de quem revisou (avancar | retornar)",
  tipo: "texto",
};

export const TELAS_DO_SISTEMA: TelaDoSistema[] = [
  {
    id: "bancada-de-ensaios",
    nome: "Bancada de ensaios (revisar e decidir)",
    rotuloCurto: "Bancada de ensaios",
    descricao:
      "Mostra a leitura do ensaio e a mesa de cenários. Quem revisa pode re-medir, e então avançar (o fluxo segue com o ensaio aprovado) ou retornar.",
    entrada: [
      { chave: "ensaio", rotulo: "Leitura do ensaio", tipo: "objeto" },
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto" },
    ],
    saida: [CAMPO_DA_DECISAO, { chave: "ensaioAprovado", rotulo: "Ensaio aprovado", tipo: "objeto" }],
  },
  {
    id: "documento",
    nome: "Documento (revisar as sugestões)",
    rotuloCurto: "Documento",
    descricao:
      "Abre o documento da demanda para revisar o que a esteira sugeriu. O julgamento continua sendo o da demanda (§5.5) — a tela é a porta, não um segundo motor.",
    entrada: [
      { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
      { chave: "documento", rotulo: "Documento (markdown)", tipo: "documento" },
    ],
    saida: [CAMPO_DA_DECISAO],
  },
  {
    id: "mesa",
    nome: "Mesa de projeto (abrir e desenhar)",
    rotuloCurto: "Mesa de projeto",
    descricao:
      "Abre a mesa da demanda para desenhar ou conferir. É a PORTA para a mesa — quem quer o DADO da demanda usa os componentes de dados, não esta tela.",
    entrada: [{ chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" }],
    saida: [CAMPO_DA_DECISAO],
  },
];

export function telaDoSistema(id: string): TelaDoSistema | undefined {
  return TELAS_DO_SISTEMA.find((t) => t.id === id);
}

/** As decisões que uma tela pode devolver (D2/D17: o catálogo é fechado — o
 * acionador é enlatado, nada programável). */
export const DECISOES_DA_TELA = ["avancar", "retornar"] as const;
export type DecisaoDaTela = (typeof DECISOES_DA_TELA)[number];

/**
 * SPEC-110 fatia B — a saída que a pessoa entrega ao Avançar, validada contra
 * o contrato declarado da tela. Devolve a mensagem do problema, ou `null`.
 *
 * A régua é a da casa (§9.3): o que a tela promete emitir, ela emite — campo
 * obrigatório ausente NÃO vira default, porque o nó seguinte receberia um
 * "vazio plausível" e ninguém saberia de onde veio.
 */
export function problemaNaSaidaDaTela(
  tela: { saida: CampoDoConector[] },
  saida: Record<string, unknown>
): string | null {
  const decisao = saida[CAMPO_DA_DECISAO.chave];
  if (!(DECISOES_DA_TELA as readonly unknown[]).includes(decisao)) {
    return `a tela precisa devolver "decisao" com ${DECISOES_DA_TELA.map((d) => `"${d}"`).join(" ou ")} — veio ${JSON.stringify(decisao)}`;
  }
  for (const campo of tela.saida) {
    if (!campo.obrigatorio) continue;
    const valor = saida[campo.chave];
    if (valor === undefined || valor === null || valor === "") {
      return `a tela não devolveu "${campo.chave}" (${campo.rotulo}), que é obrigatório — ausente não vira default`;
    }
  }
  return null;
}
