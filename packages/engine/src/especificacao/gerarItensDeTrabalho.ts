import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { MARCADOR_ESPECIFICAR, MARCA_SUGERIDO } from "../refinamento/gerarRefinamento.js";
import { renderizarItemEspecificacao } from "./gerarEspecificacaoEntrega.js";

/**
 * SPEC-41 Parte B — um item de trabalho materializável (o que vira card na
 * tela de itens e, na Fase 2, um issue no tracker via MCP). O corpo é a MESMA
 * seção que `gerarEspecificacaoEntrega` põe no documento — nunca uma segunda
 * renderização; as contagens dizem a prontidão sem o leitor varrer o texto.
 */
export interface ItemDeTrabalho {
  /** `Atividade.chave` — estável entre regenerações (mesma quebra ⇒ mesma chave). */
  chave: string;
  titulo: string;
  tipo: Atividade["tipo"];
  tamanho: Atividade["tamanho"];
  /** Dependências legíveis ("enabler → outra-chave"), na ordem da atividade. */
  dependencias: string[];
  corpoMarkdown: string;
  /** Quantos campos ainda pedem `✍️ especificar` no corpo — 0 = pronto. */
  pendencias: number;
  /** Quantas respostas entraram como sugestão da esteira, aguardando confirmação. */
  sugestoes: number;
}

function contar(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1;
}

/**
 * Fatia a quebra derivada em itens de trabalho — mesma entrada de
 * `gerarEspecificacaoEntrega` (atividades derivadas + respostas), mesma
 * numeração e mesmo corpo por item. Gerar de novo com o mesmo material
 * produz o mesmo conjunto (determinístico): "regenerar" é substituir.
 */
export function gerarItensDeTrabalho(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: { regras?: RegrasConfig; respostasItens?: Record<string, Record<string, ValorSpec>> } = {}
): ItemDeTrabalho[] {
  return atividades.map((a, i) => {
    const corpoMarkdown = renderizarItemEspecificacao(
      i + 1,
      a,
      diagrama,
      config,
      opcoes.regras,
      opcoes.respostasItens?.[a.chave]
    );
    return {
      chave: a.chave,
      titulo: `${a.rotulo} — ${a.descricao}`,
      tipo: a.tipo,
      tamanho: a.tamanho,
      dependencias: a.dependencias.map((d) => (d.alvoChave ? `${d.type} → ${d.alvoChave}` : d.type)),
      corpoMarkdown,
      pendencias: contar(corpoMarkdown, MARCADOR_ESPECIFICAR),
      sugestoes: contar(corpoMarkdown, MARCA_SUGERIDO),
    };
  });
}
