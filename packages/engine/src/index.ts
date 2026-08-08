export * from "./model/types.js";
export * from "./config/types.js";
export { avaliarCondicao } from "./spec/condicoes.js";
export { camposVisiveis, camposVisiveisAresta, resolverDefault } from "./spec/campos.js";
export { calcularProntidao } from "./readiness/prontidao.js";
export { validateConfig, validateRegras } from "./config/validator.js";
export { derivar, type ContextoQuebra } from "./derive/derivar.js";
export {
  resolverDependencias,
  type AtividadeComDependencias,
  type ResultadoDependenciasDe,
} from "./dependency/dependencias.js";
export { paraMarkdown, paraCsv } from "./export/exportar.js";
export {
  gerarChecklistTecnico,
  gerarChecklistProcesso,
  gerarCiclosDeTeste,
  gerarVolumetria,
  listarPlaceholders,
  type PlaceholderRefinamento,
} from "./refinamento/gerarRefinamento.js";
export {
  gerarEspecificacaoEntrega,
  renderizarItemEspecificacao,
  extrairVariaveis,
  validarTemplate,
  VARIAVEIS_ESPECIFICACAO,
  TEMPLATE_ESPECIFICACAO_PADRAO,
  nosDeOrigem,
  estruturarEspecificacaoNo,
  montarFichaItem,
  type OpcoesGerarEspecificacao,
  type FichaCampoEscalar,
  type FichaCampoLista,
  type FichaEspecificacaoNo,
  type FichaPlaceholder,
  type FichaItem,
} from "./especificacao/gerarEspecificacaoEntrega.js";
export { gerarDiagramaHtml, type OpcoesGerarDiagramaHtml } from "./diagrama-html/gerarDiagramaHtml.js";
export {
  importarGrafo,
  type GraphifyGraph,
  type GraphifyMappingConfig,
  type RegraMapeamentoGraphify,
  type ResultadoImportacao,
} from "./adapters/graphify/importarGrafo.js";
