export * from "./model/types.js";
export * from "./config/types.js";
/** SPEC-88 (P6) — as alternativas de desenho, e a decisão que nasce ao adotar. */
export {
  AdocaoSemPorque,
  VarianteInexistente,
  adotarVariante,
  compararVariantes,
  guardarComoVariante,
  type ComparacaoDeVariantes,
  type LadoDaComparacao,
  type ResultadoDaAdocao,
} from "./variante/variantes.js";
/** SPEC-86 — a soma das regras do time com as do produto, com procedência. */
export {
  chaveDaRegra,
  regrasEmVigor,
  type ListaDeRegra,
  type OrigemDaRegra,
  type RegrasEmVigor,
} from "./config/regrasEmVigor.js";
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
  type ElementoDoCaminho,
  type ResultadoDePercursos,
} from "./percurso/conformidadeDePercurso.js";
export { percursoManual } from "./percurso/percursos.js";
export {
  avaliarTopologia,
  violacoesDeFormaAceitas,
  violacoesDeFormaEmAberto,
  type ViolacaoDeTopologia,
} from "./conformidade/topologia.js";
export type { ChecagemDeTopologia, RequisitoDeTopologia } from "./config/types.js";
export {
  arestaEspera,
  formatarDuracao,
  dispensasComEfeito,
  lerDesenho,
  marcasPorNo,
  reguaDaLeitura,
  resumirLeitura,
  CAMPO_DE_TEMPO_PADRAO,
  type CadeiaQueEspera,
  type MarcaDaLeitura,
  type ElementoDaLeitura,
  type FanOutQueEspera,
  type LeituraDoDesenho,
  type LimiaresDaLeitura,
  type TempoDoTrecho,
  type TerceiroNoCaminho,
} from "./leitura/lerDesenho.js";
export {
  avaliarResiliencia,
  insistenciaDe,
  CAMPOS_DE_RESILIENCIA,
  chaveDaContradicao,
  contradicoesAceitas,
  contradicoesEmAberto,
  type ContradicaoDeResiliencia,
  type Insistencia,
} from "./leitura/resiliencia.js";
export {
  cobrancasDeEnsaio,
  concluirEnsaio,
  elementosComTempo,
  ensaioCobra,
  ensaiosAssumidos,
  ensaiosDaDecisao,
  faltaParaEnsaiar,
  estadoDoEnsaio,
  prazoEstourado,
  simularCenario,
  simularCenarios,
  type CobrancaDeEnsaio,
  type ElementoAjustavel,
  type FaltaParaEnsaiar,
  type EnsaioAssumido,
  type ResultadoDoCenario,
} from "./leitura/simularLentidao.js";
export {
  descreverVolumetria,
  distribuirVolumetria,
  emRequisicoesPorSegundo,
  /** SPEC-77 — declarado vence herdado, e a frase diz qual é qual. */
  volumetriaEmVigor,
  descreverVolumetriaEmVigor,
  volumeVencido,
  type VolumetriaEmVigor,
  formatarRps,
} from "./leitura/volumetria.js";
export { deltaDeDecisao, deltaDePercurso, piorou } from "./remedicao/remedicao.js";
export { compararDocumentos } from "./documento/compararDocumentos.js";
export { exemploDeMedicao, valorQueEstoura } from "./conformidade/exemploDeMedicao.js";
export type { MedicaoDeExemplo } from "./conformidade/exemploDeMedicao.js";
export type { MudancaDeSecao } from "./documento/compararDocumentos.js";
export type { LinhaDeDelta, Remedicao, ContextoDaRemedicao } from "./remedicao/remedicao.js";
export {
  estruturarDocumento,
  type DocumentoDeDesenho,
  type ItemDoDocumento,
  type IndicadorDeSaude,
  type LadoDaSaude,
  type OpcoesEstruturarDocumento,
} from "./documento/estruturarDocumento.js";
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
  /** SPEC-74 — a proveniência do que o modo sem custo escreveu. */
  EVIDENCIA_SIMULADA,
  MARCA_SIMULADO,
  /** Exportada junto porque o E2E afirma o PAR: confirmar tira esta e não
   * tira a de simulado. Duas marcas com regras diferentes só se provam
   * distintas se as duas puderem ser citadas pelo mesmo teste. */
  MARCA_SUGERIDO,
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
export {
  gerarItensDeTrabalho,
  /** SPEC-73 fatia D — a mesma contagem serve o item e o documento inteiro. */
  contar,
  type ItemDeTrabalho,
} from "./especificacao/gerarItensDeTrabalho.js";
export { lacunasSemMarcador, type LacunaSemMarcador } from "./especificacao/lacunasDoDocumento.js";

/** SPEC-80 — a spec de SDD como artefato do motor. */
export {
  coberturaDaSpec,
  extrairVariaveisSpec,
  gerarSpec,
  problemasDoTemplateSpec,
  SECOES_DE_JULGAMENTO,
  TEMPLATE_SPEC_PADRAO,
  VARIAVEIS_OBRIGATORIAS_SPEC,
  VARIAVEIS_SPEC,
  type CoberturaDaSpec,
  type OpcoesGerarSpec,
  type ProblemasDoTemplateSpec,
  type SecaoDeJulgamento,
  type VariavelSpec,
} from "./especificacao/gerarSpec.js";
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
/** SPEC-94 fatia Z — o ciclo de configuração, medido. A entrada da análise
 *  crítica que não depende de canal externo nenhum. */
export {
  metricasDoCiclo,
  DIAS_PARA_SINAL_MORRER,
  type MetricasDoCiclo,
  type SolicitacaoParaMetrica,
  type FeedbackParaMetrica,
  type ContagemDeRecurso,
} from "./pdca/metricas.js";
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

/** SPEC-79 fatia A — o design system do time como dado, no formato que as
 * ferramentas já falam. */
export { deTokensW3C, paraTokensW3C } from "./config/tokensW3C.js";

/** SPEC-79 fatia C — a parte do design system que é aritmética. */
export { contraste, contrasteArredondado, rgbDe } from "./conformidade/contraste.js";
