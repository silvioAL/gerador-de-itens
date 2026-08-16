import { useCallback, useEffect, useRef, useState } from "react";
import { aoPerderSessao, apiAuth, type SessaoUsuario } from "../api/client";

export interface EstadoSessao {
  /** `undefined` enquanto verifica; `null` quando não há sessão. */
  sessao: SessaoUsuario | null | undefined;
  /** `undefined` enquanto verifica — LoginScreen decide qual UI mostrar a
   * partir disto (achado real: antes ela sempre mostrava o formulário de
   * e-mail do modo dev, mesmo com AUTH_MODE=oidc no servidor). */
  modo: "dev" | "oidc" | "local" | undefined;
  erro: string | null;
  /** §267 — a sessão morreu com a aba aberta (diferente de "nunca entrou").
   * É o que faz a tela pular a landing e ir direto ao login explicando. */
  expirou: boolean;
  /** Só e-mail — login não escolhe time, ver LoginScreen.tsx. Só existe (e só
   * é chamado) em modo dev; em oidc o login é navegação de página inteira. */
  entrar: (email: string) => Promise<void>;
  sair: () => Promise<void>;
}

/** `GET /auth/me` no boot decide entre tela de login e app — nunca assume
 * sessão válida sem checar (o cookie pode ter expirado desde a última visita). */
export function useSessao(): EstadoSessao {
  const [sessao, setSessao] = useState<SessaoUsuario | null | undefined>(undefined);
  const [modo, setModo] = useState<"dev" | "oidc" | "local" | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [expirou, setExpirou] = useState(false);

  /**
   * §267 — a sessão que morre no meio do caminho.
   *
   * A distinção que este bloco carrega: **401 só é "expirou" se havia sessão**.
   * O `GET /auth/me` do boot devolve 401 para todo visitante que nunca entrou,
   * e tratar aquilo como expiração receberia quem chega pela primeira vez com
   * "sua sessão expirou" — mentira, e das que fazem a pessoa achar que o app
   * está quebrado.
   *
   * O ref existe porque o ouvinte é registrado uma vez e leria um `sessao`
   * congelado no fechamento do primeiro render.
   */
  const sessaoAtual = useRef<SessaoUsuario | null | undefined>(undefined);
  sessaoAtual.current = sessao;

  useEffect(() => {
    aoPerderSessao(() => {
      if (!sessaoAtual.current) return;

      sessaoAtual.current = null;
      setSessao(null);
      setExpirou(true);
      setErro("Sua sessão expirou. Entre de novo para continuar de onde parou.");
    });
    return () => aoPerderSessao(null);
  }, []);

  useEffect(() => {
    apiAuth
      .me()
      .then(setSessao)
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : String(e));
        setSessao(null);
      });
    apiAuth.modo().then(setModo);
  }, []);

  const entrar = useCallback(async (email: string) => {
    setErro(null);
    setExpirou(false);
    try {
      const nova = await apiAuth.entrarDev(email);
      setSessao(nova);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const sair = useCallback(async () => {
    // Sem try/finally aqui, um 429/erro de rede em /auth/logout derrubava a
    // promise sem nunca chamar setSessao(null) — o clique parecia não fazer
    // nada. Limpar a sessão local sempre, mesmo se a chamada ao server falhar
    // (o cookie httpOnly pode não ser limpo nesse caso, mas a UI não trava).
    try {
      await apiAuth.sair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSessao(null);
    }
  }, []);

  return { sessao, modo, erro, expirou, entrar, sair };
}
