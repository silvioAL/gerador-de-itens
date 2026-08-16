export * from "./model/types.js";
export * from "./config/types.js";
export { avaliarCondicao } from "./spec/condicoes.js";
export { camposVisiveis, camposVisiveisAresta, resolverDefault } from "./spec/campos.js";
export { calcularProntidao } from "./readiness/prontidao.js";
export {
  avaliarConformidade,
  violacoesDoNo,
  violacoesEmAberto,
  violacoesAceitas,
  type Violacao,
} from "./conformidade/conformidade.js";
export {
  analisarLacunas,
  necessidadeConta,
  necessidadesDoElemento,
  type Lacunas,
} from "./proposito/lacunas.js";
export {
  decisaoVigente,
  decisoesVigentes,
  decisoesDoElemento,
  propostasPendentes,
  resumirDecisoes,
  excecoesComoDecisoes,
  type ResumoDeDecisoes,
} from "./decisao/decisoes.js";
export {
  inferirPercursos,
  conciliarPercursos,
  percursoConta,
  percursosQueContam,
  MAX_PERCURSOS,
  type PercursosInferidos,
} from "./percurso/percursos.js";
export {
  avaliarPercursos,
  type ViolacaoDePercurso,
  type PercursoNaoMedido,
  type ResultadoDePercursos,
} from "./percurso/conformidadeDePercurso.js";
export { deltaDeDecisao, deltaDePercurso, piorou } from "./remedicao/remedicao.js";
export { compararDocumentos } from "./documento/compararDocumentos.js";
export type { MudancaDeSecao } from "./documento/compararDocumentos.js";
export type { LinhaDeDelta, Remedicao, ContextoDaRemedicao } from "./remedicao/remedicao.js";
export {
  estruturarDocumento,
  type DocumentoDeDesenho,
  type ItemDoDocumento,
  type IndicadorDeSaude,
  type OpcoesEstruturarDocumento,
} from "./documento/estruturarDocumento.js";
export { gerarDocumentoHtml, type OpcoesDocumentoHtml } from "./documento/gerarDocumentoHtml.js";
export { validateConfig, validateRegras } from "./config/validator.js";
export { derivar, type ContextoQuebra } from "./derive/derivar.js";
export {
  avisosDaDerivacao,
  type AvisoDaDerivacao,
  type EntradaDosAvisos,
} from "./derive/avisosDaDerivacao.js";
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
  VARIAVEIS_ITEM,
  TEMPLATE_ITEM_PADRAO,
  validarTemplateItem,
  problemasDoTemplateItem,
  aplicarTemplateDoItem,
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
  secaoDaOperacao,
  recursoAlvoDaOperacao,
  aplicarOperacaoNoPipeline,
  aplicarOperacaoNosCampos,
  diferencaDeCampos,
  alvoDeCampoDaOperacao,
  ehOperacaoDeRegras,
  type PipelineComPapeis,
  type OperacaoDeAjuste,
  type OperacaoDeRegras,
  type OperacaoDePipeline,
  type OperacaoDeCampo,
  type RecursoDeAjuste,
  type CampoProposto,
  type CampoDaFicha,
  type TipoDeCampoProposto,
  type SecaoDeRegras,
  type SecaoDeChecklist,
} from "./pdca/ajusteDeRegras.js";
export { gerarDiagramaHtml, type OpcoesGerarDiagramaHtml } from "./diagrama-html/gerarDiagramaHtml.js";
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
