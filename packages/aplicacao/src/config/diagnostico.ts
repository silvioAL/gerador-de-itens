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

  // §244 — o padrão CONFERÍVEL (SPEC-57 fatia B) é um atributo do requisito,
  // não uma seção nova. O diagnóstico contava entradas por seção, então uma
  // config anterior à fatia B tinha `checklistTecnico` cheio e **zero**
  // requisitos com `checagem` — e nada apontava. A capacidade nascia dormente
  // em toda instalação existente, que é exatamente o defeito que este
  // mecanismo (§108) foi criado para não deixar acontecer em silêncio.
  resumo.requisitosConferiveis = Object.values(porTech).reduce((total, regrasDaTech) => {
    const lista = (regrasDaTech as Record<string, unknown>)?.checklistTecnico;
    if (!Array.isArray(lista)) return total;
    return total + lista.filter((r) => (r as { checagem?: unknown })?.checagem).length;
  }, 0);

  // SPEC-57 fatia E — a régua de PERCURSO é uma lista NOVA no topo de
  // `regras`, e a lição do §244 é literal aqui: acrescentá-la ao template não
  // entrega nada, porque o documento vive no banco desde a SPEC-36 e
  // instalação existente nunca relê o arquivo. Ou o diagnóstico conta, ou a
  // fatia nasce morta em 100% das instalações. Contada de primeira desta vez.
  const percursos = (documento as { percursos?: unknown[] } | null)?.percursos;
  resumo.regrasDePercurso = Array.isArray(percursos) ? percursos.length : 0;

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
    /**
     * SPEC-79 fatia A — os tokens, contados.
     *
     * O diagnóstico compara o documento do time com o template da versão para
     * dizer *"a versão nova traz seções que você não tem"*. Aqui o template vem
     * VAZIO de propósito (ver `templateDaVersao`), então este número nunca acusa
     * desatualização — como no exportador, e pelo mesmo motivo: **não ter design
     * system configurado é escolha, não atraso.**
     */
    case "tokens":
      return { tokens: Array.isArray((documento as { tokens?: unknown[] })?.tokens) ? (documento as { tokens: unknown[] }).tokens.length : 0 };
  }
}

const NOME_AMIGAVEL: Record<string, string> = {
  checklistTecnico: "checklist técnico",
  checklistProcesso: "checklist de processo",
  testes: "regras de teste",
  volumetria: "volumetria",
  requisitosConferiveis: "padrão conferível (a régua que o motor avalia sozinho)",
  regrasDePercurso: "régua de percurso (a que mede o CAMINHO, não o nó)",
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
