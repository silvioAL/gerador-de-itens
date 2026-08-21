import { useEffect, useRef } from "react";

/**
 * §281 — "esta resposta ainda interessa?".
 *
 * ## O defeito que isto fecha
 *
 * O padrão `useEffect` → `fetch` → `.then(setEstado)` escreve estado **depois**
 * que a resposta chega, e a resposta chega quando chega. Se a tela saiu no meio
 * do caminho, o `setEstado` acontece sobre um componente que não está mais lá.
 *
 * Em produção isso é trabalho jogado fora (o React 18 nem avisa mais). Na
 * suíte é pior: o ambiente do teste é derrubado antes do microtask, e o
 * `setEstado` estoura em `ReferenceError: window is not defined` — cinco desses
 * faziam o vitest sair com código 1 **com os 666 testes passando**. Vermelho
 * que não corresponde a teste quebrado é o que ensina o time a ignorar
 * vermelho.
 *
 * ## Por que um ref, e não a flag local do efeito
 *
 * A flag local (`let cancelado = false` + cleanup) resolve quando o efeito é o
 * único a escrever. Não serve para as telas em que a MESMA função de recarga é
 * chamada também depois de cada ação (`PdcaTab`, `ProdutosTab`): ali a escrita
 * nasce fora do efeito, e a flag daquele efeito não a alcança.
 *
 * O ref é reatribuído na montagem de propósito — o duplo-mount do StrictMode
 * remonta o componente, e um ref que só soubesse desmontar ficaria `false` para
 * sempre depois da primeira passagem.
 */
export function useMontado() {
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  return montado;
}
