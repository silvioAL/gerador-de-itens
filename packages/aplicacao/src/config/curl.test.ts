import { describe, expect, it } from "vitest";
import {
  baseUrlDeChat,
  ehRecusa,
  envelopeDoCorpo,
  interpretarCurl,
  mascarar,
  modeloDoCorpo,
  reconhecerGateway,
  separarSegredo,
  type CurlInterpretado,
} from "./curl.js";

/**
 * SPEC-118 fatias A, B e E — o interpretador, a chave separada, e o que o corpo
 * diz sobre a IA.
 */

function interpretado(texto: string): CurlInterpretado {
  const r = interpretarCurl(texto);
  if (ehRecusa(r)) throw new Error(`esperava sucesso, veio recusa: ${r.erro}`);
  return r;
}

function recusa(texto: string): string {
  const r = interpretarCurl(texto);
  if (!ehRecusa(r)) throw new Error("esperava recusa, veio sucesso");
  return r.erro;
}

describe("interpretarCurl (SPEC-118 fatia A)", () => {
  /**
   * §3.3 — o mesmo pedido nas quatro formas que aparecem na prática: o que o
   * Postman exporta (flags longas), as formas curtas, o verbo omitido, e o
   * comando numa linha só.
   */
  const POSTMAN = `curl --location 'https://gw.empresa/jira/issues' \\
--header 'Authorization: Bearer abc123' \\
--header 'Content-Type: application/json' \\
--data '{"itens": [{"chave": "n1"}]}'`;

  const CURTO = `curl -X POST 'https://gw.empresa/jira/issues' \\
  -H 'Authorization: Bearer abc123' \\
  -H 'Content-Type: application/json' \\
  -d '{"itens": [{"chave": "n1"}]}'`;

  const UMA_LINHA = `curl -X POST "https://gw.empresa/jira/issues" -H "Authorization: Bearer abc123" -H "Content-Type: application/json" -d '{"itens": [{"chave": "n1"}]}'`;

  const DATA_RAW = `curl --location --request POST 'https://gw.empresa/jira/issues' \\
--header 'Authorization: Bearer abc123' \\
--header 'Content-Type: application/json' \\
--data-raw '{"itens": [{"chave": "n1"}]}'`;

  it.each([
    ["exportado do Postman", POSTMAN],
    ["formas curtas", CURTO],
    ["numa linha só", UMA_LINHA],
    ["--data-raw", DATA_RAW],
  ])("a MESMA chamada em %s produz o mesmo resultado", (_caso, texto) => {
    // É a prova literal da fatia A. O dialeto é do Postman; os outros entram
    // de brinde, e o teste é o que garante que continuam entrando.
    expect(interpretado(texto)).toEqual({
      url: "https://gw.empresa/jira/issues",
      metodo: "POST",
      cabecalhos: { Authorization: "Bearer abc123", "Content-Type": "application/json" },
      corpo: '{"itens": [{"chave": "n1"}]}',
    });
  });

  it("`--location` é comportamento do CLIENTE, não configuração — é ignorado", () => {
    // §3.3: seguir redirect é do curl, não do destino. Recusar o comando por
    // causa dele faria o produto rejeitar exatamente os curls que as pessoas
    // têm (o Postman sempre o exporta).
    expect(interpretado(`curl --location --compressed -k 'https://gw/x'`).url).toBe("https://gw/x");
  });

  it("verbo omitido COM corpo é POST; sem corpo é GET", () => {
    // O que o próprio cURL faz, e já é o padrão do produto.
    expect(interpretado(`curl 'https://gw/x' --data '{}'`).metodo).toBe("POST");
    expect(interpretado(`curl 'https://gw/x'`).metodo).toBe("GET");
  });

  it("cabeçalho com espaços e dois-pontos no VALOR sobrevive inteiro", () => {
    /**
     * O defeito que um `split(" ")` ingênuo produz: o cabeçalho chega truncado
     * no primeiro espaço. Passa nos testes com header curto e falha com o real.
     */
    const { cabecalhos } = interpretado(`curl 'https://gw/x' -H 'X-Origem: time de pagamentos: fraude'`);

    expect(cabecalhos["X-Origem"]).toBe("time de pagamentos: fraude");
  });

  it("aspas duplas com escape dentro do corpo atravessam", () => {
    const { corpo } = interpretado(`curl 'https://gw/x' --data "{\\"a\\": 1}"`);

    expect(corpo).toBe('{"a": 1}');
  });

  it("`-u` vira Authorization Basic — é o que ele é na rede", () => {
    // E assim ele passa pela MESMA separação de segredo da fatia B, em vez de
    // criar um segundo caminho por onde a chave chega.
    expect(interpretado(`curl 'https://gw/x' -u 'abc:123'`).cabecalhos["Authorization"]).toBe("Basic abc:123");
  });

  describe("o que não foi entendido volta como RECUSA NOMEADA", () => {
    /**
     * §3.3 — *"recusa nomeada é melhor que parse parcial silencioso, que
     * preencheria metade do formulário e deixaria a outra metade com o valor
     * antigo"*. E ninguém descobriria até a chamada falhar em produção.
     */
    it("texto que não é curl", () => {
      expect(recusa("Invoke-WebRequest -Uri https://gw/x")).toContain("não reconheci este formato");
    });

    it("curl sem endereço", () => {
      expect(recusa(`curl -H 'A: b'`)).toContain("não achei o endereço");
    });

    it("endereço que não é http", () => {
      expect(recusa(`curl 'gw.empresa/x'`)).toContain("não começa com http");
    });

    it("cabeçalho sem dois-pontos — o comando veio cortado", () => {
      expect(recusa(`curl 'https://gw/x' -H 'Authorization'`)).toContain("esperava o formato");
    });

    it("flag sem valor — o comando veio cortado", () => {
      expect(recusa(`curl 'https://gw/x' --header`)).toContain("parece estar cortado");
    });

    it("multipart, que nenhuma operação deste produto usa", () => {
      // Ignorá-lo produziria endereço certo e corpo errado — falha na primeira
      // chamada, longe daqui.
      expect(recusa(`curl 'https://gw/x' -F 'arquivo=@spec.md'`)).toContain("formulário (multipart)");
    });

    it("texto vazio pede o que falta, em vez de dizer “erro”", () => {
      expect(recusa("   ")).toContain("cole o curl");
    });
  });
});

describe("separarSegredo (SPEC-118 fatia B)", () => {
  it("a chave sai dos cabeçalhos, e a tela sabe QUAL cabeçalho a carregava", () => {
    /**
     * A régua mais importante da SPEC, e a única cujo erro é irreversível:
     * chave vazada não se desvaza. O cabeçalho é devolvido porque a regra 3 da
     * §3.1 exige que a tela DIGA que reconheceu um segredo — silêncio faria a
     * pessoa achar que a chave foi para a config versionável.
     */
    const { cabecalhos, chave, cabecalhoDaChave } = separarSegredo({
      Authorization: "Bearer abc123",
      "Content-Type": "application/json",
      "X-Team": "pagamentos",
    });

    expect(chave).toBe("Bearer abc123");
    expect(cabecalhoDaChave).toBe("Authorization");
    expect(cabecalhos).toEqual({ "Content-Type": "application/json", "X-Team": "pagamentos" });
  });

  it.each(["Authorization", "authorization", "X-API-Key", "x-auth-token"])(
    "%s é reconhecido como segredo, em qualquer caixa",
    (nome) => {
      expect(separarSegredo({ [nome]: "segredo" }).chave).toBe("segredo");
    }
  );

  it("cabeçalho que NÃO é de autenticação continua visível, mesmo longo", () => {
    /**
     * A heurística é curta de propósito: "qualquer valor com mais de 20
     * caracteres" classificaria `X-Team: pagamentos-fraude-antifraude` como
     * segredo e o esconderia de quem precisa conferi-lo. Errar para menos
     * deixa um cabeçalho visível; errar para mais esconde configuração.
     */
    const { cabecalhos, chave } = separarSegredo({ "X-Team": "pagamentos-fraude-antifraude-chargeback" });

    expect(chave).toBeUndefined();
    expect(cabecalhos["X-Team"]).toBe("pagamentos-fraude-antifraude-chargeback");
  });

  it("curl sem autenticação não inventa segredo nenhum", () => {
    expect(separarSegredo({ "Content-Type": "application/json" })).toEqual({
      cabecalhos: { "Content-Type": "application/json" },
    });
  });
});

describe("mascarar (SPEC-118 fatia B)", () => {
  it("mostra o começo — é o que permite reconhecer QUAL chave é, sem revelá-la", () => {
    // `sk-prod…` versus `sk-hml…` é a diferença que alguém precisa ver para
    // saber se configurou o ambiente certo.
    expect(mascarar("sk-prod-abcdefghijklmnop")).toBe("sk-pro…••••");
  });

  it("chave curta some inteira — mostrar 6 de 8 não é mascarar", () => {
    expect(mascarar("abc123")).toBe("••••••");
  });
});

describe("envelopeDoCorpo (SPEC-118 §2.1)", () => {
  it("uma chave de topo com lista dentro É o envelope", () => {
    expect(envelopeDoCorpo('{"itens": [{"chave": "n1"}]}')).toBe("itens");
  });

  it("uma chave de topo com objeto dentro também", () => {
    expect(envelopeDoCorpo('{"data": {"a": 1}}')).toBe("data");
  });

  it("corpo com VÁRIAS chaves de topo não está embrulhado — payload na raiz", () => {
    // `""` é escolha declarada no produto (payload na raiz), e não ausência.
    expect(envelopeDoCorpo('{"titulo": "x", "markdown": "y"}')).toBe("");
  });

  it("uma chave de topo com valor ESCALAR não é envelope", () => {
    expect(envelopeDoCorpo('{"link": "https://x"}')).toBe("");
  });

  it("corpo que não é JSON devolve “não sei”, e não um chute", () => {
    /**
     * `undefined` é diferente de `""`. Chutar aqui gravaria um embrulho que o
     * agente do outro lado não espera — e o formulário deve ficar com o valor
     * que já tinha, não com um inventado.
     */
    expect(envelopeDoCorpo("nao e json")).toBeUndefined();
    expect(envelopeDoCorpo("")).toBeUndefined();
    expect(envelopeDoCorpo("[1,2,3]")).toBeUndefined();
  });
});

describe("o curl de um gateway de IA (SPEC-118 fatia E)", () => {
  const CURL_IA = `curl --location 'https://gw.empresa/ia/v1/chat/completions' \\
--header 'Authorization: Bearer sk-abc123456' \\
--header 'Content-Type: application/json' \\
--data '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "oi"}]}'`;

  it("o curl configura a conexão SEM ninguém digitar /v1", () => {
    // A prova literal da fatia E.
    const { url, cabecalhos, corpo } = interpretado(CURL_IA);
    const { chave } = separarSegredo(cabecalhos);

    expect(baseUrlDeChat(url)).toBe("https://gw.empresa/ia/v1");
    expect(modeloDoCorpo(corpo)).toBe("gpt-4o-mini");
    expect(chave).toBe("Bearer sk-abc123456");
  });

  it("endereço que NÃO é de chat completions volta inteiro", () => {
    /**
     * Cortar por palpite produziria uma base que não existe. Um endereço
     * completo errado é mais fácil de diagnosticar que um truncado.
     */
    expect(baseUrlDeChat("https://gw.empresa/ia/v1")).toBe("https://gw.empresa/ia/v1");
    expect(baseUrlDeChat("https://gw.empresa/ia/v1/")).toBe("https://gw.empresa/ia/v1");
  });

  it("corpo sem `model` não inventa modelo", () => {
    expect(modeloDoCorpo('{"messages": []}')).toBeUndefined();
    expect(modeloDoCorpo("nao e json")).toBeUndefined();
  });
});

/**
 * SPEC-118 §2.0 — a correção do usuário: é UM gateway, com endpoints que
 * variam. E um importador ingênuo destruiria a herança de cabeçalhos que a
 * SPEC-81 construiu para exatamente esse caso.
 */
describe("reconhecerGateway (SPEC-118 §2.0)", () => {
  const GATEWAY = { endpoint: "https://gw.empresa/jira/issues", cabecalhos: { "X-Org": "acme" } };

  it("mesmo host e mesmos cabeçalhos: o destino HERDA, e a chave continua numa linha só", () => {
    /**
     * Sem isto, cada destino ficaria com a sua cópia da chave — e rotacioná-la
     * viraria edição em N lugares, com a que alguém esquecer falhando semanas
     * depois, sozinha.
     */
    const r = reconhecerGateway(
      "https://gw.empresa/jira/issues/spec",
      { Authorization: "Bearer abc", "X-Org": "acme" },
      GATEWAY
    );

    expect(r.mesmoGateway).toBe(true);
    expect(r.cabecalhosParaGuardar).toEqual({});
  });

  it("compara HOST, não a URL inteira — o endpoint é justamente o que varia", () => {
    // Comparar a URL nunca casaria (`/adr`, `/issues`, `/issues/spec`), e a
    // herança continuaria sendo destruída com um mecanismo a mais parecendo
    // protegê-la.
    expect(reconhecerGateway("https://gw.empresa/adr", { "X-Org": "acme" }, GATEWAY).mesmoGateway).toBe(true);
  });

  it("host diferente é outro gateway — os cabeçalhos dele vão junto", () => {
    // Quem aponta para gateways realmente diferentes continua declarando por
    // destino: a régua do §306 não muda, só deixa de ser acionada por acidente.
    const r = reconhecerGateway("https://outro.gw/x", { Authorization: "Bearer z", "X-Org": "beta" }, GATEWAY);

    expect(r.mesmoGateway).toBe(false);
    expect(r.cabecalhosParaGuardar).toEqual({ "X-Org": "beta" });
  });

  it("cabeçalho a MAIS não é herança — ele é informação só daquele destino", () => {
    const r = reconhecerGateway(
      "https://gw.empresa/issues",
      { Authorization: "Bearer abc", "X-Org": "acme", "X-Team": "pagamentos" },
      GATEWAY
    );

    expect(r.mesmoGateway).toBe(false);
    expect(r.cabecalhosParaGuardar).toEqual({ "X-Team": "pagamentos" });
  });

  it("sem gateway configurado ainda, o curl traz tudo que não é segredo", () => {
    const r = reconhecerGateway("https://gw/x", { Authorization: "Bearer a", "X-Org": "acme" }, undefined);

    expect(r.mesmoGateway).toBe(false);
    expect(r.cabecalhosParaGuardar).toEqual({ "X-Org": "acme" });
  });

  it("a chave NUNCA entra no que se guarda — nem quando o gateway é outro", () => {
    // A régua da fatia B atravessa esta função: o segredo sai dos cabeçalhos
    // antes de qualquer comparação.
    const r = reconhecerGateway("https://outro.gw/x", { Authorization: "Bearer z" }, GATEWAY);

    expect(Object.keys(r.cabecalhosParaGuardar)).not.toContain("Authorization");
  });
});
