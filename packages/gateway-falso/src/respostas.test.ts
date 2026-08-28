import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  montarPedidoAlterarItem,
  montarPedidoCenariosDeLentidao,
  montarPedidoConfigurarConversa,
  montarPedidoDecisoes,
  montarPedidoDiagrama,
  montarPedidoNecessidades,
  montarPedidoPipeline,
  montarPedidoSugerirConfig,
  type PedidoIa,
} from "@gerador/aplicacao";
import { validarContraSchema } from "@gerador/llm/gateway";
import { CHAVE_GATEWAY_FALSO, criarGatewayFalso, MARCA_GATEWAY_FALSO } from "./gatewayFalso.js";
import { marcadoresConhecidos, tipoDoPedido, type TipoDePedido } from "./respostas.js";

/**
 * SPEC-74 fatia C — a prova de que o dublê e os PEDIDOS não divergem.
 *
 * Este arquivo não inventa prompts: ele chama os `montarPedido*` de verdade,
 * manda o que eles produzem para o dublê, e valida a resposta contra o esquema
 * do próprio pedido — com o mesmo `validarContraSchema` que o provedor usa em
 * produção.
 *
 * É a trava que faltava. Se alguém reescrever a primeira linha de um prompt em
 * `pedidos.ts`, ou apertar um esquema, aqui fica vermelho — em vez de o dublê
 * silenciosamente cair no fallback e a pessoa descobrir só quando a tela ficar
 * estranha. É o §263 (duas versões da mesma coisa divergem na primeira
 * mudança) resolvido por teste, e não por acoplamento de runtime: o pacote
 * continua sem UMA dependência fora do `node:http`; `@gerador/aplicacao` é
 * devDependency.
 */
let servidor: Server;
let base: string;

beforeAll(async () => {
  servidor = criarGatewayFalso({ respostas: "plausivel" });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve())));
});

/** Manda o pedido como o provedor manda, e devolve o texto remontado do SSE. */
async function perguntar(pedido: Pick<PedidoIa, "prompt"> & { esquema?: unknown }): Promise<string> {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CHAVE_GATEWAY_FALSO}` },
    body: JSON.stringify({
      model: "modelo-de-mentira",
      messages: [{ role: "user", content: pedido.prompt }],
      stream: true,
      ...(pedido.esquema ? { response_format: { type: "json_schema", json_schema: { schema: pedido.esquema } } } : {}),
    }),
  });
  const bruto = await r.text();
  return bruto
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)).choices[0].delta.content as string)
    .join("");
}

/** Um pedido de cada tipo, montado pelos montadores DE VERDADE. */
const PEDIDOS: [TipoDePedido, PedidoIa][] = [
  [
    "pipeline",
    montarPedidoPipeline({
      preambulo: "Você escreve a história de usuário e os critérios de aceite.",
      contextoEpico: "Portabilidade de propostas aprovadas para o parceiro.",
      itens: [
        {
          chave: "svc-cotacao::spec",
          rotulo: "Serviço de cotação",
          placeholders: [
            { chave: "historia", rotulo: "História de usuário" },
            { chave: "criterios", rotulo: "Critérios de aceite" },
          ],
        },
      ],
    }),
  ],
  [
    "diagrama",
    montarPedidoDiagrama({
      descricao: "Uma proposta aprovada precisa chegar ao parceiro, consultando o bureau de crédito antes.",
      tiposDeNo: [
        { id: "servico", rotulo: "Serviço" },
        { id: "fila", rotulo: "Fila" },
        { id: "banco", rotulo: "Banco de dados" },
      ],
      tiposDeConexao: [
        { id: "publica", rotulo: "publica em" },
        { id: "chama", rotulo: "chama" },
      ],
    }),
  ],
  [
    "alterar-item",
    montarPedidoAlterarItem({
      instrucao: "Deixe o teto de tempo explícito.",
      itemRotulo: "Serviço de cotação",
      campos: [
        { chave: "contrato", rotulo: "Contrato", valorAtual: "POST /cotacoes" },
        { chave: "erros", rotulo: "Erros" },
      ],
    }),
  ],
  ["sugerir-config", montarPedidoSugerirConfig({ alvo: "regra-refinamento", instrucao: "Toda fila declara DLQ." })],
  [
    "configurar",
    montarPedidoConfigurarConversa({
      mensagens: [{ autor: "voce", texto: "Quero exigir teto de tempo nas conexões que esperam." }],
    }),
  ],
  [
    "decisoes",
    montarPedidoDecisoes({
      contextoEpico: "Portabilidade de propostas aprovadas.",
      componentes: [
        { id: "svc-cotacao", rotulo: "Serviço de cotação", tipo: "servico" },
        { id: "fila-aprovadas", rotulo: "Fila de aprovadas", tipo: "fila" },
      ],
      violacoes: [
        { noId: "fila-aprovadas", campo: "dlq", esperado: "declarada", atual: "vazio", porque: "o que falha some" },
      ],
    }),
  ],
  [
    "cenarios-de-lentidao",
    montarPedidoCenariosDeLentidao({
      elementos: [
        { tipo: "no", id: "bureau", rotulo: "Bureau de crédito", msAtual: 800, externo: true },
        { tipo: "aresta", id: "svc->bureau", rotulo: "cotação chama bureau", msAtual: 1000 },
      ],
      respostaAtualMs: 1800,
    }),
  ],
  [
    "necessidades",
    montarPedidoNecessidades({
      contextoEpico: "A proposta aprovada precisa chegar ao parceiro no mesmo dia.",
      componentes: [{ id: "svc-cotacao", rotulo: "Serviço de cotação", tipo: "servico" }],
    }),
  ],
];

describe("respostas por tipo (SPEC-74 fatia C)", () => {
  it.each(PEDIDOS)("%s: o dublê reconhece o pedido pelo marcador do prompt", (tipo, pedido) => {
    expect(tipoDoPedido(pedido.prompt)).toBe(tipo);
  });

  it.each(PEDIDOS)("%s: a resposta plausível OBEDECE o esquema do próprio pedido", async (_tipo, pedido) => {
    const texto = await perguntar(pedido);
    const erros = validarContraSchema(JSON.parse(texto), pedido.esquema);

    expect(erros).toEqual([]);
  });

  it.each(PEDIDOS)("%s: e não é mais o esqueleto — o texto tem forma de resposta", async (_tipo, pedido) => {
    const texto = await perguntar(pedido);

    expect(texto).not.toContain(MARCA_GATEWAY_FALSO);
    // O que separa "serve para o teste" de "serve para avaliar tela": um campo
    // com uma frase de verdade, e não um identificador de caminho.
    expect(texto.length).toBeGreaterThan(200);
  });

  it("a conversa de configuração não é confundida com a sugestão avulsa", () => {
    // As duas primeiras linhas começam igual e divergem numa vírgula. Se a
    // ordem da tabela de marcadores inverter, este teste cai.
    const conversa = PEDIDOS.find(([t]) => t === "configurar")![1];
    const avulsa = PEDIDOS.find(([t]) => t === "sugerir-config")![1];

    expect(tipoDoPedido(conversa.prompt)).toBe("configurar");
    expect(tipoDoPedido(avulsa.prompt)).toBe("sugerir-config");
  });

  it("o texto livre de /ia/sugerir deixa de responder 'ok'", async () => {
    // Este prompt mora inline em `routes/ia.ts`, e é o único caminho do produto
    // sem esquema — no esqueleto ele devolve literalmente "…: ok", que não deixa
    // avaliar nem o campo nem o botão de aceitar.
    const texto = await perguntar({
      prompt: [
        "Você ajuda a especificar um requisito técnico de refinamento de software.",
        "Requisito a especificar: \"Teto de tempo\"",
      ].join("\n"),
    });

    expect(texto).not.toContain(": ok");
    expect(texto.length).toBeGreaterThan(40);
  });

  it("é determinística: o mesmo pedido devolve sempre a mesma resposta", async () => {
    const pedido = PEDIDOS.find(([t]) => t === "necessidades")![1];

    expect(await perguntar(pedido)).toBe(await perguntar(pedido));
  });

  it("e varia entre pedidos diferentes — senão a tela nunca mostra uma lista desigual", async () => {
    const a = await perguntar(PEDIDOS.find(([t]) => t === "necessidades")![1]);
    const b = await perguntar(
      montarPedidoNecessidades({ contextoEpico: "Outra demanda, outro assunto, outro texto." })
    );

    expect(a).not.toBe(b);
  });

  it("a tabela de marcadores cobre todos os tipos que o produto pede", () => {
    // Contra o esquecimento na direção contrária: um tipo novo em `pedidos.ts`
    // sem entrada aqui cairia no fallback sem ninguém notar.
    const naTabela = new Set(marcadoresConhecidos().map(([t]) => t));
    for (const [tipo] of PEDIDOS) expect(naTabela).toContain(tipo);
    expect(naTabela).toContain("sugerir-campo");
  });
});

describe("o modo esqueleto continua sendo o default (SPEC-74 fatia C)", () => {
  it("sem opção nenhuma, a resposta é a de sempre — é disso que a suíte E2E depende", async () => {
    const outro = criarGatewayFalso();
    await new Promise<void>((resolve) => outro.listen(0, "127.0.0.1", resolve));
    const r = await fetch(`http://127.0.0.1:${(outro.address() as AddressInfo).port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CHAVE_GATEWAY_FALSO}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: "qualquer coisa" }],
        response_format: {
          type: "json_schema",
          json_schema: { schema: { type: "object", properties: { label: { type: "string" } } } },
        },
      }),
    });
    const texto = (await r.text())
      .split("\n")
      .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
      .map((l) => JSON.parse(l.slice(6)).choices[0].delta.content as string)
      .join("");

    expect(JSON.parse(texto).label).toBe(`${MARCA_GATEWAY_FALSO} (label)`);

    await new Promise<void>((resolve, reject) => outro.close((e) => (e ? reject(e) : resolve())));
  });
});
