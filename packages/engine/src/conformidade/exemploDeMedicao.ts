import type { Checagem, RegrasConfig } from "../config/types.js";

/**
 * §268 — um exemplo REAL da cadeia que o motor percorre, para explicá-la.
 *
 * ## Por que existe
 *
 * O produto repete "medido pelo motor" em todo canto e nunca mostra **como**.
 * Quem lê ou acredita ou não — e acreditar num número que não se sabe de onde
 * veio é a mesma coisa que ignorá-lo. A tela que explica isso precisa de um
 * caso concreto, e o caso tem que ser **da configuração de quem está olhando**:
 * um exemplo inventado ensinaria uma régua que aquele time não tem.
 *
 * ## A escolha do exemplo
 *
 * O primeiro requisito **conferível** que aparecer. Conferível é a palavra:
 * requisito sem `checagem` é texto para uma pessoa ler, e não tem conta nenhuma
 * para mostrar (§239). Sem nenhum conferível na configuração, isto devolve
 * `undefined` — e cabe à tela dizer "seu time ainda não tem régua conferível"
 * em vez de inventar uma.
 *
 * Função pura, sem I/O, como o resto do engine.
 */
export interface MedicaoDeExemplo {
  tech: string;
  /** Vazio = a régua vale em qualquer contexto daquela tech. */
  contextos: string[];
  /** O que a pessoa lê no requisito — a régua em português. */
  texto: string;
  checagem: Checagem;
  /** O porquê do §242, quando o time o escreveu. */
  porque?: string;
}

export function exemploDeMedicao(regras?: RegrasConfig): MedicaoDeExemplo | undefined {
  for (const [tech, doTech] of Object.entries(regras?.porTech ?? {})) {
    for (const requisito of doTech.checklistTecnico ?? []) {
      // Só o que o motor confere sozinho: um requisito sem `checagem` não tem
      // conta para mostrar, e a explicação viraria "o motor lê e... confia".
      if (!requisito.checagem) continue;
      // Fora fica só a comparação entre DOIS CAMPOS (`valorDe`, §241): é a
      // régua mais interessante que existe aqui e a pior para explicar
      // primeiro, porque exige entender dois campos antes de entender a cadeia.
      //
      // `preenchido` fica DENTRO, e isso foi correção de rota: eu tinha exigido
      // um literal, e com isso a régua mais simples de todas — "este campo tem
      // que estar preenchido" — ficava de fora da explicação de como o motor
      // mede. É justamente a que alguém entende primeiro.
      if (requisito.checagem.valorDe !== undefined) continue;
      return {
        tech,
        contextos: requisito.contextos ?? [],
        texto: requisito.texto,
        checagem: requisito.checagem,
        ...(requisito.porque ? { porque: requisito.porque } : {}),
      };
    }
  }
  return undefined;
}

/**
 * O valor que ESTOURA a régua do exemplo — o "o que você desenhou" da
 * demonstração.
 *
 * Sai daqui, e não da tela, porque depende do operador: para `lte` o que
 * estoura é um valor maior, para `gte` é menor, e errar isso mostraria uma
 * conta que não fecha bem no meio da explicação de como as contas fecham.
 */
export function valorQueEstoura(checagem: Checagem): number | string | boolean | undefined {
  const { operador, valor } = checagem;
  // O que estoura "preenchido" é a ausência — e ausência não tem valor para
  // devolver. Quem chama desenha o "em branco" com as palavras da tela.
  if (operador === "preenchido") return undefined;
  if (typeof valor === "number") {
    // Uma ordem de grandeza acima/abaixo: perto demais do limite lê como erro
    // de arredondamento, e o que se quer é uma violação óbvia.
    if (operador === "lte" || operador === "lt") return valor * 2;
    if (operador === "gte" || operador === "gt") return Math.floor(valor / 2);
    if (operador === "eq") return valor + 1;
    if (operador === "ne") return valor;
  }
  if (typeof valor === "string") return operador === "ne" ? valor : "outro-valor";
  if (typeof valor === "boolean") return !valor;
  return undefined;
}
