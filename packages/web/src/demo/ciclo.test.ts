import { describe, expect, it } from "vitest";
import { ESTAGIOS_DO_CICLO, contagemDoCiclo } from "./ciclo";
import { CONEXOES } from "./conceito";
import { AREAS_CONFIG_CONHECIDAS, hashDaRota, rotaDoHash } from "../navegacao/rota";

/**
 * SPEC-76 fatia D — **a prova de que a página não mente.**
 *
 * A régua da SPEC é uma frase: *a página não pode prometer o que o produto não
 * faz.* Ela é a mesma que o produto cobra de todo mundo lá dentro —
 * proveniência, lacuna contável, "sugerido" que não vira fato. Uma landing que
 * desenhe estágios inexistentes seria o produto violando, na porta de entrada,
 * a única coisa que ele exige.
 *
 * Régua em prosa envelhece calada. Esta é conferida contra o roteador de
 * verdade: um estágio que perder a tela derruba a suíte no mesmo commit.
 */
describe("o ciclo não promete o que o produto não faz (SPEC-76 fatia D)", () => {
  it("todo estágio que EXISTE tem uma rota de verdade", () => {
    const semRota = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente" && !e.rota);

    expect(semRota.map((e) => e.id), "estágio marcado como existente sem endereço é promessa sem porta").toEqual([]);
  });

  it("e a rota RESOLVE — não é um objeto que ninguém navega", () => {
    // `hashDaRota` → `rotaDoHash` tem que fechar o laço. Hash desconhecido cai
    // no canvas por decisão do §61, então uma rota inventada aqui passaria
    // despercebida numa asserção só de "não é undefined".
    for (const estagio of ESTAGIOS_DO_CICLO) {
      if (!estagio.rota) continue;
      expect(rotaDoHash(hashDaRota(estagio.rota)), `rota do estágio "${estagio.id}"`).toEqual(estagio.rota);
    }
  });

  it("estágio AUSENTE não pode ter rota — seria prometer porta para o que não existe", () => {
    const ausenteComRota = ESTAGIOS_DO_CICLO.filter((e) => e.estado === "ausente" && e.rota);

    expect(ausenteComRota.map((e) => e.id)).toEqual([]);
  });

  /* "o que não está completo DIZ o que falta" mudou de lugar: virou uma das
     duas asserções do laço `AFIRMACOES`, no fim do arquivo, porque `CONEXOES`
     precisa exatamente da mesma. Ver o comentário de lá (SPEC-85 §0.4). */

  it("§346: a frase da contagem não promete uma marcação enquanto exibe uma", () => {
    /**
     * **O defeito que a própria rodada criou, achado olhando a captura.**
     *
     * `existem` conta `!== "ausente"`, então `parcial` entra nele — e está certo:
     * parcial existe, incompleto. Mas a tela escolhia a frase por
     * `existem === total`, e a escolhida dizia *"quando um não existir, ele
     * aparece aqui marcado"* — **no futuro, com um já marcado na tela**.
     *
     * Nenhum teste pegaria: os dois números continuavam certos, e o errado era a
     * frase que eles selecionavam. Por isso a trava é sobre a **relação** entre a
     * contagem e o que a lista mostra, não sobre os números.
     */
    const { existem, total, parciais } = contagemDoCiclo();
    const marcados = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "completo").length;

    // `parciais` é subconjunto do que `existem` conta — se isto quebrar, a
    // definição de "existe" mudou e a frase precisa ser revista junto.
    expect(parciais).toBeLessThanOrEqual(existem);
    // E a promessa de "nada marcado" só pode ser feita quando de fato não há.
    if (existem === total && parciais === 0) {
      expect(marcados, "a tela diria 'quando um não existir' com estágio marcado na lista").toBe(0);
    }
  });

  it("a contagem sai do dado, não da prosa", () => {
    /**
     * A SPEC-76 contou "nove de doze". Viraram dez de treze quando a SPEC-77
     * ficou pronta, e treze de treze na SPEC-84. É exatamente por isto que a
     * contagem não pode ser um número digitado num parágrafo: ela ficaria
     * mentindo sobre trabalho entregue, nas duas direções.
     *
     * ## O que esta asserção deixou de afirmar, e por quê
     *
     * Ela dizia `existem < total` — "sempre falta alguma coisa". Era uma
     * suposição sobre o estado do produto disfarçada de prova sobre o dado, e
     * ficou vermelha no dia em que o último buraco fechou. O que interessa
     * guardar é que a **conta bate com a lista**; quantos faltam é resultado,
     * não invariante.
     */
    const { existem, total } = contagemDoCiclo();

    expect(total).toBe(ESTAGIOS_DO_CICLO.length);
    expect(existem).toBe(ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente").length);
    expect(existem).toBeLessThanOrEqual(total);
  });

  /**
   * SPEC-84 fatia C — **a trava que pega o dado envelhecendo para o lado
   * conservador.**
   *
   * O `mcp` ficou marcado como "não existe" por quatro rodadas depois de a
   * SPEC-81 inteira ter sido entregue, e nada acusou: as travas de então só
   * cobravam o otimismo (estágio que promete sem ter rota). Envelhecer para o
   * lado de baixo é igualmente uma mentira, e mais difícil de notar — ninguém
   * abre a landing procurando o que ela está escondendo.
   */
  it("estágio que aponta para uma área de config aponta para uma que EXISTE", () => {
    const areasFantasma = ESTAGIOS_DO_CICLO.filter(
      (e) => e.rota?.tela === "config" && !AREAS_CONFIG_CONHECIDAS.includes(e.rota.area)
    );

    expect(areasFantasma.map((e) => e.id)).toEqual([]);
  });

  /**
   * SPEC-85 §0.4 — **a trava do §327 era estreita demais, e a prova disso levou
   * três horas.**
   *
   * Ela cobrava `ESTAGIOS_DO_CICLO`. `CONEXOES` mora no arquivo vizinho, é a
   * mesma pergunta ("isto existe?") sobre outra coisa, usa o **mesmo tipo de
   * estado** — e duas das cinco estavam mentindo na página no ar: "ADRs da casa"
   * dizia *"falta a tela para importar"* depois de §325 e §326, e "Spec →
   * desenvolvimento com IA" dizia *"falta a tela para escrevê-lo"* no dia
   * seguinte ao §327 tê-la construído.
   *
   * Escrever a trava para a **instância** em vez de para a **classe** foi o
   * defeito. Agora as duas listas passam pelo mesmo laço, e a próxima lista que
   * nascer com `EstadoDoEstagio` entra aqui por uma linha.
   */
  const AFIRMACOES = [
    { nome: "ESTAGIOS_DO_CICLO", itens: ESTAGIOS_DO_CICLO as { id: string; estado: string; oQueFalta?: string }[] },
    { nome: "CONEXOES", itens: CONEXOES as { id: string; estado: string; oQueFalta?: string }[] },
  ];

  for (const { nome, itens } of AFIRMACOES) {
    it(`${nome}: o que não está completo DIZ o que falta`, () => {
      // Marcar sem explicar é o mesmo que não marcar: quem lê fica sabendo que
      // há um buraco e não sabe qual.
      const semExplicacao = itens.filter((e) => e.estado !== "completo" && !e.oQueFalta?.trim());

      expect(semExplicacao.map((e) => e.id)).toEqual([]);
    });

    it(`${nome}: a marca de ausência cita a SPEC ou o § que responde por ela`, () => {
      /**
       * Não dá para o teste ler o JOURNEY. O que dá é cobrar a única coisa que a
       * marca precisa carregar para não apodrecer: **uma frase que envelhece
       * visivelmente.**
       *
       * "Não avaliado ainda" e "Avaliado e adiado" são exatamente as frases que
       * não envelhecem — continuam plausíveis para sempre, inclusive depois de
       * falsas. Uma que cita `§324` fica errada de um jeito que dá para ver.
       */
      const semData = itens.filter((e) => e.estado === "ausente" && !/SPEC-\d+|§\d+/.test(e.oQueFalta ?? ""));

      expect(
        semData.map((e) => e.id),
        `em ${nome}, o ausente tem que citar a SPEC ou o § que responde por ele — frase vaga não envelhece`
      ).toEqual([]);
    });
  }

  it("os ids são únicos — é por eles que o desdobramento abre", () => {
    const ids = ESTAGIOS_DO_CICLO.map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
