import { useCallback, useEffect, useState } from "react";

/**
 * SPEC-93 fatia C — **quem decide é a pessoa.**
 *
 * O usuário foi explícito: *"o usuário decide qual agrada mais."* Então são três
 * estados, e não um interruptor de dois:
 *
 * - `sistema` — segue `prefers-color-scheme`, e é o **padrão**. Respeitar a
 *   escolha que a pessoa já fez no sistema operacional é melhor que impor a
 *   nossa, e quem nunca pensou no assunto recebe o que já usa em todo lugar;
 * - `claro` e `escuro` — a escolha explícita, que vence o sistema.
 *
 * ## Por que o estado guardado NÃO é o tema aplicado
 *
 * São duas coisas diferentes, e confundi-las é o defeito clássico deste
 * controle: guardar `escuro` porque o sistema estava escuro congela a pessoa no
 * escuro para sempre, mesmo depois de ela trocar o sistema. O que se guarda é a
 * **preferência** (incluindo "siga o sistema"); o que se aplica é a resolução
 * dela agora.
 */
export const TEMAS = ["sistema", "claro", "escuro"] as const;
export type PreferenciaDeTema = (typeof TEMAS)[number];

export const CHAVE_TEMA = "gerador:tema";

export function ehPreferencia(v: unknown): v is PreferenciaDeTema {
  return typeof v === "string" && (TEMAS as readonly string[]).includes(v);
}

/** O que `sistema` significa agora. Fora do navegador, escuro — que é o tema
 * que o produto sempre teve, e o padrão mais seguro para não piscar branco. */
export function temaDoSistema(): "claro" | "escuro" {
  if (typeof window === "undefined" || !window.matchMedia) return "escuro";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
}

export function resolverTema(preferencia: PreferenciaDeTema): "claro" | "escuro" {
  return preferencia === "sistema" ? temaDoSistema() : preferencia;
}

/** Escreve no `<html>`, que é onde o CSS procura (`[data-tema="claro"]`). */
export function aplicarTema(preferencia: PreferenciaDeTema): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-tema", resolverTema(preferencia));
}

export function lerPreferencia(): PreferenciaDeTema {
  try {
    const salva = localStorage.getItem(CHAVE_TEMA);
    return ehPreferencia(salva) ? salva : "sistema";
  } catch {
    // `localStorage` pode estourar em navegação privada ou com cookies
    // bloqueados. Tema não é motivo para a aplicação não abrir.
    return "sistema";
  }
}

export function useTema() {
  const [preferencia, setPreferencia] = useState<PreferenciaDeTema>(lerPreferencia);

  useEffect(() => {
    aplicarTema(preferencia);
    try {
      localStorage.setItem(CHAVE_TEMA, preferencia);
    } catch {
      // Ver `lerPreferencia`: sem persistência a escolha vale para esta sessão.
    }
  }, [preferencia]);

  /**
   * Em `sistema`, seguir o sistema **enquanto ele muda** — e não só na abertura.
   *
   * Quem usa troca automática por horário veria a aplicação ficar clara ao
   * anoitecer e o resto do computador escurecer, até recarregar. O `listener` só
   * existe nesse modo: em escolha explícita, mudar o sistema não pode mexer no
   * que a pessoa pediu.
   */
  useEffect(() => {
    if (preferencia !== "sistema" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const aoMudar = () => aplicarTema("sistema");
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [preferencia]);

  const escolher = useCallback((p: PreferenciaDeTema) => setPreferencia(p), []);

  return { preferencia, tema: resolverTema(preferencia), escolher };
}
