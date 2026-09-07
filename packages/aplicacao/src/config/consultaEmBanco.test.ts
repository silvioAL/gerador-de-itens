import { describe, expect, it } from "vitest";
import {
  LIMITE_MAXIMO_DA_CONSULTA,
  comLimite,
  parametrosDoSql,
  problemaNaConsulta,
  problemaNosParametros,
  traduzirConsulta,
} from "./consultaEmBanco.js";

/**
 * SPEC-110 fatia D (D6) — **o banco como componente, e as quatro travas.**
 *
 * O v1 é estreito de propósito: Postgres, só consulta. As provas cobram o que
 * o torna seguro num produto onde gente não-técnica escreve o fluxo —
 * parâmetros nomeados (nunca interpolação), a régua do "só consulta", o LIMIT
 * forçado, e os parâmetros batendo nos dois sentidos.
 */

describe("parametrosDoSql", () => {
  it("acha os nomeados, na ordem da primeira aparição, sem repetir", () => {
    expect(parametrosDoSql("select * from t where a = :b and c = :d and e = :b")).toEqual(["b", "d"]);
  });

  it("NÃO confunde o cast `::text` do Postgres com um parâmetro", () => {
    // Uma regex ingênua leria ":text" aqui — e a consulta pediria um campo
    // que ninguém tem.
    expect(parametrosDoSql("select id::text from t where x = :cliente")).toEqual(["cliente"]);
  });

  it("ignora o que está dentro de literal, identificador citado e comentário", () => {
    expect(parametrosDoSql("select ':nao' as a, \":tambem_nao\" from t -- :nem_isso\nwhere x = :sim")).toEqual(["sim"]);
    expect(parametrosDoSql("/* :comentado */ select 1 where x = :usado")).toEqual(["usado"]);
  });
});

describe("traduzirConsulta (o valor NUNCA entra no texto)", () => {
  it("`:nome` vira `$n` e os valores viajam à parte, na ordem", () => {
    const { texto, valores } = traduzirConsulta("select * from t where a = :b and c = :d and e = :b", { b: 1, d: "x" });
    expect(texto).toBe("select * from t where a = $1 and c = $2 and e = $1");
    expect(valores).toEqual([1, "x"]);
  });

  it("o que está em literal NÃO é traduzido — é texto, e continua texto", () => {
    const { texto, valores } = traduzirConsulta("select ':literal' as a from t where x = :real", { real: 7 });
    expect(texto).toBe("select ':literal' as a from t where x = $1");
    expect(valores).toEqual([7]);
  });

  it("o cast sobrevive à tradução", () => {
    const { texto } = traduzirConsulta("select id::text from t where x = :c", { c: 1 });
    expect(texto).toBe("select id::text from t where x = $1");
  });

  /**
   * §9.3 na borda do banco: uma entrada ausente viraria `null` e a consulta
   * devolveria o conjunto ERRADO em silêncio — pior que falhar.
   */
  it("parâmetro sem valor é RECUSA nomeada, não `null`", () => {
    expect(() => traduzirConsulta("select 1 where x = :faltando", {})).toThrow(/":faltando"/);
    expect(() => traduzirConsulta("select 1 where x = :f", { f: undefined })).toThrow(/ausente não vira default/);
    // Vazio e zero são VALORES: quem os mandou os quis.
    expect(traduzirConsulta("select 1 where x = :f", { f: "" }).valores).toEqual([""]);
    expect(traduzirConsulta("select 1 where x = :f", { f: 0 }).valores).toEqual([0]);
  });
});

describe("comLimite (nenhuma consulta volta sem teto)", () => {
  it("acrescenta o LIMIT quando não há", () => {
    expect(comLimite("select * from t")).toBe("select * from t LIMIT 100");
    expect(comLimite("select * from t;")).toBe("select * from t LIMIT 100");
    expect(comLimite("select * from t", 5)).toBe("select * from t LIMIT 5");
  });

  it("RESPEITA o limit que a pessoa escreveu — sobrescrever seria mentir sobre o que roda", () => {
    expect(comLimite("select * from t limit 3")).toBe("select * from t limit 3");
  });

  it("um `limit` dentro de literal não conta como teto", () => {
    expect(comLimite("select 'limit' from t")).toBe("select 'limit' from t LIMIT 100");
  });

  it("o teto do teto vale, e o piso também", () => {
    expect(comLimite("select 1", 99999)).toContain(`LIMIT ${LIMITE_MAXIMO_DA_CONSULTA}`);
    expect(comLimite("select 1", 0)).toContain("LIMIT 1");
  });
});

describe("problemaNaConsulta (a régua do SÓ CONSULTA)", () => {
  const ok = { motor: "postgres" as const, segredoDaConexao: "pg-vendas", sql: "select id from clientes" };

  it("aceita SELECT e WITH", () => {
    expect(problemaNaConsulta(ok, "o conector")).toBeNull();
    expect(problemaNaConsulta({ ...ok, sql: "with a as (select 1) select * from a" }, "o conector")).toBeNull();
    // Comentário antes do SELECT não descaracteriza a consulta.
    expect(problemaNaConsulta({ ...ok, sql: "-- nota\nselect 1" }, "o conector")).toBeNull();
  });

  it("recusa o que escreve, dizendo onde a escrita mora (SPEC-108)", () => {
    for (const sql of ["insert into t values (1)", "update t set a = 1", "delete from t", "drop table t"]) {
      expect(problemaNaConsulta({ ...ok, sql }, "o conector"), sql).toMatch(/só consulta/);
    }
    // O verbo ESCONDIDO depois de um select também: a régua não é só o começo.
    expect(problemaNaConsulta({ ...ok, sql: "select 1; delete from t" }, "o conector")).toMatch(/verbo de escrita/);
  });

  it("um verbo dentro de literal NÃO é escrita — é texto", () => {
    expect(problemaNaConsulta({ ...ok, sql: "select 'delete' as acao from t" }, "o conector")).toBeNull();
  });

  it("recusa SQL vazio, segredo ausente e motor fora do v1", () => {
    expect(problemaNaConsulta({ ...ok, sql: "  " }, "o conector")).toMatch(/sem SQL/);
    expect(problemaNaConsulta({ ...ok, segredoDaConexao: "" }, "o conector")).toMatch(/COFRE/);
    expect(problemaNaConsulta({ ...ok, motor: "mongo" as never }, "o conector")).toMatch(/só fala postgres/);
  });

  it("recusa limite fora da faixa", () => {
    expect(problemaNaConsulta({ ...ok, limite: 0 }, "o conector")).toMatch(/entre 1 e/);
    expect(problemaNaConsulta({ ...ok, limite: 99999 }, "o conector")).toMatch(/entre 1 e/);
  });
});

describe("problemaNosParametros (os dois sentidos)", () => {
  it("declarado que o SQL não usa é pergunta sem propósito", () => {
    expect(problemaNosParametros("select 1", ["cliente"], "o conector")).toMatch(/o SQL não usa/);
  });

  it("usado sem declarar falharia SÓ na execução, com o fluxo na mão", () => {
    expect(problemaNosParametros("select 1 where x = :cliente", [], "o conector")).toMatch(/sem declarar como entrada/);
  });

  it("batendo dos dois lados, passa", () => {
    expect(problemaNosParametros("select 1 where x = :cliente", ["cliente"], "o conector")).toBeNull();
  });
});
