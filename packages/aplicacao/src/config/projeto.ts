import type { CampoDoConector } from "./conectores.js";
import type { GovernancaDaFuncao } from "./funcoes.js";

/**
 * SPEC-107 fatia B — **o PROJETO como nó, nas duas direções.**
 *
 * A demanda (a mesa de projeto) vira capacidade com contrato, como conector,
 * agente e função — o mesmo molde (`CampoDoConector`), outro transporte: o
 * repositório de quebras. `demandaId` é só um PARÂMETRO do nó (§5.1); sem
 * ele, vale a demanda "ativa" — que o servidor não conhece (o aberto-agora é
 * estado do navegador), então o default honesto é a mais recentemente
 * atualizada DO TIME da execução, e o erro diz isso quando não há nenhuma.
 *
 * ## As duas direções num nó só (§5.1 — input/output universal)
 *
 * Sem `desenho` mapeado o nó é FONTE: emite o desenho e o que a demanda
 * carrega. Com `desenho` mapeado é DESTINO — e a escrita NUNCA toca o
 * desenho da demanda: ela vira uma VARIANTE ("Proposta do fluxo…"), a
 * mecânica da SPEC-88 que já existe para "um desenho guardado que ainda não
 * é O desenho". Adotar é decisão humana, na mesa, pela comparação de sempre
 * (§2.4-14: importar não é aceitar, e nenhuma fiação muda isso por baixo).
 *
 * ## O que cada saída é, dito em voz alta (§2.4-6)
 *
 * - `desenho` — o subconjunto que as funções leem (`DesenhoMapeado`): o
 *   diagrama mais o contexto que o botão da mesa passa ao derivar.
 * - `itens` — os itens GERADOS e persistidos (quem calcula é a derivação; uma
 *   demanda nunca derivada emite lista vazia).
 * - `markdown` — a última especificação GERADA (foto persistida, não
 *   montagem viva: o documento é montado pelo cliente com templates e
 *   contexto de produto — um segundo montador no servidor é o §263 de novo).
 *   Nunca gerada = o campo NÃO SAI, e quem o exigir à jusante barra (§9.3).
 * - `volumetria` — ausente quando a demanda não declarou volume (a régua da
 *   SPEC-70: ausência não vira `{}`).
 */
export interface ProjetoDoSistema {
  id: "projeto";
  nome: string;
  descricao: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  governanca: GovernancaDaFuncao;
}

export const REF_DO_PROJETO = "projeto";

export const PROJETO_DO_SISTEMA: ProjetoDoSistema = {
  id: "projeto",
  // SPEC-109 B — a decisão do §2.3 ("mesa é o nome da tela; o componente
  // chama-se Projeto") caiu pelo pedido literal do usuário: a mesa É "um
  // componente que possamos abrir e usar" — então o componente carrega o
  // nome que a pessoa conhece.
  nome: "Mesa de projeto",
  descricao:
    "A demanda como fonte (desenho, itens, documento, volumetria, necessidades) ou destino (o desenho mapeado vira proposta, para alguém adotar na mesa).",
  entrada: [
    { chave: "demandaId", rotulo: "Demanda (id — vazio = a mais recente do time)", tipo: "texto" },
    { chave: "desenho", rotulo: "Desenho proposto (vira variante da demanda)", tipo: "objeto" },
    // SPEC-107 G1 — o retorno do tracker, por item: grava exportado/link em
    // quem subiu; quem falhou fica nomeado (SPEC-49, falha parcial).
    { chave: "resultados", rotulo: "Resultados da exportação (por item)", tipo: "lista" },
    { chave: "enviados", rotulo: "Itens enviados (para nomear o silêncio)", tipo: "lista" },
    // SPEC-107 G2 — o link do documento publicado volta para a demanda
    // (SPEC-106 C: "última publicação ↗" sobrevive ao F5).
    { chave: "linkExterno", rotulo: "Link do documento publicado", tipo: "texto" },
  ],
  saida: [
    { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto" },
    { chave: "itens", rotulo: "Itens gerados (persistidos)", tipo: "lista" },
    { chave: "itensProntos", rotulo: "Itens PRONTOS para exportar (a régua da SPEC-49)", tipo: "lista" },
    { chave: "itensIgnorados", rotulo: "Chaves com pendência (fora da exportação)", tipo: "lista" },
    { chave: "exportados", rotulo: "Chaves gravadas como exportadas", tipo: "lista" },
    { chave: "erros", rotulo: "Falhas por item (chave + motivo)", tipo: "lista" },
    { chave: "markdown", rotulo: "Documento (última especificação gerada)", tipo: "documento" },
    { chave: "volumetria", rotulo: "Volumetria da demanda", tipo: "objeto" },
    { chave: "necessidades", rotulo: "Necessidades", tipo: "lista" },
    { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
    { chave: "titulo", rotulo: "Título da demanda", tipo: "texto" },
    { chave: "varianteId", rotulo: "Variante proposta (id)", tipo: "texto" },
  ],
  // A leitura roda no nível de quem executa o fluxo (`operar`); a ESCRITA da
  // proposta re-checa o nível no time da PRÓPRIA demanda, dentro do executor —
  // o gate da rota cobre o time do corpo, não o da quebra que o `demandaId`
  // apontar.
  governanca: { nivel: "operar", recurso: "fluxos.executar" },
};

/**
 * SPEC-110 fatia F (D10–D12) — **a demanda desdobrada em LER e GRAVAR.**
 *
 * O nó fundido decide a direção pelo que chega mapeado: sem `desenho`, é
 * fonte; com `desenho`, é destino. Funciona, e é ilegível no canvas — dois
 * cartões idênticos chamados "Mesa de projeto", um lendo e outro gravando, e a
 * única forma de saber qual é qual é seguir as arestas com o dedo (a queixa
 * M9). O desdobramento põe a direção no NOME do componente.
 *
 * ## O contrato declarado passa a dizer a verdade
 *
 * Medido antes de escrever: o executor já emitia `filaDaEsteira`,
 * `contextoEpico` e `contextoDoProduto`, e já aceitava `respostasItens` — e
 * NENHUM dos quatro estava declarado em `PROJETO_DO_SISTEMA`. A esteira de
 * fábrica mapeia os quatro. Ou seja: o contrato mentia, e a interface de
 * mapeamento não oferecia campos que a própria fábrica usa. Copiar o contrato
 * antigo ao desdobrar carregaria a mentira adiante; estes declaram o que o
 * executor faz.
 *
 * ## Por que dois registros e não um `direcao: "ler" | "gravar"`
 *
 * Porque o que muda entre os dois é o CONTRATO inteiro, não um atributo: as
 * saídas de leitura não existem na escrita e vice-versa. Um registro com
 * campos condicionais devolveria ao painel a mesma pergunta que o
 * desdobramento veio matar — *este nó, afinal, lê ou grava?*
 */
export interface DadoDoSistema {
  id: string;
  /** O rótulo do painel: a frase inteira, com a direção dita. */
  nome: string;
  /**
   * O rótulo do CARTÃO — curto, pela régua da fatia A: a frase inteira estica
   * o cartão e esconde o vizinho. E sem repetir a FAMÍLIA, que o cabeçalho do
   * cartão já diz: "DEMANDA / Ler", não "DEMANDA / Demanda — ler". É o mesmo
   * padrão do gatilho ("GATILHO / 🕐 Agendado").
   */
  rotuloCurto: string;
  descricao: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  governanca: GovernancaDaFuncao;
}

export const REF_DA_DEMANDA_LER = "demanda-ler";
export const REF_DA_DEMANDA_GRAVAR = "demanda-gravar";

export const DADOS_DO_SISTEMA: DadoDoSistema[] = [
  {
    id: REF_DA_DEMANDA_LER,
    nome: "Demanda — ler",
    rotuloCurto: "Ler",
    descricao:
      "Lê a demanda e emite o que ela carrega: desenho, itens, documento, volumetria, necessidades — e a fila da esteira com os contextos.",
    // `demandaId` é PARÂMETRO do nó (§5.1): vazio vale a demanda mais
    // recentemente atualizada do time da execução — o "aberto agora" é estado
    // do navegador, que o servidor não conhece.
    entrada: [{ chave: "demandaId", rotulo: "Demanda (id — vazio = a mais recente do time)", tipo: "texto" }],
    saida: [
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto" },
      { chave: "itens", rotulo: "Itens gerados (persistidos)", tipo: "lista" },
      { chave: "itensProntos", rotulo: "Itens PRONTOS para exportar (a régua da SPEC-49)", tipo: "lista" },
      { chave: "itensIgnorados", rotulo: "Chaves com pendência (fora da exportação)", tipo: "lista" },
      { chave: "markdown", rotulo: "Documento (última especificação gerada)", tipo: "documento" },
      { chave: "volumetria", rotulo: "Volumetria da demanda", tipo: "objeto" },
      { chave: "necessidades", rotulo: "Necessidades", tipo: "lista" },
      { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
      { chave: "titulo", rotulo: "Título da demanda", tipo: "texto" },
      // Os três que o executor sempre emitiu e o contrato nunca declarou.
      { chave: "filaDaEsteira", rotulo: "Fila da esteira (um item por vez)", tipo: "lista" },
      { chave: "contextoEpico", rotulo: "Contexto do épico", tipo: "texto" },
      { chave: "contextoDoProduto", rotulo: "Contexto do produto", tipo: "texto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
  {
    id: REF_DA_DEMANDA_GRAVAR,
    nome: "Demanda — gravar",
    rotuloCurto: "Gravar",
    descricao:
      "Grava na demanda o que a fiação trouxe: proposta de desenho (vira variante), retorno da exportação, link da publicação ou sugestões da esteira.",
    entrada: [
      { chave: "demandaId", rotulo: "Demanda (id — vazio = a mais recente do time)", tipo: "texto" },
      { chave: "desenho", rotulo: "Desenho proposto (vira variante da demanda)", tipo: "objeto" },
      { chave: "resultados", rotulo: "Resultados da exportação (por item)", tipo: "lista" },
      { chave: "enviados", rotulo: "Itens enviados (para nomear o silêncio)", tipo: "lista" },
      { chave: "linkExterno", rotulo: "Link do documento publicado", tipo: "texto" },
      // O quarto não declarado: a esteira grava por aqui desde a SPEC-107 G5.
      { chave: "respostasItens", rotulo: "Sugestões da esteira (por item)", tipo: "objeto" },
    ],
    saida: [
      { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
      { chave: "varianteId", rotulo: "Variante proposta (id)", tipo: "texto" },
      { chave: "titulo", rotulo: "Título da variante", tipo: "texto" },
      { chave: "exportados", rotulo: "Chaves gravadas como exportadas", tipo: "lista" },
      { chave: "erros", rotulo: "Falhas por item (chave + motivo)", tipo: "lista" },
      { chave: "linkExterno", rotulo: "Link gravado na demanda", tipo: "texto" },
      { chave: "aplicadas", rotulo: "Sugestões aplicadas", tipo: "lista" },
      { chave: "preservadas", rotulo: "Confirmações preservadas (não sobrescritas)", tipo: "lista" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
];

export function dadoDoSistema(refId: string): DadoDoSistema | undefined {
  return DADOS_DO_SISTEMA.find((d) => d.id === refId);
}

/**
 * A lista fechada dos refIds que um nó de dados aceita. `projeto` continua
 * dentro: fluxos SALVOS antes desta fatia o usam, e um refId que a escrita
 * recusa é um fluxo que ninguém consegue mais salvar — a demanda de alguém
 * ficaria trancada por uma decisão nossa de vocabulário.
 */
export const REFS_DE_DADOS = [REF_DO_PROJETO, REF_DA_DEMANDA_LER, REF_DA_DEMANDA_GRAVAR] as const;

/** O aviso do painel para quem abre um nó com o componente antigo. Não é erro:
 * o fluxo roda igual. É o convite a trocar, com o nome do que trocar por quê. */
export const AVISO_DO_PROJETO_LEGADO =
  "Componente antigo — este nó lê E grava conforme a fiação. Troque por “Demanda — ler” ou “Demanda — gravar” para o canvas dizer qual é qual.";
