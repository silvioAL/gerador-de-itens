import type {
  AdrExterno,
  DestinoResolvido,
  DocumentoParaPublicar,
  DocumentoPublicado,
  LeitorDeAdr,
  LeitorDeDocumento,
  DocumentoExterno,
  PublicadorDeDocumento,
} from "@gerador/aplicacao";

/**
 * SPEC-81 — os adaptadores das operações novas do gateway do time.
 *
 * ## O que eles são
 *
 * POST para um endereço configurável, com cabeçalhos configuráveis. Igual ao
 * `exportadorViaAgente`, que a SPEC-49 escreveu — e o comentário de lá já dizia
 * o que a correção da SPEC-81 confirmou:
 *
 * > *"o produto chama um endereço configurável (bridge de MCP, n8n, função
 * > interna) e quem sabe criar issue é quem está do outro lado."*
 *
 * O produto não implementa MCP. Quem fala MCP é o gateway, e podem ser vários:
 * um na frente do Jira, outro do Confluence, outro dos agentes da casa.
 *
 * ## Por que os dois têm modos de falhar diferentes
 *
 * A leitura de ADR **degrada para lista vazia**: um repositório de decisões fora
 * do ar não pode impedir alguém de desenhar. A publicação de documento
 * **estoura**: "publicou pela metade" não existe, e engolir a falha faria a
 * pessoa achar que a página está lá.
 */

/**
 * §348 — a chamada honra o **método**, o **envelope** e o **espaço** do destino.
 *
 * ## O que estava pela metade
 *
 * O §346 criou `metodo` e `envelope` na configuração e parou ali: `postar`
 * continuava com `POST` fixo e o corpo cru. **A tela oferecia escolher `PUT` e o
 * produto mandava `POST` de qualquer jeito** — meia integração é pior que
 * nenhuma, porque promete o que não faz.
 *
 * ## O `espaco`, e por que ele é opaco de propósito
 *
 * Pedido do usuário: *"seria importante também ser possível configurar o link de
 * um espaço do time no confluence e ele postar o design doc lá"*.
 *
 * O produto **não sabe o que é um espaço**. Para ele é uma etiqueta que o gateway
 * entende — *space* no Confluence, *workspace* no Notion, *site* no SharePoint.
 * Saber seria implementar o Confluence de todo mundo, que é exatamente o que a
 * SPEC-49 recusou para o Jira: *"implementar um tracker específico seria escolher
 * o tracker de todo mundo"*.
 *
 * Ele viaja **dentro do payload**, junto do documento, e não como cabeçalho ou
 * query: é dado do pedido — *publique isto ali* —, não metadado de transporte.
 */
async function postar(destino: DestinoResolvido, corpo: unknown, fetchImpl: typeof fetch): Promise<Response> {
  const comEspaco =
    destino.espaco && corpo && typeof corpo === "object" ? { ...(corpo as object), espaco: destino.espaco } : corpo;
  // `envelope: ""` é escolha declarada — payload na raiz. Por isso o teste é de
  // string vazia, e não de valor falso: `!destino.envelope` trataria a ausência
  // e a escolha como a mesma coisa.
  const payload = destino.envelope === "" ? comEspaco : { [destino.envelope]: comEspaco };

  return fetchImpl(destino.endpoint, {
    method: destino.metodo,
    headers: { "Content-Type": "application/json", ...destino.cabecalhos },
    body: JSON.stringify(payload),
  });
}

/**
 * Contrato do gateway:
 *   POST {endpoint}  {}
 *   → 200 { adrs: [{ id, titulo, contexto?, alternativas?, escolhida?, porque?,
 *                    status?, substituidaPor?, autor?, em?, link? }] }
 *
 * Tolerante na entrada de propósito: ADR de verdade vem em formatos diferentes,
 * e um contrato rígido faria o produto recusar exatamente os repositórios que
 * ele existe para ler. O que não vier vira lacuna contável, nunca invenção.
 */
export function criarLeitorDeAdrViaGateway(destino: DestinoResolvido, fetchImpl: typeof fetch = fetch): LeitorDeAdr {
  return {
    async listar(): Promise<AdrExterno[]> {
      let resposta: Response;
      try {
        resposta = await postar(destino, {}, fetchImpl);
      } catch {
        // Repositório de decisões fora do ar não pode impedir alguém de
        // desenhar. Lista vazia é "não sei", e a tela já sabe dizer isso.
        return [];
      }
      if (!resposta.ok) return [];

      const corpo = (await resposta.json().catch(() => ({}))) as { adrs?: unknown };
      if (!Array.isArray(corpo.adrs)) return [];

      return corpo.adrs
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        // `id` e `titulo` são o mínimo sem o qual não dá para fazer nada: um ADR
        // sem identificador não sobrevive à reimportação, e um sem título não
        // aparece em lugar nenhum.
        .filter((a) => typeof a.id === "string" && a.id.trim() && typeof a.titulo === "string" && a.titulo.trim())
        .map((a) => ({
          id: (a.id as string).trim(),
          titulo: (a.titulo as string).trim(),
          contexto: texto(a.contexto),
          alternativas: alternativasDe(a.alternativas),
          escolhida: texto(a.escolhida),
          porque: texto(a.porque),
          status: texto(a.status),
          substituidaPor: texto(a.substituidaPor),
          autor: texto(a.autor),
          em: texto(a.em),
          link: texto(a.link),
        }));
    },
  };
}

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function alternativasDe(v: unknown): { titulo: string; consequencia?: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lidas = v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({ titulo: texto(a.titulo) ?? "", consequencia: texto(a.consequencia) }))
    .filter((a) => a.titulo);
  return lidas.length > 0 ? lidas : undefined;
}

/**
 * Contrato do gateway:
 *   POST {endpoint}  { demandaId, demandaTitulo, markdown, geradoEm,
 *                      demandaAtualizadaEm, desatualizado }
 *   → 200 { linkExterno, atualizada? }
 *
 * **`demandaId` é a identidade da página.** É com ele que o gateway decide
 * atualizar em vez de criar — e é por isso que ele vai no payload em vez de a
 * URL ser montada aqui: quem sabe onde a página mora é quem a criou.
 */
export function criarPublicadorDeDocumentoViaGateway(
  destino: DestinoResolvido,
  fetchImpl: typeof fetch = fetch
): PublicadorDeDocumento {
  return {
    async publicar(documento: DocumentoParaPublicar): Promise<DocumentoPublicado> {
      let resposta: Response;
      try {
        resposta = await postar(destino, documento, fetchImpl);
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        throw new Error(`não consegui falar com ${destino.rotulo || destino.endpoint}: ${motivo}`);
      }

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => "");
        throw new Error(
          `${destino.rotulo || destino.endpoint} respondeu HTTP ${resposta.status}${corpo ? ` — ${corpo.slice(0, 200)}` : ""}`
        );
      }

      const corpo = (await resposta.json().catch(() => ({}))) as { linkExterno?: unknown; atualizada?: unknown };
      const link = texto(corpo.linkExterno);
      if (!link) {
        // Sem link, a publicação é indistinguível de não ter acontecido: a
        // pessoa não tem como conferir, e o produto não tem o que mostrar.
        throw new Error(`${destino.rotulo || destino.endpoint} respondeu sem "linkExterno" — não sei onde a página foi parar`);
      }

      return { linkExterno: link, atualizada: corpo.atualizada === true };
    },
  };
}

/**
 * SPEC-100 fatia C (§349) — **buscar um documento da casa pelo link.**
 *
 * O contrato é o mais simples dos leitores, e de propósito: manda `{ link }`,
 * recebe `{ conteudo, titulo?, atualizadoEm? }`. O que o gateway faz para
 * chegar lá — API do Confluence, scraping autenticado, cache — não é problema
 * do produto, e é a mesma fronteira do §348.
 *
 * ## Sem conteúdo é o mesmo que não ter achado
 *
 * Um 200 com `conteudo` vazio faria a tela abrir uma proposta a partir de nada,
 * e o modelo inventaria o desenho inteiro para não devolver vazio. Mesma régua
 * do leitor de arquitetura: **melhor dizer "não achei" do que entregar um
 * começo falso.**
 *
 * ## O link que volta é o que foi pedido
 *
 * O gateway pode devolver o seu próprio (canônico, com id resolvido). Ele
 * ganha, porque é o que aponta para o lugar de verdade; mas na ausência fica o
 * pedido, para a proveniência nunca ficar vazia — um desenho importado sem
 * origem é pior que um desenho digitado.
 */
export function criarLeitorDeDocumentoViaGateway(
  destino: DestinoResolvido,
  fetchImpl: typeof fetch = fetch
): LeitorDeDocumento {
  return {
    async ler(link: string): Promise<DocumentoExterno | undefined> {
      const pedido = link.trim();
      if (!pedido) return undefined;

      let resposta: Response;
      try {
        resposta = await postar(destino, { link: pedido }, fetchImpl);
      } catch {
        return undefined;
      }
      if (!resposta.ok) return undefined;

      const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
      const conteudo = texto(corpo.conteudo);
      if (!conteudo) return undefined;

      return {
        conteudo,
        link: texto(corpo.link) || pedido,
        ...(texto(corpo.titulo) ? { titulo: texto(corpo.titulo) } : {}),
        ...(texto(corpo.atualizadoEm) ? { atualizadoEm: texto(corpo.atualizadoEm) } : {}),
      };
    },
  };
}
