import type { ChaveConfig } from "../portas/repositorioDeConfig.js";

/**
 * SPEC-31 Fase 3 — o diagnóstico de config velha (JOURNEY §108).
 *
 * O caso real: um `config/regras.json` da v0.1.14 ou anterior, com **zero**
 * entradas de `checklistTecnico` e doze de `testes`, de quando `checklistTecnico`
 * nem existia como conceito. O Especialista técnico rodava, não achava regra
 * nenhuma para a tech × contexto do item, e não escrevia nada. A ferramenta se
 * comportava exatamente como mandava — *"corretamente nunca sobrescreve e
 * incorretamente nunca comenta"*.
 *
 * Isto é o comentário. Nada aqui sobrescreve config de ninguém: compara a que
 * está em uso com o template que ESTA versão traz e diz, em números, o que a
 * sua não tem. Puro: recebe os dois documentos, devolve o veredito.
 */

/** Contagens comparáveis de um documento de config. Chaves iguais nos dois
 * lados da comparação — é o que permite o diagnóstico ser genérico. */
export type ResumoConfig = Record<string, number>;

export interface SecaoVazia {
  secao: string;
  /** Quantas entradas o template desta versão traz. */
  noTemplate: number;
}

export interface DiagnosticoConfig {
  chave: ChaveConfig;
  atual: ResumoConfig;
  template: ResumoConfig;
  /** Seções que o template preenche e a config em uso deixa em zero. */
  secoesVazias: SecaoVazia[];
  /** `true` quando há pelo menos uma seção vazia — o sinal para a UI avisar. */
  possivelmenteDesatualizada: boolean;
  /** Frase pronta, em português, para quem só quer saber o que fazer. */
  mensagem: string | null;
}

type RegrasPorTech = Record<string, Record<string, unknown[]>>;

/** As quatro listas que uma entrada de `porTech` pode ter. Fixas de propósito:
 * uma seção que some do template é informação — não deve sumir do resumo. */
const SECOES_DE_REGRAS = ["checklistTecnico", "checklistProcesso", "testes", "volumetria"] as const;

function contarRegras(documento: unknown): ResumoConfig {
  const porTech = (documento as { porTech?: RegrasPorTech } | null)?.porTech ?? {};
  const resumo: ResumoConfig = { techs: Object.keys(porTech).length };

  for (const secao of SECOES_DE_REGRAS) {
    resumo[secao] = Object.values(porTech).reduce((total, regrasDaTech) => {
      const lista = (regrasDaTech as Record<string, unknown>)?.[secao];
      return total + (Array.isArray(lista) ? lista.length : 0);
    }, 0);
  }
  return resumo;
}

function contarPipeline(documento: unknown): ResumoConfig {
  const papeis = (documento as { papeis?: unknown[] } | null)?.papeis;
  const lista = Array.isArray(papeis) ? papeis : [];
  return {
    papeis: lista.length,
    papeisAtivos: lista.filter((p) => (p as { ativo?: boolean })?.ativo !== false).length,
  };
}

/** O resumo comparável de um documento, por chave. */
export function resumirConfig(chave: ChaveConfig, documento: unknown): ResumoConfig {
  switch (chave) {
    case "regras":
      return contarRegras(documento);
    case "pipeline-agentes":
      return contarPipeline(documento);
    // SPEC-49 — o exportador não tem "seções que a versão assume existir": o
    // único número é "tem destino ou não". Como o template padrão vem com
    // endpoint vazio (0), o diagnóstico nunca acusa — que é o certo, porque
    // não configurar exportação é escolha, não desatualização.
    case "exportador":
      return { destino: typeof (documento as { endpoint?: string })?.endpoint === "string" && (documento as { endpoint: string }).endpoint.trim() ? 1 : 0 };
  }
}

const NOME_AMIGAVEL: Record<string, string> = {
  checklistTecnico: "checklist técnico",
  checklistProcesso: "checklist de processo",
  testes: "regras de teste",
  volumetria: "volumetria",
  techs: "tecnologias",
  papeis: "papéis da esteira",
  papeisAtivos: "papéis ativos",
  caracteres: "conteúdo",
  destino: "destino de exportação",
};

/**
 * Compara a config em uso com o template desta versão.
 *
 * Só acusa **seção vazia** — o template tem, a sua tem zero. Não acusa "a sua
 * tem menos que o template": config enxuta é escolha legítima de time, e
 * transformar escolha em alerta ensina a ignorar alertas. Zero contra
 * não-zero é outra coisa: é uma seção que a versão inteira assume existir.
 */
export function diagnosticarConfig(chave: ChaveConfig, emUso: unknown, template: unknown): DiagnosticoConfig {
  const atual = resumirConfig(chave, emUso);
  const doTemplate = resumirConfig(chave, template);

  const secoesVazias: SecaoVazia[] = Object.entries(doTemplate)
    .filter(([secao, quantidade]) => quantidade > 0 && (atual[secao] ?? 0) === 0)
    .map(([secao, quantidade]) => ({ secao, noTemplate: quantidade }));

  const mensagem =
    secoesVazias.length === 0
      ? null
      : `A sua configuração de "${chave}" não tem nenhuma entrada de ` +
        `${secoesVazias.map((s) => `${NOME_AMIGAVEL[s.secao] ?? s.secao} (${s.noTemplate} no padrão desta versão)`).join(", ")}. ` +
        `Isso costuma indicar um arquivo de uma versão anterior: a ferramenta nunca sobrescreve o que você editou, ` +
        `então uma seção criada depois do seu arquivo fica vazia para sempre e o agente que depende dela não escreve nada.`;

  return {
    chave,
    atual,
    template: doTemplate,
    secoesVazias,
    possivelmenteDesatualizada: secoesVazias.length > 0,
    mensagem,
  };
}
