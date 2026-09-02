import { describe, expect, it } from "vitest";
import { destinosDaOperacao, normalizarExportador, OPERACOES_DO_GATEWAY } from "./normalizacao.js";

/**
 * SPEC-81 fatia A — **os destinos do time.**
 *
 * A correção que reescreveu a SPEC: o produto não implementa MCP. Ele fala REST
 * com endereços configuráveis, e quem fala MCP com as ferramentas da casa é o
 * gateway — a mesma disciplina que a SPEC-49 já tinha escrito no adaptador de
 * exportação, e que o gateway de IA já usa.
 *
 * E são VÁRIOS endereços, não um: um gateway na frente do MCP do Jira, outro na
 * frente do Confluence, outro para os agentes da casa. Rotas diferentes,
 * payloads diferentes, autenticações possivelmente diferentes.
 */
describe("os destinos do gateway (SPEC-81 fatia A)", () => {
  it("quem já configurou exportação não reconfigura NADA", () => {
    // A garantia mais importante da fatia. Um documento salvo antes desta SPEC
    // atravessa igual, e o `endpoint` de topo continua sendo o dos itens.
    const antes = { endpoint: "https://agente.casa/itens", rotulo: "Jira", cabecalhos: { Authorization: "Bearer x" } };

    expect(normalizarExportador(antes)).toEqual(antes);
  });

  it("o endpoint de topo continua servindo como destino de ITENS", () => {
    const config = normalizarExportador({
      endpoint: "https://agente.casa/itens",
      rotulo: "Jira",
      cabecalhos: { Authorization: "Bearer x" },
    });

    expect(destinosDaOperacao(config, "itens")).toEqual([
      {
        id: "exportador",
        operacao: "itens",
        endpoint: "https://agente.casa/itens",
        rotulo: "Jira",
        cabecalhos: { Authorization: "Bearer x" },
        metodo: "POST",
        envelope: "itens",
        espaco: "",
      },
    ]);
  });

  it("três MCPs diferentes, três endereços — é o caso que a SPEC descreve", () => {
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      rotulo: "Jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [
        { id: "confluence", operacao: "documento", endpoint: "https://gw.casa/confluence", rotulo: "Confluence" },
        { id: "adr-repo", operacao: "adr", endpoint: "https://gw.casa/adr", rotulo: "ADRs de Engenharia" },
      ],
    });

    expect(destinosDaOperacao(config, "documento")[0].endpoint).toBe("https://gw.casa/confluence");
    expect(destinosDaOperacao(config, "adr")[0].endpoint).toBe("https://gw.casa/adr");
    expect(destinosDaOperacao(config, "itens")[0].endpoint).toBe("https://gw.casa/jira");
    // Operação sem destino configurado devolve lista vazia — e é assim que a
    // tela sabe não oferecer o botão, em vez de oferecer um que falharia.
    expect(destinosDaOperacao(config, "arquiteturaDeNegocio")).toEqual([]);
  });

  it("cabeçalhos ausentes no destino HERDAM os compartilhados", () => {
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [{ id: "c", operacao: "documento", endpoint: "https://gw.casa/confluence", rotulo: "Confluence" }],
    });

    expect(destinosDaOperacao(config, "documento")[0].cabecalhos).toEqual({ Authorization: "Bearer compartilhado" });
  });

  it("e declarados no destino VENCEM os herdados (§306)", () => {
    // É o que permite apontar para três MCPs com autenticações distintas.
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [
        { id: "adr", operacao: "adr", endpoint: "https://adr.casa", rotulo: "ADR", cabecalhos: { "X-Token": "proprio" } },
      ],
    });

    expect(destinosDaOperacao(config, "adr")[0].cabecalhos).toEqual({ "X-Token": "proprio" });
  });

  it("MAIS DE UM destino para a mesma operação é legítimo, e os dois voltam", () => {
    /**
     * Dois trackers numa migração, dois espaços de documentação por unidade de
     * negócio. É por isso que a forma é lista e não `Record<operacao, destino>`:
     * o mapa caberia em um só, e trocar depois exigiria migração.
     *
     * E é por isso que a função devolve os DOIS em vez de escolher: escolher
     * por quem usa publicaria no lugar errado em silêncio.
     */
    const config = normalizarExportador({
      endpoint: "",
      destinos: [
        { id: "conf-eng", operacao: "documento", endpoint: "https://gw/eng", rotulo: "Confluence Engenharia" },
        { id: "conf-prod", operacao: "documento", endpoint: "https://gw/prod", rotulo: "Confluence Produto" },
      ],
    });

    expect(destinosDaOperacao(config, "documento").map((d) => d.id)).toEqual(["conf-eng", "conf-prod"]);
  });

  it("descarta o que não dá para chamar: sem endereço, sem id, id repetido, operação desconhecida", () => {
    const config = normalizarExportador({
      endpoint: "",
      destinos: [
        { id: "ok", operacao: "documento", endpoint: "https://gw/ok", rotulo: "bom" },
        { id: "sem-endereco", operacao: "documento", endpoint: "   ", rotulo: "x" },
        { id: "", operacao: "documento", endpoint: "https://gw/x", rotulo: "x" },
        { id: "ok", operacao: "adr", endpoint: "https://gw/dup", rotulo: "id repetido" },
        { id: "inventada", operacao: "telepatia", endpoint: "https://gw/y", rotulo: "x" },
      ],
    });

    expect(config.destinos?.map((d) => d.id)).toEqual(["ok"]);
  });

  it("lixo no lugar da lista não derruba a normalização", () => {
    // O documento é `jsonb` opaco e nada impede alguém de gravar qualquer coisa
    // por API. Recusar o documento inteiro tiraria a exportação do ar por causa
    // de um campo novo.
    const config = normalizarExportador({ endpoint: "https://gw/jira", destinos: "não é lista" });

    expect(config.destinos).toBeUndefined();
    expect(config.endpoint).toBe("https://gw/jira");
  });

  it("as operações são um conjunto fechado", () => {
    /**
     * Fechado pela mesma razão das variáveis de template: endereço com propósito
     * que o produto não conhece é endereço que ninguém consegue chamar.
     *
     * **§349 — a quinta entrou, e a trava disparou primeiro.** Ela ficou
     * vermelha ao acrescentarmos `documentoExterno`, e estava certa em ficar:
     * uma operação nova é uma decisão, e não pode passar em silêncio. Isto é o
     * atrito que ela existe para criar — obrigar alguém a vir aqui escrever por
     * que a lista cresceu.
     *
     * A quinta é **leitura de um documento por link** (SPEC-100 §4), e difere
     * das outras duas leituras em quem escolhe o alvo: `adr` e
     * `arquiteturaDeNegocio` buscam num lugar que o gateway já conhece; aqui a
     * pessoa manda o endereço.
     */
    expect([...OPERACOES_DO_GATEWAY]).toEqual([
      "itens",
      "documento",
      "adr",
      "arquiteturaDeNegocio",
      "documentoExterno",
    ]);
  });
});

/**
 * §346 — **a variação de curl entre agentes.**
 *
 * Pedido do usuário: *"é possível que existam diferentes agentes no gateway, é
 * preciso lidar com isso… o curl da chamada vai conter variações entre
 * agentes"*, com a pergunta de onde isso deveria morar.
 *
 * **Resposta: na configuração do GATEWAY**, junto do endereço — e não numa
 * configuração de "agentes". O motivo é de vocabulário, e é o mesmo cuidado que
 * a SPEC-94 §1.4 teve com "níveis": **"agente" já significa outra coisa aqui** —
 * os papéis da esteira (PO, arquiteto, especialista, QA), em `pipeline-agentes`.
 * Um segundo sentido para a mesma palavra é o §263 na forma mais barata de
 * evitar.
 *
 * E é onde a informação pertence: o verbo e o formato do corpo são propriedades
 * **do endereço**, como os cabeçalhos já são.
 */
describe("a variação de curl por destino (§346)", () => {
  const comDestino = (extra: Record<string, unknown>) =>
    normalizarExportador({
      endpoint: "",
      destinos: [{ id: "d1", operacao: "documento", endpoint: "https://gw/doc", rotulo: "Confluence", ...extra }],
    });

  it("sem declarar nada, o contrato é o QUE JÁ EXISTIA — e ele não é uniforme", () => {
    /**
     * **O defeito que dois testes existentes pegaram.**
     *
     * A primeira escrita fez o padrão ser "o nome da operação" — elegante, e
     * errado: o único contrato que embrulha é o de ITENS (`{ itens: [...] }`,
     * SPEC-49). Documento, ADR e arquitetura sempre mandaram o corpo **cru na
     * raiz**, e é isso que os agentes já escritos esperam.
     *
     * Com o padrão uniforme, `POST /documento/publicar` passou a mandar
     * `{ documento: {...} }` — **quebrando todo gateway já configurado**, em
     * silêncio, sem ninguém mudar configuração nenhuma.
     */
    expect(destinosDaOperacao(comDestino({}), "documento")[0].envelope).toBe("");
    expect(destinosDaOperacao(comDestino({}), "documento")[0].metodo).toBe("POST");

    const itens = normalizarExportador({
      endpoint: "",
      destinos: [{ id: "j", operacao: "itens", endpoint: "https://gw/jira", rotulo: "Jira" }],
    });
    expect(destinosDaOperacao(itens, "itens")[0].envelope).toBe("itens");
  });

  it("aceita PUT — publicar página VIVA é idempotente, e o verbo diz isso", () => {
    const [d] = destinosDaOperacao(comDestino({ metodo: "PUT" }), "documento");

    expect(d.metodo).toBe("PUT");
  });

  it("método desconhecido cai no padrão e NÃO descarta o destino", () => {
    /**
     * As três razões de descarte da normalização são "o que sobra não dá para
     * chamar". Um verbo estranho não é uma delas: o endereço continua chamável,
     * e recusar o destino inteiro faria um erro de digitação apagar a integração
     * da tela sem dizer por quê.
     */
    const destinos = destinosDaOperacao(comDestino({ metodo: "DELETE" }), "documento");

    expect(destinos).toHaveLength(1);
    expect(destinos[0].metodo).toBe("POST");
  });

  it("o envelope pode ser outro nome — o agente que espera `data` recebe `data`", () => {
    const [d] = destinosDaOperacao(comDestino({ envelope: "data" }), "documento");

    expect(d.envelope).toBe("data");
  });

  it('envelope VAZIO é escolha declarada: o payload vai na raiz do corpo', () => {
    /**
     * O caso que um `||` teria apagado. `""` não é ausência — é *"não embrulhe"*,
     * e há agentes assim. A alternativa seria obrigá-los a um campo que ignoram.
     */
    const [d] = destinosDaOperacao(comDestino({ envelope: "" }), "documento");

    expect(d.envelope).toBe("");
  });

  it("o destino herdado da SPEC-49 continua com o contrato dele", () => {
    // Ele não ganhou campos na configuração porque o contrato dele É o padrão.
    const [d] = destinosDaOperacao(
      normalizarExportador({ endpoint: "https://agente.casa/itens", rotulo: "Jira" }),
      "itens",
    );

    expect(d.metodo).toBe("POST");
    expect(d.envelope).toBe("itens");
  });
});
