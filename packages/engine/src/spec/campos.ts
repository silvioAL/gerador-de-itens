import type { Aresta, No } from "../model/types.js";
import type { FieldSpec, PerfilTime } from "../config/types.js";
import { avaliarCondicao } from "./condicoes.js";

const TEMPLATE_RE = /\{\{(\w+)\}\}/g;

/** Campos visíveis do tipo de nó, reavaliados a cada mudança de estado. */
export function camposVisiveis(
  specDoTipo: FieldSpec[],
  no: No,
  arestasDoDiagrama: Aresta[]
): FieldSpec[] {
  return specDoTipo.filter(
    (campo) => !campo.when || avaliarCondicao(campo.when, no, arestasDoDiagrama)
  );
}

/**
 * Resolve `default` contra outros campos do mesmo nó via `{{campo}}`.
 * Se o campo referenciado estiver vazio, o resultado fica vazio — nunca o literal `{{campo}}`.
 *
 * Campo sem `default` estático tenta o perfil de stack do time da quebra
 * (`perfilDoTime`, ex.: `{ service: { linguagem: "Java" } }`) — um time que
 * sempre usa Java/Spring não deveria reconfigurar isso a cada serviço novo.
 * Um `default` explícito no schema sempre vence: é julgamento deliberado do
 * autor do domínio, não uma lacuna a preencher.
 */
export function resolverDefault(campo: FieldSpec, no: No, perfilDoTime?: PerfilTime): unknown {
  const def = campo.default;
  if (def === undefined) {
    return perfilDoTime?.[no.type]?.[campo.key];
  }
  if (typeof def !== "string" || !TEMPLATE_RE.test(def)) {
    return def;
  }
  TEMPLATE_RE.lastIndex = 0;
  return def.replace(TEMPLATE_RE, (_match, refKey: string) => {
    const refValor = no.spec[refKey]?.valor;
    return refValor === undefined || refValor === null ? "" : String(refValor);
  });
}
