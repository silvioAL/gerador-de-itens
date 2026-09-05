import { createServer, type Server } from "node:http";
import { respostaPlausivel } from "./respostas.js";

/**
 * SPEC-31 — um gateway compatível com a OpenAI, falso e determinístico, pra
 * exercitar o modo hospedado NO NAVEGADOR.
 *
 * ## Por que isto existe
 *
 * A Fase 4 entregou as rotas de IA do modo hospedado com a suíte do server
 * verde, e mesmo assim **quatro defeitos** chegaram ao usuário. Todos os quatro
 * passavam por `app.inject()` sem reclamar, porque `inject` exercita o
 * *handler* — não o sistema. Ele não faz CORS, não roda num navegador, não tem
 * tela:
 *
 * 1. O streaming escrevia direto em `reply.raw`, pulando os cabeçalhos de CORS
 *    que o `@fastify/cors` já tinha montado. `curl` funcionava, o navegador
 *    bloqueava a leitura — e o lote inteiro sumia sem erro visível.
 * 2. `formatoJson` não era inferido da base URL, então a Anthropic devolvia 400.
 * 3. `/ia/credencial/testar` ignorava o corpo postado, e o primeiro "Testar
 *    conexão" da vida sempre falhava com "nenhuma credencial configurada"
 *    enquanto a pessoa olhava pros campos preenchidos.
 * 4. `/ia/status` devolvia `modelosChat: []`, e a aba "Modelo de IA" não
 *    mostrava formulário nenhum — só um aviso mandando rodar um comando que não
 *    existe em container.
 *
 * Um gateway de verdade não serve pra teste (chave, rede, custo, resposta
 * diferente a cada vez). Este fala o mesmo protocolo — `POST
 * {baseUrl}/chat/completions`, SSE, `Authorization: Bearer` — e responde sempre
 * a mesma coisa. O que ele NÃO faz é fingir: não há mock do `fetch`, o servidor
 * chama HTTP de verdade, e o navegador lê a resposta de verdade.
 *
 * ## SPEC-74 — por que ele deixou de morar no E2E
 *
 * Ele nasceu em `packages/web/e2e/gatewayFalso.ts`, e por isso só existia
 * enquanto o Playwright estivesse rodando: quem sobe a stack pra TRABALHAR não
 * o tinha, e continuava gastando token de API pra ver uma tela. Promovê-lo a
 * pacote é o que permite subi-lo no `docker compose`.
 *
 * Pacote próprio, e não um subpath de `@gerador/llm`: o `packages/server`
 * copia o `llm` inteiro pra dentro da imagem, e um dublê não pode ser
 * dependência de produção. É a mesma fronteira que `gateway.fronteira.test.ts`
 * guarda contra o binário nativo, pelo mesmo motivo.
 */

/** Fixa e obviamente falsa: aparece no teste, no log e em nenhum lugar real. */
export const CHAVE_GATEWAY_FALSO = "chave-de-mentira-do-e2e";

/** Marca que o teste procura na tela — se aparecer, o texto atravessou o
 * caminho inteiro: navegador → server → gateway → SSE → server → navegador. */
export const MARCA_GATEWAY_FALSO = "escrito-pelo-gateway-falso";

export const PORTA_GATEWAY_FALSO = 4123;

export const BASE_URL_GATEWAY_FALSO = `http://127.0.0.1:${PORTA_GATEWAY_FALSO}/v1`;

export const MODELO_GATEWAY_FALSO = "modelo-de-mentira";

/**
 * §265 — a palavra que faz o dublê FALHAR de propósito.
 *
 * O rastro da esteira só tem o que provar se existir uma falha de verdade
 * atravessando servidor e gateway. A alternativa era gravar uma credencial
 * quebrada, e isso mexe num estado que é da organização inteira — com specs
 * rodando em paralelo, seria um teste sabotando os vizinhos.
 *
 * Assim a falha viaja no PEDIDO: só quem pede para falhar falha.
 */
export const PEDIR_FALHA_AO_GATEWAY = "FALHAR_DE_PROPOSITO";

/** SPEC-30 Fase 1a — o que o gateway falso "ouve", sempre. Uma frase que soa
 * como demanda ditada, pra o teste conferir que ela chegou no campo certo. */
/** SPEC-30 Fase 2 — aparece na resposta quando o pedido trouxe imagem. */
export const MARCA_VIU_IMAGEM = "viu-a-imagem";

export const TEXTO_TRANSCRITO_FALSO = "criar uma fila do rabbit para propostas aprovadas";

/**
 * SPEC-81 — as decisões que a "casa" já tomou.
 *
 * O dublê responde ADR pelo mesmo motivo que responde chat: sem isto **não há
 * como validar a SPEC-81 contra a stack local** — o botão de trazer decisões só
 * aparece com um destino configurado, e configurar um destino real exigiria um
 * gateway de verdade só para dar um clique.
 *
 * As três são propositalmente desiguais: uma completa, uma **sem o porquê** (o
 * caso comum de ADR pobre, que vira lacuna contável em vez de invenção) e uma
 * `substituida` — para a tela ter o que distinguir.
 */
export const ADRS_DO_GATEWAY_FALSO = [
  {
    id: "ADR-014",
    titulo: "Fila entre o checkout e o bureau",
    contexto: "o bureau responde em segundos e o checkout não pode esperar",
    alternativas: [
      { titulo: "Chamada síncrona", consequencia: "o checkout cai junto quando o bureau cai" },
      { titulo: "Fila", consequencia: "resposta assíncrona, e o pedido nasce pendente" },
    ],
    escolhida: "Fila",
    porque: "desacopla o tempo do parceiro do tempo do cliente",
    status: "aceita",
    autor: "arquitetura",
    em: "2026-03-11",
    link: "https://exemplo.invalido/adr/014",
  },
  {
    id: "ADR-021",
    titulo: "Postgres como banco padrão",
    escolhida: "Postgres",
    status: "aceita",
    autor: "arquitetura",
    em: "2026-05-02",
  },
  {
    id: "ADR-007",
    titulo: "Sessão em cookie assinado",
    escolhida: "Cookie assinado",
    porque: "não exige estado no servidor",
    status: "substituida",
    substituidaPor: "ADR-019",
    autor: "seguranca",
    em: "2025-09-30",
  },
];

/**
 * §355 — **o documento da casa, para a jornada do §349 ter o que ler.**
 *
 * Markdown de propósito, e desigual de propósito: tem componentes nomeados, uma
 * ligação entre eles e um número de volume — o suficiente para o desenho que
 * nascer dele não ser vazio, e para a proveniência ter o que citar.
 */
export const DOCUMENTO_DO_GATEWAY_FALSO = {
  titulo: "Aprovação de crédito — desenho de solução",
  conteudo: [
    "# Aprovação de crédito",
    "",
    "O **checkout** envia a proposta para o **serviço de aprovação**, que consulta o",
    "**bureau de crédito** e publica o resultado na fila `propostas-aprovadas`.",
    "",
    "O bureau responde em segundos e não pode segurar o checkout.",
    "",
    "Volume: cerca de 300 propostas por minuto, com pico de 5x no fim do mês.",
  ].join("\n"),
  atualizadoEm: "2026-08-20T10:00:00.000Z",
};

/** As páginas já publicadas, por `demandaId`. Existe para o dublê provar a
 * IDEMPOTÊNCIA que o contrato promete: publicar duas vezes atualiza no lugar e
 * devolve `atualizada: true`, em vez de criar uma segunda página. */
const paginasPublicadas = new Map<string, string>();

/** Zera o estado entre testes — sem isto, a segunda suíte veria a página da
 * primeira e "criada" viraria "atualizada" sem ninguém ter publicado duas vezes. */
export function limparPaginasDoGatewayFalso(): void {
  paginasPublicadas.clear();
}

function lerCorpo(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let bruto = "";
    req.on("data", (p) => (bruto += p));
    req.on("end", () => {
      try {
        resolve(JSON.parse(bruto || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

interface CorpoChat {
  messages?: { role: string; content: string | { type?: string; text?: string }[] }[];
  response_format?: { type?: string; json_schema?: { schema?: unknown } };
}

/**
 * `completarEstruturado` sempre anexa o schema ao prompt ("Responda SOMENTE com
 * um objeto JSON que obedeça exatamente a este schema: {...}"), nos dois
 * dialetos. Ler dali cobre `json_object` (que não manda o schema no corpo) e
 * `json_schema` com o mesmo código.
 */
/**
 * O texto do pedido, com as mensagens concatenadas.
 *
 * ACHADO do próprio teste de imagem: com anexo, `content` deixa de ser string e
 * vira array de parts. Concatenar direto virava "[object Object]", o dublê não
 * achava o schema, caía no ramo de texto livre e devolvia algo que não era JSON
 * — a tela mostrava "Unexpected token 'e'". O prompt mora na part de texto.
 */
function textoDoPedido(corpo: CorpoChat): string {
  return (
    corpo.messages
      ?.map((m) =>
        typeof m.content === "string" ? m.content : (m.content ?? []).map((parte) => parte?.text ?? "").join("\n")
      )
      .join("\n") ?? ""
  );
}

function schemaPedido(corpo: CorpoChat): unknown | null {
  const doCorpo = corpo.response_format?.json_schema?.schema;
  if (doCorpo) return doCorpo;

  const texto = textoDoPedido(corpo);
  const marca = texto.lastIndexOf("obedeça exatamente a este schema:");
  if (marca < 0) return null;
  const inicio = texto.indexOf("{", marca);
  if (inicio < 0) return null;
  try {
    return JSON.parse(texto.slice(inicio));
  } catch {
    return null;
  }
}

/**
 * Preenche um schema com valores válidos. Não é um gerador de JSON Schema
 * completo e não precisa ser — os schemas deste projeto são gerados por nós
 * mesmos e usam um subconjunto pequeno (object/array/string/boolean/enum), o
 * mesmo que `validarContraSchema` do provedor aceita. Se este preenchimento
 * divergir do que aquele validador exige, o provedor faz retry e o teste
 * demora — o que já é um sinal útil por si só.
 */
function preencher(schema: unknown, caminho = "", sufixo = ""): unknown {
  const s = (schema ?? {}) as Record<string, unknown>;
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.type === "array") {
    // `minItems` importa: a fatia C pede DUAS alternativas por decisão, e um
    // dublê que devolve sempre um item faria o produto descartar a proposta
    // inteira — o teste falharia por culpa do dublê, não do código. Cada item
    // recebe índice próprio no caminho para os valores não saírem iguais.
    const minimo = typeof s.minItems === "number" && s.minItems > 0 ? s.minItems : 1;
    return Array.from({ length: minimo }, (_, i) => preencher(s.items, `${caminho}[${i}]`, sufixo));
  }
  if (s.type === "boolean") return true;
  if (s.type === "number" || s.type === "integer") return 1;
  if (s.type === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(props).map(([chave, sub]) => [chave, preencher(sub, caminho ? `${caminho}.${chave}` : chave, sufixo)])
    );
  }
  // String: o valor precisa ser reconhecível na tela E diferente por campo,
  // senão um teste que confere "o campo certo recebeu o texto certo" passaria
  // com tudo trocado.
  return `${MARCA_GATEWAY_FALSO}${sufixo} (${caminho || "resposta"})`;
}

/** Um evento SSE no formato que `provedorOpenAI.ts` sabe ler. */
function evento(conteudo: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: conteudo } }] })}\n\n`;
}

/**
 * SPEC-74 fatia B — o que muda entre "dublê da suíte" e "dublê da stack".
 *
 * As opções ficam aqui e o `process.env` fica no `bin.ts` de propósito: o
 * módulo continua puro (o teste liga a porta 0 e escolhe a chave que quiser), e
 * a leitura de ambiente acontece uma vez só, na borda do processo. Ler `env`
 * aqui dentro faria as constantes exportadas significarem coisas diferentes no
 * processo do teste e no do gateway — que é o tipo de divergência silenciosa
 * que o §263 descreve.
 */
export interface OpcoesGatewayFalso {
  /** Ausente = `CHAVE_GATEWAY_FALSO`. */
  chave?: string;
  /**
   * SPEC-74 fatia C — o que ele escreve nas folhas de texto.
   *
   * `esqueleto` (default) devolve `escrito-pelo-gateway-falso (caminho.do.campo)`
   * em cada string: é o que permite a um teste afirmar que o campo CERTO
   * recebeu o texto certo, e a suíte E2E inteira depende disso.
   *
   * `plausivel` devolve frases com forma e tamanho de verdade — o que permite
   * avaliar TELA (quebra de linha, lista com muitos itens, texto longo). É o
   * modo do serviço do compose.
   *
   * O default é o antigo de propósito: a rede de segurança de todo o resto do
   * repositório é a suíte, e ela não pode depender de uma variável de ambiente
   * estar certa.
   */
  respostas?: "esqueleto" | "plausivel";
  /**
   * §2.4 — atraso antes de começar a responder, em ms.
   *
   * Resposta instantânea esconde os estados de espera, e o produto tem animação
   * de "construindo" que só se avalia com atraso. Zero (o default) mantém a
   * suíte no tempo que ela tem hoje.
   */
  latenciaMs?: number;
}

export function criarGatewayFalso(opcoes: OpcoesGatewayFalso = {}): Server {
  const chaveEsperada = opcoes.chave ?? CHAVE_GATEWAY_FALSO;
  const modo = opcoes.respostas ?? "esqueleto";
  const latenciaMs = opcoes.latenciaMs ?? 0;
  const depoisDaLatencia = (f: () => void) => (latenciaMs > 0 ? setTimeout(f, latenciaMs) : f());

  return createServer((req, res) => {
    // O Playwright espera por isto pra saber que o processo subiu.
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    // SPEC-30 Fase 1a — transcrição. O mesmo dublê serve os dois endpoints
    // porque é o mesmo dialeto e a mesma credencial: quem configurou o gateway
    // pra chat ganhou a transcrição junto, e o teste precisa provar isso.
    if (req.url?.endsWith("/audio/transcriptions") && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${chaveEsperada}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "credencial recusada pelo gateway falso" }));
        return;
      }
      // Drena o multipart sem parsear: o que este teste prova é que o áudio
      // CHEGOU e que o texto volta pro campo certo, não como o boundary é
      // montado (isso é `provedorOpenAI.test.ts`, contra servidor real).
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(TEXTO_TRANSCRITO_FALSO);
      });
      return;
    }

    // SPEC-81 — o destino de ADR. O contrato é o de `criarLeitorDeAdrViaGateway`:
    // POST vazio, `{ adrs: [...] }` de volta. Não pede credencial porque o
    // destino do gateway do time tem cabeçalhos próprios e configuráveis — não a
    // chave do provedor de IA, que é o que `chaveEsperada` guarda.
    if (req.url?.endsWith("/adr") && req.method === "POST") {
      req.resume();
      req.on("end", () => {
        depoisDaLatencia(() => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ adrs: ADRS_DO_GATEWAY_FALSO }));
        });
      });
      return;
    }

    /**
     * §355 — **as quatro operações que faltavam.**
     *
     * O gateway tem cinco (`OPERACOES_DO_GATEWAY`) e este dublê implementava
     * UMA (`/adr`). Medido ao tentar percorrer a jornada inteira contra a stack:
     * configurar o gateway, ler um documento da casa, virar desenho, derivar e
     * subir os itens — **quatro dos cinco passos não tinham para onde apontar.**
     *
     * Nenhuma delas pede credencial, pelo mesmo motivo já escrito em `/adr`: o
     * destino do gateway do TIME tem cabeçalhos próprios e configuráveis, e não
     * a chave do provedor de IA que `chaveEsperada` guarda.
     */

    // SPEC-49 — os itens para o tracker. Devolve um resultado POR ITEM, e o
    // último falha de propósito: falha parcial é o modo de falhar deste
    // contrato, e um dublê que sempre acerta nunca exercita a tela que a mostra.
    if (req.url?.endsWith("/itens") && req.method === "POST") {
      void lerCorpo(req).then((corpo) => {
        const itens = ((corpo as { itens?: { chave?: string }[] }).itens ?? []).filter((i) => i?.chave);
        const resultados = itens.map((item, i) =>
          i === itens.length - 1 && itens.length > 1
            ? { chave: item.chave, erro: "campo obrigatório ausente no tracker (recusa simulada)" }
            : { chave: item.chave, linkExterno: `https://exemplo.invalido/browse/${item.chave}` }
        );
        depoisDaLatencia(() => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ resultados }));
        });
      });
      return;
    }

    // SPEC-81 fatia B — publicar o documento. IDEMPOTENTE por `demandaId`, que é
    // a promessa central do contrato: publicar 2x atualiza no lugar.
    if (req.url?.endsWith("/documento") && req.method !== "GET") {
      void lerCorpo(req).then((corpo) => {
        const { demandaId, espaco } = corpo as { demandaId?: string; espaco?: string };
        const id = demandaId ?? "sem-id";
        const jaExistia = paginasPublicadas.has(id);
        const link = jaExistia
          ? paginasPublicadas.get(id)!
          : `https://exemplo.invalido/wiki/${espaco ? `${espaco}/` : ""}${id}`;
        paginasPublicadas.set(id, link);
        depoisDaLatencia(() => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ linkExterno: link, atualizada: jaExistia }));
        });
      });
      return;
    }

    // §349 — ler um documento da casa pelo LINK. `link` volta como eco: a
    // proveniência do desenho cita de onde veio, e inventar aqui seria mentir
    // sobre a origem.
    if (req.url?.endsWith("/documento-externo") && req.method === "POST") {
      void lerCorpo(req).then((corpo) => {
        const { link } = corpo as { link?: string };
        depoisDaLatencia(() => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ...DOCUMENTO_DO_GATEWAY_FALSO, link: link ?? "" }));
        });
      });
      return;
    }

    if (!req.url?.endsWith("/chat/completions") || req.method !== "POST") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rota inexistente no gateway falso" }));
      return;
    }

    // Credencial errada tem que doer: sem isto, o teste de "Testar conexão"
    // passaria mesmo se o server esquecesse de mandar a chave.
    if (req.headers.authorization !== `Bearer ${chaveEsperada}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "credencial recusada pelo gateway falso" }));
      return;
    }

    let bruto = "";
    req.on("data", (pedaco) => (bruto += pedaco));
    req.on("end", () => {
      let corpo: CorpoChat = {};
      try {
        corpo = JSON.parse(bruto) as CorpoChat;
      } catch {
        // Corpo ilegível vira resposta vazia — o provedor trata como erro.
      }

      // SPEC-30 Fase 2: se o pedido trouxe imagem, o dublê diz isso na
      // resposta — é assim que o teste de navegador prova que o print
      // atravessou tela -> servidor -> gateway, e não só que o botão existe.
      const temImagem = (corpo.messages ?? []).some(
        (m) => Array.isArray(m.content) && m.content.some((p: { type?: string }) => p?.type === "image_url")
      );

      // §265 — a falha pedida. 500 e não 401: o que se quer provar é o caminho
      // de "o modelo quebrou", não o de credencial recusada (que já tem dono).
      if (bruto.includes(PEDIR_FALHA_AO_GATEWAY)) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "o gateway falso falhou porque pediram" }));
        return;
      }

      const schema = schemaPedido(corpo);
      const texto =
        modo === "plausivel"
          ? respostaPlausivel(textoDoPedido(corpo), schema)
          : schema
            // A marca de imagem entra TAMBÉM no caminho estruturado:
            // `/ia/diagrama` responde JSON, e marcar só o texto livre deixaria o
            // teste de imagem sem como afirmar nada (foi o que aconteceu).
            ? JSON.stringify(preencher(schema, "", temImagem ? ` ${MARCA_VIU_IMAGEM}` : ""))
            : `${MARCA_GATEWAY_FALSO}: ok${temImagem ? ` ${MARCA_VIU_IMAGEM}` : ""}`;

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      // A latência é ANTES do primeiro evento, não entre eles: o que o produto
      // mostra enquanto espera é o estado "construindo", e ele termina no
      // primeiro pedaço que chega. Espalhar o atraso entre os eventos atrasaria
      // o fim da resposta sem exercitar a espera que existe na tela.
      depoisDaLatencia(() => {
        // Em pedaços de verdade, não de uma vez: o caminho de streaming é
        // justamente o que quebrou no navegador, e mandar o corpo inteiro num
        // evento só deixaria de exercitar o buffer entre leituras.
        for (let i = 0; i < texto.length; i += 64) res.write(evento(texto.slice(i, i + 64)));
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
  });
}
