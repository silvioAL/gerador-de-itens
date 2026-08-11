import type { ChaveConfig } from "../portas/repositorioDeConfig.js";

/**
 * SPEC-31 Fase 3 — a coerção de entrada de cada documento de config.
 *
 * Isto morava só no `openApiLocal.ts`. O modo hospedado não tinha rota nenhuma
 * de config, então quando ganhou uma (esta fase) herdaria zero validação: um
 * `PUT` torto poderia deixar a esteira sem papel nenhum e ninguém saberia
 * até a próxima quebra sair vazia.
 *
 * A régua é a mesma de sempre no projeto: entrada inválida **degrada campo a
 * campo**, nunca derruba a config inteira. Só o que impediria a config de
 * existir vira erro.
 */
export class ConfigInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ConfigInvalida";
  }
}

export const GRUPOS_FICHA = ["po", "arquiteto", "especialista", "qa"] as const;
export type GrupoFicha = (typeof GRUPOS_FICHA)[number];

export interface PapelConfigurado {
  id: string;
  nome: string;
  descricao?: string;
  grupo: GrupoFicha;
  preambulo?: string;
  ativo: boolean;
  contextos: string[];
}

export interface ConfigPipelineAgentes {
  confirmacaoObrigatoria: boolean;
  papeis: PapelConfigurado[];
}

/** A esteira de fábrica (SPEC-24 Fase F). */
export const PAPEIS_PADRAO: PapelConfigurado[] = [
  { id: "po", nome: "PO", descricao: "Escreve a história e os critérios de aceite", grupo: "po", ativo: true, contextos: [] },
  { id: "arquiteto", nome: "Arquiteto", descricao: "Amarra o item ao nó e escreve o contrato", grupo: "arquiteto", ativo: true, contextos: [] },
  { id: "especialista", nome: "Especialista técnico", descricao: "Aplica a tabela de regras do contexto", grupo: "especialista", ativo: true, contextos: [] },
  { id: "qa", nome: "QA", descricao: "Deriva as regras de teste e escreve os cenários", grupo: "qa", ativo: true, contextos: [] },
];

/**
 * Coage a lista de papéis para um shape sempre válido: id vazio descarta o
 * papel, grupo desconhecido cai em "especialista", nome vazio cai no id,
 * id repetido fica com a primeira ocorrência.
 */
export function sanearPapeis(entrada: unknown): PapelConfigurado[] | undefined {
  if (!Array.isArray(entrada)) return undefined;

  const papeis: PapelConfigurado[] = [];
  for (const bruto of entrada as Partial<PapelConfigurado>[]) {
    const id = typeof bruto?.id === "string" ? bruto.id.trim() : "";
    if (!id || papeis.some((p) => p.id === id)) continue;

    const grupo = GRUPOS_FICHA.includes(bruto.grupo as GrupoFicha) ? (bruto.grupo as GrupoFicha) : "especialista";
    papeis.push({
      id,
      nome: typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim() : id,
      ...(typeof bruto.descricao === "string" && bruto.descricao.trim() ? { descricao: bruto.descricao.trim() } : {}),
      grupo,
      ...(typeof bruto.preambulo === "string" && bruto.preambulo.trim() ? { preambulo: bruto.preambulo.trim() } : {}),
      ativo: bruto.ativo !== false,
      contextos: Array.isArray(bruto.contextos)
        ? bruto.contextos.filter((c): c is string => typeof c === "string" && c.trim() !== "")
        : [],
    });
  }
  return papeis.length > 0 ? papeis : undefined;
}

export function normalizarPipelineAgentes(documento: unknown): ConfigPipelineAgentes {
  const bruto = (documento ?? {}) as Partial<ConfigPipelineAgentes>;
  return {
    confirmacaoObrigatoria: bruto.confirmacaoObrigatoria !== false,
    // Config antiga (só o toggle, pré-Fase F) ou papéis todos inválidos:
    // esteira de fábrica — nunca uma esteira vazia por acidente.
    papeis: sanearPapeis(bruto.papeis) ?? PAPEIS_PADRAO,
  };
}

function normalizarRegras(documento: unknown): unknown {
  const bruto = documento as { porTech?: unknown } | null;
  // `porTech` é o que faz a tabela de regras ser uma tabela de regras. Sem
  // ela, gravar apagaria a config de refinamento inteira em silêncio.
  if (!bruto || typeof bruto.porTech !== "object" || bruto.porTech === null || Array.isArray(bruto.porTech)) {
    throw new ConfigInvalida("corpo precisa ter `porTech` (objeto tech → regras)");
  }
  return bruto;
}

/** Aplica a coerção da chave. O que não tem regra própria passa como veio. */
export function normalizarDocumentoConfig(chave: ChaveConfig, documento: unknown): unknown {
  switch (chave) {
    case "regras":
      return normalizarRegras(documento);
    case "pipeline-agentes":
      return normalizarPipelineAgentes(documento);
  }
}
