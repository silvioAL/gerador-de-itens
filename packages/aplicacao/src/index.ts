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
export type { ExportadorDeItens, ItemExportado } from "./portas/exportadorDeItens.js";
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

/** SPEC-81 fatia C — ler os ADRs da casa, marcados como importados. */
export {
  comoDecisao,
  lacunasDaDecisaoImportada,
  statusDe,
  type AdrExterno,
  type LeitorDeAdr,
} from "./portas/leitorDeAdr.js";
/** §349 — ler um documento da casa por LINK, para virar desenho (SPEC-100 §4). */
export type { LeitorDeDocumento, DocumentoExterno } from "./portas/leitorDeDocumento.js";

/** SPEC-81 fatia F — a arquitetura de negócio da casa vira PROPOSTA. */
export {
  CAMPOS_DA_ARQUITETURA,
  decisoesNaProposta,
  propostaDeArquitetura,
  type ArquiteturaDeNegocioExterna,
  type CampoDaArquitetura,
  type CampoProposto,
  type LeitorDeArquiteturaDeNegocio,
  type PropostaDeArquitetura,
} from "./portas/leitorDeArquiteturaDeNegocio.js";

/** SPEC-81 fatia E — a decisão daqui volta para o repositório da casa. */
export { decisoesQuePodemVoltar, type AdrParaPublicar, type EscritorDeAdr } from "./portas/escritorDeAdr.js";

/** SPEC-81 fatia B — publicar o documento na base de conhecimento. */
export type {
  DocumentoParaPublicar,
  DocumentoPublicado,
  PublicadorDeDocumento,
} from "./portas/publicadorDeDocumento.js";

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
  type RegraDoMapa,
  type EstadoDoAgente,
  type EntradaDoMapa,
  type ExecucaoDoPapel,
} from "./sistema/mapaDoSistema.js";
