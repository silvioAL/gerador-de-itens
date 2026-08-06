import { describe, expect, it } from "vitest";
import type { FieldSpec, No } from "../model/types.js";
import { calcularProntidao } from "./prontidao.js";

const spec: FieldSpec[] = [{ key: "nome", label: "Nome", type: "text", required: true }];

describe("calcularProntidao — nó sem a chave specNA (não só specNA vazio)", () => {
  it("não lança quando o nó não tem specNA (dado antigo/externo, ex. quebra hand-edited ou fixture legada)", () => {
    const no = { id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {} } as unknown as No;

    expect(() => calcularProntidao(spec, no, [])).not.toThrow();
    expect(calcularProntidao(spec, no, []).nivel).toBe("vermelho");
  });

  it("mesmo sem specNA, um valor manual preenchido ainda deixa o campo verde", () => {
    const no = {
      id: "n1",
      type: "service",
      x: 0,
      y: 0,
      label: "srv",
      status: "novo",
      spec: { nome: { valor: "srv-x", origem: "manual" } },
    } as unknown as No;

    expect(calcularProntidao(spec, no, []).nivel).toBe("verde");
  });
});
