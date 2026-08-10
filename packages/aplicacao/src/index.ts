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
