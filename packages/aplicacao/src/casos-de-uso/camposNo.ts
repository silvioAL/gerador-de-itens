import {
  camposEfetivos,
  normalizarDadosCampoNo,
  type CampoNo,
  type DadosCampoNo,
  type RepositorioDeCamposNo,
} from "../portas/repositorioDeCamposNo.js";

/**
 * SPEC-31 Fase 2 — os casos de uso de Campos por tipo de nó.
 *
 * A regra de sobreposição (global × time) vive aqui, e não nos adaptadores:
 * era ela que estava copiada nos dois modos.
 */
export interface CasosDeUsoDeCamposNo {
  /** Já resolvido: o do time sobrescreve o global, ordenado por `ordem`. */
  listarEfetivos(timeId?: string): Promise<CampoNo[]>;
  /** Um campo pelo id — quem usa é a autorização da borda, que precisa saber
   * de qual time é o recurso antes de deixar mexer nele. */
  obter(id: string): Promise<CampoNo | null>;
  salvar(bruto: Partial<DadosCampoNo>): Promise<CampoNo>;
  atualizar(id: string, parcial: Partial<DadosCampoNo>): Promise<CampoNo | null>;
  excluir(id: string): Promise<boolean>;
}

export function criarCasosDeUsoDeCamposNo(repo: RepositorioDeCamposNo): CasosDeUsoDeCamposNo {
  return {
    async listarEfetivos(timeId) {
      return camposEfetivos(await repo.listar(timeId), timeId);
    },
    obter: (id) => repo.obter(id),
    async salvar(bruto) {
      return repo.salvar(normalizarDadosCampoNo(bruto));
    },
    async atualizar(id, parcial) {
      // Chave natural e id não se alteram por PUT: mudar a `key` de um campo é
      // criar outro campo, não editar este — e a UI já faz isso salvando um novo.
      const { timeId: _t, tipoNo: _n, key: _k, ...editaveis } = parcial;
      return repo.atualizar(id, editaveis);
    },
    excluir: (id) => repo.excluir(id),
  };
}
