import type {
  AnexoDeContexto,
  CenarioDeLentidao,
  Decisao,
  Diagrama,
  ArtefatosEscritos,
  ExcecaoDePadrao,
  LeituraDispensada,
  Necessidade,
  Percurso,
  StatusDocumento,
  ValorSpec,
  VolumetriaDaDemanda,
  Variante,
} from "@gerador/engine";

/**
 * SPEC-31 Fase 1 — a porta de Quebras.
 *
 * Existia uma implementação de quebra em `openApiLocal.ts` (arquivo) e outra em
 * `routes/quebras.ts` (Postgres), escritas separadamente. Escrever esta porta
 * expôs, antes de qualquer adaptador existir, que **as duas não guardavam a
 * mesma coisa**: o arquivo persiste `respostasItens`, `demandInfo` e
 * `anexosContexto`; a tabela `quebras` tinha seis colunas e descartava os três
 * em silêncio, no Zod da borda. Ou seja, no modo hospedado o trabalho da
 * esteira e o contexto do épico não sobreviviam ao salvar.
 *
 * A forma canônica aqui é a do produto — nove campos — e não a do schema que
 * estava mais pobre. Deixar o contrato mentir para caber no banco seria nascer
 * com a fronteira torta e manter o defeito.
 */

/** O que uma quebra É, independente de onde está guardada. */
export interface QuebraSalva {
  id: string;
  titulo: string | null;
  time: string | null;
  diagrama: Diagrama;
  /** Respostas dos placeholders por item (SPEC-23 Fase 1). */
  respostasItens: Record<string, Record<string, ValorSpec>>;
  /** Contexto do épico digitado à mão (SPEC-23 Fase 1b). */
  demandInfo: string;
  /**
   * Anexos colados junto do contexto do épico.
   *
   * SPEC-71 §4 — o NOME do arquivo faz parte do dado, e a porta dizia
   * `string[]`. O modelo sempre disse `{ nome, conteudo }[]`, a tela sempre
   * mostrou o nome, e a divergência não era cosmética: o Zod da borda,
   * escrito contra esta forma, recusava o corpo inteiro com 400 — qualquer
   * demanda com um anexo não salvava NADA, nem o anexo nem o diagrama.
   */
  anexosContexto: AnexoDeContexto[];
  /** SPEC-53 — de que PRODUTO é esta demanda (null = nenhum). Opcional de
   * propósito: quem já usa a ferramenta não passa a precisar cadastrar produto
   * pra fazer o que fazia. */
  produtoId?: string | null;
  /**
   * SPEC-87 (P5) — o regime declarado desta demanda.
   *
   * Aqui **e** em `DadosDaQuebra`, e não em uma só: a de leitura é o que volta
   * do banco, a de escrita é o que se manda. O §250 mediu o preço de acertar só
   * um dos lados — o campo salva e não volta, e o autosave grava o vazio por
   * cima do que estava lá.
   */
  modoDeOperacao?: string | null;
  /** SPEC-88 (P6) — as alternativas de desenho guardadas. */
  variantes?: Variante[];
  /** SPEC-57 fatia A — o propósito da demanda. Lista vazia = não declarou. */
  necessidades?: Necessidade[];
  /** §242 — as violações de padrão aceitas de propósito. */
  excecoes?: ExcecaoDePadrao[];
  /** SPEC-57 fatia C — as escolhas entre alternativas, com o porquê. */
  decisoes?: Decisao[];
  /** SPEC-57 fatia E — os caminhos CONFIRMADOS. A inferência não se guarda. */
  percursos?: Percurso[];
  /** SPEC-58 fatia 2 — o que a pessoa escreveu. SPEC-80 fatia A — um conjunto
   * de seções POR artefato, não mais um só. */
  artefatosEscritos?: ArtefatosEscritos;
  /** SPEC-58 fatia 3 — o estado do documento (null = nunca gerado). */
  documentoStatus?: StatusDocumento | null;
  /** SPEC-70 — o volume que a demanda atende. Ausente = nada se afirma. */
  volumetria?: VolumetriaDaDemanda;
  /** SPEC-65 fatia D — as leituras que o time mandou calar neste desenho. */
  leiturasDispensadas?: LeituraDispensada[];
  /** SPEC-66/68/69 — os ensaios desta demanda, com estado e débito assumido. */
  cenariosDeLentidao?: CenarioDeLentidao[];
  /** §184 — o markdown da especificação gerada (null = nunca gerada). */
  especificacao?: string | null;
  /** ISO-8601. Quem cria decide o valor — o relógio é do adaptador. */
  especificacaoGeradaEm?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Só os metadados — o que a tela de abrir quebra precisa, sem carregar diagrama. */
export type ResumoQuebra = Pick<QuebraSalva, "id" | "titulo" | "time" | "criadoEm" | "atualizadoEm">;

/** O que se manda ao criar/atualizar: tudo menos identidade e carimbos. */
export type DadosQuebra = Omit<QuebraSalva, "id" | "criadoEm" | "atualizadoEm">;

export interface RepositorioDeQuebras {
  /** Mais recentes primeiro — é a ordem que a tela espera, e ordenar é
   * responsabilidade de quem sabe indexar, não de quem chama. */
  listar(): Promise<ResumoQuebra[]>;
  /** `null` quando não existe. Ausência é resposta, não exceção. */
  obter(id: string): Promise<QuebraSalva | null>;
  criar(dados: DadosQuebra): Promise<QuebraSalva>;
  /** `null` quando o id não existe — nunca cria por acidente num PUT. */
  atualizar(id: string, dados: DadosQuebra): Promise<QuebraSalva | null>;
}

/**
 * Preenche o que o cliente omitiu. Existe porque os dois adaptadores recebiam
 * corpos parciais e cada um inventava o próprio default — o arquivo caía em
 * `{}`/`""`/`[]`, o Postgres em `undefined` e depois `null`. Um lugar só.
 */
export function normalizarDadosQuebra(bruto: Partial<DadosQuebra> | undefined): DadosQuebra {
  return {
    titulo: bruto?.titulo ?? null,
    time: bruto?.time ?? null,
    diagrama: bruto?.diagrama ?? ({ nodes: [], edges: [] } as unknown as Diagrama),
    respostasItens: bruto?.respostasItens ?? {},
    demandInfo: bruto?.demandInfo ?? "",
    anexosContexto: bruto?.anexosContexto ?? [],
    // §184 — sem esta linha a especificação morre aqui, do mesmo jeito que os
    // três campos da SPEC-31 morriam no Zod da borda.
    especificacao: bruto?.especificacao ?? null,
    // SPEC-53 — mesma lição da §184 e da SPEC-31: campo que não entra aqui
    // morre em silêncio no meio do caminho, e o defeito só aparece quando
    // alguém nota que o vínculo sumiu depois de salvar.
    produtoId: bruto?.produtoId ?? null,
    // SPEC-57 fatia A — a terceira vez que esta lição aparece neste arquivo
    // (§184, SPEC-53): campo que não entra na normalização morre em silêncio
    // entre a borda e o banco, e ninguém descobre até salvar e perder.
    necessidades: bruto?.necessidades ?? [],
    excecoes: bruto?.excecoes ?? [],
    decisoes: bruto?.decisoes ?? [],
    percursos: bruto?.percursos ?? [],
    artefatosEscritos: bruto?.artefatosEscritos ?? {},
    documentoStatus: bruto?.documentoStatus ?? null,
    // SPEC-71 — a QUARTA e a QUINTA vez que esta lição aparece neste arquivo.
    // Os comentários acima já a escreveram três vezes (§184, SPEC-53,
    // SPEC-57), e mesmo assim três campos novos passaram direto. Por isso a
    // rodada que os trouxe também trouxe o teste que falha quando o próximo
    // for esquecido: repetir o aviso não bastou.
    volumetria: bruto?.volumetria,
    modoDeOperacao: bruto?.modoDeOperacao,
    variantes: bruto?.variantes,
    leiturasDispensadas: bruto?.leiturasDispensadas ?? [],
    cenariosDeLentidao: bruto?.cenariosDeLentidao ?? [],
  };
}
