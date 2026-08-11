import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";

/**
 * #303 (revisão da SPEC-31, §149) — a porta de Campos por tipo de conexão.
 *
 * É a irmã gêmea de `repositorioDeCamposNo`, que ficou de fora da SPEC-31
 * porque a tabela da §5 nunca a listou. Com o modo local removido (SPEC-33), o
 * item deixou de ser sobre unificar dois adaptadores e passou a ser sobre
 * tirar SQL de dentro de `routes/camposAresta.ts` — e matar a cópia da regra
 * de sobreposição que vivia inline no GET da rota.
 *
 * Sem `itemSpec` e sem `permiteNA`: `CampoAresta` não aceita campo do tipo
 * "lista" nem marca N/A — a diferença é do domínio, não do adaptador.
 */
export type TipoCampoAresta = "text" | "textarea" | "number" | "boolean" | "select";

export interface CampoAresta {
  id: string;
  timeId: string;
  tipoAresta: string;
  key: string;
  label: string;
  type: TipoCampoAresta;
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  ordem: number;
}

export type DadosCampoAresta = Omit<CampoAresta, "id">;

export interface RepositorioDeCamposAresta {
  /** As linhas cruas do escopo (globais + as do `timeId`). Sem merge — a
   * sobreposição é regra e mora no caso de uso, não no adaptador. */
  listar(timeId?: string): Promise<CampoAresta[]>;
  obter(id: string): Promise<CampoAresta | null>;
  /** Upsert pela chave natural (`timeId`, `tipoAresta`, `key`) — regravar o
   * mesmo campo é correção, não violação de restrição única. */
  salvar(dados: DadosCampoAresta): Promise<CampoAresta>;
  atualizar(id: string, parcial: Partial<DadosCampoAresta>): Promise<CampoAresta | null>;
  /** `true` se havia o que excluir — quem traduz em 204/404 é a borda. */
  excluir(id: string): Promise<boolean>;
}

/** O campo do time vence o global de mesma (`tipoAresta`, `key`); sai ordenado
 * por `ordem`. A mesma regra de `camposEfetivos`, na chave desta tabela —
 * antes uma cópia inline no GET da rota. */
export function camposArestaEfetivos(campos: CampoAresta[], timeId?: string): CampoAresta[] {
  const relevantes = campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
  const porChave = new Map<string, CampoAresta>();
  for (const campo of [...relevantes].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
    porChave.set(`${campo.tipoAresta}::${campo.key}`, campo);
  }
  return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
}

/** Opcionais resolvidos para o default do contrato — o adaptador grava sempre
 * a mesma coisa. */
export function normalizarDadosCampoAresta(bruto: Partial<DadosCampoAresta>): DadosCampoAresta {
  return {
    timeId: bruto.timeId || CAMPO_GLOBAL,
    tipoAresta: bruto.tipoAresta ?? "",
    key: bruto.key ?? "",
    label: bruto.label ?? "",
    type: bruto.type ?? "text",
    required: bruto.required ?? false,
    valorPadrao: bruto.valorPadrao ?? null,
    opcoes: bruto.opcoes ?? null,
    ajuda: bruto.ajuda ?? null,
    ordem: bruto.ordem ?? 0,
  };
}
