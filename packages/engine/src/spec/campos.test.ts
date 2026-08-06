import { describe, expect, it } from "vitest";
import type { No } from "../model/types.js";
import type { FieldSpec, PerfilTime } from "../config/types.js";
import { resolverDefault } from "./campos.js";

function no(overrides: Partial<No> = {}): No {
  return { id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {}, specNA: {}, ...overrides };
}

describe("resolverDefault — perfil de stack do time", () => {
  const campoSemDefault: FieldSpec = { key: "linguagem", label: "Linguagem", type: "text" };
  const perfil: PerfilTime = { service: { linguagem: "Java", framework: "Spring Boot" } };

  it("sem perfil e sem default estático, retorna undefined (comportamento anterior preservado)", () => {
    expect(resolverDefault(campoSemDefault, no())).toBeUndefined();
  });

  it("usa o perfil do time quando o campo não tem default estático", () => {
    expect(resolverDefault(campoSemDefault, no(), perfil)).toBe("Java");
  });

  it("perfil não cobre o tipo de nó atual — retorna undefined", () => {
    expect(resolverDefault(campoSemDefault, no({ type: "rabbit" }), perfil)).toBeUndefined();
  });

  it("default estático do schema sempre vence o perfil do time", () => {
    const campoComDefault: FieldSpec = { key: "ack", label: "Ack", type: "select", default: "manual" };
    const perfilComAck: PerfilTime = { service: { ack: "auto" } };
    expect(resolverDefault(campoComDefault, no(), perfilComAck)).toBe("manual");
  });

  it("template {{campo}} continua resolvendo contra o próprio nó, ignorando o perfil", () => {
    const campoTemplate: FieldSpec = { key: "dlxName", label: "DLX", type: "text", default: "{{topic}}.dlx" };
    const noComTopic = no({ type: "rabbit", spec: { topic: { valor: "fila.x", origem: "manual" } } });
    expect(resolverDefault(campoTemplate, noComTopic, perfil)).toBe("fila.x.dlx");
  });
});
