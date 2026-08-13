import { problemasDoTemplate, problemasDoTemplateItem } from "@gerador/engine";
import {
  CAMPO_GLOBAL,
  type RepositorioDeTemplateEspecificacao,
  type TemplateEspecificacao,
  type TipoDeTemplate,
} from "../portas/repositorioDeTemplateEspecificacao.js";

/** Erro de regra, não de infraestrutura — a borda traduz em HTTP 400. Os
 * motivos vêm de `problemasDoTemplate` (SPEC-35): a mesma frase que a tela
 * mostra antes do clique. */
export class TemplateInvalido extends Error {
  constructor(readonly motivos: string[]) {
    super(motivos.join("; "));
    this.name = "TemplateInvalido";
  }
}

export interface CasosDeUsoDeTemplateEspecificacao {
  obter(timeId?: string, tipo?: TipoDeTemplate): Promise<TemplateEspecificacao | null>;
  salvar(timeId: string | undefined, conteudo: string, tipo?: TipoDeTemplate): Promise<TemplateEspecificacao>;
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
    obter: (timeId, tipo) => repo.obter(timeId, tipo),

    async salvar(timeId, conteudo, tipo = "documento" as const) {
      // SPEC-35 — além das variáveis desconhecidas, a ausência das
      // OBRIGATÓRIAS bloqueia: sem {{itens}} o documento sairia sem o corpo,
      // e isso não pode ser gravado em silêncio por nenhum caminho (tela,
      // painel Configurar ou API direta).
      // SPEC-47 — o template do ITEM tem outras variáveis e outra régua
      // (nenhuma obrigatória; a entrega final é aviso, não bloqueio).
      const { erros } = tipo === "item" ? problemasDoTemplateItem(conteudo) : problemasDoTemplate(conteudo);
      if (erros.length > 0) throw new TemplateInvalido(erros);

      return repo.salvar(timeId || CAMPO_GLOBAL, conteudo, tipo);
    },
  };
}
