import { afterEach, describe, expect, it, vi } from "vitest";
import { lembrarTime, lerTimeLembrado } from "./timeLembrado";

/**
 * #280. O comportamento óbvio (lembra o que salvou) é o menos importante aqui —
 * o que precisa de teste é o que acontece quando a lembrança está ERRADA:
 * outro usuário, time perdido, storage indisponível. Nesses três, lembrar
 * demais é pior que não lembrar.
 */
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("timeLembrado (#280)", () => {
  it("lembra o time entre recargas — o motivo de existir", () => {
    lembrarTime("ana@x.com", "pagamentos");
    expect(lerTimeLembrado("ana@x.com", ["pagamentos", "credito"])).toBe("pagamentos");
  });

  it("não vaza o time de um usuário pro outro na mesma máquina", () => {
    // Sem a chave por e-mail, quem trocasse de conta veria os campos
    // customizados do time da conta anterior — e o sintoma seria "por que a
    // config está errada?", longe da causa.
    lembrarTime("ana@x.com", "pagamentos");
    expect(lerTimeLembrado("bruno@x.com", ["pagamentos", "credito"])).toBeUndefined();
  });

  it("time que saiu da sessão é ignorado, em vez de prender a pessoa nele", () => {
    // Perder acesso a um time é exatamente o caso em que uma lembrança teimosa
    // faz estrago: a tela pediria dados de um time que o servidor recusa.
    lembrarTime("ana@x.com", "time-antigo");
    expect(lerTimeLembrado("ana@x.com", ["pagamentos"])).toBeUndefined();
  });

  it("storage indisponível não derruba o app — só volta a perguntar", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado (modo privado)");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage bloqueado (modo privado)");
    });

    expect(() => lembrarTime("ana@x.com", "pagamentos")).not.toThrow();
    expect(lerTimeLembrado("ana@x.com", ["pagamentos"])).toBeUndefined();
  });
});
