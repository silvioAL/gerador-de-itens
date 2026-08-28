import { describe, expect, it } from "vitest";
import { ESTAGIOS_DO_CICLO, contagemDoCiclo } from "./ciclo";
import { hashDaRota, rotaDoHash } from "../navegacao/rota";

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

  it("o que não está completo DIZ o que falta", () => {
    // Marcar como parcial ou ausente sem explicar é o mesmo que não marcar:
    // quem lê fica sabendo que há um buraco e não sabe qual.
    const semExplicacao = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "completo" && !e.oQueFalta?.trim());

    expect(semExplicacao.map((e) => e.id)).toEqual([]);
  });

  it("a contagem sai do dado, não da prosa", () => {
    // A SPEC contou "nove de doze". São dez de treze — a volumetria de produto
    // ficou pronta na SPEC-77, três dias depois de a tabela dela ser escrita.
    // É exatamente por isto que a contagem não pode ser um número digitado num
    // parágrafo: ela ficaria mentindo sobre trabalho entregue.
    const { existem, total } = contagemDoCiclo();

    expect(total).toBe(ESTAGIOS_DO_CICLO.length);
    expect(existem).toBe(ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente").length);
    expect(existem).toBeLessThan(total);
  });

  it("os ids são únicos — é por eles que o desdobramento abre", () => {
    const ids = ESTAGIOS_DO_CICLO.map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
