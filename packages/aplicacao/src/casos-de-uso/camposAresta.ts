import {
  camposArestaEfetivos,
  normalizarDadosCampoAresta,
  type CampoAresta,
  type DadosCampoAresta,
  type RepositorioDeCamposAresta,
} from "../portas/repositorioDeCamposAresta.js";

/**
 * #303 — os casos de uso de Campos por tipo de conexão. Mesma estrutura de
 * `camposNo`: a regra de sobreposição vive aqui, a rota vira borda.
 */
export interface CasosDeUsoDeCamposAresta {
  /** Já resolvido: o do time sobrescreve o global, ordenado por `ordem`. */
  listarEfetivos(timeId?: string): Promise<CampoAresta[]>;
  /** Um campo pelo id — usado pela autorização da borda, que precisa saber de
   * qual time é o recurso antes de deixar mexer nele. */
  obter(id: string): Promise<CampoAresta | null>;
  salvar(bruto: Partial<DadosCampoAresta>): Promise<CampoAresta>;
  atualizar(id: string, parcial: Partial<DadosCampoAresta>): Promise<CampoAresta | null>;
  excluir(id: string): Promise<boolean>;
}

export function criarCasosDeUsoDeCamposAresta(repo: RepositorioDeCamposAresta): CasosDeUsoDeCamposAresta {
  return {
    async listarEfetivos(timeId) {
      return camposArestaEfetivos(await repo.listar(timeId), timeId);
    },
    obter: (id) => repo.obter(id),
    async salvar(bruto) {
      return repo.salvar(normalizarDadosCampoAresta(bruto));
    },
    async atualizar(id, parcial) {
      // Chave natural e id não mudam por PUT — mudar a `key` é criar outro
      // campo, não editar este (mesma decisão de camposNo).
      const { timeId: _t, tipoAresta: _a, key: _k, ...editaveis } = parcial;
      return repo.atualizar(id, editaveis);
    },
    excluir: (id) => repo.excluir(id),
  };
}
