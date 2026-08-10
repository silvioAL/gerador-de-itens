/**
 * SPEC-31 Fase 2 — a porta de Campos por tipo de nó.
 *
 * O conceito é "que campos um nó de tipo X tem", configurável globalmente e
 * sobrescrevível por time. A regra de sobrescrita (`camposEfetivos`) estava
 * escrita duas vezes, palavra por palavra, em `routes/camposNo.ts` e em
 * `openApiLocal.ts`. Ela é regra, não persistência: mora aqui, e os dois
 * adaptadores só sabem ler e gravar linhas.
 */

/** O escopo "de todo mundo" — campo que vale enquanto um time não sobrescrever. */
export const CAMPO_GLOBAL = "__global__";

export type TipoCampoNo = "text" | "textarea" | "number" | "boolean" | "select" | "lista";

/** Sub-campo dentro de um `type: "lista"` — sem "lista" aninhada. */
export interface ItemSpecCampo {
  key: string;
  label: string;
  type: Exclude<TipoCampoNo, "lista">;
  options?: string[];
}

export interface CampoNo {
  id: string;
  timeId: string;
  tipoNo: string;
  key: string;
  label: string;
  type: TipoCampoNo;
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  permiteNA: boolean;
  ordem: number;
  /** Só quando `type === "lista"` — a forma de cada item. */
  itemSpec: ItemSpecCampo[] | null;
}

export type DadosCampoNo = Omit<CampoNo, "id">;

export interface RepositorioDeCamposNo {
  /**
   * As linhas cruas que interessam ao escopo: as globais mais as do `timeId`
   * pedido. Sem merge — quem resolve a sobreposição é o caso de uso, para que
   * os dois adaptadores não possam divergir na regra.
   */
  listar(timeId?: string): Promise<CampoNo[]>;
  obter(id: string): Promise<CampoNo | null>;
  /**
   * Cria ou substitui pela chave natural (`timeId`, `tipoNo`, `key`). É upsert
   * de propósito: salvar duas vezes o mesmo campo é correção, não duplicata —
   * e um `campos_no` com duas linhas para a mesma chave torna `listar`
   * ambíguo.
   */
  salvar(dados: DadosCampoNo): Promise<CampoNo>;
  atualizar(id: string, parcial: Partial<DadosCampoNo>): Promise<CampoNo | null>;
  /** `true` se havia o que excluir — quem traduz isso em 204 ou 404 é a borda. */
  excluir(id: string): Promise<boolean>;
}

/**
 * O campo do time vence o global de mesma (`tipoNo`, `key`); o resultado sai
 * ordenado por `ordem`. É esta função que os dois modos passam a compartilhar.
 */
export function camposEfetivos(campos: CampoNo[], timeId?: string): CampoNo[] {
  const relevantes = campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
  const porChave = new Map<string, CampoNo>();
  // Global primeiro: quem chega depois (o do time) sobrescreve a entrada.
  for (const campo of [...relevantes].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
    porChave.set(`${campo.tipoNo}::${campo.key}`, campo);
  }
  return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
}

/** Preenche os opcionais com o default do contrato — o que os dois adaptadores
 * precisam receber já resolvido para gravarem a mesma coisa. */
export function normalizarDadosCampoNo(bruto: Partial<DadosCampoNo>): DadosCampoNo {
  return {
    timeId: bruto.timeId || CAMPO_GLOBAL,
    tipoNo: bruto.tipoNo ?? "",
    key: bruto.key ?? "",
    label: bruto.label ?? "",
    type: bruto.type ?? "text",
    required: bruto.required ?? false,
    valorPadrao: bruto.valorPadrao ?? null,
    opcoes: bruto.opcoes ?? null,
    ajuda: bruto.ajuda ?? null,
    permiteNA: bruto.permiteNA ?? false,
    ordem: bruto.ordem ?? 0,
    itemSpec: bruto.itemSpec ?? null,
  };
}
