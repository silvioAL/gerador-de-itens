import { beforeEach, describe, expect, it } from "vitest";
import { comCofreDeSegredos } from "./credenciaisComCofre.js";
import { nomeDoSegredoDeCredencial, type CofreDeSegredos } from "../portas/cofreDeSegredos.js";
import { resumirCredencialIa, type CredencialIa, type RepositorioDeCredenciais } from "../portas/repositorioDeCredenciais.js";

/**
 * SPEC-54 — a chave sai do banco e vai para o cofre. O que se prova aqui é a
 * divisão (segredo no cofre, configuração no banco), a migração de quem já
 * tinha chave gravada, e o modo de falhar: cofre fora do ar não vira
 * "não configurado".
 */
function bancoFalso(inicial: CredencialIa | null = null) {
  let guardado = inicial;
  const repo: RepositorioDeCredenciais = {
    obter: async () => guardado,
    salvar: async (_id, c) => {
      guardado = c;
    },
    resumir: async () => resumirCredencialIa(guardado),
  };
  return { repo, ver: () => guardado };
}

function cofreFalso(inicial: Record<string, string> = {}) {
  const segredos = { ...inicial };
  const cofre: CofreDeSegredos = {
    ler: async (nome) => segredos[nome] ?? null,
    gravar: async (nome, valor) => {
      segredos[nome] = valor;
    },
    apagar: async (nome) => {
      delete segredos[nome];
    },
  };
  return { cofre, ver: () => segredos };
}

const NOME = nomeDoSegredoDeCredencial("gateway");

describe("comCofreDeSegredos (SPEC-54)", () => {
  it("salvar manda a CHAVE pro cofre e a configuração pro banco", async () => {
    const banco = bancoFalso();
    const cofre = cofreFalso();
    const repo = comCofreDeSegredos(banco.repo, cofre.cofre);

    await repo.salvar("gateway", { baseUrl: "https://gw.empresa", chave: "sk-secreta", modelo: "qwen" });

    expect(cofre.ver()[NOME]).toBe("sk-secreta");
    // O banco fica com o endereço e o modelo — a tela precisa deles para se
    // desenhar — e SEM a chave, que é o ponto da SPEC.
    expect(banco.ver()).toMatchObject({ baseUrl: "https://gw.empresa", modelo: "qwen" });
    expect(banco.ver()?.chave).toBeUndefined();
  });

  it("obter recompõe os dois lados — quem chama não sabe que existe cofre", async () => {
    const banco = bancoFalso({ baseUrl: "https://gw.empresa", modelo: "qwen" });
    const cofre = cofreFalso({ [NOME]: "sk-secreta" });

    const credencial = await comCofreDeSegredos(banco.repo, cofre.cofre).obter("gateway");
    expect(credencial).toMatchObject({ baseUrl: "https://gw.empresa", modelo: "qwen", chave: "sk-secreta" });
  });

  it("a chave que já estava no BANCO migra sozinha na primeira leitura", async () => {
    const banco = bancoFalso({ baseUrl: "https://gw.empresa", chave: "sk-antiga" });
    const cofre = cofreFalso();
    const repo = comCofreDeSegredos(banco.repo, cofre.cofre);

    const credencial = await repo.obter("gateway");

    expect(credencial?.chave).toBe("sk-antiga");
    expect(cofre.ver()[NOME]).toBe("sk-antiga");
    // E some do banco — migrar sem limpar deixaria a chave nos dois lugares,
    // que é o problema que a SPEC existe para resolver.
    expect(banco.ver()?.chave).toBeUndefined();
    expect(banco.ver()?.baseUrl).toBe("https://gw.empresa");
  });

  it("salvar SEM chave preserva o segredo — o formulário volta com o campo mascarado vazio (§191)", async () => {
    const banco = bancoFalso({ baseUrl: "https://gw.empresa" });
    const cofre = cofreFalso({ [NOME]: "sk-existente" });
    const repo = comCofreDeSegredos(banco.repo, cofre.cofre);

    await repo.salvar("gateway", { baseUrl: "https://gw.nova", modelo: "sonnet" });

    expect(cofre.ver()[NOME]).toBe("sk-existente");
    expect((await repo.obter("gateway"))?.chave).toBe("sk-existente");
  });

  it("resumir diz CONFIGURADO com a chave no cofre — pelo banco, diria que não está", async () => {
    const banco = bancoFalso({ baseUrl: "https://gw.empresa" });
    const cofre = cofreFalso({ [NOME]: "sk-1234567890" });

    const resumo = await comCofreDeSegredos(banco.repo, cofre.cofre).resumir("gateway");
    expect(resumo.configurado).toBe(true);
    expect(resumo.chaveMascarada).toBe("sk-…7890");
    // O resumo é o que atravessa HTTP: a chave inteira nunca vai junto.
    expect(JSON.stringify(resumo)).not.toContain("sk-1234567890");
  });

  it("cofre fora do ar SOBE como erro, em vez de virar 'não configurado'", async () => {
    const banco = bancoFalso({ baseUrl: "https://gw.empresa" });
    const cofreQuebrado: CofreDeSegredos = {
      ler: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      gravar: async () => undefined,
      apagar: async () => undefined,
    };

    // Se isto virasse `{configurado: false}`, a tela pediria para configurar
    // uma chave já configurada — e o próximo salvar gravaria por cima.
    await expect(comCofreDeSegredos(banco.repo, cofreQuebrado).resumir("gateway")).rejects.toThrow("ECONNREFUSED");
  });

  it("sem nada no banco nem no cofre, continua sendo `null` — ausência é resposta", async () => {
    const repo = comCofreDeSegredos(bancoFalso().repo, cofreFalso().cofre);
    expect(await repo.obter("gateway")).toBeNull();
  });
});

describe("nomeDoSegredoDeCredencial (SPEC-54)", () => {
  it("vira um nome legível na UI do cofre, sem caractere que o Infisical recuse", () => {
    expect(nomeDoSegredoDeCredencial("gateway")).toBe("GERADOR_IA_GATEWAY");
    expect(nomeDoSegredoDeCredencial("open-router.v2")).toBe("GERADOR_IA_OPEN_ROUTER_V2");
  });
});
