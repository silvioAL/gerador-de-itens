import { describe, expect, it } from "vitest";
import {
  CABECALHO_DAS_INSTRUCOES_DO_TIME,
  CONVERSAS_DO_ASSISTENTE,
  comInstrucoesDoTime,
  conversaPorId,
  IDS_DE_CONVERSA,
  type IdDeConversa,
} from "./conversas.js";
import {
  montarPedidoAlterarItem,
  montarPedidoCenariosDeLentidao,
  montarPedidoConfigurarConversa,
  montarPedidoDecisoes,
  montarPedidoDiagrama,
  montarPedidoNecessidades,
  montarPedidoScriptDeMapeamento,
  montarPedidoSugerirConfig,
  type PedidoIa,
} from "./pedidos.js";

/**
 * SPEC-117 fatias B, C e D — **a anatomia existe para TODA conversa, não só
 * para a esteira; e o preâmbulo do time acrescenta sem derrubar nada.**
 *
 * A técnica é a mesma de `pedidos.anatomia.test.ts`, e o motivo é o mesmo: uma
 * tabela que descreve um prompt envelhece calada. Aqui ela monta **um pedido de
 * verdade por conversa** e exige que todo `marcador` apareça nele. Mudar a
 * montagem sem mudar a tabela quebra o build — que é a única forma de a
 * explicação na tela não virar mentira.
 */

const PREAMBULO = "Escreva no tom do time de pagamentos, e cite o número do chamado quando houver.";

/**
 * Um pedido real por conversa, com o preâmbulo do time SEMPRE ligado.
 *
 * Ligado sempre é deliberado: é assim que o teste da fatia D tem dentes. Se o
 * preâmbulo entrasse desligado, a prova de que as regras inegociáveis
 * sobrevivem a ele não estaria sendo feita.
 */
const PEDIDOS: Record<IdDeConversa, () => PedidoIa> = {
  diagrama: () =>
    montarPedidoDiagrama({
      descricao: "receber o pagamento e avisar o parceiro",
      tiposDeNo: [{ id: "service", rotulo: "Serviço" }],
      preambuloDoTime: PREAMBULO,
    }),
  decisoes: () =>
    montarPedidoDecisoes({
      componentes: [{ id: "n1", rotulo: "srv-pagamento", tipo: "service" }],
      preambuloDoTime: PREAMBULO,
    }),
  necessidades: () => montarPedidoNecessidades({ contextoEpico: "cobrar uma vez só", preambuloDoTime: PREAMBULO }),
  scriptDeMapeamento: () =>
    montarPedidoScriptDeMapeamento({
      rotulo: "srv-pagamento",
      tipo: "Serviço",
      techs: ["java"],
      preambuloDoTime: PREAMBULO,
    }),
  alterarItem: () =>
    montarPedidoAlterarItem({
      instrucao: "deixe o critério de aceite mais específico",
      itemRotulo: "01 — Cobrança",
      campos: [{ chave: "criterios", rotulo: "Critérios de aceite" }],
      preambuloDoTime: PREAMBULO,
    }),
  cenariosDeLentidao: () =>
    montarPedidoCenariosDeLentidao({
      elementos: [{ tipo: "no", id: "n1", rotulo: "bureau", msAtual: 300, externo: true }],
      preambuloDoTime: PREAMBULO,
    }),
  sugerirConfig: () =>
    montarPedidoSugerirConfig({
      alvo: "campo-no",
      instrucao: "um campo para a chave de idempotência",
      preambuloDoTime: PREAMBULO,
    }),
  configurarConversa: () =>
    montarPedidoConfigurarConversa({
      mensagens: [{ autor: "voce", texto: "quero um campo de timeout no serviço" }],
      preambuloDoTime: PREAMBULO,
    }),
};

describe("o catálogo das conversas (SPEC-117 fatia B)", () => {
  it("toda conversa declarada tem um pedido que a exercita — e vice-versa", () => {
    /**
     * O controle de cobertura. Sem ele, acrescentar uma conversa ao catálogo e
     * esquecer de montá-la aqui deixaria a suíte verde sobre uma conversa que
     * ninguém testou — o falso verde do §292.
     */
    expect(CONVERSAS_DO_ASSISTENTE.map((c) => c.id).sort()).toEqual([...IDS_DE_CONVERSA].sort());
    expect(Object.keys(PEDIDOS).sort()).toEqual([...IDS_DE_CONVERSA].sort());
  });

  it("nenhuma conversa fica sem anatomia — era exatamente a falta que a §0.2 mediu", () => {
    /**
     * *"Repare que essa anatomia só existe para a esteira. As outras oito
     * conversas não têm nem a classificação: não há como uma pessoa saber o que
     * ali é dela e o que é do produto, porque nada é dela."*
     */
    for (const conversa of CONVERSAS_DO_ASSISTENTE) {
      expect(conversa.anatomia.length, conversa.id).toBeGreaterThan(0);
      // E toda uma tem a parte configurável: é o que a fatia C entrega.
      expect(conversa.anatomia.some((p) => p.origem === "configuravel"), conversa.id).toBe(true);
    }
  });

  it.each(IDS_DE_CONVERSA)("%s — todo marcador da anatomia aparece no prompt de verdade", (id) => {
    // A trava de envelhecimento. Mudar a montagem sem mudar a tabela quebra
    // aqui, e é a única coisa que impede a tela de explicar um prompt que não
    // existe mais.
    const { prompt } = PEDIDOS[id]();
    const conversa = conversaPorId(id)!;

    for (const parte of conversa.anatomia) {
      expect(prompt, `${id} › ${parte.id}`).toContain(parte.marcador);
    }
  });

  it("a parte configurável é a MESMA em todas — o bloco do time tem uma forma só", () => {
    // Formas diferentes por conversa fariam quem escreve o preâmbulo ter que
    // aprender oito convenções para a mesma coisa.
    const configuraveis = CONVERSAS_DO_ASSISTENTE.flatMap((c) => c.anatomia.filter((p) => p.origem === "configuravel"));

    expect(new Set(configuraveis.map((p) => p.marcador)).size).toBe(1);
  });
});

/**
 * SPEC-117 fatia D — **as regras inegociáveis são DADO, e o teste as cobra.**
 *
 * A §3 mediu o risco: vários prompts carregam regra de produto, não
 * preferência. `montarPedidoScriptDeMapeamento` exige somente leitura e proíbe
 * inventar endereço; `montarPedidoDecisoes` exige duas alternativas. O que se
 * perde se sumirem está escrito na SPEC, e o pior é literal: *"um comando
 * destrutivo colado num terminal com acesso"*.
 *
 * Com o preâmbulo acrescentando, nada pode sumir por construção — e é
 * justamente por isso que este teste importa: ele é o que transforma
 * "por construção" em verificação.
 */
describe("as regras inegociáveis (SPEC-117 fatia D)", () => {
  it("existem, e são poucas — se a lista esvaziar, a fatia D virou documentação outra vez", () => {
    const inegociaveis = CONVERSAS_DO_ASSISTENTE.flatMap((c) => c.anatomia.filter((p) => p.inegociavel));

    expect(inegociaveis.length).toBeGreaterThanOrEqual(5);
    // Inegociável é sempre `fixo`: uma regra de produto que a pessoa edita não
    // é inegociável, é preferência com nome errado.
    expect(inegociaveis.every((p) => p.origem === "fixo")).toBe(true);
  });

  it.each(IDS_DE_CONVERSA)("%s — trocar o preâmbulo do time NÃO derruba regra nenhuma", (id) => {
    /**
     * A prova que a fatia C pede: *"um preâmbulo salvo aparece no prompt
     * montado, e as regras inegociáveis da §3 continuam presentes — teste que
     * falha se sumirem"*.
     */
    const { prompt } = PEDIDOS[id]();
    const conversa = conversaPorId(id)!;

    expect(prompt).toContain(PREAMBULO);
    for (const parte of conversa.anatomia.filter((p) => p.inegociavel)) {
      expect(prompt, `${id} › ${parte.id} sumiu com o preâmbulo do time`).toContain(parte.marcador);
    }
  });

  it("o script de mapeamento continua SOMENTE LEITURA — a mais cara de todas", () => {
    // §3: o que se perde é "um comando destrutivo colado num terminal com
    // acesso". Vale um teste com nome próprio.
    const { prompt } = PEDIDOS.scriptDeMapeamento();

    expect(prompt).toContain("SOMENTE leitura");
    expect(prompt).toContain("Não invente endereço");
  });
});

describe("o bloco das instruções do time (SPEC-117 fatia C)", () => {
  it("entra no FIM, nomeado, e declarando a precedência do produto", () => {
    /**
     * A mitigação da contradição (SPEC-119, resposta à pergunta 2): *"o
     * preâmbulo entra num bloco nomeado e o prompt do produto diz a precedência
     * em voz alta"*. Sem essa linha, "no máximo 3" do time e "no máximo 8" do
     * produto viram duas ordens, e o modelo resolve sozinho — mal.
     */
    const resultado = comInstrucoesDoTime("Você é um agente.\nRegras:\n- Responda em português.", "Seja breve.");

    expect(resultado.indexOf("Seja breve.")).toBeGreaterThan(resultado.indexOf("Responda em português"));
    expect(resultado).toContain(CABECALHO_DAS_INSTRUCOES_DO_TIME());
    expect(resultado).toContain("as instruções do produto valem");
  });

  it("preâmbulo vazio não acrescenta NADA — o prompt sai byte a byte igual ao de hoje", () => {
    /**
     * A garantia de compatibilidade da fatia C. Um cabeçalho seguido de nada
     * também ensinaria o modelo a ignorar cabeçalhos, que é o custo escondido
     * de "sempre acrescentar o bloco".
     */
    const original = "Você é um agente.";

    expect(comInstrucoesDoTime(original, undefined)).toBe(original);
    expect(comInstrucoesDoTime(original, "   ")).toBe(original);
  });

  it.each(IDS_DE_CONVERSA)("%s — sem preâmbulo, o prompt é o mesmo de antes", (id) => {
    // Quem nunca abrir a aba nova não percebe diferença nenhuma. É a régua de
    // toda fatia A deste projeto, aplicada à C.
    const comPreambulo = PEDIDOS[id]().prompt;
    const semNada = comPreambulo.split(`\n\n${CABECALHO_DAS_INSTRUCOES_DO_TIME()}`)[0];

    expect(semNada).not.toContain(PREAMBULO);
    expect(semNada.length).toBeGreaterThan(0);
  });
});
