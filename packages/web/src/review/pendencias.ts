// SPEC-107 G5c — a régua inteira mudou para a aplicação
// (`casos-de-uso/pendencias.ts`): o julgamento campo a campo vive na DEMANDA
// (§5.5), e revisão e documento importam a MESMA régua (§263). Este arquivo
// só re-exporta, para os consumidores da pasta não mudarem de linha.
export {
  assinarSugestao,
  fraseDeCompletude,
  pendenciasDaRevisao,
  placeholdersDaFicha,
  respostaConfirmada,
  type PendenciasDaRevisao,
  type PendenteDeConfirmacao,
} from "@gerador/aplicacao";
