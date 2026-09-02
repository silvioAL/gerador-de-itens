import type {
  AdrExterno,
  ArquiteturaDeNegocioExterna,
  DestinoResolvido,
  DocumentoParaPublicar,
  DocumentoPublicado,
  LeitorDeAdr,
  LeitorDeArquiteturaDeNegocio,
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
 * SPEC-81 fatia F — a arquitetura de negócio da casa.
 *
 * Contrato do gateway:
 *   POST {endpoint}  {}
 *   → 200 { objetivo?, quemUsa?, regrasDeNegocio?, sistemas?, restricoes?,
 *           glossario?: [{ termo, definicao }] }
 *
 * **`undefined` em vez de objeto vazio** quando não há o que trazer: quem chama
 * distingue "o gateway respondeu e não tem nada" de "não consegui perguntar", e
 * a tela diz coisas diferentes nos dois casos.
 *
 * Degrada como o leitor de ADR, e pelo mesmo motivo: ninguém pode ficar
 * impedido de descrever o produto à mão porque um sistema de terceiro caiu.
 */
export function criarLeitorDeArquiteturaViaGateway(
  destino: DestinoResolvido,
  fetchImpl: typeof fetch = fetch
): LeitorDeArquiteturaDeNegocio {
  return {
    async ler(): Promise<ArquiteturaDeNegocioExterna | undefined> {
      let resposta: Response;
      try {
        resposta = await postar(destino, {}, fetchImpl);
      } catch {
        return undefined;
      }
      if (!resposta.ok) return undefined;

      const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
      const lida: ArquiteturaDeNegocioExterna = {
        objetivo: texto(corpo.objetivo),
        quemUsa: texto(corpo.quemUsa),
        regrasDeNegocio: texto(corpo.regrasDeNegocio),
        sistemas: texto(corpo.sistemas),
        restricoes: texto(corpo.restricoes),
        glossario: glossarioDe(corpo.glossario),
      };

      // Resposta 200 sem nada aproveitável é o mesmo que não ter respondido, do
      // ponto de vista de quem chama — e devolver `{}` faria a tela abrir uma
      // proposta vazia, que é pior que dizer "não achei nada".
      const temAlgo = Object.values(lida).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
      return temAlgo ? lida : undefined;
    },
  };
}

function glossarioDe(v: unknown): { termo: string; definicao: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lidos = v
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({ termo: texto(t.termo) ?? "", definicao: texto(t.definicao) ?? "" }))
    // Termo sem definição não é termo de glossário: é uma palavra solta, e o
    // glossário existe justamente para dizer o que a palavra significa aqui.
    .filter((t) => t.termo && t.definicao);
  return lidos.length > 0 ? lidos : undefined;
}
