import type { Decisao, RegrasConfig, Token } from "@gerador/engine";
import type { ConfigExportador, Produto } from "../api/client";
import type { DiagramaProposto } from "../api/client";

/**
 * Dados EXCLUSIVOS do tour/demonstração (autorizados pelo usuário, §235).
 *
 * Por que existem: três passos do tour mostram telas que leem do servidor —
 * produto, conversa e exportação. Numa instalação nova elas estão vazias, e um
 * passo que promete conteúdo sobre uma tela vazia é a mentira que o §234
 * acabou de custar caro. Semear via API seria pior: o tour passaria a
 * ESCREVER na configuração de quem só quis ver a ferramenta.
 *
 * A regra que mantém isso honesto: **onde entra dado de demonstração, entra a
 * marca**. Ninguém pode sair do tour achando que configurou alguma coisa.
 */

export const PRODUTO_DO_TOUR: Produto = {
  id: "produto-do-tour",
  nome: "Catálogo (exemplo)",
  objetivo: "Manter o catálogo de produtos que a vitrine e o app consomem.",
  quemUsa: "Times de vitrine, busca e app.",
  regrasDeNegocio: "Produto fora de linha não pode aparecer em vitrine.",
  sistemas: "srv-catalogo + coleção Mongo `produtos`.",
  restricoes: "O catálogo é lido muito mais do que escrito.",
  glossario: [
    { id: "g1", ordem: 0, termo: "SKU", definicao: "O identificador único de uma variação vendável." },
    { id: "g2", ordem: 1, termo: "Fora de linha", definicao: "Produto que não é mais reposto, mas ainda tem histórico." },
  ],
  timeIds: [],
  criadoPor: "demonstração",
  atualizadoEm: "2026-01-01T00:00:00.000Z",
};

/**
 * SPEC-89 fatia C — a `CONVERSA_DO_TOUR` foi embora daqui.
 *
 * Era uma transcrição escrita à mão, com a proposta de diagrama inventada, e o
 * passo do tour afirmava que o desenho na mesa *"nasceu da conversa ao lado"*.
 * Nada nascia de nada — e o passo final convidava a pessoa a digitar, o que numa
 * instalação sem credencial devolvia 503.
 *
 * Com o dublê declarado (SPEC-89 fatia A), a conversa roda de verdade. O que
 * fica aqui é só o que **não tem como** vir do produto numa instalação nova: o
 * produto de exemplo, as regras e as decisões, que precisariam ser escritas por
 * alguém antes de existirem.
 */

/**
 * §235 — os tokens do TOUR. Dado exclusivo da demonstração, como os vizinhos:
 * semear via API faria o tour ESCREVER no design system de quem só quis ver.
 */
export const TOKENS_DO_TOUR: Token[] = [
  { nome: "cor.texto.padrao", valor: "#0f172a", valorEscuro: "#e5e7eb", grupo: "cor" },
  { nome: "cor.fundo.painel", valor: "var(--branco)", valorEscuro: "#0f172a", grupo: "cor" },
  { nome: "cor.marca", valor: "var(--acento-gente)", grupo: "cor" },
  { nome: "espaco.2", valor: "8px", grupo: "espaco" },
  { nome: "raio.md", valor: "10px", grupo: "raio" },
];

export const EXPORTADOR_DO_TOUR: ConfigExportador = {
  endpoint: "https://agente-do-tracker.exemplo/itens",
  rotulo: "Jira do time (exemplo)",
  cabecalhos: {},
};

/**
 * §245 — o PADRÃO do time, para o tour. Sem isto a dimensão de conformidade
 * não aparecia na demonstração: ela depende de `regras` com `checagem`, e a
 * config de quem está vendo raramente tem uma (foi exatamente o que o §244
 * descobriu no banco do usuário).
 *
 * A regra escolhida não distorce o cenário: o nó Mongo do tour não declara
 * chave de sharding, e a violação nasce do que já está desenhado. Demonstração
 * que precisa piorar o exemplo para ter o que mostrar demonstra o exemplo, não
 * a ferramenta.
 */
export const REGRAS_DO_TOUR: RegrasConfig = {
  tipos: ["História", "Task", "Débito Técnico"],
  tamanhos: ["PP", "P", "M", "G"],
  porTech: {
    Backend: {
      checklistTecnico: [
        {
          texto: "Declarar a chave de sharding da coleção",
          contextos: ["Backend-dados"],
          porque:
            "Coleção que cresce sem chave declarada vira migração de madrugada — foi o que aconteceu com o catálogo.",
          checagem: { campo: "chaveDeSharding", operador: "preenchido" },
        },
      ],
      testes: [],
    },
  },
};

/**
 * §246 — as DECISÕES do tour: a fatia C mostrada funcionando.
 *
 * Duas, de propósito, porque elas ensinam coisas diferentes:
 *
 * 1. uma **aceita**, com a alternativa descartada e o custo dela — é o que
 *    separa um ADR de um campo "observação". Quem lê daqui a um ano descobre
 *    não só o que foi feito, mas o que já foi rejeitado e por quê;
 * 2. uma **proposta pelo agente**, ainda esperando alguém. É a regra 2 da
 *    SPEC-57 na tela: o agente propõe, o motor mede, a pessoa decide. Sem uma
 *    proposta pendente à vista, essa regra vira parágrafo de documentação.
 *
 * Ancoradas nos nós que o cenário do tour já tem (`n1` srv-catálogo, `n2`
 * mongo) — mesma disciplina do REGRAS_DO_TOUR: a demonstração não inventa
 * desenho para ter o que mostrar.
 */
/** Prefixo dos ids de decisão de demonstração. É por ele que a tela sabe que
 * uma decisão é do tour — e não pode ser aceita, porque o aceite grava na
 * quebra e ela não vive lá (§253). */
/**
 * SPEC-92 — **as execuções que o tour mostra, e por que elas não são as suas.**
 *
 * O mapa do sistema mostra a última execução de cada papel lendo o histórico
 * REAL, por decisão escrita: *"esta tela responde 'como o meu ambiente está
 * montado'"*. Está certo fora do tour.
 *
 * Dentro do tour, não. O usuário abriu a demonstração com a credencial da casa
 * sem crédito e viu os quatro papéis em vermelho, com o erro cru do provedor —
 * *"Your credit balance is too low to access the Anthropic API"*. Quem assiste
 * conclui que a ferramenta está quebrada, quando ela está relatando com precisão
 * um problema que não é dela.
 *
 * Estas execuções chegam **marcadas** pela mesma `MarcaDeDemonstracao` do resto
 * do tour (§235): não é a tela mentindo, é a tela dizendo em voz alta que aquilo
 * é exemplo — como já faz com o produto, a conversa e a exportação.
 *
 * As durações são diferentes de propósito: quatro números iguais parecem
 * inventados, porque seriam.
 */
export const EXECUCOES_DO_TOUR = [
  { papel: "po", ok: true, em: "2026-01-01T09:00:00.000Z", duracaoMs: 2400 },
  { papel: "arquiteto", ok: true, em: "2026-01-01T09:00:03.000Z", duracaoMs: 3100 },
  { papel: "especialista", ok: true, em: "2026-01-01T09:00:07.000Z", duracaoMs: 1900 },
  { papel: "qa", ok: true, em: "2026-01-01T09:00:10.000Z", duracaoMs: 2200 },
];

export const PREFIXO_DECISAO_DO_TOUR = "decisao-do-tour-";

export function ehDecisaoDeDemonstracao(id: string): boolean {
  return id.startsWith(PREFIXO_DECISAO_DO_TOUR);
}

export const DECISOES_DO_TOUR: Decisao[] = [
  {
    id: "decisao-do-tour-1",
    noId: "n2",
    titulo: "Mongo em vez de Postgres para o catálogo",
    contexto: "O catálogo é lido muito mais do que escrito, e o formato do produto muda por categoria.",
    alternativas: [
      { titulo: "Mongo" },
      {
        titulo: "Postgres com JSONB",
        consequencia: "resolveria hoje, mas o time não tem quem opere o índice GIN quando ele degradar",
      },
    ],
    escolhida: "Mongo",
    porque: "O custo aqui é operacional, não de modelagem: é a stack que o time já sabe operar de madrugada.",
    status: "aceita",
    origem: "manual",
    autor: "exemplo@demonstracao",
    em: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "decisao-do-tour-2",
    noId: "n1",
    titulo: "Cache de leitura no serviço de catálogo",
    contexto: "A vitrine lê o catálogo inteiro a cada render.",
    alternativas: [
      { titulo: "Cache em memória com TTL curto" },
      { titulo: "Sem cache", consequencia: "cada render da vitrine vira uma consulta ao Mongo" },
    ],
    escolhida: "Cache em memória com TTL curto",
    porque: "",
    status: "proposta",
    origem: "sugerido",
    autor: "agente",
    em: "2026-08-02T10:00:00.000Z",
  },
];

/**
 * A marca. Pequena e sempre no topo do que ela qualifica — a pessoa precisa
 * ver antes de ler o conteúdo, não depois.
 */
export function MarcaDeDemonstracao({ texto }: { texto?: string }) {
  return (
    <p
      data-testid="marca-demonstracao"
      style={{
        margin: "0 0 10px",
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px dashed var(--borda-forte)",
        color: "var(--texto-fraco)",
        fontSize: 11,
      }}
    >
      ✦ {texto ?? "Dados de demonstração — nada aqui está salvo na sua configuração."}
    </p>
  );
}
