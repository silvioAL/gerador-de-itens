import {
  camposArestaEfetivos,
  normalizarDadosCampoAresta,
  type CampoAresta,
  type DadosCampoAresta,
  type RepositorioDeCamposAresta,
} from "../portas/repositorioDeCamposAresta.js";

/** #303 — gêmeo de `criarCasosDeUsoDeCamposNo`. Toda a regra vive aqui; os
 * adaptadores só sabem ler e gravar linhas. */
export interface CasosDeUsoDeCamposAresta {
  listarEfetivos(timeId?: string): Promise<CampoAresta[]>;
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
      // A chave natural não se edita: mudar `tipoAresta`/`key` de um campo
      // existente é criar outro campo, e por aqui viraria um upsert órfão.
      const { timeId: _t, tipoAresta: _a, key: _k, ...editaveis } = parcial;
      return repo.atualizar(id, editaveis);
    },
    excluir: (id) => repo.excluir(id),
  };
}
