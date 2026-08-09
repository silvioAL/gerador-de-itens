import { afterEach, describe, expect, it } from "vitest";
import { exigirBancoDescartavel, nomeDoBanco, URL_BANCO_DE_TESTE } from "./bancoDeTeste.js";

/**
 * A trava é a defesa que sobra quando a outra falha: alguém pode redefinir
 * `DATABASE_URL` no shell, num `.env`, num workflow — e voltar a truncar o banco
 * de trabalho sem perceber. Estes testes existem pra que ela não seja afrouxada
 * por engano num refactor.
 */

const original = process.env.PERMITIR_BANCO_NAO_TESTE;
afterEach(() => {
  if (original === undefined) delete process.env.PERMITIR_BANCO_NAO_TESTE;
  else process.env.PERMITIR_BANCO_NAO_TESTE = original;
});

describe("trava do banco de teste", () => {
  it("recusa o banco de desenvolvimento — o caso que causou o estrago real", () => {
    delete process.env.PERMITIR_BANCO_NAO_TESTE;
    expect(() => exigirBancoDescartavel("postgres://gerador:gerador@localhost:5432/gerador")).toThrow(
      /não termina em "_test"/
    );
  });

  it("a mensagem diz o que fazer, não só que deu errado", () => {
    delete process.env.PERMITIR_BANCO_NAO_TESTE;
    try {
      exigirBancoDescartavel("postgres://gerador:gerador@localhost:5432/producao");
      expect.unreachable("devia ter recusado");
    } catch (e) {
      const msg = String(e);
      expect(msg).toContain("producao"); // qual banco foi recusado
      expect(msg).toContain(URL_BANCO_DE_TESTE); // a URL certa pra usar
      expect(msg).toContain("PERMITIR_BANCO_NAO_TESTE=1"); // e o escape consciente
    }
  });

  it("aceita o banco próprio da suíte", () => {
    delete process.env.PERMITIR_BANCO_NAO_TESTE;
    expect(() => exigirBancoDescartavel(URL_BANCO_DE_TESTE)).not.toThrow();
  });

  it("o escape explícito libera — quem assume o risco declara", () => {
    process.env.PERMITIR_BANCO_NAO_TESTE = "1";
    expect(() => exigirBancoDescartavel("postgres://gerador:gerador@localhost:5432/gerador")).not.toThrow();
  });

  it("extrai o nome ignorando query string — sslmode não pode virar parte do nome", () => {
    expect(nomeDoBanco("postgres://u:s@host:5432/gerador_test?sslmode=require")).toBe("gerador_test");
  });
});
