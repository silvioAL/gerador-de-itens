import type { DiagramaConfig, FieldSpec } from "@gerador/engine";

/**
 * SPEC-107 fatia A — **UM montador de vocabulário, para as duas pontas.**
 *
 * A mescla dos campos customizados (`campos_no`/`campos_aresta`) por cima do
 * `spec` estático vivia só no `loadConfig.ts` do web — e o servidor não
 * montava `DiagramaConfig` nenhum, porque a derivação só rodava no navegador.
 * Com a função `derivacao` executando no servidor, a mescla em dois lugares
 * divergiria na primeira mudança (§263) — e a prova da fatia ("derivar pelo
 * botão ≡ derivar pela função, byte a byte") depende de o vocabulário ser
 * montado pela MESMA função. Web e servidor chamam esta.
 */

/** A forma efetiva de um campo customizado, como as rotas `/campos-no` e
 * `/campos-aresta` devolvem — estrutural, para as duas pontas usarem a sua. */
export interface CampoCustomizado {
  key: string;
  label: string;
  type: FieldSpec["type"];
  required?: boolean;
  valorPadrao?: FieldSpec["default"] | null;
  opcoes?: string[] | null;
  ajuda?: string | null;
  permiteNA?: boolean;
  itemSpec?: FieldSpec["itemSpec"] | null;
}

export function comoFieldSpec(campo: CampoCustomizado): FieldSpec {
  return {
    key: campo.key,
    label: campo.label,
    type: campo.type,
    required: campo.required || undefined,
    default: campo.valorPadrao ?? undefined,
    options: campo.opcoes ?? undefined,
    ajuda: campo.ajuda ?? undefined,
    permiteNA: campo.permiteNA || undefined,
    itemSpec: campo.itemSpec ?? undefined,
  };
}

/**
 * Campos globais + do time se sobrepõem ao `spec` estático por `key` — a
 * mesma regra de override de perfis de time (SPEC-08 §3). Tipo de nó
 * desconhecido (campo órfão de um tipo removido) é ignorado, não quebra.
 */
export function mesclarCamposDeNo(
  diagramaConfig: DiagramaConfig,
  campos: (CampoCustomizado & { tipoNo: string })[]
): DiagramaConfig {
  const nodeTypes = { ...diagramaConfig.nodeTypes };
  for (const campo of campos) {
    const cfg = nodeTypes[campo.tipoNo];
    if (!cfg) continue;
    const fieldSpec = comoFieldSpec(campo);
    const idx = cfg.spec.findIndex((f) => f.key === campo.key);
    const spec = idx >= 0 ? cfg.spec.map((f, i) => (i === idx ? fieldSpec : f)) : [...cfg.spec, fieldSpec];
    nodeTypes[campo.tipoNo] = { ...cfg, spec };
  }
  return { ...diagramaConfig, nodeTypes };
}

/** A mesma regra de override, para `edgeTypes` (SPEC-21). O `permiteNA` e o
 * `itemSpec` não existem em aresta — quem chama simplesmente não os manda. */
export function mesclarCamposDeAresta(
  diagramaConfig: DiagramaConfig,
  campos: (CampoCustomizado & { tipoAresta: string })[]
): DiagramaConfig {
  const edgeTypes = { ...diagramaConfig.edgeTypes };
  for (const campo of campos) {
    const cfg = edgeTypes[campo.tipoAresta];
    if (!cfg) continue;
    const fieldSpec = comoFieldSpec(campo);
    const specAtual = cfg.spec ?? [];
    const idx = specAtual.findIndex((f) => f.key === campo.key);
    const spec = idx >= 0 ? specAtual.map((f, i) => (i === idx ? fieldSpec : f)) : [...specAtual, fieldSpec];
    edgeTypes[campo.tipoAresta] = { ...cfg, spec };
  }
  return { ...diagramaConfig, edgeTypes };
}
