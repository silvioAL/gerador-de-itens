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

export type {
  PerfilDeTime,
  PerfisDeTimes,
  RepositorioDePerfisTime,
} from "./portas/repositorioDePerfisTime.js";

export { criarCasosDeUsoDePerfisTime, type CasosDeUsoDePerfisTime } from "./casos-de-uso/perfisTime.js";

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
  montarPedidoPipeline,
  montarPedidoSugerirConfig,
  preambuloDoPapel,
  PedidoInvalido,
  type EntradaAlterarItem,
  type EntradaConfigurarConversa,
  type EntradaDiagrama,
  type EntradaPipeline,
  type EntradaSugerirConfig,
  type ItemDoLote,
  type MensagemConfigurar,
  type RetrospectivaParaConversa,
  type OrigemDaParte,
  type ParteDoPromptPipeline,
  type PedidoIa,
} from "./casos-de-uso/ia/pedidos.js";
