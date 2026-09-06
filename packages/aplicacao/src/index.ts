/**
 * `@gerador/aplicacao` — a camada de aplicação (SPEC-31).
 *
 * Portas (interfaces) e casos de uso. **Não tem I/O**: nada de `node:fs`,
 * `pg`, `fetch` ou `process.env` aqui dentro — quem faz I/O é adaptador, e
 * adaptador mora no pacote que tem a infraestrutura (cli para arquivo, server
 * para Postgres). A regra é guardada por `boundary.sanity.test.ts`.
 *
 * A suíte de contrato (`portas/contratoDeQuebras.js`) fica FORA deste índice de
 * propósito: ela importa `vitest`, e código de produção que importasse o índice
 * acabaria arrastando o test runner junto. Quem a usa são os testes dos
 * adaptadores, por caminho direto.
 */
export {
  normalizarDadosQuebra,
  type DadosQuebra,
  type QuebraSalva,
  type RepositorioDeQuebras,
  type ResumoQuebra,
} from "./portas/repositorioDeQuebras.js";

export { criarCasosDeUsoDeQuebras, type CasosDeUsoDeQuebras } from "./casos-de-uso/quebras.js";
export type {
  ItemGeradoSalvo,
  DadosItemGerado,
  RepositorioDeItensGerados,
} from "./portas/repositorioDeItensGerados.js";
export { criarCasosDeUsoDeItensGerados, type CasosDeUsoDeItensGerados } from "./casos-de-uso/itensGerados.js";
export { normalizarExportador, type ConfigExportador } from "./config/normalizacao.js";

/** SPEC-81 — os destinos do gateway do time: vários endereços, um por operação. */
export {
  destinosDaOperacao,
  OPERACOES_DO_GATEWAY,
  type DestinoDoGateway,
  type DestinoResolvido,
  type OperacaoDoGateway,
  /** §346 — a variação de curl por destino: verbo e envelope do payload. */
  METODOS_DO_GATEWAY,
  METODO_PADRAO,
  type MetodoDoGateway,
} from "./config/normalizacao.js";

/** SPEC-81 fatia C — ler os ADRs da casa, marcados como importados. A leitura
 * em si virou o executor genérico de conector (SPEC-107 G3); o que fica é a
 * CONVERSÃO pura, agora consumida pelo web. */
export {
  comoDecisao,
  lacunasDaDecisaoImportada,
  sanearAdrsExternos,
  statusDe,
  type AdrExterno,
  type LeitorDeAdr,
} from "./portas/leitorDeAdr.js";
/** §349 — ler um documento da casa por LINK, para virar desenho (SPEC-100 §4). */
export type { LeitorDeDocumento, DocumentoExterno } from "./portas/leitorDeDocumento.js";


/** SPEC-81 fatia E — a decisão daqui volta para o repositório da casa. */
export { decisoesQuePodemVoltar, type AdrParaPublicar, type EscritorDeAdr } from "./portas/escritorDeAdr.js";

// SPEC-81 fatia B → SPEC-107 G2: a porta `PublicadorDeDocumento` morreu —
// publicar é a fiação semeada, pelo executor genérico de conector.

export {
  CAMPO_GLOBAL,
  camposEfetivos,
  normalizarDadosCampoNo,
  type CampoNo,
  type DadosCampoNo,
  type ItemSpecCampo,
  type RepositorioDeCamposNo,
  type TipoCampoNo,
} from "./portas/repositorioDeCamposNo.js";

export { criarCasosDeUsoDeCamposNo, type CasosDeUsoDeCamposNo } from "./casos-de-uso/camposNo.js";

export {
  camposArestaEfetivos,
  normalizarDadosCampoAresta,
  type CampoAresta,
  type DadosCampoAresta,
  type RepositorioDeCamposAresta,
  type TipoCampoAresta,
} from "./portas/repositorioDeCamposAresta.js";

export { criarCasosDeUsoDeCamposAresta, type CasosDeUsoDeCamposAresta } from "./casos-de-uso/camposAresta.js";

export type { Stack, SugestoesDeStack, RepositorioDeStacks } from "./portas/repositorioDeStacks.js";
// SPEC-54 — a credencial de IA sai do banco e vai para o cofre.
export type { CofreDeSegredos } from "./portas/cofreDeSegredos.js";
export { nomeDoSegredoDeCredencial } from "./portas/cofreDeSegredos.js";
export { comCofreDeSegredos } from "./casos-de-uso/credenciaisComCofre.js";
// SPEC-53 — o produto e o contexto que ele carrega.
export type {
  Produto,
  ProdutoComContexto,
  DadosDoProduto,
  TermoDeGlossario,
  RepositorioDeProdutos,
} from "./portas/repositorioDeProdutos.js";
export { produtosDoTime, contextoDoProdutoEmTexto } from "./portas/repositorioDeProdutos.js";

export { criarCasosDeUsoDeStacks, nomeDerivadoDosValores, type CasosDeUsoDeStacks } from "./casos-de-uso/stacks.js";
export { criarCasosDeUsoDeProdutos, type CasosDeUsoDeProdutos } from "./casos-de-uso/produtos.js";

export type {
  RepositorioDeTemplateEspecificacao,
  TemplateEspecificacao,
} from "./portas/repositorioDeTemplateEspecificacao.js";

export {
  criarCasosDeUsoDeTemplateEspecificacao,
  TemplateInvalido,
  type CasosDeUsoDeTemplateEspecificacao,
} from "./casos-de-uso/templateEspecificacao.js";

export {
  CHAVES_CONFIG,
  ehChaveConfig,
  type ChaveConfig,
  type DocumentoConfig,
  type RepositorioDeConfig,
} from "./portas/repositorioDeConfig.js";

export {
  diagnosticarConfig,
  resumirConfig,
  /** SPEC-102 fatia D — a leitura ÚNICA das sobreposições de conexão, usada
   * pelo diagnóstico e pela mescla no web. */
  regrasDeConexaoDe,
  aplicarRegrasDeConexao,
  type DiagnosticoConfig,
  type ResumoConfig,
  type SecaoVazia,
} from "./config/diagnostico.js";

export {
  criarCasosDeUsoDeConfig,
  type CasosDeUsoDeConfig,
  type ConfigComDiagnostico,
} from "./casos-de-uso/config.js";

export {
  ConfigInvalida,
  GRUPOS_FICHA,
  normalizarDocumentoConfig,
  normalizarPipelineAgentes,
  validarEscritaConfig,
  validarEscritaPipelineAgentes,
  PAPEIS_PADRAO,
  sanearPapeis,
  type ConfigPipelineAgentes,
  type GrupoFicha,
  type PapelConfigurado,
} from "./config/normalizacao.js";

/** SPEC-105 fatia A/B — o conector como dado, e a metade pura do executor. */
export {
  CONTRATO_DA_OPERACAO,
  NOME_DA_OPERACAO,
  TIPOS_DE_CAMPO_DO_CONECTOR,
  conectoresDeFabrica,
  conectoresEmVigor,
  normalizarConectores,
  validarEscritaConectores,
  type CampoDoConector,
  type ConfigConectores,
  type Conector,
  type ConectorEmVigor,
  type TipoDeCampoDoConector,
} from "./config/conectores.js";
export { analisarCaminho, lerCaminho } from "./config/caminho.js";
/** SPEC-107 fatia A — o registro de FUNÇÕES do sistema, com contrato e
 * governança como dado, e o executor puro delas. */
export {
  FUNCOES_DO_SISTEMA,
  funcaoDoSistema,
  type FuncaoDoSistema,
  type GovernancaDaFuncao,
} from "./config/funcoes.js";
export {
  comoDesenhoMapeado,
  EntradaDaFuncaoInvalida,
  executarFuncao,
  type ContextoDasFuncoes,
  type DesenhoMapeado,
} from "./casos-de-uso/funcoes.js";
/** SPEC-107 fatia B — o PROJETO como nó, nas duas direções. */
export { PROJETO_DO_SISTEMA, REF_DO_PROJETO, type ProjetoDoSistema } from "./config/projeto.js";
export {
  demandaAtiva,
  erroSemDemanda,
  resultadoDaExportacao,
  saidaDoProjeto,
  varianteProposta,
} from "./casos-de-uso/projetoNoFluxo.js";
/** SPEC-107 G1 — a régua de "pronto" da exportação, num lugar só. */
export { prontosEIgnorados } from "./casos-de-uso/itensGerados.js";
/** SPEC-107 fatia F — compatibilidade de mapeamento por tipo (aviso). */
export { avisosDeMapeamento, type AvisoDeMapeamento, type ContratoDoNoNoFluxo } from "./casos-de-uso/mapeamento.js";
/** SPEC-107 fatia E — a transformação pura (o Set do n8n). */
export {
  sanearCamposDaTransformacao,
  transformarEntradas,
  validarCamposDaTransformacao,
  type CampoDaTransformacao,
} from "./casos-de-uso/transformacao.js";
/** SPEC-107 fatia A — o montador ÚNICO do vocabulário do diagrama (web e
 * servidor mesclam os campos customizados pela mesma função, §263). */
export {
  comoFieldSpec,
  mesclarCamposDeAresta,
  mesclarCamposDeNo,
  type CampoCustomizado,
} from "./config/diagramaDoTime.js";
/** SPEC-105 fatias C/D — o fluxo como grafo, e a execução pura. */
// SPEC-107 G5 — a fila da esteira, pura: a mesma para a revisão e a fiação.
export { TAM_LOTE_ESTEIRA, corpoDoLote, itensDoPapel } from "./casos-de-uso/lotesDaEsteira.js";
export {
  contextoDoPlaceholder,
  filaDaEsteiraDaDemanda,
  montarFilaDaEsteira,
  papelDoGrupo,
  placeholdersDaFichaPorGrupo,
  respostaConfirmada,
  type ItemDaFilaDaEsteira,
  type PlaceholderDoPedido,
  type RespostaAnterior,
} from "./casos-de-uso/filaDaEsteira.js";

export {
  ID_DO_FLUXO_DA_ESTEIRA,
  ID_DO_FLUXO_DA_EXPORTACAO,
  ID_DO_FLUXO_DA_PUBLICACAO,
  ID_DO_FLUXO_DO_ENSAIO,
  TIPOS_DE_NO_DO_FLUXO,
  fluxoDaEsteira,
  fluxoDaExportacao,
  fluxoDoEnsaio,
  fluxosDaPublicacao,
  fluxosEmVigor,
  mensagemDeCiclo,
  normalizarFluxos,
  planoDoFluxo,
  validarEscritaFluxos,
  type ArestaDoFluxo,
  type ConfigFluxos,
  type Fluxo,
  type FluxoEmVigor,
  type NoDoFluxo,
  type TipoDeNoDoFluxo,
} from "./config/fluxos.js";
export {
  executarFluxo,
  type EstadoDoNo,
  type ExecutoresDoFluxo,
  type OpcoesDeExecucao,
  type RastroDoNo,
  type ResultadoDoFluxo,
} from "./casos-de-uso/fluxos.js";
export {
  EntradaDoConectorInvalida,
  montarChamadaDoConector,
  mapearSaidaDoConector,
  type ChamadaDoConector,
  type SaidaDoConector,
} from "./casos-de-uso/conectores.js";

export {
  resumirCredencialIa,
  type CredencialIa,
  type RepositorioDeCredenciais,
  type ResumoCredencial,
} from "./portas/repositorioDeCredenciais.js";

export {
  ALVOS_DA_CONVERSA_DE_CONFIG,
  ALVOS_DE_SUGESTAO_CONHECIDOS,
  ANATOMIA_DO_PROMPT_PIPELINE,
  PREAMBULO_GENERICO,
  PREAMBULO_PADRAO_POR_PAPEL,
  montarPedidoAlterarItem,
  montarPedidoConfigurarConversa,
  montarPedidoDiagrama,
  montarPedidoCenariosDeLentidao,
  montarPedidoDecisoes,
  montarPedidoNecessidades,
  montarPedidoPipeline,
  montarPedidoSugerirConfig,
  preambuloDoPapel,
  PedidoInvalido,
  type EntradaAlterarItem,
  type EntradaConfigurarConversa,
  type EntradaDiagrama,
  type EntradaDecisoes,
  type EntradaNecessidades,
  type EntradaPipeline,
  type EntradaSugerirConfig,
  type ItemDoLote,
  type MensagemConfigurar,
  type OrigemDaParte,
  type ParteDoPromptPipeline,
  type PedidoIa,
} from "./casos-de-uso/ia/pedidos.js";

export {
  montarMapaDoSistema,
  type MapaDoSistema,
  type AgenteDoMapa,
  type FluxoDoMapa,
  type RegraDoMapa,
  type EstadoDoAgente,
  type EntradaDoMapa,
  type ExecucaoDoPapel,
} from "./sistema/mapaDoSistema.js";
