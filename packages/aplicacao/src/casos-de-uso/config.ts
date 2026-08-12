import { diagnosticarConfig, type DiagnosticoConfig } from "../config/diagnostico.js";
import { normalizarDocumentoConfig, validarEscritaConfig } from "../config/normalizacao.js";
import {
  CAMPO_GLOBAL,
  type ChaveConfig,
  type DocumentoConfig,
  type RepositorioDeConfig,
} from "../portas/repositorioDeConfig.js";

/**
 * SPEC-31 Fase 3 — os casos de uso de Configuração.
 *
 * O template de fábrica entra por parâmetro, não é lido daqui: ler arquivo é
 * do adaptador, e o modo hospedado tem o template dentro da imagem enquanto o
 * local tem em `templates/`. Quem sabe onde ele está é a borda.
 */
export interface ConfigComDiagnostico {
  /** O documento em uso — o do time, o global, ou o template se nunca editado. */
  documento: unknown;
  /** `false` quando nunca foi editado e o que voltou é o template de fábrica. */
  personalizado: boolean;
  versaoTemplate: string | null;
  atualizadoEm: string | null;
  diagnostico: DiagnosticoConfig;
}

export interface CasosDeUsoDeConfig {
  obter(chave: ChaveConfig, template: unknown, timeId?: string): Promise<ConfigComDiagnostico>;
  salvar(
    chave: ChaveConfig,
    documento: unknown,
    versaoAtual: string | null,
    timeId?: string
  ): Promise<DocumentoConfig>;
}

/** Na leitura, `regras` passa cru: um arquivo sem `porTech` é problema pra
 * relatar, não pra explodir na hora de exibir. O diagnóstico é que fala. */
function normalizarNaLeitura(chave: ChaveConfig, documento: unknown): unknown {
  return chave === "regras" ? documento : normalizarDocumentoConfig(chave, documento);
}

export function criarCasosDeUsoDeConfig(repo: RepositorioDeConfig): CasosDeUsoDeConfig {
  return {
    async obter(chave, template, timeId) {
      const salvo = await repo.obter(chave, timeId);

      // Nunca editado: o template de fábrica É a config em uso, e por
      // construção está em dia — diagnosticar template contra ele mesmo não
      // acusa nada, que é a resposta certa.
      // Normalizar na LEITURA também: arquivo editado à mão é entrada tão
      // externa quanto um PUT, e a esteira nunca deve chegar vazia à UI.
      const documento = normalizarNaLeitura(chave, salvo ? salvo.documento : template);

      return {
        documento,
        personalizado: salvo !== null,
        versaoTemplate: salvo?.versaoTemplate ?? null,
        atualizadoEm: salvo?.atualizadoEm ?? null,
        diagnostico: diagnosticarConfig(chave, documento, template),
      };
    },

    // Gravar carimba a versão de quem gravou. É o que permite, no futuro,
    // dizer "isto foi salvo na 0.1.14" em vez de só inferir pelo formato.
    // SPEC-35: a escrita valida ANTES de normalizar — o que o saneamento
    // descartaria em silêncio vira `ConfigInvalida`, que a borda traduz em 400.
    salvar: (chave, documento, versaoAtual, timeId) => {
      validarEscritaConfig(chave, documento);
      return repo.salvar(chave, timeId || CAMPO_GLOBAL, normalizarDocumentoConfig(chave, documento), versaoAtual);
    },
  };
}
