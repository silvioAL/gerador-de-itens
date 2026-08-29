import type {
  AdrExterno,
  DestinoResolvido,
  DocumentoParaPublicar,
  DocumentoPublicado,
  LeitorDeAdr,
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

async function postar(destino: DestinoResolvido, corpo: unknown, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(destino.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...destino.cabecalhos },
    body: JSON.stringify(corpo),
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
