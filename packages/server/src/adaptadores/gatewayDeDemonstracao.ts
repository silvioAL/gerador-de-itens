import type {
  AnexadorDeSpec,
  DestinoResolvido,
  ExportadorDeItens,
  ItemGeradoSalvo,
  PedidoDeAnexoDeSpec,
} from "@gerador/aplicacao";

/**
 * SPEC-115 fatia D — **o destino que não chama ninguém.**
 *
 * > *"eu não tenho o endpoint de subidas dos itens acessível ainda aqui, mas
 * > precisamos de tela e experiências prontos, usar algum mock com delay de 20
 * > segundos."*
 *
 * ## O precedente, e por que ele é o desenho certo
 *
 * O produto já tem duas peças que simulam o outro lado de uma integração: o
 * "modo sem custo" da SPEC-74 (um DESTINO de IA que responde com a forma certa
 * e conteúdo falso) e o `packages/gateway-falso`. A regra que as duas seguem é
 * a mesma, e é a que vale aqui: **o dublê é uma configuração, não um segundo
 * caminho no código.** Por isso isto é uma flag em `DestinoDoGateway`
 * (SPEC-115 §4.2, respondida pelo usuário) e não uma `operacao` nova — a rota,
 * a tela e o caso de uso são exatamente os mesmos.
 *
 * ## O que ele RECUSA
 *
 * Passar-se pelo comportamento real. Um destino de demonstração aparece
 * marcado na tela de configuração, e a resposta da rota carrega
 * `demonstracao: true` até o documento — a mesma disciplina que faz o texto do
 * modo sem custo chegar marcado no documento em vez de virar
 * "olha o que a IA respondeu".
 *
 * ## Por que o atraso é POR ITEM
 *
 * Porque é o que torna o pipeline da SPEC-98 §3.2 visível: com um atraso único
 * para o lote inteiro, os N itens acendem juntos no fim e a tela não tem o que
 * mostrar no meio — exatamente a "fase" que aquela SPEC recusou em favor de
 * "item a item, com as duas etapas encadeadas". Com atraso por item, o
 * primeiro resultado aparece cedo e a tela mostra em QUAL item está.
 */
export const ATRASO_DA_DEMONSTRACAO_MS = 20_000;

/**
 * Injetável para o teste não esperar 20s de verdade — e é a única razão de ele
 * existir. Um teste que dorme o tempo do produto não testa o produto: testa a
 * paciência de quem roda a suíte.
 */
export interface OpcoesDaDemonstracao {
  atrasoMs?: number;
  dormir?: (ms: number) => Promise<void>;
}

function dormirDeVerdade(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * O endereço que volta é **impossível de resolver, de propósito**: `.invalid` é
 * o TLD reservado que nunca aponta para lugar nenhum (RFC 2606). Um link de
 * mentira que abre alguma coisa é pior que um que não abre — o que não abre
 * confessa o que é no primeiro clique.
 */
function linkDeDemonstracao(chave: string): string {
  return `https://demonstracao.invalid/${encodeURIComponent(chave)}`;
}

/**
 * SPEC-115 fatia D — a segunda chamada, sem a segunda chamada.
 *
 * Sucesso **determinístico**: todo item entra. Um dublê que falha às vezes
 * pareceria mais "realista" e seria pior — a demonstração deixaria de provar a
 * coisa que ela existe para provar (a tela e a experiência prontas), e quem
 * assistisse não saberia se o erro é do dublê ou do produto. Falha de verdade
 * continua sendo assunto do destino de verdade, que já a trata item a item.
 */
export function criarAnexadorDeSpecDeDemonstracao(
  destino: DestinoResolvido,
  { atrasoMs = ATRASO_DA_DEMONSTRACAO_MS, dormir = dormirDeVerdade }: OpcoesDaDemonstracao = {}
): AnexadorDeSpec {
  return {
    async anexar(pedidos: PedidoDeAnexoDeSpec[]) {
      const resultados: { chave: string }[] = [];
      for (const pedido of pedidos) {
        // Sequencial, e não `Promise.all`: o pipeline do §3.2 é item a item, e
        // é isso que faz a tela ter o que mostrar enquanto espera. Paralelo
        // aqui devolveria tudo junto — o arranjo que a SPEC-98 chamou de "o
        // pior possível com um agente lento".
        await dormir(atrasoMs);
        resultados.push({ chave: pedido.chave });
      }
      // O destino não é usado para nada além de existir — e é isso que ele
      // prova: o caminho é o mesmo, só o outro lado é que não está lá.
      void destino;
      return resultados;
    },
  };
}

/**
 * SPEC-115 fatia D — a PRIMEIRA chamada (subir a história), sem tracker.
 *
 * Existe porque o pipeline começa nela: sem item com `linkExterno`, não há o
 * que anexar, e a fatia E não teria o que mostrar. O link é derivado da
 * `chave`, que é estável entre regenerações (SPEC-41) — reexportar a mesma
 * demanda na demonstração devolve o mesmo endereço, como um tracker devolveria.
 */
export function criarExportadorDeItensDeDemonstracao(
  destino: DestinoResolvido,
  { atrasoMs = ATRASO_DA_DEMONSTRACAO_MS, dormir = dormirDeVerdade }: OpcoesDaDemonstracao = {}
): ExportadorDeItens {
  return {
    async exportar(itens: ItemGeradoSalvo[]) {
      const resultados: { chave: string; linkExterno: string }[] = [];
      for (const item of itens) {
        await dormir(atrasoMs);
        resultados.push({ chave: item.chave, linkExterno: linkDeDemonstracao(item.chave) });
      }
      void destino;
      return resultados;
    },
  };
}
