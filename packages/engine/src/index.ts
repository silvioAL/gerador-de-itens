export * from "./model/types.js";
export * from "./config/types.js";
export { avaliarCondicao } from "./spec/condicoes.js";
export { camposVisiveis, resolverDefault } from "./spec/campos.js";
export { calcularProntidao } from "./readiness/prontidao.js";
export { validateConfig, validateRegras } from "./config/validator.js";
export { derivar, type ContextoQuebra } from "./derive/derivar.js";
export {
  resolverDependencias,
  type AtividadeComDependencias,
  type ResultadoDependenciasDe,
} from "./dependency/dependencias.js";
export { paraMarkdown, paraCsv } from "./export/exportar.js";
export { gerarChecklistTecnico, gerarCiclosDeTeste } from "./refinamento/gerarRefinamento.js";
export {
  gerarEspecificacaoEntrega,
  extrairVariaveis,
  validarTemplate,
  VARIAVEIS_ESPECIFICACAO,
  TEMPLATE_ESPECIFICACAO_PADRAO,
  type OpcoesGerarEspecificacao,
} from "./especificacao/gerarEspecificacaoEntrega.js";
export {
  importarGrafo,
  type GraphifyGraph,
  type GraphifyMappingConfig,
  type RegraMapeamentoGraphify,
  type ResultadoImportacao,
} from "./adapters/graphify/importarGrafo.js";
