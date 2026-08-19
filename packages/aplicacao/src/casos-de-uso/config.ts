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

/**
 * §272 — a seção que o documento NEM TEM nasce preenchida.
 *
 * ## O problema, relatado com print
 *
 * O diagnóstico do §108 avisava *"a sua configuração de regras não tem nenhuma
 * régua de percurso (2 no padrão desta versão)"*. Ele estava certo: o
 * documento foi gravado antes de a seção existir. Mas o aviso era o fim da
 * linha — a única saída era escrever à mão as duas réguas que o padrão já traz,
 * e a frase *"fica vazia para sempre"* descrevia literalmente o que acontecia.
 *
 * ## A régua: AUSENTE não é VAZIO
 *
 * `undefined` é uma seção que não existia quando este documento foi criado —
 * não há edição a preservar, e completar com o padrão é o que a pessoa faria à
 * mão. `[]` é alguém que esvaziou de propósito, e isso se respeita: continua
 * vazio, e o diagnóstico continua avisando.
 *
 * A promessa de "nunca sobrescrever o que você editou" fica intacta, porque
 * nada aqui toca em chave que exista.
 *
 * ## Só o primeiro nível
 *
 * Nada de mesclar `porTech` tech a tech: config enxuta é escolha legítima de
 * time (é o que o próprio diagnóstico diz ao não acusar "menos que o
 * template"), e completar por dentro devolveria regra que alguém apagou.
 *
 * Não grava: completa na leitura, e o próximo Salvar persiste. Escrever no
 * meio de um GET é o tipo de efeito colateral que ninguém procura depois.
 */
function completarSecoesAusentes(documento: unknown, template: unknown): unknown {
  if (!documento || typeof documento !== "object" || Array.isArray(documento)) return documento;
  if (!template || typeof template !== "object" || Array.isArray(template)) return documento;

  const completo = { ...(documento as Record<string, unknown>) };
  for (const [chave, valor] of Object.entries(template as Record<string, unknown>)) {
    if (completo[chave] === undefined) completo[chave] = valor;
  }
  return completo;
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
      // §272 — o documento salvo entra completado com as seções que ele nem
      // tem. O template nunca precisa disso: ele É o padrão.
      const documento = normalizarNaLeitura(
        chave,
        salvo ? completarSecoesAusentes(salvo.documento, template) : template
      );

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
