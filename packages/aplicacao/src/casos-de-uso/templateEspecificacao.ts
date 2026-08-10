import { validarTemplate } from "@gerador/engine";
import {
  CAMPO_GLOBAL,
  type RepositorioDeTemplateEspecificacao,
  type TemplateEspecificacao,
} from "../portas/repositorioDeTemplateEspecificacao.js";

/** Erro de regra, não de infraestrutura — a borda traduz em HTTP 400. */
export class TemplateInvalido extends Error {
  constructor(readonly variaveisDesconhecidas: string[]) {
    super(`variável(is) desconhecida(s) no template: ${variaveisDesconhecidas.map((v) => `{{${v}}}`).join(", ")}`);
    this.name = "TemplateInvalido";
  }
}

export interface CasosDeUsoDeTemplateEspecificacao {
  obter(timeId?: string): Promise<TemplateEspecificacao | null>;
  salvar(timeId: string | undefined, conteudo: string): Promise<TemplateEspecificacao>;
}

/**
 * SPEC-31 Fase 2 — o template da especificação de entrega.
 *
 * **A validação subiu para cá.** O modo hospedado chamava `validarTemplate`
 * antes de gravar; o local aceitava qualquer coisa. Um `{{tipoErrado}}` salvo
 * no modo local não dava erro nenhum: aparecia como texto cru no documento
 * entregue, e só uma pessoa lendo a saída perceberia. Agora a regra é uma só,
 * porque mora no caso de uso em vez de na borda.
 */
export function criarCasosDeUsoDeTemplateEspecificacao(
  repo: RepositorioDeTemplateEspecificacao
): CasosDeUsoDeTemplateEspecificacao {
  return {
    obter: (timeId) => repo.obter(timeId),

    async salvar(timeId, conteudo) {
      const desconhecidas = validarTemplate(conteudo);
      if (desconhecidas.length > 0) throw new TemplateInvalido(desconhecidas);

      return repo.salvar(timeId || CAMPO_GLOBAL, conteudo);
    },
  };
}
