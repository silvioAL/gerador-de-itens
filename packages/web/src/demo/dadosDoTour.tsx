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

/** A conversa que "produziu" o desenho que o tour já tem na mesa. */
export const CONVERSA_DO_TOUR: {
  autor: "voce" | "agente";
  texto: string;
  proposta?: DiagramaProposto;
}[] = [
  {
    autor: "voce",
    texto:
      "Preciso de um serviço de catálogo de produtos, otimizado para leitura, guardando os dados numa coleção nova.",
  },
  {
    autor: "agente",
    texto:
      "Proponho dois componentes: um serviço que expõe o catálogo por API e uma coleção Mongo para os produtos. O serviço escreve na coleção.",
    proposta: {
      nos: [
        { id: "n1", tipo: "service", rotulo: "srv-catalogo", motivo: "Expõe o catálogo por API versionada." },
        { id: "n2", tipo: "mongo", rotulo: "produtos", motivo: "Guarda o catálogo, otimizado para leitura." },
      ],
      arestas: [{ de: "n1", para: "n2", tipo: "writes", motivo: "O serviço mantém o catálogo atualizado." }],
    },
  },
];

export const EXPORTADOR_DO_TOUR: ConfigExportador = {
  endpoint: "https://agente-do-tracker.exemplo/itens",
  rotulo: "Jira do time (exemplo)",
  cabecalhos: {},
};

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
