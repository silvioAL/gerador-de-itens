import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Decisao } from "@gerador/engine";
import { apiExportador, apiQuebras } from "../api/client";

/**
 * SPEC-81 fatia D — **o ADR da casa entra na conversa, como a voz entra.**
 *
 * ## A decisão de desenho, e ela é do usuário
 *
 * O §325 parou aqui: um ADR importado nasce **sem âncora**, e as decisões só são
 * editadas por nó — não havia onde uma decisão solta aparecer. A saída que o
 * usuário apontou dissolve o problema em vez de resolvê-lo:
 *
 * > *"pode funcionar como o comando de voz no sentido de passar para a IA, como
 * > o desenhar conversando."*
 *
 * O ADR **nunca vira uma decisão flutuante**. Ele vira **texto na conversa** — e
 * daí segue o caminho que já existe: a pessoa conversa, o motor propõe o
 * desenho, e a decisão nasce ancorada nos nós que ela criou.
 *
 * ## Por que este hook é o gêmeo do `useVozNaEntrada`
 *
 * Não é economia de código: é a **mesma disciplina**, e ela já estava escrita lá:
 *
 * - **cai no mesmo campo, editável** — transcrição erra sigla, e ADR alheio vem
 *   em formato que ninguém controla. Nos dois casos, texto que vai para o modelo
 *   sem passar pelo olho de alguém vira nó errado no diagrama;
 * - **anexa em vez de substituir** — trazer o ADR depois de digitar é
 *   complementar, e apagar o que a pessoa escreveu seria perda de trabalho por
 *   um clique;
 * - **não é enviado sozinho** — quem aperta enviar é a pessoa.
 *
 * ## Por que o botão só aparece quando há destino
 *
 * Mesma razão do `podeFalar`: um botão que busca e morre desperdiça o tempo e a
 * atenção. Quem sabe se há destino de ADR é a configuração, e ela é consultada
 * uma vez.
 */
export interface AdrNaEntrada {
  /** `false` até a configuração responder, e para sempre se não há destino. */
  podeTrazerAdr: boolean;
  /**
   * §359 — **o nome que a pessoa deu ao destino**, para o botão dizer de ONDE
   * importa.
   *
   * O rótulo dizia *"Decisões da casa"*, e o usuário perguntou: *"casa? que
   * casa?"*. O produto não tem como saber o nome do sistema de terceiro — mas a
   * pessoa que cadastrou o destino **já o nomeou**. Ecoar esse nome é o único
   * jeito honesto: genérico no código, concreto na tela.
   *
   * Vazio quando o destino não tem rótulo — aí o botão cai para uma frase neutra
   * em vez de inventar um nome.
   */
  rotuloDoDestino: string;
  trazendo: boolean;
  /** Quantas decisões vieram na última busca — a tela diz o número. */
  ultimoTotal: number | null;
  erro: string | null;
  trazer: () => Promise<void>;
}

/**
 * O ADR em texto, no formato que o modelo lê melhor: título, escolha e porquê
 * numa linha por decisão.
 *
 * **Não é JSON de propósito.** O que entra aqui é a mesma caixa em que a pessoa
 * escreve em português, e despejar estrutura ali quebraria a leitura de quem
 * revisa antes de enviar — que é justamente o passo que esta disciplina existe
 * para preservar.
 *
 * A lacuna vai dita: um ADR sem o porquê é o caso comum, e o modelo precisa
 * saber que aquilo foi decidido **sem** a razão registrada, em vez de inventar
 * uma.
 */
export function comoTexto(decisoes: { decisao: Decisao; lacunas: string[] }[]): string {
  if (decisoes.length === 0) return "";
  const linhas = decisoes.map(({ decisao, lacunas }) => {
    const partes = [`- ${decisao.titulo}`];
    if (decisao.escolhida) partes.push(`: ${decisao.escolhida}`);
    if (decisao.porque) partes.push(` — porque ${decisao.porque}`);
    if (lacunas.includes("porque")) partes.push(" — (a origem não registrou o porquê)");
    return partes.join("");
  });
  return [
    "Decisões que esta empresa já tomou, e que o desenho tem que respeitar:",
    ...linhas,
    "Não proponha o que elas descartaram.",
  ].join("\n");
}

export function useAdrNaEntrada(
  setEntrada: Dispatch<SetStateAction<string>>,
  quebraId: string | null
): AdrNaEntrada {
  const [temDestino, setTemDestino] = useState(false);
  const [trazendo, setTrazendo] = useState(false);
  const [ultimoTotal, setUltimoTotal] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rotuloDoDestino, setRotuloDoDestino] = useState("");

  useEffect(() => {
    let cancelado = false;
    apiExportador
      .obter()
      .then((c) => {
        if (cancelado) return;
        const destino = (c.destinos ?? []).find((d) => d.operacao === "adr" && !!d.endpoint);
        setTemDestino(!!destino);
        setRotuloDoDestino(destino?.rotulo?.trim() ?? "");
      })
      .catch(() => {
        if (!cancelado) {
          setTemDestino(false);
          setRotuloDoDestino("");
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const trazer = useCallback(async () => {
    if (!quebraId) return;
    setTrazendo(true);
    setErro(null);
    try {
      const { decisoes } = await apiQuebras.importarAdr(quebraId);
      setUltimoTotal(decisoes.length);
      const texto = comoTexto(decisoes);
      // Zero decisões não escreve nada: anexar um cabeçalho sem linha nenhuma
      // encheria a caixa de ruído e ainda sugeriria ao modelo que existe algo
      // decidido quando não existe.
      if (!texto) return;
      setEntrada((atual) => (atual.trim() ? `${atual.trim()}\n\n${texto}` : texto));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setTrazendo(false);
    }
  }, [quebraId, setEntrada]);

  return { podeTrazerAdr: temDestino && !!quebraId, rotuloDoDestino, trazendo, ultimoTotal, erro, trazer };
}
