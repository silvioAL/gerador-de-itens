import {
  alvoDeCampoDaOperacao,
  aplicarOperacaoNosCampos,
  diferencaDeCampos,
  type CampoDaFicha,
  type CampoProposto,
  type OperacaoDeAjuste,
} from "@gerador/engine";

/**
 * SPEC-52 — o *Act* do ciclo quando o alvo é a FICHA (campos por componente ou
 * por conexão).
 *
 * Regras e pipeline são documentos: uma função pura devolve documento novo e o
 * servidor grava o JSON. Campos são TABELA, com chave natural e escopo (global
 * sobrescrevível por time), então aplicar é gravar linha — mas a decisão de
 * *o que* gravar continua saindo da mesma função pura que a tela usou pra
 * mostrar a prévia. Uma régua só: o que a pessoa viu é o que o servidor faz.
 *
 * A porta abaixo existe pra que campos-no e campos-aresta compartilhem este
 * arquivo. Os dois têm formas ligeiramente diferentes (`tipoNo`/`tipoAresta`,
 * `permiteNA` e `itemSpec` só no nó) e nada disso importa aqui — o que importa
 * é a chave do campo, o escopo dele e a ordem.
 */
export interface CampoPersistido {
  id: string;
  timeId: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  ajuda: string | null;
  opcoes: string[] | null;
  ordem: number;
}

export interface PortaDeFicha {
  /** Os campos EFETIVOS do componente/conexão para o escopo do pedido — os
   * mesmos que a pessoa vê na tela, com o do time já vencendo o global. */
  listar(chaveDoComponente: string, timeId: string): Promise<CampoPersistido[]>;
  criar(entrada: { chaveDoComponente: string; timeId: string; campo: CampoProposto; ordem: number }): Promise<void>;
  excluir(id: string): Promise<boolean>;
}

export type ResultadoDeAplicacao =
  | { ok: true; criados: string[]; removidos: string[] }
  | { ok: false; motivo: string };

/** A tradução tabela → ficha: o engine não conhece `CampoNo`, e não precisa. */
function comoFicha(campo: CampoPersistido): CampoDaFicha {
  return {
    key: campo.key,
    label: campo.label,
    tipoCampo: campo.type as CampoDaFicha["tipoCampo"],
    obrigatorio: campo.required,
    ...(campo.ajuda ? { ajuda: campo.ajuda } : {}),
    ...(campo.opcoes ? { opcoes: campo.opcoes } : {}),
  };
}

export async function aplicarOperacaoDeCampo(
  op: OperacaoDeAjuste,
  timeIdDoPedido: string,
  porta: PortaDeFicha
): Promise<ResultadoDeAplicacao> {
  const alvo = alvoDeCampoDaOperacao(op);
  if (!alvo) return { ok: false, motivo: "esta operação não é de campo" };

  const atuais = await porta.listar(alvo.escopo, timeIdDoPedido);
  const depois = aplicarOperacaoNosCampos(atuais.map(comoFicha), op);
  const { adicionados, removidos } = diferencaDeCampos(atuais.map(comoFicha), depois);

  // Nada a fazer é SUCESSO, não erro: adicionar o que já existe ou remover o
  // que já saiu é a idempotência que faz as vezes da validade por versão, que
  // a tabela não tem (SPEC-52 §3.4).
  if (adicionados.length === 0 && removidos.length === 0) return { ok: true, criados: [], removidos: [] };

  const porChave = new Map(atuais.map((c) => [c.key, c]));

  /**
   * A regra de segurança que importa: um pedido de TIME não apaga campo de
   * todo mundo. O campo global aparece na ficha do time (é o que a
   * sobreposição faz), então sem esta checagem uma solicitação que só um time
   * discutiu apagaria o campo da organização inteira — em silêncio, e com o
   * gate de permissão satisfeito, porque a permissão era do time.
   */
  for (const saindo of removidos) {
    const persistido = porChave.get(saindo.key);
    if (persistido && persistido.timeId !== timeIdDoPedido) {
      return {
        ok: false,
        motivo: `o campo "${saindo.label}" é de todo mundo (escopo global), e este pedido é do time ${timeIdDoPedido} — um time não apaga o campo dos outros; o pedido precisa ser global`,
      };
    }
  }

  const proximaOrdem = Math.max(0, ...atuais.map((c) => c.ordem)) + 1;
  for (const [i, entrando] of adicionados.entries()) {
    await porta.criar({
      chaveDoComponente: alvo.escopo,
      timeId: timeIdDoPedido,
      campo: {
        key: entrando.key,
        label: entrando.label,
        // `lista` não sai de uma operação (SPEC-52 §3.1) — o cast é o preço de
        // a ficha ser a mesma forma na leitura (onde `lista` existe) e na
        // proposta (onde não existe).
        tipoCampo: entrando.tipoCampo as CampoProposto["tipoCampo"],
        obrigatorio: entrando.obrigatorio,
        ...(entrando.ajuda ? { ajuda: entrando.ajuda } : {}),
        ...(entrando.opcoes ? { opcoes: entrando.opcoes } : {}),
      },
      ordem: proximaOrdem + i,
    });
  }
  for (const saindo of removidos) {
    const persistido = porChave.get(saindo.key);
    if (persistido) await porta.excluir(persistido.id);
  }

  return { ok: true, criados: adicionados.map((c) => c.key), removidos: removidos.map((c) => c.key) };
}
