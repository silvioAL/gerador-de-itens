import type { ExportadorDeItens, ItemExportado, ItemGeradoSalvo } from "@gerador/aplicacao";
import type { ConfigExportador } from "@gerador/aplicacao";

/**
 * SPEC-49 — o adaptador de exportação: um POST para o AGENTE que fala com o
 * tracker.
 *
 * O gerador não implementa Jira. Implementar um tracker específico seria
 * escolher o tracker de todo mundo — e a empresa que usa outro ficaria de
 * fora. A mesma disciplina do gateway de IA: o produto chama um endereço
 * configurável (bridge de MCP, n8n, função interna) e quem sabe criar issue
 * é quem está do outro lado.
 *
 * Contrato do agente:
 *   POST {endpoint}  { itens: [{ chave, titulo, tipo, tamanho, dependencias, corpoMarkdown }] }
 *   → 200 { resultados: [{ chave, linkExterno } | { chave, erro }] }
 *
 * Falha é POR ITEM: um issue que não sobe não pode derrubar os outros que
 * subiram (e o rastro do que subiu é o que evita duplicar na segunda vez).
 */
export function criarExportadorViaAgente(
  config: ConfigExportador,
  fetchImpl: typeof fetch = fetch
): ExportadorDeItens {
  return {
    async exportar(itens: ItemGeradoSalvo[]) {
      if (itens.length === 0) return [];

      let resposta: Response;
      try {
        resposta = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...config.cabecalhos },
          body: JSON.stringify({
            itens: itens.map((i) => ({
              chave: i.chave,
              titulo: i.titulo,
              tipo: i.tipo,
              tamanho: i.tamanho,
              dependencias: i.dependencias,
              corpoMarkdown: i.corpoMarkdown,
            })),
          }),
        });
      } catch (erro) {
        // Rede fora: o motivo vale pra TODOS, mas continua item a item — a
        // tela mostra por card, e o formato da resposta não muda com a causa.
        const motivo = erro instanceof Error ? erro.message : String(erro);
        return itens.map((i) => ({ chave: i.chave, erro: `não consegui falar com o agente: ${motivo}` }));
      }

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => "");
        const motivo = `o agente respondeu HTTP ${resposta.status}${corpo ? ` — ${corpo.slice(0, 200)}` : ""}`;
        return itens.map((i) => ({ chave: i.chave, erro: motivo }));
      }

      const corpo = (await resposta.json().catch(() => ({}))) as {
        resultados?: Array<{ chave?: string; linkExterno?: string; erro?: string }>;
      };
      const porChave = new Map((corpo.resultados ?? []).map((r) => [r.chave, r]));

      // Item que o agente ignorou não vira sucesso silencioso: ausência é
      // erro explícito, com a frase que diz o que aconteceu.
      return itens.map((item): ItemExportado | { chave: string; erro: string } => {
        const resultado = porChave.get(item.chave);
        if (!resultado) return { chave: item.chave, erro: "o agente não respondeu sobre este item" };
        if (resultado.erro) return { chave: item.chave, erro: resultado.erro };
        if (!resultado.linkExterno) return { chave: item.chave, erro: "o agente respondeu sem o link do issue" };
        return { chave: item.chave, linkExterno: resultado.linkExterno };
      });
    },
  };
}
