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
];

export function funcaoDoSistema(id: string): FuncaoDoSistema | undefined {
  return FUNCOES_DO_SISTEMA.find((f) => f.id === id);
}
