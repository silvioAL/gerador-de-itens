import type { Aresta, ErroSpec, No, Prontidao } from "../model/types.js";
import type { FieldSpec } from "../config/types.js";
import { camposVisiveis } from "../spec/campos.js";

function isPreenchido(valor: unknown): boolean {
  return valor !== undefined && valor !== null && valor !== "";
}

interface Avaliacao {
  resolvido: boolean;
  erro?: ErroSpec;
  pendenteConfirmacao?: boolean;
}

/**
 * Motivo vazio derruba o campo com NA_SEM_MOTIVO mesmo quando `permiteNA: false` —
 * a falta de justificativa é sempre o problema mais específico a reportar.
 */
function avaliarCampo(campo: FieldSpec, no: No): Avaliacao {
  const na = no.specNA?.[campo.key];
  if (na) {
    const motivo = na.motivo?.trim() ?? "";
    if (motivo === "") {
      return { resolvido: false, erro: { campo: campo.key, codigo: "NA_SEM_MOTIVO" } };
    }
    if (campo.permiteNA === false) {
      return { resolvido: false, erro: { campo: campo.key, codigo: "NA_NAO_PERMITIDO" } };
    }
    return { resolvido: true };
  }

  const valorSpec = no.spec[campo.key];
  if (!valorSpec || !isPreenchido(valorSpec.valor)) {
    return { resolvido: false };
  }

  const pendente =
    (valorSpec.origem === "inferido" || valorSpec.origem === "sugerido") &&
    valorSpec.confirmado !== true;

  if (valorSpec.origem === "sugerido" && !valorSpec.confirmado) {
    // §4.3 — nada sugerido conta até ser confirmado nó a nó.
    return { resolvido: false, pendenteConfirmacao: true };
  }

  return { resolvido: true, pendenteConfirmacao: pendente };
}

export function calcularProntidao(
  specDoTipo: FieldSpec[],
  no: No,
  arestasDoDiagrama: Aresta[]
): Prontidao {
  const visiveis = camposVisiveis(specDoTipo, no, arestasDoDiagrama);

  const obrigatoriosEmAberto: string[] = [];
  const inferidosPendentes: string[] = [];
  const erros: ErroSpec[] = [];

  for (const campo of visiveis) {
    const avaliacao = avaliarCampo(campo, no);
    if (avaliacao.erro) erros.push(avaliacao.erro);
    if (avaliacao.pendenteConfirmacao) inferidosPendentes.push(campo.key);
    if (!avaliacao.resolvido && campo.required) obrigatoriosEmAberto.push(campo.key);
  }

  const nivel =
    obrigatoriosEmAberto.length > 0
      ? "vermelho"
      : inferidosPendentes.length > 0
        ? "amarelo"
        : "verde";

  return { nivel, obrigatoriosEmAberto, inferidosPendentes, erros };
}
