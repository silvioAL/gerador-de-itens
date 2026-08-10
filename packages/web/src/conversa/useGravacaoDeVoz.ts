import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SPEC-30 Fase 1a — gravar a fala e devolver o áudio.
 *
 * O hook não sabe transcrever, e isso é de propósito: quem transcreve é o
 * provedor, atrás da rota. Aqui só existe microfone, `MediaRecorder` e o nível
 * de voz que alimenta a animação.
 *
 * O nível vem de um `AnalyserNode` de verdade, não de um `setInterval` com
 * número aleatório. A diferença não é estética: uma animação que se mexe sem
 * ninguém falar é uma mentira sobre o estado do sistema — quem está com o
 * microfone mudo veria a mesma coisa de quem está falando, e só descobriria no
 * silêncio da transcrição vazia.
 */
export type EstadoGravacao = "parado" | "gravando" | "transcrevendo";

export interface GravacaoDeVoz {
  estado: EstadoGravacao;
  /** 0..1, atualizado ~20x/s enquanto grava. É o que a onda desenha. */
  nivel: number;
  /** Segundos gravados — a pessoa precisa saber que está correndo. */
  segundos: number;
  erro: string | null;
  comecar: () => Promise<void>;
  /** Para e entrega o áudio pra quem chamou (que manda transcrever). */
  parar: () => void;
  /** Descarta o que gravou. É o botão de arrependimento. */
  cancelar: () => void;
}

/** Teto de gravação. Bate com o limite de upload da rota (10 MB), com folga —
 * e existe pelo motivo do JOURNEY: *toda ausência de teto virou bug*. Dois
 * minutos é muito mais do que "ditar uma demanda". */
const SEGUNDOS_MAXIMO = 120;

export function useGravacaoDeVoz(aoTerminar: (audio: Blob) => Promise<void> | void): GravacaoDeVoz {
  const [estado, setEstado] = useState<EstadoGravacao>("parado");
  const [nivel, setNivel] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const trilhaRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const quadroRef = useRef<number | null>(null);
  const canceladoRef = useRef(false);
  /** `aoTerminar` numa ref: o callback muda a cada render de quem usa o hook,
   * e o `onstop` do gravador é registrado uma vez só — sem isso ele chamaria
   * sempre a versão da primeira renderização. */
  const aoTerminarRef = useRef(aoTerminar);
  aoTerminarRef.current = aoTerminar;

  const limpar = useCallback(() => {
    if (quadroRef.current !== null) cancelAnimationFrame(quadroRef.current);
    quadroRef.current = null;
    trilhaRef.current?.getTracks().forEach((t) => t.stop());
    trilhaRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    gravadorRef.current = null;
    setNivel(0);
  }, []);

  // Soltar o microfone quando o componente sai da tela. Sem isto o indicador
  // de gravação do navegador fica aceso depois de fechar a conversa — o
  // usuário veria o produto "escutando" sem estar.
  useEffect(() => () => limpar(), [limpar]);

  const comecar = useCallback(async () => {
    setErro(null);
    canceladoRef.current = false;
    try {
      const trilha = await navigator.mediaDevices.getUserMedia({ audio: true });
      trilhaRef.current = trilha;

      const gravador = new MediaRecorder(trilha);
      gravadorRef.current = gravador;
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      gravador.onstop = () => {
        const tipo = gravador.mimeType || "audio/webm";
        const audio = new Blob(pedacosRef.current, { type: tipo });
        limpar();
        if (canceladoRef.current || audio.size === 0) {
          setEstado("parado");
          return;
        }
        setEstado("transcrevendo");
        void Promise.resolve(aoTerminarRef.current(audio))
          .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
          .finally(() => setEstado("parado"));
      };
      gravador.start();
      setEstado("gravando");
      setSegundos(0);

      // Nível de voz de verdade, do próprio sinal.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 512;
      ctx.createMediaStreamSource(trilha).connect(analisador);
      const amostras = new Uint8Array(analisador.frequencyBinCount);
      const inicio = Date.now();

      const medir = () => {
        analisador.getByteTimeDomainData(amostras);
        // RMS em torno de 128 (o silêncio no domínio do tempo em 8 bits).
        let soma = 0;
        for (const v of amostras) soma += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(soma / amostras.length);
        // O ×3 é ganho para fala normal chegar perto de 1 sem estourar — fala
        // tranquila fica em ~0,1 de RMS, e uma onda que mal se move não
        // comunica "estou ouvindo você".
        setNivel(Math.min(1, rms * 3));

        const decorridos = Math.floor((Date.now() - inicio) / 1000);
        setSegundos(decorridos);
        if (decorridos >= SEGUNDOS_MAXIMO) {
          gravadorRef.current?.stop();
          return;
        }
        quadroRef.current = requestAnimationFrame(medir);
      };
      quadroRef.current = requestAnimationFrame(medir);
    } catch (e) {
      limpar();
      setEstado("parado");
      // Permissão negada é o caso comum, e a mensagem do navegador
      // (`NotAllowedError`) não ajuda ninguém.
      const nome = e instanceof Error ? e.name : "";
      setErro(
        nome === "NotAllowedError" || nome === "SecurityError"
          ? "O navegador bloqueou o microfone. Libere o acesso para este endereço e tente de novo."
          : "Não foi possível acessar o microfone."
      );
    }
  }, [limpar]);

  const parar = useCallback(() => {
    if (gravadorRef.current?.state === "recording") gravadorRef.current.stop();
  }, []);

  const cancelar = useCallback(() => {
    canceladoRef.current = true;
    parar();
  }, [parar]);

  return { estado, nivel, segundos, erro, comecar, parar, cancelar };
}

export { SEGUNDOS_MAXIMO };
