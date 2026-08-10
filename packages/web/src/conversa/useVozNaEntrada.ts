import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { montarVocabularioTranscricao, type DiagramaConfig, type RegrasConfig } from "@gerador/engine";
import { apiIa } from "../api/client";
import { useGravacaoDeVoz, type GravacaoDeVoz } from "./useGravacaoDeVoz";

/**
 * SPEC-30 Fase 1a — falar em vez de digitar, num campo de texto qualquer.
 *
 * ACHADO durante a implementação: existem DUAS janelas de conversa. A
 * `JanelaConversa` (usada pela conversa da especificação) e a `ConversaPanel`
 * (o "Desenhar conversando" — que é exatamente onde o pedido de voz nasceu, e
 * que tem `<aside>` próprio, sem reusar a outra). Plugar o botão só na
 * primeira teria entregado a feature no lugar que ninguém pediu.
 *
 * Daí este hook: a decisão de mostrar (capacidade do provedor), a gravação e o
 * "onde o texto cai" ficam num lugar só, e cada janela gasta três linhas.
 */
export interface VozNaEntrada {
  /** `false` enquanto o status não respondeu, e para sempre se o provedor não
   * transcreve. A UI usa isto pra decidir se desenha o botão. */
  podeFalar: boolean;
  gravacao: GravacaoDeVoz;
}

export interface ContextoDoVocabulario {
  config?: DiagramaConfig;
  regras?: RegrasConfig;
  /** Rótulos do diagrama aberto — os termos mais específicos que existem, e os
   * que nenhum modelo genérico conhece. */
  rotulos?: string[];
}

export function useVozNaEntrada(
  setEntrada: Dispatch<SetStateAction<string>>,
  contexto: ContextoDoVocabulario = {}
): VozNaEntrada {
  const [podeFalar, setPodeFalar] = useState(false);
  const { config, regras, rotulos } = contexto;

  /**
   * O texto transcrito cai no MESMO campo, editável, e não é enviado sozinho.
   *
   * Editável importa mais aqui que na maioria dos produtos: transcrição erra
   * sigla e nome de sistema, que é justamente o vocabulário desta ferramenta.
   * Enviar direto transformaria erro de reconhecimento em nó errado no
   * diagrama — e ninguém saberia de onde veio.
   *
   * Anexa ao que já estava escrito em vez de substituir: falar depois de
   * digitar é complementar, e apagar o que a pessoa escreveu seria perda de
   * trabalho por um clique.
   */
  const aoTranscrever = useCallback(
    async (audio: Blob) => {
      // O vocabulário do projeto vai junto — é o que faz o modelo acertar
      // "RabbitMQ" e "idempotência" em vez de "rabitém IKEA" e "idem
      // potência". Montado aqui porque é o navegador que tem config E
      // diagrama; o servidor só repassa.
      const vocabulario = montarVocabularioTranscricao(config, regras, { rotulos });
      const texto = (await apiIa.transcrever(audio, vocabulario)).trim();
      if (!texto) return;
      setEntrada((atual) => (atual.trim() ? `${atual.trim()} ${texto}` : texto));
    },
    [setEntrada, config, regras, rotulos]
  );

  const gravacao = useGravacaoDeVoz(aoTranscrever);

  // A capacidade vem do servidor (`/ia/status`), não de dedução no navegador:
  // quem sabe se o provedor transcreve é quem o cria. Falhar para "não tem" é
  // deliberado — um botão que grava 30s e morre no envio desperdiça o tempo E
  // a fala.
  useEffect(() => {
    let cancelado = false;
    apiIa
      .status()
      .then((s) => {
        if (!cancelado) setPodeFalar(s.capacidades?.transcricao === true);
      })
      .catch(() => {
        if (!cancelado) setPodeFalar(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return { podeFalar, gravacao };
}
