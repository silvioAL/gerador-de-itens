/**
 * SPEC-95 fatias A e B — **o site em páginas, como DADO.**
 *
 * ## O que mudou em relação ao `demo/atos.ts` (§341)
 *
 * A rodada anterior leu *"está ficando longa"* como excesso numa página só, e
 * respondeu com âncoras internas. O usuário corrigiu: ele queria **mais
 * páginas, com menu próprio**. A diferença é de arquitetura —
 *
 * | | Âncora (`#o-ciclo`) | Página (`#/site/o-ciclo`) |
 * |---|---|---|
 * | endereço | rola dentro de um documento | **é um destino** |
 * | carga | traz a página inteira junto | traz o assunto |
 * | crescer | a página fica mais longa | **nasce outra página** |
 *
 * — e a última linha é a que importa: com âncoras, todo conteúdo novo piora o
 * problema relatado. Com páginas, resolve.
 *
 * O `atos.ts` não foi jogado fora: **este arquivo é ele**, com `rota` no lugar
 * de âncora e um `resumo` que a capa usa para apresentar cada página.
 *
 * ## Por que o espaço público NÃO entra no tipo `Rota`
 *
 * `Rota` descreve as telas de dentro, e `rotaDoHash` manda tudo que não conhece
 * para o `canvas`. O site não é uma tela do app: ele é público, é renderizado
 * antes de qualquer sessão, e some quando a pessoa entra.
 *
 * Misturá-los faria `Rota` significar duas coisas. Separados, a regra é simples
 * — **tudo sob `#/site` é público** — e a trava tem o que verificar: nenhum
 * segmento daqui pode colidir com um segmento do app.
 */

/** O prefixo que define o espaço público. Uma regra, em vez de uma lista de
 *  exceções que alguém esquece de atualizar. */
export const PREFIXO_DO_SITE = "#/site";

export interface PaginaDoSite {
  /** O segmento da URL: `#/site/<id>`. A capa tem `id` vazio. */
  id: string;
  /** O rótulo no menu. Curto — cinco cabem numa barra, e isso foi medido. */
  nome: string;
  /** A pergunta que a página responde. Vira o chapéu, e substitui prosa. */
  pergunta: string;
  /** Uma linha, para a capa apresentar a página sem repetir a pergunta. */
  resumo: string;
}

/**
 * As cinco páginas do menu.
 *
 * **Cinco, e não as nove que a SPEC-95 §2.1 listou.** O motivo é medido: a barra
 * de cinco itens já rola em 360 px (§341), e a SPEC-95 §7.3 registrou que nove
 * não caberiam. As técnicas foram agrupadas numa só — *"Arquitetura"* carrega
 * também segurança e determinismo —, e `o-metodo` e `a-maturidade` ficaram de
 * fora porque dependem da SPEC-94, que não está implementada. Prometer um item
 * de menu para conteúdo que não existe seria a versão de navegação da promessa
 * falsa que a SPEC-76 impede.
 */
export const PAGINAS: PaginaDoSite[] = [
  {
    id: "o-problema",
    nome: "O problema",
    pergunta: "Por que a IA que a gente já usa não resolveu isso?",
    resumo: "Agentes e assistentes não resolveram: falta onde a regra da empresa mora.",
  },
  {
    id: "o-conceito",
    nome: "O conceito",
    pergunta: "Onde a camada perene fica guardada, e que informação ela precisa ter?",
    resumo: "Quatro camadas, a divisão entre motor e IA, e a contenção que é a tese.",
  },
  {
    id: "o-ciclo",
    nome: "O ciclo",
    pergunta: "Como eu construo isso, e que processos preciso ter?",
    resumo: "Treze estágios, do que é perene até o aprendizado que volta e muda as regras.",
  },
  {
    id: "o-percurso",
    nome: "O percurso",
    pergunta: "E quando eu preciso falar com o que a empresa já tem?",
    resumo: "A jornada em raias, e os caminhos que entram e saem — com o que falta marcado.",
  },
  {
    id: "arquitetura",
    nome: "Arquitetura",
    pergunta: "Isto funciona como diz? O que roda onde, e o que prova?",
    resumo: "Determinismo, portas e adaptadores, segurança — e o teste que sustenta cada afirmação.",
  },
];

/** A capa. Fora de `PAGINAS` porque não é item de menu: quem chega já está
 *  nela, e um item que aponta para o topo nunca é clicado por quem precisa
 *  navegar (a mesma razão do §341). */
export const CAPA: PaginaDoSite = {
  id: "",
  nome: "Gerador de Itens",
  pergunta: "",
  resumo: "",
};

/** `#/site/o-ciclo` — uma função, para o menu e a trava concordarem sobre o
 *  formato. Duas concatenações em lugares diferentes divergem na primeira vez
 *  que alguém muda o padrão. */
export function rotaDaPagina(pagina: PaginaDoSite): string {
  return pagina.id ? `${PREFIXO_DO_SITE}/${pagina.id}` : PREFIXO_DO_SITE;
}

/**
 * O hash é uma página do site? `null` quando não é — e aí quem decide é o app.
 *
 * `#/site` e `#/site/` devolvem a capa. Um segmento desconhecido sob `#/site`
 * **também** devolve a capa, e isso é decisão: link velho de página pública não
 * pode virar tela em branco nem cair no canvas do app. É a mesma régua que o
 * `rotaDoHash` já aplica ao hash desconhecido (SPEC-61 §6.7).
 */
export function paginaDoSite(hash: string): PaginaDoSite | null {
  const limpo = hash.split("?")[0].replace(/\/+$/, "");
  if (limpo !== PREFIXO_DO_SITE && !limpo.startsWith(`${PREFIXO_DO_SITE}/`)) return null;

  const segmento = limpo.slice(PREFIXO_DO_SITE.length).replace(/^\//, "");
  if (!segmento) return CAPA;
  return PAGINAS.find((p) => p.id === segmento) ?? CAPA;
}
