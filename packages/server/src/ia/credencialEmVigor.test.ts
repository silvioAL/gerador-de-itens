import { describe, expect, it } from "vitest";
import type { CredencialIa } from "@gerador/aplicacao";
import { credencialEmVigor, enderecoDoDuble } from "./credencialEmVigor.js";

/**
 * SPEC-89 fatia A — **qual credencial vale, e de onde ela veio.**
 *
 * A prova mais importante deste arquivo é a primeira: **sem a declaração, nada
 * muda.** É ela que impede esta rodada de virar o defeito que a SPEC existe para
 * evitar — produto respondendo com texto inventado onde ninguém configurou
 * gateway.
 */

const SALVA: CredencialIa = {
  baseUrl: "https://gateway.da.casa/v1",
  chave: "chave-de-verdade",
  modelo: "claude",
} as CredencialIa;

const COM_DUBLE = { GATEWAY_FALSO_URL: "http://gateway-falso:4123/v1" } as NodeJS.ProcessEnv;
const SEM_NADA = {} as NodeJS.ProcessEnv;

describe("sem a declaração, o comportamento é o de hoje (SPEC-89 §1)", () => {
  it("sem credencial e sem `GATEWAY_FALSO_URL`, devolve null — e a rota responde 503", () => {
    /**
     * O risco inteiro da rodada numa asserção.
     *
     * "Sem credencial, use o dublê" seria fácil e perigoso: numa implantação de
     * produção sem gateway, o produto passaria a responder com texto inventado
     * em vez de recusar — e ninguém notaria até alguém aprovar um documento
     * escrito por um dublê.
     */
    expect(credencialEmVigor(null, SEM_NADA)).toBeNull();
  });

  it("variável vazia ou só espaços não conta como declaração", () => {
    // Um `GATEWAY_FALSO_URL=` no `.env` é ausência, não endereço.
    expect(credencialEmVigor(null, { GATEWAY_FALSO_URL: "" } as NodeJS.ProcessEnv)).toBeNull();
    expect(credencialEmVigor(null, { GATEWAY_FALSO_URL: "   " } as NodeJS.ProcessEnv)).toBeNull();
    expect(enderecoDoDuble({ GATEWAY_FALSO_URL: "  " } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("credencial pela metade também não vale — é o critério que as rotas já usavam", () => {
    expect(credencialEmVigor({ baseUrl: "https://x/v1" } as CredencialIa, SEM_NADA)).toBeNull();
    expect(credencialEmVigor({ chave: "só a chave" } as CredencialIa, SEM_NADA)).toBeNull();
  });
});

describe("a credencial de VERDADE sempre vence (SPEC-89 §1)", () => {
  it("com credencial salva, o dublê declarado é ignorado", () => {
    /**
     * A promessa que a SPEC-74 fatia B fez em voz alta: quem já configurou um
     * gateway real não pode ver a demanda apontar para o dublê sozinha. É a
     * mesma régua do §306 — declarado vence herdado.
     */
    const vigor = credencialEmVigor(SALVA, COM_DUBLE);

    expect(vigor?.credencial.baseUrl).toBe("https://gateway.da.casa/v1");
    expect(vigor?.simulado).toBe(false);
  });
});

describe("com a declaração, a instalação nova já responde (SPEC-89 §0.1)", () => {
  it("sem credencial, cai no dublê — e vem MARCADO como simulado", () => {
    /**
     * A marca não é decoração: conteúdo simulado que não chega marcado é o
     * defeito que a SPEC-74 fatia D existe para evitar. Quem consome este
     * resultado precisa repassá-la.
     */
    const vigor = credencialEmVigor(null, COM_DUBLE);

    expect(vigor?.simulado).toBe(true);
    expect(vigor?.credencial.baseUrl).toBe("http://gateway-falso:4123/v1");
    expect(vigor?.credencial.chave).toBeTruthy();
    expect(vigor?.credencial.modelo).toBeTruthy();
  });

  it("o dialeto é `json_object` — o mesmo que um endereço desconhecido receberia", () => {
    // Os dois caminhos concordam de propósito: o dublê lê o schema do PROMPT,
    // que é o que `json_object` produz (SPEC-74).
    expect(credencialEmVigor(null, COM_DUBLE)?.credencial.formatoJson).toBe("json_object");
  });

  it("o compose pode trocar a chave do dublê sem o produto saber", () => {
    const vigor = credencialEmVigor(null, { ...COM_DUBLE, GATEWAY_FALSO_CHAVE: "outra" } as NodeJS.ProcessEnv);

    expect(vigor?.credencial.chave).toBe("outra");
  });

  it("o endereço vem da variável, não de um valor fixo — dev fora do compose usa 127.0.0.1", () => {
    // O mesmo dublê sobe fora do compose (é o que a suíte E2E faz), e o
    // endereço de lá é outro. Fixar o nome do serviço aqui deixaria o
    // desenvolvimento local de fora.
    const vigor = credencialEmVigor(null, { GATEWAY_FALSO_URL: "http://127.0.0.1:4123/v1" } as NodeJS.ProcessEnv);

    expect(vigor?.credencial.baseUrl).toBe("http://127.0.0.1:4123/v1");
  });
});
