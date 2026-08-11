import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";

/**
 * #303 — a porta que a SPEC-31 §5 esqueceu.
 *
 * A tabela de portas da §5 lista `RepositorioDeCamposNo` e nunca listou o irmão
 * gêmeo dele. Consequência, medida na revisão do #295: `campos-aresta` ficou
 * com 4 rotas de SQL direto no Fastify, 4 de arquivo no roteador local, e a
 * regra de sobreposição escrita TRÊS vezes — `camposEfetivos` (aqui, para nós),
 * o `porChave` inline de `routes/camposAresta.ts`, e `camposArestaEfetivos` de
 * `openApiLocal.ts`.
 *
 * É exatamente a duplicação que a SPEC existia para matar, sobrevivendo por
 * omissão de uma linha numa tabela.
 *
 * Sem `type: "lista"` de propósito: campo repetível numa conexão é caso
 * hipotético que ninguém pediu, e um tipo a mais na porta é um caminho a mais
 * que os dois adaptadores podem divergir.
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
  /** As linhas cruas do escopo — globais mais as do `timeId`. Sem merge: quem
   * resolve a sobreposição é o caso de uso, pelo mesmo motivo de `campos-no`. */
  listar(timeId?: string): Promise<CampoAresta[]>;
  obter(id: string): Promise<CampoAresta | null>;
  /** Upsert pela chave natural (`timeId`, `tipoAresta`, `key`) — regravar um
   * campo é correção, não duplicata. */
  salvar(dados: DadosCampoAresta): Promise<CampoAresta>;
  atualizar(id: string, parcial: Partial<DadosCampoAresta>): Promise<CampoAresta | null>;
  /** `true` se havia o que excluir; quem traduz em 204 ou 404 é a borda. */
  excluir(id: string): Promise<boolean>;
}

/**
 * O campo do time vence o global de mesma (`tipoAresta`, `key`); sai ordenado
 * por `ordem`. Gêmea de `camposEfetivos` e mantida separada de propósito: a
 * chave natural é outra, e generalizar as duas numa função com a chave como
 * parâmetro trocaria duplicação por indireção sem fechar nada.
 */
export function camposArestaEfetivos(campos: CampoAresta[], timeId?: string): CampoAresta[] {
  const relevantes = campos.filter((c) => c.timeId === CAMPO_GLOBAL || c.timeId === timeId);
  const porChave = new Map<string, CampoAresta>();
  // Global primeiro: quem chega depois (o do time) sobrescreve a entrada.
  for (const campo of [...relevantes].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
    porChave.set(`${campo.tipoAresta}::${campo.key}`, campo);
  }
  return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
}

/** Preenche os opcionais com o default do contrato, para os dois adaptadores
 * gravarem a mesma coisa a partir do mesmo corpo HTTP. */
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
