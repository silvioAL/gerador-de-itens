/**
 * SPEC-53 Fase 1 — a porta do PRODUTO.
 *
 * O conceito é "o que este produto é", em seis seções escolhidas por quanto
 * mudam a escrita de um item. Entidade própria, não campo do time: um time
 * atende vários produtos e um produto atravessa times (a lição da SPEC-42,
 * quando "time" e "stack" estavam misturados).
 *
 * Não confundir com o `produto` que o §21 removeu: aquele era um TEXTO solto
 * na quebra, escrito em quatro pontos e nunca lido por ninguém. Este existe
 * para ser lido — pelo prompt dos agentes, pelo documento e pela tela.
 */

/** Termo do domínio e o que ele quer dizer NESTA casa. A única seção
 * estruturada: é a que mais muda a escrita, e estrutura aqui paga. */
export interface TermoDeGlossario {
  id: string;
  termo: string;
  definicao: string;
  ordem: number;
}

export interface Produto {
  id: string;
  organizacaoId: string;
  nome: string;
  /** O que é e para que serve — sem isso, o agente inventa a razão de ser. */
  objetivo: string;
  /** Personas e o que cada uma quer. */
  quemUsa: string;
  /** As que valem sempre, não as desta demanda. */
  regrasDeNegocio: string;
  /** Com quem este produto conversa, e para quê. */
  sistemas: string;
  /** Regulatório, compliance, contratos — o que não se negocia. */
  restricoes: string;
  glossario: TermoDeGlossario[];
  /** Os times que trabalham neste produto (N:N). */
  timeIds: string[];
  criadoPor: string;
  atualizadoEm: string;
}

/** O que se pode editar — `nome` incluso; id, organização e autoria, não. */
export type DadosDoProduto = Pick<
  Produto,
  "nome" | "objetivo" | "quemUsa" | "regrasDeNegocio" | "sistemas" | "restricoes"
>;

export interface RepositorioDeProdutos {
  listar(organizacaoId: string): Promise<Produto[]>;
  obter(id: string): Promise<Produto | null>;
  criar(organizacaoId: string, nome: string, criadoPor: string): Promise<Produto>;
  atualizar(id: string, dados: Partial<DadosDoProduto>): Promise<Produto | null>;
  excluir(id: string): Promise<boolean>;
  /** Substitui a lista inteira de times do produto — vínculo é conjunto, não
   * sequência de eventos, e mandar o conjunto evita o par add/remove. */
  definirTimes(id: string, timeIds: string[]): Promise<Produto | null>;
  salvarTermo(produtoId: string, termo: string, definicao: string): Promise<TermoDeGlossario>;
  excluirTermo(termoId: string): Promise<boolean>;
}

/**
 * Os produtos que interessam a um time — o que a tela da demanda oferece.
 *
 * Produto SEM time nenhum aparece para todos, de propósito: é o estado em que
 * ele nasce, e some da tela de quem acabou de criá-lo seria o pior primeiro
 * minuto possível. Amarrar times é o que RESTRINGE, não o que habilita.
 */
export function produtosDoTime(produtos: Produto[], timeId?: string): Produto[] {
  if (!timeId) return produtos;
  return produtos.filter((p) => p.timeIds.length === 0 || p.timeIds.includes(timeId));
}

/** A forma MÍNIMA que virar texto exige — nem id, nem organização, nem times.
 * É o que deixa a web (que tem seu próprio tipo `Produto`, sem os campos de
 * persistência) usar a mesma função do servidor, em vez de escrever uma
 * segunda versão que combina por enquanto. */
export type ProdutoComContexto = Omit<Produto, "id" | "organizacaoId" | "timeIds" | "criadoPor" | "atualizadoEm">;

/**
 * O contexto do produto em texto, para entrar no prompt e no documento
 * (SPEC-53 Fase 2). Seção vazia não vira título órfão — a mesma régua do
 * template do item (SPEC-47).
 *
 * `limiteDeTermos` corta o glossário pelos primeiros: a janela do modelo é
 * finita e um glossário de 300 termos empurraria para fora justamente o que
 * vem depois dele no prompt. Cortar em silêncio seria pior, então o texto diz
 * quantos ficaram de fora.
 */
export function contextoDoProdutoEmTexto(produto: ProdutoComContexto, limiteDeTermos = 40): string {
  const secoes: string[] = [`## Produto: ${produto.nome}`];
  const adicionar = (titulo: string, corpo: string) => {
    if (corpo.trim()) secoes.push(`### ${titulo}\n${corpo.trim()}`);
  };

  adicionar("O que é", produto.objetivo);
  adicionar("Quem usa", produto.quemUsa);
  adicionar("Regras de negócio que valem sempre", produto.regrasDeNegocio);
  adicionar("Sistemas e integrações", produto.sistemas);
  adicionar("Restrições", produto.restricoes);

  if (produto.glossario.length > 0) {
    const mostrados = produto.glossario.slice(0, limiteDeTermos);
    const linhas = mostrados.map((t) => `- **${t.termo}**: ${t.definicao}`);
    if (produto.glossario.length > mostrados.length) {
      linhas.push(`- (mais ${produto.glossario.length - mostrados.length} termo(s) no glossário do produto)`);
    }
    secoes.push(`### Glossário\n${linhas.join("\n")}`);
  }

  // Só o nome não é contexto: devolver o cabeçalho sozinho faria o prompt
  // carregar um bloco que não ensina nada.
  return secoes.length === 1 ? "" : secoes.join("\n\n");
}
