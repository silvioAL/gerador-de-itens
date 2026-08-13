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
  respostaVisivel,
  CHAVE_HISTORIA_USUARIO,
  CHAVE_CRITERIOS_ACEITE,
  CHAVE_CONTRATO_NO_VINCULADO,
  CHAVE_CONTRATO_REQUEST,
  CHAVE_CONTRATO_RESPONSE,
  CHAVE_CONTRATO_ERROS,
  CHAVE_CONTRATO_DEPENDENCIAS,
  CHAVE_REGRAS_TESTE,
  CHAVE_CENARIO_FEATURE,
  MARCADOR_ESPECIFICAR,
  type PlaceholderRefinamento,
} from "./refinamento/gerarRefinamento.js";
export {
  gerarEspecificacaoEntrega,
  renderizarItemEspecificacao,
  extrairVariaveis,
  problemasDoTemplate,
  validarTemplate,
  VARIAVEIS_ESPECIFICACAO,
  VARIAVEIS_OBRIGATORIAS_ESPECIFICACAO,
  type ProblemasDoTemplate,
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
export { gerarItensDeTrabalho, type ItemDeTrabalho } from "./especificacao/gerarItensDeTrabalho.js";
export {
  aplicarOperacao,
  descreverOperacao,
  diferencaDoChecklist,
  type OperacaoDeAjuste,
} from "./pdca/ajusteDeRegras.js";
export { gerarDiagramaHtml, type OpcoesGerarDiagramaHtml } from "./diagrama-html/gerarDiagramaHtml.js";
export {
  importarGrafo,
  type GraphifyGraph,
  type GraphifyMappingConfig,
  type RegraMapeamentoGraphify,
  type ResultadoImportacao,
} from "./adapters/graphify/importarGrafo.js";
export {
  hashCurto,
  insumosDoItem,
  carimbarInsumos,
  insumosDivergentes,
  respostaDesatualizada,
  type InsumoDoItem,
  type CarimboProcedencia,
  type InsumoDivergente,
} from "./procedencia/procedencia.js";
export {
  revisarQuebra,
  resumirAchados,
  type Achado,
  type SeveridadeAchado,
} from "./revisao/checagens.js";
export { itensImpactados, type ItemImpactado } from "./procedencia/impacto.js";

// SPEC-30 Fase 1a — o vocabulário que a transcrição recebe como contexto.
// Vive no engine (e não na aplicação) porque `packages/web` precisa dele: quem
// tem a config E o diagrama abertos é o navegador, e é ele que monta a frase.
export {
  montarVocabularioTranscricao,
  type OpcoesVocabulario,
} from "./transcricao/vocabulario.js";
